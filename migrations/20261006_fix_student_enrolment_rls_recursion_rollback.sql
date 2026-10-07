-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM
-- MIGRATION ROLLBACK: 20261006_fix_student_enrolment_rls_recursion_rollback.sql
-- Description: Reverts 20261006_fix_student_enrolment_rls_recursion.sql
--              Restores exact previous policy definitions from 20261005_phase1_security_containment.sql
--              and 20261006_meetings_persistence_phase2.sql, and drops all helper functions.
-- =============================================================================

BEGIN;

-- 1. Restore exact original meetings_student_select policy
DROP POLICY IF EXISTS "meetings_student_select" ON public.meetings;
CREATE POLICY "meetings_student_select" ON public.meetings FOR SELECT TO authenticated
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

-- 2. Restore exact original enrolments_tenant_select policy
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

-- 3. Restore exact original students_tenant_select policy
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

-- 4. Drop all created helper functions
DROP FUNCTION IF EXISTS public.get_facilitator_cohort_student_ids();
DROP FUNCTION IF EXISTS public.get_facilitator_assigned_cohort_ids();
DROP FUNCTION IF EXISTS public.get_auth_student_ids();

COMMIT;
