# Clasptek Phase C238P — Operator Preflight Evidence Collection Report

**Date:** 2026-10-28
**Repository Root:** `C:\Users\CLASPTEK\Clasptek_Invoice`
**Target Staging Supabase Project:** `[STAGING_PROJECT_REF]`
**Protected Production Supabase Project:** `[PROTECTED_PROD_PROJECT_REF]` — PROTECTED; STRICTLY OUT OF SCOPE
**Prior Reference Assessment:** `reports/c238o_staging_readiness_evidence_review.md`
**Checklist Reference:** `reports/c238l_pre_execution_operator_checklist.md` (Corrected in C238N)
**Status:** COMPLETE (PREFLIGHT EVIDENCE TEMPLATE & PROTOCOL DOCUMENTED)

---

## Executive Summary

Phase C238P establishes the formal evidence collection protocol and documentation template for an authorized human system administrator prior to any staging database execution.

In strict compliance with governance rules:
- **Zero Database Operations by Assistant:** Antigravity does not connect to Supabase, query tables, export rows, or execute DDL.
- **Operator Manual Execution Only:** All live diagnostic queries, visual checks, data exports, and backup verifications must be executed manually by the authorized operator within the Supabase Dashboard.
- **Credential & Secret Protection:** Guidelines are enforced to ensure that OAuth tokens, client secrets, API keys, and personal student/staff records are never printed or committed to repository artifacts.
- **Classification Status:** Every operational requirement is tracked as `PENDING — OPERATOR ACTION REQUIRED` until verified by formal operator evidence.

---

## 1. Repository Baseline and Cryptographic Invariants

- **Repository Root:** `C:/Users/CLASPTEK/Clasptek_Invoice`
- **Active Git Branch:** `main`
- **HEAD Commit Hash:** `8b9ff979f5336e5a66d9b95ca7f546b5555abd5c`
- **Upstream Tracking:** `origin/main` (commit `323a5a2b30da824e81440bc8595fd11ce54b58c6`)
- **Formatting / Whitespace Check (`git diff --check`):** Exit code 0 (clean; no errors).
- **Frozen Bundle File:** `scripts/staging_reconciliation_bundle.sql`
  - Byte Size: `275,944` bytes (5,774 lines)
  - SHA-256 Digest: `cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2` (Verified invariant)
- **Google Meet Migration File:** `migrations/20261010_meetings_google_meet_provider.sql`
  - Byte Size: `2,277` bytes (57 lines)
  - SHA-256 Digest: `d6785afa47c8ebfe9e8f501beba3e54e345fee54f7c49b751f10f2f07cfcf978` (Verified invariant)
- **Operator Checklist File:** `reports/c238l_pre_execution_operator_checklist.md`
  - Byte Size: `17,152` bytes
  - SHA-256 Digest: `bb06f58845674f236dad5b00fa5bdda5aac1503abd7b0ce2887650dd02b696c4` (Verified corrected in C238N)

---

## 2. Operator Preflight Evidence Collection Items

Each required evidence item is detailed below with the exact verification method, instructions for recording evidence safely, and current verification status.

### Item 1: Exact Staging Project Identity (`[STAGING_PROJECT_REF]`)
- **Description:** Visual confirmation that the target Supabase project is strictly `[STAGING_PROJECT_REF]`.
- **Operator Action Required:**
  1. Open a browser and log into the Supabase Dashboard.
  2. Navigate to project: `https://supabase.com/dashboard/project/[STAGING_PROJECT_REF]`.
  3. Inspect the top-left project switcher and browser URL.
  4. Verify the Reference ID matches `[STAGING_PROJECT_REF]` character-for-character.
