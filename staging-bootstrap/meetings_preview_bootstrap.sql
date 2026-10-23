-- =============================================================================
-- CLASPTEK PLATFORM — MEETINGS PREVIEW STAGING BOOTSTRAP REVISED
-- File: staging-bootstrap/meetings_preview_bootstrap.sql
-- Status: REVISED DRAFT / OFFLINE REVIEW ARTIFACT ONLY. DO NOT EXECUTE DIRECTLY.
-- Target: Dedicated Fresh Staging Supabase Database (Disposable Testing Environment)
--
-- STRICT PREVIEW ISOLATION SAFEGUARDS:
-- 1. Quarantined Production Project: 'logaawoigfxnisimfatf' is STRICTLY FORBIDDEN.
-- 2. Legacy Drive Test Project: 'dwhjoiebzwnjdpcvcwvs' is NOT an application database.
-- 3. Scope: Minimum verifiable platform schema, authoritative LiveKit meetings schema,
--    and guest waiting-room ledger required to test Phase C53 routing and guest admission.
-- 4. Exclusions: Google Meet is retired; live SFU egress, Google Drive OAuth tokens,
--    and complex finance/billing tables are excluded from this minimal bootstrap.
-- 5. Production Protection: SQL-level assertions alone cannot replace client-side
--    connection guard host verification. Operators MUST confirm connection hostname
--    before applying any DDL.
-- 6. Fresh Target Only: Must only be run on an empty, freshly provisioned database.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0 — PREFLIGHT SAFETY GUARD (FRESH PROJECT REQUIREMENT & PREREQUISITES)
-- =============================================================================
-- CRITICAL OPERATOR INVARIANTS:
-- 1. This staging bootstrap is designed EXCLUSIVELY for a newly provisioned,
--    empty, disposable Supabase staging project.
-- 2. It must NEVER be applied to Production ('logaawoigfxnisimfatf') or the
--    legacy Google Drive testing project ('dwhjoiebzwnjdpcvcwvs').
-- 3. SQL guards cannot inspect client-side network connection hostnames;
--    operators MUST verify the target connection URL prior to execution.
-- 4. Fail-closed Supabase prerequisites: Asserts the presence of auth.users
--    (table or partitioned table), auth.uid() function (returning uuid, 0 args),
--    and built-in Supabase roles (anon, authenticated, service_role).
-- 5. Fail-closed fresh schema: If ANY bootstrap-owned tables or helper functions
--    exist in public schema, this block immediately aborts and rolls back.
-- 6. DDL Invariant Note: Subsequent DDL statements retain defensive clauses
--    ('IF NOT EXISTS', 'DROP POLICY IF EXISTS') as defense-in-depth against partial
--    replays, but this script is strictly a fresh-target bootstrap, NOT an
--    additive migration and NOT a production migration.
-- =============================================================================

