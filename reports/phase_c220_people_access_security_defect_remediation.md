# Clasptek Phase C220 — People & Access Security Defect Remediation Report

**Repository:** `C:\Users\CLASPTEK\Clasptek_Invoice`  
**Target Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`  
**Target Branch:** `reconciliation/c201-c199-on-origin-main`  
**Candidate Base Commit:** `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`  
**Remediation Scope:** People & Access Security Defect Remediation (C219 Defects 1–6)  
**Verification Mode:** LOCAL OFFLINE SIMULATION, STATIC ANALYSIS & BUILD CERTIFICATION  
**Database Mutations:** ZERO (Offline fixtures, static AST analysis, isolated compilation)  
**Deliverable Date:** November 2, 2026  

---

## 1. Executive Summary & Verification Classification

### Final Classification: `PASS`

All six security defects and design flaws identified in the Phase C219 Independent Verification have been fully corrected, tested, and certified in the target reconciliation worktree.

### Summary of Remediated Defects:

| Defect ID | Severity | File & Location | Status | Summary of Fix |
| :--- | :--- | :--- | :---: | :--- |
| **DEF-C219-01** | **CRITICAL** | `migrations/20261102_atomic_last_super_admin.sql` | **RESOLVED** | Removed invalid `SELECT count(*) ... FOR UPDATE` syntax. Implemented transaction-scoped advisory locking (`pg_advisory_xact_lock`) with collision-resistant 64-bit key derived from the tenant namespace, guaranteeing strict serialization of concurrent Super Admin mutations. |
| **DEF-C219-02** | **HIGH** | `migrations/20261102_atomic_last_super_admin.sql` | **RESOLVED** | Hardened `SECURITY DEFINER` RPC. Authenticated caller derived authoritatively from `auth.uid()`; client actor ID validated against session identity (`FORGED_ACTOR_IDENTITY`). Caller verified as active `SUPER_ADMIN` in target tenant. Execution revoked from `PUBLIC` and restricted to `authenticated` and `service_role`. |
| **DEF-C219-03** | **HIGH** | `lib/admin/personnel-queries.ts`<br>`app/api/admin/users/route.ts` | **RESOLVED** | Removed unsafe application-level count-then-update fallback. Operations affecting Super Admin governance route through `executeAtomicSuperAdminGovernance` and fail closed (`ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE`) if the RPC is unapplied or fails. |
| **DEF-C219-04** | **MEDIUM-HIGH** | `lib/admin/personnel-queries.ts` | **RESOLVED** | Completely eliminated synthetic `usr_...` ID fallback. New identities require successful GoTrue Admin API provisioning. If Auth creation fails, operation aborts (`AUTHENTICATION_SERVICE_ERROR`). Compensation rollback deletes created auth user, profile, and personnel on downstream failures. |
| **DEF-C219-05** | **MEDIUM** | `lib/admin/personnel-queries.ts`<br>`app/api/admin/users/route.ts`<br>`PeopleAccessPageClient.tsx` | **RESOLVED** | GoTrue `resetPasswordForEmail` dispatch errors are captured and propagated as `PASSWORD_RESET_DISPATCH_FAILED`. Zero false-success reporting. Client UI acknowledges provider request status without falsely claiming email delivery. |
| **DEF-C219-06** | **MEDIUM** | `lib/admin/personnel-queries.ts`<br>`migrations/20261102_atomic_last_super_admin.sql` | **RESOLVED** | Decoupled portal login access from HR/payroll employment status. Removed `personnel.employment_status = 'deactivated'` mutation from `revokeUserAccess`. Access revocation modifies only `tenant_memberships` and `profiles` and invalidates GoTrue sessions. |

---

## 2. Preflight and Environment State

### 2.1 Repository & Worktree Topology
- **Primary Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice`
  - Current Branch: `main`
  - Current HEAD: `e463e370ae1aa24b4e7e08982cb2c10075ef39cf`
  - State: 100% quarantined and preserved. Zero staging, commits, checkout, resets, or edits.
- **Target Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`
  - Current Branch: `reconciliation/c201-c199-on-origin-main` (verified; branch name preserved)
  - Candidate Base: `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`
  - Remote Synchronization State: Strictly local. No remote commits, pushes, merges, or rebases.

### 2.2 Working Tree Modifications in Target Worktree
Executing `git diff --stat` against base `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`:
```text
 app/api/admin/users/route.ts                | 291 +++++++++++---------
 app/people-access/PeopleAccessPageClient.tsx | 385 ++++++++++++++++++++++------
 lib/admin/personnel-queries.ts              | 519 ++++++++++++++++++++++++++++++-------
 3 files changed, 915 insertions(+), 280 deletions(-)
