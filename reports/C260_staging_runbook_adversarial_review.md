# C260 Staging Runbook Adversarial Review

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Phase:** C260 — Independent Final Execution-Gate Challenge
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Executive Summary & Objective

Phase C257-A established a 22-step Staging Execution Runbook (`C257_staging_execution_runbook.md`) intended for future authorized staging operations.

In this report, Phase C260 performs an adversarial review of this runbook to identify procedural gaps, ambiguous stop conditions, missing transaction guarantees, or unaddressed operational failure modes.

---

## 2. Review of the 22 Runbook Steps

| Step Range | Stage | Focus | Adversarial Assessment |
| :--- | :--- | :--- | :--- |
| **Steps 1–3** | Environment Identity | Staging ref validation, production quarantine, PostgreSQL version check. | **ROBUST.** Explicitly checks for `dwhjoiebzwnjdpcvcwvs` and aborts on any match with `logaawoigfxnisimfatf`. |
| **Steps 4–7** | Baseline Inspection | `schema_migrations` audit, table/routine inventory, partial migration check. | **ROBUST.** Establishes pre-migration baseline state before any write is attempted. |
| **Step 8** | Operator Approval | Explicit operator confirmation of migration hash `A43BDD1B...`. | **MANDATORY SAFETY GATE.** Prevents automatic unauthorized execution. |
| **Step 9** | Migration Application | Executing `20261105_c253_governance_revocation_boundary.sql`. | **NEEDS HARDENING.** Must explicitly mandate transaction wrapper (`psql -1` or `BEGIN ... COMMIT`). |
| **Steps 10–14** | Functional Validation | RPC grants, RLS, status enforcement, audit atomicity, last-Super-Admin protection, outbox enqueue. | **COMPREHENSIVE.** Covers all C252/C253 core requirements. |
| **Steps 15–18** | Revocation & Worker | Global sign-out, backoff retry, reactivation superseding, cron invocation. | **ADEQUATE.** Accurately tests the asynchronous lifecycle. |
| **Steps 19–20** | Provisioning Boundaries | Modern user creation and legacy provisioning 401/410 verification. | **ACCURATE.** Verifies elimination of direct PostgREST writes. |
| **Steps 21–22** | Isolation & Cleanup | Cross-tenant rejection and synthetic test cleanup. | **ESSENTIAL.** Verifies tenant boundaries and clean teardown. |

---

## 3. Identified Gaps & Mandatory Hardening

Our adversarial review identified three specific operational gaps in the runbook that must be addressed prior to execution authorization:

### Gap 1: Explicit Single-Transaction Flag in Step 9
- **Finding:** Step 9 states: "Execute `20261105_c253_governance_revocation_boundary.sql` via Supabase CLI or direct migration runner."
- **Risk:** If an operator uses `psql` without the `-1` flag or uses a script that autocommits individual statements, a mid-script failure would leave dropped RPCs un-recreated.
- **Mandated Fix:** Step 9 must explicitly specify:
  `psql "$STAGING_DATABASE_URL" -1 -f migrations/20261105_c253_governance_revocation_boundary.sql`
  or use a Node runner with explicit `client.query('BEGIN')` and `client.query('COMMIT')`.

### Gap 2: Vercel Plan Verification in Step 18
- **Finding:** Step 18 tests Vercel Cron invocation under the assumption of a 5-minute schedule.
- **Risk:** If the staging environment is deployed on a Vercel Hobby account, Vercel will not execute crons sub-daily (only once per 24 hours), causing automated test failure or silent omission of automated revocation.
- **Mandated Fix:** Step 18 must verify the Vercel hosting tier or establish an external HTTPS cron ping as a contingency.

### Gap 3: Baseline DB Snapshot Before Step 9
- **Finding:** Step 22 outlines synthetic test data cleanup, but does not provide a point-in-time recovery procedure if the migration causes unexpected schema regression.
- **Mandated Fix:** A pre-migration snapshot step must be inserted before Step 9:
  `pg_dump --schema-only "$STAGING_DATABASE_URL" > staging_pre_c253_schema_backup.sql`.

---

## 4. Runbook Review Verdict

With the three hardening amendments incorporated (Single-Transaction execution, Vercel tier check, and pre-migration schema dump), the 22-step staging runbook is **APPROVED FOR FUTURE AUTHORIZED EXECUTION**.