- **Evidence Recording Protocol:** Operator records the confirmation timestamp, dashboard URL prefix, and project name in the sign-off table.
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 2: Production Exclusion Confirmation (`[PROTECTED_PROD_PROJECT_REF]`)
- **Description:** Multi-layered verification ensuring live production project `[PROTECTED_PROD_PROJECT_REF]` is completely excluded from all terminals, local configurations, browser sessions, and external database tools.
- **Operator Action Required:**
  1. **Visual URL Confirmation:** Verify project reference `[STAGING_PROJECT_REF]` in the browser before opening any SQL editor or table editor.
  2. **Terminal Shell Environment Check:**
     ```bash
     env | grep -i [PROTECTED_PROD_PROJECT_REF]
     ```
     *(PowerShell: `Get-ChildItem Env: | Where-Object { $_.Value -like "*[PROTECTED_PROD_PROJECT_REF]*" }`)*
     Confirm command returns zero matches.
  3. **Local Environment File Inspection:** Inspect local `.env*` files (such as `.env.local`) to verify `[PROTECTED_PROD_PROJECT_REF]` is absent from database connection URLs. (Report only whether the production reference is absent, present, or unresolved; never display or print secret keys or tokens).
  4. **External Database GUI & Client Check:** Inspect any active external database GUI applications (e.g., pgAdmin, DBeaver, TablePlus, or VS Code database extensions) and confirm no active sessions or open connections target `[PROTECTED_PROD_PROJECT_REF]`. (Do not connect to production to check status).
  5. **Browser Session Isolation:** Confirm no open browser tabs are connected to project `[PROTECTED_PROD_PROJECT_REF]`.
  6. **STOP CONDITION:** If any target ambiguity remains, **HALT IMMEDIATELY**. Checking shell variables alone does NOT prove production exclusion.
- **Evidence Recording Protocol:** Operator attests in the Gate 3 form that layered checks (terminal, local files, database GUIs, browser) confirm production is strictly excluded.
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 3: Staging Backup / PITR Availability
- **Description:** Verification that a restorable backup snapshot exists for staging project `[STAGING_PROJECT_REF]`.
- **Operator Action Required:**
  1. In Supabase Dashboard for `[STAGING_PROJECT_REF]`, navigate to **Database** -> **Backups**.
  2. Check the timestamp of the latest automated daily backup, or click "Create backup" to generate a fresh snapshot.
  3. Confirm the backup status indicates "Healthy" or "Completed".
