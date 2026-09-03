/**
 * CLASPTEK ENTERPRISE PLATFORM — PHASE 18 AUTOMATED TEST SUITE
 * Test Suite: Authentication Session Synchronization, Proactive Token Expiration Refresh,
 * Controlled 401 Interception, Non-Destructive Reconciliation Gating & Invariant Protection
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  ✔ PASS [Test ${totalPassed}]: ${message}`);
  } else {
    totalFailed++;
    console.error(`  ✖ FAIL [Test ${totalPassed + totalFailed}]: ${message}`);
    failures.push(message);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store
  };
}

function generateMockJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock_signature';
  return `${header}.${body}.${signature}`;
}

async function runPhase18Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 18: AUTHENTICATION & RECONCILIATION INTEGRITY VERIFICATION');
  console.log('========================================================================================\n');

  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  let scriptMatch = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    const allMatches = [...htmlContent.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    scriptMatch = allMatches[allMatches.length - 1];
  }
  const scriptContent = scriptMatch[1];

  let currentFetchHandler = async () => ({ ok: true, status: 200, json: async () => [] });

  function createHarness() {
    const mockStorage = createMockLocalStorage();
    const moduleObj = { exports: {} };
    const sandbox = {
      addEventListener: () => {},
      removeEventListener: () => {},
      window: {
        localStorage: mockStorage,
        location: { reload: () => {} },
        addEventListener: () => {}
      },
      document: {
        getElementById: () => ({
          addEventListener: () => {},
          value: '',
          style: {},
          classList: { add: () => {}, remove: () => {} },
          querySelectorAll: () => []
        }),
        querySelector: () => ({
          addEventListener: () => {},
          value: '',
          style: {},
          classList: { add: () => {}, remove: () => {} }
        }),
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add: () => {} } }),
        body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } }
      },
      localStorage: mockStorage,
      sessionStorage: createMockLocalStorage(),
      fetch: async (...args) => currentFetchHandler(...args),
      crypto: {
        subtle: {
          digest: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
        },
        getRandomValues: (arr) => arr.map(() => Math.floor(Math.random() * 256))
      },
      alert: () => {},
      console: {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {}
      },
      setTimeout: (fn) => fn(),
      setInterval: () => 1,
      clearInterval: () => {},
      Date: Date,
      Buffer: Buffer,
      module: moduleObj
    };

    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(scriptContent, sandbox);
    return { sandbox, app: moduleObj.exports, storage: mockStorage };
  }

  // --------------------------------------------------------------------------------------
  // TEST SECTION 1: JWT EXCLUSION, VALIDATION & EXPIRATION HELPERS
  // --------------------------------------------------------------------------------------
  console.log('--- Category 1: JWT Decoding & Expiration Detection ---');
  const { app, sandbox } = createHarness();

  assert(typeof app.decodeJwtPayload === 'function', 'decodeJwtPayload helper is exported and accessible');
  assert(typeof app.isJwtExpiredOrExpiring === 'function', 'isJwtExpiredOrExpiring helper is exported and accessible');

  const nowSec = Math.floor(Date.now() / 1000);
  const validToken = generateMockJwt({ exp: nowSec + 3600, role: 'authenticated', sub: 'user_123' });
  const nearExpiryToken = generateMockJwt({ exp: nowSec + 30, role: 'authenticated', sub: 'user_123' });
  const expiredToken = generateMockJwt({ exp: nowSec - 120, role: 'authenticated', sub: 'user_123' });

  assert(app.isJwtExpiredOrExpiring(validToken) === false, 'Valid JWT (exp +3600s) is correctly classified as NOT expired');
  assert(app.isJwtExpiredOrExpiring(nearExpiryToken) === true, 'Near-expiry JWT (exp +30s <= 60s) is correctly classified as EXPIRING');
  assert(app.isJwtExpiredOrExpiring(expiredToken) === true, 'Past JWT (exp -120s) is correctly classified as EXPIRED');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 2: SUPABASE CLIENT HEADER INJECTION SAFETY (NO EXPIRED BEARER)
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 2: Header Token Guarding Against Expired JWT ---');
  app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  app.state.supabase.anonKey = 'valid_anon_public_key_clasptek';
  app.state.auth = {
    supabaseJwt: expiredToken
  };

  const headersWithExpired = app.supabaseClient.getHeaders();
  assert(headersWithExpired.apikey === 'valid_anon_public_key_clasptek', 'Client headers always include valid public apikey');
  assert(!headersWithExpired.Authorization, 'Expired JWT is NOT injected into Authorization header (omitted to prevent PGRST301 rejection)');

  app.state.auth.supabaseJwt = validToken;
  const headersWithValid = app.supabaseClient.getHeaders();
  assert(headersWithValid.Authorization === `Bearer ${validToken}`, 'Valid, non-expired JWT is properly injected into Authorization header');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 3: CONTROLLED 401 RETRY-ONCE WITH SESSION REFRESH
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 3: Controlled 401 Retry-Once Interceptor ---');
  let refreshCalls = 0;
  let queryCalls = 0;

  const freshToken = generateMockJwt({ exp: nowSec + 7200, role: 'authenticated', sub: 'user_refreshed' });

  // Mock refresh endpoint
  app.supabaseClient.auth.refreshSession = async () => {
    refreshCalls++;
    app.state.auth = app.state.auth || {};
    app.state.auth.supabaseJwt = freshToken;
    app.state.auth.tokenExpiresAt = Date.now() + 7200000;
    return { data: { session: { access_token: freshToken, refresh_token: 'new_ref' } }, error: null };
  };

  currentFetchHandler = async (url, opts) => {
    queryCalls++;
    const authHeader = (opts && opts.headers && opts.headers.Authorization) || '';
    if (authHeader.includes(freshToken)) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'prog_001', name: 'Executive Leadership' }]
      };
    }
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"code":"PGRST301","message":"JWT expired"}',
      json: async () => ({ code: 'PGRST301', message: 'JWT expired' })
    };
  };

  const queryResult = await app.supabaseClient.from('programmes').select('*');
  assert(queryResult.ok === true, 'Query status ok is true after controlled 401 session refresh retry');
  assert(Array.isArray(queryResult.data) && queryResult.data.length === 1, 'Query returns array with 1 record');
  assert(queryResult.data[0].id === 'prog_001', 'Query returns authentic database data after retry');
  assert(refreshCalls === 1, 'Session refresh was called exactly once on 401');
  assert(queryCalls === 2, 'Query was retried exactly once after 401');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 4: NORMAL DATABASE WRITES WITH AUTHENTICATION
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 4: Authenticated Database Writes ---');
  let writeCalled = false;
  currentFetchHandler = async (url, opts) => {
    if (opts && opts.method === 'POST') {
      writeCalled = true;
      return {
        ok: true,
        status: 201,
        json: async () => [{ id: 'inv_test_01', total: 50000 }],
        text: async () => '[{"id":"inv_test_01","total":50000}]'
      };
    }
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  };

  const insertRes = await app.supabaseClient.from('invoices').insert({ id: 'inv_test_01', total: 50000 });
  assert(writeCalled === true, 'Insert operation executes HTTP POST');
  assert(insertRes.ok === true && insertRes.data[0].id === 'inv_test_01', 'Insert operation completes successfully with returned record');
  assert(app.state.supabase.lastSuccessfulWrite !== null, 'state.supabase.lastSuccessfulWrite timestamp is recorded');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 5: HEALTH CHECK & NON-CONFLATION OF 401 REASONS
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 5: Health Check Diagnostic Classification ---');
  // Sub-test 5A: Token expired
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"code":"PGRST301","message":"JWT expired"}',
    json: async () => ({ code: 'PGRST301', message: 'JWT expired' })
  });

  const healthCheckExpired = await app.runSupabaseHealthCheck();
  assert(healthCheckExpired.success === false, 'Health check reports unsuccessful on expired JWT');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.AUTHENTICATION_FAILED, 'Authority state is set to AUTHENTICATION_FAILED (NOT API_KEY_INVALID) on token expiry');

  // Sub-test 5B: Bad API key
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"message":"Invalid API key"}',
    json: async () => ({ message: 'Invalid API key' })
  });

  const healthCheckBadKey = await app.runSupabaseHealthCheck();
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID, 'Authority state is set to API_KEY_INVALID when public API key is rejected');

  // Sub-test 5C: Successful Health Check
  currentFetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => [{ id: 'prog_001' }],
    text: async () => '[{"id":"prog_001"}]'
  });

  const healthCheckOk = await app.runSupabaseHealthCheck();
  assert(healthCheckOk.success === true, 'Health check returns success: true on 200 OK');
  assert(healthCheckOk.status === 'connected', 'Health check status is connected');
  assert(app.state.supabase.status === 'connected', 'state.supabase.status is connected');
  assert(app.state.supabase.lastHttpStatus === 200, 'state.supabase.lastHttpStatus is 200');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 6: RECONCILIATION SAFETY UNDER 401 / AUTHENTICATION FAILURE
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 6: Reconciliation Non-Destruction & Gating Under Auth Outage ---');
  // Seed legacy local records (5 Personnel, 1 Setting)
  app.state.personnel = [
    { id: 'pers_1', name: 'Engr. A. Adeleke', role: 'Chief Engineer' },
    { id: 'pers_2', name: 'Dr. B. Oladipo', role: 'Training Director' },
    { id: 'pers_3', name: 'C. Okonkwo', role: 'Finance Manager' },
    { id: 'pers_4', name: 'D. Ibrahim', role: 'Senior Facilitator' },
    { id: 'pers_5', name: 'E. Nwachukwu', role: 'Operations Officer' }
  ];
  app.state.financeSettings = { id: 'set_main', companyName: 'Clasptek Tech', currency: 'NGN', taxRate: 7.5 };

  // Simulate remote DB returning 401 during reconciliation
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"code":"PGRST301","message":"JWT expired"}',
    json: async () => ({ code: 'PGRST301', message: 'JWT expired' })
  });

  const reconAuthFail = await app.reconcileProductionData();
  assert(reconAuthFail.isReconciled === false, 'Reconciliation is false when queries fail authentication');
  assert(reconAuthFail.authenticationRequired === true, 'authenticationRequired is explicitly flagged');
  assert(reconAuthFail.status === 'DATABASE_AUTHENTICATION_REQUIRED', 'Status is DATABASE_AUTHENTICATION_REQUIRED (NOT RECONCILIATION_FAILED)');
  assert(reconAuthFail.criticalOrphanCount === 0, 'Critical orphans count is NOT artificially generated on auth outage');
  assert(app.state.personnel.length === 5, 'Local legacy Personnel records (5) remain 100% intact and uncorrupted');
  assert(Boolean(app.state.financeSettings && app.state.financeSettings.companyName), 'Local legacy Setting record (1) remains 100% intact and uncorrupted');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 7: RECONCILIATION WHEN DATABASE IS AVAILABLE & MATCHED
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 7: Reconciliation When Database is Available ---');
  currentFetchHandler = async (url) => {
    if (url.includes('personnel')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: 'pers_1', name: 'Engr. A. Adeleke' },
          { id: 'pers_2', name: 'Dr. B. Oladipo' },
          { id: 'pers_3', name: 'C. Okonkwo' },
          { id: 'pers_4', name: 'D. Ibrahim' },
          { id: 'pers_5', name: 'E. Nwachukwu' }
        ]
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const reconSuccess = await app.reconcileProductionData();
  assert(!reconSuccess.authenticationRequired, 'authenticationRequired is not true when remote queries succeed');
  assert(reconSuccess.isReconciled === true, 'Reconciliation reports isReconciled === true when data matches');
  assert(typeof reconSuccess.reconciliationPercentage === 'number', 'Reconciliation percentage is calculated');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 8: MIGRATION READINESS & LOCK ENFORCEMENT
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 8: Migration Lock & Gate Invariants ---');
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.AUTHENTICATION_FAILED;
  let migrationBlocked = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    migrationBlocked = true;
    assert(err.message.includes('Migration locked'), 'Migration is locked when authentication has failed');
  }
  assert(migrationBlocked === true, 'CRITICAL: Migration is strictly blocked during AUTHENTICATION_FAILED state');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 9: LOGOUT / LOGIN SYNCHRONIZATION
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 9: Logout & Session Clearing ---');
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin', name: 'Admin', role: 'Super Admin' },
    supabaseJwt: validToken,
    supabaseSession: { access_token: validToken }
  };
  await app.supabaseAuth.signOut();
  assert(!app.state.auth.supabaseJwt, 'Supabase JWT is cleared on signOut()');
  assert(!app.state.auth.supabaseSession, 'Supabase Session is cleared on signOut()');

  // --------------------------------------------------------------------------------------
  // TEST SECTION 10: ZERO DATA LOSS / PRESERVATION INVARIANT
  // --------------------------------------------------------------------------------------
  console.log('\n--- Category 10: Absolute Business Data Preservation ---');
  const legacyPreservation = await app.inspectLegacyLocalData();
  assert(legacyPreservation.counts.personnel === 5, 'Exact 5 Personnel records preserved in local data');
  assert(legacyPreservation.counts.finance_settings === 1, 'Exact 1 Setting record preserved in local data');

  console.log('\n========================================================================================');
  console.log(` PHASE 18 SUITE RESULT: ${totalPassed} PASSED / ${totalFailed} FAILED (TOTAL ${totalPassed + totalFailed} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhase18Tests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
