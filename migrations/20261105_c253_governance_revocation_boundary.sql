-- ==============================================================================
-- Clasptek Invoice System — Forward-Only Database Migration
-- Phase C253: People & Access Governance, Outbox & Revocation Boundary Remediation
-- Migration: 20261105_c253_governance_revocation_boundary.sql
-- Status: LOCAL REPOSITORY ONLY — UNAPPLIED. NOT AUTHORIZED FOR ANY REMOTE DATABASE.
--
-- ORDERING / DEPENDENCIES
--   Baseline (3308ef28) already contains 20261102_atomic_last_super_admin.sql (immutable, untouched).
--   Optional predecessors that were never part of the baseline: 20261103 (C249) and 20261104 (C251).
--   THIS FILE IS SELF-CONTAINED. It is safe to apply:
--     (a) on a fresh schema that has only the baseline migrations,
--     (b) after 20261103,
--     (c) after 20261103 + 20261104.
--   It never calls an object created by 20261103/20261104 without first creating it itself.
--   It removes EVERY overload of the three governance RPCs (dynamic pg_proc lookup) before
--   recreating exactly one signature of each, so no weaker legacy overload can remain callable.
--
-- RESOLVES (C252): DEF-C252-01, -02, -03, -05 (DB half), -06, -07, -08, -12
--   * service-role-only execution, enforced BOTH by grants and by an in-function request-role check.
--     NOTE: inside SECURITY DEFINER functions CURRENT_USER is the function OWNER, therefore the
--     C249/C251 test `CURRENT_USER IN ('postgres','service_role',...)` was always true and provided
--     no caller authentication. It is replaced by public.governance_request_role().
--   * actor re-validated inside the transaction (active SUPER_ADMIN of the same tenant, row locked).
--   * membership mutation + audit row + durable outbox intent + idempotency ledger in ONE statement
--     (single PL/pgSQL call == single transaction; no EXCEPTION blocks swallow failures).
--   * tenant advisory lock + FOR UPDATE on all active SUPER_ADMIN rows (ordered) before counting.
--   * outbox claim/complete RPCs with FOR UPDATE SKIP LOCKED, lease, conditional completion,
--     supersession on reactivation, bounded retries with back-off.
--   * 'deactivated' is NOT a stored membership status. tenant_memberships.status CHECK is left
--     untouched (active|suspended|invited). 'deactivate' maps to status 'suspended' and keeps its
--     distinct DEACTIVATE_USER audit action. No SQLSTATE 23514 can be produced by these RPCs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Remove every existing overload of the governance RPCs (never leave a weaker overload)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'govern_tenant_membership',
        'demote_or_suspend_super_admin',
        'record_governance_audit_log',
        'claim_session_revocations',
        'complete_session_revocation',
        'terminate_user_sessions',
        'governance_request_role'
      )
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 1. Request-role resolver (fails closed: NULL when no PostgREST JWT role is present)
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.governance_request_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role'
  );
$$;

-- ------------------------------------------------------------------------------
-- 2. Outbox table (create if missing; extend if C249/C251 created it)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_session_revocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT uq_governance_revocation_outbox_op UNIQUE (tenant_id, operation_id)
);

ALTER TABLE public.governance_session_revocation_outbox
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT,
  ADD COLUMN IF NOT EXISTS revocation_epoch BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_action TEXT;

ALTER TABLE public.governance_session_revocation_outbox
  ALTER COLUMN attempt_count SET DEFAULT 0;

-- Replace any pre-existing status CHECK (C249/C251 allowed only PENDING|COMPLETED|FAILED)
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.governance_session_revocation_outbox'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.governance_session_revocation_outbox DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;

ALTER TABLE public.governance_session_revocation_outbox
  ADD CONSTRAINT chk_gov_outbox_status
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SUPERSEDED'));

CREATE INDEX IF NOT EXISTS idx_gov_revocation_outbox_tenant_status
  ON public.governance_session_revocation_outbox(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_revocation_outbox_target_user
  ON public.governance_session_revocation_outbox(tenant_id, target_user_id);
CREATE INDEX IF NOT EXISTS idx_gov_revocation_outbox_claimable
  ON public.governance_session_revocation_outbox(status, next_attempt_at);

ALTER TABLE public.governance_session_revocation_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_revocation_outbox_super_admin_select" ON public.governance_session_revocation_outbox;
CREATE POLICY "gov_revocation_outbox_super_admin_select"
  ON public.governance_session_revocation_outbox
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = governance_session_revocation_outbox.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'SUPER_ADMIN'
        AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "outbox_service_role_all" ON public.governance_session_revocation_outbox;
CREATE POLICY "outbox_service_role_all"
  ON public.governance_session_revocation_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.governance_session_revocation_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.governance_session_revocation_outbox TO authenticated;
GRANT ALL ON TABLE public.governance_session_revocation_outbox TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Idempotency ledger: one logical governance operation per (tenant_id, operation_id)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_operation_ledger (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  audit_id TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, operation_id)
);

