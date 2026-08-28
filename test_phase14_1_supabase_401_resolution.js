/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.1 Test Suite: Supabase 401 Authentication Resolution & Production Connectivity Certification
 * 
 * Validates:
 * - URL validation & canonical project ref verification
 * - Public key format, presence, and PROJECT_KEY_MISMATCH detection
 * - Service-role key rejection & secret shield protection
 * - Single canonical client access via getSupabaseClient()
 * - Auth session detection & expiration handling
 * - Outgoing Bearer token sanitization (no undefined / null tokens)
 * - Tenant verification (clasptek_main) & authoritative role
 * - HTTP status classification: 401, 403, 404, 5xx, network failure
 * - Controlled programmes read: POSTGRESQL_CONNECTED (empty vs populated)
 * - RLS enforcement without security weakening
 * - State & local data preservation (preserveCurrentState, preserveLegacyData)
 * - Production connection self-test (runProductionConnectionSelfTest)
 * - Strict migration blocking on 401
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS [Test ${String(totalTests).padStart(2, '0')}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL [Test ${String(totalTests).padStart(2, '0')}]: ${message}`);
  }
}

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    innerHTML: '',
    value: '',
    style: {},
    className: '',
    classList: {
      add: (c) => { if (!el.className.includes(c)) el.className += ' ' + c; },
      remove: (c) => { el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
      toggle: (c) => {
        if (el.className.includes(c)) el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim();
        else el.className += ' ' + c;
      },
      contains: (c) => el.className.includes(c)
    },
    attributes: {},
    setAttribute: (k, v) => { el.attributes[k] = String(v); },
    getAttribute: (k) => el.attributes[k] || null,
    removeAttribute: (k) => { delete el.attributes[k]; },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => []
  };
  return el;
}

function createTestHarness(mockFetchHandler) {
  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not extract script block from clasptek_invoice_system.html');
  }

  const scriptCode = scriptMatch[1];
  const storageMap = {};

  const mockLocalStorage = {
    getItem: (key) => storageMap[key] || null,
    setItem: (key, val) => { storageMap[key] = String(val); },
    removeItem: (key) => { delete storageMap[key]; },
    clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
  };

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
      table: () => {}
    },
    Buffer,
    atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
    btoa: (s) => Buffer.from(s, 'utf-8').toString('base64'),
    window: {
      localStorage: mockLocalStorage,
      location: { reload: () => {} },
      addEventListener: () => {},
      atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
      btoa: (s) => Buffer.from(s, 'utf-8').toString('base64')
    },
    document: {
      getElementById: (id) => createMockElement(),
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: createMockElement('body')
    },
    localStorage: mockLocalStorage,
    fetch: async (url, options) => {
      if (mockFetchHandler) {
        return await mockFetchHandler(url, options);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([])
      };
    },
    mockFetch: async (url, options) => {
      if (mockFetchHandler) {
        return await mockFetchHandler(url, options);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([])
      };
    },
    module: { exports: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return sandbox.module.exports;
}

// Helper to generate a fake signed Supabase JWT with specific payload
function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_hash').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runPhase14_1Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 14.1: SUPABASE 401 AUTHENTICATION RESOLUTION & CONNECTIVITY CERTIFICATION');
  console.log('========================================================================================\n');

  // --- Category 1: Canonical Client Construction ---
  console.log('--- Category 1: Canonical Client Construction (getSupabaseClient) ---');
  const app1 = createTestHarness();
  assert(typeof app1.getSupabaseClient === 'function', 'getSupabaseClient is exported as a function');
  const client1 = app1.getSupabaseClient();
  assert(typeof client1 === 'object' && client1 !== null, 'getSupabaseClient returns a valid client object');
  assert(typeof client1.from === 'function', 'getSupabaseClient provides from() query interface');
  assert(typeof client1.getHeaders === 'function', 'getSupabaseClient provides getHeaders() method');
  assert(typeof client1.isConfigured === 'function', 'getSupabaseClient provides isConfigured() method');

  // --- Category 2: URL Validation & Project Identity ---
  console.log('\n--- Category 2: URL Validation & Project Identity ---');
  assert(typeof app1.CANONICAL_SUPABASE_PROJECT_REF === 'string', 'CANONICAL_SUPABASE_PROJECT_REF is exported');
  assert(app1.CANONICAL_SUPABASE_PROJECT_REF === 'logaawoigfxnisimfatf', 'Canonical project ref is logaawoigfxnisimfatf');
  assert(app1.CANONICAL_SUPABASE_REST_ENDPOINT.includes('logaawoigfxnisimfatf'), 'Canonical endpoint contains logaawoigfxnisimfatf');

  app1.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app1.state.supabase.anonKey = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 });
  const diagUrl = await app1.diagnoseSupabase401();
  assert(diagUrl.urlTest.configured === true, 'URL test reports configured === true');
  assert(diagUrl.urlTest.urlValid === true, 'URL test reports urlValid === true');
  assert(diagUrl.urlTest.projectRef === 'logaawoigfxnisimfatf', 'URL test identifies projectRef as logaawoigfxnisimfatf');
  assert(diagUrl.urlTest.canonicalMatch === true, 'URL test confirms canonical match');

  // Negative URL Test (Foreign project URL)
  app1.state.supabase.endpoint = 'https://otherproject12345.supabase.co/rest/v1';
  const diagWrongUrl = await app1.diagnoseSupabase401();
  assert(diagWrongUrl.urlTest.canonicalMatch === false, 'Detects non-canonical project URL');
  assert(diagWrongUrl.urlTest.urlValid === false, 'urlValid is false when project ref mismatches canonical');

  // --- Category 3: Public Anonymous Key & PROJECT_KEY_MISMATCH ---
  console.log('\n--- Category 3: Public Anonymous Key & PROJECT_KEY_MISMATCH ---');
  // Sub-test A: Missing Key
  app1.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app1.state.supabase.anonKey = '';
  const diagMissingKey = await app1.diagnoseSupabase401();
  assert(diagMissingKey.keyTest.present === false, 'Detects missing API key');
  assert(diagMissingKey.keyTest.keyStatus === 'MISSING', 'keyStatus is MISSING when key is empty');

  // Sub-test B: PROJECT_KEY_MISMATCH
  const wrongProjectKey = generateMockJwt({ ref: 'foreignproject999', role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 });
  app1.state.supabase.anonKey = wrongProjectKey;
  const diagMismatchKey = await app1.diagnoseSupabase401();
  assert(diagMismatchKey.keyTest.keyStatus === 'PROJECT_KEY_MISMATCH', 'Detects PROJECT_KEY_MISMATCH for foreign project key');
  assert(diagMismatchKey.keyTest.isProjectMatch === false, 'isProjectMatch is false on mismatch');
  assert(!diagMismatchKey.keyTest.display.includes('foreignproject999'), 'Key display does NOT leak token payload');
  assert(diagMismatchKey.keyTest.display.startsWith('••••••••'), 'Key display formats masked key as ••••••••last4');

  // Sub-test C: Service-Role Key Rejection (Secret Shield)
  const serviceRoleKey = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 });
  app1.state.supabase.anonKey = serviceRoleKey;
  const diagServiceKey = await app1.diagnoseSupabase401();
  assert(diagServiceKey.keyTest.keyStatus === 'SERVICE_ROLE_REJECTED', 'Strictly rejects service_role key');
  assert(diagServiceKey.keyTest.isServiceRole === true, 'Flags isServiceRole as true');
  assert(diagServiceKey.keyTest.isValid === false, 'Service role key is NOT valid for browser use');

  // Sub-test D: Valid Anon Key
  const validAnonKey = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 });
  app1.state.supabase.anonKey = validAnonKey;
  const diagValidKey = await app1.diagnoseSupabase401();
  assert(diagValidKey.keyTest.keyStatus === 'VALID', 'Valid project anon key is classified as VALID');
  assert(diagValidKey.keyTest.isValid === true, 'isValid is true for correct project anon key');
  assert(diagValidKey.keyTest.display.startsWith('••••••••'), 'Valid key masked display begins with ••••••••');

  // --- Category 4: Authentication Session & Authorization Headers ---
  console.log('\n--- Category 4: Authentication Session & Authorization Headers ---');
  app1.state.auth = {
    isAuthenticated: true,
    user: {
      id: 'usr_super_admin',
      email: 'admin@clasptek.org',
      role: 'Super Admin',
      tenant_id: 'clasptek_main'
    },
    supabaseJwt: generateMockJwt({ sub: 'usr_super_admin', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
    expiresAt: Date.now() + 3600000
  };

  const diagAuth = await app1.diagnoseSupabase401();
  assert(diagAuth.sessionTest.authenticated === true, 'Session is identified as authenticated');
  assert(diagAuth.sessionTest.userId === 'usr_****', 'User ID is sanitized to usr_****');
  assert(diagAuth.sessionTest.role === 'SUPER_ADMIN', 'Authoritative role is mapped to SUPER_ADMIN');
  assert(diagAuth.sessionTest.tokenPresent === true, 'Access token is verified present');
  assert(diagAuth.sessionTest.tokenExpired === false, 'Access token is verified not expired');
  assert(diagAuth.sessionTest.tokenSanitized === true, 'Token sanitization flag is true (never logs raw JWT)');

  // Header Validation: No undefined or null
  const headers = app1.getSupabaseClient().getHeaders();
  assert(typeof headers['apikey'] === 'string' && headers['apikey'].length > 10, 'apikey header contains valid anon key');
  assert(headers['apikey'] !== 'undefined', 'apikey header is NEVER "undefined"');
  assert(headers['apikey'] !== 'null', 'apikey header is NEVER "null"');
  assert(typeof headers['Authorization'] === 'string' && headers['Authorization'].startsWith('Bearer '), 'Authorization header begins with "Bearer "');
  assert(!headers['Authorization'].includes('undefined'), 'Authorization header is NEVER "Bearer undefined"');
  assert(!headers['Authorization'].includes('null'), 'Authorization header is NEVER "Bearer null"');
  assert(!headers['Authorization'].startsWith('Bearer sess_'), 'Internal session token (sess_...) is NEVER used in Authorization header');

  assert(diagAuth.headerTest.apiKeyPresent === true, 'Diagnostic confirms apiKeyPresent === true');
  assert(diagAuth.headerTest.authorizationPresent === true, 'Diagnostic confirms authorizationPresent === true');
  assert(diagAuth.headerTest.bearerTokenPresent === true, 'Diagnostic confirms bearerTokenPresent === true');
  assert(diagAuth.headerTest.tokenRedacted === true, 'Diagnostic confirms tokenRedacted === true');

  // --- Category 5: Controlled Request to programmes (HTTP Status Matrix) ---
  console.log('\n--- Category 5: Controlled Request to programmes (HTTP Status Matrix) ---');
  // Scenario 5.1: 401 Unauthorized
  const app401 = createTestHarness(async (url) => {
    return {
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid API key' })
    };
  });
  app401.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app401.state.supabase.anonKey = validAnonKey;
  const diag401 = await app401.diagnoseSupabase401();
  assert(diag401.programmesTest.httpStatus === 401, 'Correctly records HTTP 401 status');
  assert(diag401.programmesTest.responseCategory === 'AUTHENTICATION_FAILED', 'Interprets 401 as AUTHENTICATION_FAILED');
  assert(diag401.programmesTest.querySuccess === false, 'querySuccess is false on 401');

  // Scenario 5.2: 403 Forbidden (RLS Denied)
  const app403 = createTestHarness(async (url) => {
    return {
      status: 403,
      ok: false,
      statusText: 'Forbidden',
      json: async () => ({ message: 'new row violates row-level security policy' })
    };
  });
  app403.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app403.state.supabase.anonKey = validAnonKey;
  const diag403 = await app403.diagnoseSupabase401();
  assert(diag403.programmesTest.httpStatus === 403, 'Correctly records HTTP 403 status');
  assert(diag403.programmesTest.responseCategory === 'RLS_AUTHORIZATION_FAILED', 'Interprets 403 as RLS_AUTHORIZATION_FAILED');

  // Scenario 5.3: 404 Not Found
  const app404 = createTestHarness(async (url) => {
    return {
      status: 404,
      ok: false,
      statusText: 'Not Found',
      json: async () => ({ message: 'table not found' })
    };
  });
  app404.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app404.state.supabase.anonKey = validAnonKey;
  const diag404 = await app404.diagnoseSupabase401();
  assert(diag404.programmesTest.httpStatus === 404, 'Correctly records HTTP 404 status');
  assert(diag404.programmesTest.responseCategory === 'SCHEMA_OR_TABLE_NOT_FOUND', 'Interprets 404 as SCHEMA_OR_TABLE_NOT_FOUND');

  // Scenario 5.4: 500 Server Error
  const app500 = createTestHarness(async (url) => {
    return {
      status: 500,
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'PostgreSQL connection pool exhausted' })
    };
  });
  app500.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app500.state.supabase.anonKey = validAnonKey;
  const diag500 = await app500.diagnoseSupabase401();
  assert(diag500.programmesTest.httpStatus === 500, 'Correctly records HTTP 500 status');
  assert(diag500.programmesTest.responseCategory === 'POSTGRESQL_SERVER_ERROR', 'Interprets 500 as POSTGRESQL_SERVER_ERROR');

  // Scenario 5.5: 200 OK — Database Empty
  const app200Empty = createTestHarness(async (url) => {
    return {
      status: 200,
      ok: true,
      json: async () => ([])
    };
  });
  app200Empty.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app200Empty.state.supabase.anonKey = validAnonKey;
  const diag200Empty = await app200Empty.diagnoseSupabase401();
  assert(diag200Empty.programmesTest.httpStatus === 200, 'Correctly records HTTP 200 status');
  assert(diag200Empty.programmesTest.rowCount === 0, 'Row count is 0');
  assert(diag200Empty.programmesTest.responseCategory === 'DATABASE_CONNECTED_EMPTY', 'Interprets 200 + 0 rows as DATABASE_CONNECTED_EMPTY');

  // Scenario 5.6: 200 OK — Data Present
  const app200Data = createTestHarness(async (url) => {
    return {
      status: 200,
      ok: true,
      json: async () => ([{ id: 'PRG-001', name: 'Executive Masterclass' }])
    };
  });
  app200Data.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
  app200Data.state.supabase.anonKey = validAnonKey;
  const diag200Data = await app200Data.diagnoseSupabase401();
  assert(diag200Data.programmesTest.httpStatus === 200, 'Records HTTP 200 status');
  assert(diag200Data.programmesTest.rowCount === 1, 'Row count is 1');
  assert(diag200Data.programmesTest.responseCategory === 'DATABASE_CONNECTED_DATA_PRESENT', 'Interprets 200 + rows as DATABASE_CONNECTED_DATA_PRESENT');

  // --- Category 6: Tenant Membership & Authoritative Role ---
  console.log('\n--- Category 6: Tenant Membership & Authoritative Role ---');
  assert(diagAuth.tenantTest.verified === true, 'Tenant verification succeeds for clasptek_main');
  assert(diagAuth.tenantTest.tenantId === 'clasptek_main', 'Authoritative tenant ID is clasptek_main');
  assert(diagAuth.tenantTest.role === 'SUPER_ADMIN', 'Authoritative role verified as SUPER_ADMIN');
  assert(diagAuth.tenantTest.membershipAuthoritative === true, 'Membership is authoritative');

  // --- Category 7: Production Auth Context ASCII Box & Diagnostic Matrix ---
  console.log('\n--- Category 7: Production Auth Context ASCII Box & Diagnostic Matrix ---');
  assert(typeof diagAuth.asciiBox === 'string', 'asciiBox is generated as a string');
  assert(diagAuth.asciiBox.includes('PRODUCTION AUTHENTICATION'), 'asciiBox contains PRODUCTION AUTHENTICATION header');
  assert(diagAuth.asciiBox.includes('Supabase Project'), 'asciiBox displays Supabase Project');
  assert(diagAuth.asciiBox.includes('Public API Credential'), 'asciiBox displays Public API Credential');
  assert(diagAuth.asciiBox.includes('Tenant'), 'asciiBox displays Tenant');
  assert(diagAuth.asciiBox.includes('Role'), 'asciiBox displays Role');

  assert(Array.isArray(diagAuth.diagnosticMatrix), 'diagnosticMatrix is an array');
  assert(diagAuth.diagnosticMatrix.length === 12, 'diagnosticMatrix contains exactly 12 verification items');
  const matrixItems = diagAuth.diagnosticMatrix.map(m => m.test);
  assert(matrixItems.includes('Supabase URL'), 'Matrix includes Supabase URL');
  assert(matrixItems.includes('Project Match'), 'Matrix includes Project Match');
  assert(matrixItems.includes('Public Key'), 'Matrix includes Public Key');
  assert(matrixItems.includes('Auth Session'), 'Matrix includes Auth Session');
  assert(matrixItems.includes('Access Token'), 'Matrix includes Access Token');
  assert(matrixItems.includes('Tenant Membership'), 'Matrix includes Tenant Membership');
  assert(matrixItems.includes('User Role'), 'Matrix includes User Role');
  assert(matrixItems.includes('PostgREST'), 'Matrix includes PostgREST');
  assert(matrixItems.includes('RLS'), 'Matrix includes RLS');
  assert(matrixItems.includes('programmes Query'), 'Matrix includes programmes Query');
  assert(matrixItems.includes('Database Inventory'), 'Matrix includes Database Inventory');
  assert(matrixItems.includes('Authority Gate'), 'Matrix includes Authority Gate');

  // --- Category 8: Zero-Data-Loss Invariants & Preservation Helpers ---
  console.log('\n--- Category 8: Zero-Data-Loss & Preservation Helpers ---');
  assert(typeof app1.preserveCurrentState === 'function', 'preserveCurrentState is exported');
  assert(typeof app1.preserveLegacyData === 'function', 'preserveLegacyData is exported');

  app1.state.invoices = [{ id: 'INV-100', total: 250000 }];
  app1.state.customers = [{ id: 'CUST-100', name: 'Dr. Alabi' }];
  app1.state.payments = [{ id: 'PAY-100', amount: 250000 }];

  const statePreserved = app1.preserveCurrentState();
  assert(statePreserved.status === 'PROTECTED', 'preserveCurrentState status is PROTECTED');
  assert(statePreserved.invoicesPreserved === 1, 'Invoices count preserved');
  assert(statePreserved.customersPreserved === 1, 'Customers count preserved');
  assert(statePreserved.paymentsPreserved === 1, 'Payments count preserved');

  const legacyPreserved = await app1.preserveLegacyData();
  assert(legacyPreserved.status === 'PROTECTED', 'preserveLegacyData status is PROTECTED');
  assert(typeof legacyPreserved.totalRecordsPreserved === 'number', 'Total legacy records counted and protected');

  // --- Category 9: Production Connection Self-Test (runProductionConnectionSelfTest) ---
  console.log('\n--- Category 9: Production Connection Self-Test (runProductionConnectionSelfTest) ---');
  assert(typeof app1.runProductionConnectionSelfTest === 'function', 'runProductionConnectionSelfTest is exported');

  // Case A: 401 Outage -> databaseAuthority must be BLOCKED
  const selfTest401 = await app401.runProductionConnectionSelfTest();
  assert(selfTest401.postgrest === 'FAIL', 'postgrest is FAIL on 401');
  assert(selfTest401.programmesRead === 'FAIL', 'programmesRead is FAIL on 401');
  assert(selfTest401.databaseAuthority === 'BLOCKED', 'CRITICAL: databaseAuthority is strictly BLOCKED on 401');

  // Case B: Healthy Connection -> but authority gate not yet triggered -> still BLOCKED
  app200Data.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin', email: 'admin@clasptek.org', role: 'Super Admin', tenant_id: 'clasptek_main' },
    supabaseJwt: generateMockJwt({ sub: 'usr_admin', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  };
  const selfTestHealthy = await app200Data.runProductionConnectionSelfTest();
  assert(selfTestHealthy.configuration === 'PASS', 'configuration is PASS on healthy setup');
  assert(selfTestHealthy.projectIdentity === 'PASS', 'projectIdentity is PASS on healthy setup');
  assert(selfTestHealthy.authentication === 'PASS', 'authentication is PASS on healthy setup');
  assert(selfTestHealthy.tenant === 'PASS', 'tenant is PASS on healthy setup');
  assert(selfTestHealthy.postgrest === 'PASS', 'postgrest is PASS on healthy setup');
  assert(selfTestHealthy.programmesRead === 'PASS', 'programmesRead is PASS on healthy setup');
  assert(selfTestHealthy.databaseAuthority === 'BLOCKED', 'databaseAuthority remains BLOCKED until formal activation gate');

  // Case C: Authoritative State Activated
  app200Data.state.databaseAuthorityState = app200Data.DATABASE_AUTHORITY_STATE.AUTHORITATIVE;
  const selfTestAuth = await app200Data.runProductionConnectionSelfTest();
  assert(selfTestAuth.databaseAuthority === 'AUTHORITATIVE', 'databaseAuthority reflects AUTHORITATIVE once certified');

  // --- Category 10: Banner Actionable Diagnostic Text ---
  console.log('\n--- Category 10: Actionable Diagnostic UI Banners ---');
  // 401 Banner
  app1.state.databaseAuthorityState = app1.DATABASE_AUTHORITY_STATE.AUTHENTICATION_FAILED;
  const banner401 = app1.renderDatabaseBannerHtml();
  assert(banner401.includes('🔴 POSTGRESQL AUTHENTICATION FAILED'), '401 banner displays POSTGRESQL AUTHENTICATION FAILED');
  assert(banner401.includes('HTTP Status: 401'), '401 banner explicitly shows HTTP Status: 401');
  assert(banner401.includes('Data Safety: PROTECTED'), '401 banner confirms Data Safety: PROTECTED');
  assert(banner401.includes('Migration: BLOCKED'), '401 banner confirms Migration: BLOCKED');

  // 403 Banner
  app1.state.databaseAuthorityState = app1.DATABASE_AUTHORITY_STATE.RLS_AUTHORIZATION_FAILED;
  const banner403 = app1.renderDatabaseBannerHtml();
  assert(banner403.includes('🔴 POSTGRESQL AUTHORIZATION/RLS DENIED'), '403 banner displays POSTGRESQL AUTHORIZATION/RLS DENIED');
  assert(banner403.includes('HTTP Status: 403'), '403 banner explicitly shows HTTP Status: 403');

  // 200 Empty Banner
  app1.state.databaseAuthorityState = app1.DATABASE_AUTHORITY_STATE.EMPTY_DATABASE;
  const bannerEmpty = app1.renderDatabaseBannerHtml();
  assert(bannerEmpty.includes('🟠 POSTGRESQL CONNECTED — DATABASE EMPTY'), '200 empty banner displays POSTGRESQL CONNECTED — DATABASE EMPTY');
  assert(bannerEmpty.includes('LOCAL LEGACY DATA DETECTED — MIGRATION REQUIRED'), '200 empty banner displays LOCAL LEGACY DATA DETECTED');

  // 200 Data Present Banner
  app1.state.databaseAuthorityState = app1.DATABASE_AUTHORITY_STATE.AUTHORITATIVE;
  app1.state.invoices = [{ id: 'INV-1', total: 500000 }];
  const bannerData = app1.renderDatabaseBannerHtml();
  assert(bannerData.includes('🟢 POSTGRESQL CONNECTED — DATA PRESENT'), '200 data present banner displays POSTGRESQL CONNECTED — DATA PRESENT');
  assert(bannerData.includes('POSTGRESQL AUTHORITATIVE MODE ACTIVE'), 'Authoritative banner active');

  console.log('\n========================================================================================');
  console.log(` PHASE 14.1 CERTIFICATION: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_1Tests().catch(err => {
  console.error('Unhandled error in Phase 14.1 test suite:', err);
  process.exit(1);
});
