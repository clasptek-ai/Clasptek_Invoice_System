-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM
-- MIGRATION: 20260916_meetings_system_phase1.sql
-- Description: Phase 1 Native Browser Video Meeting System
-- Constraints: Zero alteration to existing certified tables (training_sessions,
--              attendance, cohorts, programmes, personnel, enrolments, students).
-- =============================================================================

-- 1. Meetings Table
CREATE TABLE IF NOT EXISTS public.meetings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    public_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    programme_id TEXT REFERENCES public.programmes(id) ON DELETE SET NULL,
    cohort_id TEXT,
    training_session_id TEXT,
    facilitator_id TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')),
    participant_access TEXT NOT NULL DEFAULT 'COHORT_ONLY' CHECK (participant_access IN ('COHORT_ONLY', 'ALL_STUDENTS', 'PUBLIC_TOKEN')),
    sfu_provider TEXT NOT NULL DEFAULT 'livekit' CHECK (sfu_provider IN ('livekit', 'daily', 'mock')),
    sfu_room_id TEXT,
    settings JSONB NOT NULL DEFAULT '{"allowChat":true,"allowScreenShare":true,"muteOnEntry":false}'::jsonb,
    recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    recording_status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (recording_status IN ('NOT_STARTED', 'RECORDING', 'PROCESSING', 'STORED', 'FAILED')),
    recording_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meetings_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_meetings_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_meetings_tenant_session FOREIGN KEY (tenant_id, training_session_id)
        REFERENCES public.training_sessions(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_meetings_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_tenant_status ON public.meetings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_session ON public.meetings(tenant_id, training_session_id);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_cohort ON public.meetings(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON public.meetings(public_id);

-- 2. Meeting Participants Table (Presence intervals)
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

-- 3. Meeting Attendance Summary Table (Consolidated intervals per user)
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
    attendance_record_id TEXT REFERENCES public.attendance(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_attendance_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_meeting_attendance_user UNIQUE (tenant_id, meeting_id, user_id),
    CONSTRAINT fk_meeting_attendance_meeting FOREIGN KEY (tenant_id, meeting_id)
        REFERENCES public.meetings(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON public.meeting_attendance(tenant_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_session ON public.meeting_attendance(tenant_id, training_session_id);

-- 4. Meeting Chat Messages Table
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

-- Enable RLS on all 4 new tables
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_chat_messages ENABLE ROW LEVEL SECURITY;
