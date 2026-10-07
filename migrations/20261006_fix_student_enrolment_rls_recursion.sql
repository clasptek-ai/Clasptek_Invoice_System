-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM
-- MIGRATION: 20261006_fix_student_enrolment_rls_recursion.sql
-- Description: Break mutual RLS recursion between students and enrolments tables
--              while strictly preserving multi-tenant isolation, facilitator scoping,
--              and existing role-specific authorization contracts.
--
-- Security Invariants Preserved:
-- 1. Multi-Tenant Isolation: Every helper function enforces tenant_id = public.get_auth_tenant_id().
-- 2. Anti-Spoofing: Helpers accept ZERO caller-supplied user or tenant arguments.
--    Identity is derived strictly from auth.uid() and auth.jwt()->>'email'.
-- 3. Hardened Search Path: All functions specify `SET search_path = pg_catalog, public`.
-- 4. Scope-Constrained: Leaves global is_staff() untouched to prevent unapproved side-effects
--    across unrelated subsystems (finance, expenses, audit, CRM, certificates).
-- 5. Facilitator Scoping: Facilitators can only view students and enrolments in their assigned cohorts.
-- 6. Student Self-Access: Students can only view their own student record and enrolments.
-- 7. Administrative Authority: Super Admin and Finance Manager retain full tenant read access.
-- 8. Zero Recursion: Functions execute as SECURITY DEFINER owned by postgres, bypassing RLS
--    expansion on internal lookup tables and eliminating mutual policy recursion.
-- 9. Existing INSERT, UPDATE, and DELETE policies remain completely untouched.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HELPER: get_auth_student_ids()
-- Returns student IDs belonging to the authenticated user within their active tenant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_student_ids()
RETURNS TABLE (student_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT s.id
    FROM public.students s
    WHERE s.tenant_id = public.get_auth_tenant_id()
      AND (
          s.user_id = auth.uid()
          OR (s.email IS NOT NULL AND s.email = (auth.jwt()->>'email'))
      );
$$;

REVOKE ALL ON FUNCTION public.get_auth_student_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_student_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. HELPER: get_facilitator_assigned_cohort_ids()
-- Returns cohort IDs assigned to the authenticated user (lead facilitator or session facilitator).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_facilitator_assigned_cohort_ids()
RETURNS TABLE (cohort_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT c.id
    FROM public.cohorts c
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
      );
$$;

REVOKE ALL ON FUNCTION public.get_facilitator_assigned_cohort_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_facilitator_assigned_cohort_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. HELPER: get_facilitator_cohort_student_ids()
-- Returns student IDs enrolled in cohorts assigned to the authenticated facilitator.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_facilitator_cohort_student_ids()
RETURNS TABLE (student_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT e.student_id
    FROM public.enrolments e
    WHERE e.tenant_id = public.get_auth_tenant_id()
      AND e.cohort_id IN (SELECT cohort_id FROM public.get_facilitator_assigned_cohort_ids());
$$;

REVOKE ALL ON FUNCTION public.get_facilitator_cohort_student_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_facilitator_cohort_student_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. RECREATE POLICY: students_tenant_select
-- Resolves facilitator students via SECURITY DEFINER helper to prevent calling enrolments RLS.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_tenant_select" ON public.students;

CREATE POLICY "students_tenant_select" ON public.students FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR public.is_staff()
            OR id IN (SELECT student_id FROM public.get_facilitator_cohort_student_ids())
            OR (email IS NOT NULL AND email = (auth.jwt()->>'email'))
            OR user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 5. RECREATE POLICY: enrolments_tenant_select
-- Resolves student IDs and facilitator cohorts via SECURITY DEFINER helpers to prevent calling students RLS.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "enrolments_tenant_select" ON public.enrolments;

CREATE POLICY "enrolments_tenant_select" ON public.enrolments FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND (
            public.can_manage_finance()
            OR public.is_staff()
            OR cohort_id IN (SELECT cohort_id FROM public.get_facilitator_assigned_cohort_ids())
            OR student_id IN (SELECT student_id FROM public.get_auth_student_ids())
        )
    );

-- -----------------------------------------------------------------------------
-- 6. RECREATE POLICY: meetings_student_select
-- Utilizes get_auth_student_ids() to safely scope student meeting queries without recursion.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "meetings_student_select" ON public.meetings;

CREATE POLICY "meetings_student_select" ON public.meetings FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id()
        AND deleted_at IS NULL
        AND cohort_id IN (
            SELECT e.cohort_id FROM public.enrolments e
            WHERE e.tenant_id = public.get_auth_tenant_id()
              AND e.status NOT IN ('CANCELLED', 'WITHDRAWN')
              AND e.student_id IN (SELECT student_id FROM public.get_auth_student_ids())
        )
    );

COMMIT;