ALTER TABLE public.governance_operation_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gov_operation_ledger_service_role_all" ON public.governance_operation_ledger;
CREATE POLICY "gov_operation_ledger_service_role_all"
  ON public.governance_operation_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON TABLE public.governance_operation_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.governance_operation_ledger TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Authoritative atomic membership governance RPC
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.govern_tenant_membership(
  p_tenant_id UUID,
  p_target_user_id UUID,
  p_action TEXT,
  p_new_role TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_actor_role TEXT DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_request_role TEXT;
  v_reason TEXT;
  v_op_id TEXT;
  v_ledger public.governance_operation_ledger%ROWTYPE;
  v_actor_role TEXT;
  v_actor_status TEXT;
  v_target_role TEXT;
  v_target_status TEXT;
  v_target_is_sa BOOLEAN;
  v_active_sa INT;
  v_final_role TEXT;
  v_final_status TEXT;
  v_audit_action TEXT;
  v_audit_id TEXT;
  v_target_name TEXT;
  v_rows INT := 0;
  v_needs_termination BOOLEAN := FALSE;
  v_outbox_id UUID := NULL;
  v_epoch BIGINT := 1;
  v_result JSONB;
BEGIN
  -- 1. Caller must be the trusted server (service_role JWT). Fail closed on anything else.
  v_request_role := public.governance_request_role();
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: governance RPC is restricted to the trusted server role.'
      USING ERRCODE = 'P0003';
  END IF;

  -- 2. Parameter validation
  IF p_tenant_id IS NULL OR p_target_user_id IS NULL OR p_actor_id IS NULL
     OR p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'INVALID_PARAMETERS: tenant, target, actor and action are required.'
      USING ERRCODE = 'P0007';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Governance reason is required (minimum 3 characters).'
      USING ERRCODE = 'P0007';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG: Governance reason must not exceed 500 characters.'
      USING ERRCODE = 'P0007';
  END IF;

  IF p_action NOT IN ('change-role', 'toggle-status', 'suspend', 'deactivate',
                      'revoke-access', 'reactivate', 'unlock-account', 'remove-membership') THEN
    RAISE EXCEPTION 'UNSUPPORTED_ACTION: Governance action is not supported.'
      USING ERRCODE = 'P0008';
  END IF;

  IF p_actor_role IS NOT NULL
     AND upper(regexp_replace(btrim(p_actor_role), '[\s-]+', '_', 'g')) <> 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only a Super Admin may perform governance operations.'
      USING ERRCODE = 'P0004';
  END IF;

  v_op_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  IF v_op_id IS NOT NULL AND length(v_op_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_PARAMETERS: operation id exceeds 128 characters.'
      USING ERRCODE = 'P0007';
  END IF;

  -- 3. Tenant-scoped transaction advisory lock (64-bit hashtextextended key; same key for every path)
  PERFORM pg_advisory_xact_lock(hashtextextended('clasptek:tenant-governance:' || p_tenant_id::TEXT, 0));

  -- 4. Idempotent replay: one logical operation per (tenant, operation_id)
  IF v_op_id IS NOT NULL THEN
    SELECT * INTO v_ledger
    FROM public.governance_operation_ledger
    WHERE tenant_id = p_tenant_id AND operation_id = v_op_id;
    IF FOUND THEN
      IF v_ledger.action IS DISTINCT FROM p_action
         OR v_ledger.target_user_id IS DISTINCT FROM p_target_user_id
         OR v_ledger.actor_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'OPERATION_ID_CONFLICT: operation id was already used for a different governance operation.'
          USING ERRCODE = 'P0010';
      END IF;
      RETURN v_ledger.result || jsonb_build_object('idempotent', TRUE);
    END IF;
  ELSE
    v_op_id := 'op_' || replace(gen_random_uuid()::TEXT, '-', '');
  END IF;

  -- 5. Lock all ACTIVE SUPER_ADMIN rows in a deterministic order (valid under READ COMMITTED and,
  --    via serialization failure on concurrent change, under REPEATABLE READ / SERIALIZABLE)
  PERFORM 1
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id AND role = 'SUPER_ADMIN' AND status = 'active'
  ORDER BY id
  FOR UPDATE;

  -- 6. Re-validate actor INSIDE the transaction: active SUPER_ADMIN of THIS tenant
  SELECT role, status INTO v_actor_role, v_actor_status
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_id;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'SUPER_ADMIN' OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Actor is not an active Super Admin of this tenant.'
      USING ERRCODE = 'P0004';
  END IF;

  -- 7. Lock and inspect target membership (same tenant only)
  SELECT role, status INTO v_target_role, v_target_status
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Target is not a member of this tenant.'
      USING ERRCODE = 'P0006';
  END IF;

  v_target_is_sa := (v_target_role = 'SUPER_ADMIN' AND v_target_status = 'active');

  -- 8. Self-protection
  IF p_target_user_id = p_actor_id THEN
    IF (p_action = 'change-role' AND COALESCE(p_new_role, '') <> 'SUPER_ADMIN')
       OR p_action IN ('suspend', 'deactivate', 'revoke-access', 'remove-membership')
       OR (p_action = 'toggle-status' AND COALESCE(p_new_status, '') <> 'active') THEN
      RAISE EXCEPTION 'CANNOT_DEMOTE_SELF: Cannot demote, suspend, revoke or remove your own Super Admin account.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 9. Final role / status / audit action (distinct audit action per supported action)
  v_final_role := v_target_role;
  v_final_status := v_target_status;

  IF p_action = 'change-role' THEN
    IF p_new_role IS NULL OR p_new_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF') THEN
      RAISE EXCEPTION 'INVALID_ROLE: Role is not a canonical membership role.' USING ERRCODE = 'P0007';
    END IF;
    v_final_role := p_new_role;
    v_audit_action := 'CHANGE_USER_ROLE';
  ELSIF p_action = 'toggle-status' THEN
    IF p_new_status IS NULL OR p_new_status NOT IN ('active', 'suspended', 'invited') THEN
      RAISE EXCEPTION 'INVALID_STATUS: Status is not a supported membership status.' USING ERRCODE = 'P0007';
    END IF;
    v_final_status := p_new_status;
    v_audit_action := 'TOGGLE_USER_STATUS';
  ELSIF p_action = 'suspend' THEN
    v_final_status := 'suspended';
    v_audit_action := 'SUSPEND_USER';
  ELSIF p_action = 'deactivate' THEN
    v_final_status := 'suspended';
    v_audit_action := 'DEACTIVATE_USER';
  ELSIF p_action = 'revoke-access' THEN
    v_final_status := 'suspended';
    v_audit_action := 'REVOKE_USER_ACCESS';
  ELSIF p_action = 'reactivate' THEN
    v_final_status := 'active';
    v_audit_action := 'REACTIVATE_USER';
  ELSIF p_action = 'unlock-account' THEN
    v_final_status := 'active';
    v_audit_action := 'UNLOCK_USER_ACCOUNT';
  ELSE -- remove-membership
    v_audit_action := 'REMOVE_USER_MEMBERSHIP';
  END IF;

  -- 10. Last active SUPER_ADMIN invariant (count taken after row locks + advisory lock)
  IF v_target_is_sa AND (p_action = 'remove-membership' OR v_final_role <> 'SUPER_ADMIN' OR v_final_status <> 'active') THEN
    SELECT count(*) INTO v_active_sa
    FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id AND role = 'SUPER_ADMIN' AND status = 'active';
    IF v_active_sa <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN: Tenant must retain at least one active Super Admin.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 11. Mutation (row count verified)
  IF p_action = 'remove-membership' THEN
    DELETE FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id;
  ELSE
    UPDATE public.tenant_memberships
    SET role = v_final_role, status = v_final_status, updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'MEMBERSHIP_UPDATE_FAILED: Expected exactly one membership row to change.'
      USING ERRCODE = 'P0009';
  END IF;

  -- 12. Audit row (same transaction; any failure aborts everything)
  SELECT full_name INTO v_target_name FROM public.profiles WHERE id = p_target_user_id;
  v_audit_id := 'aud_' || replace(gen_random_uuid()::TEXT, '-', '');

  v_needs_termination := (p_action <> 'remove-membership' AND v_final_status <> 'active');

  INSERT INTO public.finance_audit_log (
    id, tenant_id, action, entity_type, entity_id, entity_name,
    actor_id, actor_role, reason, source, old_state, new_state, created_at
  ) VALUES (
    v_audit_id, p_tenant_id, v_audit_action, 'user', p_target_user_id::TEXT,
    COALESCE(v_target_name, p_target_user_id::TEXT),
    p_actor_id, 'SUPER_ADMIN', v_reason, 'people_and_access',
    jsonb_build_object('role', v_target_role, 'status', v_target_status),
    jsonb_build_object(
      'role', v_final_role,
      'status', CASE WHEN p_action = 'remove-membership' THEN 'removed' ELSE v_final_status END,
      'action', p_action,
      'operationId', v_op_id,
      'sessionTerminationRequired', v_needs_termination
    ),
    NOW()
  );

  -- 13. Durable outbox intent / supersession (same transaction)
  IF v_final_status = 'active' OR p_action = 'remove-membership' THEN
    UPDATE public.governance_session_revocation_outbox
    SET status = 'SUPERSEDED',
        superseded_at = NOW(),
        superseded_reason = CASE WHEN p_action = 'remove-membership'
                                 THEN 'Membership removed by authorized governance action'
                                 ELSE 'Membership reactivated by authorized governance action' END,
        claim_token = NULL,
        claimed_by = NULL,
        lease_expires_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND target_user_id = p_target_user_id
      AND status IN ('PENDING', 'IN_PROGRESS', 'FAILED');
  END IF;

  IF v_needs_termination THEN
    SELECT COALESCE(max(revocation_epoch), 0) + 1 INTO v_epoch
    FROM public.governance_session_revocation_outbox
    WHERE tenant_id = p_tenant_id AND target_user_id = p_target_user_id;

    -- A new suspension starts a new revocation epoch; older open work is superseded by it.
    UPDATE public.governance_session_revocation_outbox
    SET status = 'SUPERSEDED',
        superseded_at = NOW(),
        superseded_reason = 'Superseded by a newer revocation epoch',
        claim_token = NULL, claimed_by = NULL, lease_expires_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND target_user_id = p_target_user_id
      AND status IN ('PENDING', 'IN_PROGRESS', 'FAILED');

    INSERT INTO public.governance_session_revocation_outbox (
      tenant_id, target_user_id, actor_id, operation_id, reason, audit_id,
      status, attempt_count, next_attempt_at, revocation_epoch, source_action
    ) VALUES (
      p_tenant_id, p_target_user_id, p_actor_id, v_op_id, v_reason, v_audit_id,
      'PENDING', 0, NOW(), v_epoch, p_action
    )
    RETURNING id INTO v_outbox_id;
  END IF;

  v_result := jsonb_build_object(
    'success', TRUE,
    'idempotent', FALSE,
    'tenantId', p_tenant_id,
    'userId', p_target_user_id,
    'action', p_action,
    'auditAction', v_audit_action,
    'role', v_final_role,
    'status', CASE WHEN p_action = 'remove-membership' THEN 'removed' ELSE v_final_status END,
    'auditId', v_audit_id,
    'operationId', v_op_id,
    'rowsAffected', v_rows,
    'sessionTerminationRequired', v_needs_termination,
    'outboxId', v_outbox_id,
    'revocationEpoch', CASE WHEN v_needs_termination THEN v_epoch ELSE NULL END
  );

  -- 14. Idempotency ledger (same transaction)
  INSERT INTO public.governance_operation_ledger (
    tenant_id, operation_id, action, target_user_id, actor_id, audit_id, result
  ) VALUES (
    p_tenant_id, v_op_id, p_action, p_target_user_id, p_actor_id, v_audit_id, v_result
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Legacy wrapper (kept for compatibility with baseline callers). SECURITY INVOKER:
--    it adds no authority; it preserves the operator-supplied reason (no hardcoded text).
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.demote_or_suspend_super_admin(
  p_tenant_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_new_role TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_action NOT IN ('change-role', 'suspend', 'deactivate', 'revoke-access') THEN
    RAISE EXCEPTION 'UNSUPPORTED_ACTION: Action is not supported by demote_or_suspend_super_admin.'
      USING ERRCODE = 'P0008';
  END IF;
  RETURN public.govern_tenant_membership(
    p_tenant_id => p_tenant_id,
    p_target_user_id => p_user_id,
    p_action => p_action,
    p_new_role => p_new_role,
    p_new_status => NULL,
    p_reason => p_reason,
    p_actor_id => p_actor_id,
    p_actor_role => 'SUPER_ADMIN',
    p_operation_id => p_operation_id
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Hardened append-only governance audit RPC (service_role only)
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.record_governance_audit_log(
  p_tenant_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_entity_name TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_actor_role TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'people_and_access',
  p_old_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_membership_role TEXT;
  v_audit_id TEXT;
BEGIN
  IF public.governance_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: governance audit RPC is restricted to the trusted server role.'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_action IS NULL OR btrim(p_action) = ''
     OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_AUDIT_PAYLOAD: tenant, actor, action, entity type and entity id are required.'
      USING ERRCODE = 'P0007';
  END IF;

  SELECT role INTO v_membership_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_id AND status = 'active';

  IF v_membership_role IS NULL OR v_membership_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_AUDIT_ACTOR: Actor is not an active administrator of this tenant.'
      USING ERRCODE = 'P0004';
  END IF;

  v_audit_id := 'aud_' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.finance_audit_log (
    id, tenant_id, action, entity_type, entity_id, entity_name,
    actor_id, actor_role, reason, source, old_state, new_state, created_at
  ) VALUES (
    v_audit_id, p_tenant_id, btrim(p_action), btrim(p_entity_type), btrim(p_entity_id), p_entity_name,
    p_actor_id, v_membership_role,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Authoritative governance audit log'),
    COALESCE(NULLIF(btrim(p_source), ''), 'people_and_access'),
    CASE WHEN p_old_state IS NULL THEN NULL
         ELSE p_old_state - 'password' - 'tempPassword' - 'token' - 'resetToken' - 'inviteToken' - 'secret' - 'accessToken' - 'refreshToken' END,
    CASE WHEN p_new_state IS NULL THEN NULL
         ELSE p_new_state - 'password' - 'tempPassword' - 'token' - 'resetToken' - 'inviteToken' - 'secret' - 'accessToken' - 'refreshToken' END,
    NOW()
  );

  RETURN jsonb_build_object('success', TRUE, 'auditId', v_audit_id, 'tenantId', p_tenant_id, 'actorId', p_actor_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Outbox claim RPC: atomic claim with lease (FOR UPDATE SKIP LOCKED)
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.claim_session_revocations(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_lease_seconds INT DEFAULT 120,
  p_claimer TEXT DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_include_failed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  outbox_id UUID,
  tenant_id UUID,
  target_user_id UUID,
  operation_id TEXT,
  claim_token UUID,
  attempt_count INT,
  max_attempts INT,
  revocation_epoch BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_lease INT := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900);
BEGIN
  IF public.governance_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: outbox claim RPC is restricted to the trusted server role.'
      USING ERRCODE = 'P0003';
  END IF;

  -- Stale work: if the membership became active again (or was removed) the revocation is obsolete.
  UPDATE public.governance_session_revocation_outbox o
  SET status = 'SUPERSEDED',
      superseded_at = NOW(),
      superseded_reason = 'Obsolete: membership is active again or no longer exists',
      claim_token = NULL, claimed_by = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE o.status IN ('PENDING', 'IN_PROGRESS', 'FAILED')
    AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = o.tenant_id AND m.user_id = o.target_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = o.tenant_id AND m.user_id = o.target_user_id AND m.status = 'active'
      )
    );

  RETURN QUERY
  WITH cand AS (
    SELECT o.id
    FROM public.governance_session_revocation_outbox o
    WHERE (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
      AND (p_operation_id IS NULL OR o.operation_id = p_operation_id)
      AND (p_target_user_id IS NULL OR o.target_user_id = p_target_user_id)
      AND (
        (o.status = 'PENDING' AND o.next_attempt_at <= NOW())
        OR (o.status = 'IN_PROGRESS' AND o.lease_expires_at < NOW())
        OR (COALESCE(p_include_failed, FALSE) AND o.status = 'FAILED')
      )
    ORDER BY o.created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.governance_session_revocation_outbox o
  SET status = 'IN_PROGRESS',
      claim_token = gen_random_uuid(),
      claimed_by = left(COALESCE(p_claimer, 'unknown'), 100),
      lease_expires_at = NOW() + make_interval(secs => v_lease),
      max_attempts = CASE WHEN o.status = 'FAILED' THEN o.attempt_count + 2 ELSE o.max_attempts END,
      attempt_count = o.attempt_count + 1,
      updated_at = NOW()
  FROM cand
  WHERE o.id = cand.id
  RETURNING o.id, o.tenant_id, o.target_user_id, o.operation_id, o.claim_token,
            o.attempt_count, o.max_attempts, o.revocation_epoch;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Outbox completion RPC: conditional on claim token + IN_PROGRESS (stale workers are no-ops)
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.complete_session_revocation(
  p_id UUID,
  p_claim_token UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row public.governance_session_revocation_outbox%ROWTYPE;
  v_final TEXT;
  v_error TEXT;
BEGIN
  IF public.governance_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: outbox completion RPC is restricted to the trusted server role.'
      USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_row
  FROM public.governance_session_revocation_outbox
  WHERE id = p_id AND claim_token = p_claim_token AND status = 'IN_PROGRESS'
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT status INTO v_final FROM public.governance_session_revocation_outbox WHERE id = p_id;
    RETURN jsonb_build_object('updated', FALSE, 'status', v_final);
  END IF;

  IF COALESCE(p_success, FALSE) THEN
    UPDATE public.governance_session_revocation_outbox
    SET status = 'COMPLETED', resolved_at = NOW(), last_error = NULL,
        claim_token = NULL, claimed_by = NULL, lease_expires_at = NULL, updated_at = NOW()
    WHERE id = p_id;
    RETURN jsonb_build_object('updated', TRUE, 'status', 'COMPLETED');
  END IF;

  v_error := left(regexp_replace(COALESCE(p_error, 'unknown error'),
                                 'eyJ[A-Za-z0-9_\-\.]{20,}', '[redacted]', 'g'), 500);
  IF v_row.attempt_count >= v_row.max_attempts THEN
    v_final := 'FAILED';
  ELSE
    v_final := 'PENDING';
  END IF;

  UPDATE public.governance_session_revocation_outbox
  SET status = v_final,
      last_error = v_error,
      next_attempt_at = NOW() + LEAST(interval '1 hour', interval '30 seconds' * power(2, v_row.attempt_count)),
      claim_token = NULL, claimed_by = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object('updated', TRUE, 'status', v_final);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8b. Session termination RPC.
--     Supabase auth-js `auth.admin.signOut(jwt, scope)` requires the USER'S ACCESS TOKEN, not a user id;
--     the C249/C251 code passed a user id and therefore could never succeed against real GoTrue.
--     GoTrue exposes no admin "sign out by user id" call, so sessions are removed at the source of
--     truth (auth.sessions; refresh tokens cascade). The membership row is locked FOR SHARE so a
--     concurrent reactivation (which needs FOR UPDATE) is ordered strictly before or after the
--     deletion, and a stale worker can never terminate a freshly reactivated user's sessions.
--     LIVE GoTrue BEHAVIOUR IS NOT VERIFIED LOCALLY (see C253 reports).
-- ------------------------------------------------------------------------------
CREATE FUNCTION public.terminate_user_sessions(
  p_tenant_id UUID,
  p_target_user_id UUID,
  p_require_inactive BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_deleted INT := 0;
BEGIN
  IF public.governance_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: session termination RPC is restricted to the trusted server role.'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_tenant_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAMETERS: tenant and target are required.' USING ERRCODE = 'P0007';
  END IF;

  SELECT status INTO v_status
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Target is not a member of this tenant.' USING ERRCODE = 'P0006';
  END IF;

  IF COALESCE(p_require_inactive, TRUE) AND v_status = 'active' THEN
    RETURN jsonb_build_object('terminated', FALSE, 'reason', 'MEMBERSHIP_ACTIVE');
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('terminated', TRUE, 'sessionsDeleted', v_deleted);
END;
$$;
-- ------------------------------------------------------------------------------
-- 9. Explicit privileges: service_role ONLY, for exact signatures
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.governance_request_role() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.govern_tenant_membership(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.govern_tenant_membership(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.record_governance_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_governance_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_session_revocations(UUID, INT, INT, TEXT, TEXT, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session_revocations(UUID, INT, INT, TEXT, TEXT, UUID, BOOLEAN)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_session_revocation(UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_session_revocation(UUID, UUID, BOOLEAN, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.terminate_user_sessions(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_user_sessions(UUID, UUID, BOOLEAN)
  TO service_role;
-- ------------------------------------------------------------------------------
-- Rollback considerations (documentation only; never execute automatically):
--   DROP FUNCTION public.complete_session_revocation(UUID, UUID, BOOLEAN, TEXT);
--   DROP FUNCTION public.claim_session_revocations(UUID, INT, INT, TEXT, TEXT, UUID, BOOLEAN);
--   DROP FUNCTION public.governance_request_role();
--   (governance RPCs must be restored from the preceding migration set if rolled back)
-- ------------------------------------------------------------------------------
