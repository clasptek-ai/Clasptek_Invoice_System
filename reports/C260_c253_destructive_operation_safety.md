# C260 Destructive Operation Safety & Schema Alteration Audit

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Phase:** C260 — Independent Final Execution-Gate Challenge
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Executive Summary & Purpose

A critical concern raised during the audit of Phase C259 was whether the dynamic function drop loop and schema alterations in `migrations/20261105_c253_governance_revocation_boundary.sql` could cause unintended destruction of database objects or baseline capabilities.

This report presents a line-by-line forensic analysis of every destructive and modifying DDL operation in `20261105_c253_governance_revocation_boundary.sql`.

---

## 2. Dynamic Function Drop Loop Analysis (Lines 37–58)

The migration executes the following PL/pgSQL block to remove pre-existing RPC overloads:

```sql
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'govern_tenant_membership',
        'demote_or_suspend_super_admin',
        'record_governance_audit_log',
        'claim_session_revocations',
        'complete_session_revocation',
        'terminate_user_sessions',
        'governance_request_role'
      )
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $$;
```

### Forensic Findings:
1. **Strictly Whitelisted Function Names:**
   Only the 7 explicitly listed function names in the `public` schema are queried and dropped. No wildcards (`%`) or pattern matches are used.
2. **Preservation of Baseline Functions:**
   Baseline functions introduced in `20261102_atomic_last_super_admin.sql`:
   - `atomic_assign_role`
   - `atomic_suspend_personnel`
   - `atomic_reactivate_personnel`
   - `atomic_remove_personnel`
   These are **NOT** in the drop list. They remain untouched in the database, preserving backward compatibility for any existing system components that reference them.
3. **Absence of `CASCADE` (Fail-Safe Behavior):**
   The drop command is `DROP FUNCTION <sig>`. In PostgreSQL, omitting `CASCADE` defaults to `RESTRICT`.
   - If any view, foreign key, or trigger were to depend on any of these functions, PostgreSQL will raise an error (SQLSTATE `2BP01: dependent objects exist`) and immediately abort the transaction.
   - It is physically impossible for this script to silently cascade-delete dependent objects.
4. **Complete Re-creation in Same Script:**
   Every single one of the dropped governance functions is recreated later in the script with tightened SECURITY DEFINER attributes, fixed search paths, and strict PostgREST role checks.

---

## 3. Table Schema & Constraint Alteration Analysis

### A. Table: `public.governance_session_revocation_outbox`
- **Creation:** `CREATE TABLE IF NOT EXISTS` (Line 78). If the table already exists from an intermediate test branch (e.g. C249/C251), it is not dropped.
- **Column Extension:**
  Lines 95–104 add 9 columns using `ADD COLUMN IF NOT EXISTS`:
  `claim_token`, `claimed_by`, `lease_expires_at`, `next_attempt_at`, `max_attempts`, `superseded_at`, `superseded_reason`, `revocation_epoch`, `source_action`.
  - Existing columns and existing outbox records are completely preserved.
- **Constraint Replacement (Lines 110–127):**
  A dynamic block drops any existing check constraint matching `%status%` and adds `chk_gov_outbox_status`:
  `CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SUPERSEDED'))`
  - This safely accommodates legacy rows having `PENDING`, `COMPLETED`, or `FAILED` while permitting modern states `IN_PROGRESS` and `SUPERSEDED`.

### B. Table: `public.tenant_memberships`
- **Integrity Preservation:**
  The migration does **NOT** alter the status domain of `tenant_memberships`.
  - As confirmed in C253, the valid statuses remain `('active', 'suspended', 'invited')`.
  - The deprecated status `'deactivated'` is NOT injected into the enum/check, eliminating the SQLSTATE `23514` check constraint violation that broke earlier prototypes.
  - Deactivation operations cleanly map to status `'suspended'` while logging `'DEACTIVATE_USER'` in `audit_logs`.

---

## 4. Policy and Grant Hardening (Lines 136–189)

The migration replaces RLS policies on outbox tables:
1. `DROP POLICY IF EXISTS ... CREATE POLICY ...` pattern ensures idempotent application without naming conflicts.
2. Outbox table access is revoked from `PUBLIC`, `anon`, and `authenticated` for write operations.
3. Read access for `authenticated` is restricted to active `SUPER_ADMIN` users of the same tenant (Lines 139–151).
4. Full access is granted strictly to `service_role`.

---

## 5. Destructive Safety Conclusion

The DDL operations in `20261105_c253_governance_revocation_boundary.sql` are:
- **Surgically bounded** to modern governance and outbox components.
- **Fail-safe** due to the absence of `CASCADE`.
- **Non-destructive to existing data**, preserving existing outbox records and tenant memberships.
- **100% reversible** when executed under single-transaction semantics.