DO $$
BEGIN
    -- Check 1: Required Supabase Auth users table exists (supports regular and partitioned tables)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'auth'
          AND c.relname = 'users'
          AND c.relkind IN ('r', 'p')
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Required Supabase Auth table auth.users is missing. Target environment must be a Supabase database.';
    END IF;

    -- Check 2: Required Supabase Auth function auth.uid() exists with callable signature (0 args, returns uuid)
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_type t ON p.prorettype = t.oid
        WHERE n.nspname = 'auth'
          AND p.proname = 'uid'
          AND p.pronargs = 0
          AND t.typname = 'uuid'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Required Supabase Auth function auth.uid() returning uuid with 0 arguments is missing. Target environment must provide Supabase Auth.';
    END IF;

    -- Check 3: Required Supabase roles (anon, authenticated, service_role) exist
    IF (
        SELECT COUNT(*) FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    ) != 3 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: One or more required Supabase roles (anon, authenticated, service_role) are missing.';
    END IF;

    -- Check 4: Fresh project requirement - Reject if any bootstrap-owned tables exist
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
              'tenants',
              'profiles',
              'tenant_memberships',
              'personnel',
              'programmes',
              'cohorts',
              'training_sessions',
              'students',
              'enrolments',
              'meetings',
              'meeting_participants',
              'meeting_attendance',
              'meeting_chat_messages',
              'meeting_guest_requests'
          )
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Target database already contains bootstrap-owned tables. Staging bootstrap requires a dedicated, fresh, empty disposable staging database. Aborting.';
    END IF;

    -- Check 5: Fresh project requirement - Reject if any bootstrap helper functions exist
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'get_auth_tenant_id',
              'get_auth_user_role',
              'is_super_admin',
              'is_finance_manager',
              'is_staff',
              'is_facilitator',
              'set_meetings_updated_at'
          )
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Target database already contains bootstrap helper functions. Staging bootstrap requires a clean schema. Aborting.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 1 — EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECTION 2 — CORE IDENTITY, TENANT & SECURITY FOUNDATION
-- =============================================================================

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tenant Memberships Table (Authoritative Tenant & Role Governance)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- =============================================================================
-- SECTION 3 — SECURITY & RLS HELPER FUNCTIONS
-- =============================================================================

-- Resolves authoritative tenant_id from active tenant membership.
-- FAIL-CLOSED: Mirrors lib/auth/server.ts maybeSingle(). If user has 0 or >1 active
-- memberships (ambiguous), returns NULL rather than arbitrarily picking with LIMIT 1.
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_count INT;
BEGIN
    SELECT COUNT(*), MIN(tenant_id)
    INTO v_count, v_tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';

    IF v_count = 1 THEN
        RETURN v_tenant_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- Resolves user's membership role within current tenant.
-- FAIL-CLOSED: Mirrors lib/auth/server.ts maybeSingle(). If user has 0 or >1 active
-- memberships, returns NULL rather than arbitrarily picking with LIMIT 1.
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_count INT;
BEGIN
    SELECT COUNT(*), MIN(role)
    INTO v_count, v_role
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';

    IF v_count = 1 THEN
        RETURN v_role;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- Checks if authenticated user is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() = 'SUPER_ADMIN');
$$;

-- Checks if authenticated user is Finance Manager
CREATE OR REPLACE FUNCTION public.is_finance_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));
$$;

-- Checks if authenticated user is Staff
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'));
$$;

-- Least-privilege function execution grants: Revoke from PUBLIC and anon
REVOKE ALL ON FUNCTION public.get_auth_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_auth_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_finance_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finance_manager() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- =============================================================================
-- SECTION 4 — ACADEMIC & PERSONNEL PREREQUISITES FOR MEETINGS
-- =============================================================================

-- 4. Personnel Table (Facilitators & Staff)
CREATE TABLE IF NOT EXISTS public.personnel (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    employee_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    employee_type TEXT NOT NULL CHECK (employee_type IN ('staff', 'facilitator')),
    department TEXT NOT NULL DEFAULT 'Academics',
    job_title TEXT NOT NULL DEFAULT 'Facilitator',
    employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'deactivated', 'terminated')),
    date_joined DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, employee_id),
    CONSTRAINT uq_personnel_tenant_id UNIQUE (tenant_id, id)
);

-- Checks if authenticated user is an active Facilitator in personnel table
-- STRICT TENANT ISOLATION: Validates tenant_id matches authoritative tenant
CREATE OR REPLACE FUNCTION public.is_facilitator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.personnel
        WHERE user_id = auth.uid()
          AND tenant_id = public.get_auth_tenant_id()
          AND employee_type = 'facilitator'
          AND employment_status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.is_facilitator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_facilitator() TO authenticated, service_role;

-- 5. Programmes Table
CREATE TABLE IF NOT EXISTS public.programmes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code),
    CONSTRAINT uq_programmes_tenant_id UNIQUE (tenant_id, id)
);

