// =============================================================================
// CLASPTEK ENTERPRISE PLATFORM — PHASE 15 AUTOMATED CERTIFICATION SUITE
// test_phase15_supabase_connectivity.js
// Supabase Production Connectivity Repair, Credential Validation & Authoritative Database Activation
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Headless Environment Setup
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
};

global.window = {
  location: { href: 'https://app.clasptek.org/clasptek_invoice_system.html', search: '' },
  print: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

function createMockElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    style: {},
    value: '',
    type: '',
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    querySelector: () => createMockElement(),
    querySelectorAll: () => []
  };
}

global.document = {
  getElementById: () => createMockElement(),
  querySelector: () => createMockElement(),
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement(tag),
  body: createMockElement('body')
};
global.alert = () => {};
global.confirm = () => true;

if (!global.crypto) {
  global.crypto = {
    subtle: {
      digest: async (algo, data) => {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.from(data));
        return hash.digest();
      }
    },
    getRandomValues: (arr) => crypto.randomFillSync(arr)
  };
}

let mockFetchHandler = null;
global.fetch = async (url, opts) => {
  if (mockFetchHandler) {
    return await mockFetchHandler(url, opts);
  }
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ([]),
    text: async () => '[]'
  };
};

// 2. Load Clasptek Core Script
const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);

if (!scriptMatch) {
  console.error('FATAL: Could not locate <script> tag in clasptek_invoice_system.html');
  process.exit(1);
}

eval(scriptMatch[1]);
const app = module.exports;

if (!app) {
  console.error('CRITICAL: module.exports is undefined in clasptek_invoice_system.html');
  process.exit(1);
}

let passed = 0;
let failed = 0;
let testIndex = 0;

function assert(condition, message) {
  testIndex++;
  if (condition) {
    passed++;
    console.log(`  ✔ PASS [Test ${testIndex}]: ${message}`);
  } else {
    failed++;
    console.error(`  ✖ FAIL [Test ${testIndex}]: ${message}`);
  }
}