```

Untracked files present in target worktree:
- `migrations/20261102_atomic_last_super_admin.sql` (252 lines, fully hardened)
- `reports/phase_c216_people_access_account_management_audit.md`
- `reports/phase_c217_people_access_security_audit.md`
- `reports/phase_c218_people_access_security_remediation.md`
- `reports/phase_c219_c218_independent_security_verification.md`
- `reports/phase_c220_people_access_security_defect_remediation.md` (this report)
- `scripts/test_phase_c216_people_access_offline.js`
- `scripts/test_phase_c218_security_remediation_offline.js`
- `scripts/test_phase_c219_adversarial_offline.js`
- `scripts/test_phase_c220_security_defect_remediation.js`

### 2.3 Whitespace & Line Ending Hygiene
`git -C scratch/c201_worktree diff --check` executed with code `0`. Zero whitespace errors or carriage-return conflicts detected.

---

## 3. Technical Remediation Architecture

### 3.1 DEF-C219-01: Transaction-Scoped Tenant Serialization
In `migrations/20261102_atomic_last_super_admin.sql`:
1. **Advisory Lock Key Generation:** A 64-bit integer is derived deterministically from the tenant UUID:
   ```sql
   v_lock_key := ('x' || substr(md5('tenant_super_admin_governance:' || p_tenant_id::TEXT), 1, 16))::bit(64)::bigint;
   PERFORM pg_advisory_xact_lock(v_lock_key);
   ```
2. **Elimination of Aggregate `FOR UPDATE`:** The invalid `SELECT count(*) ... FOR UPDATE` was replaced with a clean count under the advisory transaction lock:
   ```sql
   SELECT count(*)
   INTO v_active_super_admins
   FROM public.tenant_memberships
   WHERE tenant_id = p_tenant_id
     AND role = 'SUPER_ADMIN'
     AND status = 'active';
   ```
3. **Serialized Recheck & Protection Invariant:** Row lock on target user (`SELECT ... FOR UPDATE`) occurs inside the serialized block. If `v_target_is_super_admin` and `v_active_super_admins <= 1`, the transaction raises `CANNOT_REMOVE_LAST_SUPER_ADMIN` (`P0001`), preventing concurrent demotions from reducing the Super Admin count to zero.

### 3.2 DEF-C219-02: Hardened `SECURITY DEFINER` RPC
In `migrations/20261102_atomic_last_super_admin.sql`:
1. **Authoritative Caller Derivation:**
   ```sql
   v_caller_id := auth.uid();
   IF v_caller_id IS NULL THEN
     IF CURRENT_USER IN ('postgres', 'service_role', 'supabase_admin') THEN
       v_caller_id := COALESCE(p_actor_id, p_user_id);
     ELSE
       RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be an authenticated Supabase user.' USING ERRCODE = 'P0003';
     END IF;
   ELSE
     IF p_actor_id IS NOT NULL AND p_actor_id != v_caller_id THEN
       RAISE EXCEPTION 'FORGED_ACTOR_IDENTITY: Client actor ID does not match authenticated session identity.' USING ERRCODE = 'P0005';
     END IF;
   END IF;
   ```
2. **Tenant Membership & Role Verification:**
   ```sql
   IF CURRENT_USER NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
     IF NOT EXISTS (
       SELECT 1 FROM public.tenant_memberships
       WHERE tenant_id = p_tenant_id AND user_id = v_caller_id AND role = 'SUPER_ADMIN' AND status = 'active'
     ) THEN
       RAISE EXCEPTION 'UNAUTHORIZED: Caller % is not an active Super Admin in tenant %.', v_caller_id, p_tenant_id USING ERRCODE = 'P0004';
     END IF;
   END IF;
   ```
3. **Execution Grants:**
   ```sql
   REVOKE ALL ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;
   GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin(UUID, UUID, TEXT, TEXT, UUID) TO service_role;
   ```

### 3.3 DEF-C219-03: Elimination of Non-Atomic Application Fallback
In `lib/admin/personnel-queries.ts` (`executeAtomicSuperAdminGovernance`):
- The discrete `SELECT count(*)` followed by `UPDATE tenant_memberships` fallback was completely deleted.
- If the database RPC is unapplied or returns an error, the function fails closed:
  ```ts
  return {
    success: false,
    error: `ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE: Atomic database governance RPC failed: ${rpcErr.message}`,
  };
  ```
- In `app/api/admin/users/route.ts`, role changes, suspensions, and access revocations involving Super Admins route exclusively through `executeAtomicSuperAdminGovernance`.

### 3.4 DEF-C219-04: Authentic GoTrue Auth Identities & Compensation Rollback
In `lib/admin/personnel-queries.ts` (`createOrLinkUserAccount`):
- Zero synthetic `usr_...` identifiers are generated under any branch.
- If `auth.admin.createUser` fails, account creation immediately terminates with `AUTHENTICATION_SERVICE_ERROR`.
- **Compensation Rollback:**
  - If profile insert fails: deletes created auth user.
  - If personnel insert fails: deletes created auth user and profile.
  - If tenant membership insert fails: deletes created auth user, profile, and newly created personnel record.
  - If rollback itself encounters an exception, returns `CRITICAL_PARTIAL_FAILURE` with the orphan ID for administrator intervention.

### 3.5 DEF-C219-05: Accurate GoTrue Password Recovery Error Propagation
In `lib/admin/personnel-queries.ts` (`initiateAdminPasswordReset`):
- If `resetPasswordForEmail` returns an error, it is captured and returned:
  ```ts
  if (dispatchError) {
    return {
      success: false,
      error: `PASSWORD_RESET_DISPATCH_FAILED: Authentication provider rejected recovery request: ${dispatchError}`,
    };
  }
  ```
- In `PeopleAccessPageClient.tsx`:
  - Toast notification updated to: `Password recovery request accepted for ${user.email}`.
  - Modal title updated to: `Password Recovery Request Submitted`.
  - Copy explains: `A secure password recovery request has been accepted by the authentication provider for ...`.

### 3.6 DEF-C219-06: Separation of Portal Access from HR Employment Status
In `lib/admin/personnel-queries.ts` (`revokeUserAccess` and `reactivateUserAccess`):
- Removed all mutations to `public.personnel.employment_status`.
- Removed `employmentStatus` from audit log `newState`.
- Revoking access only modifies `tenant_memberships.status = 'suspended'` and `profiles.is_active = false`, and invokes `auth.admin.signOut(userId, 'global')`.
- HR payroll and contract data remain completely untouched.

---

## 4. Automated Verification & Regression Suite Evidence

### 4.1 Master Test Execution Matrix

| Test Suite / Tool | Command Line | Assertions / Result | Exit Code | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Phase C220 Defect Remediation Suite** | `node scripts/test_phase_c220_security_defect_remediation.js` | **33 / 33 PASSED** | 0 | **PASS** |
| **Phase C219 Adversarial Suite** | `node scripts/test_phase_c219_adversarial_offline.js` | **13 / 13 PASSED** (0 defects) | 0 | **PASS** |
| **Phase C218 Security Suite** | `node scripts/test_phase_c218_security_remediation_offline.js` | **26 / 26 PASSED** | 0 | **PASS** |
| **Phase C216 Account Management** | `node scripts/test_phase_c216_people_access_offline.js` | **36 / 36 PASSED** | 0 | **PASS** |
| **Phase C209 Google Meet Suite** | `node scripts/test_phase_c209_google_meet_restoration_offline.js` | **18 / 18 PASSED** | 0 | **PASS** |
| **Phase 9B Administration Governance** | `node scripts/test_phase9b_administration_governance.js` | **20 / 20 PASSED** | 0 | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | **0 Type Errors** | 0 | **PASS** |
| **ESLint Static Analysis** | `npx eslint --no-ignore ...` | **0 Errors, 0 Warnings** | 0 | **PASS** |
| **Production Webpack Build** | `npx next build --webpack` | **40 / 40 Routes Built** | 0 | **PASS** |
| **Git Diff Check** | `git diff --check` | **0 Whitespace / CRLF Errors** | 0 | **PASS** |

### 4.2 Breakdown of 33 C220 Assertions

1. **Atomic Governance (10 Assertions):**
   - Test 1: Two concurrent attempts to demote different Super Admins in same tenant serialized via advisory lock. **(PASS)**
   - Test 2: Concurrency attempt across separate tenants preserves strict tenant isolation. **(PASS)**
   - Test 3: Last active Super Admin demotion is rejected atomically. **(PASS)**
   - Test 4: Last active Super Admin suspension is rejected atomically. **(PASS)**
   - Test 5: Last active Super Admin permanent access revocation is rejected. **(PASS)**
   - Test 6: Unauthorized caller invoking the RPC is rejected. **(PASS)**
   - Test 7: Forged `p_actor_id` parameter is detected and rejected. **(PASS)**
   - Test 8: Target user belonging to a different tenant is rejected. **(PASS)**
   - Test 9: Missing RPC or unapplied migration fails closed with `ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE`. **(PASS)**
   - Test 10: Database RPC execution failure returns controlled error without silent bypass. **(PASS)**
2. **Account Creation & Rollback (9 Assertions):**
   - Test 11: Auth creation success links authoritative user ID. **(PASS)**
   - Test 12: Auth creation failure aborts operation and returns descriptive error. **(PASS)**
   - Test 13: Duplicate email within tenant is rejected with 409 conflict message. **(PASS)**
   - Test 14: Existing legitimate Auth identity across tenants is safely linked. **(PASS)**
   - Test 15: Cross-tenant account linking rejected if already member of target tenant. **(PASS)**
   - Test 16: Profile creation failure triggers compensation rollback of created Auth user. **(PASS)**
   - Test 17: Membership creation failure triggers rollback of created Auth user, profile, and personnel. **(PASS)**
   - Test 18: Rollback failure produces an explicit `CRITICAL_PARTIAL_FAILURE` error. **(PASS)**
   - Test 19: Zero synthetic `usr_...` fallback under any failure path in `createOrLinkUserAccount`. **(PASS)**
3. **Password Recovery (5 Assertions):**
   - Test 20: Successful GoTrue request returns structured success without credential exposure. **(PASS)**
   - Test 21: GoTrue dispatch error propagates controlled failure instead of silent success. **(PASS)**
   - Test 22: Suspended account recovery attempt is rejected. **(PASS)**
   - Test 23: Zero token or recovery URL returned in API response payload. **(PASS)**
   - Test 24: UI does not claim user received email; acknowledges provider request status. **(PASS)**
4. **Access Revocation & State Separation (6 Assertions):**
   - Test 25: Revoke Access does not alter employment status in `public.personnel`. **(PASS)**
   - Test 26: Revoke Access does not modify payroll or compensation records. **(PASS)**
   - Test 27: Revoke Sessions invalidates sessions via GoTrue global sign-out. **(PASS)**
   - Test 28: Revoked account is marked suspended in `tenant_memberships` and inactive in `profiles`. **(PASS)**
   - Test 29: Reactivation authoritatively activates status without role modification. **(PASS)**
   - Test 30: Revoke Access preserves historical personnel and audit trail records. **(PASS)**
5. **Audit Logging (3 Assertions):**
   - Test 31: Audit insert failure aborts mutation by throwing fail-closed exception. **(PASS)**
   - Test 32: Route error handler captures exceptions and returns controlled HTTP error. **(PASS)**
   - Test 33: `recordFinanceAuditLogFailClosed` sanitizes passwords, tokens, and secrets from state. **(PASS)**

---

## 5. Migration Deployment Prerequisites & Operational Notes

When database migration execution is separately authorized:
1. **Apply Migration File:** `migrations/20261102_atomic_last_super_admin.sql` via Supabase migration CLI or direct psql connection.
2. **Postgres Role Verification:** Ensure migration is applied under the `postgres` role so `SECURITY DEFINER` function owner possesses necessary privileges.
3. **Verification Query:** Execute read-only verification query:
   ```sql
   SELECT proname, prosecdef, proleakproof, proowner::regrole
   FROM pg_proc
   WHERE proname = 'demote_or_suspend_super_admin';
   ```
4. **Zero Production Mutations Performed in Phase C220:** No remote database access, SQL execution, or deployment was conducted.

---

## 6. Verification Sign-Off

- **Phase Classification:** **`PASS`**
- **Safety Preflight:** Preserved primary worktree on `main` at `e463e370ae1aa24b4e7e08982cb2c10075ef39cf`.
- **Target Worktree:** Validated against candidate base `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`.
- **Remote Synchronization:** Strictly unauthorized. Zero pushes, merges, rebases, or releases executed.

*End of Phase C220 People & Access Security Defect Remediation Report.*