-- 6. Cohorts Table
CREATE TABLE IF NOT EXISTS public.cohorts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    programme_id TEXT NOT NULL,
    lead_facilitator_id TEXT,
    cohort_code TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    delivery_mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('PLANNING', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cohort_dates CHECK (end_date >= start_date),
    CONSTRAINT uq_cohorts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_cohorts_tenant_code UNIQUE (tenant_id, cohort_code),
    CONSTRAINT fk_cohorts_programme_tenant FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cohorts_facilitator_tenant FOREIGN KEY (tenant_id, lead_facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT
);

-- 7. Training Sessions Table (Optional meeting linkage — aligned with canonical schema)
CREATE TABLE IF NOT EXISTS public.training_sessions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    facilitator_id TEXT,
    session_number INT NOT NULL CHECK (session_number > 0),
    session_title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    delivery_mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_training_sessions_tenant_number UNIQUE (tenant_id, cohort_id, session_number),
    CONSTRAINT fk_training_sessions_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT
);

-- 8. Students Table (For student attendance & RLS policies)
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    student_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'WITHDRAWN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, student_number),
    CONSTRAINT uq_students_tenant_id UNIQUE (tenant_id, id)
);

-- 9. Enrolments Table (For student meeting cohort authorization)
CREATE TABLE IF NOT EXISTS public.enrolments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    student_id TEXT NOT NULL,
    programme_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    enrolment_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED', 'WITHDRAWN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, enrolment_number),
    CONSTRAINT uq_enrolments_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_enrolments_student FOREIGN KEY (tenant_id, student_id)
        REFERENCES public.students(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_enrolments_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE CASCADE
);

-- =============================================================================
-- SECTION 5 — AUTHORITATIVE MEETINGS SCHEMA (PHASE 2 CONSOLIDATION)
-- =============================================================================

-- Clean authoritative CREATE TABLE with all Phase 2 columns
-- Referential integrity: composite foreign keys use ON DELETE RESTRICT to eliminate
-- unsafe ON DELETE SET NULL conflicts with NOT NULL tenant_id.
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
        CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK', 'GOOGLE_MEET')),
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

    CONSTRAINT uq_meetings_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_meetings_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_meetings_tenant_session FOREIGN KEY (tenant_id, training_session_id)
        REFERENCES public.training_sessions(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_meetings_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT
);

