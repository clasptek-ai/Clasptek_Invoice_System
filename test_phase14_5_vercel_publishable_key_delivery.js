/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.5A Master Test Suite: Vercel SUPABASE_PUBLISHABLE_KEY Production Credential Wiring Audit
 * 
 * 75+ Assertions covering public credential delivery, resolution order, header correctness,
 * secret shielding, and RLS/Receivables render safety.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveBuildCredentials, validatePublicCredential } = require('./scripts/generate-runtime-config');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS [Test ${String(totalTests).padStart(3, '0')}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL [Test ${String(totalTests).padStart(3, '0')}]: ${message}`);
  }
}

function createMockElement(tagName = 'div', attrs = {}) {
  const el = {
    tagName: tagName.toUpperCase(),
    innerHTML: '',
    value: '',
    style: {},
    className: '',
    classList: {
      add: (c) => { if (!el.className.includes(c)) el.className += ' ' + c; },
      remove: (c) => { el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
      contains: (c) => el.className.includes(c)
    },
    attributes: { ...attrs },
    content: attrs.content || '',
    name: attrs.name || '',
    setAttribute: (k, v) => { el.attributes[k] = String(v); if (k === 'content') el.content = String(v); },
    getAttribute: (k) => el.attributes[k] || (k === 'content' ? el.content : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => []
  };
  return el;
}

function createHarness(customWindow = {}, customMetaMap = {}) {
  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error('Could not extract script block');

  const scriptCode = scriptMatch[1];
  const storageMap = {};

  const mockLocalStorage = {
    getItem: (k) => storageMap[k] || null,
    setItem: (k, v) => { storageMap[k] = String(v); },
    removeItem: (k) => { delete storageMap[k]; },
    clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
  };

  const metaMap = { ...customMetaMap };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, table: () => {} },
    Buffer,
    atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
    btoa: (s) => Buffer.from(s, 'utf-8').toString('base64'),
    window: {
      localStorage: mockLocalStorage,
      location: { reload: () => {} },
      addEventListener: () => {},
      atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
      btoa: (s) => Buffer.from(s, 'utf-8').toString('base64'),
      ...customWindow
    },
    document: {
      getElementById: (id) => createMockElement('div', { id }),
      querySelector: (selector) => {
        if (selector.includes('supabase-endpoint')) {
          return metaMap['supabase-endpoint'] ? createMockElement('meta', { name: 'supabase-endpoint', content: metaMap['supabase-endpoint'] }) : null;
        }
        if (selector.includes('supabase-publishable-key') || selector.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
          return metaMap['supabase-publishable-key'] ? createMockElement('meta', { name: 'supabase-publishable-key', content: metaMap['supabase-publishable-key'] }) : null;
        }
        if (selector.includes('supabase-anon-key') || selector.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
          return metaMap['supabase-anon-key'] ? createMockElement('meta', { name: 'supabase-anon-key', content: metaMap['supabase-anon-key'] }) : null;
        }
        return createMockElement();
      },
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: createMockElement('body')
    },
    localStorage: mockLocalStorage,
    fetch: async () => ({ ok: true, status: 200, json: async () => ([]) }),
    module: { exports: {} },
    process: { env: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return { app: sandbox.module.exports, sandbox, storageMap };
}

function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_hash').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runPhase14_5ATests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK PHASE 14.5A: VERCEL SUPABASE_PUBLISHABLE_KEY WIRING AUDIT');
  console.log('====================================================================================================\n');

  const pubKey = 'sb_publishable_prod_key_1234567890';
  const customTenantUuid = 'e8b23c91-4d1a-4e2b-98f1-c3091df882a1';
  const userJwt = generateMockJwt({ sub: 'usr_admin', role: 'SUPER_ADMIN', tenant_id: customTenantUuid, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });

  // ---------------------------------------------------------------------------
  // Category 1: Public Key Resolution Hierarchy in resolveSupabaseProductionConfig()
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Public Key Resolution Hierarchy ---');

  // Source 1: SUPABASE_PUBLISHABLE_KEY in window.__CLASPTEK_ENV__
  const h1 = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: pubKey
    }
  });
  const diag1 = h1.app.resolveSupabaseProductionConfig();
  assert(diag1.source === 'ENVIRONMENT', 'Test 001: Source 1 resolved from ENVIRONMENT');
  assert(diag1.publicKeyConfigured === true, 'Test 002: Source 1 publicKeyConfigured === true');
  assert(diag1.projectRef === 'logaawoigfxnisimfatf', 'Test 003: Source 1 projectRef matches canonical');
  assert(diag1.publicKeyRole === 'publishable', 'Test 004: Source 1 publicKeyRole identified as publishable');
  assert(diag1.secretDetected === false, 'Test 005: Source 1 secretDetected === false');

  // Source 2: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in window.__CLASPTEK_ENV__
  const h2 = createHarness({
    __CLASPTEK_ENV__: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk_next_public_key_9999'
    }
  });
  const diag2 = h2.app.resolveSupabaseProductionConfig();
  assert(diag2.source === 'ENVIRONMENT', 'Test 006: Source 2 resolved from ENVIRONMENT');
  assert(diag2.publicKeyConfigured === true, 'Test 007: Source 2 publicKeyConfigured === true');
  assert(diag2.publicKeyRole === 'publishable', 'Test 008: Source 2 publicKeyRole is publishable');

  // Source 3: SUPABASE_ANON_KEY in window.__CLASPTEK_ENV__
  const h3 = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJsb2dhYXdvaWdmeG5pc2ltZmF0ZiIsInJvbGUiOiJhbm9uIn0.mock_sig'
    }
  });
  const diag3 = h3.app.resolveSupabaseProductionConfig();
  assert(diag3.source === 'ENVIRONMENT', 'Test 009: Source 3 resolved from ENVIRONMENT');
  assert(diag3.publicKeyRole === 'anon', 'Test 010: Source 3 publicKeyRole is anon');
  assert(diag3.publicKeyProjectMatched === true, 'Test 011: Source 3 project matched via JWT payload ref');

  // Source 4: NEXT_PUBLIC_SUPABASE_ANON_KEY in window.__CLASPTEK_ENV__
  const h4 = createHarness({
    __CLASPTEK_ENV__: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJsb2dhYXdvaWdmeG5pc2ltZmF0ZiIsInJvbGUiOiJhbm9uIn0.mock_sig'
    }
  });
  const diag4 = h4.app.resolveSupabaseProductionConfig();
  assert(diag4.source === 'ENVIRONMENT', 'Test 012: Source 4 resolved from ENVIRONMENT');
  assert(diag4.publicKeyConfigured === true, 'Test 013: Source 4 publicKeyConfigured === true');

  // Source 5: META tag supabase-publishable-key
  const h5 = createHarness({}, {
    'supabase-endpoint': 'https://logaawoigfxnisimfatf.supabase.co',
    'supabase-publishable-key': 'sb_publishable_meta_tag_val'
  });
  const diag5 = h5.app.resolveSupabaseProductionConfig();
  assert(diag5.source === 'META', 'Test 014: Source 5 resolved from META tag');
  assert(diag5.publicKeyConfigured === true, 'Test 015: Source 5 publicKeyConfigured === true');

  // Source 6: META tag supabase-anon-key
  const h6 = createHarness({}, {
    'supabase-endpoint': 'https://logaawoigfxnisimfatf.supabase.co',
    'supabase-anon-key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJsb2dhYXdvaWdmeG5pc2ltZmF0ZiIsInJvbGUiOiJhbm9uIn0.mock_sig'
  });
  const diag6 = h6.app.resolveSupabaseProductionConfig();
  assert(diag6.source === 'META', 'Test 016: Source 6 resolved from META tag');
  assert(diag6.publicKeyRole === 'anon', 'Test 017: Source 6 publicKeyRole is anon');

  // Source 7: LocalStorage Runtime Config
  const h7 = createHarness();
  h7.app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co';
  h7.app.state.supabase.anonKey = 'pk_localstorage_publishable';
  const diag7 = h7.app.resolveSupabaseProductionConfig();
  assert(diag7.source === 'RUNTIME_CONFIG', 'Test 018: Source 7 resolved from RUNTIME_CONFIG');
  assert(diag7.publicKeyConfigured === true, 'Test 019: Source 7 publicKeyConfigured === true');

  // Source 8: NONE when unconfigured
  const h8 = createHarness();
  h8.app.state.supabase.endpoint = '';
  h8.app.state.supabase.anonKey = '';
  const diag8 = h8.app.resolveSupabaseProductionConfig();
  assert(diag8.source === 'NONE', 'Test 020: Source 8 returns NONE when unconfigured');

  // ---------------------------------------------------------------------------
  // Category 2: Secret Rejection & Security Shielding
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Secret Rejection & Security Shielding ---');

  // service_role JWT key rejection
  const srvJwt = generateMockJwt({ role: 'service_role', ref: 'logaawoigfxnisimfatf' });
  const hSrv = createHarness({ __CLASPTEK_ENV__: { SUPABASE_PUBLISHABLE_KEY: srvJwt } });
  const diagSrv = hSrv.app.resolveSupabaseProductionConfig();
  assert(diagSrv.secretDetected === true, 'Test 021: service_role key correctly flagged as secretDetected');

  // sbp_ token rejection
  const hSbp = createHarness({ __CLASPTEK_ENV__: { SUPABASE_PUBLISHABLE_KEY: 'sbp_invalid_cli_token' } });
  const diagSbp = hSbp.app.resolveSupabaseProductionConfig();
  assert(diagSbp.secretDetected === true, 'Test 022: sbp_* CLI token flagged as secretDetected');

  // postgres:// connection string rejection
  const hPg = createHarness({ __CLASPTEK_ENV__: { SUPABASE_PUBLISHABLE_KEY: 'postgres://postgres:pass@db.supabase.co:5432/postgres' } });
  const diagPg = hPg.app.resolveSupabaseProductionConfig();
  assert(diagPg.secretDetected === true, 'Test 023: postgres:// connection string flagged as secretDetected');

  // Build script secret validator throws on secrets
  let buildThrew = false;
  try {
    validatePublicCredential('sbp_mgmt_secret_token');
  } catch (e) {
    buildThrew = true;
  }
  assert(buildThrew === true, 'Test 024: Build script validatePublicCredential throws on sbp_*');

  let srvThrew = false;
  try {
    validatePublicCredential(srvJwt);
  } catch (e) {
    srvThrew = true;
  }
  assert(srvThrew === true, 'Test 025: Build script validatePublicCredential throws on service_role');

  // ---------------------------------------------------------------------------
  // Category 3: Canonical Client Construction & Header Correctness
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Canonical Client & Header Correctness ---');

  const hClient = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: pubKey
    }
  });

  const client = hClient.app.getSupabaseClient();
  assert(typeof client === 'object' && client !== null, 'Test 026: getSupabaseClient returns object');
  assert(client === hClient.app.supabaseClient, 'Test 027: getSupabaseClient is canonical instance');
  assert(client.isConfigured() === true, 'Test 028: client.isConfigured() returns true');

  // Header verification when unauthenticated
  hClient.app.state.auth = { isAuthenticated: false, supabaseJwt: null };
  const headersUnauth = client.getHeaders();
  assert(headersUnauth.apikey === pubKey, 'Test 029: apikey header contains public publishable key');
  assert(!headersUnauth.Authorization, 'Test 030: Authorization header is omitted when unauthenticated');
  assert(headersUnauth.Authorization !== `Bearer ${pubKey}`, 'Test 031: Publishable key is NEVER used as Bearer token');

  // Header verification when authenticated with valid user JWT
  hClient.app.state.auth = {
    isAuthenticated: true,
    supabaseJwt: userJwt,
    supabaseUser: { id: 'usr_admin', role: 'SUPER_ADMIN', tenant_id: customTenantUuid }
  };
  const headersAuth = client.getHeaders();
  assert(headersAuth.apikey === pubKey, 'Test 032: apikey header present with auth');
  assert(headersAuth.Authorization === `Bearer ${userJwt}`, 'Test 033: Authorization header contains user access JWT');
  assert(!headersAuth.Authorization.includes('sess_'), 'Test 034: Authorization header is not a sess_* pointer');
  assert(!headersAuth.Authorization.includes('undefined'), 'Test 035: Authorization header does not contain undefined');
  assert(!headersAuth.Authorization.includes('null'), 'Test 036: Authorization header does not contain null');

  // ---------------------------------------------------------------------------
  // Category 4: diagnoseSupabase401 Diagnostic Inspection
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: diagnoseSupabase401 Diagnostic Inspection ---');

  hClient.sandbox.fetch = async (url) => {
    if (url.includes('programmes')) {
      return { ok: true, status: 200, json: async () => [{ id: 'p1', name: 'Software Engineering' }] };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  const diagReport = await hClient.app.diagnoseSupabase401();
  assert(typeof diagReport === 'object', 'Test 037: diagnoseSupabase401 returns structured object');
  assert(diagReport.urlTest.urlValid === true, 'Test 038: urlTest confirms urlValid === true');
  assert(diagReport.urlTest.canonicalMatch === true, 'Test 039: urlTest confirms canonicalMatch === true');
  assert(diagReport.keyTest.isValid === true, 'Test 040: keyTest confirms isValid === true');
  assert(diagReport.keyTest.isServiceRole === false, 'Test 041: keyTest confirms isServiceRole === false');
  assert(diagReport.sessionTest.authenticated === true, 'Test 042: sessionTest confirms authenticated === true');
  assert(diagReport.sessionTest.tokenPresent === true, 'Test 043: sessionTest confirms tokenPresent === true');
  assert(diagReport.sessionTest.tokenExpired === false, 'Test 044: sessionTest confirms tokenExpired === false');
  assert(diagReport.headerTest.apiKeyPresent === true, 'Test 045: headerTest confirms apiKeyPresent === true');
  assert(diagReport.headerTest.bearerTokenPresent === true, 'Test 046: headerTest confirms bearerTokenPresent === true');
  assert(diagReport.headerTest.hasMalformedHeader === false, 'Test 047: headerTest confirms hasMalformedHeader === false');
  assert(diagReport.programmesTest.httpStatus === 200, 'Test 048: programmesTest reports httpStatus === 200');
  assert(diagReport.programmesTest.responseCategory === 'DATABASE_CONNECTED_DATA_PRESENT', 'Test 049: programmesTest classifies DATA_PRESENT');
  assert(diagReport.tenantTest.verified === true, 'Test 050: tenantTest confirms tenant verified');

  // ---------------------------------------------------------------------------
  // Category 5: HTTP Error Status Handling in PostgREST Client
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: HTTP Error Status Handling ---');

  // 401 Unauthorized
  hClient.sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) });
  const res401 = await client.from('programmes').select('*');
  assert(res401.ok === false, 'Test 051: 401 reports ok === false');
  assert(res401.errorClass === hClient.app.SUPABASE_ERROR_CLASS.AUTHENTICATION_FAILED, 'Test 052: 401 classifies AUTHENTICATION_FAILED');

  // 403 Forbidden / RLS Denied
  hClient.sandbox.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'RLS violated' }) });
  const res403 = await client.from('programmes').select('*');
  assert(res403.ok === false, 'Test 053: 403 reports ok === false');
  assert(res403.errorClass === hClient.app.SUPABASE_ERROR_CLASS.RLS_DENIED, 'Test 054: 403 classifies RLS_DENIED');

  // 404 Table Not Found
  hClient.sandbox.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Relation not found' }) });
  const res404 = await client.from('programmes').select('*');
  assert(res404.ok === false, 'Test 055: 404 reports ok === false');
  assert(res404.errorClass === hClient.app.SUPABASE_ERROR_CLASS.TABLE_NOT_FOUND, 'Test 056: 404 classifies TABLE_NOT_FOUND');

  // 500 Server Error
  hClient.sandbox.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'Database failure' }) });
  const res500 = await client.from('programmes').select('*');
  assert(res500.ok === false, 'Test 057: 500 reports ok === false');
  assert(res500.errorClass === hClient.app.SUPABASE_ERROR_CLASS.POSTGRES_ERROR, 'Test 058: 500 classifies POSTGRES_ERROR');

  // Network Fetch Exception
  hClient.sandbox.fetch = async () => { throw new Error('Failed to fetch'); };
  const resNet = await client.from('programmes').select('*');
  assert(resNet.ok === false, 'Test 059: Network exception reports ok === false');
  assert(resNet.errorClass === hClient.app.SUPABASE_ERROR_CLASS.NETWORK_ERROR, 'Test 060: Network exception classifies NETWORK_ERROR');

  // ---------------------------------------------------------------------------
  // Category 6: Receivables Aging Analysis Render Safety
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Receivables Aging Analysis Render Safety ---');

  const ageing = hClient.app.getReceivablesAgeingAnalysis();
  assert(typeof ageing === 'object' && ageing !== null, 'Test 061: getReceivablesAgeingAnalysis returns object');
  assert(typeof ageing.current === 'object', 'Test 062: ageing.current is defined');
  assert(typeof ageing.buckets === 'object', 'Test 063: ageing.buckets is defined');
  assert(typeof ageing.buckets.current === 'object', 'Test 064: ageing.buckets.current is defined');
  assert(typeof ageing.days_1_30 === 'object', 'Test 065: ageing.days_1_30 is defined');
  assert(typeof ageing.days_31_60 === 'object', 'Test 066: ageing.days_31_60 is defined');
  assert(typeof ageing.days_61_90 === 'object', 'Test 067: ageing.days_61_90 is defined');
  assert(typeof ageing.days_90_plus === 'object', 'Test 068: ageing.days_90_plus is defined');
  assert(typeof ageing.totalOutstanding === 'number', 'Test 069: ageing.totalOutstanding is number');

  // ---------------------------------------------------------------------------
  // Category 7: Migration Gating & Safety Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Migration Gating & Safety Invariants ---');

  // When unconfigured, migration preflight rejects
  const hUnconf = createHarness();
  hUnconf.app.state.supabase.endpoint = '';
  hUnconf.app.state.supabase.anonKey = '';
  const pfUnconf = await hUnconf.app.runProductionMigrationPreflight();
  assert(pfUnconf.eligible === false, 'Test 070: Preflight rejects unconfigured client');

  // When authority is locked, authoritative mode is not prematurely active
  assert(hClient.app.state.databaseAuthorityState !== hClient.app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 071: Authority remains BLOCKED before reconciliation');

  // Zero localStorage data deleted
  hClient.app.state.customers = [{ id: 'c1', name: 'Student 1' }];
  hClient.app.preserveCurrentState();
  assert(hClient.app.state.customers.length === 1, 'Test 072: preserveCurrentState preserves customers');

  // Format production config safely without leaking key
  const formatted = hClient.app.formatSupabaseProductionConfig(diagReport);
  assert(typeof formatted === 'object' && typeof formatted.text === 'string', 'Test 073: formatSupabaseProductionConfig returns structured report with text string');
  assert(!formatted.text.includes(pubKey), 'Test 074: formatSupabaseProductionConfig does not leak raw key');

  // Build credentials reader resolves defaults
  const creds = resolveBuildCredentials();
  assert(typeof creds.url === 'string' && creds.url.includes('supabase.co'), 'Test 075: resolveBuildCredentials returns canonical URL');
  assert(typeof creds.key === 'string', 'Test 076: resolveBuildCredentials returns string key');

  console.log('\n====================================================================================================');
  console.log(` PHASE 14.5A CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_5ATests().catch(err => {
  console.error('Unhandled error in Phase 14.5A test suite:', err);
  process.exit(1);
});
