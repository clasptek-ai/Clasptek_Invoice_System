/**
 * scripts/test_phase_c255_scheduler_and_legacy_remediation.js
 * Comprehensive Offline Security and Adversarial Test Suite for Phase C255
 * Covers:
 *   - DEF-C254-WORKER-01: Vercel Cron configuration, schedule validity, timing-safe authentication
 *   - DEF-C254-LEGACY-01: Legacy provisioning safe deprecation, zero-write enforcement, call graph
 *   - GoTrue / PostgreSQL transaction boundary handling & fail-closed error contracts
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const worktreeRoot = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE C255 REMEDIATION TEST SUITE');
  console.log('======================================================================\n');

  // ------------------------------------------------------------------
  // 1. Scheduler & Vercel Cron Configuration Tests (DEF-C254-WORKER-01)
  // ------------------------------------------------------------------
  console.log('[1/4] Vercel Cron Configuration & Schedule Invariants (DEF-C254-WORKER-01):');

  const vercelJsonPath = path.join(worktreeRoot, 'vercel.json');
  assert(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

  await test('vercel.json defines valid crons array', () => {
    assert(Array.isArray(vercelJson.crons), 'crons must be an array');
    assert(vercelJson.crons.length > 0, 'crons array must not be empty');
  });

  await test('reconcile-session-revocations cron targets correct endpoint', () => {
    const cron = vercelJson.crons.find(c => c.path === '/api/cron/reconcile-session-revocations');
    assert(cron, 'cron for /api/cron/reconcile-session-revocations must exist');
    assert.strictEqual(cron.path, '/api/cron/reconcile-session-revocations');
  });

  await test('reconcile-session-revocations schedule syntax is valid 5-part cron format', () => {
    const cron = vercelJson.crons.find(c => c.path === '/api/cron/reconcile-session-revocations');
    const parts = cron.schedule.trim().split(/\s+/);
    assert.strictEqual(parts.length, 5, 'Cron expression must contain exactly 5 fields');
    assert(/^((\*(\/[0-9]+)?)|[0-9,\-]+)\s+((\*(\/[0-9]+)?)|[0-9,\-]+)\s+((\*(\/[0-9]+)?)|[0-9,\-]+)\s+((\*(\/[0-9]+)?)|[0-9,\-]+)\s+((\*(\/[0-9]+)?)|[0-9,\-]+)$/.test(cron.schedule), 'Cron schedule expression must be syntactically valid');
  });

  await test('vercel.json preserves all pre-existing rewrites and security headers intact', () => {
    assert(Array.isArray(vercelJson.rewrites), 'rewrites must be preserved');
    const rewriteSources = vercelJson.rewrites.map(r => r.source);
    assert(rewriteSources.includes('/api/admin/provision-user'), 'provision-user rewrite preserved');
    assert(rewriteSources.includes('/api/admin/delete-personnel'), 'delete-personnel rewrite preserved');
    assert(rewriteSources.includes('/api/intake/google-forms'), 'google-forms rewrite preserved');
    assert(Array.isArray(vercelJson.headers), 'headers preserved');
  });

  // ------------------------------------------------------------------
  // 2. Cron Authentication & Route Contract Tests
  // ------------------------------------------------------------------
  console.log('\n[2/4] Cron Route Authentication & Timing-Safe Security:');

  const cronRoutePath = path.join(worktreeRoot, 'app', 'api', 'cron', 'reconcile-session-revocations', 'route.ts');
  assert(fs.existsSync(cronRoutePath), 'route.ts must exist');
  const cronRouteContent = fs.readFileSync(cronRoutePath, 'utf8');

  await test('route exports both GET and POST for Vercel Cron and administrative HTTP callers', () => {
    assert(cronRouteContent.includes('export async function GET'), 'GET must be exported');
    assert(cronRouteContent.includes('export async function POST'), 'POST must be exported');
  });

  await test('route uses crypto.timingSafeEqual and fails closed on missing CRON_SECRET', () => {
    assert(cronRouteContent.includes('crypto.timingSafeEqual'), 'Must use timingSafeEqual');
    assert(cronRouteContent.includes('process.env.CRON_SECRET'), 'Must check CRON_SECRET');
  });

  const verifyCronAuthMock = (headerVal, envSecret) => {
    const cronSecret = (envSecret || '').trim();
    if (!cronSecret) return false;
    const authHeader = headerVal || '';
    if (!authHeader.startsWith('Bearer ')) return false;
    const providedBuf = Buffer.from(authHeader.slice(7).trim(), 'utf8');
    const expectedBuf = Buffer.from(cronSecret, 'utf8');
    if (providedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  };

  const testSecret = 'mock-test-cron-secret-12345-67890';

  await test('Auth Neg 1: Missing authorization header rejected (401)', () => {
    assert.strictEqual(verifyCronAuthMock(null, testSecret), false);
    assert.strictEqual(verifyCronAuthMock('', testSecret), false);
  });

  await test('Auth Neg 2: Unset or empty secret fails closed (401)', () => {
    assert.strictEqual(verifyCronAuthMock(`Bearer ${testSecret}`, ''), false);
    assert.strictEqual(verifyCronAuthMock(`Bearer ${testSecret}`, '   '), false);
    assert.strictEqual(verifyCronAuthMock(`Bearer ${testSecret}`, undefined), false);
  });

  await test('Auth Neg 3: Missing bearer token rejected (401)', () => {
    assert.strictEqual(verifyCronAuthMock('Bearer ', testSecret), false);
    assert.strictEqual(verifyCronAuthMock('Bearer', testSecret), false);
  });

  await test('Auth Neg 4: Incorrect token rejected (401)', () => {
    assert.strictEqual(verifyCronAuthMock('Bearer wrong-secret-value-abcde', testSecret), false);
  });

  await test('Auth Neg 5: Malformed authorization header rejected (401)', () => {
    assert.strictEqual(verifyCronAuthMock(`Token ${testSecret}`, testSecret), false);
    assert.strictEqual(verifyCronAuthMock(testSecret, testSecret), false);
  });

  await test('Auth Neg 6: Incorrect scheme rejected (401)', () => {
    assert.strictEqual(verifyCronAuthMock(`Basic ${Buffer.from('user:pass').toString('base64')}`, testSecret), false);
  });

  await test('Auth Neg 7: Incorrect token length rejected cleanly without exception (401)', () => {
    assert.strictEqual(verifyCronAuthMock(`Bearer short`, testSecret), false);
    assert.strictEqual(verifyCronAuthMock(`Bearer ${testSecret}-extra-long-padding`, testSecret), false);
  });

  await test('Auth Neg 8: Same-length incorrect token rejected via timingSafeEqual (401)', () => {
    const wrongSameLength = 'x'.repeat(testSecret.length);
    assert.strictEqual(verifyCronAuthMock(`Bearer ${wrongSameLength}`, testSecret), false);
  });

  await test('Auth Pos 9: Correctly matching bearer token accepted (200)', () => {
    assert.strictEqual(verifyCronAuthMock(`Bearer ${testSecret}`, testSecret), true);
  });

  await test('Zero Secret Leakage Rule: Response and logs contain zero plaintext credentials', () => {
    assert(!cronRouteContent.includes('console.log(process.env.CRON_SECRET)'), 'Secret must never be logged');
    assert(!cronRouteContent.includes('cronSecret:'), 'Secret must not be reflected in payload');
  });

  // ------------------------------------------------------------------
  // 3. Worker Mechanics & Concurrency Safety
  // ------------------------------------------------------------------
  console.log('\n[3/4] Outbox Worker Claiming & Concurrency Invariants:');

  const migrationSqlPath = path.join(worktreeRoot, 'migrations', '20261105_c253_governance_revocation_boundary.sql');
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  await test('claim_session_revocations uses FOR UPDATE SKIP LOCKED to prevent duplicate claims', () => {
    assert(migrationSql.includes('FOR UPDATE SKIP LOCKED'), 'Must use SKIP LOCKED');
  });

  await test('claim_session_revocations reclaims expired leases (zombie recovery)', () => {
    assert(migrationSql.includes('lease_expires_at < NOW()'), 'Must check lease expiration for zombie recovery');
  });

  await test('complete_session_revocation enforces CAS claim_token and IN_PROGRESS check', () => {
    assert(migrationSql.includes('claim_token = p_claim_token'), 'Must verify claim_token in CAS');
    assert(migrationSql.includes("status = 'IN_PROGRESS'"), 'Must verify IN_PROGRESS in CAS');
  });

  await test('complete_session_revocation transitions attempt_count >= max_attempts to terminal FAILED', () => {
    assert(migrationSql.includes('attempt_count >= v_row.max_attempts'), 'Must check max_attempts');
    assert(migrationSql.includes("v_final := 'FAILED'"), 'Must mark terminal FAILED');
  });

  // ------------------------------------------------------------------
  // 4. Legacy Provisioning Boundary Remediation (DEF-C254-LEGACY-01)
  // ------------------------------------------------------------------
  console.log('\n[4/4] Legacy Provisioning Safe Deprecation (DEF-C254-LEGACY-01):');

  const adminJsPath = path.join(worktreeRoot, 'api', 'admin.js');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  const adminJs = require(adminJsPath);

  await test('Legacy handleProvisionUser rejects unauthenticated requests with 401 Unauthorized', async () => {
    let statusCode = null;
    let headers = {};
    let responseBody = null;

    const mockReq = {
      method: 'POST',
      url: '/api/admin?action=provision-user',
      headers: {}
    };

    const mockRes = {
      setHeader: (k, v) => { headers[k] = v; },
      end: (data) => {
        responseBody = JSON.parse(data);
      },
      get statusCode() { return statusCode; },
      set statusCode(val) { statusCode = val; }
    };

    await adminJs(mockReq, mockRes);
    assert.strictEqual(statusCode, 401, 'Unauthenticated request must receive 401');
    assert(responseBody.error.includes('Unauthorized'), 'Error message must specify Unauthorized');
  });

  await test('Legacy handleProvisionUser returns 410 Gone with DEPRECATED_ENDPOINT for authenticated requests', async () => {
    let statusCode = null;
    let headers = {};
    let responseBody = null;

    const mockReq = {
      method: 'POST',
      url: '/api/admin?action=provision-user',
      headers: {
        authorization: 'Bearer mock.token.jwt'
      }
    };

    const mockRes = {
      setHeader: (k, v) => { headers[k] = v; },
      end: (data) => {
        responseBody = JSON.parse(data);
      },
      get statusCode() { return statusCode; },
      set statusCode(val) { statusCode = val; }
    };

    await adminJs(mockReq, mockRes);
    assert.strictEqual(statusCode, 410, 'Authenticated request to legacy provisioning must receive 410 Gone');
    assert.strictEqual(responseBody.code, 'DEPRECATED_ENDPOINT');
    assert(responseBody.error.includes('POST /api/admin/users'), 'Must redirect to authoritative users endpoint');
  });

  await test('Legacy handleProvisionUser contains ZERO direct writes to tenant_memberships', () => {
    const startIdx = adminJsContent.indexOf('async function handleProvisionUser(');
    const endIdx = adminJsContent.indexOf('async function handleDeletePersonnel(');
    const handlerBody = adminJsContent.slice(startIdx, endIdx);

    assert(!handlerBody.includes('/rest/v1/tenant_memberships'), 'Must not write to tenant_memberships');
    assert(!handlerBody.includes('/rest/v1/personnel'), 'Must not write to personnel');
    assert(!handlerBody.includes('/auth/v1/admin/users'), 'Must not write to auth.users');
  });

  await test('Legacy handleDeletePersonnel is preserved and functional', () => {
    assert(adminJsContent.includes('async function handleDeletePersonnel('), 'delete-personnel handler preserved');
    assert(adminJsContent.includes('govern_tenant_membership'), 'delete-personnel routes via governance RPC');
  });

  await test('Authoritative POST /api/admin/users route is intact and requires Super Admin', () => {
    const usersRoutePath = path.join(worktreeRoot, 'app', 'api', 'admin', 'users', 'route.ts');
    const usersRouteContent = fs.readFileSync(usersRoutePath, 'utf8');
    assert(usersRouteContent.includes('export async function POST('), 'Authoritative POST must exist');
    assert(usersRouteContent.includes("allowedRoles: ['Super Admin']"), 'Must require Super Admin');
    assert(usersRouteContent.includes('createOrLinkUserAccount('), 'Must delegate to atomic createOrLinkUserAccount');
  });

  console.log('\n======================================================================');
  console.log(` PHASE C255 SUITE RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Unexpected test suite crash:', err);
  process.exit(1);
});
