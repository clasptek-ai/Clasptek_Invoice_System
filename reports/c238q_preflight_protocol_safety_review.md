# Clasptek Phase C238Q — Preflight Protocol Safety Review Report

**Date:** 2026-10-28
**Repository Root:** `C:\Users\CLASPTEK\Clasptek_Invoice`
**Target Staging Supabase Project:** `[STAGING_PROJECT_REF]`
**Protected Production Supabase Project:** `[PROTECTED_PROD_PROJECT_REF]` — PROTECTED; STRICTLY OUT OF SCOPE
**Review Target:** `reports/c238p_operator_preflight_evidence.md`
**Prior Reference Assessment:** `reports/c238o_staging_readiness_evidence_review.md`
**Status:** COMPLETE (DOCUMENTATION SAFETY REVIEW ONLY)

---

## Executive Summary

Phase C238Q conducted an adversarial safety, completeness, and consistency review of the operator preflight evidence protocol documented in `reports/c238p_operator_preflight_evidence.md`.

The audit evaluated all 10 mandated protocol dimensions. While the protocol establishes rigorous preflight controls and properly requires manual operator execution without automated assistant connections, **three critical clarifications and safety enhancements** were identified:
1. **Export Storage Security Risk:** C238P suggested saving table exports to `backups/staging_c238p_pre_bootstrap/`. Inspection of `.gitignore` confirms that `backups/` is **not** ignored. Saving exported rows containing OAuth credentials inside the repository root risks accidental git staging and credential exfiltration. Exports must strictly be saved to an encrypted path **outside** the repository root.
2. **Multi-Layer Production Exclusion:** Checking shell environment variables (`env | grep [PROTECTED_PROD_PROJECT_REF]`) is necessary but not sufficient on its own. The protocol must also require inspecting `.env.local` and verifying that external database clients (e.g., pgAdmin, DBeaver) do not hold active sessions to production.
3. **Cursor Invariant Boundary Conditions:** The cursor verification instructions specify stopping if `category_offset > 0`, but do not specify actions if the row `global_cursor` is missing (0 rows), duplicated (>1 rows), or contains `NULL`. The protocol must explicitly mandate that exactly 1 row must be returned with `category_offset = 0`, otherwise halting immediately.

Consequently, this review concludes with:
**`PROTOCOL REVIEW COMPLETE — CORRECTIONS REQUIRED BEFORE OPERATOR PREFLIGHT`**

---

## 1. Repository Baseline and Cryptographic Integrity

- **Repository Root:** `C:/Users/CLASPTEK/Clasptek_Invoice`
- **Active Git Branch:** `main`
- **HEAD Commit Hash:** `8b9ff979f5336e5a66d9b95ca7f546b5555abd5c`
- **Upstream Tracking:** `origin/main` (commit `323a5a2b30da824e81440bc8595fd11ce54b58c6`)
- **Formatting / Whitespace Audit (`git diff --check`):** Exit code 0 (clean; no errors).
- **Working-Tree Status:** All pre-existing tracked modifications and untracked artifacts remain intact. No code, migrations, or bundles were altered.
- **Audit Target File:** `reports/c238p_operator_preflight_evidence.md`
  - Byte Size: `12,850` bytes | SHA-256 Digest: `35081f3377f0d014eb066dff6d31bb03a69542a67eeb78950c4bb21a97d74dbd`
- **Frozen Reconciliation Bundle:** `scripts/staging_reconciliation_bundle.sql`
  - Byte Size: `275,944` bytes | SHA-256 Digest: `cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2` (Verified invariant)
- **Google Meet Migration:** `migrations/20261010_meetings_google_meet_provider.sql`
  - Byte Size: `2,277` bytes | SHA-256 Digest: `d6785afa47c8ebfe9e8f501beba3e54e345fee54f7c49b751f10f2f07cfcf978` (Verified invariant)

---

## 2. Evaluation of the 10 Protocol Dimensions

