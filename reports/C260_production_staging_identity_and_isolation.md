# C260 Production & Staging Identity and Isolation Review

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Critical Production Identity Correction

> [!IMPORTANT]
> **PRODUCTION IDENTITY RECTIFICATION:**
> - **Production Reference:** `logaawoigfxnisimfatf`
>   This is the user's **actual live production database**, containing real student records, personnel accounts, invoices, and business data. It is **NOT** a disposable test database, and must **NOT** be categorized as "permanently quarantined" in an absolute sense.
> - **Staging Reference:** `dwhjoiebzwnjdpcvcwvs`
>   This is the designated, isolated staging database intended for pre-release migration verification and testing.
> - **The Isolation Policy:** `logaawoigfxnisimfatf` is **quarantined from staging, preview, and test operations**. Under no circumstances may staging scripts, tests, or migration runners connect to or mutate `logaawoigfxnisimfatf`. However, normal production application runtime traffic is authorized to access `logaawoigfxnisimfatf` when explicitly verified as a production deployment.

---

## 2. In-Depth Source Code & Guard Inspection

### A. Application-Layer Guard: `lib/supabase/project-guard.ts`
The application codebase enforces two distinct project references:
```typescript
export const PRODUCTION_PROJECT_REF = 'logaawoigfxnisimfatf';
export const STAGING_PROJECT_REF = 'dwhjoiebzwnjdpcvcwvs';
```

#### Seven Mandatory Safeguard Determinations:
1. **Rejection of Production Ref for Staging Operations:**
   In `validateSupabaseProjectRef(rawUrl, context)`:
   - When running in Preview or Staging (`isPreviewOrStagingEnvironment()`):
     ```typescript
     if (ref === PRODUCTION_PROJECT_REF) {
       throw new Error(
         `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the production project in a Preview or Staging environment. ` +
         `Production database access is strictly prohibited in Preview/Staging. Use staging project (${STAGING_PROJECT_REF}) instead.`
       );
     }
     ```
   - **Verdict: ENFORCED.**
2. **Explicit Staging Project Reference Required:**
   In Preview/Staging builds, if the project reference does not match `STAGING_PROJECT_REF`:
   ```typescript
   if (ref !== STAGING_PROJECT_REF) {
     throw new Error(
       `SUPABASE_CONFIG_ERROR: ${context} does not match the designated staging project (${STAGING_PROJECT_REF}).`
     );
   }
   ```
   - **Verdict: ENFORCED.**
3. **Rejection of Missing or Ambiguous Project References:**
   - If both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are provided but resolve to different references, `resolveValidatedSupabaseUrl` throws `SUPABASE_CONFIG_CONFLICT`.
   - If neither URL is provided, it throws `SUPABASE_CONFIG_ERROR`.
   - **Verdict: ENFORCED.**
4. **Prevention of Fallback to Production Credentials:**
   - No fallback from `STAGING_DATABASE_URL` to production database URLs exists.
   - If an unverified execution context attempts to connect to `logaawoigfxnisimfatf`, `validateSupabaseProjectRef` fails closed (Rule 4).
   - **Verdict: ENFORCED.**
5. **Target Verification Before Future Writes:**
   - Client factory functions (`createClient`, `createServerSupabaseClient`) invoke `resolveValidatedSupabaseUrl` prior to client instantiation.
   - **Verdict: ENFORCED.**
6. **Avoidance of Exclusive Reliance on Documentation:**
   - The boundary is actively enforced at runtime in TypeScript via regular expressions matching `https://<ref>.supabase.co`.
   - **Verdict: ENFORCED.**
7. **Protection of Production Without Disabling Production Application Access:**
   - When verified as production (`isVerifiedProductionEnvironment()`):
     ```typescript
     if (isVerifiedProductionEnvironment()) {
       if (ref === STAGING_PROJECT_REF) {
         throw new Error(`SUPABASE_CONFIG_CONFLICT: ... points to staging in Production.`);
       }
       if (ref === PRODUCTION_PROJECT_REF) {
         return trimmed; // AUTHORIZED FOR PRODUCTION
       }
     }
     ```
   - Live production application traffic to `logaawoigfxnisimfatf` is preserved and functional.
   - **Verdict: ENFORCED.**

---

### B. Database Migration Guard: `scripts/staging_connection_guard.js`
The database connection guard used by staging runner scripts enforces:
```javascript
const PROD_REF = 'logaawoigfxnisimfatf';
const EXPECTED_STAGING_REF = 'dwhjoiebzwnjdpcvcwvs';
```
1. **Raw String Quarantine:** If the raw connection string, username, password, pathname, search, or hostname contains `logaawoigfxnisimfatf`, it immediately throws:
   `QUARANTINE_VIOLATION: Production reference 'logaawoigfxnisimfatf' detected in database configuration!`
2. **Approved Host Matching:** Requires host `db.dwhjoiebzwnjdpcvcwvs.supabase.co` (direct) or matching AWS Supavisor pooler pattern.
3. **TLS Certificate Quarantine:** Any PEM CA certificate containing `logaawoigfxnisimfatf` is rejected.

---

## 3. Repository-Level Protection vs Live Environment Identity Verification

A vital distinction must be maintained:
- **Repository-Level Protection:** **VERIFIED.** The source code and migration scripts possess ironclad programmatic guards that prevent staging code from connecting to production `logaawoigfxnisimfatf`.
- **Live Environment Identity Verification:** **UNVERIFIED.** Because zero network calls were made under `EXECUTION_DISABLED=true`, no remote query has confirmed that the physical staging server currently running at `dwhjoiebzwnjdpcvcwvs` is reachable, healthy, or correctly provisioned with credentials. That remains a live prerequisite for Phase C257-B (Runbook Step 1).
