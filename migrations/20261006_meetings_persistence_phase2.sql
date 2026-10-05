-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM
-- MIGRATION: 20261006_meetings_persistence_phase2.sql
-- Description: Meetings Persistence & Security Phase 2
-- Authoritative persistent meetings schema with multi-tenant RLS isolation.
-- Constraints: Strict composite referential integrity with cohorts,
--              training_sessions, and personnel.
-- =============================================================================

-- 1. Create public.meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    public_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    meeting_type TEXT NOT NULL DEFAULT 'ONLINE_CLASS',
    status TEXT NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),
    participant_access TEXT NOT NULL DEFAULT 'COHORT_ONLY'
        CHECK (participant_access IN ('COHORT_ONLY', 'ALL_STUDENTS', 'PUBLIC_TOKEN')),
    cohort_id TEXT,
    training_session_id TEXT,
    facilitator_id TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'LIVEKIT'
        CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK')),
    provider_room_id TEXT,
    provider_room_name TEXT,
    provider_room_url TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    settings JSONB NOT NULL DEFAULT '{"allowChat":true,"allowScreenShare":true,"muteOnEntry":false}'::jsonb,
    recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    recording_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (recording_status IN ('NOT_STARTED', 'RECORDING', 'PROCESSING', 'STORED', 'FAILED')),
    recording_url TEXT,
    recording_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Multi-tenant composite uniqueness and foreign keys
    CONSTRAINT uq_meetings_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_meetings_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_meetings_tenant_session FOREIGN KEY (tenant_id, training_session_id)
        REFERENCES public.training_sessions(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_meetings_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE SET NULL
);

-- 2. Indexes for tenant isolation and query performance
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_status ON public.meetings(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_cohort ON public.meetings(tenant_id, cohort_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_facilitator ON public.meetings(tenant_id, facilitator_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_start ON public.meetings(tenant_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON public.meetings(public_id);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
CREATE TRIGGER trg_meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_meetings_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if any to ensure clean idempotent definition
DROP POLICY IF EXISTS "meetings_admin_full_access" ON public.meetings;
DROP POLICY IF EXISTS "meetings_facilitator_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_facilitator_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_student_select" ON public.meetings;

-- 6. Policy: Super Admin & Finance Manager (full management within tenant)
CREATE POLICY "meetings_admin_full_access" ON public.meetings
    FOR ALL
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_super_admin() OR public.is_finance_manager())
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_super_admin() OR public.is_finance_manager())
    );

-- 7. Policy: Facilitator SELECT (assigned meetings or lead facilitator for cohort)
CREATE POLICY "meetings_facilitator_select" ON public.meetings
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND deleted_at IS NULL
        AND public.is_facilitator()
        AND (
            facilitator_id IN (
                SELECT p.id FROM public.personnel p
                WHERE p.user_id = auth.uid()
                  AND p.tenant_id = public.get_auth_tenant_id()
            )
            OR cohort_id IN (
                SELECT c.id FROM public.cohorts c
                WHERE c.lead_facilitator_id IN (
                    SELECT p.id FROM public.personnel p
                    WHERE p.user_id = auth.uid()
                      AND p.tenant_id = public.get_auth_tenant_id()
                )
                AND c.tenant_id = public.get_auth_tenant_id()
            )
        )
    );

-- 8. Policy: Student SELECT (enrolled cohort meetings only)
CREATE POLICY "meetings_student_select" ON public.meetings
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND deleted_at IS NULL
        AND cohort_id IN (
            SELECT e.cohort_id FROM public.enrolments e
            WHERE e.tenant_id = public.get_auth_tenant_id()
              AND e.status NOT IN ('CANCELLED', 'WITHDRAWN')
              AND e.student_id IN (
                  SELECT s.id FROM public.students s
                  WHERE s.user_id = auth.uid()
                    AND s.tenant_id = public.get_auth_tenant_id()
              )
        )
    );
