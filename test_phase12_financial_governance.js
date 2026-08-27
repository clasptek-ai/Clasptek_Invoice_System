/**
 * test_phase12_financial_governance.js
 * Comprehensive automated verification for Supabase 401 resolution,
 * PostgREST header hardening, configuration validation, persistence probe,
 * and data-loss protection guards.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    failCount++;
  }
}

function createSandboxEnvironment(customStorage = {}, customFetch = null) {
  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatch = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    throw new Error('Could not find script block in clasptek_invoice_system.html');
  }
  const jsCode = scriptMatch[1];

  const storageStore = { ...customStorage };
  const mockStorage = {
    get: async (key) => ({ value: storageStore[key] !== undefined ? storageStore[key] : null }),
    set: async (key, val) => { storageStore[key] = typeof val === 'string' ? val : JSON.stringify(val); return { success: true }; },
    remove: async (key) => { delete storageStore[key]; return { success: true }; },
    clear: async () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); return { success: true }; }
  };

  const defaultFetch = async (url, opts = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('programmes?select=id&limit=1')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'prog_01' }],
        text: async () => '[{"id":"prog_01"}]'
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]'
    };
  };

  const effectiveFetch = customFetch || defaultFetch;

  const sandbox = {
    window: {
      storage: mockStorage,
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    localStorage: {
      getItem: (k) => storageStore[k] || null,
      setItem: (k, v) => { storageStore[k] = v; },
      removeItem: (k) => { delete storageStore[k]; },
      clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); }
    },
    fetch: effectiveFetch,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    document: {
      getElementById: () => ({ value: '', addEventListener: () => {}, style: {} }),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: () => ({ appendChild: () => {}, setAttribute: () => {}, style: {} })
    },
    module: { exports: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(jsCode, sandbox);

  return {
    exports: sandbox.module.exports,
    storage: storageStore,
    sandbox
  };
}

(async function runAllTests() {
  console.log('\n================================================================');
  console.log(' CLASPTEK PHASE 12: SUPABASE AUTHORITATIVE CONNECTION & SECURITY');
  console.log('================================================================\n');

  try {
    // ----------------------------------------------------
    // Section 1: Header Construction & Token Hardening
    // ----------------------------------------------------
    console.log('Section 1: PostgREST Request Headers & Token Hardening');
    {
      const { exports } = createSandboxEnvironment({
        'clasptek:supabase_config': JSON.stringify({
          endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
          anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ2Fhd29pZ2Z4bmlzaW1mYXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzMjAwMDAsImV4cCI6MjA1NTg5NjAwMH0.sample_signature_anon_key_12345'
        })
      });

      await exports.loadAll();

      // Case A: User is logged in with internal session token ('sess_...')
      exports.state.auth = {
        isAuthenticated: true,
        user: { name: 'Super Admin', role: 'Super Admin' },
        token: 'sess_1740698123456_random_internal_token'
      };

      const headersA = exports.supabaseClient.getHeaders();
      assert(headersA['apikey'] && headersA['apikey'].startsWith('eyJ'), 'Test 1: apikey header contains public anon key');
      assert(!headersA['Authorization'].includes('sess_'), 'Test 2: Internal session token is NEVER sent in Authorization header to PostgREST');
      assert(headersA['Authorization'].startsWith('Bearer eyJ'), 'Test 3: Authorization defaults safely to anon key Bearer when token is internal');
      assert(headersA['Accept'] === 'application/json', 'Test 4: Accept header is canonically application/json');

      // Case B: User has a genuine Supabase JWT
      const mockSupabaseJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInVzZXJfaWQiOiJ1c3JfMDEifQ.jwt_sig';
      exports.state.auth.supabaseJwt = mockSupabaseJwt;

      const headersB = exports.supabaseClient.getHeaders();
      assert(headersB['Authorization'] === `Bearer ${mockSupabaseJwt}`, 'Test 5: Legitimate Supabase JWT is accurately attached to Authorization header');
    }

    // ----------------------------------------------------
    // Section 2: Explicit Configuration Validation & Fingerprinting
    // ----------------------------------------------------
    console.log('\nSection 2: Configuration Validation & Key Fingerprinting');
    {
      const { exports } = createSandboxEnvironment();

      // Test Valid Configuration
      exports.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
      exports.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.mock_anon_key_9876';

      const validDiag = exports.validateSupabaseConfiguration();
      assert(validDiag.isValid === true, 'Test 6: Valid endpoint and anon key pass validation');
      assert(validDiag.isExpectedProject === true, 'Test 7: Project endpoint matches logaawoigfxnisimfatf.supabase.co');
      assert(validDiag.keyFingerprint === '****9876', 'Test 8: Key fingerprint safely masks secret content (****9876)');

      // Test Malformed Key
      exports.state.supabase.anonKey = 'short_key';
      const malformedDiag = exports.validateSupabaseConfiguration();
      assert(malformedDiag.isValid === false, 'Test 9: Short/malformed key is flagged as invalid');
      assert(malformedDiag.isKeyMalformed === true, 'Test 10: isKeyMalformed flag is accurately set');

      // Test Service Role Rejection
      const serviceRoleB64 = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64');
      exports.state.supabase.anonKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${serviceRoleB64}.sig`;
      const sroleDiag = exports.validateSupabaseConfiguration();
      assert(sroleDiag.isValid === false && sroleDiag.isServiceRole === true, 'Test 11: Service-role key is detected and rejected from browser usage');
    }

    // ----------------------------------------------------
    // Section 3: Diagnostic Status Separation & Safe Health Check
    // ----------------------------------------------------
    console.log('\nSection 3: Diagnostic Status Separation & Health Check Matrix');
    {
      // Simulate 401 Invalid Key Response
      const mock401Fetch = async (url) => {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => JSON.stringify({ message: 'Invalid API key', hint: 'Double check your Supabase anon or service_role API key.' })
        };
      };

      const { exports } = createSandboxEnvironment({}, mock401Fetch);
      exports.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
      exports.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.invalid_key_1234';

      // Set auth session active
      exports.state.auth = { isAuthenticated: true, user: { name: 'Admin', role: 'Super Admin' } };

      const healthRes = await exports.runSupabaseHealthCheck();
      assert(healthRes.success === false, 'Test 12: Health check fails gracefully on HTTP 401');
      assert(healthRes.postgrestState === exports.DIAGNOSTIC_POSTGREST_STATE.UNAUTHORIZED, 'Test 13: Distinguishes POSTGREST_UNAUTHORIZED status');
      assert(healthRes.diagnostic.authStatus === exports.DIAGNOSTIC_AUTH_STATE.CONNECTED, 'Test 14: Confirms Auth session is distinct from PostgREST connection');
      assert(healthRes.message.includes('rejected the configured public API key'), 'Test 15: Returns clear actionable error message for 401 without exposing secrets');
      assert(!healthRes.message.includes('invalid_key_1234'), 'Test 16: Error message does not leak the API key');
    }

    // ----------------------------------------------------
    // Section 4: Non-Destructive Live Persistence Probe Cycle
    // ----------------------------------------------------
    console.log('\nSection 4: Non-Destructive Persistence Probe Cycle');
    {
      const remoteDb = {
        system_diagnostics: [],
        programmes: [{ id: 'prog_01' }]
      };

      const mockProbeFetch = async (url, opts = {}) => {
        const urlStr = String(url);
        const method = opts.method || 'GET';

        if (urlStr.includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, json: async () => remoteDb.programmes, text: async () => 'OK' };
        }

        if (urlStr.includes('system_diagnostics')) {
          if (method === 'POST') {
            const rows = JSON.parse(opts.body || '[]');
            remoteDb.system_diagnostics.push(...rows);
            return { ok: true, status: 201, json: async () => rows };
          }
          if (method === 'GET') {
            return { ok: true, status: 200, json: async () => remoteDb.system_diagnostics };
          }
          if (method === 'DELETE') {
            const match = urlStr.match(/id=eq\.([a-zA-Z0-9_]+)/);
            if (match) {
              const delId = match[1];
              remoteDb.system_diagnostics = remoteDb.system_diagnostics.filter(r => r.id !== delId);
            }
            return { ok: true, status: 200, json: async () => ({}) };
          }
        }

        return { ok: true, status: 200, json: async () => [] };
      };

      const { exports } = createSandboxEnvironment({}, mockProbeFetch);
      exports.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
      exports.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.valid_test_key_0011';

      const probeRes = await exports.runPersistenceProbe();
      assert(probeRes.success === true, 'Test 17: Persistence probe successfully completes all 4 stages');
      assert(probeRes.writeSuccess === true, 'Test 18: Stage 1 Write succeeded');
      assert(probeRes.readSuccess === true, 'Test 19: Stage 2 Read back succeeded');
      assert(probeRes.verifySuccess === true, 'Test 20: Stage 3 Payload verification succeeded');
      assert(probeRes.deleteSuccess === true, 'Test 21: Stage 4 Cleanup delete succeeded');
      assert(remoteDb.system_diagnostics.length === 0, 'Test 22: Probe record is completely removed from database after test');
      assert(exports.state.supabase.persistenceMode === 'AUTHORITATIVE', 'Test 23: Persistence mode transitions to AUTHORITATIVE upon successful probe');
    }

    // ----------------------------------------------------
    // Section 5: Critical Data-Loss Protection Invariants
    // ----------------------------------------------------
    console.log('\nSection 5: Critical Data-Loss Protection & Offline Guardrails');
    {
      const initialInvoices = [
        { id: 'inv_101', clientName: 'Ngozi Eze', total: 150000, status: 'unpaid' }
      ];

      // Simulate a network failure on DB hydration
      const mockNetworkErrorFetch = async () => {
        throw new Error('Failed to fetch: Network unreachable');
      };

      const seedStorage = {
        'clasptek:supabase_config': JSON.stringify({
          endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
          anonKey: 'valid_test_key'
        }),
        'clasptek:invoices': JSON.stringify(initialInvoices)
      };

      const { exports, storage } = createSandboxEnvironment(seedStorage, mockNetworkErrorFetch);
      await exports.loadAll();

      assert(exports.state.supabase.status === 'error', 'Test 24: Status flags error on network failure');
      assert(exports.state.invoices.length === 1, 'Test 25: Existing in-memory state is NEVER wiped on database query failure');
      assert(exports.state.invoices[0].clientName === 'Ngozi Eze', 'Test 26: Preserves customer invoice data intact');
      assert(JSON.parse(storage['clasptek:invoices']).length === 1, 'Test 27: Stored records are NOT overwritten with empty arrays');
      assert(exports.state.connectionError.includes('No financial data has been changed'), 'Test 28: Clear error message prevents false local authority');
    }

    // ----------------------------------------------------
    // Section 6: Relational Security & Multi-Role Tab Access
    // ----------------------------------------------------
    console.log('\nSection 6: Role-Based Access Control Boundaries');
    {
      const { exports } = createSandboxEnvironment();

      const superAdmin = { id: 'u1', role: 'Super Admin' };
      const financeMgr = { id: 'u2', role: 'Finance Manager' };
      const financeStaff = { id: 'u3', role: 'Finance Staff' };
      const staff = { id: 'u4', role: 'Staff' };
      const facilitator = { id: 'u5', role: 'Facilitator' };

      assert(exports.canAccessTab(superAdmin, 'financialIntelligence') === true, 'Test 29: Super Admin has financial intelligence access');
      assert(exports.canAccessTab(financeMgr, 'cashFlow') === true, 'Test 30: Finance Manager has cash flow forecast access');
      assert(exports.canAccessTab(financeStaff, 'financialIntelligence') === false, 'Test 31: Finance Staff is barred from executive financial intelligence');
      assert(exports.canAccessTab(staff, 'financialControls') === false, 'Test 32: General Staff is barred from financial controls');
      assert(exports.canAccessTab(facilitator, 'invoices') === false, 'Test 33: Facilitator is barred from company invoices');
      assert(exports.canAccessTab(facilitator, 'myPayslips') === true, 'Test 34: Facilitator has authorized access to personal payslips');
    }

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n================================================================');
    console.log(` PHASE 12 TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL 34 TESTS)`);
    console.log('================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  }
})();
