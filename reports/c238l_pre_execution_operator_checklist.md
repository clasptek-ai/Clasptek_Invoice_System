# Clasptek Phase C238L — Pre-Execution Operator Checklist

**Date:** 2026-10-28
**Repository Root:** `C:\Users\CLASPTEK\Clasptek_Invoice`
**Target Staging Supabase Project:** `[STAGING_PROJECT_REF]`
**Protected Production Supabase Project:** `[PROTECTED_PROD_PROJECT_REF]` — PROTECTED; STRICTLY OUT OF SCOPE
**Prior Reference Assessments:**
- `reports/c238i_staging_baseline_bootstrap_safety_review.md`
- `reports/c238j_adversarial_baseline_bootstrap_verification.md`
- `reports/c238k_final_staging_bootstrap_authorization_readiness.md`
**Frozen Reconciliation Bundle:** `scripts/staging_reconciliation_bundle.sql` (SHA-256 `cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2`)
**Follow-up Migration:** `migrations/20261010_meetings_google_meet_provider.sql`
**Status:** `CHECKLIST PREPARED — STAGING EXECUTION NOT AUTHORIZED`

---

## Executive Summary

Phase C238L translates the static safety reviews and authorization readiness findings from C238I, C238J, and C238K into an evidence-based, step-by-step operational checklist for an authorized human administrator.

This document establishes:
1. **Prerequisite Classification:** Categorizes all technical and procedural requirements into `SOURCE-VERIFIED`, `OPERATOR-VERIFICATION-REQUIRED`, and `NOT-VERIFIED`.
2. **Distinct Governance Gates:** Enforces clear separation between Source Review Approval, Operational Environment Verification, Explicit Human Authorization, and Step-by-Step Execution.
3. **Strict Production Containment:** Explicit controls ensuring production database `[PROTECTED_PROD_PROJECT_REF]` cannot be targeted.
4. **Intermediate-State Guidance:** Clear operating instructions in the event that Step 1 (the baseline bundle) commits but Step 2 (the Google Meet migration) encounters a transient failure.
5. **No Blind Reruns or Destructive Rollbacks:** Explicit stop conditions and non-destructive forward remediation workflows.

---

## 1. Baseline and Input Artifact Verification

- **Repository Working Directory:** `C:/Users/CLASPTEK/Clasptek_Invoice`
- **Current Git Branch:** `main` | **HEAD Commit:** `8b9ff979f5336e5a66d9b95ca7f546b5555abd5c`
- **Upstream:** `origin/main`
- **Working-Tree Status:** Tracked and untracked C238 artifacts preserved. Zero code modifications, commits, or pushes.
- **Git Format Audit (`git diff --check`):** Exit code 0 (clean; no whitespace or line-ending violations).
- **Audit Reports Verified Present:**
  - `reports/c238i_staging_baseline_bootstrap_safety_review.md` (Verified present)
  - `reports/c238j_adversarial_baseline_bootstrap_verification.md` (Verified present)
  - `reports/c238k_final_staging_bootstrap_authorization_readiness.md` (Verified present)
- **Bundle Cryptographic Invariance:**
  - File: `scripts/staging_reconciliation_bundle.sql`
  - Byte Size: `275,944` bytes (5,774 lines)
  - SHA-256 Digest: `cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2` (Matches all prior audit phases).

---

## 2. Prerequisite Classification Matrix

Every requirement identified in Phase C238K is evaluated and categorized based on currently available offline repository evidence:

