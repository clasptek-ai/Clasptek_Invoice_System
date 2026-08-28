/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.2 Test Suite: Component 0 — Environment / Deployment Credential Resolution Certification
 * 
 * Validates:
 * 1. Multi-tier credential resolution order (ENVIRONMENT -> META -> RUNTIME_CONFIG -> DEV -> NONE)
 * 2. Credential-blind diagnostic resolveSupabaseProductionConfig() return contract
 * 3. Secret detection shield (service_role, sbp_, postgres://, sk_)
 * 4. Project ref matching (canonical 'logaawoigfxnisimfatf' vs foreign)
 * 5. Strict Supabase Auth vs local session token (sess_...) separation in request headers
 * 6. Receivables tab rendering & .current bug elimination with defensive fallback banner
 * 7. 7-Gate production verification sequence and strict migration blocking on 401
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
      toggle: (c) => {
        if (el.className.includes(c)) el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim();
        else el.className += ' ' + c;
      },
      contains: (c) => el.className.includes(c)
    },
    attributes: { ...attrs },
    content: attrs.content || '',
    name: attrs.name || '',
    setAttribute: (k, v) => { el.attributes[k] = String(v); if (k === 'content') el.content = String(v); },
    getAttribute: (k) => el.attributes[k] || (k === 'content' ? el.content : null),
    removeAttribute: (k) => { delete el.attributes[k]; },
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
        if (selector === 'meta[name="supabase-endpoint"]') {
          return metaMap['supabase-endpoint'] ? createMockElement('meta', { name: 'supabase-endpoint', content: metaMap['supabase-endpoint'] }) : null;
        }
        if (selector === 'meta[name="supabase-publishable-key"]') {
          return metaMap['supabase-publishable-key'] ? createMockElement('meta', { name: 'supabase-publishable-key', content: metaMap['supabase-publishable-key'] }) : null;
        }
        if (selector === 'meta[name="supabase-anon-key"]') {
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
  return { app: sandbox.module.exports, sandbox };
}

