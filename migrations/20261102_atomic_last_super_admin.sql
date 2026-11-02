-- ==============================================================================
-- Clasptek Invoice System — Database Migration
-- Phase C220: People & Access Security Defect Remediation
-- Migration: 20261102_atomic_last_super_admin.sql
-- Status: LOCAL REPOSITORY ONLY — UNAPPLIED PENDING AUTHORIZED REMOTE EXECUTION
-- Description: Hardened Atomic Last-Super-Admin Protection and Concurrency Guard (Fix 3)
-- Addressing: DEF-C219-01 (SQL syntax & advisory locks), DEF-C219-02 (RPC authorization),
--             DEF-C219-06 (Decouple portal access from HR employment status)
-- ==============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID);

/**
 * public.demote_or_suspend_super_admin
 *
 * Atomically guards against TOCTOU race conditions when demoting, suspending,
 * or revoking access for a Super Admin.
 *
 * Concurrency & Serialization Design (DEF-C219-01):
 *   - Uses transaction-scoped advisory locks (pg_advisory_xact_lock) derived from
 *     the tenant UUID to strictly serialize all concurrent Super Admin governance
 *     operations within the same tenant.
 *   - Eliminates invalid `FOR UPDATE` on aggregate functions.
 *   - Rechecks active Super Admin count under transaction lock.
 *   - Prevents demoting, suspending, or revoking the final active Super Admin.
 *   - Enforces self-demotion and self-suspension protection.
 *
 * Security & Authorization Design (DEF-C219-02):
 *   - SECURITY DEFINER function with explicit `search_path = public, auth, pg_temp`.
 *   - Derives caller identity authoritatively from `auth.uid()`; does not trust client actor IDs.
 *   - Verifies the authenticated caller has active SUPER_ADMIN role in the target tenant.
 *   - System/service_role callers permitted when running from internal maintenance scripts.
 *   - Execution revoked from PUBLIC; granted only to authenticated users and service_role.
 *
 * Domain Boundary Protection (DEF-C219-06):
 *   - Revoking access suspends tenant membership and profile access; does NOT alter
 *     HR/payroll employment status in public.personnel.
 *
 * Parameters:
 *   p_tenant_id - Authoritative tenant UUID
 *   p_user_id   - Target user UUID being modified
 *   p_action    - Action type: 'change-role', 'suspend', 'deactivate', or 'revoke-access'
 *   p_new_role  - New role if action is 'change-role' (e.g. 'STAFF', 'FINANCE_MANAGER')
 *   p_actor_id  - Optional requesting actor UUID (validated against auth.uid())
 *
 * Returns: JSONB object with success status and details.
 */