| ID | Prerequisite Description | Scope | Classification | Offline Evidence / Required Operator Action |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-01** | Bundle DDL & AST Safety (No destructive drops, 78 tables defined, atomic transaction) | Static Code | `SOURCE-VERIFIED` | Full 5,774-line AST audit completed in C238J. Zero table drops, atomic transaction envelope (`BEGIN` line 20, `COMMIT` line 5773). |
| **REQ-02** | Google Drive Access Model (`service_role` exclusive access; `anon`/`authenticated` revoked) | Static Code | `SOURCE-VERIFIED` | Code path traces in `api/_lib/google-oauth-config.js`, `api/auth/google/callback.js`, and `lib/meetings/recording-service.ts` confirm all queries use `service_role`. |
| **REQ-03** | Google Meet Migration Idempotency & Compatibility (`20261010_meetings_google_meet_provider.sql`) | Static Code | `SOURCE-VERIFIED` | Verified in C238J/K: uses `ADD COLUMN IF NOT EXISTS`, drops/recreates constraint, and creates partial index safely. |
| **REQ-04** | Target Project Identity (`[STAGING_PROJECT_REF]`) | Operational | `OPERATOR-VERIFICATION-REQUIRED` | Operator must visually verify active project ref in Supabase dashboard and verify shell variables before running any command. |
| **REQ-05** | Production Project Protection (`[PROTECTED_PROD_PROJECT_REF]`) | Operational | `OPERATOR-VERIFICATION-REQUIRED` | Operator must verify that `[PROTECTED_PROD_PROJECT_REF]` is not configured, referenced, or accessible in the execution shell. |
| **REQ-06** | Pre-Execution Logical Row Export (Preserving `google_drive_connections` and `meeting_recording_reconciliation_cursor`) | Operational | `OPERATOR-VERIFICATION-REQUIRED` | Operator must extract and securely store the existing rows before applying DDL changes. |
| **REQ-07** | Supabase Platform Snapshot / PITR Availability | Operational | `OPERATOR-VERIFICATION-REQUIRED` | Operator must verify in Supabase dashboard that an automated backup or manual snapshot is available. |
| **REQ-08** | Staging Starting State Invariants (2 base tables only; `category_offset = 0`) | Database | `NOT-VERIFIED` | Observed during C238F read-only discovery, but must be confirmed live by operator immediately prior to execution. |
| **REQ-09** | Feature Flag Containment (`GOOGLE_CALENDAR_INTEGRATION_ENABLED = false` or unset) | Deployment | `OPERATOR-VERIFICATION-REQUIRED` | Operator must confirm `GOOGLE_CALENDAR_INTEGRATION_ENABLED` is unset or set to `false` in staging runtime/Vercel before execution. |
| **REQ-10** | Execution Authorization | Governance | `NOT-VERIFIED` | Static source audits do not grant authorization. Formal written operator sign-off is required. |

---

## 3. Four-Gate Governance Model

To eliminate operational risk, the bootstrap process is partitioned into four sequential gates:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     GATE 1      │       │     GATE 2      │       │     GATE 3      │       │     GATE 4      │
│  Source Review  │ ────> │   Operational   │ ────> │ Explicit Human  │ ────> │   Step-by-Step  │
│    Approval     │       │   Readiness     │       │  Authorization  │       │    Execution    │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
 (COMPLETED C238K)          (CHECKLIST BELOW)        (PENDING OPERATOR)       (BLOCKED / FUTURE)
```

1. **Gate 1: Source Review Approval (COMPLETED):** Certified that SQL artifacts are non-destructive, complete, and syntactically valid.
2. **Gate 2: Operational Readiness (CURRENT):** Performing preflight checks, confirming project identity, taking backups, and verifying starting state.
3. **Gate 3: Explicit Human Authorization (PENDING):** Formal written approval by the designated system owner to proceed with staging maintenance.
4. **Gate 4: Step-by-Step Execution (BLOCKED):** Execution of Step 1 (reconciliation bundle), postflight verification, and Step 2 (Google Meet migration).

---

## 4. Step-by-Step Pre-Execution Operator Checklist

> [!CRITICAL]
> **OPERATIONAL SAFETY NOTICE**
> Do not copy, paste, or execute any SQL statement until Gate 2 and Gate 3 are completely verified and signed off. Every step must be executed in the exact order specified.

### Step 1 — Dashboard Identity & Project Containment

- [ ] **Visual URL Confirmation:** Open the browser and navigate to the Supabase Dashboard:
  `https://supabase.com/dashboard/project/[STAGING_PROJECT_REF]`
  - [ ] Verify the Project Reference in the URL and top-left header is exactly `[STAGING_PROJECT_REF]`.
  - [ ] Verify the Project Name corresponds to Clasptek Staging.
- [ ] **Production Strict Exclusion:**
  - [ ] Confirm project `[PROTECTED_PROD_PROJECT_REF]` (Production) is NOT open in any active browser tab.
  - [ ] In the terminal to be used for any operation, inspect environment variables:
    - Confirm `SUPABASE_URL` does NOT contain `[PROTECTED_PROD_PROJECT_REF]`.
    - Confirm `NEXT_PUBLIC_SUPABASE_URL` does NOT contain `[PROTECTED_PROD_PROJECT_REF]`.
    - If `[PROTECTED_PROD_PROJECT_REF]` is found anywhere in the shell environment, **HALT IMMEDIATELY**.

