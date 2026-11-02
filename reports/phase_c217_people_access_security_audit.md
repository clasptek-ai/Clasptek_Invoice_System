# Clasptek Phase C217 — Independent People & Access Security and Authorization Audit

**Repository:** `C:\Users\CLASPTEK\Clasptek_Invoice`  
**Target Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`  
**Target Branch:** `reconciliation/c201-c199-on-origin-main`  
**Base Commit (Pre-C216):** `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`  
**Remote `origin/main` State:** Verified synchronized at `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`  
**Primary Worktree:** `C:\Users\CLASPTEK\Clasptek_Invoice` on branch `main` at `e463e370ae1aa24b4e7e08982cb2c10075ef39cf` (100% Preserved & Untouched)  
**Production Database:** READ-ONLY QUARANTINE (Zero database queries or mutations executed)  
**Phase:** C217  
**Mode:** READ-ONLY INDEPENDENT SECURITY & AUTHORIZATION AUDIT  
**Date:** 2026-11-02  

---

## 1. Establish Exact Repository State

### 1.1 Primary Worktree
- **Location:** `C:\Users\CLASPTEK\Clasptek_Invoice`
- **Branch:** `main`
- **HEAD Commit:** `e463e370ae1aa24b4e7e08982cb2c10075ef39cf`
- **Status:** Contains 36 pre-existing modified files and 79 untracked files from earlier legacy workflows.
- **Integrity:** 100% preserved. Zero files staged, modified, committed, reset, or stashed during C216 or C217.

### 1.2 Target Reconciliation Worktree
- **Location:** `C:\Users\CLASPTEK\Clasptek_Invoice\scratch\c201_worktree`
- **Branch:** `reconciliation/c201-c199-on-origin-main`
- **HEAD Commit:** `9c88fb89fc00ae7b223ebde5949abaca29efb0e1` (Identical to live `origin/main` pushed in C215)
- **Candidate Base:** Exactly `9c88fb89fc00ae7b223ebde5949abaca29efb0e1`.
- **Status:** Unstaged C216 modifications isolated to People & Access module and corresponding offline test suite.

### 1.3 Other Existing Worktrees
- `C:/Users/CLASPTEK/clasptek-preview-candidate-c199`: on `preview/c199-isolated-candidate` (`f584bba`)
- `C:/Users/CLASPTEK/clasptek-preview-test`: on `preview/c53-meetings-routing` (`a6fac43`)
- `C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c238_pub_worktree`: detached at `fbb0b28`
- `C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c239_pub_worktree`: detached at `f383693`
- `C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c240_worktree`: detached at `160b268`
- `C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c240r_worktree`: detached at `1622641`
- `C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c240x_worktree`: detached at `35388de`

### 1.4 Exact C216 Changed Files and Diff Stat
```
 app/api/admin/users/route.ts                 |  166 +++-
 app/people-access/PeopleAccessPageClient.tsx | 1175 +++++++++++++++++++++++---
 lib/admin/personnel-queries.ts               |  344 ++++++++
 3 files changed, 1536 insertions(+), 149 deletions(-)

Untracked Evidence Artifacts:
?? reports/phase_c216_people_access_account_management_audit.md
?? scripts/test_phase_c216_people_access_offline.js
```

---

## 2. Password Reset and Credential Exposure

### 2.1 Code Inspection & Line References
- Implementation site: [`lib/admin/personnel-queries.ts`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/lib/admin/personnel-queries.ts#L410-L464) (`initiateAdminPasswordReset`)
- Route handler: [`app/api/admin/users/route.ts`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/app/api/admin/users/route.ts#L268-L286) (`case 'reset-password'`)
- Client trigger: [`app/people-access/PeopleAccessPageClient.tsx`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/app/people-access/PeopleAccessPageClient.tsx#L830-L867) (`handleConfirmResetPassword`)
- Client presentation: [`app/people-access/PeopleAccessPageClient.tsx`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/app/people-access/PeopleAccessPageClient.tsx#L2440-L2495) (`CredentialModal`)

### 2.2 Detailed Audit Answers

#### 1. Does the server generate a recovery link or an invitation link?
**Answer:** The server generates an *application-level pseudo-recovery token string*.  
*Reference:* `lib/admin/personnel-queries.ts` line 442:
```ts
const resetToken = `rst_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
```
It does **not** invoke Supabase GoTrue's authoritative recovery link generation API (`supabase.auth.admin.generateLink({ type: 'recovery', email })`). The client then constructs the URL (`${window.location.origin}/login?resetToken=${result.resetToken}`).

