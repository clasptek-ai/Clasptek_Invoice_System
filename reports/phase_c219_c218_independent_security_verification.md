# Clasptek Phase C219 — Independent C218 Security Verification Report

**Repository:** `C:\Users\CLASPTEK\Clasptek_Invoice`  
**Target Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`  
**Target Branch:** `reconciliation/c201-c199-on-origin-main`  
**Candidate Base Commit:** `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`  
**Verification Mode:** STRICT READ-ONLY INDEPENDENT AUDIT & ADVERSARIAL VERIFICATION  
**Database Mutations:** ZERO (Offline fixtures, static AST analysis, isolated compilation)  
**Deliverable Date:** November 2, 2026  

---

## 1. Executive Summary & Verification Verdict

### Verification Verdict: `PARTIAL`

The C218 People & Access Security Remediation made substantial architectural advancements over the vulnerable C216 baseline:
1. **Token Exposure Removed:** Administrator-visible password-reset tokens and clipboard-copy buttons have been completely eliminated from both server routes and the client UI. Password reset now requests direct GoTrue delivery (`adminClient.auth.resetPasswordForEmail`).
2. **Identity Creation Integrated:** Server queries attempt to provision genuine Supabase Auth accounts (`adminClient.auth.admin.createUser`) and roll back auth identities if subsequent profile creation fails.
3. **Session vs Access Separation:** Independent operational pathways were introduced for session revocation (`admin.signOut(userId, 'global')`) versus access suspension.
4. **Fail-Closed Audit Logging:** Sensitive administrator mutations use `recordFinanceAuditLogFailClosed` which aborts mutations if the audit log cannot be written, and redacts sensitive parameters.

However, an independent adversarial inspection and static syntax review revealed **critical defects and design flaws** that prevent this implementation from receiving a `PASS` rating:
- **Fatal PostgreSQL Syntax Error in Migration:** The database migration `migrations/20261102_atomic_last_super_admin.sql` executes `SELECT count(*) INTO v_active_super_admins ... FOR UPDATE;`. In PostgreSQL, `FOR UPDATE` is strictly disallowed on aggregate functions (`ERROR: SELECT FOR UPDATE is not allowed with aggregate functions`). This migration will immediately fail if executed against a real database.
- **Missing RPC Caller Authorization (Privilege Escalation Risk):** The migration creates `demote_or_suspend_super_admin` as `SECURITY DEFINER` without executing `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` and without verifying in the function body that `p_actor_id` actually holds the `SUPER_ADMIN` role in `p_tenant_id`. Any authenticated tenant user could invoke this RPC directly to demote or suspend any user.
- **Application-Layer TOCTOU Race Condition:** Because the migration remains unapplied (and unappliable in its current form), the application falls back to a discrete check followed by an update. Two Super Admins simultaneously demoting each other both pass the check and demote each other, reducing the Super Admin count to zero.
- **Silent Fallback to Synthetic ID on Auth API Failure:** In `createOrLinkUserAccount`, if `auth.admin.createUser` fails (due to rate limiting, network failure, or invalid email), the code logs a console warning and silently falls back to generating a synthetic `usr_...` ID rather than failing closed. In production, this causes a foreign key constraint violation on `profiles.id -> auth.users.id`.
- **Silent Success on Password Reset Dispatch Failure:** In `initiateAdminPasswordReset`, if `resetPasswordForEmail` returns an error, the code logs a console warning but continues to write an audit log and returns `success: true` to the client.
- **Domain Overreach into HR/Payroll State:** In `revokeUserAccess`, revoking portal login access automatically marks `personnel.employment_status = 'deactivated'`, conflating application login revocation with HR employee termination.

---

## 2. Preflight and Environment State

### 2.1 Repository & Worktree Topology
- **Primary Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice`
  - Current Branch: `main`
  - Current HEAD: `e463e370ae1aa24b4e7e08982cb2c10075ef39cf`
  - Working Tree State: Clean (quarantined and 100% preserved; no checkout, reset, stash, or edits).
- **Target Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`
  - Current Branch: `reconciliation/c201-c199-on-origin-main`
  - Base Commit: `9c88fb89fc00ae7b223ebde5949abaca29efb0e1` (Parent of C216/C218 work)
  - Remote Tracking: Direct descendant of `f9c834d7108ed50ebea19c2207d2a31fd116e931` (which was successfully fast-forward pushed to `origin/main` in C215).

### 2.2 Working Tree Modifications in Target Worktree
Executing `git diff --stat` against candidate base `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`:
```text
 app/api/admin/users/route.ts                | 285 +++++++++++---------
 app/people-access/PeopleAccessPageClient.tsx | 385 ++++++++++++++++++++++------
 lib/admin/personnel-queries.ts              | 512 ++++++++++++++++++++++++++++++-------
 3 files changed, 903 insertions(+), 279 deletions(-)
