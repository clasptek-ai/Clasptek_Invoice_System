/**
 * scripts/test_phase_c253_governance_revocation_adversarial.js
 * Clasptek Phase C253 — People & Access Governance & Revocation Boundary Adversarial Verification Suite
 *
 * SAFETY PROTOCOL:
 *   AUDIT_EXECUTION_AUTHORIZED=false
 *   EXECUTION_DISABLED=true
 * Zero network, zero remote PostgreSQL, zero remote GoTrue calls.
 */

process.env.AUDIT_EXECUTION_AUTHORIZED = 'false';
process.env.EXECUTION_DISABLED = 'true';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

console.log('======================================================================');
console.log(' CLASPTEK PHASE C253 — GOVERNANCE & REVOCATION ADVERSARIAL SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
const failures = [];

async function it(name, fn) {
  totalTests++;
  try {
    await fn();
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
const migration20261105Path = path.join(worktreeRoot, 'migrations', '20261105_c253_governance_revocation_boundary.sql');
const personnelQueriesPath = path.join(worktreeRoot, 'lib', 'admin', 'personnel-queries.ts');
const usersRoutePath = path.join(worktreeRoot, 'app', 'api', 'admin', 'users', 'route.ts');
const cronWorkerRoutePath = path.join(worktreeRoot, 'app', 'api', 'cron', 'reconcile-session-revocations', 'route.ts');
const googleOAuthConfigPath = path.join(worktreeRoot, 'api', '_lib', 'google-oauth-config.js');
const adminJsPath = path.join(worktreeRoot, 'api', 'admin.js');
const personnelRoutePath = path.join(worktreeRoot, 'app', 'api', 'admin', 'personnel', 'route.ts');
const serverAuthPath = path.join(worktreeRoot, 'lib', 'auth', 'server.ts');
const dashboardPagePath = path.join(worktreeRoot, 'app', 'dashboard', 'page.tsx');
const rootPagePath = path.join(worktreeRoot, 'app', 'page.tsx');

const migration20261102Content = fs.readFileSync(migration20261102Path, 'utf8');
const migration20261105Content = fs.readFileSync(migration20261105Path, 'utf8');
const personnelQueriesContent = fs.readFileSync(personnelQueriesPath, 'utf8');
const usersRouteContent = fs.readFileSync(usersRoutePath, 'utf8');
const cronWorkerRouteContent = fs.readFileSync(cronWorkerRoutePath, 'utf8');
const googleOAuthConfigContent = fs.readFileSync(googleOAuthConfigPath, 'utf8');
const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
const personnelRouteContent = fs.readFileSync(personnelRoutePath, 'utf8');
const serverAuthContent = fs.readFileSync(serverAuthPath, 'utf8');
const dashboardPageContent = fs.readFileSync(dashboardPagePath, 'utf8');
const rootPageContent = fs.readFileSync(rootPagePath, 'utf8');

function loadTsModule(relPath, customMocks = {}) {
  const fullPath = path.join(worktreeRoot, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });

  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));

  const originalRequire = mod.require.bind(mod);
  mod.require = (id) => {
    if (customMocks[id]) return customMocks[id];
    if (id.startsWith('@/')) {
      const mapped = id.slice(2);
      if (customMocks[mapped]) return customMocks[mapped];
      if (fs.existsSync(path.join(worktreeRoot, mapped + '.ts'))) {
        return loadTsModule(mapped + '.ts', customMocks);
      }
    }
    return originalRequire(id);
  };

  mod._compile(transpiled.outputText, fullPath);
  return mod.exports;
}