#### 2. Does the API return the complete single-use token or URL to the administrator's browser?
**Answer:** **YES.**  
*Reference:* `app/api/admin/users/route.ts` lines 280–285:
```ts
return NextResponse.json({
  success: true,
  message: 'Password reset initiated. Reset link and instructions generated.',
  resetToken: resetRes.resetToken,
  email: resetRes.email,
});
```
The token is sent directly to the administrator's browser in the HTTP response JSON and rendered into a readable text box inside the `CredentialModal` with a **"Copy Link"** button.

#### 3. Is the token stored in any database table, audit log, application log or browser persistence?
**Answer:** **NO.**
- *Audit Log:* In `lib/admin/personnel-queries.ts` line 455, only `{ resetRequestedAt: new Date().toISOString() }` is recorded in `finance_audit_log`. The token itself is excluded.
- *Database Tables:* The token is not written to `profiles`, `auth.users`, or any dedicated reset table.
- *Browser Persistence:* The token is held in component memory (`React.useState`), but is not stored in `localStorage` or `sessionStorage`.

#### 4. Is the reset link delivered directly to the target user's verified email?
**Answer:** **NO.**  
No email dispatch mechanism (SMTP, SendGrid, Postmark, or Supabase Auth email service) is invoked in `initiateAdminPasswordReset` or `/api/admin/users`. The system relies exclusively on the administrator copying the link from their screen and manually communicating it to the user.

#### 5. Can the administrator retrieve or reuse a user's reset token?
**Answer:** The administrator can view and copy the reset token when generated. However, because the server does not persist the token in a verification table, neither the administrator nor the user can currently have this token validated by the server upon landing at `/login?resetToken=...` unless a client route or Supabase GoTrue validates it.

#### 6. Are tokens single-use and expiration-bound?
**Answer:** **NO (Unenforced server-side).**  
Because the token is not stored in a database table with an `expires_at` column or tracked by Supabase GoTrue, there is no server-side mechanism enforcing that the token expires or is marked as consumed upon use.

#### 7. Can an unauthorized user invoke the endpoint?
**Answer:** **NO.**  
*Reference:* `app/api/admin/users/route.ts` lines 71–74:
```ts
const auth = await requireAuth(request, {
  allowedRoles: ['Super Admin'],
});
if (auth.errorResponse) return auth.errorResponse;
```
Unauthenticated callers receive HTTP 401; authenticated callers with roles other than `Super Admin` receive HTTP 403.

#### 8. Does the implementation prevent token leakage through error messages or logs?
**Answer:** **YES.**  
Error responses contain generic failure messages (`res.error`). `finance_audit_log` records metadata without storing secrets.

### 2.3 Security Finding: Administrator Credential Exposure (HIGH)
> [!WARNING]
> **Security Finding C217-01 (Credential Exposure to Administrator):**  
> Under standard cryptographic security practices, administrators should initiate a password reset while the authentication provider dispatches the reset link directly to the target user's verified email. Returning the recovery token or URL to the administrator's browser breaks non-repudiation and enables a malicious or compromised administrator to intercept the reset link and hijack another staff or facilitator account before the user receives it.
>
> **Recommended Safe Correction (For Phase C218):**  
> Update `initiateAdminPasswordReset` to invoke Supabase GoTrue's server-side dispatch API:
> ```ts
> await supabase.auth.resetPasswordForEmail(userEmail, {
>   redirectTo: `${getAppUrl()}/login/update-password`,
> });
> ```
> Omit `resetToken` from the API response payload. The administrator receives a confirmation notification (`"Password reset instructions have been dispatched to user's registered email"`), preventing recovery link exposure on the administrator's workstation.

---

## 3. Account Creation and Invitation Lifecycle

