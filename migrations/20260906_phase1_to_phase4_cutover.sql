-- =============================================================================
-- CLASPTEK ENTERPRISE PRODUCTION DATABASE MIGRATION & CUTOVER
-- Target: Phase 1 through Phase 4 Schema Reconciliation
-- Target Database: PostgreSQL / Supabase Production (logaawoigfxnisimfatf)
-- Safe, Additive, Idempotent, Non-Destructive, Transaction-Safe
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 2. RECONCILE EXISTING PROGRAMMES TABLE (PHASE 2 MODEL)
-- -----------------------------------------------------------------------------
ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS duration_weeks INT NOT NULL DEFAULT 8;
ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS session_count INT NOT NULL DEFAULT 16;
ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programme_installments') THEN
        ALTER TABLE public.programmes ADD CONSTRAINT chk_programme_installments 
            CHECK (NOT allow_installments OR (installment_first_pct + installment_second_pct = 100));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programme_duration') THEN
        ALTER TABLE public.programmes ADD CONSTRAINT chk_programme_duration 
            CHECK (duration_weeks > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programme_sessions') THEN
        ALTER TABLE public.programmes ADD CONSTRAINT chk_programme_sessions 
            CHECK (session_count > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_programmes_tenant_id') THEN
        ALTER TABLE public.programmes ADD CONSTRAINT uq_programmes_tenant_id 
            UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_programmes_tenant_code') THEN
        ALTER TABLE public.programmes ADD CONSTRAINT uq_programmes_tenant_code 
            UNIQUE (tenant_id, code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_programmes_tenant ON public.programmes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_programmes_status ON public.programmes(tenant_id, status);

-- -----------------------------------------------------------------------------
-- 3. ENSURE COMPOSITE KEYS ON PARENT TABLES FOR MULTI-TENANT FKs
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_tenant_id') THEN
        ALTER TABLE public.customers ADD CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_personnel_tenant_id') THEN
        ALTER TABLE public.personnel ADD CONSTRAINT uq_personnel_tenant_id UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_invoices_tenant_id') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT uq_invoices_tenant_id UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enquiries_tenant_id') THEN
        ALTER TABLE public.enquiries ADD CONSTRAINT uq_enquiries_tenant_id UNIQUE (tenant_id, id);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. CREATE STUDENTS TABLE (PHASE 1 AUTHORITATIVE MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    customer_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    student_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    gender TEXT,
    address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'WITHDRAWN')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, student_number),
    UNIQUE(tenant_id, email),
    CONSTRAINT uq_students_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_students_customer_tenant FOREIGN KEY (tenant_id, customer_id)
        REFERENCES public.customers(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_students_tenant_status ON public.students(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_email ON public.students(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_students_customer_id ON public.students(customer_id);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_tenant_select') THEN
        CREATE POLICY "students_tenant_select" ON public.students FOR SELECT TO authenticated 
            USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance() OR public.is_facilitator()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_tenant_insert') THEN
        CREATE POLICY "students_tenant_insert" ON public.students FOR INSERT TO authenticated 
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_tenant_update') THEN
        CREATE POLICY "students_tenant_update" ON public.students FOR UPDATE TO authenticated 
            USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance())) 
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_admin_delete') THEN
        CREATE POLICY "students_admin_delete" ON public.students FOR DELETE TO authenticated 
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. CREATE COHORTS TABLE (PHASE 2 MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohorts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    programme_id TEXT NOT NULL,
    lead_facilitator_id TEXT,
    cohort_code TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    delivery_mode TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('PLANNING', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cohort_dates CHECK (end_date >= start_date),
    CONSTRAINT uq_cohorts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_cohorts_tenant_code UNIQUE (tenant_id, cohort_code),
    CONSTRAINT uq_cohorts_tenant_prog UNIQUE (tenant_id, id, programme_id),
    CONSTRAINT fk_cohorts_programme_tenant FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cohorts_facilitator_tenant FOREIGN KEY (tenant_id, lead_facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_status ON public.cohorts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_prog ON public.cohorts(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_dates ON public.cohorts(tenant_id, start_date, end_date);

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cohorts' AND policyname = 'cohorts_tenant_select') THEN
        CREATE POLICY "cohorts_tenant_select" ON public.cohorts FOR SELECT TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance() OR public.is_facilitator()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cohorts' AND policyname = 'cohorts_admin_insert') THEN
        CREATE POLICY "cohorts_admin_insert" ON public.cohorts FOR INSERT TO authenticated 
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cohorts' AND policyname = 'cohorts_admin_update') THEN
        CREATE POLICY "cohorts_admin_update" ON public.cohorts FOR UPDATE TO authenticated 
            USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cohorts' AND policyname = 'cohorts_admin_delete') THEN
        CREATE POLICY "cohorts_admin_delete" ON public.cohorts FOR DELETE TO authenticated 
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. RECONCILE ENROLMENTS TABLE (PHASE 2/3/4 ARCHITECTURE)
-- -----------------------------------------------------------------------------
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS cohort_id TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS enrolment_number TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS agreed_tuition_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_date DATE;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE';
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_verified_by UUID REFERENCES auth.users(id);
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_verified_at TIMESTAMPTZ;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_notes TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS completion_attendance_pct NUMERIC(5,2);
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS certificate_issued BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS certificate_number TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.enrolments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrolments_tenant_id') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT uq_enrolments_tenant_id UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrolments_tenant_number') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT uq_enrolments_tenant_number UNIQUE (tenant_id, enrolment_number);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrolments_student_cohort') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT uq_enrolments_student_cohort UNIQUE (tenant_id, student_id, cohort_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrolments_tenant_cohort') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT uq_enrolments_tenant_cohort UNIQUE (tenant_id, id, cohort_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_student_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_student_tenant 
            FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_programme_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_programme_tenant 
            FOREIGN KEY (tenant_id, programme_id) REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_cohort_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_cohort_tenant 
            FOREIGN KEY (tenant_id, cohort_id) REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_cohort_prog_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_cohort_prog_tenant 
            FOREIGN KEY (tenant_id, cohort_id, programme_id) REFERENCES public.cohorts(tenant_id, id, programme_id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_invoice_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_invoice_tenant 
            FOREIGN KEY (tenant_id, invoice_id) REFERENCES public.invoices(tenant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_customer_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_customer_tenant 
            FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrolments_enquiry_tenant') THEN
        ALTER TABLE public.enrolments ADD CONSTRAINT fk_enrolments_enquiry_tenant 
            FOREIGN KEY (tenant_id, enquiry_id) REFERENCES public.enquiries(tenant_id, id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_status ON public.enrolments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_student ON public.enrolments(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_cohort ON public.enrolments(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_programme ON public.enrolments(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_invoice_id ON public.enrolments(invoice_id);

-- -----------------------------------------------------------------------------
-- 7. CREATE TRAINING SESSIONS TABLE (PHASE 3 MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_sessions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    facilitator_id TEXT NOT NULL,
    session_number INT NOT NULL CHECK (session_number > 0),
    session_title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    delivery_mode TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    location TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_training_sessions_tenant_number UNIQUE (tenant_id, cohort_id, session_number),
    CONSTRAINT uq_training_sessions_tenant_cohort UNIQUE (tenant_id, id, cohort_id),
    CONSTRAINT fk_training_sessions_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_training_sessions_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_training_session_times CHECK (
        end_time IS NULL OR start_time IS NULL OR end_time > start_time
    )
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_cohort ON public.training_sessions(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_facilitator ON public.training_sessions(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_date ON public.training_sessions(tenant_id, session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_status ON public.training_sessions(tenant_id, status);

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_sessions' AND policyname = 'training_sessions_tenant_select') THEN
        CREATE POLICY "training_sessions_tenant_select" ON public.training_sessions FOR SELECT TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR facilitator_id IN (
                        SELECT id FROM public.personnel
                        WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_sessions' AND policyname = 'training_sessions_staff_insert') THEN
        CREATE POLICY "training_sessions_staff_insert" ON public.training_sessions FOR INSERT TO authenticated
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_sessions' AND policyname = 'training_sessions_staff_update') THEN
        CREATE POLICY "training_sessions_staff_update" ON public.training_sessions FOR UPDATE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()))
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_sessions' AND policyname = 'training_sessions_admin_delete') THEN
        CREATE POLICY "training_sessions_admin_delete" ON public.training_sessions FOR DELETE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. CREATE ATTENDANCE TABLE (PHASE 3 MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    enrolment_id TEXT NOT NULL,
    attendance_status TEXT NOT NULL CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
    check_in_at TIMESTAMPTZ,
    check_out_at TIMESTAMPTZ,
    facilitator_note TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_attendance_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_attendance_session_enrolment UNIQUE (tenant_id, session_id, enrolment_id),
    CONSTRAINT fk_attendance_session_cohort FOREIGN KEY (tenant_id, session_id, cohort_id)
        REFERENCES public.training_sessions(tenant_id, id, cohort_id) ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_enrolment_cohort FOREIGN KEY (tenant_id, enrolment_id, cohort_id)
        REFERENCES public.enrolments(tenant_id, id, cohort_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_cohort ON public.attendance(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_session ON public.attendance(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_enrolment ON public.attendance(tenant_id, enrolment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_status ON public.attendance(tenant_id, attendance_status);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'attendance_tenant_select') THEN
        CREATE POLICY "attendance_tenant_select" ON public.attendance FOR SELECT TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR cohort_id IN (
                        SELECT id FROM public.cohorts
                        WHERE lead_facilitator_id IN (
                            SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                        )
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'attendance_staff_insert') THEN
        CREATE POLICY "attendance_staff_insert" ON public.attendance FOR INSERT TO authenticated
            WITH CHECK (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR cohort_id IN (
                        SELECT id FROM public.cohorts
                        WHERE lead_facilitator_id IN (
                            SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                        )
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'attendance_staff_update') THEN
        CREATE POLICY "attendance_staff_update" ON public.attendance FOR UPDATE TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR cohort_id IN (
                        SELECT id FROM public.cohorts
                        WHERE lead_facilitator_id IN (
                            SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                        )
                    )
                )
            )
            WITH CHECK (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR cohort_id IN (
                        SELECT id FROM public.cohorts
                        WHERE lead_facilitator_id IN (
                            SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                        )
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'attendance_admin_delete') THEN
        CREATE POLICY "attendance_admin_delete" ON public.attendance FOR DELETE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 9. CREATE FACILITATOR REPORTS TABLE (PHASE 3 MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facilitator_reports (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    session_id TEXT,
    facilitator_id TEXT NOT NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_summary TEXT NOT NULL,
    topics_covered TEXT NOT NULL,
    attendance_observations TEXT,
    student_participation_notes TEXT,
    issues_encountered TEXT,
    follow_up_recommendations TEXT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'REVIEWED')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facilitator_reports_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_facilitator_reports_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_facilitator_reports_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_facilitator_reports_session_cohort FOREIGN KEY (tenant_id, session_id, cohort_id)
        REFERENCES public.training_sessions(tenant_id, id, cohort_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_cohort ON public.facilitator_reports(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_facilitator ON public.facilitator_reports(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_session ON public.facilitator_reports(tenant_id, session_id);

ALTER TABLE public.facilitator_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facilitator_reports' AND policyname = 'facilitator_reports_tenant_select') THEN
        CREATE POLICY "facilitator_reports_tenant_select" ON public.facilitator_reports FOR SELECT TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR facilitator_id IN (
                        SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facilitator_reports' AND policyname = 'facilitator_reports_facilitator_insert') THEN
        CREATE POLICY "facilitator_reports_facilitator_insert" ON public.facilitator_reports FOR INSERT TO authenticated
            WITH CHECK (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR facilitator_id IN (
                        SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facilitator_reports' AND policyname = 'facilitator_reports_facilitator_update') THEN
        CREATE POLICY "facilitator_reports_facilitator_update" ON public.facilitator_reports FOR UPDATE TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR facilitator_id IN (
                        SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            )
            WITH CHECK (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR facilitator_id IN (
                        SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facilitator_reports' AND policyname = 'facilitator_reports_admin_delete') THEN
        CREATE POLICY "facilitator_reports_admin_delete" ON public.facilitator_reports FOR DELETE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 10. CREATE CERTIFICATES TABLE (PHASE 4 MODEL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    student_id TEXT NOT NULL,
    enrolment_id TEXT NOT NULL,
    programme_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    certificate_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'REVOKED')),
    issued_by UUID REFERENCES auth.users(id),
    verification_token TEXT NOT NULL,
    student_name_snapshot TEXT NOT NULL,
    programme_name_snapshot TEXT NOT NULL,
    programme_code_snapshot TEXT NOT NULL,
    cohort_name_snapshot TEXT NOT NULL,
    cohort_code_snapshot TEXT NOT NULL,
    attendance_pct_snapshot NUMERIC(5,2) CHECK (attendance_pct_snapshot IS NULL OR (attendance_pct_snapshot >= 0 AND attendance_pct_snapshot <= 100)),
    revocation_reason TEXT,
    revoked_by UUID REFERENCES auth.users(id),
    revoked_at TIMESTAMPTZ,
    reissued_from_certificate_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_certificates_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_certificates_tenant_number UNIQUE (tenant_id, certificate_number),
    CONSTRAINT uq_certificates_tenant_token UNIQUE (tenant_id, verification_token),
    CONSTRAINT fk_certificates_tenant_student FOREIGN KEY (tenant_id, student_id)
        REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_enrolment FOREIGN KEY (tenant_id, enrolment_id)
        REFERENCES public.enrolments(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_programme FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_enrolment_cohort FOREIGN KEY (tenant_id, enrolment_id, cohort_id)
        REFERENCES public.enrolments(tenant_id, id, cohort_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_certificate_per_enrolment 
    ON public.certificates(tenant_id, enrolment_id) 
    WHERE status = 'ISSUED';

CREATE INDEX IF NOT EXISTS idx_certificates_tenant_status ON public.certificates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_student ON public.certificates(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_cohort ON public.certificates(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_token ON public.certificates(tenant_id, verification_token);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'certificates_tenant_select') THEN
        CREATE POLICY "certificates_tenant_select" ON public.certificates FOR SELECT TO authenticated
            USING (
                tenant_id = public.get_auth_tenant_id()
                AND (
                    public.is_staff()
                    OR public.can_manage_finance()
                    OR student_id IN (
                        SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()
                    )
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'certificates_admin_insert') THEN
        CREATE POLICY "certificates_admin_insert" ON public.certificates FOR INSERT TO authenticated
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'certificates_admin_update') THEN
        CREATE POLICY "certificates_admin_update" ON public.certificates FOR UPDATE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()))
            WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'certificates_admin_delete') THEN
        CREATE POLICY "certificates_admin_delete" ON public.certificates FOR DELETE TO authenticated
            USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 11. TRIGGER FUNCTIONS & PROCEDURAL CONTROLS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_cohort_capacity_before_enrolment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_current_count INTEGER;
BEGIN
    SELECT capacity INTO v_capacity FROM public.cohorts
    WHERE tenant_id = NEW.tenant_id AND id = NEW.cohort_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cohort % does not exist in tenant %', NEW.cohort_id, NEW.tenant_id;
    END IF;

    IF NEW.status IN ('CONFIRMED', 'ACTIVE') THEN
        SELECT COUNT(*) INTO v_current_count FROM public.enrolments
        WHERE tenant_id = NEW.tenant_id AND cohort_id = NEW.cohort_id
          AND status IN ('CONFIRMED', 'ACTIVE') AND id <> COALESCE(NEW.id, 'NEW_RECORD');

        IF v_current_count >= v_capacity THEN
            RAISE EXCEPTION 'COHORT_CAPACITY_EXCEEDED: Cohort % has reached maximum capacity of %', NEW.cohort_id, v_capacity;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_cohort_capacity_before_enrolment() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS trg_check_cohort_capacity ON public.enrolments;
CREATE TRIGGER trg_check_cohort_capacity
    BEFORE INSERT OR UPDATE OF cohort_id, status ON public.enrolments
    FOR EACH ROW
    EXECUTE FUNCTION public.check_cohort_capacity_before_enrolment();

CREATE OR REPLACE FUNCTION public.check_session_status_before_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_status TEXT;
BEGIN
    SELECT status INTO v_session_status FROM public.training_sessions
    WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training session % does not exist in tenant %', NEW.session_id, NEW.tenant_id;
    END IF;

    IF v_session_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'CANCELLED_SESSION_ATTENDANCE_PROHIBITED: Cannot record attendance for cancelled session %', NEW.session_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_session_status_before_attendance() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS trg_check_session_status_before_attendance ON public.attendance;
CREATE TRIGGER trg_check_session_status_before_attendance
    BEFORE INSERT OR UPDATE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.check_session_status_before_attendance();

CREATE OR REPLACE FUNCTION public.validate_completion_verifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role TEXT;
    v_user_tenant UUID;
BEGIN
    IF NEW.completion_status = 'VERIFIED' AND (OLD.completion_status IS NULL OR OLD.completion_status <> 'VERIFIED') THEN
        IF NEW.completion_verified_by IS NULL THEN
            RAISE EXCEPTION 'COMPLETION_VERIFIER_REQUIRED: completion_verified_by UUID must be recorded';
        END IF;

        SELECT role, tenant_id INTO v_user_role, v_user_tenant
        FROM public.tenant_memberships
        WHERE user_id = NEW.completion_verified_by AND tenant_id = NEW.tenant_id AND status = 'active';

        IF NOT FOUND OR v_user_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'STAFF') THEN
            RAISE EXCEPTION 'UNAUTHORIZED_COMPLETION_VERIFIER: Only active administrative personnel can verify completion';
        END IF;

        NEW.completion_verified_at := COALESCE(NEW.completion_verified_at, NOW());
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_completion_verifier() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS trg_validate_completion_verifier ON public.enrolments;
CREATE TRIGGER trg_validate_completion_verifier
    BEFORE INSERT OR UPDATE OF completion_status ON public.enrolments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_completion_verifier();

CREATE OR REPLACE FUNCTION public.validate_certificate_eligibility_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enrolment_status TEXT;
    v_completion_status TEXT;
    v_enrolment_tenant UUID;
    v_issuer_role TEXT;
    v_auth_uid UUID;
BEGIN
    SELECT status, completion_status, tenant_id
    INTO v_enrolment_status, v_completion_status, v_enrolment_tenant
    FROM public.enrolments
    WHERE id = NEW.enrolment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ENROLMENT_NOT_FOUND: Enrolment % does not exist', NEW.enrolment_id;
    END IF;

    IF v_enrolment_tenant <> NEW.tenant_id THEN
        RAISE EXCEPTION 'TENANT_MISMATCH: Certificate tenant does not match enrolment tenant';
    END IF;

    IF v_enrolment_status <> 'COMPLETED' OR v_completion_status <> 'VERIFIED' THEN
        RAISE EXCEPTION 'INELIGIBLE_CERTIFICATE_ISSUANCE: Enrolment % is not COMPLETED + VERIFIED', NEW.enrolment_id;
    END IF;

    v_auth_uid := auth.uid();
    IF v_auth_uid IS NOT NULL THEN
        SELECT role INTO v_issuer_role
        FROM public.tenant_memberships
        WHERE user_id = v_auth_uid AND tenant_id = NEW.tenant_id AND status = 'active';

        IF v_issuer_role IS NULL OR v_issuer_role NOT IN ('SUPER_ADMIN', 'STAFF', 'FINANCE_MANAGER') THEN
            RAISE EXCEPTION 'UNAUTHORIZED_ISSUER: Only authorized administrative personnel can issue Certificates of Completion';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_certificate_eligibility_before_insert() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS trg_validate_certificate_eligibility ON public.certificates;
CREATE TRIGGER trg_validate_certificate_eligibility
    BEFORE INSERT ON public.certificates
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_certificate_eligibility_before_insert();

CREATE OR REPLACE FUNCTION public.prevent_certificate_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'REVOKED' THEN
        RAISE EXCEPTION 'MUTATION_PROHIBITED: Revoked certificate % is permanently frozen', OLD.certificate_number;
    END IF;

    IF NEW.status = 'REVOKED' AND OLD.status <> 'REVOKED' THEN
        IF NEW.revocation_reason IS NULL OR LENGTH(TRIM(NEW.revocation_reason)) = 0 THEN
            RAISE EXCEPTION 'REVOCATION_REASON_REQUIRED: A non-empty revocation reason must be provided';
        END IF;
        NEW.revoked_at := COALESCE(NEW.revoked_at, NOW());
        NEW.revoked_by := COALESCE(NEW.revoked_by, auth.uid());
        RETURN NEW;
    END IF;

    IF OLD.status = 'ISSUED' THEN
        IF (NEW.student_name_snapshot <> OLD.student_name_snapshot) OR
           (NEW.programme_name_snapshot <> OLD.programme_name_snapshot) OR
           (NEW.programme_code_snapshot <> OLD.programme_code_snapshot) OR
           (NEW.cohort_name_snapshot <> OLD.cohort_name_snapshot) OR
           (NEW.cohort_code_snapshot <> OLD.cohort_code_snapshot) OR
           (NEW.issue_date <> OLD.issue_date) OR
           (NEW.completion_date <> OLD.completion_date) OR
           (NEW.verification_token <> OLD.verification_token) OR
           (NEW.certificate_number <> OLD.certificate_number) OR
           (NEW.enrolment_id <> OLD.enrolment_id) OR
           (NEW.student_id <> OLD.student_id) OR
           (NEW.programme_id <> OLD.programme_id) OR
           (NEW.cohort_id <> OLD.cohort_id) OR
           (NEW.tenant_id <> OLD.tenant_id) THEN
            RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE: Issued certificate attributes and snapshots cannot be altered. Revoke and reissue instead.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_certificate_mutation() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS trg_prevent_certificate_mutation ON public.certificates;
CREATE TRIGGER trg_prevent_certificate_mutation
    BEFORE UPDATE ON public.certificates
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_certificate_mutation();

-- -----------------------------------------------------------------------------
-- 12. PUBLIC RPC: VERIFY CERTIFICATE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_certificate_public(
    p_cert_number TEXT,
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cert RECORD;
BEGIN
    SELECT 
        certificate_number,
        status,
        student_name_snapshot,
        programme_name_snapshot,
        programme_code_snapshot,
        cohort_name_snapshot,
        cohort_code_snapshot,
        issue_date,
        completion_date,
        attendance_pct_snapshot,
        revocation_reason,
        revoked_at
    INTO v_cert
    FROM public.certificates
    WHERE certificate_number = TRIM(p_cert_number)
      AND verification_token = TRIM(p_token);

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'CERTIFICATE_NOT_FOUND_OR_TOKEN_MISMATCH'
        );
    END IF;

    IF v_cert.status = 'REVOKED' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'REVOKED',
            'certificate_number', v_cert.certificate_number,
            'revocation_reason', v_cert.revocation_reason,
            'revoked_at', v_cert.revoked_at
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'status', v_cert.status,
        'certificate_number', v_cert.certificate_number,
        'student_name', v_cert.student_name_snapshot,
        'programme_name', v_cert.programme_name_snapshot,
        'programme_code', v_cert.programme_code_snapshot,
        'cohort_name', v_cert.cohort_name_snapshot,
        'cohort_code', v_cert.cohort_code_snapshot,
        'issue_date', v_cert.issue_date,
        'completion_date', v_cert.completion_date,
        'attendance_percentage', v_cert.attendance_pct_snapshot
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate_public(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT, TEXT) TO anon, authenticated;

COMMIT;
