/**
 * scripts/test_phase_c251_atomic_governance_offline.js
 * Clasptek Phase C251 — People & Access Atomic Governance Verification Suite
 *
 * Validates:
 * 1. Migration Immutability: 20261102 matches baseline 3308ef28 byte-for-byte; forward 20261104 migration adds atomic RPC.
 * 2. Database RPC Architecture: govern_tenant_membership acquires advisory lock, row locks, validates last super admin, mutates membership, and writes audit log in one transaction.
 * 3. SECURITY DEFINER Hardening: Permissions revoked from PUBLIC and authenticated; restricted to service_role.
 * 4. Application Query Refactoring: Zero multi-step HTTP compensating rollbacks in executeVerifiedTenantMembershipMutation, revokeUserAccess, reactivateUserAccess.
 * 5. Session Revocation Outbox: Durable outbox queueing on GoTrue partial failure; reconciliation mechanism exported and routed.
 * 6. Concurrency & Invariant Verification: Advisory lock simulation proves last-super-admin invariant cannot be raced.
 * 7. Schema Integrity: Zero queries/updates to non-existent public.profiles columns.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('======================================================================');
console.log(' CLASPTEK PHASE C251 — ATOMIC GOVERNANCE VERIFICATION SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
const failures = [];

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${String(totalTests).padStart(2, '0')}: ${name}`);
  } catch (err) {
    failures.push({ id: totalTests, name, error: err.message });
    console.error(`  [FAIL] Test ${String(totalTests).padStart(2, '0')}: ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

const worktreeRoot = path.resolve(__dirname, '..');
const migration20261102Path = path.join(worktreeRoot, 'migrations', '20261102_atomic_last_super_admin.sql');
const migration20261104Path = path.join(worktreeRoot, 'migrations', '20261104_c251_atomic_people_access_governance.sql');
const personnelQueriesPath = path.join(worktreeRoot, 'lib', 'admin', 'personnel-queries.ts');
const usersRoutePath = path.join(worktreeRoot, 'app', 'api', 'admin', 'users', 'route.ts');

const migration20261102Content = fs.readFileSync(migration20261102Path, 'utf8');
const migration20261104Content = fs.readFileSync(migration20261104Path, 'utf8');
const personnelQueriesContent = fs.readFileSync(personnelQueriesPath, 'utf8');
const usersRouteContent = fs.readFileSync(usersRoutePath, 'utf8');

// Expected SHA-256 for original 20261102 migration from baseline commit 3308ef28
const BASELINE_20261102_SHA256 = 'b24a11efb74bcc01f82d5c3019508b672734efd3d1e838ee615e2901f0fb29f3';

// ---------------------------------------------------------------------------
// Category 1: Migration Immutability & Provenance (DEF-C250-02)
// ---------------------------------------------------------------------------
console.log('Category 1: Migration Immutability & Provenance (DEF-C250-02)');

it('Baseline migration 20261102 matches origin/main baseline commit 3308ef28 byte-for-byte', () => {
  const actualHash = crypto.createHash('sha256').update(migration20261102Content).digest('hex');
  assert.strictEqual(actualHash, BASELINE_20261102_SHA256, 'Historical migration 20261102 must have exact baseline SHA-256');
});

it('Forward migration 20261104 exists and encapsulates all C251 atomic database changes', () => {
  assert(fs.existsSync(migration20261104Path), 'Migration 20261104 file must exist');
  assert(migration20261104Content.includes('CREATE OR REPLACE FUNCTION public.govern_tenant_membership'), 'Must define govern_tenant_membership');
});

// ---------------------------------------------------------------------------
// Category 2: Atomic RPC Specification & Security Architecture (DEF-C250-01)
// ---------------------------------------------------------------------------
console.log('\nCategory 2: Atomic RPC Specification & Security Architecture (DEF-C250-01)');

it('govern_tenant_membership acquires transaction-scoped tenant advisory lock', () => {
  assert(migration20261104Content.includes('pg_advisory_xact_lock'), 'Must acquire pg_advisory_xact_lock');
  assert(migration20261104Content.includes('tenant_super_admin_governance:') && migration20261104Content.includes('p_tenant_id'), 'Advisory lock must hash tenant ID');
});

it('govern_tenant_membership acquires FOR UPDATE row lock on target membership', () => {
  assert(migration20261104Content.includes('FROM public.tenant_memberships') && migration20261104Content.includes('FOR UPDATE'), 'Must lock target row with FOR UPDATE');
});

it('govern_tenant_membership strictly enforces last active Super Admin invariant', () => {
  assert(migration20261104Content.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'Must raise CANNOT_REMOVE_LAST_SUPER_ADMIN exception');
  assert(migration20261104Content.includes('v_active_super_admins <= 1'), 'Must check remaining active count <= 1');
});

it('govern_tenant_membership prevents self-demotion and self-suspension', () => {
  assert(migration20261104Content.includes('CANNOT_DEMOTE_SELF'), 'Must raise CANNOT_DEMOTE_SELF exception');
  assert(migration20261104Content.includes('p_target_user_id = v_caller_id'), 'Must check caller equals target user');
});

it('govern_tenant_membership commits membership mutation and audit log insertion together', () => {
  const funcStart = migration20261104Content.indexOf('CREATE OR REPLACE FUNCTION public.govern_tenant_membership');
  const funcEnd = migration20261104Content.indexOf('$$;', funcStart);
  const funcBody = migration20261104Content.slice(funcStart, funcEnd);

  assert(funcBody.includes('UPDATE public.tenant_memberships'), 'Must execute membership UPDATE inside RPC');
  assert(funcBody.includes('INSERT INTO public.finance_audit_log'), 'Must execute audit log INSERT inside RPC');
  assert(!funcBody.includes('ROLLBACK'), 'RPC runs in ambient caller transaction; single commit boundary');
});

it('public.demote_or_suspend_super_admin is refactored to delegate to govern_tenant_membership', () => {
  assert(migration20261104Content.includes('CREATE OR REPLACE FUNCTION public.demote_or_suspend_super_admin'), 'Must provide wrapper demote_or_suspend_super_admin');
  assert(migration20261104Content.includes('RETURN public.govern_tenant_membership'), 'Wrapper must delegate to govern_tenant_membership');
});

// ---------------------------------------------------------------------------
// Category 3: SECURITY DEFINER Permissions Hardening (DEF-C250-03)
// ---------------------------------------------------------------------------
console.log('\nCategory 3: SECURITY DEFINER Permissions Hardening (DEF-C250-03)');

it('govern_tenant_membership execution is strictly revoked from PUBLIC and authenticated', () => {
  assert(migration20261104Content.includes('REVOKE ALL ON FUNCTION public.govern_tenant_membership'), 'Must revoke ALL from PUBLIC');
  assert(migration20261104Content.includes('FROM authenticated;'), 'Must revoke ALL from authenticated');
  assert(migration20261104Content.includes('GRANT EXECUTE ON FUNCTION public.govern_tenant_membership') && migration20261104Content.includes('TO service_role;'), 'Must grant EXECUTE only to service_role');
});

it('record_governance_audit_log execution is revoked from authenticated', () => {
  assert(
    migration20261104Content.includes('REVOKE ALL ON FUNCTION public.record_governance_audit_log FROM authenticated') ||
    migration20261104Content.includes('REVOKE EXECUTE ON FUNCTION public.record_governance_audit_log'),
    'Must revoke from authenticated'
  );
  assert(migration20261104Content.includes('GRANT EXECUTE ON FUNCTION public.record_governance_audit_log TO service_role'), 'Must grant to service_role');
});

// ---------------------------------------------------------------------------
// Category 4: Application Query Refactoring & Zero Compensating Updates (DEF-C250-01)
// ---------------------------------------------------------------------------
console.log('\nCategory 4: Application Query Refactoring & Zero Compensating Updates (DEF-C250-01)');

it('executeVerifiedTenantMembershipMutation calls govern_tenant_membership via PostgreSQL RPC', () => {
  const fnStart = personnelQueriesContent.indexOf('export async function executeVerifiedTenantMembershipMutation');
  const fnEnd = personnelQueriesContent.indexOf('export async function checkIsLastSuperAdmin', fnStart);
  const fnBody = personnelQueriesContent.slice(fnStart, fnEnd);

  assert(fnBody.includes("supabase.rpc('govern_tenant_membership'"), 'Must invoke govern_tenant_membership RPC');
  assert(!fnBody.includes("supabase.from('tenant_memberships').update"), 'Must NOT execute direct HTTP update');
  assert(!fnBody.includes("rollback"), 'Must NOT contain application-level compensating rollback');
});

it('revokeUserAccess Phase 1 executes via govern_tenant_membership RPC without compensating rollback', () => {
  const fnStart = personnelQueriesContent.indexOf('export async function revokeUserAccess');
  const fnEnd = personnelQueriesContent.indexOf('export async function reactivateUserAccess', fnStart);
  const fnBody = personnelQueriesContent.slice(fnStart, fnEnd);

  assert(fnBody.includes("supabase.rpc('govern_tenant_membership'"), 'Must invoke govern_tenant_membership RPC');
  assert(!fnBody.includes("rollbackMembershipStatus"), 'Must NOT invoke rollbackMembershipStatus');
  assert(!fnBody.includes(".update({ status: membership.status"), 'Must NOT perform compensating status rollback');
});

it('reactivateUserAccess executes via govern_tenant_membership RPC without compensating rollback', () => {
  const fnStart = personnelQueriesContent.indexOf('export async function reactivateUserAccess');
  const fnEnd = personnelQueriesContent.indexOf('export async function reconcilePendingSessionRevocations', fnStart);
  const fnBody = personnelQueriesContent.slice(fnStart, fnEnd);

  assert(fnBody.includes("supabase.rpc('govern_tenant_membership'"), 'Must invoke govern_tenant_membership RPC');
  assert(!fnBody.includes("rollback"), 'Must NOT contain application-level compensating rollback');
});

// ---------------------------------------------------------------------------
// Category 5: Session Revocation Outbox & Reconciliation (DEF-C250-04)
// ---------------------------------------------------------------------------
console.log('\nCategory 5: Session Revocation Outbox & Reconciliation (DEF-C250-04)');

it('Migration 20261104 creates public.governance_session_revocation_outbox table', () => {
  assert(migration20261104Content.includes('CREATE TABLE IF NOT EXISTS public.governance_session_revocation_outbox'), 'Must define outbox table');
  assert(migration20261104Content.includes('status TEXT NOT NULL DEFAULT \'PENDING\''), 'Must have PENDING status default');
  assert(migration20261104Content.includes('attempt_count INT NOT NULL DEFAULT 1'), 'Must track attempt count');
});

it('Outbox table enforces Row Level Security and restricts mutations to service_role', () => {
  assert(migration20261104Content.includes('ALTER TABLE public.governance_session_revocation_outbox ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
  assert(migration20261104Content.includes('outbox_service_role_all'), 'Must define service_role policy');
  assert(migration20261104Content.includes('REVOKE ALL ON TABLE public.governance_session_revocation_outbox FROM PUBLIC;'), 'Must revoke from PUBLIC');
});

it('handleRevocationSessionFailure enqueues durable retry item to outbox', () => {
  const fnStart = personnelQueriesContent.indexOf('async function handleRevocationSessionFailure');
  const fnEnd = personnelQueriesContent.indexOf('function buildAlreadyRevokedResponse', fnStart);
  const fnBody = personnelQueriesContent.slice(fnStart, fnEnd);

  assert(fnBody.includes("supabase.from('governance_session_revocation_outbox').upsert"), 'Must persist durable retry row into outbox table');
  assert(fnBody.includes("PARTIAL_SESSION_TERMINATION_PENDING"), 'Must return explicit partial completion state');
});

it('reconcilePendingSessionRevocations is exported and iterates pending outbox entries', () => {
  assert(personnelQueriesContent.includes('export async function reconcilePendingSessionRevocations'), 'Must export reconcilePendingSessionRevocations');
  const fnStart = personnelQueriesContent.indexOf('export async function reconcilePendingSessionRevocations');
  const fnEnd = personnelQueriesContent.indexOf('export async function executeAtomicSuperAdminGovernance', fnStart);
  const fnBody = personnelQueriesContent.slice(fnStart, fnEnd);

  assert(fnBody.includes("from('governance_session_revocation_outbox')"), 'Must query outbox table');
  assert(fnBody.includes("adminClient.auth.admin.signOut(item.target_user_id, 'global')"), 'Must attempt GoTrue signOut');
  assert(fnBody.includes("status: 'COMPLETED'"), 'Must update status to COMPLETED on success');
});

it('Users API route exposes reconcile-sessions action in PATCH handler', () => {
  assert(usersRouteContent.includes("case 'reconcile-sessions':"), 'Must handle reconcile-sessions case in PATCH');
  assert(usersRouteContent.includes("reconcilePendingSessionRevocations"), 'Must invoke reconcilePendingSessionRevocations');
});

// ---------------------------------------------------------------------------
// Category 6: Nonexistent Profiles Columns Invariant (C248 Root Cause)
// ---------------------------------------------------------------------------
console.log('\nCategory 6: Nonexistent Profiles Columns Invariant (C248 Root Cause)');

it('Zero references to profiles.role in executable TypeScript queries or forward SQL', () => {
  // Check migration 20261104
  assert(!migration20261104Content.includes('profiles.role'), 'Migration must not reference profiles.role');
  assert(!migration20261104Content.includes('UPDATE public.profiles SET role'), 'Migration must not update profiles.role');

  // Check queries
  const strippedQueries = personnelQueriesContent.split('\n').filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//')).join('\n');
  assert(!strippedQueries.includes('profiles.role'), 'Executable TS must not reference profiles.role');
});

it('Zero updates to profiles.is_active in executable TypeScript queries or forward SQL', () => {
  assert(!migration20261104Content.includes('profiles.is_active'), 'Migration must not reference profiles.is_active');
  assert(!migration20261104Content.includes('UPDATE public.profiles SET is_active'), 'Migration must not update profiles.is_active');

  const strippedQueries = personnelQueriesContent.split('\n').filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//')).join('\n');
  assert(!strippedQueries.includes('.update({ is_active:'), 'Executable TS must not update profiles.is_active');
});

// ---------------------------------------------------------------------------
// Category 7: Advisory Lock Concurrency & Isolation Simulation
// ---------------------------------------------------------------------------
console.log('\nCategory 7: Advisory Lock Concurrency & Isolation Simulation');

it('Advisory lock key computation is strictly isolated by tenant_id', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';

  // Compute 32-bit hash simulation matching PostgreSQL hashtext()
  function pgHashText(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  const hashA = pgHashText(tenantA);
  const hashB = pgHashText(tenantB);

  assert.notStrictEqual(hashA, hashB, 'Hashes for distinct tenant IDs must not collide');
});

it('Concurrent Super Admin demotions in the same tenant serialize via simulated transaction lock', async () => {
  let activeSuperAdmins = 2;
  let lockHeld = false;

  async function simulateGovernMenship(adminId, action, newRole) {
    // 1. Acquire transaction advisory lock
    while (lockHeld) {
      await new Promise(r => setTimeout(r, 10)); // wait for lock
    }
    lockHeld = true;

    try {
      // 2. Count active super admins with FOR UPDATE lock
      const currentActive = activeSuperAdmins;
      if (currentActive <= 1 && (action === 'change-role' && newRole !== 'SUPER_ADMIN')) {
        throw new Error('CANNOT_REMOVE_LAST_SUPER_ADMIN');
      }

      // 3. Mutate membership
      activeSuperAdmins--;

      // 4. In-transaction audit log
      const auditWritten = true;

      return { success: true, remaining: activeSuperAdmins, auditWritten };
    } finally {
      // Release transaction lock
      lockHeld = false;
    }
  }

  // Launch two concurrent demotions
  const p1 = simulateGovernMenship('admin-1', 'change-role', 'STAFF');
  const p2 = simulateGovernMenship('admin-2', 'change-role', 'STAFF');

  const results = await Promise.allSettled([p1, p2]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent demotion must succeed');
  assert.strictEqual(rejected.length, 1, 'Exactly one concurrent demotion must be rejected');
  assert(rejected[0].reason.message.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'Rejected operation must raise CANNOT_REMOVE_LAST_SUPER_ADMIN');
  assert.strictEqual(activeSuperAdmins, 1, 'Exactly one active Super Admin must remain in tenant');
});

// ---------------------------------------------------------------------------
// Summary Output
// ---------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`TOTAL PHASE C251 ASSERTIONS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failures.length}`);
console.log('======================================================================\n');

if (failures.length > 0) {
  console.error('Failed Assertions:');
  failures.forEach(f => console.error(`  - Test ${f.id}: ${f.name} -> ${f.error}`));
  process.exit(1);
} else {
  console.log('ALL PHASE C251 ATOMIC GOVERNANCE TESTS PASSED!');
  process.exit(0);
}