```

Untracked files present in target worktree:
- `migrations/20261102_atomic_last_super_admin.sql` (182 lines)
- `reports/phase_c216_people_access_account_management_audit.md`
- `reports/phase_c217_people_access_security_audit.md`
- `reports/phase_c218_people_access_security_remediation.md`
- `scripts/test_phase_c216_people_access_offline.js`
- `scripts/test_phase_c218_security_remediation_offline.js`
- `scripts/test_phase_c219_adversarial_offline.js`

### 2.3 Git Whitespace & Line Ending Audit
`git -C scratch/c201_worktree diff --check` exited with code `0`. Zero whitespace errors or carriage-return conflicts detected.

---

## 3. Detailed Security Architecture & Code Inspection

### Area A: Password Reset Implementation (Zero Token Exposure)
- **Inspected Files:**
  - `lib/admin/personnel-queries.ts` lines 470–566 (`initiateAdminPasswordReset`)
  - `app/api/admin/users/route.ts` lines 270–292 (`PATCH /api/admin/users` action `reset-password`)
  - `app/people-access/PeopleAccessPageClient.tsx` lines 980–1045 (`credentialModal`)
- **Inspection Findings:**
  1. The server function `initiateAdminPasswordReset` checks whether the user account is suspended or the associated personnel is deactivated/terminated. If so, it rejects the request:
     ```ts
     if (membership.status === 'suspended') {
       return { success: false, error: 'Cannot initiate password reset for a suspended user account.' };
     }
     ```
  2. The function invokes GoTrue:
     ```ts
     const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email, {
       redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.clasptek.org'}/auth/reset-password`,
     });
     ```
  3. The return payload does **not** contain any token, link, or secret (`{ success: true, message: 'Password recovery email dispatched...' }`).
  4. The client modal has completely eliminated the token display field and clipboard-copy button. It presents a clean confirmation banner explaining that the recovery email was dispatched to the user's registered inbox.
- **Defect Identified (Defect 5):**
  If `resetPasswordForEmail` fails (`resetErr` is non-null), the function logs a `console.warn` but does **not** return `{ success: false, error: resetErr.message }`. Instead, it proceeds to record `PASSWORD_RESET_INITIATED` in the audit log and returns `success: true`. The administrator is falsely told the email was sent when delivery actually failed.

---

### Area B: Supabase Auth Identity Creation & Account Linking
- **Inspected Files:**
  - `lib/admin/personnel-queries.ts` lines 586–840 (`createOrLinkUserAccount`)
  - `app/api/admin/users/route.ts` lines 120–180 (`POST /api/admin/users`)
- **Inspection Findings:**
  1. `createOrLinkUserAccount` checks if a profile with the email already exists in `profiles`. If existing, it prevents duplicate creation and verifies if the user is already in `tenant_memberships` for this tenant.
  2. If the user does not exist, it calls `adminClient.auth.admin.createUser`:
     ```ts
     const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
       email: normalizedEmail,
       password: payload.tempPassword,
       email_confirm: false,
       user_metadata: { full_name: trimmedName, role: payload.role },
     });
     ```
  3. Rollback mechanics: If `auth.admin.createUser` succeeds (`createdAuthUserId` exists) but the subsequent `profiles` insert fails, it invokes:
     ```ts
     if (createdAuthUserId) {
       await adminClient.auth.admin.deleteUser(createdAuthUserId);
     }
     ```
  4. If personnel creation fails, it rolls back both the profile and the auth user.
- **Defect Identified (Defect 4):**
  If `auth.admin.createUser` fails (`authErr` is non-null), instead of failing closed and aborting, the code falls back to generating a synthetic string ID:
  ```ts
  userId = createdAuthUserId || `usr_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  ```
  In a production database where `profiles.id` has a foreign key constraint referencing `auth.users(id)`, inserting this synthetic ID into `profiles` will immediately throw a foreign key violation. Failing to fail closed on Auth API errors creates unstable divergent state.

---

### Area C: Last Super Admin Concurrency & SQL Migration Review
- **Inspected Files:**
  - `migrations/20261102_atomic_last_super_admin.sql` lines 1–182
  - `lib/admin/personnel-queries.ts` lines 400–468 (`executeAtomicSuperAdminGovernance`)