| Dimension | Evaluation Focus | C238P Section Reference | Finding Classification | Evaluation Details & Safety Assessment |
| :---: | :--- | :--- | :---: | :--- |
| **01** | Target Project Identity Precedence | Item 1 (lines 48–57), Item 6 (lines 114–115) | **PASS** | Target identity verification is placed first in sequence (Item 1). Must be confirmed in URL before opening SQL editor. |
| **02** | Production Exclusion Rigor | Item 2 (lines 60–72) | **NEEDS CLARIFICATION** | Shell `env \| grep` check is necessary but insufficient. Must also inspect local config (`.env.local`) and external GUI database client connections. |
| **03** | Scope of SQL Diagnostics | Item 6 (lines 116–140) | **PASS** | Queries 1, 2, and 3 are strictly read-only `SELECT` queries on `information_schema` and the cursor table. Zero mutations. |
| **04** | Cursor Row Edge Cases | Item 6 (lines 133–142) | **NEEDS CLARIFICATION** | Checks `category_offset > 0`, but does not define behavior if row is missing (0 rows), duplicated, or `NULL`. Must require exactly 1 row with offset 0. |
| **05** | Table Inventory Precondition Labeling | Executive Summary & Item 6 | **PASS** | Clearly designated as an expected precondition requiring live verification (`PENDING — OPERATOR ACTION REQUIRED`), not an assumed fact. |
| **06** | Backup Scope and Recovery Evidence | Item 3 (lines 75–84) | **PASS** | Specifies project `[STAGING_PROJECT_REF]`, requires verifying healthy snapshot, and mandates recording timestamp and snapshot reference ID. |
| **07** | Protection of Exported Rows & Secrets | Item 4 (lines 86–96) | **NEEDS CLARIFICATION** | Recommends `backups/staging_c238p_pre_bootstrap/`, which is NOT in `.gitignore`. Exporting inside repo creates severe credential leak hazard. Must mandate path outside workspace. |
| **08** | Calendar Feature Flag Scope | Item 5 (lines 100–108) | **PASS** | Explicitly specifies canonical name `GOOGLE_CALENDAR_INTEGRATION_ENABLED` in Vercel project settings, requiring it to be unset or `false`. |
| **09** | Gate 3 Sign-Off Completeness | Section 4 (lines 170–201) | **PASS** | Explicitly records operator name, role, UTC timestamp, target ref `[STAGING_PROJECT_REF]`, production exclusion, evidence reviewed, and signature. |
| **10** | Governance Independence & Non-Execution | Executive Summary & Section 6 | **PASS** | Explicitly states that collecting evidence and signing does not execute DDL or override governance controls. |

---

## 3. Detailed Safety Findings and Required Corrections

### Finding 1: Secret Exposure Prevention for Existing Row Exports (Item 4)
- **C238P Text (Line 92):**
  > `Save the files to a secure, encrypted offline directory (e.g. backups/staging_c238p_pre_bootstrap/).`