-- Partial indexes for tenant isolation, scheduling, and active query lookups
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_status ON public.meetings(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_cohort ON public.meetings(tenant_id, cohort_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_facilitator ON public.meetings(tenant_id, facilitator_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_start ON public.meetings(tenant_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON public.meetings(public_id);

-- Automatic updated_at trigger (trigger functions do not require direct execution privileges)
CREATE OR REPLACE FUNCTION public.set_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.set_meetings_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
CREATE TRIGGER trg_meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_meetings_updated_at();

-- =============================================================================
-- SECTION 6 — SUPPORTING MEETING PARTICIPANT & ATTENDANCE TABLES
-- =============================================================================

-- 11. Meeting Participants (Live presence intervals)
CREATE TABLE IF NOT EXISTS public.meeting_participants (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    meeting_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    student_id TEXT,
    personnel_id TEXT,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('HOST', 'FACILITATOR', 'STUDENT', 'STAFF', 'GUEST')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    duration_seconds INT NOT NULL DEFAULT 0,
    connection_status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (connection_status IN ('CONNECTED', 'DISCONNECTED', 'REMOVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_participants_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_meeting_participants_meeting FOREIGN KEY (tenant_id, meeting_id)
        REFERENCES public.meetings(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON public.meeting_participants(tenant_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON public.meeting_participants(tenant_id, user_id);

-- 12. Meeting Attendance (Consolidated attendance summary)
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    meeting_id TEXT NOT NULL,
    user_id UUID,
    student_id TEXT,
    training_session_id TEXT,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT',
    total_duration_seconds INT NOT NULL DEFAULT 0,
    first_joined_at TIMESTAMPTZ NOT NULL,
    last_left_at TIMESTAMPTZ,
    intervals_count INT NOT NULL DEFAULT 1,
    attendance_status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_attendance_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_meeting_attendance_user UNIQUE (tenant_id, meeting_id, user_id),
    CONSTRAINT fk_meeting_attendance_meeting FOREIGN KEY (tenant_id, meeting_id)
        REFERENCES public.meetings(tenant_id, id) ON DELETE CASCADE
);

-- 13. Meeting Chat Messages Table
CREATE TABLE IF NOT EXISTS public.meeting_chat_messages (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    meeting_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT 'STUDENT',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_chat_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_meeting_chat_meeting FOREIGN KEY (tenant_id, meeting_id)
        REFERENCES public.meetings(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_chat_meeting ON public.meeting_chat_messages(tenant_id, meeting_id, created_at);

-- =============================================================================
-- SECTION 7 — GUEST WAITING ROOM & ADMISSION LEDGER
-- =============================================================================

-- 14. Meeting Guest Requests Table (From migration 20261010_meeting_guest_requests.sql)
CREATE TABLE IF NOT EXISTS public.meeting_guest_requests (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    meeting_id VARCHAR(64) NOT NULL,
    meeting_public_id VARCHAR(64) NOT NULL,
    guest_name VARCHAR(128) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_organization VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED')),
    request_token VARCHAR(128) NOT NULL UNIQUE,
    livekit_token TEXT,
    livekit_server_url VARCHAR(255),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_requests_meeting ON public.meeting_guest_requests (meeting_public_id, status);
CREATE INDEX IF NOT EXISTS idx_guest_requests_token ON public.meeting_guest_requests (request_token);
CREATE INDEX IF NOT EXISTS idx_guest_requests_tenant ON public.meeting_guest_requests (tenant_id);

-- =============================================================================
-- SECTION 8 — ROW LEVEL SECURITY POLICIES (COMPLETE SUPPORTING COVERAGE)
-- =============================================================================

-- Enable RLS across all 14 tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 8.1 Core Identity & Supporting Academic Tables Policies
-- -----------------------------------------------------------------------------

-- Tenants: Authenticated users can read their active tenant metadata
DROP POLICY IF EXISTS "tenants_auth_read" ON public.tenants;
CREATE POLICY "tenants_auth_read" ON public.tenants
    FOR SELECT TO authenticated
    USING (id IN (
        SELECT tm.tenant_id FROM public.tenant_memberships tm
        WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    ));

-- Profiles: Users can read and update their own profile
DROP POLICY IF EXISTS "profiles_own_read" ON public.profiles;
CREATE POLICY "profiles_own_read" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Tenant Memberships: Super Admin can read tenant memberships; users can read their own
DROP POLICY IF EXISTS "memberships_tenant_read" ON public.tenant_memberships;
CREATE POLICY "memberships_tenant_read" ON public.tenant_memberships
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_super_admin() OR user_id = auth.uid())
    );

-- Personnel: Required by meeting authorization subqueries. Users can read own record; admins read tenant
DROP POLICY IF EXISTS "personnel_tenant_select" ON public.personnel;
CREATE POLICY "personnel_tenant_select" ON public.personnel
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_super_admin() OR user_id = auth.uid())
    );

-- Programmes: Authenticated users can view programmes in their active tenant
DROP POLICY IF EXISTS "programmes_tenant_select" ON public.programmes;
CREATE POLICY "programmes_tenant_select" ON public.programmes
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

-- Cohorts: Required by meeting facilitator & student lookups
DROP POLICY IF EXISTS "cohorts_tenant_select" ON public.cohorts;
CREATE POLICY "cohorts_tenant_select" ON public.cohorts
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

-- Training Sessions: Optional meeting linkage lookups
DROP POLICY IF EXISTS "training_sessions_tenant_select" ON public.training_sessions;
CREATE POLICY "training_sessions_tenant_select" ON public.training_sessions
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

-- Students: Required for student meeting subquery. Students read own record; facilitators read tenant
DROP POLICY IF EXISTS "students_tenant_select" ON public.students;
CREATE POLICY "students_tenant_select" ON public.students
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_staff() OR public.is_facilitator() OR user_id = auth.uid())
    );

-- Enrolments: Required for student meeting cohort authorization subquery
DROP POLICY IF EXISTS "enrolments_tenant_select" ON public.enrolments;
CREATE POLICY "enrolments_tenant_select" ON public.enrolments
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

-- -----------------------------------------------------------------------------
-- 8.2 Authoritative Meetings Policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "meetings_admin_full_access" ON public.meetings;
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

DROP POLICY IF EXISTS "meetings_facilitator_select" ON public.meetings;
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

DROP POLICY IF EXISTS "meetings_student_select" ON public.meetings;
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

-- -----------------------------------------------------------------------------
-- 8.3 Meeting Participants, Attendance & Chat Policies
-- -----------------------------------------------------------------------------

-- Meeting Participants: Authenticated tenant users can view participant roster
DROP POLICY IF EXISTS "meeting_participants_tenant_select" ON public.meeting_participants;
CREATE POLICY "meeting_participants_tenant_select" ON public.meeting_participants
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

-- Meeting Attendance: Admins, facilitators, and individual attendees can view attendance
DROP POLICY IF EXISTS "meeting_attendance_tenant_select" ON public.meeting_attendance;
CREATE POLICY "meeting_attendance_tenant_select" ON public.meeting_attendance
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_super_admin() OR public.is_facilitator() OR user_id = auth.uid())
    );

-- Meeting Chat: Authenticated tenant users can view and post chat messages in meeting
DROP POLICY IF EXISTS "meeting_chat_tenant_select" ON public.meeting_chat_messages;
CREATE POLICY "meeting_chat_tenant_select" ON public.meeting_chat_messages
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "meeting_chat_tenant_insert" ON public.meeting_chat_messages;
CREATE POLICY "meeting_chat_tenant_insert" ON public.meeting_chat_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (user_id = auth.uid() OR user_id IS NULL)
    );

-- -----------------------------------------------------------------------------
-- 8.4 Guest Requests RLS Policies — Least Privilege & Secret Token Protection
-- -----------------------------------------------------------------------------
-- Prevents ordinary authenticated users (students/staff) and Finance Managers from
-- reading guest emails, guest names, high-entropy request_token secrets, or LiveKit room tokens.
-- Host listing via createServerClient() is restricted to Super Admin or the specific
-- assigned Facilitator for that meeting or cohort.
-- Public guest request creation, polling, and host decision actions are handled via
-- server route handlers using createSupabaseServiceClient(), which bypasses RLS and
-- validates business logic, token entropy, and room state.

DROP POLICY IF EXISTS "meeting_guest_requests_tenant_isolation" ON public.meeting_guest_requests;
DROP POLICY IF EXISTS "meeting_guest_requests_host_select" ON public.meeting_guest_requests;
DROP POLICY IF EXISTS "meeting_guest_requests_admin_insert" ON public.meeting_guest_requests;
DROP POLICY IF EXISTS "meeting_guest_requests_admin_update" ON public.meeting_guest_requests;
DROP POLICY IF EXISTS "meeting_guest_requests_admin_delete" ON public.meeting_guest_requests;

-- 1. SELECT: Super Admin across tenant OR Facilitator assigned to the specific meeting/cohort
CREATE POLICY "meeting_guest_requests_host_select"
    ON public.meeting_guest_requests
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.is_super_admin()
            OR (
                public.is_facilitator()
                AND meeting_public_id IN (
                    SELECT m.public_id FROM public.meetings m
                    WHERE m.tenant_id = public.get_auth_tenant_id()
                      AND m.deleted_at IS NULL
                      AND (
                          m.facilitator_id IN (
                              SELECT p.id FROM public.personnel p
                              WHERE p.user_id = auth.uid()
                                AND p.tenant_id = public.get_auth_tenant_id()
                          )
                          OR m.cohort_id IN (
                              SELECT c.id FROM public.cohorts c
                              WHERE c.lead_facilitator_id IN (
                                  SELECT p.id FROM public.personnel p
                                  WHERE p.user_id = auth.uid()
                                    AND p.tenant_id = public.get_auth_tenant_id()
                              )
                              AND c.tenant_id = public.get_auth_tenant_id()
                          )
                      )
                )
            )
        )
    );