- **Inspection Findings:**
  1. The migration attempts to define an RPC function: `public.demote_or_suspend_super_admin`.
  2. **Fatal PostgreSQL Syntax Error (Defect 1):** Lines 50–56 execute:
     ```sql
     SELECT count(*)
     INTO v_active_super_admins
     FROM public.tenant_memberships
     WHERE tenant_id = p_tenant_id
       AND role = 'SUPER_ADMIN'
       AND status = 'active'
     FOR UPDATE;
     ```
     PostgreSQL's SQL grammar strictly prohibits combining `FOR UPDATE` with aggregate functions like `count(*)`. Executing this query in PostgreSQL yields:
     `ERROR: SELECT FOR UPDATE is not allowed with aggregate functions`
     The migration as written cannot be applied to any PostgreSQL instance.
  3. **Privilege Escalation Flaw (Defect 2):**
     The function is created with `SECURITY DEFINER` (running as the database owner/superuser), but:
     - It does **not** revoke execution permissions from `PUBLIC` (`REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;`).
     - It takes `p_actor_id` as an untrusted input argument, but does not verify whether `p_actor_id` actually has the `SUPER_ADMIN` role in `p_tenant_id`.
     - Consequently, any tenant user who knows the PostgREST RPC endpoint could call this function to demote or suspend any user in their tenant.
  4. **Application TOCTOU Concurrency Window (Defect 3):**
     Because the migration is unapplied, `executeAtomicSuperAdminGovernance` falls back to discrete queries:
     1. Query count of active Super Admins (`checkIsLastSuperAdmin`).
     2. Send discrete `UPDATE tenant_memberships` HTTP request.
     Under concurrent requests (e.g. Super Admin A demoting Super Admin B while Super Admin B demotes Super Admin A), both transactions read count = 2 simultaneously, both pass the check, and both updates commit, leaving 0 active Super Admins.

---

### Area D: Session Revocation vs Access Revocation
- **Inspected Files:**
  - `lib/admin/personnel-queries.ts` lines 842–975 (`revokeUserSessions`, `revokeUserAccess`, `reactivateUserAccess`)
  - `app/api/admin/users/route.ts` lines 230–270
  - `app/people-access/PeopleAccessPageClient.tsx` lines 180–240, 1100–1250
- **Inspection Findings:**
  1. The UI and server API clearly separate session termination from account suspension.
  2. `revokeUserSessions` calls `adminClient.auth.admin.signOut(userId, 'global')` to invalidate all active refresh tokens for the user in GoTrue, while leaving `tenant_memberships.status` active.
  3. `revokeUserAccess` calls `adminClient.auth.admin.signOut(userId, 'global')` AND updates `tenant_memberships.status = 'suspended'` and `profiles.is_active = false`.
  4. `reactivateUserAccess` restores `tenant_memberships.status = 'active'` and `profiles.is_active = true`.
- **Defect Identified (Defect 6):**
  In `revokeUserAccess` (lines 931–935), the function executes:
  ```ts
  await supabase
    .from('personnel')
    .update({ employment_status: 'deactivated', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  ```
  In Clasptek's multi-tenant architecture, `personnel.employment_status` is an HR/payroll domain attribute (governing whether a tutor/staff receives salary, is assigned to cohorts, or appears on payroll statements). Revoking web portal credentials should not deactivate an employee's employment status without explicit HR confirmation.

---

### Area E: Audit Logging Mechanics
- **Inspected Files:**
  - `lib/admin/personnel-queries.ts` lines 355–395 (`recordFinanceAuditLogFailClosed`)
- **Inspection Findings:**
  1. `recordFinanceAuditLogFailClosed` inspects the insert result from `finance_audit_log`. If the insert returns an error, it throws:
     ```ts
     throw new Error(`SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Failed to record authoritative audit event: ${error.message}`);
     ```
  2. It sanitizes input state by deleting sensitive keys (`password`, `tempPassword`, `token`, `secret`, `accessToken`, `refreshToken`, `invitationToken`).
  3. Mutations in `app/api/admin/users/route.ts` are gated by this fail-closed check.
- **Limitation Identified (Defect 7):**
  Because PostgREST HTTP calls lack distributed 2PC boundaries, if the audit log insert succeeds but the subsequent data mutation fails in a non-transactional route, an audit record exists for an action that did not complete. True atomicity requires encapsulating both operations in a database-level PL/pgSQL transaction.

---

## 4. Defect Registry & Severity Classification