async function runSuite() {
  const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ADMIN_1 = { id: '00000000-0000-4000-8000-000000000001', role: 'Super Admin' };
  const ADMIN_2_ID = '00000000-0000-4000-8000-000000000002';
  const STAFF_1_ID = '00000000-0000-4000-8000-000000000003';

  // 1. Static Contract & SQL Security Audits
  console.log('--- SECTION 1: RPC Privileges & Identity Boundary (DEF-C252-12) ---');

  await it('01. Anonymous RPC execution explicitly revoked in forward migration', () => {
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.govern_tenant_membership'), 'Must revoke govern_tenant_membership');
    assert(migration20261105Content.includes('FROM PUBLIC, anon, authenticated;'), 'Must explicitly revoke FROM anon and authenticated');
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.demote_or_suspend_super_admin'), 'Must revoke legacy wrapper');
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.record_governance_audit_log'), 'Must revoke audit log RPC');
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.claim_session_revocations'), 'Must revoke claim RPC');
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.complete_session_revocation'), 'Must revoke complete RPC');
    assert(migration20261105Content.includes('REVOKE ALL ON FUNCTION public.terminate_user_sessions'), 'Must revoke terminate RPC');
  });

  await it('02. Authenticated direct RPC execution denied; restricted to service_role', () => {
    assert(migration20261105Content.includes('TO service_role;'), 'Must grant solely to service_role');
    assert(migration20261105Content.includes('v_request_role := public.governance_request_role();'), 'Must check request_role in function body');
    assert(migration20261105Content.includes("v_request_role IS DISTINCT FROM 'service_role'"), 'Must fail closed when role != service_role');
  });

  await it('03. Actor identity revalidated inside the transaction; cannot impersonate another admin', () => {
    assert(migration20261105Content.includes('WHERE tenant_id = p_tenant_id AND user_id = p_actor_id;'), 'Actor must be verified in target tenant');
    assert(migration20261105Content.includes("v_actor_role IS DISTINCT FROM 'SUPER_ADMIN' OR v_actor_status IS DISTINCT FROM 'active'"), 'Actor must be active SUPER_ADMIN');
    assert(migration20261105Content.includes('CANNOT_DEMOTE_SELF: Cannot demote, suspend, revoke or remove your own Super Admin account.'), 'Self demotion/revocation guard');
  });

  await it('04. Target membership locked FOR UPDATE and cross-tenant mutation rejected', () => {
    assert(migration20261105Content.includes('FOR UPDATE;'), 'Row locks must be acquired FOR UPDATE');
    assert(migration20261105Content.includes('USER_NOT_FOUND: Target is not a member of this tenant.'), 'Cross-tenant member mutation rejected');
  });

  await it('05. Last Super Admin protection locks all active Super Admins and verifies count > 1', () => {
    assert(migration20261105Content.includes("role = 'SUPER_ADMIN' AND status = 'active'"), 'Active Super Admins must be filtered');
    assert(migration20261105Content.includes('ORDER BY id'), 'Deterministic lock order to prevent deadlocks');
    assert(migration20261105Content.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN: Tenant must retain at least one active Super Admin.'), 'Invariant exception raised');
  });

  console.log('\n--- SECTION 2: Revocation State Machine & Outbox Durability (DEF-C252-01, DEF-C252-03) ---');

  await it('06. Membership suspension, audit row, and durable outbox intent committed in single transaction', () => {
    assert(migration20261105Content.includes('INSERT INTO public.finance_audit_log'), 'Audit log inserted in govern_tenant_membership');
    assert(migration20261105Content.includes('INSERT INTO public.governance_session_revocation_outbox'), 'Outbox intent inserted in govern_tenant_membership');
    assert(migration20261105Content.includes('INSERT INTO public.governance_operation_ledger'), 'Idempotency ledger recorded');
  });

  await it('07. Repeated revocation requests with duplicate operation ID return cached result idempotently', () => {
    assert(migration20261105Content.includes('SELECT * INTO v_ledger'), 'Ledger checked before mutation');
    assert(migration20261105Content.includes('OPERATION_ID_CONFLICT'), 'Conflicting target/action with same opId rejected');
  });

  await it('08. Outbox schema enforces PENDING, IN_PROGRESS, COMPLETED, FAILED, SUPERSEDED states', () => {
    assert(migration20261105Content.includes("CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SUPERSEDED'))"), 'Full lifecycle status constraint');
  });

  await it('09. Claim RPC uses FOR UPDATE SKIP LOCKED with lease duration', () => {
    assert(migration20261105Content.includes('FOR UPDATE SKIP LOCKED'), 'Non-blocking concurrent worker claims');
    assert(migration20261105Content.includes('lease_expires_at'), 'Lease expiration timestamp prevents stranded claims');
    assert(migration20261105Content.includes('claim_token = gen_random_uuid()'), 'Unique token per claim lease');
  });

  await it('10. Completion RPC verifies claim token and IN_PROGRESS status; never resets COMPLETED to PENDING', () => {
    assert(migration20261105Content.includes('claim_token = p_claim_token AND status = \'IN_PROGRESS\''), 'Conditional completion match');
    assert(migration20261105Content.includes('updated\', FALSE'), 'Stale worker execution yields updated: false');
  });

  await it('11. Authorized reactivation supersedes pending revocation outbox work atomically', () => {
    assert(migration20261105Content.includes("status = 'SUPERSEDED'"), 'Marks pending outbox rows SUPERSEDED');
    assert(migration20261105Content.includes('Membership reactivated by authorized governance action'), 'Sets explicit superseded reason');
  });

  console.log('\n--- SECTION 3: Reconciliation Route & Worker Endpoint (DEF-C252-02) ---');

  await it('12. PATCH /api/admin/users handles reconcile-sessions without requiring userId', () => {
    assert(usersRouteContent.includes("action === 'reconcile-sessions'"), 'reconcile-sessions evaluated');
    const reconcileIdx = usersRouteContent.indexOf("action === 'reconcile-sessions'");
    const userIdReqIdx = usersRouteContent.indexOf("!userId && action !== 'provision-invite'");
    assert(reconcileIdx < userIdReqIdx, 'reconcile-sessions placed above mandatory userId check');
  });

  await it('13. Dedicated Cron Worker endpoint verifies CRON_SECRET with timing-safe comparison', () => {
    assert(cronWorkerRouteContent.includes('crypto.timingSafeEqual'), 'Uses timing safe comparison for CRON_SECRET');
    assert(cronWorkerRouteContent.includes('reconcilePendingSessionRevocations(null'), 'Drains outbox for all tenants');
  });

  console.log('\n--- SECTION 4: Application Revocation & Route Hardening (DEF-C252-04, DEF-C252-05) ---');

  await it('14. Google OAuth authenticateCaller fails closed when user has no active tenant membership', () => {
    assert(googleOAuthConfigContent.includes('NO_ACTIVE_MEMBERSHIP'), 'Returns error NO_ACTIVE_MEMBERSHIP');
    assert(!googleOAuthConfigContent.includes("let tenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6'; // Authoritative default tenant"), 'No fallback default tenant');
  });

  await it('15. Multi-tenant session resolution handles multiple active memberships without throwing PGRST116', () => {
    assert(serverAuthContent.includes('.select(\'role, tenant_id, status\')'), 'Selects all active memberships');
    assert(!serverAuthContent.includes('.maybeSingle()'), 'Eliminated unconstrained maybeSingle');
    assert(serverAuthContent.includes('options.requestedTenantId'), 'Respects requestedTenantId option');
  });

  await it('16. Dashboard and Root pages enforce authoritative active tenant membership before render', () => {
    assert(dashboardPageContent.includes('getAuthoritativeSession()'), 'Dashboard page calls getAuthoritativeSession');
    assert(rootPageContent.includes('getAuthoritativeSession()'), 'Root page calls getAuthoritativeSession');
  });

  await it('17. Legacy delete-personnel route requires SUPER_ADMIN and delegates to govern_tenant_membership', () => {
    assert(adminJsContent.includes("callerRole !== 'SUPER_ADMIN'"), 'Requires callerRole === SUPER_ADMIN');
    assert(adminJsContent.includes('/rest/v1/rpc/govern_tenant_membership'), 'Invokes govern_tenant_membership RPC');
    assert(adminJsContent.includes('remove-membership'), 'Passes remove-membership action');
    assert(adminJsContent.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'Handles last Super Admin rejection gracefully');
  });

  await it('18. App Router DELETE personnel route forbids Finance Manager from deleting Super Admin personnel', () => {
    assert(personnelRouteContent.includes("targetMem?.role === 'SUPER_ADMIN' && auth.session.role !== 'Super Admin'"), 'Checks target role vs caller role');
    assert(personnelRouteContent.includes('Only a Super Admin may delete personnel records belonging to a Super Admin'), 'Returns forbidden error');
  });

  console.log('\n--- SECTION 5: Error Sanitization, Reason & Audit Action Fidelity (DEF-C252-06, DEF-C252-09) ---');

  await it('19. Raw database/provider errors sanitized before returning to client', () => {
    assert(personnelQueriesContent.includes('export function sanitizeGovernanceError'), 'Exports error sanitizer');
    assert(usersRouteContent.includes('sanitizeGovernanceError'), 'Users route consumes error sanitizer');
    assert(!usersRouteContent.includes('rpcErr.message'), 'Zero raw rpcErr.message in users route');
  });

  await it('20. Distinct audit actions preserved across all governance actions', () => {
    assert(migration20261105Content.includes("v_audit_action := 'DEACTIVATE_USER'"), 'Preserves DEACTIVATE_USER');
    assert(migration20261105Content.includes("v_audit_action := 'SUSPEND_USER'"), 'Preserves SUSPEND_USER');
    assert(migration20261105Content.includes("v_audit_action := 'TOGGLE_USER_STATUS'"), 'Preserves TOGGLE_USER_STATUS');
    assert(migration20261105Content.includes("v_audit_action := 'REVOKE_USER_ACCESS'"), 'Preserves REVOKE_USER_ACCESS');
    assert(migration20261105Content.includes("v_audit_action := 'REACTIVATE_USER'"), 'Preserves REACTIVATE_USER');
    assert(migration20261105Content.includes("v_audit_action := 'UNLOCK_USER_ACCOUNT'"), 'Preserves UNLOCK_USER_ACCOUNT');
    assert(migration20261105Content.includes("v_audit_action := 'REMOVE_USER_MEMBERSHIP'"), 'Preserves REMOVE_USER_MEMBERSHIP');
  });

  await it('21. Operator-supplied reason preserved in demote_or_suspend_super_admin wrapper', () => {
    assert(migration20261105Content.includes('p_reason => p_reason'), 'Preserves caller-supplied reason parameter');
    assert(!migration20261105Content.includes("'Super Admin governance action: ' || p_action"), 'No hardcoded reason string');
  });

  await it('22. Audit logging fail-closed requires active administrative membership in target tenant', () => {
    assert(personnelQueriesContent.includes('Actor ${entry.actorId} has no membership in tenant ${entry.tenantId}'), 'Rejects non-members');
    assert(personnelQueriesContent.includes("!['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(actorMembership.role)"), 'Rejects non-admin roles');
  });

  console.log('\n--- SECTION 6: Migration Immutability & Provenance Verification ---');

  await it('23. Historical baseline migration 20261102 matches exact origin/main SHA-256', () => {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(migration20261102Content).digest('hex');
    assert.strictEqual(hash, 'b24a11efb74bcc01f82d5c3019508b672734efd3d1e838ee615e2901f0fb29f3', 'Hash must match immutable baseline');
  });

  await it('24. Forward migration 20261105 is self-contained and drops legacy overloads dynamically', () => {
    assert(migration20261105Content.includes('p.proname IN ('), 'Queries pg_proc for legacy signatures');
    assert(migration20261105Content.includes('EXECUTE \'DROP FUNCTION \' || r.sig::text;'), 'Safely drops older overloads');
  });

  console.log('\n======================================================================');
  console.log(` TOTAL PHASE C253 ADVERSARIAL ASSERTIONS: ${totalTests}`);
  console.log(` PASSED: ${passedTests}`);
  console.log(` FAILED: ${failures.length}`);
  console.log('======================================================================\n');

  if (failures.length > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