### Step 2 — Recovery Preparedness & Table Preservation

- [ ] **Supabase Automated Backup Verification:**
  - [ ] In the Supabase Dashboard for `[STAGING_PROJECT_REF]`, navigate to **Database** -> **Backups**.
  - [ ] Confirm a recent daily backup or Point-in-Time Recovery (PITR) point exists.
- [ ] **Pre-Execution Logical Export of Existing Tables:**
  - [ ] Using an authorized administrative tool (e.g. Supabase Table Editor or PostgREST export via service role), export the full row contents of:
    1. `public.google_drive_connections`
    2. `public.meeting_recording_reconciliation_cursor`
  - [ ] Store these export files in an encrypted, access-controlled offline directory (e.g. `backups/staging_c238l_pre_bootstrap/`).
  - [ ] Verify the export files are non-empty and readable.

### Step 3 — Live Database Preflight Verification (Read-Only)

- [ ] **Schema Starting State Check:**
  - [ ] In the Supabase SQL Editor for `[STAGING_PROJECT_REF]`, execute a read-only schema query:
    *(Future authorized query: Count base tables in `public` schema).*
  - [ ] Confirm that only 2 base tables exist: `google_drive_connections` and `meeting_recording_reconciliation_cursor`.
  - [ ] Confirm `public.meetings` does NOT currently exist.
- [ ] **Cursor Offset Invariant Check:**
  - [ ] Execute read-only query on cursor table:
    *(Future authorized query: `SELECT category_offset FROM public.meeting_recording_reconciliation_cursor WHERE cursor_name = 'global_cursor';`)*
  - [ ] Confirm `category_offset` equals `0`.
  - [ ] **STOP CONDITION:** If `category_offset > 0`, **DO NOT PROCEED**. Halting is required because background workers may be active.
- [ ] **Application Runtime Invariant:**
  - [ ] Confirm in Vercel or staging server settings that `GOOGLE_CALENDAR_INTEGRATION_ENABLED` is `false` or unset.

### Step 4 — Artifact Integrity Check

- [ ] **Verify Bundle Hash in Execution Environment:**
  - [ ] On the exact machine or terminal from which SQL will be uploaded/executed, compute the SHA-256 digest of `scripts/staging_reconciliation_bundle.sql`.
  - [ ] Verify digest exactly matches:
    `cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2`
  - [ ] **STOP CONDITION:** If the hash differs by even one character, **HALT IMMEDIATELY**.

---

### Step 5 — Baseline Bundle Execution (Step 1 of 2)

> [!NOTE]
> This step requires formal Gate 3 sign-off. It must be executed as a single atomic transaction.

- [ ] **Execute Reconciliation Bundle:**
  - [ ] Load the complete content of `scripts/staging_reconciliation_bundle.sql` into the Supabase SQL Editor (or execute via authorized runner).
  - [ ] Verify the script begins with `BEGIN;` and ends with `COMMIT;`.
  - [ ] Execute the query.
  - [ ] Confirm query execution returns success (`Success. No rows returned` or transaction committed).
  - [ ] **STOP CONDITION:** If any error is returned, PostgreSQL will have rolled back 100% of the transaction. Do NOT attempt manual statement-by-statement execution. Review the error log and report back.

### Step 6 — Step 1 Postflight Verification

- [ ] **Table Count Check:**
  - [ ] Run diagnostic query counting base tables in `public`.
  - [ ] Confirm exactly 78 base tables now exist.
- [ ] **Meetings Baseline Constraint Check:**
  - [ ] Inspect `public.meetings` table constraints.
  - [ ] Confirm constraint `meetings_provider_check` exists and allows `('LIVEKIT', 'DAILY', 'MOCK')`.
  - [ ] Confirm `GOOGLE_MEET` is NOT yet allowed (this confirms the certified baseline is intact).
- [ ] **Security Definer Functions Check:**
  - [ ] Verify `get_auth_tenant_id()`, `get_auth_student_ids()`, and `is_super_admin()` exist in schema `public`.

---

### Step 7 — Google Meet Provider Migration Execution (Step 2 of 2)

> [!NOTE]
> Execute Step 7 ONLY after Step 6 postflight verification has passed completely.

