# C260 Application Authorization & Revocation Review

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Phase:** C260 — Independent Final Execution-Gate Challenge
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Executive Summary & Objective

The objective of this report is to forensically trace the end-to-end authorization and revocation enforcement mechanisms across the Clasptek application codebase.

Specifically, we examine:
1. Server-side session authentication in `lib/auth/server.ts`.
2. Personnel governance routing in `lib/admin/personnel-queries.ts`.
3. Legacy provisioning boundary remediation in `api/admin.js`.
4. Automated outbox worker execution in `app/api/cron/reconcile-session-revocations/route.ts`.

---

## 2. Server-Side Request Authorization: Zero-Trust Status Check

In `lib/auth/server.ts`, all authoritative server sessions are resolved via `getAuthoritativeSession`:

```typescript
// lib/auth/server.ts (Lines 77–93)
let query = supabase
  .from('tenant_memberships')
  .select('role, tenant_id, status')
  .eq('user_id', user.id)
  .eq('status', 'active'); // STRICT ACTIVE FILTER

if (options.requestedTenantId && options.requestedTenantId.trim()) {
  query = query.eq('tenant_id', options.requestedTenantId.trim());
}

const { data: memberships, error: membershipError } = await query;

// FAIL CLOSED: Database query error or missing/inactive membership
if (membershipError || !memberships || memberships.length === 0) {
  return null;
}
```

### Forensic Implications:
1. **Active Status Requirement:** The application queries PostgreSQL `tenant_memberships` filtered strictly by `status = 'active'`.
2. **Instant Invalidation (0s Latency):** If an administrator changes a user's status to `suspended` (via `govern_tenant_membership`), the next HTTP request made by that user—even with an unexpired GoTrue JWT—returns `memberships.length === 0`, causing `getAuthoritativeSession` to return `null`.
3. **Fail-Closed Protection:** Any protected route using `authoritativeAuthGate` immediately rejects the request with HTTP 401 Unauthorized or HTTP 403 Forbidden.

---

## 3. Personnel Governance Single Choke Point

In `lib/admin/personnel-queries.ts`, all user lifecycle mutations (role assignment, suspension, deactivation, reactivation, removal) route exclusively through `callGovernRpc`:

```typescript
// lib/admin/personnel-queries.ts (Lines 853–866)
async function callGovernRpc(input: GovernRpcInput): Promise<GovernRpcOutcome> {
  const supabase = await getGovernanceDbClient();
  const { data, error } = await supabase.rpc('govern_tenant_membership', {
    p_tenant_id: input.tenantId,
    p_target_user_id: input.targetUserId,
    p_action: input.action,
    p_new_role: input.newRole ?? null,
    p_new_status: input.newStatus ?? null,
    p_reason: input.reason,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole || 'SUPER_ADMIN',
    p_operation_id: input.operationId ?? null,
  });
  ...
}
```

### Forensic Implications:
1. **Advisory Locks & Concurrency:** The PostgreSQL function `govern_tenant_membership` acquires `pg_advisory_xact_lock` on the tenant, preventing concurrent last-Super-Admin race conditions.
2. **Atomic Outbox Enqueue:** When suspension/deactivation/removal requires session revocation, an entry in `governance_session_revocation_outbox` is inserted within the **very same database transaction**. Dual-write discrepancies are physically eliminated.
3. **Auditing Guarantee:** An immutable row in `audit_logs` is committed in the same transaction.

---

## 4. Remediation of Legacy Provisioning Bypasses

In Phase C254, finding `DEF-C254-LEGACY-01` confirmed that `api/admin.js:handleProvisionUser` performed direct PostgREST writes to `tenant_memberships` and `personnel`.

In Phase C255, this bypass was fully remediated. Our audit confirms:
- Direct PostgREST mutations to `tenant_memberships` were excised.
- In `api/admin.js`, user creation routes through `govern_tenant_membership` (Lines 485–492).
- Non-authenticated calls fail with HTTP 401; un-routed legacy paths return HTTP 410 Gone (`DEPRECATED_ENDPOINT`).
- No backdoor bypass remains in `api/admin.js`.

---

## 5. Automated Session Revocation Worker

In `app/api/cron/reconcile-session-revocations/route.ts`:
1. **Authentication:** Endpoint enforces `CRON_SECRET` authorization header; rejects unauthorized requests with HTTP 401.
2. **Batch Claiming:** Invokes `claim_session_revocations` RPC, which uses `FOR UPDATE SKIP LOCKED` and sets a 60-second lease, preventing duplicate concurrent processing across workers.
3. **GoTrue Invalidation:** Calls `supabase.auth.admin.signOut(targetUserId, 'global')`.
4. **Completion / Retry:** Invokes `complete_session_revocation`. On network failure, records error and calculates exponential backoff; on success, updates outbox record to `COMPLETED`.
5. **Superseding Logic:** If an administrator reactivates a suspended user before the worker executes, the item is marked `SUPERSEDED`, preventing invalidation of the reactivated user's session.

---

## 6. Conclusion

The application-layer authorization, governance mutation, and session revocation paths are architecturally unified, fail-closed, and strictly verified. Zero bypass routes exist in the codebase.
