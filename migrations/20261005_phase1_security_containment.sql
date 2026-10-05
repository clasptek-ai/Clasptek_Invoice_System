-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM
-- MIGRATION: 20261005_phase1_security_containment.sql
-- Description: Phase 1 Security Containment — Staff & Facilitator Authorization Hardening
--
-- Security Invariants Enforced:
-- 1. Tenant Isolation + Role Authorization + Facilitator Cohort/Session Scoping.
-- 2. Facilitators only receive learners, enrolments, attendance, and sessions for their assigned cohorts.
-- 3. General Staff cannot correct historical attendance, manage cohorts, or sign off reports.
-- 4. Historical attendance corrections restricted strictly to Administrative roles.
-- 5. Facilitator reports review and sign-off restricted strictly to Administrative roles.
-- 6. Meeting creation, scheduling, and deletion restricted strictly to Administrative roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN STUDENTS TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_tenant_select" ON public.students;

CREATE POLICY "students_tenant_select" ON public.students FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR public.is_staff()
            OR id IN (
                SELECT e.student_id FROM public.enrolments e
                JOIN public.cohorts c ON c.id = e.cohort_id AND c.tenant_id = e.tenant_id
                WHERE e.tenant_id = public.get_auth_tenant_id()
                AND (
                    c.lead_facilitator_id IN (
                        SELECT p.id FROM public.personnel p
                        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                    )
                    OR c.id IN (
                        SELECT ts.cohort_id FROM public.training_sessions ts
                        WHERE ts.facilitator_id IN (
                            SELECT p.id FROM public.personnel p
                            WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                        )
                        AND ts.tenant_id = public.get_auth_tenant_id()
                    )
                )
            )
            OR email = (auth.jwt()->>'email')
        )
    );

-- -----------------------------------------------------------------------------
-- 2. HARDEN COHORTS TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cohorts_tenant_select" ON public.cohorts;

CREATE POLICY "cohorts_tenant_select" ON public.cohorts FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR public.is_staff()
            OR lead_facilitator_id IN (
                SELECT p.id FROM public.personnel p
                WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
            )
            OR id IN (
                SELECT ts.cohort_id FROM public.training_sessions ts
                WHERE ts.facilitator_id IN (
                    SELECT p.id FROM public.personnel p
                    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                )
                AND ts.tenant_id = public.get_auth_tenant_id()
            )
        )
    );

-- Ensure only Admin can insert or update cohorts
DROP POLICY IF EXISTS "cohorts_staff_insert" ON public.cohorts;
DROP POLICY IF EXISTS "cohorts_staff_update" ON public.cohorts;

CREATE POLICY "cohorts_admin_insert" ON public.cohorts FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "cohorts_admin_update" ON public.cohorts FOR UPDATE TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

-- -----------------------------------------------------------------------------
-- 3. HARDEN ENROLMENTS TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "enrolments_tenant_select" ON public.enrolments;

CREATE POLICY "enrolments_tenant_select" ON public.enrolments FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR public.is_staff()
            OR cohort_id IN (
                SELECT c.id FROM public.cohorts c
                WHERE c.tenant_id = public.get_auth_tenant_id()
                AND (
                    c.lead_facilitator_id IN (
                        SELECT p.id FROM public.personnel p
                        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                    )
                    OR c.id IN (
                        SELECT ts.cohort_id FROM public.training_sessions ts
                        WHERE ts.facilitator_id IN (
                            SELECT p.id FROM public.personnel p
                            WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                        )
                        AND ts.tenant_id = public.get_auth_tenant_id()
                    )
                )
            )
            OR student_id IN (
                SELECT s.id FROM public.students s
                WHERE s.tenant_id = public.get_auth_tenant_id()
                AND s.email = (auth.jwt()->>'email')
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 4. HARDEN ATTENDANCE TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "attendance_tenant_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_staff_insert" ON public.attendance;
DROP POLICY IF EXISTS "attendance_staff_update" ON public.attendance;

-- Select policy: Admin or assigned Facilitator
CREATE POLICY "attendance_tenant_select" ON public.attendance FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR cohort_id IN (
                SELECT c.id FROM public.cohorts c
                WHERE c.tenant_id = public.get_auth_tenant_id()
                AND (
                    c.lead_facilitator_id IN (
                        SELECT p.id FROM public.personnel p
                        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                    )
                    OR c.id IN (
                        SELECT ts.cohort_id FROM public.training_sessions ts
                        WHERE ts.facilitator_id IN (
                            SELECT p.id FROM public.personnel p
                            WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                        )
                        AND ts.tenant_id = public.get_auth_tenant_id()
                    )
                )
            )
        )
    );

