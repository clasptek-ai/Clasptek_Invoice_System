-- =============================================================================
-- CLASPTEK RECORDING PIPELINE: PARTICIPANT CONSENT & AUDIT LEDGER MIGRATION
-- MIGRATION: 20261010_meeting_recording_consent_audit.sql
-- Description: Authoritative relational model for server-enforced recording consent,
--              concurrency control, participant permissions, and compliance audit trail.
-- Status: PROPOSED (UNAPPLIED). Required for staging and production rollout.
-- =============================================================================

-- 1. Consent Sessions Table
CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_sessions (
    id VARCHAR(128) PRIMARY KEY, -- e.g. rsess_mtg_xxx_timestamp_random
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    meeting_id VARCHAR(64) NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONSENT'
        CHECK (status IN ('PENDING_CONSENT', 'ALL_GRANTED', 'DECLINED', 'WITHDRAWN', 'ACTIVE_RECORDING', 'STOPPED', 'EXPIRED')),
    lock_acquired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_sessions_meeting ON public.meeting_recording_consent_sessions (meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_tenant ON public.meeting_recording_consent_sessions (tenant_id);

-- 2. Participant Consent Decisions Table
-- Note: participant_id supports both auth.users UUIDs and verified guest identifiers (e.g. guest_greq_...)
CREATE TABLE IF NOT EXISTS public.meeting_recording_consents (
    id VARCHAR(128) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL REFERENCES public.meeting_recording_consent_sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    meeting_id VARCHAR(64) NOT NULL,
    participant_id VARCHAR(128) NOT NULL,
    participant_name VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'STUDENT',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'GRANTED', 'DECLINED', 'WITHDRAWN')),
    decided_at TIMESTAMPTZ,
    reason TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_participant UNIQUE (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_consents_session_status ON public.meeting_recording_consents (session_id, status);
CREATE INDEX IF NOT EXISTS idx_consents_participant ON public.meeting_recording_consents (participant_id);
CREATE INDEX IF NOT EXISTS idx_consents_meeting ON public.meeting_recording_consents (meeting_id, tenant_id);

-- 3. Durable Consent Audit Trail Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    meeting_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL
        CHECK (action IN (
            'CONSENT_REQUESTED',
            'CONSENT_GRANTED',
            'CONSENT_DECLINED',
            'CONSENT_WITHDRAWN',
            'LATE_JOIN_REGISTERED',
            'RECORDING_ALLOWED',
            'RECORDING_BLOCKED',
            'RECORDING_STOPPED_DUE_TO_WITHDRAWAL',
            'RECORDING_STOP_FAILED_ON_WITHDRAWAL',
            'CLAIM_ACQUIRED',
            'CLAIM_RELEASED'
        )),
    participant_id VARCHAR(128),
    participant_role VARCHAR(32),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_meeting ON public.meeting_recording_consent_audit_log (meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_consent_audit_session ON public.meeting_recording_consent_audit_log (session_id);

-- 4. Dedicated Durable Distributed Processing Claims Table
CREATE TABLE IF NOT EXISTS public.meeting_recording_processing_claims (
    meeting_id VARCHAR(64) PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    claim_token VARCHAR(128) NOT NULL,
    claimed_by VARCHAR(128) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_claims_tenant ON public.meeting_recording_processing_claims (tenant_id);

-- 5. Row Level Security Policies
ALTER TABLE public.meeting_recording_consent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_consent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_processing_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_sessions_tenant_isolation" ON public.meeting_recording_consent_sessions;
CREATE POLICY "consent_sessions_tenant_isolation"
    ON public.meeting_recording_consent_sessions
    FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "consents_tenant_isolation" ON public.meeting_recording_consents;
CREATE POLICY "consents_tenant_isolation"
    ON public.meeting_recording_consents
    FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- Audit log: Strictly Append-Only for authenticated users. UPDATE and DELETE are prohibited.
REVOKE UPDATE, DELETE ON public.meeting_recording_consent_audit_log FROM authenticated, anon, PUBLIC;

DROP POLICY IF EXISTS "consent_audit_tenant_isolation" ON public.meeting_recording_consent_audit_log;
DROP POLICY IF EXISTS "consent_audit_select_tenant_isolation" ON public.meeting_recording_consent_audit_log;
CREATE POLICY "consent_audit_select_tenant_isolation"
    ON public.meeting_recording_consent_audit_log
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "consent_audit_insert_tenant_isolation" ON public.meeting_recording_consent_audit_log;
CREATE POLICY "consent_audit_insert_tenant_isolation"
    ON public.meeting_recording_consent_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "processing_claims_tenant_isolation" ON public.meeting_recording_processing_claims;
CREATE POLICY "processing_claims_tenant_isolation"
    ON public.meeting_recording_processing_claims
    FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- 6. Stored Database Functions for Concurrency & Atomic Operations

-- 6a. Stored Function: Atomically submit participant consent decision with row locks
CREATE OR REPLACE FUNCTION public.submit_participant_consent(
    p_session_id VARCHAR(128),
    p_participant_id VARCHAR(128),
    p_decision VARCHAR(32),
    p_reason TEXT,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_new_status VARCHAR(32);
    v_all_granted BOOLEAN;
    v_declined_count INT;
    v_pending_count INT;
    v_total_count INT;
    v_caller_uid UUID;
BEGIN
    -- Verify caller authorization if called directly via PostgREST authenticated role
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL AND auth.role() = 'authenticated' THEN
        IF v_caller_uid::VARCHAR <> p_participant_id AND NOT (p_participant_id LIKE 'guest_%') THEN
            RAISE EXCEPTION 'FORBIDDEN: Cannot submit consent on behalf of another user.';
        END IF;
    END IF;

    -- 1. Lock the consent session row to serialize concurrent submissions
    SELECT * INTO v_session
    FROM public.meeting_recording_consent_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STALE_CONSENT_SESSION: Consent session % not found or inaccessible for tenant.', p_session_id;
    END IF;

    IF v_session.status IN ('STOPPED', 'EXPIRED', 'WITHDRAWN') AND p_decision <> 'WITHDRAWN' THEN
        RAISE EXCEPTION 'STALE_CONSENT_SESSION: Consent session % is terminated or superseded.', p_session_id;
    END IF;

    -- 2. Upsert or update participant consent record
    INSERT INTO public.meeting_recording_consents (
        id,
        session_id,
        tenant_id,
        meeting_id,
        participant_id,
        participant_name,
        role,
        status,
        decided_at,
        reason,
        updated_at
    )
    VALUES (
        'cst_' || p_session_id || '_' || p_participant_id,
        p_session_id,
        p_tenant_id,
        v_session.meeting_id,
        p_participant_id,
        COALESCE(p_participant_id, 'Participant'),
        'STUDENT',
        p_decision,
        NOW(),
        p_reason,
        NOW()
    )
    ON CONFLICT (session_id, participant_id) DO UPDATE SET
        status = EXCLUDED.status,
        decided_at = NOW(),
        reason = EXCLUDED.reason,
        updated_at = NOW();

    -- 3. Append to durable audit ledger
    INSERT INTO public.meeting_recording_consent_audit_log (
        tenant_id,
        meeting_id,
        session_id,
        action,
        participant_id,
        reason,
        created_at
    )
    VALUES (
        p_tenant_id,
        v_session.meeting_id,
        p_session_id,
        CASE
            WHEN p_decision = 'GRANTED' THEN 'CONSENT_GRANTED'
            WHEN p_decision = 'DECLINED' THEN 'CONSENT_DECLINED'
            WHEN p_decision = 'WITHDRAWN' THEN 'CONSENT_WITHDRAWN'
            ELSE 'CONSENT_REQUESTED'
        END,
        p_participant_id,
        p_reason,
        NOW()
    );

    -- 4. Calculate aggregate session status
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'DECLINED'),
        COUNT(*) FILTER (WHERE status = 'PENDING'),
        BOOL_AND(status = 'GRANTED')
    INTO v_total_count, v_declined_count, v_pending_count, v_all_granted
    FROM public.meeting_recording_consents
    WHERE session_id = p_session_id;

    IF p_decision = 'WITHDRAWN' THEN
        v_new_status := 'WITHDRAWN';
    ELSIF v_declined_count > 0 THEN
        v_new_status := 'DECLINED';
    ELSIF v_all_granted AND v_total_count > 0 THEN
        v_new_status := 'ALL_GRANTED';
    ELSE
        v_new_status := 'PENDING_CONSENT';
    END IF;

    -- Update session status
    UPDATE public.meeting_recording_consent_sessions
    SET status = v_new_status, updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', p_session_id,
        'meetingId', v_session.meeting_id,
        'participantId', p_participant_id,
        'decision', p_decision,
        'sessionStatus', v_new_status,
        'allConsented', v_all_granted,
        'pendingCount', v_pending_count,
        'declinedCount', v_declined_count
    );
END;
$$;

-- Restrict RPC execution to service_role only
REVOKE ALL ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;

-- 6b. Stored Function: Atomically acquire distributed processing claim for recording
CREATE OR REPLACE FUNCTION public.acquire_recording_processing_claim(
    p_meeting_id VARCHAR(64),
    p_tenant_id UUID,
    p_claim_token VARCHAR(128),
    p_claimed_by VARCHAR(128),
    p_lease_seconds INT DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_meeting RECORD;
    v_current_claim JSONB;
    v_claimed_at TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
    v_claim_age_seconds NUMERIC;
BEGIN
    SELECT id, recording_status, recording_metadata, updated_at
    INTO v_meeting
    FROM public.meetings
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'MEETING_NOT_FOUND');
    END IF;

    IF v_meeting.recording_status = 'STORED' THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'ALREADY_STORED');
    END IF;

    v_current_claim := v_meeting.recording_metadata->'processing_claim';
    IF v_current_claim IS NOT NULL AND v_current_claim->>'token' IS NOT NULL THEN
        v_claimed_at := (v_current_claim->>'claimed_at')::TIMESTAMPTZ;
        v_claim_age_seconds := EXTRACT(EPOCH FROM (v_now - v_claimed_at));
        IF v_claim_age_seconds < p_lease_seconds THEN
            RETURN jsonb_build_object('acquired', false, 'reason', 'CONCURRENT_PROCESSING_IN_PROGRESS');
        END IF;
    END IF;

    -- Update meetings claim atomically
    UPDATE public.meetings
    SET
        recording_status = 'PROCESSING',
        recording_metadata = jsonb_set(
            COALESCE(recording_metadata, '{}'::jsonb),
            '{processing_claim}',
            jsonb_build_object(
                'token', p_claim_token,
                'claimed_by', p_claimed_by,
                'claimed_at', v_now,
                'lease_expires_at', v_now + (p_lease_seconds || ' seconds')::INTERVAL
            )
        ),
        updated_at = v_now
    WHERE id = p_meeting_id;

    -- Also record in dedicated durable processing claims table
    INSERT INTO public.meeting_recording_processing_claims (
        meeting_id,
        tenant_id,
        claim_token,
        claimed_by,
        claimed_at,
        lease_expires_at,
        updated_at
    )
    VALUES (
        p_meeting_id,
        p_tenant_id,
        p_claim_token,
        p_claimed_by,
        v_now,
        v_now + (p_lease_seconds || ' seconds')::INTERVAL,
        v_now
    )
    ON CONFLICT (meeting_id) DO UPDATE SET
        claim_token = EXCLUDED.claim_token,
        claimed_by = EXCLUDED.claimed_by,
        claimed_at = EXCLUDED.claimed_at,
        lease_expires_at = EXCLUDED.lease_expires_at,
        updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object('acquired', true, 'claimToken', p_claim_token);
END;
$$;

-- Restrict RPC execution to service_role only
REVOKE ALL ON FUNCTION public.acquire_recording_processing_claim(VARCHAR, UUID, VARCHAR, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_recording_processing_claim(VARCHAR, UUID, VARCHAR, VARCHAR, INT) TO service_role;
