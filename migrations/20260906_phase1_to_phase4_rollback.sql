-- =============================================================================
-- CLASPTEK ENTERPRISE PRODUCTION DATABASE ROLLBACK SCRIPT
-- Target: Rollback Phase 1 through Phase 4 Schema Reconciliation
-- Target Database: PostgreSQL / Supabase Production (logaawoigfxnisimfatf)
-- Safe, Non-Destructive to Core Financial Tables
-- =============================================================================

BEGIN;

-- 1. Remove Triggers & Functions
DROP TRIGGER IF EXISTS trg_prevent_certificate_mutation ON public.certificates;
DROP TRIGGER IF EXISTS trg_validate_certificate_eligibility ON public.certificates;
DROP TRIGGER IF EXISTS trg_validate_completion_verifier ON public.enrolments;
DROP TRIGGER IF EXISTS trg_check_session_status_before_attendance ON public.attendance;
DROP TRIGGER IF EXISTS trg_check_cohort_capacity ON public.enrolments;

DROP FUNCTION IF EXISTS public.verify_certificate_public(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.prevent_certificate_mutation();
DROP FUNCTION IF EXISTS public.validate_certificate_eligibility_before_insert();
DROP FUNCTION IF EXISTS public.validate_completion_verifier();
DROP FUNCTION IF EXISTS public.check_session_status_before_attendance();
DROP FUNCTION IF EXISTS public.check_cohort_capacity_before_enrolment();

-- 2. Drop Phase 1-4 Tables (Reverse Dependency Order)
DROP TABLE IF EXISTS public.certificates;
DROP TABLE IF EXISTS public.facilitator_reports;
DROP TABLE IF EXISTS public.attendance;
DROP TABLE IF EXISTS public.training_sessions;

-- 3. Remove Added Foreign Keys & Columns from Enrolments
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_student_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_programme_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_cohort_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_cohort_prog_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_invoice_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_customer_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS fk_enrolments_enquiry_tenant;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS uq_enrolments_student_cohort;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS uq_enrolments_tenant_cohort;
ALTER TABLE public.enrolments DROP CONSTRAINT IF EXISTS uq_enrolments_tenant_number;

DROP TABLE IF EXISTS public.cohorts;
DROP TABLE IF EXISTS public.students;

COMMIT;