-- Insert policy: Admin or assigned Facilitator
CREATE POLICY "attendance_facilitator_insert" ON public.attendance FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR cohort_id IN (
                SELECT c.id FROM public.cohorts c
                WHERE c.tenant_id = public.get_auth_tenant_id()
                AND (
                    c.lead_facilitator_id IN (
                        SELECT p.id FROM public.personnel p
                        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                    )
                    OR c.id IN (
                        SELECT ts.cohort_id FROM public.training_sessions ts
                        WHERE ts.facilitator_id IN (
                            SELECT p.id FROM public.personnel p
                            WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                        )
                        AND ts.tenant_id = public.get_auth_tenant_id()
                    )
                )
            )
        )
    );

-- Update policy: Strictly Administrative correction authority
CREATE POLICY "attendance_admin_correction_update" ON public.attendance FOR UPDATE TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

-- -----------------------------------------------------------------------------
-- 5. HARDEN FACILITATOR REPORTS TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "facilitator_reports_tenant_select" ON public.facilitator_reports;
DROP POLICY IF EXISTS "facilitator_reports_facilitator_insert" ON public.facilitator_reports;
DROP POLICY IF EXISTS "facilitator_reports_facilitator_update" ON public.facilitator_reports;

-- Select policy: Admin or report author
CREATE POLICY "facilitator_reports_scoped_select" ON public.facilitator_reports FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR facilitator_id IN (
                SELECT p.id FROM public.personnel p
                WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
            )
        )
    );

-- Insert policy: Facilitator can only insert for their own personnel ID
CREATE POLICY "facilitator_reports_scoped_insert" ON public.facilitator_reports FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR (
                facilitator_id IN (
                    SELECT p.id FROM public.personnel p
                    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                )
                AND (status IS NULL OR status IN ('DRAFT', 'SUBMITTED'))
            )
        )
    );

-- Update policy: Facilitator can only edit DRAFT/SUBMITTED reports; Admin can review and sign off
CREATE POLICY "facilitator_reports_scoped_update" ON public.facilitator_reports FOR UPDATE TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR (
                facilitator_id IN (
                    SELECT p.id FROM public.personnel p
                    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                )
                AND status IN ('DRAFT', 'SUBMITTED')
            )
        )
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR (
                facilitator_id IN (
                    SELECT p.id FROM public.personnel p
                    WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                )
                AND status IN ('DRAFT', 'SUBMITTED')
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 6. HARDEN MEETINGS TABLE RLS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "meetings_tenant_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_admin_all" ON public.meetings;

CREATE POLICY "meetings_scoped_select" ON public.meetings FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR facilitator_id IN (
                SELECT p.id FROM public.personnel p
                WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
            )
            OR cohort_id IN (
                SELECT c.id FROM public.cohorts c
                WHERE c.tenant_id = public.get_auth_tenant_id()
                AND (
                    c.lead_facilitator_id IN (
                        SELECT p.id FROM public.personnel p
                        WHERE p.user_id = auth.uid() AND p.tenant_id = public.get_auth_tenant_id()
                    )
                    OR c.id IN (
                        SELECT e.cohort_id FROM public.enrolments e
                        WHERE e.tenant_id = public.get_auth_tenant_id()
                        AND e.student_id IN (
                            SELECT s.id FROM public.students s
                            WHERE s.tenant_id = public.get_auth_tenant_id()
                            AND s.email = (auth.jwt()->>'email')
                        )
                    )
                )
            )
        )
    );

CREATE POLICY "meetings_admin_management" ON public.meetings FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