- **Vulnerability Analysis:**
  Inspection of [.gitignore](file:///C:/Users/CLASPTEK/Clasptek_Invoice/.gitignore) reveals that while `.env.local` and `.next/` are ignored, `backups/` is **not** ignored. If an operator creates a `backups/` directory inside the repository workspace, the exported rows from `public.google_drive_connections` (which contain active Google OAuth refresh tokens and access tokens) will appear as untracked files in `git status`. An accidental `git add .` or automated commit would immediately leak active credentials into version control history.
- **Required Correction:**
  The instruction must explicitly forbid storing exports inside the workspace directory.
  *Correction:*
  ```markdown
  Save the files strictly to an encrypted offline directory OUTSIDE the repository root
  (e.g., C:\Clasptek_Secure_Backups\staging_pre_bootstrap_20261028\ or a secure external drive).
  DO NOT create a backups folder inside the git repository.
  ```

---

### Finding 2: Multi-Layer Production Exclusion Assurance (Item 2)
- **C238P Text (Lines 63–70):**
  > `In the terminal session to be used for maintenance, run: env | grep -i [PROTECTED_PROD_PROJECT_REF]`
- **Vulnerability Analysis:**
  Shell environment variables represent only one potential connection vector. An operator might have:
  1. A `.env.local` file with `NEXT_PUBLIC_SUPABASE_URL` pointing to production that was not exported into shell environment variables.
  2. A local database management tool (e.g., pgAdmin, DBeaver, TablePlus, or VS Code SQL extension) connected to production `[PROTECTED_PROD_PROJECT_REF]` in an open background window.
  3. A browser tab with a cached session to the production dashboard.
- **Required Correction:**
  The protocol must require a three-point isolation verification:
  1. Terminal shell check (`env | grep [PROTECTED_PROD_PROJECT_REF]`).
  2. Local file inspection: Confirm `.env.local` in workspace does not point to `[PROTECTED_PROD_PROJECT_REF]`.
  3. External GUI check: Confirm zero database GUI tools or browser tabs have active connections to `[PROTECTED_PROD_PROJECT_REF]`.

---

### Finding 3: Rigorous Handling of Cursor Invariant Boundary Conditions (Item 6)
- **C238P Text (Lines 133–141):**
  > `SELECT cursor_name, category_offset, updated_at FROM public.meeting_recording_reconciliation_cursor WHERE cursor_name = 'global_cursor';`
  > `Expected Output: category_offset = 0.`
  > `STOP CONDITION: If base_table_count != 2 or category_offset > 0, HALT IMMEDIATELY.`
- **Ambiguity Analysis:**
  The stop condition only checks if `category_offset > 0`. It does not explicitly define what happens if:
  - The query returns **0 rows** (row `global_cursor` missing entirely).
  - The query returns **multiple rows** (cursor table integrity compromised).
  - `category_offset` is `NULL` or negative.
- **Required Correction:**
  *Correction:*
  ```markdown
  Expected Output: Exactly 1 row returned with cursor_name = 'global_cursor' and category_offset = 0.
  STOP CONDITION: If base_table_count != 2, OR row count != 1, OR cursor_name != 'global_cursor',
  OR category_offset IS NULL, OR category_offset != 0: HALT IMMEDIATELY.
  Do NOT attempt to insert, update, or repair the row manually.
  ```

---

### Finding 4: Clarification of Governance & Script Execution Guards (Section 6)
- **C238P Text (Lines 216–220):**
  > `Notice: This report establishes the exact protocol for evidence capture. No database execution is permitted until the operator completes the evidence items and signs Gate 3 authorization.`
- **Clarification Analysis:**
  The text should explicitly state that signing the Gate 3 form is a human administrative record and **does not** automatically alter execution guards in repository scripts (e.g., `EXECUTION_DISABLED = true` in `scripts/run_staging_reconciliation_bundle.js`). Script guards remain active until a separately authorized code change is approved.
- **Required Correction:**
  Add an explicit clause:
  > *Signing Gate 3 grants human operational authorization only. It does not automatically bypass or alter execution guards in repository scripts, which remain strictly disabled.*

---

## 4. Production Protection Mandate

> [!CRITICAL]
> **PRODUCTION DATABASE SECURITY INVARIANT**
> Supabase project `[PROTECTED_PROD_PROJECT_REF]` is the live, active production database of Clasptek. It is strictly protected. Under no circumstances may any preflight check, export, diagnostic, or maintenance query be executed against project `[PROTECTED_PROD_PROJECT_REF]`. All operator preflight activities are strictly restricted to staging project `[STAGING_PROJECT_REF]`.

---

## 5. Confirmation of Offline Execution

- **Database Connections:** 0 connections made to Supabase (neither staging `[STAGING_PROJECT_REF]` nor production `[PROTECTED_PROD_PROJECT_REF]`).
- **SQL Executions:** 0 SQL statements executed against any remote database.
- **File Modifications:** Only `reports/c238q_preflight_protocol_safety_review.md` was created. Target document `reports/c238p_operator_preflight_evidence.md` was not modified.
- **Production Safety:** Production database `[PROTECTED_PROD_PROJECT_REF]` remains untouched and strictly protected.

---

## 6. Final Decision

While the C238P operator preflight protocol is structured and comprehensive, the three identified safety and clarity corrections (export storage outside workspace, multi-layer production exclusion, and exact cursor boundary conditions) must be incorporated into the protocol before an operator proceeds with preflight:

### **`PROTOCOL REVIEW COMPLETE — CORRECTIONS REQUIRED BEFORE OPERATOR PREFLIGHT`**

*(Remediation: Apply the four specified safety corrections to `reports/c238p_operator_preflight_evidence.md` in a subsequent documentation phase before initiating operator preflight evidence collection.)*
