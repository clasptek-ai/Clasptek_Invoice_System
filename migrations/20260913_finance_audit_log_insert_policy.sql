-- =============================================================================
-- Migration: 20260913_finance_audit_log_insert_policy.sql
-- Description: Implement Authoritative Tenant-Isolated INSERT Policy on finance_audit_log
-- Security Standard: CLASPTEK Production Security Model
-- =============================================================================

BEGIN;

-- 1. Verify and enforce Row-Level Security
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policy if present for clean idempotency
DROP POLICY IF EXISTS "audit_log_staff_insert" ON public.finance_audit_log;

-- 3. Authoritative INSERT policy:
-- - Target Role: authenticated
-- - Tenant Isolation: Strictly matches public.get_auth_tenant_id()
-- - Role Gate: Requires active staff or finance manager membership
-- - Actor Identity: actor_id must either be null or match auth.uid()
CREATE POLICY "audit_log_staff_insert" ON public.finance_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id()
        AND (public.is_staff() OR public.can_manage_finance())
        AND (actor_id IS NULL OR actor_id = auth.uid())
    );

-- 4. Verify trigger immutability remains in place
-- (trg_audit_immutability rejects UPDATE and DELETE on finance_audit_log)

-- 5. Notify PostgREST schema cache to reload immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