| Defect ID | Severity | File & Location | Summary of Defect |
| :--- | :--- | :--- | :--- |
| **DEF-C219-01** | **CRITICAL** | `migrations/20261102_atomic_last_super_admin.sql`:50–56 | PostgreSQL syntax error: `SELECT count(*) ... FOR UPDATE` is prohibited on aggregate queries in PostgreSQL. Migration will abort on execution. |
| **DEF-C219-02** | **HIGH** | `migrations/20261102_atomic_last_super_admin.sql`:25–40 | Missing RPC authorization & caller verification in `SECURITY DEFINER` function. No `REVOKE EXECUTE ON FUNCTION FROM PUBLIC`. Untrusted caller can demote/suspend users. |
| **DEF-C219-03** | **HIGH** | `lib/admin/personnel-queries.ts`:435–465 | Application fallback suffers from a TOCTOU concurrency race condition when migration is unapplied; concurrent demotions can eliminate all Super Admins. |
| **DEF-C219-04** | **MEDIUM-HIGH** | `lib/admin/personnel-queries.ts`:657–674 | Silent fallback to synthetic `usr_...` ID when `auth.admin.createUser` fails. Fails open instead of failing closed; violates `profiles.id` foreign key constraints. |
| **DEF-C219-05** | **MEDIUM** | `lib/admin/personnel-queries.ts`:533–542 | Silent failure on password-reset dispatch: GoTrue errors are logged but ignored, falsely reporting success to caller and writing audit log. |
| **DEF-C219-06** | **MEDIUM** | `lib/admin/personnel-queries.ts`:931–935 | Domain overreach: `revokeUserAccess` mutates HR/payroll `personnel.employment_status = 'deactivated'` when merely revoking portal credentials. |
| **DEF-C219-07** | **LOW-MEDIUM** | `lib/admin/personnel-queries.ts`:360–395 | Non-atomic multi-statement transactions across discrete HTTP PostgREST calls; audit log divergence if mutation aborts post-audit. |

---

## 5. Automated Verification & Adversarial Execution Evidence

### 5.1 Test Execution Matrix

| Test Suite / Tool | Command Line | Assertions / Result | Exit Code | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Phase C219 Adversarial Suite** | `node scripts/test_phase_c219_adversarial_offline.js` | 13 Scenarios (10 PASS / 3 DEFECT DETECTED) | 0 | **VERIFIED** |
| **Phase C218 Security Suite** | `node scripts/test_phase_c218_security_remediation_offline.js` | 26 / 26 PASSED | 0 | **PASS** |
| **Phase C216 Account Management** | `node scripts/test_phase_c216_people_access_offline.js` | 36 / 36 PASSED | 0 | **PASS** |
| **Phase C209 Google Meet Suite** | `node scripts/test_phase_c209_google_meet_restoration_offline.js` | 18 / 18 PASSED | 0 | **PASS** |
| **Phase 9B Administration Governance** | `node scripts/test_phase9b_administration_governance.js` | 20 / 20 PASSED | 0 | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | 0 Type Errors | 0 | **PASS** |
| **ESLint Check** | `npx eslint app/api/admin/users/route.ts ...` | 0 Errors, 0 Warnings | 0 | **PASS** |
| **Production Webpack Build** | `npx next build --webpack` | 40 / 40 Static & Dynamic Routes | 0 | **PASS** |

### 5.2 Adversarial Scenarios Evaluation Breakdown

1. **Scenario 1 (Two concurrent Super Admin demotions in one tenant):**
   *Evaluation:* When the database migration is unapplied, the application fallback uses discrete `SELECT` followed by `UPDATE`. Two concurrent requests will both observe count = 2 and proceed to demote, leaving 0 Super Admins. **(DEFECT DETECTED)**
2. **Scenario 2 (Concurrent demotions across different tenants):**
   *Evaluation:* Both the proposed SQL migration and the TypeScript queries strictly filter on `tenant_id = p_tenant_id` and `.eq('tenant_id', tenantId)`. Cross-tenant mutations are prevented. **(PASS)**
3. **Scenario 3 (Suspended account password-reset attempt):**
   *Evaluation:* `initiateAdminPasswordReset` explicitly checks `membership.status === 'suspended'` and rejects the operation with an audit log. **(PASS)**
4. **Scenario 4 (Duplicate email account creation):**
   *Evaluation:* `createOrLinkUserAccount` checks `profiles` for existing email, returning a 409 conflict and preventing duplicate GoTrue identity creation. **(PASS)**
5. **Scenario 5 (Auth identity created but profile creation fails):**
   *Evaluation:* Rollback compensation executes `adminClient.auth.admin.deleteUser(createdAuthUserId)`. **(PASS)**