- **Evidence Recording Protocol:** Operator records the backup snapshot timestamp and snapshot reference identifier (do not paste internal URLs).
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 4: Pre-Execution Logical Row Export of Existing Tables
- **Description:** Preservation of existing rows from `public.google_drive_connections` and `public.meeting_recording_reconciliation_cursor` prior to executing any DDL, stored strictly outside the repository root.
- **Operator Action Required:**
  1. Create or designate an operator-selected, access-restricted directory located strictly **outside the repository root** (e.g., `C:\Clasptek_Secure_Backups\staging_c238p_pre_bootstrap\` or an encrypted external storage volume).
  2. Confirm the backup destination is **NOT** inside the workspace directory (`C:\Users\CLASPTEK\Clasptek_Invoice\`) to prevent accidental git tracking of OAuth secrets.
  3. Restrict filesystem permissions on this folder to authorized system administrators only.
  4. In Supabase Dashboard for confirmed staging project `[STAGING_PROJECT_REF]` -> **Table Editor**, export rows from:
     - `public.google_drive_connections` (CSV/JSON)
     - `public.meeting_recording_reconciliation_cursor` (CSV/JSON)
  5. Save exports into the secure external directory.
  6. Apply filesystem-level or tool-level encryption to the backup files containing sensitive OAuth tokens.
  7. Verify both exported files are non-empty, readable, and correspond to the confirmed staging project.
- **Evidence Recording Protocol:** Record only the external directory path, filenames, byte sizes, row counts, timestamps, and SHA-256 hashes of the export files.
  *(CRITICAL: NEVER print, paste, or commit export file contents, raw row data, or OAuth secrets in Git, reports, terminal logs, or shared chat).*
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 5: Staging Runtime Value of `GOOGLE_CALENDAR_INTEGRATION_ENABLED`
- **Description:** Verification that the Google Calendar integration feature flag is disabled (`false` or unset) in the staging deployment.
- **Operator Action Required:**
  1. In Vercel (or staging environment configuration), navigate to Project Settings -> **Environment Variables**.
  2. Filter by `GOOGLE_CALENDAR_INTEGRATION_ENABLED`.
  3. Confirm the variable is either **unset** or explicitly set to `false`.
  4. Confirm it is NOT set to `true`.
- **Evidence Recording Protocol:** Operator attests that `GOOGLE_CALENDAR_INTEGRATION_ENABLED` is confirmed unset or `false`.
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 6: Live Read-Only Preflight SQL Verification (Manual Execution by Operator)
- **Description:** Verification that the starting database state matches the expected pre-bootstrap baseline (2 base tables only, cursor at offset 0).
- **Operator Action Required:**
  1. Visually verify the Supabase SQL Editor URL explicitly references project `[STAGING_PROJECT_REF]` before entering queries.
  2. Execute **Query 1 (Table Inventory Count)**:
     ```sql
     SELECT count(*) AS base_table_count
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE';
     ```
     *Expected Output:* `base_table_count = 2`.
  3. Execute **Query 2 (Table Names)**:
     ```sql
     SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name;
     ```
     *Expected Output:* Exactly `google_drive_connections` and `meeting_recording_reconciliation_cursor`.
  4. Execute **Query 3 (Exact Cursor Invariant Check)**:
     ```sql
     SELECT cursor_name, category_offset, updated_at
     FROM public.meeting_recording_reconciliation_cursor
     WHERE cursor_name = 'global_cursor';
     ```
     *Required Output:* Exactly 1 row returned with `cursor_name = 'global_cursor'` and `category_offset = 0` (non-NULL).
  5. **RIGOROUS STOP CONDITIONS:**
     - If `base_table_count != 2`, **HALT IMMEDIATELY**.
     - If table names differ from `google_drive_connections` and `meeting_recording_reconciliation_cursor`, **HALT IMMEDIATELY**.
     - If Query 3 returns **0 rows** (row `global_cursor` missing), **HALT IMMEDIATELY**.
     - If Query 3 returns **multiple rows**, **HALT IMMEDIATELY**.
     - If `cursor_name != 'global_cursor'`, **HALT IMMEDIATELY**.
     - If `category_offset` is `NULL` or $\ne 0$ (e.g. $> 0$ or negative), **HALT IMMEDIATELY**.
     - If any SQL query returns a syntax or execution error, **HALT IMMEDIATELY**.
     - **DO NOT** attempt to insert, update, or manually repair the cursor row during preflight. Any anomaly requires an independent investigation and separate authorization.
- **Evidence Recording Protocol:** Operator records the query output summary and execution timestamp.
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

### Item 7: Gate 3 Formal Operational Authorization Sign-Off
- **Description:** Formal written approval by the designated system administrator authorizing execution of Step 1 (`scripts/staging_reconciliation_bundle.sql`) and Step 2 (`migrations/20261010_meetings_google_meet_provider.sql`) strictly against staging project `[STAGING_PROJECT_REF]`.
- **Operator Action Required:** Review all preceding evidence items, complete the sign-off table below, and append signature.
- **Current Status:** `PENDING — OPERATOR ACTION REQUIRED`

---

## 3. Preflight Evidence Summary Table

| Evidence Item | Target Scope | Classification Status | Required Operator Action |
| :---: | :--- | :---: | :--- |
| **EVD-01** | Staging Project Ref `[STAGING_PROJECT_REF]` | `PENDING — OPERATOR ACTION REQUIRED` | Visual confirmation in Supabase dashboard. |
| **EVD-02** | Production Ref `[PROTECTED_PROD_PROJECT_REF]` Excluded | `PENDING — OPERATOR ACTION REQUIRED` | Shell environment check (`env \| grep [PROTECTED_PROD_PROJECT_REF]`). |
| **EVD-03** | Staging Backup / PITR Point Available | `PENDING — OPERATOR ACTION REQUIRED` | Confirm snapshot in Dashboard -> Database -> Backups. |
| **EVD-04** | Existing-Data Rows Exported (2 Tables) | `PENDING — OPERATOR ACTION REQUIRED` | Export rows to offline encrypted backup file. |
| **EVD-05** | Feature Flag `GOOGLE_CALENDAR_INTEGRATION_ENABLED` | `PENDING — OPERATOR ACTION REQUIRED` | Confirm unset or `false` in Vercel / server settings. |
| **EVD-06** | Read-Only Preflight SQL Results | `PENDING — OPERATOR ACTION REQUIRED` | Execute Queries 1, 2, 3 in SQL Editor; record outputs. |
| **EVD-07** | Gate 3 Formal Execution Authorization | `PENDING — OPERATOR ACTION REQUIRED` | Complete and sign formal authorization form. |

---

## 4. Gate 3 Operational Sign-Off Form (Template)

```
================================================================================
CLASPTEK PHASE C238 — GATE 3 OPERATIONAL EXECUTION AUTHORIZATION
================================================================================

1. OPERATOR IDENTITY & ROLE:
   - Full Name: _______________________________________________________________
   - Role / Title: ____________________________________________________________
   - Date & Time (UTC): _______________________________________________________

2. TARGET SCOPE & ISOLATION ATTESTATION:
   [ ] Confirmed target database reference is strictly: [STAGING_PROJECT_REF]
   [ ] Confirmed multi-layer production exclusion (shell env, .env.local, database GUI tools, browser tabs)
   [ ] Confirmed zero references to [PROTECTED_PROD_PROJECT_REF] in any active tool

3. PRE-EXECUTION SAFEGUARDS COMPLETED:
   [ ] Supabase backup snapshot confirmed healthy (Snapshot ID / Time: ____________)
   [ ] Row export of google_drive_connections saved OUTSIDE repository root (e.g. C:\Clasptek_Secure_Backups\)
   [ ] Row export of meeting_recording_reconciliation_cursor saved OUTSIDE repository root
   [ ] Confirmed GOOGLE_CALENDAR_INTEGRATION_ENABLED is false or unset in staging runtime
   [ ] SQL preflight check confirmed: 2 base tables only, exactly 1 cursor row with category_offset = 0
   [ ] Bundle hash verified: cf84ed00a64b4044d2281435d23c9debcd1b151db9708aea146f9cee416064b2

4. AUTHORIZED OPERATIONS:
   [ ] Step 1: Execute scripts/staging_reconciliation_bundle.sql (Atomic transaction)
   [ ] Verify Step 1 postflight: 78 tables, LiveKit baseline provider constraint
   [ ] Step 2: Execute migrations/20261010_meetings_google_meet_provider.sql
   [ ] Verify Step 2 postflight: provider_room_url added, GOOGLE_MEET permitted

5. SIGNATURE & AUTHORIZATION:
   - Operator Signature: ______________________________________________________
================================================================================
```

---

## 5. Confirmation of Offline Execution

- **Database Connections:** 0 connections made to Supabase (neither staging `[STAGING_PROJECT_REF]` nor production `[PROTECTED_PROD_PROJECT_REF]`).
- **SQL Executions:** 0 SQL statements executed.
- **Source Mutations:** 0 source code, migration, bundle, or environment files modified.
- **Production Safety:** Production database `[PROTECTED_PROD_PROJECT_REF]` remains untouched and strictly protected.

---

## 6. Final Decision

All required preflight evidence items, manual verification queries, and authorization templates have been documented. Because the live operational checks and administrative sign-off are currently pending human operator execution:

### **`PREFLIGHT DOCUMENTED — EXECUTION NOT AUTHORIZED`**

*(Notice: This report establishes the exact protocol for evidence capture. Signing Gate 3 provides human administrative authorization only; it does NOT automatically remove or alter script execution guards such as EXECUTION_DISABLED = true, nor does it authorize unverified automation. No database execution is permitted until the operator completes the evidence items and signs Gate 3 authorization.)*