-- 2. INSERT: Direct client inserts restricted to Super Admin (service-role handles public guest requests)
CREATE POLICY "meeting_guest_requests_admin_insert"
    ON public.meeting_guest_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND public.is_super_admin()
    );

-- 3. UPDATE: Direct client updates restricted to Super Admin (service-role handles host decisions)
CREATE POLICY "meeting_guest_requests_admin_update"
    ON public.meeting_guest_requests
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND public.is_super_admin()
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND public.is_super_admin()
    );

-- 4. DELETE: Direct client deletions restricted to Super Admin
CREATE POLICY "meeting_guest_requests_admin_delete"
    ON public.meeting_guest_requests
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND public.is_super_admin()
    );

-- =============================================================================
-- SECTION 9 — SYNTHETIC FIXTURES TEMPLATE (DOCUMENTATION & OPTIONAL SEED)
-- =============================================================================
-- NOTE ON USER AUTHENTICATION:
-- Do NOT attempt to inject passwords directly into auth.users via SQL.
-- Supabase Auth requires GoTrue to hash credentials, emit JWTs, and handle salts.
--
-- OPERATOR STEP:
-- 1. In Supabase Dashboard -> Authentication -> Users, click "Add User":
--    - Email: host.staging@clasptek.org
--    - Password: <secure-test-password>
--    - Copy the generated User UID (e.g. '00000000-0000-0000-0000-000000000001')
-- 2. Substitute the generated UID into the synthetic seed blocks below:

