-- =============================================================================
-- CLASPTEK RECORDING PIPELINE: ATOMIC CLAIM RELEASE RPC
-- MIGRATION: 20261012_release_recording_processing_claim_rpc.sql
-- Description: Concurrency-safe, atomic release of distributed recording claims
--              with row-level locking, token verification, JSON key removal,
--              and guarded audit ledger logging without token disclosure.
-- Status: PROPOSED (UNAPPLIED). For review only. Do not apply directly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.release_recording_processing_claim(
    p_meeting_id VARCHAR(64),
    p_tenant_id UUID,
    p_claim_token VARCHAR(128)
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
    v_audit_error BOOLEAN := false;
BEGIN
    -- 1. Parameter validation: claim token is mandatory
    IF p_claim_token IS NULL OR trim(p_claim_token) = '' THEN
        RETURN jsonb_build_object('released', false, 'reason', 'CLAIM_TOKEN_REQUIRED');
    END IF;

    -- 2. Lock meeting row to serialize concurrent claim operations
    SELECT id, recording_metadata
    INTO v_meeting
    FROM public.meetings
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('released', false, 'reason', 'MEETING_NOT_FOUND');
    END IF;

    v_current_claim := v_meeting.recording_metadata->'processing_claim';

    -- 3. Check if active claim exists on meeting
    IF v_current_claim IS NULL OR v_current_claim->>'token' IS NULL THEN
        -- No active claim on meeting; delete any orphan claim row matching this token
        DELETE FROM public.meeting_recording_processing_claims
        WHERE meeting_id = p_meeting_id AND tenant_id = p_tenant_id AND claim_token = p_claim_token;

        RETURN jsonb_build_object('released', true, 'reason', 'NO_ACTIVE_CLAIM');
    END IF;

    v_active_token := v_current_claim->>'token';

    -- 4. Fencing token check: worker can only release its own claim
    -- Do not disclose v_active_token in response or logs
    IF v_active_token <> p_claim_token THEN
        RETURN jsonb_build_object(
            'released', false,
            'reason', 'TOKEN_MISMATCH'
        );
    END IF;

    -- 5. Atomically remove 'processing_claim' key from recording_metadata
    -- Using the JSONB '-' operator ensures other metadata fields are never overwritten with a stale snapshot
    UPDATE public.meetings
    SET
        recording_metadata = v_meeting.recording_metadata - 'processing_claim',
        updated_at = v_now
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id;

    -- 6. Atomically delete from dedicated relational claims table
    DELETE FROM public.meeting_recording_processing_claims
    WHERE meeting_id = p_meeting_id AND tenant_id = p_tenant_id AND claim_token = p_claim_token;

    -- 7. Guarded audit log insertion: audit failure must not roll back successful claim release
    BEGIN
        INSERT INTO public.meeting_recording_consent_audit_log (
            tenant_id,
            meeting_id,
            session_id,
            action,
            reason,
            created_at
        )
        VALUES (
            p_tenant_id,
            p_meeting_id,
            COALESCE(v_meeting.recording_metadata->'consent_session'->>'sessionId', 'system'),
            'CLAIM_RELEASED',
            'Processing claim released by authorized worker',
            v_now
        );
    EXCEPTION WHEN OTHERS THEN
        v_audit_error := true;
    END;

    RETURN jsonb_build_object(
        'released', true,
        'auditLogged', NOT v_audit_error
    );
END;
$$;

-- Restrict RPC execution to service_role only
REVOKE ALL ON FUNCTION public.release_recording_processing_claim(VARCHAR, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_recording_processing_claim(VARCHAR, UUID, VARCHAR) TO service_role;