// Helper to create valid structure JWT tokens for testing
function createMockJwt(header, payload) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${h}.${p}.mock_signature_hash_bytes`;
}

console.log('========================================================================================');
console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 15 SUPABASE CONNECTIVITY CERTIFICATION');
console.log('========================================================================================\n');

async function runTestSuite() {
  // ---------------------------------------------------------------------------
  // CATEGORY 1: CANONICAL CONFIGURATION RESOLVER (resolveSupabaseConfiguration)
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Canonical Configuration Resolver (resolveSupabaseConfiguration) ---');

  assert(typeof app.resolveSupabaseConfiguration === 'function', 'resolveSupabaseConfiguration is exported as a function');
  assert(app.CANONICAL_SUPABASE_PROJECT_REF === 'logaawoigfxnisimfatf', 'Canonical Supabase project ref is logaawoigfxnisimfatf');
  assert(app.CANONICAL_SUPABASE_REST_ENDPOINT === 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', 'Canonical Supabase REST endpoint is verified');
  assert(app.CANONICAL_SUPABASE_BASE_URL === 'https://logaawoigfxnisimfatf.supabase.co', 'Canonical Supabase base url is verified');

  // Source: APPLICATION_CONFIG (Default fallback)
  window.__CLASPTEK_ENV__ = undefined;
  app.state.supabase.endpoint = '';
  app.state.supabase.anonKey = '';
  app.state.supabase.configSource = 'APPLICATION_CONFIG';

  const defaultConfig = app.resolveSupabaseConfiguration();
  assert(defaultConfig.projectRef === 'logaawoigfxnisimfatf', 'Default configuration identifies projectRef logaawoigfxnisimfatf');
  assert(defaultConfig.supabaseUrl === 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', 'Default configuration resolves canonical REST endpoint');
  assert(defaultConfig.configurationSource === 'APPLICATION_CONFIG', 'Default configuration identifies source APPLICATION_CONFIG');
  assert(defaultConfig.isExpectedProject === true, 'Default configuration validates expected project');

  // Source: ENVIRONMENT (__CLASPTEK_ENV__)
  window.__CLASPTEK_ENV__ = {
    SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1',
    SUPABASE_ANON_KEY: 'valid_test_env_key_12345678901234567890'
  };
  const envConfig = app.resolveSupabaseConfiguration();
  assert(envConfig.configurationSource === 'ENVIRONMENT', 'Resolves configuration source ENVIRONMENT when __CLASPTEK_ENV__ is present');
  assert(envConfig.supabaseAnonKey === 'valid_test_env_key_12345678901234567890', 'Resolves anon key from environment variable');
  assert(envConfig.supabaseUrl.endsWith('/rest/v1/'), 'Appends trailing slash and /rest/v1/ to environment endpoint');

  // Source: LOCAL_STORAGE / State
  window.__CLASPTEK_ENV__ = undefined;
  app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  app.state.supabase.anonKey = 'valid_test_local_key_998877665544332211';
  app.state.supabase.configSource = 'LOCAL_STORAGE';

  const localConfig = app.resolveSupabaseConfiguration();
  assert(localConfig.configurationSource === 'LOCAL_STORAGE', 'Resolves configuration source LOCAL_STORAGE');
  assert(localConfig.supabaseAnonKey === 'valid_test_local_key_998877665544332211', 'Resolves anon key from state/localStorage');

  // Detection of Project Mismatch (Foreign project)
  app.state.supabase.endpoint = 'https://foreignproject123.supabase.co/rest/v1/';
  const foreignConfig = app.resolveSupabaseConfiguration();
  assert(foreignConfig.isExpectedProject === false, 'Detects project mismatch when foreign URL is provided');
  assert(foreignConfig.isValid === false, 'Rejects configuration when project does not match canonical project ref');
  assert(foreignConfig.projectRef === 'foreignproject123', 'Correctly parses foreign projectRef');

  // ---------------------------------------------------------------------------
  // CATEGORY 2: PUBLIC KEY VALIDATION & MASKING ENGINE
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Public Key Validation & Masking Engine ---');

  assert(typeof app.validateSupabasePublicKey === 'function', 'validateSupabasePublicKey is exported as a function');
  assert(typeof app.maskSecretKey === 'function', 'maskSecretKey is exported as a function');

  // Masking Function Tests
  const masked1 = app.maskSecretKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig1234lV0');
  assert(masked1.startsWith('eyJhbGci') && masked1.endsWith('4lV0') && masked1.includes('...****...'), 'Masks public key correctly (eyJhbGci...****...4lV0)');
  assert(!masked1.includes('payload'), 'Masked output does NOT reveal JWT payload');
  assert(app.maskSecretKey('') === 'NOT CONFIGURED', 'Empty key reports NOT CONFIGURED');
  assert(app.maskSecretKey('short') === '****', 'Short key reports ****');

  // Validation: Missing / Empty Key
  const valEmpty = app.validateSupabasePublicKey('');
  assert(valEmpty.isValid === false, 'Rejects empty API key');
  assert(valEmpty.present === false, 'Empty key flags present: false');
  assert(valEmpty.maskedKey === 'NOT CONFIGURED', 'Empty key maskedKey is NOT CONFIGURED');

  // Validation: Malformed / Too short Key
  const valShort = app.validateSupabasePublicKey('abc123');
  assert(valShort.isValid === false, 'Rejects too short/malformed API key');
  assert(valShort.isFormatValid === false, 'Short key flags isFormatValid: false');

  // Validation: Secret Server-Side Key (sbp_ / postgres:// / sk_)
  const valServerSecret = app.validateSupabasePublicKey('sbp_999888777666555444333222111');
  assert(valServerSecret.isValid === false, 'Strictly rejects server-side service key (sbp_...)');
  assert(valServerSecret.isSecretKey === true, 'Server-side key flags isSecretKey: true');
  assert(valServerSecret.failureReason.includes('Secret server-side API key detected'), 'Provides clear security rejection reason for server key');

  // Validation: Service-Role JWT Token (CRITICAL ZERO-SECRET-EXPOSURE SHIELD)
  const serviceRoleJwt = createMockJwt(
    { alg: 'HS256', typ: 'JWT' },
    { role: 'service_role', ref: 'logaawoigfxnisimfatf', exp: Math.floor(Date.now() / 1000) + 3600 }
  );
  const valServiceRole = app.validateSupabasePublicKey(serviceRoleJwt);
  assert(valServiceRole.isValid === false, 'CRITICAL: Strictly rejects service_role token in client-side code');
  assert(valServiceRole.isServiceRole === true, 'Flags isServiceRole: true');
  assert(valServiceRole.failureReason.includes('Service-role key detected'), 'Provides explicit service-role security warning');

  // Validation: Foreign Project JWT Token
  const foreignJwt = createMockJwt(
    { alg: 'HS256', typ: 'JWT' },
    { role: 'anon', ref: 'unauthorized_project_ref', exp: Math.floor(Date.now() / 1000) + 3600 }
  );
  const valForeignJwt = app.validateSupabasePublicKey(foreignJwt, 'logaawoigfxnisimfatf');
  assert(valForeignJwt.isValid === false, 'Rejects API key issued for a different Supabase project');
  assert(valForeignJwt.isExpectedProject === false, 'Flags isExpectedProject: false for foreign project JWT');

  // Validation: Expired JWT Token
  const expiredJwt = createMockJwt(
    { alg: 'HS256', typ: 'JWT' },
    { role: 'anon', ref: 'logaawoigfxnisimfatf', exp: Math.floor(Date.now() / 1000) - 3600 }
  );
  const valExpired = app.validateSupabasePublicKey(expiredJwt, 'logaawoigfxnisimfatf');
  assert(valExpired.isValid === false, 'Rejects expired Supabase JWT token');
  assert(valExpired.isExpired === true, 'Flags isExpired: true for expired JWT');

  // Validation: Valid Anon Public JWT Key
  const validAnonJwt = createMockJwt(
    { alg: 'HS256', typ: 'JWT' },
    { role: 'anon', ref: 'logaawoigfxnisimfatf', exp: Math.floor(Date.now() / 1000) + 86400 }
  );
  const valValidAnon = app.validateSupabasePublicKey(validAnonJwt, 'logaawoigfxnisimfatf');
  assert(valValidAnon.isValid === true, 'Valid anon JWT key passes validation');
  assert(valValidAnon.isServiceRole === false, 'Valid anon key is not service role');
  assert(valValidAnon.isExpectedProject === true, 'Valid anon key matches canonical project');
  assert(valValidAnon.failureReason === null, 'failureReason is null for valid key');

  // ---------------------------------------------------------------------------
  // CATEGORY 3: DUAL-TOKEN POSTGREST HEADER GENERATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Dual-Token PostgREST Header Generation ---');

  // Set up valid anon key in state
  app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  app.state.supabase.anonKey = validAnonJwt;

  // Unauthenticated Session Request Headers
  app.state.auth = { isAuthenticated: false, user: null, token: null, supabaseJwt: null };
  const unauthHeaders = app.supabaseClient.getHeaders();
  assert(unauthHeaders['apikey'] === validAnonJwt, 'Unauthenticated request sends anon key as apikey');
  assert(unauthHeaders['Authorization'] === `Bearer ${validAnonJwt}`, 'Unauthenticated request sends anon key as Authorization Bearer');
  assert(unauthHeaders['Content-Type'] === 'application/json', 'Content-Type is application/json');
  assert(unauthHeaders['Accept'] === 'application/json', 'Accept is application/json');

  // Authenticated Supabase Session Request Headers
  const userAccessJwt = createMockJwt(
    { alg: 'HS256', typ: 'JWT' },
    { role: 'authenticated', sub: 'user_123_uuid', exp: Math.floor(Date.now() / 1000) + 3600 }
  );
  app.state.auth = {
    isAuthenticated: true,
    user: { name: 'Dr. Test', role: 'Super Admin' },
    supabaseJwt: userAccessJwt
  };
  const authHeaders = app.supabaseClient.getHeaders();
  assert(authHeaders['apikey'] === validAnonJwt, 'Authenticated request still sends public anon key as apikey');
  assert(authHeaders['Authorization'] === `Bearer ${userAccessJwt}`, 'Authenticated request sends user access token as Authorization Bearer');
  assert(authHeaders['Authorization'] !== `Bearer ${validAnonJwt}`, 'Authorization header uses actual user token, not anon key');

  // Internal Session Token (sess_...) Protection Shield
  app.state.auth = {
    isAuthenticated: true,
    user: { name: 'Internal User', role: 'Finance Staff' },
    token: 'sess_internal_local_session_token_123',
    supabaseJwt: null
  };
  const safeSessionHeaders = app.supabaseClient.getHeaders();
  assert(safeSessionHeaders['Authorization'] === `Bearer ${validAnonJwt}`, 'Internal session tokens (sess_...) are NEVER sent to PostgREST as Bearer');

  // ---------------------------------------------------------------------------
  // CATEGORY 4: 5-STAGE PROGRESSIVE CONNECTIVITY PROBE (probeSupabaseConnectivity)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: 5-Stage Progressive Connectivity Probe (probeSupabaseConnectivity) ---');

  assert(typeof app.probeSupabaseConnectivity === 'function', 'probeSupabaseConnectivity is exported as a function');

  // Simulate All 5 Probes Passing
  let savedProbeRecord = null;
  mockFetchHandler = async (url, options = {}) => {
    // Project reachability probe
    if (url.endsWith('/rest/v1/')) {
      return { ok: true, status: 200, json: async () => ({ swagger: '2.0', info: { title: 'PostgREST' } }) };
    }
    // Database table read probe
    if (url.includes('programmes?select=id')) {
      return { ok: true, status: 200, json: async () => [{ id: 'PRG-TEST-1' }] };
    }
    // Persistence probe (system_diagnostics)
    if (url.includes('system_diagnostics')) {
      if (options.method === 'POST') {
        try {
          const body = JSON.parse(options.body || '{}');
          savedProbeRecord = Array.isArray(body) ? body[0] : body;
        } catch (_) {}
        return { ok: true, status: 201, json: async () => [savedProbeRecord] };
      }
      if (options.method === 'GET') {
        return { ok: true, status: 200, json: async () => (savedProbeRecord ? [savedProbeRecord] : [{ id: 'probe_mock' }]) };
      }
      if (options.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => [] };
      }
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const probeSuccess = await app.probeSupabaseConnectivity();
  assert(probeSuccess.reachable === true, 'Probe 1: Project reachability reports true');
  assert(probeSuccess.probes.probe1_projectReachability === true, 'Probe 1 flag is true');
  assert(probeSuccess.postgrestAvailable === true, 'Probe 2: PostgREST reachability reports true');
  assert(probeSuccess.probes.probe2_postgrestReachability === true, 'Probe 2 flag is true');
  assert(probeSuccess.databaseAvailable === true, 'Probe 3: Authenticated database read reports true');
  assert(probeSuccess.probes.probe3_authenticatedRead === true, 'Probe 3 flag is true');
  assert(probeSuccess.tenantVerified === true, 'Probe 4: Tenant verification reports true');
  assert(probeSuccess.probes.probe4_tenantVerified === true, 'Probe 4 flag is true');
  assert(probeSuccess.persistenceVerified === true, 'Probe 5: Persistence probe reports true');
  assert(probeSuccess.probes.probe5_persistenceProbe === true, 'Probe 5 flag is true');
  assert(probeSuccess.classification === 'CONNECTED', 'Overall probe classification is CONNECTED');
  assert(typeof probeSuccess.latencyMs === 'number' && probeSuccess.latencyMs >= 0, 'Captures execution latency in ms');

  // ---------------------------------------------------------------------------
  // CATEGORY 5: GRANULAR HTTP STATUS ERROR CLASSIFICATION & 401 DIAGNOSIS
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Granular HTTP Status Error Classification & 401 Diagnosis ---');

  assert(typeof app.diagnoseSupabaseError === 'function', 'diagnoseSupabaseError is exported as a function');

  // Diagnosis of HTTP 401 specifically
  const diag401 = app.diagnoseSupabaseError(401, 'Invalid API key');
  assert(diag401.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_401_UNAUTHORIZED, 'Classifies 401 as HTTP_401_UNAUTHORIZED');
  assert(diag401.summaryTitle === 'SUPABASE AUTHENTICATION / API KEY FAILURE' || diag401.summaryTitle.includes('API KEY'), '401 summary is SUPABASE AUTHENTICATION / API KEY FAILURE');
  assert(diag401.structuredReport.includes('SUPABASE API KEY') || diag401.structuredReport.includes('SUPABASE AUTHENTICATION'), 'Structured report includes SUPABASE API KEY diagnostic');
  assert(diag401.structuredReport.includes('Project: logaawoigfxnisimfatf'), 'Structured report mentions project logaawoigfxnisimfatf');
  assert(diag401.structuredReport.includes('Authoritative Mode: LOCKED'), 'Structured report explicitly specifies Authoritative Mode: LOCKED');

  // Diagnosis of HTTP 403 (RLS)
  const diag403 = app.diagnoseSupabaseError(403, 'Permission denied');
  assert(diag403.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_403_RLS_DENIED, 'Classifies 403 as HTTP_403_RLS_DENIED');
  assert(diag403.summaryTitle === 'SUPABASE RLS / AUTHORIZATION FAILURE', '403 summary is SUPABASE RLS / AUTHORIZATION FAILURE');

  // Diagnosis of HTTP 404
  const diag404 = app.diagnoseSupabaseError(404, 'Not Found');
  assert(diag404.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_404_SCHEMA_OR_ENDPOINT, 'Classifies 404 as HTTP_404_SCHEMA_OR_ENDPOINT');

  // Diagnosis of HTTP 409
  const diag409 = app.diagnoseSupabaseError(409, 'Conflict');
  assert(diag409.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_409_CONFLICT, 'Classifies 409 as HTTP_409_CONFLICT');

  // Diagnosis of HTTP 422
  const diag422 = app.diagnoseSupabaseError(422, 'Unprocessable Entity');
  assert(diag422.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_422_VALIDATION_FAILURE, 'Classifies 422 as HTTP_422_VALIDATION_FAILURE');

  // Diagnosis of HTTP 500
  const diag500 = app.diagnoseSupabaseError(500, 'Internal Server Error');
  assert(diag500.classification === app.DIAGNOSTIC_CLASSIFICATION.HTTP_500_DATABASE_ERROR, 'Classifies 500 as HTTP_500_DATABASE_ERROR');
  assert(diag500.summaryTitle === 'POSTGRESQL / POSTGREST SERVER FAILURE', '500 summary is POSTGRESQL / POSTGREST SERVER FAILURE');

  // ---------------------------------------------------------------------------
  // CATEGORY 6: ZERO-DATA-LOSS & FALSE EMPTY DETECTION PREVENTION
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Zero-Data-Loss & False Empty Detection Prevention ---');

  // Verification that HTTP 401 does NOT cause empty database classification
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"message": "Invalid API key"}',
      json: async () => ({ message: 'Invalid API key' })
    };
  };

  const health401 = await app.runSupabaseHealthCheck();
  assert(health401.httpStatus === 401, 'Health check returns HTTP 401');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID, 'Authority state is set to API_KEY_INVALID');
  assert(app.state.databaseAuthorityState !== app.DATABASE_AUTHORITY_STATE.EMPTY_DATABASE, 'CRITICAL: HTTP 401 is NEVER treated as EMPTY_DATABASE');

  // Verification that HTTP 403 does NOT cause empty database classification
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"message": "Permission denied for relation programmes"}',
      json: async () => ({ message: 'Permission denied for relation programmes' })
    };
  };

  const health403 = await app.runSupabaseHealthCheck();
  assert(health403.httpStatus === 403, 'Health check returns HTTP 403');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.RLS_AUTHORIZATION_FAILED, 'Authority state is set to RLS_AUTHORIZATION_FAILED');
  assert(app.state.databaseAuthorityState !== app.DATABASE_AUTHORITY_STATE.EMPTY_DATABASE, 'CRITICAL: HTTP 403 is NEVER treated as EMPTY_DATABASE');

  // Verification that HTTP 500 does NOT cause empty database classification
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '{"message": "Database connection error"}',
      json: async () => ({ message: 'Database connection error' })
    };
  };

  const health500 = await app.runSupabaseHealthCheck();
  assert(health500.httpStatus === 500, 'Health check returns HTTP 500');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.DATABASE_UNAVAILABLE, 'Authority state is set to DATABASE_UNAVAILABLE');
  assert(app.state.databaseAuthorityState !== app.DATABASE_AUTHORITY_STATE.EMPTY_DATABASE, 'CRITICAL: HTTP 500 is NEVER treated as EMPTY_DATABASE');

  // inspectProductionDatabase resilience check
  const inspectResult = await app.inspectProductionDatabase();
  assert(inspectResult.isEmpty === false, 'CRITICAL: inspectProductionDatabase reports isEmpty: false when queries fail with 500');
  assert(inspectResult.hasErrors === true, 'inspectProductionDatabase reports hasErrors: true');

  // Zero-Data-Loss Invariant Check
  app.state.invoices = [{ id: 'INV-TEST-001', grandTotal: 50000 }];
  app.state.payments = [{ id: 'PAY-TEST-001', amountPaid: 50000 }];
  assert(app.state.invoices.length === 1, 'In-memory state records exist prior to connection failure');

  // Trigger hydration error
  mockFetchHandler = async () => {
    throw new Error('Failed to fetch');
  };
  await app.loadAll();
  assert(app.state.invoices.length >= 1, 'CRITICAL: Connection failure preserves local invoices without data loss');
  assert(app.state.payments.length >= 1, 'CRITICAL: Connection failure preserves local payments without data loss');
  assert(app.state.connectionError.includes('No financial data has been changed'), 'Error message guarantees no financial data has been changed');

  // ---------------------------------------------------------------------------
  // CATEGORY 7: MIGRATION GATE & PRODUCTION AUTHORITY STATE MACHINE
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Migration Gate & Production Authority State Machine ---');

  // Check 12 Authority States in Enum
  const requiredStates = [
    'UNVERIFIED', 'CONFIGURATION_INVALID', 'API_KEY_INVALID',
    'CONNECTIVITY_FAILED', 'AUTHENTICATION_FAILED', 'DATABASE_UNAVAILABLE',
    'RLS_AUTHORIZATION_FAILED', 'EMPTY_DATABASE', 'MIGRATION_REQUIRED',
    'MIGRATION_IN_PROGRESS', 'RECONCILIATION_FAILED', 'AUTHORITATIVE'
  ];
  requiredStates.forEach(st => {
    assert(app.DATABASE_AUTHORITY_STATE[st] === st, `DATABASE_AUTHORITY_STATE defines ${st}`);
  });

  // Migration Locking when in API_KEY_INVALID
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  let didThrowOn401 = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didThrowOn401 = true;
    assert(err.message.includes('Migration locked') && err.message.includes('API_KEY_INVALID'), 'Migration throws locked error in API_KEY_INVALID state');
  }
  assert(didThrowOn401 === true, 'Migration strictly prevented during API_KEY_INVALID');

  // Migration Locking when in RLS_AUTHORIZATION_FAILED
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.RLS_AUTHORIZATION_FAILED;
  let didThrowOn403 = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didThrowOn403 = true;
    assert(err.message.includes('Migration locked') && err.message.includes('RLS_AUTHORIZATION_FAILED'), 'Migration throws locked error in RLS_AUTHORIZATION_FAILED state');
  }
  assert(didThrowOn403 === true, 'Migration strictly prevented during RLS_AUTHORIZATION_FAILED');

  // Migration Locking when in DATABASE_UNAVAILABLE
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.DATABASE_UNAVAILABLE;
  let didThrowOn500 = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didThrowOn500 = true;
    assert(err.message.includes('Migration locked') && err.message.includes('DATABASE_UNAVAILABLE'), 'Migration throws locked error in DATABASE_UNAVAILABLE state');
  }
  assert(didThrowOn500 === true, 'Migration strictly prevented during DATABASE_UNAVAILABLE');

  // Migration Locking when in CONNECTIVITY_FAILED
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.CONNECTIVITY_FAILED;
  let didThrowOnNet = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didThrowOnNet = true;
    assert(err.message.includes('Migration locked') && err.message.includes('CONNECTIVITY_FAILED'), 'Migration throws locked error in CONNECTIVITY_FAILED state');
  }
  assert(didThrowOnNet === true, 'Migration strictly prevented during CONNECTIVITY_FAILED');

  // ---------------------------------------------------------------------------
  // CATEGORY 8: HEALTH MATRIX MODAL & DIAGNOSTIC INTERFACE
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 8: Health Matrix Modal & Diagnostic Interface ---');

  const container = createMockElement();

  // Set API_KEY_INVALID state and render modal
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  app.state.supabase.status = 'error';
  app.renderSupabaseModal(container);

  const modalHtml = container.innerHTML;
  assert(modalHtml.includes('CLASPTEK PRODUCTION HEALTH MATRIX (PHASE 15)'), 'Modal renders Phase 15 Health Matrix header');
  assert(modalHtml.includes('1. Configuration &amp; Project'), 'Modal renders Section 1: Configuration');
  assert(modalHtml.includes('2. Authentication &amp; Identity'), 'Modal renders Section 2: Authentication');
  assert(modalHtml.includes('3. Database &amp; PostgREST'), 'Modal renders Section 3: PostgreSQL');
  assert(modalHtml.includes('4. Security &amp; Invariants'), 'Modal renders Section 4: Security');
  assert(modalHtml.includes('5. Persistence &amp; Authority State'), 'Modal renders Section 5: Persistence');

  assert(modalHtml.includes('Revalidate Supabase Configuration'), 'Modal includes Revalidate Supabase Configuration button');
  assert(modalHtml.includes('Run Database Connectivity Test'), 'Modal includes Run Database Connectivity Test button');
  assert(modalHtml.includes('Migration Locked'), 'Modal displays Migration Locked warning banner');
  assert(modalHtml.includes('SUPABASE API KEY INVALID'), 'Modal displays specific 401 diagnostic banner');
  assert(modalHtml.includes('Application: <strong>15.0.0</strong>'), 'Modal displays Application Version 15.0.0');

  // Clean up
  mockFetchHandler = null;

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================================');
  console.log(` PHASE 15 SUPABASE CONNECTIVITY CERTIFICATION: ${passed} PASSED / ${failed} FAILED (TOTAL ${testIndex} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled error during Phase 15 test execution:', err);
  process.exit(1);
});