/*
-- Seed Canonical Default Tenant (matches lib/auth/server.ts DEFAULT_TENANT_ID)
INSERT INTO public.tenants (id, name, slug)
VALUES ('f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'Clasptek Staging Test Academy', 'clasptek-staging')
ON CONFLICT (id) DO NOTHING;

-- Seed Programme & Cohort
INSERT INTO public.programmes (id, tenant_id, name, code)
VALUES ('prog-staging-001', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'Software Engineering Diploma', 'SWE-DIP')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohorts (id, tenant_id, programme_id, cohort_code, name, start_date, end_date, delivery_mode)
VALUES ('coh-staging-001', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'prog-staging-001', 'COH-2026-TEST', 'Staging Test Cohort', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', 'ONLINE')
ON CONFLICT (id) DO NOTHING;

-- Seed Facilitator Personnel Record (Linked to Auth UID)
INSERT INTO public.personnel (id, tenant_id, user_id, employee_id, first_name, last_name, full_name, email, employee_type, employment_status)
VALUES ('pers-staging-001', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'REPLACE_WITH_SUPABASE_AUTH_UID', 'EMP-STAGING-01', 'Host', 'Facilitator', 'Host Facilitator', 'host.staging@clasptek.org', 'facilitator', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Profile Record (Linked to Auth UID)
INSERT INTO public.profiles (id, email, full_name)
VALUES ('REPLACE_WITH_SUPABASE_AUTH_UID', 'host.staging@clasptek.org', 'Host Facilitator')
ON CONFLICT (id) DO NOTHING;

-- Seed Tenant Membership (SUPER_ADMIN role permits meeting management)
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
VALUES ('f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'REPLACE_WITH_SUPABASE_AUTH_UID', 'SUPER_ADMIN', 'active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Seed Target Test Meeting for Guest Landing Test (/meet/preview-test-room)
INSERT INTO public.meetings (
    id, tenant_id, public_id, title, description, status, provider,
    facilitator_id, cohort_id, scheduled_start, scheduled_end
) VALUES (
    'mtg_staging_test_101',
    'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    'preview-test-room',
    'Staging Verification Classroom Session',
    'Interactive meeting room for testing guest admission, waiting room, and token minting.',
    'SCHEDULED',
    'LIVEKIT',
    'pers-staging-001',
    'coh-staging-001',
    NOW(),
    NOW() + INTERVAL '2 hours'
) ON CONFLICT (public_id) DO NOTHING;
*/


