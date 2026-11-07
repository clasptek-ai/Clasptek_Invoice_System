# C320 — BASELINE ASSESSMENT & PRE-REMEDIATION AUDIT REPORT

**Phase:** C320 — Production Password Recovery Identity Isolation Remediation  
**Date:** November 7, 2026  
**Repository:** `C:\Users\CLASPTEK\Clasptek_Invoice`  
**Remediation Worktree:** `scratch/c320_remediation_worktree`  
**Remediation Branch:** `fix/c320-password-recovery-identity-isolation`  
**Base Commit:** `7aea7d6c88769b9ba01a2beaf6b6062b8fb75667`  
**Production Baseline:** `3308ef28fb3702905cdf7c19f7a6f12ecee83f34`  
**Audit Reference:** C319A Forensic Incident Investigation (`CONFIRMED AUTHENTICATION IDENTITY CONFUSION`)  
**Status:** PRE-REMEDIATION BASELINE ESTABLISHED & AUDITED

---

## 1. REMEDIATION WORKTREE & COMMIT LINEAGE

The remediation worktree was established on an isolated branch cleanly detached from production `main`:

```text
3308ef2 (Production Baseline on origin/main)
   └── 89afa43 (C253 Governance & Session Revocation Boundary)
         └── 7b4b729 (C290 Verified Integration & Hobby Cron Limit Cleanup)
               └── 92501b8 (C314 Google OAuth Fallback Path Remediation)
                     └── 7aea7d6 (C316 OAuth Semantics, Preview Guard & C110 Harness - Base HEAD)
                           └── fix/c320-password-recovery-identity-isolation (C320 Remediation Branch)
```

- **Working Directory:** `scratch/c320_remediation_worktree`
- **Branch:** `fix/c320-password-recovery-identity-isolation`
- **Base Commit SHA:** `7aea7d6c88769b9ba01a2beaf6b6062b8fb75667`
- **Cleanliness:** `git status` confirmed clean working tree (0 uncommitted files).
- **Target Files Parity:** Confirmed 0 diff between production baseline `3308ef28` and `7aea7d6` across all target remediation files (`app/dashboard/DashboardClient.tsx`, `lib/auth/context.tsx`, `app/login/page.tsx`, `proxy.ts`, `app/api/intelligence/overview/route.ts`). All changes will apply cleanly and remain cherry-pick compatible with the production baseline.

---

## 2. SUMMARY OF C319A FORENSIC FINDINGS

Phase C319A confirmed that **no database-level or API-level privilege escalation occurred**:
1. PostgreSQL RLS function `is_super_admin()` evaluates `get_auth_user_role() = 'SUPER_ADMIN'`, querying `public.tenant_memberships`.
2. Next.js server-side guard `requireAuth` strictly queries `tenant_memberships` where `user_id = auth.uid()`.
3. All administrative endpoints (`/api/admin/*`, `/controls`, `/audit-log`, etc.) fail closed with `403 Forbidden` for staff and facilitator accounts.

However, C319A identified four interlocking defects creating **Authentication Identity Confusion**:
1. **Short-Circuited Recovery Flow:** Next.js lacks a `/reset-password` route. When a user clicks a Supabase recovery link, GoTrue redirects to `https://app.clasptek.org/#access_token=...&type=recovery`. `@supabase/ssr` ingests the token, sets cookies, and `app/login/page.tsx` immediately redirects to `/dashboard` without ever prompting for a new password.
2. **Hardcoded Fallback Badge (`(role ?? 'SUPER ADMIN')`):** Line 477 of `app/dashboard/DashboardClient.tsx` explicitly renders `"SUPER ADMIN PORTAL"` when `role` is null or undefined.
3. **Hydration Race Condition:** Before `AuthProvider` finishes initial session hydration, `role` is `null`. The check `if (role === 'Facilitator' || role === 'Staff')` evaluates to `false`, rendering the Executive Management Dashboard instead of `StaffFacilitatorDashboard`.
4. **Broad Overview Read Authorization:** `app/api/intelligence/overview/route.ts` permits `'Staff'` and `'Facilitator'`, returning executive metrics (total invoiced, receivables) and reinforcing the user's perception of having Super Admin privileges.
5. **Session Contamination:** Administrators testing links in an active browser session are automatically recognized by their existing Super Admin cookies, routing to their own account.

---

## 3. PRE-EDIT SOURCE INVENTORY & DEFECT BASELINE

### Defect Call Site 1: `app/dashboard/DashboardClient.tsx` (Lines 310–318 & 476–478)
```tsx
// Current Line 310-318:
if (role === 'Facilitator' || role === 'Staff') {
  return (
    <AppLayout>
      <StaffFacilitatorDashboard ... />
    </AppLayout>
  );
}

// Current Line 476-478:
<span className="cp-pill paid">
  {(role ?? 'SUPER ADMIN').toUpperCase()} PORTAL
</span>
```
- **Flaw:** Missing loading gate when `role` is null; hardcoded fallback to `'SUPER ADMIN'`.

### Defect Call Site 2: `app/login/page.tsx` (Lines 28–32 & 236–242)
```tsx
// Current Line 28-32:
useEffect(() => {
  if (!isLoading && isAuthenticated) {
    router.replace(nextPath);
  }
}, [isAuthenticated, isLoading, nextPath, router]);

// Current Line 236-242:
<button
  type="button"
  id="forgot-password-btn"
  className="cp-auth-link"
  onClick={() => alert('Password reset: please contact your system administrator.')}
>
  Forgot Password?
</button>
```
- **Flaw:** Unconditional redirect on `isAuthenticated` bypasses recovery password update; "Forgot Password?" button displays an alert rather than routing to self-service recovery.

### Defect Call Site 3: `proxy.ts` (Lines 16–17)
```ts
// Current Line 16-17:
const PUBLIC_ROUTES = ['/login', '/apply', '/verify-certificate', '/applicant-portal', '/meet'];
```
- **Flaw:** `/reset-password` is missing from `PUBLIC_ROUTES`, which would cause edge proxy to intercept recovery requests before the client component can read the recovery hash fragment.

### Defect Call Site 4: `lib/auth/context.tsx` (Lines 70 & 117)
```ts
// Current Lines 70 & 117:
role: normalizeRole(user.user_metadata?.role as string),
```
- **Flaw:** Relies exclusively on `user_metadata?.role` without checking `public.tenant_memberships`. If metadata is empty or out of sync, role resolution fails to reflect database authority.

### Defect Call Site 5: `app/api/intelligence/overview/route.ts` (Lines 12–15)
```ts
// Current Lines 12-15:
const { session, errorResponse } = await requireAuth(request, {
  allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer', 'Staff', 'Facilitator'],
  requestedTenantId,
});
```
- **Flaw:** Grants Staff and Facilitator access to executive financial metrics (Total Invoiced, Amount Received, Overdue Receivables), creating confusion when staff see company-wide cash flow figures.

---

## 4. PRE-REMEDIATION BASELINE VERIFICATION

The codebase was validated prior to editing:
- Git Ref: `7aea7d6c88769b9ba01a2beaf6b6062b8fb75667`
- 13 Offline Certification Suites: 275/275 passing.
- Next.js Turbopack Compilation: 38/38 pages generated with zero warnings.
- Production Boundaries: All production databases, live records, and deployed environments remain completely untouched and frozen.

The remediation plan is authorized to proceed in `scratch/c320_remediation_worktree`.

