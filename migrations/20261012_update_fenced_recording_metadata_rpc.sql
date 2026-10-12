-- =============================================================================
-- CLASPTEK RECORDING PIPELINE: FENCED RECORDING METADATA UPDATE RPC
-- MIGRATION: 20261012_update_fenced_recording_metadata_rpc.sql
-- Description: Concurrency-safe, atomic update of meeting recording metadata
--              and recording status with token fencing, row-level locking,
--              in-place JSONB merging, and protection against stale workers.
-- Status: PROPOSED (UNAPPLIED). For local review only. Do not apply directly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_fenced_recording_metadata(
    p_meeting_id VARCHAR(64),
    p_tenant_id UUID,
    p_status VARCHAR(32),
    p_metadata JSONB,
    p_claim_token VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_meeting RECORD;
    v_current_claim JSONB;
    v_active_token TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_new_metadata JSONB;
    v_claimed_at TIMESTAMPTZ;
    v_lease_expires_at TIMESTAMPTZ;
    v_lease_active BOOLEAN := false;
BEGIN
    -- 1. Lock the meeting row FOR UPDATE to serialize concurrent mutations
    SELECT id, recording_status, recording_metadata
    INTO v_meeting
    FROM public.meetings
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MEETING_NOT_FOUND');
    END IF;

    v_current_claim := v_meeting.recording_metadata->'processing_claim';
    IF v_current_claim IS NOT NULL AND v_current_claim->>'token' IS NOT NULL THEN
        v_active_token := v_current_claim->>'token';
        IF v_current_claim->>'lease_expires_at' IS NOT NULL THEN
            v_lease_expires_at := (v_current_claim->>'lease_expires_at')::TIMESTAMPTZ;
            v_lease_active := (v_now < v_lease_expires_at);
        ELSIF v_current_claim->>'claimed_at' IS NOT NULL THEN
            v_claimed_at := (v_current_claim->>'claimed_at')::TIMESTAMPTZ;
            v_lease_active := (EXTRACT(EPOCH FROM (v_now - v_claimed_at)) < 600);
        END IF;
    END IF;

    -- 2. Claimed worker write path: p_claim_token is provided
    IF p_claim_token IS NOT NULL AND trim(p_claim_token) <> '' THEN
        -- If no active claim exists in database, cannot fulfill claimed update
        IF v_active_token IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason', 'NO_ACTIVE_CLAIM');
        END IF;

        -- Fencing token verification: caller must own the current active claim
        IF v_active_token <> p_claim_token THEN
            RETURN jsonb_build_object('success', false, 'reason', 'TOKEN_MISMATCH');
        END IF;

    -- 3. Unclaimed write path: p_claim_token is NULL or omitted
    ELSE
        -- If an active worker lease is held, unclaimed caller cannot mutate claimed processing state
        IF v_active_token IS NOT NULL AND v_lease_active THEN
            -- Unclaimed caller cannot alter status away from active worker
            IF p_status IS NOT NULL AND p_status <> v_meeting.recording_status THEN
                RETURN jsonb_build_object('success', false, 'reason', 'CONCURRENT_CLAIM_ACTIVE');
            END IF;

            -- Unclaimed caller cannot inject/overwrite processing claim or establish a competing start intent
            IF (p_metadata ? 'processing_claim' AND p_metadata->'processing_claim' IS NOT NULL AND p_metadata->'processing_claim' <> 'null'::jsonb)
               OR (p_metadata ? 'start_intent' AND p_metadata->'start_intent' IS NOT NULL AND p_metadata->'start_intent' <> 'null'::jsonb) THEN
                RETURN jsonb_build_object('success', false, 'reason', 'CONCURRENT_CLAIM_ACTIVE');
            END IF;
        END IF;
    END IF;

    -- 4. Atomic in-place JSONB merge on the current database row
    -- jsonb || jsonb performs shallow concatenation on the live database row.
    v_new_metadata := COALESCE(v_meeting.recording_metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);

    -- Deep-merge nested object 'consent_session' if both current and update are objects
    IF jsonb_typeof(v_meeting.recording_metadata->'consent_session') = 'object'
       AND jsonb_typeof(p_metadata->'consent_session') = 'object' THEN
        v_new_metadata := jsonb_set(
            v_new_metadata,
            '{consent_session}',
            (v_meeting.recording_metadata->'consent_session') || (p_metadata->'consent_session')
        );
    END IF;

    -- Preserve existing processing_claim so caller metadata can never hijack, forge, or wipe active claims
    -- Authoritative claim removal is strictly handled by release_recording_processing_claim.
    IF (v_active_token IS NOT NULL AND v_lease_active) OR (p_claim_token IS NOT NULL AND v_current_claim IS NOT NULL) THEN
        v_new_metadata := jsonb_set(v_new_metadata, '{processing_claim}', v_current_claim);
    ELSIF v_current_claim IS NOT NULL AND (v_new_metadata->'processing_claim' IS NULL OR v_new_metadata->'processing_claim' = 'null'::jsonb) THEN
        v_new_metadata := jsonb_set(v_new_metadata, '{processing_claim}', v_current_claim);
    END IF;

    -- 5. Commit state update atomically under row lock
    UPDATE public.meetings
    SET
        recording_status = COALESCE(p_status, v_meeting.recording_status),
        recording_metadata = v_new_metadata,
        updated_at = v_now
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Restrict execution strictly to service_role only
REVOKE ALL ON FUNCTION public.update_fenced_recording_metadata(VARCHAR, UUID, VARCHAR, JSONB, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_fenced_recording_metadata(VARCHAR, UUID, VARCHAR, JSONB, VARCHAR) TO service_role;