### 3.1 Code Inspection & Line References
- Query implementation: [`lib/admin/personnel-queries.ts`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/lib/admin/personnel-queries.ts#L487-L694) (`createOrLinkUserAccount`)
- Route handler: [`app/api/admin/users/route.ts`](file:///C:/Users/CLASPTEK/Clasptek_Invoice/scratch/c201_worktree/app/api/admin/users/route.ts#L36-L68) (`export async function POST`)

### 3.2 Key Findings on Account Creation

1. **Authentication Identity vs. Profile Creation:**
   - In `lib/admin/personnel-queries.ts` lines 550–563:
     ```ts
     userId = `usr_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
     await supabase.from('profiles').insert({ id: userId, email: normalizedEmail, ... });
     ```
   - In standard Supabase architectures, `public.profiles.id` and `public.tenant_memberships.user_id` are foreign keys referencing `auth.users(id)`.
   - `createOrLinkUserAccount` inserts directly into `public.profiles` and `public.tenant_memberships` using a synthetic string ID (`usr_...`) without calling `supabase.auth.admin.createUser({ email, ... })` or `supabase.auth.admin.inviteUserByEmail(email)`.
   - **Risk:** If the production database strictly enforces foreign key constraints (`REFERENCES auth.users(id)`), this insert will fail with a foreign key violation. Furthermore, without an entry in `auth.users`, the newly created user cannot authenticate through Supabase GoTrue.
2. **Personnel Record Reuse:**
   - Verified: If `payload.personnelId` is supplied or an existing personnel record matches `normalizedEmail`, the existing record is updated with `user_id = userId` (lines 572–608). No duplicate personnel rows are created.
3. **Duplicate Prevention:**
   - Verified: Checks both `profiles` and `tenant_memberships` (lines 536–548). If the user is already a member of `tenantId`, returns HTTP 400 (`"A user account with email '...' already exists in this organization."`).
4. **Tenant Membership Establishment:**
   - Verified: Inserts into `tenant_memberships` with `tenant_id = tenantId`, `user_id = userId`, `role = dbRole`, and `status = 'invited'`.
5. **Role Escalation During Creation:**
   - Verified: Only `Super Admin` can call `POST /api/admin/users`.
6. **No Client-Supplied Tenant ID:**
   - Verified: `tenantId` is sourced strictly from `auth.session.tenantId` via `requireAuth`.
7. **Failure and Rollback Paths:**
   - **Partial Failure Risk:** If `profiles` insert succeeds, but `personnel` insert or `tenant_memberships` insert fails (lines 639, 656), the operation returns an error but does **not** roll back the created `profiles` record. PostgREST does not support multi-statement transactions across discrete HTTP calls.

---

## 4. Role Escalation and Authorization Audit

### 4.1 Authorization Matrix

| Operation | Endpoint / Function | Server Role Gate | Self-Action Block | Last Super Admin Guard | Cross-Tenant Isolated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **List Users** | `GET /api/admin/users` | `Super Admin`, `Finance Manager` | N/A | N/A | Yes (`tenant_id`) |
| **View User Activity** | `GET /api/admin/users?action=activity` | `Super Admin`, `Finance Manager` | N/A | N/A | Yes (`tenant_id`) |
| **Create User Account** | `POST /api/admin/users` | `Super Admin` strictly | N/A | N/A | Yes (`tenant_id`) |
| **Change User Role** | `PATCH /api/admin/users` (`change-role`) | `Super Admin` strictly | Yes (`userId === auth.session.user.id`) | Yes (`checkIsLastSuperAdmin`) | Yes (`tenant_id`) |
| **Reset User Password** | `PATCH /api/admin/users` (`reset-password`) | `Super Admin` strictly | Allowed (Self-reset) | N/A | Yes (`tenant_id`) |
| **Resend Invitation** | `PATCH /api/admin/users` (`resend-invite`) | `Super Admin` strictly | N/A | N/A | Yes (`tenant_id`) |
| **Suspend Account** | `PATCH /api/admin/users` (`suspend`) | `Super Admin` strictly | Yes (`userId === auth.session.user.id`) | Yes (`checkIsLastSuperAdmin`) | Yes (`tenant_id`) |
| **Reactivate Account** | `PATCH /api/admin/users` (`reactivate`) | `Super Admin` strictly | N/A | N/A | Yes (`tenant_id`) |
| **Revoke Active Sessions** | `PATCH /api/admin/users` (`revoke-sessions`)| `Super Admin` strictly | UI Disabled | N/A | Yes (`tenant_id`) |

### 4.2 Findings on Role Escalation
- Server validation: Role is validated against `USER_ROLES` in `types/auth.ts` (`Super Admin`, `Finance Manager`, `Finance Staff`, `Staff`, `Facilitator`).
- Privilege escalation: Non-admins cannot invoke `POST` or `PATCH` routes. A `Finance Manager` cannot promote users to `Super Admin`.
- Self-action: A `Super Admin` cannot demote their own role or suspend their own account.

---

## 5. Last Super Admin Concurrency Assessment

### 5.1 TOCTOU Race Condition Analysis
`checkIsLastSuperAdmin` is implemented in `lib/admin/personnel-queries.ts` lines 356–370:
```ts
export async function checkIsLastSuperAdmin(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'SUPER_ADMIN')
    .eq('status', 'active');

  if (error || !data || data.length === 0) return false;
  return data.length === 1 && data[0].user_id === userId;
}
```

### 5.2 Concurrency Vulnerability (MEDIUM)
1. **Mechanism:** The check executes a standalone `SELECT` query. If `data.length > 1`, it returns `false`. The calling route then issues a separate `UPDATE tenant_memberships` in a subsequent HTTP query.
2. **Race Scenario:**
   - Suppose a tenant has exactly two Super Admins: Admin A and Admin B.
   - Admin A initiates demotion or suspension of Admin B.
   - Admin B simultaneously initiates demotion or suspension of Admin A.
   - Thread 1 checks: 2 active Super Admins found → `isLast` is `false`.
   - Thread 2 checks: 2 active Super Admins found → `isLast` is `false`.
   - Thread 1 updates Admin B to `STAFF` or `suspended`.
   - Thread 2 updates Admin A to `STAFF` or `suspended`.
   - **Result:** Both Super Admins are demoted/suspended. Zero active Super Admins remain in the tenant, permanently locking the organization out of administrative governance.
3. **Database Guard Assessment:**
   - Inspection of `supabase_schema.sql` confirms **zero** PostgreSQL constraints, triggers, or transaction locks enforce `COUNT(SUPER_ADMIN) >= 1`.
   - PostgREST REST calls do not support table locks or `SELECT FOR UPDATE`.
   - **Remediation Recommendation:** Implement an authoritative PostgreSQL RPC function (e.g. `demote_super_admin(target_user_id, tenant_id)`) with an atomic `SERIALIZABLE` transaction or `SELECT ... FOR UPDATE` lock.

---

## 6. Suspend, Reactivate, and Revoke Access Assessment

### 6.1 State Comparison Matrix

| Concept | C216 Implementation Status | Server-Side Mechanism | Login Block Effective? | Records Preserved? |
| :--- | :--- | :--- | :--- | :--- |
| **Suspend** | **Implemented** | Sets `tenant_memberships.status = 'suspended'` | **YES.** `lib/auth/server.ts` requires `.eq('status', 'active')`. Suspended users fail authentication immediately. | Yes (All personnel, payslips, and invoices preserved) |
| **Reactivate** | **Implemented** | Sets `tenant_memberships.status = 'active'` | **YES.** Restores authentication access under existing role. | Yes |
| **Revoke Access** | **NOT Implemented** | No permanent revocation state exists (only suspension or record deletion). | N/A | N/A |
| **Revoke Sessions** | **Partially Implemented (Audit Only)** | Inserts `REVOKE_USER_SESSIONS` into `finance_audit_log`. Does **not** call Supabase GoTrue `signOut()`. | **NO.** Existing active JWT access tokens remain valid until expiration. | Yes |

### 6.2 Semantic Mismatch Finding (MEDIUM)
> [!WARNING]
> **Security Finding C217-02 (Revoke Button Semantic Mismatch):**  
> In `PeopleAccessPageClient.tsx` (Users table), the action button is labeled **"Revoke"**. An administrator clicking this expects permanent access revocation. However, the handler calls `action: 'revoke-sessions'`. Furthermore, the server endpoint only writes an audit log entry and does not revoke actual Supabase Auth JWTs via `supabase.auth.admin.signOut(userId)`.
>
> **Recommended Correction (For Phase C218):**  
> 1. Rename the button to **"Revoke Sessions"** to reflect its true intent.
> 2. Implement actual session invalidation via `supabase.auth.admin.signOut(userId, 'global')`.
> 3. If permanent access revocation is required, introduce an explicit `Revoke Access` action that transitions membership status to `'deactivated'` or permanently removes tenant membership while preserving personnel records.

---

## 7. Tenant Isolation and Supabase Security

### 7.1 Multi-Tenant Boundary Review
- **`requireAuth` Server Verification:** Verified. Every route extracts `tenantId` from `auth.session.tenantId`. Client-supplied tenant IDs in request bodies are ignored.
- **Tenant Scope Enforcement:** Every query in `lib/admin/personnel-queries.ts` and `app/api/admin/users/route.ts` contains explicit `.eq('tenant_id', tenantId)` filters.
- **Target Account Verification:** In `initiateAdminPasswordReset` (lines 421–430), the server queries `tenant_memberships` for `(tenant_id, targetUserId)`. If not present, the request is rejected with `"User account not found within this organization"`. Cross-tenant targeting is impossible.
- **Service Role Key Hygiene:** Confirmed. No service-role key is exposed to client bundles or imported in client components.
- **Schema & Migrations:** Verified. Zero database migrations or schema alterations were applied during C216 or C217.

---

## 8. Audit Log Correctness

### 8.1 Audit Trail Verification
The following actions are recorded in `public.finance_audit_log` via `recordFinanceAuditLog`:
- `ACCOUNT_CREATED`: Actor, role, target user ID, name, assigned role, linked employee ID.
- `PASSWORD_RESET_INITIATED`: Actor, role, target user ID, name, reason.
- `CHANGE_USER_ROLE`: Actor, role, target user ID, old/new role.
- `TOGGLE_USER_STATUS`: Actor, role, target user ID, status transition.
- `DEACTIVATE_USER`: Actor, role, target user ID, suspension reason.
- `REACTIVATE_USER` / `UNLOCK_ACCOUNT`: Actor, role, target user ID.
- `REVOKE_USER_SESSIONS`: Actor, role, target user ID.
- `INVITATION_RESENT`: Actor, role, target user ID.

### 8.2 Audit Fail-Open Risk (LOW)
In `lib/finance/queries.ts` lines 59–80:
```ts
export async function recordFinanceAuditLog(entry): Promise<void> {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.from('finance_audit_log').insert(...);
    if (error) console.error('Audit log write error:', error.message);
  } catch (err) {
    console.error('Exception writing finance audit log:', err);
  }
}
```
`recordFinanceAuditLog` catches errors and logs them to the server console without throwing. If the audit insert fails (e.g., database timeout or table lock), the sensitive administrative operation (role change, suspension, account creation) **completes anyway**. In high-compliance environments, security-sensitive mutations should fail closed (abort) if the audit log entry cannot be written.

---

## 9. Test Quality Review

### 9.1 Static Code Assertions vs. Behavioral Testing
Inspection of `scripts/test_phase_c216_people_access_offline.js` reveals:
- **Test Methodology:** The suite performs static file content searches using string and regex pattern matching (`clientComponentSource.includes(...)`, `personnelQueriesSource.includes(...)`).
- **Limitation:** While static checks verify the existence of function exports, route cases, and SVG icons, they do **not** execute actual runtime HTTP requests, mock database transactions, or test error paths.
- **Missing Behavioral Tests:**
  1. *Unauthorized Password Reset:* Verifying that calling `PATCH /api/admin/users` with a `Finance Manager` or `Staff` cookie receives HTTP 403.
  2. *Cross-Tenant Reset Rejection:* Verifying that an admin in Tenant A submitting `userId` from Tenant B receives HTTP 400.
  3. *Recovery Token Invalidation:* Verifying token single-use expiration.
  4. *Concurrent Last Super Admin Race:* Simulating simultaneous demotion requests.
  5. *Actual Session Invalidation:* Verifying that a revoked user's active JWT is rejected.
  6. *Database FK Integrity:* Testing `createOrLinkUserAccount` against a PostgreSQL instance with strict foreign keys to `auth.users`.

---

## 10. Prioritized Security Recommendations

| Priority | Issue ID | Category | Finding Summary | Recommended Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **P1 — High** | C217-01 | Credential Exposure | Reset tokens and links are returned to the administrator's UI rather than dispatched directly to the target user's email. | Use `supabase.auth.resetPasswordForEmail` or direct SMTP dispatch. Remove reset token from API response JSON. |
| **P1 — High** | C217-02 | Auth Integration | Synthetic user IDs (`usr_...`) are inserted into `profiles` and `memberships` without creating records in `auth.users`. | Invoke `supabase.auth.admin.createUser` or `inviteUserByEmail` server-side so GoTrue credentials exist. |
| **P2 — Medium** | C217-03 | Concurrency | `checkIsLastSuperAdmin` is vulnerable to TOCTOU race conditions if two Super Admins simultaneously demote each other. | Implement an atomic PostgreSQL RPC (`demote_super_admin`) with a `SELECT FOR UPDATE` transaction. |
| **P2 — Medium** | C217-04 | UI Semantic Mismatch | Users table button labeled "Revoke" actually invokes "Revoke Sessions" and does not invalidate active JWTs in GoTrue. | Relabel button to "Revoke Sessions" and call `supabase.auth.admin.signOut(userId, 'global')`. |
| **P3 — Low** | C217-05 | Audit Fail-Open | `recordFinanceAuditLog` catches errors and does not abort mutations if audit logging fails. | Allow audit errors to throw or fail closed on security-critical user mutations. |

---

## 11. Final Phase Classification

```
========================================================================================
 FINAL CLASSIFICATION:
 PASS — AUDIT COMPLETE: SECURITY & AUTHORIZATION FINDINGS DOCUMENTED
========================================================================================
```

The C216 People & Access implementation has been independently audited. All authentication boundaries, role protections, last-super-admin logic, and credential workflows have been evaluated with exact file and line references. The identified security findings (credential presentation to admins, GoTrue identity synchronization, and concurrency atomicity) are thoroughly documented with actionable remediation paths for Phase C218.