function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_hash').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runPhase14_2Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 14.2: COMPONENT 0 ENVIRONMENT / DEPLOYMENT CREDENTIAL RESOLUTION');
  console.log('========================================================================================\n');

  // --- Tier 1: Multi-Tier Credential Resolution Hierarchy ---
  console.log('--- Tier 1: Multi-Tier Credential Resolution Hierarchy ---');

  // Source 1: ENVIRONMENT (window.__CLASPTEK_ENV__)
  const harnessEnv = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
      SUPABASE_PUBLISHABLE_KEY: generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'publishable' })
    }
  });
  const diagEnv = harnessEnv.app.resolveSupabaseProductionConfig();
  assert(diagEnv.source === 'ENVIRONMENT', 'Source 1: Resolves ENVIRONMENT when window.__CLASPTEK_ENV__ is populated');
  assert(diagEnv.urlConfigured === true, 'URL is configured from ENVIRONMENT');
  assert(diagEnv.publicKeyConfigured === true, 'Public key is configured from ENVIRONMENT');
  assert(diagEnv.publicKeyRole === 'publishable', 'Public key role is correctly identified as publishable');
  assert(diagEnv.publicKeyProjectMatched === true, 'Project ref matches canonical logaawoigfxnisimfatf');

  // Source 2: META (HTML Meta Tags in Head)
  const harnessMeta = createHarness({}, {
    'supabase-endpoint': 'https://logaawoigfxnisimfatf.supabase.co',
    'supabase-publishable-key': generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'publishable' })
  });
  harnessMeta.app.state.supabase.endpoint = '';
  harnessMeta.app.state.supabase.anonKey = '';
  const diagMeta = harnessMeta.app.resolveSupabaseProductionConfig();
  assert(diagMeta.source === 'META', 'Source 2: Resolves META when HTML meta tags exist and no __CLASPTEK_ENV__ is present');
  assert(diagMeta.urlConfigured === true, 'URL is configured from META');
  assert(diagMeta.publicKeyConfigured === true, 'Public key is configured from META');
  assert(diagMeta.publicKeyProjectMatched === true, 'Key project matches canonical project from META');

  // Source 3: RUNTIME_CONFIG (localStorage / state.supabase)
  const harnessRuntime = createHarness();
  harnessRuntime.app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  harnessRuntime.app.state.supabase.anonKey = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'anon' });
  const diagRuntime = harnessRuntime.app.resolveSupabaseProductionConfig();
  assert(diagRuntime.source === 'RUNTIME_CONFIG', 'Source 3: Resolves RUNTIME_CONFIG when loaded from state/localStorage');
  assert(diagRuntime.publicKeyRole === 'anon', 'Public key role is correctly identified as anon');

  // Source 4: NONE (Unconfigured Fallback)
  const harnessNone = createHarness();
  harnessNone.app.state.supabase.endpoint = '';
  harnessNone.app.state.supabase.anonKey = '';
  const diagNone = harnessNone.app.resolveSupabaseProductionConfig();
  assert(diagNone.source === 'NONE', 'Source 5: Resolves NONE when no environment, meta, or runtime key exists');
  assert(diagNone.publicKeyConfigured === false, 'Public key configured is false when key is empty');

  // --- Tier 2: Credential-Blind Diagnostic Contract & Secret Shield ---
  console.log('\n--- Tier 2: Credential-Blind Diagnostic Contract & Secret Shield ---');

  // Strict Return Keys Check (No raw keys permitted)
  const allowedKeys = ['source', 'urlConfigured', 'projectRef', 'publicKeyConfigured', 'publicKeyProjectMatched', 'publicKeyRole', 'secretDetected'];
  const diagKeys = Object.keys(diagEnv);
  assert(diagKeys.length === 7, 'Diagnostic returns exactly 7 properties');
  assert(allowedKeys.every(k => diagKeys.includes(k)), 'Diagnostic contains all and only authorized metadata fields');
  assert(!diagKeys.includes('key') && !diagKeys.includes('anonKey') && !diagKeys.includes('token'), 'CRITICAL: No raw credential field exists in diagnostic return');

  // Secret Detection: service_role
  const harnessServiceRole = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'service_role' })
    }
  });
  const diagServiceRole = harnessServiceRole.app.resolveSupabaseProductionConfig();
  assert(diagServiceRole.secretDetected === true, 'Secret Shield: Flags secretDetected === true for service_role token');
  assert(diagServiceRole.publicKeyRole === 'unknown', 'Secret Shield: Rejects service_role as public role');

  // Secret Detection: sbp_ CLI access token
  const harnessSbp = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sbp_test_personal_access_token_12345'
    }
  });
  const diagSbp = harnessSbp.app.resolveSupabaseProductionConfig();
  assert(diagSbp.secretDetected === true, 'Secret Shield: Flags secretDetected === true for sbp_ token');

  // Foreign Project Ref Mismatch Detection
  const harnessForeign = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://foreignproject99.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: generateMockJwt({ ref: 'otherproject123', role: 'publishable' })
    }
  });
  const diagForeign = harnessForeign.app.resolveSupabaseProductionConfig();
  assert(diagForeign.publicKeyProjectMatched === false, 'Project Match: Correctly identifies foreign project key mismatch');
  assert(diagForeign.projectRef === 'foreignproject99', 'Project Match: Correctly extracts foreign project ref');

  // Formatter Test
  const formatted = harnessEnv.app.formatSupabaseProductionConfig(diagEnv);
  assert(formatted.publicCredential === 'CONFIGURED', 'Formatter displays Public Credential: CONFIGURED');
  assert(formatted.credentialType === 'PUBLISHABLE', 'Formatter displays Credential Type: PUBLISHABLE');
  assert(formatted.secretExposure === 'NONE', 'Formatter displays Secret Exposure: NONE');

  // --- Tier 3: Strict Supabase Auth vs. Internal Session Token Isolation ---
  console.log('\n--- Tier 3: Strict Supabase Auth vs. Internal Session Token Isolation ---');

  const harnessAuth = createHarness();
  const validUserJwt = generateMockJwt({ sub: 'usr_admin', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const validAnonKey = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'anon' });
  harnessAuth.app.state.supabase.anonKey = validAnonKey;

  // Case A: Authenticated Supabase User
  harnessAuth.app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_sa_1', email: 'admin@clasptek.org', role: 'Super Admin', tenant_id: 'clasptek_main' },
    supabaseJwt: validUserJwt,
    token: 'sess_internal_token_12345'
  };

  const clientAuth = harnessAuth.app.getSupabaseClient();
  const headersAuth = clientAuth.getHeaders();
  assert(headersAuth['apikey'] === validAnonKey, 'Public key attaches to apikey header');
  assert(headersAuth['Authorization'] === `Bearer ${validUserJwt}`, 'Supabase user JWT attaches to Authorization header');
  assert(!headersAuth['Authorization'].includes('sess_'), 'CRITICAL: Internal sess_... token is NEVER used in Authorization header');

  // Case B: Local Guest Session without Supabase User Token
  harnessAuth.app.state.auth = {
    isAuthenticated: false,
    user: null,
    token: 'sess_guest_9999'
  };
  const headersGuest = clientAuth.getHeaders();
  assert(headersGuest['apikey'] === validAnonKey, 'Guest request attaches anon key as apikey');
  assert(headersGuest['Authorization'] === `Bearer ${validAnonKey}`, 'Guest request attaches anon key as Bearer fallback');
  assert(!headersGuest['Authorization'].includes('sess_'), 'Internal session token is NOT leaked in guest Authorization header');
  assert(!headersGuest['Authorization'].includes('undefined'), 'Authorization is never "Bearer undefined"');
  assert(!headersGuest['Authorization'].includes('null'), 'Authorization is never "Bearer null"');

  // --- Tier 4: Receivables Ageing Analysis & Defensive Rendering ---
  console.log('\n--- Tier 4: Receivables Ageing Analysis & Defensive Rendering ---');

  harnessAuth.app.state.invoices = [
    { id: 'INV-1', invoiceNo: 'INV-001', clientName: 'Student Alpha', dueDate: '2026-08-01', total: 100000, paid: 0, items: [] },
    { id: 'INV-2', invoiceNo: 'INV-002', clientName: 'Student Beta', dueDate: '2026-06-01', total: 200000, paid: 50000, items: [] }
  ];

  const ageing = harnessAuth.app.getReceivablesAgeingAnalysis();
  assert(typeof ageing.buckets !== 'undefined', 'getReceivablesAgeingAnalysis provides self-referential .buckets');
  assert(typeof ageing.days_1_30 !== 'undefined', 'Provides days_1_30 alias');
  assert(typeof ageing.days_31_60 !== 'undefined', 'Provides days_31_60 alias');
  assert(typeof ageing.days_61_90 !== 'undefined', 'Provides days_61_90 alias');
  assert(typeof ageing.days_90_plus !== 'undefined', 'Provides days_90_plus alias');
  assert(ageing.current.count >= 0, 'Current bucket has valid count');

  // Receivables Tab Rendering Test: When Database Authority is NOT Active
  harnessAuth.app.state.databaseAuthorityState = harnessAuth.app.DATABASE_AUTHORITY_STATE.AUTHENTICATION_FAILED;
  const mockContainer = createMockElement('div');
  harnessAuth.app.renderReceivablesTab(mockContainer);

  assert(mockContainer.innerHTML.includes('DATABASE DATA UNAVAILABLE'), 'Renders DATABASE DATA UNAVAILABLE notice banner');
  assert(mockContainer.innerHTML.includes('AUTHORITATIVE MODE NOT ACTIVE'), 'Renders AUTHORITATIVE MODE NOT ACTIVE notice');
  assert(mockContainer.innerHTML.includes('NO BUSINESS DATA HAS BEEN DELETED'), 'Renders NO BUSINESS DATA HAS BEEN DELETED protection guarantee');
  assert(mockContainer.innerHTML.includes('Current (Due)'), 'Renders Current (Due) KPI card cleanly');
  assert(!mockContainer.innerHTML.includes('TypeError'), 'Zero uncaught TypeError during Receivables tab rendering');

  // Receivables Tab Rendering Test: When Database Authority IS Active
  harnessAuth.app.state.databaseAuthorityState = harnessAuth.app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE;
  const mockContainerAuth = createMockElement('div');
  harnessAuth.app.renderReceivablesTab(mockContainerAuth);
  assert(!mockContainerAuth.innerHTML.includes('DATABASE DATA UNAVAILABLE'), 'Notice banner is suppressed when authoritative mode is active');
  assert(mockContainerAuth.innerHTML.includes('Receivables &amp; Collections Management'), 'Main header renders cleanly');

  // --- Tier 5: 7-Gate Production Verification Sequence ---
  console.log('\n--- Tier 5: 7-Gate Production Verification Sequence ---');

  // Simulate PostgREST 401 Outage
  const harness401 = createHarness({}, {
    'supabase-endpoint': 'https://logaawoigfxnisimfatf.supabase.co',
    'supabase-publishable-key': validAnonKey
  });
  harness401.sandbox.fetch = async () => ({
    status: 401,
    ok: false,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  const selfTest401 = await harness401.app.runProductionConnectionSelfTest();
  assert(selfTest401.postgrest === 'FAIL', 'Gate 4 PostgREST is FAIL on 401');
  assert(selfTest401.databaseAuthority === 'BLOCKED', 'CRITICAL: Database Authority is strictly BLOCKED on 401');

  // Verify Migration Lock on 401
  let migrationBlocked = false;
  try {
    harness401.app.state.databaseAuthorityState = harness401.app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
    await harness401.app.migrateLegacyDataToPostgres();
  } catch (err) {
    migrationBlocked = err.message.includes('locked');
  }
  assert(migrationBlocked === true, 'Gate 7: Production data migration is strictly BLOCKED while 401 persists');

  console.log('\n========================================================================================');
  console.log(` PHASE 14.2 CERTIFICATION: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_2Tests().catch(err => {
  console.error('Unhandled exception in Phase 14.2 test suite:', err);
  process.exit(1);
});