CREATE OR REPLACE FUNCTION public.demote_or_suspend_super_admin(
  p_tenant_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_new_role TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_active_super_admins INT;
  v_target_is_super_admin BOOLEAN := FALSE;
  v_target_current_status TEXT;
  v_target_current_role TEXT;
  v_audit_id TEXT;
  v_actor_role TEXT := 'SUPER_ADMIN';
  v_target_name TEXT := 'User';
  v_lock_key BIGINT;
BEGIN
  -- 1. Derive and authenticate caller identity (DEF-C219-02)
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    -- Check if executing under privileged internal role (e.g., service_role or database admin)
    IF CURRENT_USER IN ('postgres', 'service_role', 'supabase_admin') THEN
      v_caller_id := COALESCE(p_actor_id, p_user_id);
    ELSE
      RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be an authenticated Supabase user.'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    -- Verify client-supplied actor ID matches authenticated caller if supplied
    IF p_actor_id IS NOT NULL AND p_actor_id != v_caller_id THEN
      RAISE EXCEPTION 'FORGED_ACTOR_IDENTITY: Client actor ID does not match authenticated session identity.'
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  -- 2. Validate caller authorization in target tenant (DEF-C219-02)
  IF CURRENT_USER NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = p_tenant_id
        AND user_id = v_caller_id
        AND role = 'SUPER_ADMIN'
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Caller % is not an active Super Admin in tenant %.', v_caller_id, p_tenant_id
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- 3. Obtain tenant-scoped transaction lock for serialization (DEF-C219-01)
  -- 64-bit collision-resistant key derived from tenant UUID namespace
  v_lock_key := ('x' || substr(md5('tenant_super_admin_governance:' || p_tenant_id::TEXT), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 4. Recheck active Super Admin count under serialized tenant lock (DEF-C219-01)
  SELECT count(*)
  INTO v_active_super_admins
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND role = 'SUPER_ADMIN'
    AND status = 'active';

  -- 5. Inspect target user membership within the specified tenant
  SELECT role, status
  INTO v_target_current_role, v_target_current_status
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: User % is not a member of tenant %', p_user_id, p_tenant_id
      USING ERRCODE = 'P0006';
  END IF;

  v_target_is_super_admin := (v_target_current_role = 'SUPER_ADMIN' AND v_target_current_status = 'active');

  -- 6. Self-demotion / Self-suspension protection (DEF-C219-01)
  IF p_user_id = v_caller_id THEN
    IF (p_action = 'change-role' AND (p_new_role IS NULL OR p_new_role != 'SUPER_ADMIN'))
       OR (p_action IN ('suspend', 'deactivate', 'revoke-access')) THEN
      RAISE EXCEPTION 'CANNOT_DEMOTE_SELF: Cannot demote, suspend, or revoke access for your own Super Admin account.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 7. Last Super Admin protection invariant (DEF-C219-01)
  IF v_target_is_super_admin THEN
    IF (p_action = 'change-role' AND (p_new_role IS NULL OR p_new_role != 'SUPER_ADMIN'))
       OR (p_action IN ('suspend', 'deactivate', 'revoke-access')) THEN
      IF v_active_super_admins <= 1 THEN
        RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN: Operation rejected. Tenant % must maintain at least one active Super Admin.', p_tenant_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 8. Execute atomic mutation
  IF p_action = 'change-role' THEN
    IF p_new_role IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_new_role cannot be null for change-role action'
        USING ERRCODE = 'P0007';
    END IF;

    UPDATE public.tenant_memberships
    SET role = p_new_role,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id;

    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_user_id;

  ELSIF p_action IN ('suspend', 'deactivate') THEN
    UPDATE public.tenant_memberships
    SET status = 'suspended',
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id;

    UPDATE public.profiles
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id;

  ELSIF p_action = 'revoke-access' THEN
    -- Invalidate portal credentials; DO NOT touch HR/employment status (DEF-C219-06)
    UPDATE public.tenant_memberships
    SET status = 'suspended',
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id;

    UPDATE public.profiles
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id;

  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_ACTION: Action % is not supported by demote_or_suspend_super_admin', p_action
      USING ERRCODE = 'P0008';
  END IF;

  -- 9. Atomic Audit Log Write (Fails closed within the transaction)
  SELECT full_name INTO v_target_name FROM public.profiles WHERE id = p_user_id;
  v_audit_id := 'aud_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || FLOOR(RANDOM() * 9000 + 1000)::INT;

  INSERT INTO public.finance_audit_log (
    id,
    tenant_id,
    action,
    entity_type,
    entity_id,
    entity_name,
    actor_id,
    actor_role,
    reason,
    source,
    old_state,
    new_state,
    created_at
  ) VALUES (
    v_audit_id,
    p_tenant_id,
    CASE
      WHEN p_action = 'change-role' THEN 'CHANGE_USER_ROLE'
      WHEN p_action = 'revoke-access' THEN 'REVOKE_USER_ACCESS'
      ELSE 'SUSPEND_USER'
    END,
    'user',
    p_user_id::TEXT,
    COALESCE(v_target_name, p_user_id::TEXT),
    v_caller_id,
    v_actor_role,
    'Atomic Super Admin governance operation with serialized tenant advisory lock',
    'people_and_access',
    jsonb_build_object('role', v_target_current_role, 'status', v_target_current_status),
    jsonb_build_object('action', p_action, 'newRole', p_new_role),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'action', p_action,
    'userId', p_user_id,
    'tenantId', p_tenant_id,
    'remainingActiveSuperAdmins', CASE WHEN v_target_is_super_admin THEN v_active_super_admins - 1 ELSE v_active_super_admins END
  );
END;
$$;

-- 10. Explicit Privilege Grants (DEF-C219-02)
REVOKE ALL ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) TO service_role;