6. **Scenario 6 (Profile creation succeeds but membership creation fails):**
   *Evaluation:* Rollback compensation removes created profile and auth identity if tenant membership creation fails. **(PASS)**
7. **Scenario 7 (Cross-tenant existing-user linking attempt):**
   *Evaluation:* If a profile exists but has no membership in the current tenant, the user can be safely invited to the tenant while keeping the existing profile. **(PASS)**
8. **Scenario 8 (Revoked user with an otherwise valid issued JWT):**
   *Evaluation:* `revokeUserSessions` and `revokeUserAccess` call `adminClient.auth.admin.signOut(userId, 'global')` to invalidate refresh tokens and update membership to suspended. **(PASS)**
9. **Scenario 9 (Failed audit insert):**
   *Evaluation:* `recordFinanceAuditLogFailClosed` throws `SECURITY_AUDIT_LOG_FAILURE`, terminating the mutation. **(PASS)**
10. **Scenario 10 (Failed account mutation after successful audit insert):**
    *Evaluation:* Discrete PostgREST HTTP calls lack distributed 2PC transaction boundaries. Divergence will occur if network drops between audit insert and profile update. **(PASS with noted limitation)**
11. **Scenario 11 (Reactivation after permanent access revocation):**
    *Evaluation:* `reactivateUserAccess` authoritatively sets status back to `active` and records a `REACTIVATE_USER` audit event. **(PASS)**
12. **Scenario 12 (Revoke Access without changing employment or payroll status):**
    *Evaluation:* `revokeUserAccess` explicitly sets `personnel.employment_status = 'deactivated'`. Conflates application login credentials with employment contracts. **(DEFECT DETECTED)**
13. **Scenario 13 (SQL Migration Syntax Integrity):**
    *Evaluation:* `SELECT count(*) ... FOR UPDATE` is invalid in PostgreSQL. **(DEFECT DETECTED)**

---

## 6. SQL Migration Safety & Remediation Guidance

### Required Fix for `migrations/20261102_atomic_last_super_admin.sql`

To lock rows and count active Super Admins atomically in PostgreSQL without triggering `ERROR: SELECT FOR UPDATE is not allowed with aggregate functions`:

```sql
-- CORRECT IDIOMATIC POSTGRESQL ATOMIC ROW LOCKING & COUNT
SELECT count(*)
INTO v_active_super_admins
FROM (
  SELECT id
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND role = 'SUPER_ADMIN'
    AND status = 'active'
  FOR UPDATE
) locked_rows;
```

Furthermore, the function must be secured against unauthorized invocation:
```sql
-- 1. Restrict execution permissions
REVOKE ALL ON FUNCTION public.demote_or_suspend_super_admin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_or_suspend_super_admin TO service_role;

-- 2. Validate caller authorization inside function body
IF NOT EXISTS (
  SELECT 1 FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = auth.uid()
    AND role = 'SUPER_ADMIN'
    AND status = 'active'
) THEN
  RAISE EXCEPTION 'UNAUTHORIZED: Only an active Super Admin in this tenant may perform this operation.';
END IF;
```

---

## 7. Residual Risks & Deployment Prerequisites

1. **Do NOT Apply `20261102_atomic_last_super_admin.sql` as currently written:**
   Applying this migration will cause database migration runners to fail due to the invalid `FOR UPDATE` aggregate syntax.
2. **Do NOT Rely on Application Fallback for Super Admin Invariant:**
   Until the corrected SQL RPC is applied to PostgreSQL, simultaneous Super Admin demotions can lead to zero Super Admins.
3. **Fix Fail-Closed Fallback in Auth Creation:**
   `createOrLinkUserAccount` must immediately return an error if `admin.createUser` fails, rather than generating a synthetic `usr_...` ID.
4. **Decouple Portal Access Revocation from HR Personnel Status:**
   `revokeUserAccess` should deactivate `tenant_memberships` and `profiles` and terminate GoTrue sessions, but must not alter `personnel.employment_status` unless explicitly requested via an HR workflow.

---

## 8. Independent Verification Sign-Off

- **Classification:** **`PARTIAL`**
- **Safety Preflight:** Preserved primary worktree on `main` at `e463e370ae1aa24b4e7e08982cb2c10075ef39cf`.
- **Target Worktree:** Validated against candidate base `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`.
- **Remote Synchronization:** NOT AUTHORIZED. Zero pushes, merges, rebases, or deployments performed.
- **Database Access:** ZERO production or staging database mutations.

*End of Phase C219 Independent Security Verification Report.*

