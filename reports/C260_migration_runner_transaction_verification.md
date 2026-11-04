# C260 Migration Runner Transaction Verification Report

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Phase:** C260 — Independent Final Execution-Gate Challenge
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Executive Summary & Problem Formulation

A core claim evaluated in Phase C260 is:
*Is `migrations/20261105_c253_governance_revocation_boundary.sql` guaranteed to execute transactionally under the actual migration runner?*

Because `20261105_c253_governance_revocation_boundary.sql` begins by dynamically dropping all existing overloads of governance RPCs (Lines 37–58) and then creates the authoritative RPCs and outbox tables, a partial or un-transactional execution failure could result in a catastrophic intermediate state where functions are dropped but not recreated.

---

## 2. PostgreSQL DDL Transactionality Analysis

PostgreSQL uniquely supports transactional DDL (`CREATE TABLE`, `ALTER TABLE`, `DROP FUNCTION`, `CREATE FUNCTION`, `CREATE INDEX`, `GRANT`, `REVOKE` can all participate in transactions).

However, transactionality is determined by the **client runner protocol**:

| Runner Environment | Default Behavior | Atomicity Guarantee | Risk Assessment |
| :--- | :--- | :--- | :--- |
| **`psql` without `-1`** | Autocommits each statement independently. | **NONE** (Partial application possible). | HIGH RISK |
| **`psql -1` (`--single-transaction`)** | Wraps entire file in an implicit `BEGIN ... COMMIT`. | **100% ATOMIC** | ZERO PARTIAL RISK |
| **Supabase CLI (`supabase db push`)** | Executes migrations in a dedicated transaction per file. | **100% ATOMIC** | ZERO PARTIAL RISK |
| **Node.js `pg.Client.query(sql)`** | Sends entire multi-statement string in simple query protocol; executed inside a single implicit or explicit transaction block. | **ATOMIC IF WRAPPED** | LOW RISK |
| **Supabase Studio SQL Web Editor** | Splits on semicolons or runs statements sequentially depending on web UI version. | **UNPREDICTABLE** | CRITICAL RISK (Forbidden for staging) |

---

## 3. Analysis of `20261105_c253_governance_revocation_boundary.sql`

We inspected all 834 lines of `20261105_c253_governance_revocation_boundary.sql` for PostgreSQL statements that cannot run inside a transaction:
1. **`CREATE INDEX CONCURRENTLY`:** **NOT PRESENT.** All indexes use standard `CREATE INDEX IF NOT EXISTS` (Lines 129, 131, 133). Standard `CREATE INDEX` is fully transactional in PostgreSQL.
2. **`VACUUM`:** **NOT PRESENT.**
3. **`CLUSTER` without table:** **NOT PRESENT.**
4. **`ALTER TYPE ... ADD VALUE`:** **NOT PRESENT.** Table status uses `CHECK (status IN (...))` rather than enum alteration.
5. **`DISCARD ALL`:** **NOT PRESENT.**

**Conclusion:** `20261105_c253_governance_revocation_boundary.sql` contains **ZERO non-transactional statements**. The file is 100% eligible for single-transaction execution.

---

## 4. Failure Mode & Rollback Mechanics

### Scenario: Failure at Line 300 (Middle of Function Creation)
- **If executed under `BEGIN ... COMMIT`:**
  1. PostgreSQL encounters an error (e.g. syntax error or lock timeout).
  2. The transaction aborts (`ROLLBACK`).
  3. The dynamic function drops from Lines 37–58 are rolled back.
  4. The database returns exactly to its pre-migration state.
  5. **Data Loss / Downtime:** 0%.
- **If executed WITHOUT transaction wrapper:**
  1. Lines 37–58 commit: `govern_tenant_membership` and related RPCs are dropped.
  2. Middle statement fails.
  3. Database is left with NO governance RPCs; all admin personnel operations immediately crash with SQL function missing errors.
  4. **System Impact:** CATASTROPHIC PARTIAL STATE.

---

## 5. Execution Runner Requirement & Mandate

To eliminate the partial failure risk, the staging execution runner protocol for Phase C257-B must enforce one of the following two approved execution methods:

### Approved Method A: Node.js Transaction Runner
```javascript
// Enforces explicit BEGIN / COMMIT wrapper
await client.query('BEGIN');
try {
  await client.query(migrationSql);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
}
```

### Approved Method B: `psql` Single Transaction Mode
```bash
psql "$STAGING_DATABASE_URL" -1 -f migrations/20261105_c253_governance_revocation_boundary.sql
```

### Prohibited Execution Methods:
- Supabase Studio Web SQL Editor (Prohibited due to lack of verified atomic rollback).
- Copy-pasting individual blocks into interactive consoles.

**Final Verdict:** With explicit transaction wrapping mandated in the runbook, transactional execution is fully guaranteed.