- [ ] **Execute Provider Migration:**
  - [ ] Load `migrations/20261010_meetings_google_meet_provider.sql` into the SQL Editor.
  - [ ] Execute the migration.
  - [ ] Confirm successful execution without errors.

### Step 8 — Final Post-Migration Verification

- [ ] **Provider Check Expansion:**
  - [ ] Verify `meetings_provider_check` now includes `GOOGLE_MEET`:
    `CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK', 'GOOGLE_MEET', 'livekit', 'daily', 'mock', 'google_meet'))`
- [ ] **Provider URL Column Verification:**
  - [ ] Verify `public.meetings` contains column `provider_room_url TEXT`.
- [ ] **Partial Index Verification:**
  - [ ] Verify index `idx_meetings_tenant_provider` exists on `public.meetings (tenant_id, provider) WHERE deleted_at IS NULL`.
- [ ] **Google Drive Table Integrity:**
  - [ ] Confirm `public.google_drive_connections` contains its original rows.
  - [ ] Confirm columns `connection_type`, `root_folder_id`, and `last_verified_at` exist.
  - [ ] Confirm RLS is enabled and `service_role` has full access.

---

## 5. Intermediate-State Failure Management

If Step 5 (Baseline Bundle) commits successfully but Step 7 (Google Meet Migration) encounters an error:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      INTERMEDIATE COMMITTED STATE                      │
├────────────────────────────────────────────────────────────────────────┤
│ • Baseline bundle committed successfully.                              │
│ • Staging has all 78 tables, RLS policies, and LiveKit meetings.       │
│ • meetings_provider_check = ('LIVEKIT', 'DAILY', 'MOCK').              │
│ • GOOGLE_MEET provider not yet enabled.                                │
│ • Database state is COHERENT, NON-CORRUPT, and FUNCTIONAL for LiveKit. │
└────────────────────────────────────────────────────────────────────────┘
```

### Safe Remediation Protocol:
1. **DO NOT PANIC AND DO NOT DROP TABLES:** The committed baseline is stable and safe.
2. **DO NOT ATTEMPT DESTRUCTIVE ROLLBACK:** Never run `DROP SCHEMA public CASCADE` or attempt to delete tables.
3. **ISOLATE THE ERROR:** Review the exact error message from `migrations/20261010_meetings_google_meet_provider.sql` (e.g. transient gateway timeout, locks).
4. **FORWARD RETRY:** Because `20261010_meetings_google_meet_provider.sql` is 100% idempotent, once the underlying transient cause is resolved, simply re-run `20261010_meetings_google_meet_provider.sql`.

---

## 6. Stop Conditions Summary

Execution must be **ABORTED IMMEDIATELY** upon encountering any of the following:

| Trigger Condition | Action | Rationale |
| :--- | :---: | :--- |
| Project URL is not `[STAGING_PROJECT_REF]` | **HALT** | Critical prevention of accidental execution against production. |
| Production project `[PROTECTED_PROD_PROJECT_REF]` found in shell env | **HALT** | Contaminated environment; risk to production. |
| Cursor `category_offset > 0` | **HALT** | Active recording workers detected; bootstrap unsafe. |
| SHA-256 hash does not match `cf84ed00...` | **HALT** | Bundle corrupted or modified. |
| Step 1 returns transaction error | **HALT** | Engine rolled back transaction; do not execute Step 2. |
| Step 1 postflight table count != 78 | **HALT** | Schema incomplete; investigate before proceeding. |

---

## 7. Operational Sign-Off Form (Gate 3)

*This section must be completed and signed by an authorized human system administrator prior to executing any SQL.*

- **Authorized System Administrator Name:** ___________________________
- **Confirmed Target Project Ref:** `[STAGING_PROJECT_REF]`
- **Confirmed Production Is Isolated:** [  ] YES
- **Confirmed Pre-Execution Exports Complete:** [  ] YES
- **Confirmed Bundle SHA-256 Verified:** [  ] YES
- **Execution Approval Granted Date & Time:** ___________________________
- **Signature:** ___________________________

---

## 8. Final Status

### **`CHECKLIST PREPARED — STAGING EXECUTION NOT AUTHORIZED`**

*(This document provides the complete operational sequence and safeguards. All database access and SQL execution remain strictly unauthorized until Gate 3 sign-off is completed by an authorized operator.)*