-- =============================================================================
-- SECTION 8 — RECORDING PIPELINE: PARTICIPANT CONSENT & AUDIT LEDGER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_sessions (
    id VARCHAR(128) PRIMARY KEY,
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

REVOKE UPDATE, DELETE ON public.meeting_recording_consent_audit_log FROM authenticated, anon, PUBLIC;

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


-- Stored Function: Atomically submit participant consent decision with row locks
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
AS $
DECLARE
    v_session RECORD;
    v_new_status VARCHAR(32);
    v_all_granted BOOLEAN;
    v_declined_count INT;
    v_pending_count INT;
    v_total_count INT;
    v_caller_uid UUID;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL AND auth.role() = 'authenticated' THEN
        IF v_caller_uid::VARCHAR <> p_participant_id AND NOT (p_participant_id LIKE 'guest_%') THEN
            RAISE EXCEPTION 'FORBIDDEN: Cannot submit consent on behalf of another user.';
        END IF;
    END IF;

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
$;

REVOKE ALL ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;

-- Stored Function: Atomically acquire distributed processing claim for recording
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
AS $
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
$;

REVOKE ALL ON FUNCTION public.acquire_recording_processing_claim(VARCHAR, UUID, VARCHAR, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_recording_processing_claim(VARCHAR, UUID, VARCHAR, VARCHAR, INT) TO service_role;

-- Stored Function: Atomically release distributed processing claim for recording
CREATE OR REPLACE FUNCTION public.release_recording_processing_claim(
    p_meeting_id VARCHAR(64),
    p_tenant_id UUID,
    p_claim_token VARCHAR(128)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $
DECLARE
    v_meeting RECORD;
    v_current_claim JSONB;
    v_active_token TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_audit_error BOOLEAN := false;
BEGIN
    IF p_claim_token IS NULL OR trim(p_claim_token) = '' THEN
        RETURN jsonb_build_object('released', false, 'reason', 'CLAIM_TOKEN_REQUIRED');
    END IF;

    SELECT id, recording_metadata
    INTO v_meeting
    FROM public.meetings
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('released', false, 'reason', 'MEETING_NOT_FOUND');
    END IF;

    v_current_claim := v_meeting.recording_metadata->'processing_claim';

    IF v_current_claim IS NULL OR v_current_claim->>'token' IS NULL THEN
        DELETE FROM public.meeting_recording_processing_claims
        WHERE meeting_id = p_meeting_id AND tenant_id = p_tenant_id AND claim_token = p_claim_token;

        RETURN jsonb_build_object('released', true, 'reason', 'NO_ACTIVE_CLAIM');
    END IF;

    v_active_token := v_current_claim->>'token';

    IF v_active_token <> p_claim_token THEN
        RETURN jsonb_build_object(
            'released', false,
            'reason', 'TOKEN_MISMATCH'
        );
    END IF;

    UPDATE public.meetings
    SET
        recording_metadata = v_meeting.recording_metadata - 'processing_claim',
        updated_at = v_now
    WHERE id = p_meeting_id AND tenant_id = p_tenant_id;

    DELETE FROM public.meeting_recording_processing_claims
    WHERE meeting_id = p_meeting_id AND tenant_id = p_tenant_id AND claim_token = p_claim_token;

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
$;

REVOKE ALL ON FUNCTION public.release_recording_processing_claim(VARCHAR, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_recording_processing_claim(VARCHAR, UUID, VARCHAR) TO service_role;

COMMIT;
