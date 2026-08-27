/**
 * CLASPTEK AUTHORITATIVE SUPABASE PERSISTENCE & DATA LOSS PREVENTION TEST SUITE
 * 20-Point Automated Verification of PostgreSQL Authority, Multi-Session Retention,
 * Network Failure Protection, and Zero-Data-Loss Guarantees.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('================================================================');
console.log(' CLASPTEK AUTHORITATIVE SUPABASE PERSISTENCE TEST SUITE');
console.log(' 20-Point Automated Verification & Data Loss Prevention Suite');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ✖ [FAIL] ${testName} — ${details}`);
    failCount++;
  }
}

function createMockElement() {
  return {
    innerHTML: '',
    value: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    contains: () => false
  };
}

// Sandbox loader helper
function createSandboxEnvironment(customStorage = {}, customFetch = null) {
  const localStorageStore = { ...customStorage };
  
  global.localStorage = {
    getItem: (k) => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: (k) => { delete localStorageStore[k]; },
    clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
  };

  global.window = {
    location: { href: 'http://localhost:8080/clasptek_invoice_system.html', search: '' },
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const dummyEl = createMockElement();
  global.document = {
    getElementById: () => createMockElement(),
    querySelectorAll: () => [],
    querySelector: () => createMockElement(),
    createElement: () => createMockElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createMockElement()
  };

  global.alert = () => {};
  global.confirm = () => true;

  if (!global.crypto) {
    global.crypto = {
      subtle: {
        digest: async (algo, data) => {
          const hash = crypto.createHash('sha256').update(Buffer.from(data)).digest();
          return hash;
        }
      },
      getRandomValues: (arr) => crypto.randomFillSync(arr)
    };
  }

  global.fetch = customFetch || (async () => ({ ok: false, status: 404, json: async () => ({}) }));

  const htmlContent = fs.readFileSync(path.join(__dirname, 'clasptek_invoice_system.html'), 'utf8');
  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error('Could not find <script> tag in clasptek_invoice_system.html');

  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', scriptMatch[1]);
  runner(moduleObj, moduleObj.exports);

  return {
    exports: moduleObj.exports,
    storage: localStorageStore
  };
}

(async () => {
  try {
    // ----------------------------------------------------
    // Section 1: PostgREST Client & Network Architecture
    // ----------------------------------------------------
    console.log('Section 1: Supabase PostgREST Client Architecture');
    {
      const { exports } = createSandboxEnvironment();
      const sbClient = exports.supabaseClient;

      assert(typeof sbClient.from === 'function', 'Test 1: supabaseClient.from() builder is exposed');
      assert(typeof sbClient.rpc === 'function', 'Test 2: supabaseClient.rpc() database procedure caller is exposed');
      assert(typeof sbClient.ping === 'function', 'Test 3: supabaseClient.ping() health checker is exposed');
      
      const unconfPing = await sbClient.ping();
      assert(unconfPing.success === false && unconfPing.status === 'unconfigured', 'Test 4: Unconfigured client safely identifies missing credentials without throwing');
    }

    // ----------------------------------------------------
    // Section 2: Zero-Data-Loss Failure Protection
    // ----------------------------------------------------
    console.log('\nSection 2: Zero-Data-Loss Failure Protection & Empty Table Distinction');
    {
      // Simulate network failure
      const mockFailingFetch = async () => {
        throw new Error('ECONNREFUSED: Supabase unreachable');
      };

      const seedData = {
        'clasptek:invoices': JSON.stringify([{ id: 'inv_101', invoiceNo: 101, clientName: 'Existing Client', total: 150000 }]),
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'test_key' })
      };

      const { exports } = createSandboxEnvironment(seedData, mockFailingFetch);
      await exports.loadAll();

      assert(exports.state.supabase.status === 'error', 'Test 5: Network failure sets database error status');
      assert(exports.state.connectionError && exports.state.connectionError.includes('Unable to connect to the database'), 'Test 6: Database connection error banner message is set');
      assert(exports.state.invoices.length === 1 && exports.state.invoices[0].id === 'inv_101', 'Test 7: CRITICAL: Network failure NEVER overwrites state with empty array []');
    }

    // ----------------------------------------------------
    // Section 3: Authoritative Database Read & Hydration
    // ----------------------------------------------------
    console.log('\nSection 3: Database-First State Hydration from PostgreSQL');
    {
      const mockPostgresDb = {
        programmes: [{ id: 'prog_ielts_01', name: 'IELTS Mastery', price: 200000, category: 'Professional Exam' }],
        invoices: [{ id: 'inv_pg_2026', invoiceNo: 5001, clientName: 'Adaora Nwosu', total: 200000, status: 'unpaid' }],
        payments: [{ id: 'pay_pg_2026', receiptNo: 9001, invoiceId: 'inv_pg_2026', amount: 100000, paymentMethod: 'Bank Transfer' }],
        expenses: [{ id: 'exp_pg_2026', description: 'Classroom Rent', amount: 450000, categoryGroup: 'Operations' }],
        payslips: [{ id: 'psl_pg_2026', payslipNo: 8001, employeeName: 'Mary Okonjo', netPay: 280000, status: 'approved' }],
        personnel: [{ id: 'emp_pg_2026', name: 'Mary Okonjo', employeeId: 'EMP-0001', type: 'staff', basicPay: 280000 }],
        finance_settings: [{ id: 'fset_main', companyName: 'Clasptek Coaching Limited', taxId: 'TIN-9988-2026' }]
      };

      const mockSupabaseFetch = async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, text: async () => 'OK', json: async () => [{ id: 'prog_1' }] };
        }

        const match = urlStr.match(/\/([a-z_]+)\?/);
        const tableName = match ? match[1] : '';

        const data = mockPostgresDb[tableName] || [];
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(data),
          json: async () => data
        };
      };

      const seedConfig = {
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'valid_anon_key' })
      };

      // Empty localStorage for business records — simulating fresh browser!
      const { exports, storage } = createSandboxEnvironment(seedConfig, mockSupabaseFetch);
      await exports.loadAll();

      assert(exports.state.supabase.status === 'connected', 'Test 8: Supabase successfully connects when reachable');
      assert(exports.state.invoices.length === 1 && exports.state.invoices[0].clientName === 'Adaora Nwosu', 'Test 9: Fresh browser with empty localStorage retrieves invoices from PostgreSQL');
      assert(exports.state.payments.length === 1 && exports.state.payments[0].amount === 100000, 'Test 10: Fresh browser retrieves payments from PostgreSQL');
      assert(exports.state.payslips.length === 1 && exports.state.payslips[0].netPay === 280000, 'Test 11: Fresh browser retrieves payslips from PostgreSQL');
      assert(exports.state.personnel.length === 1 && exports.state.personnel[0].name === 'Mary Okonjo', 'Test 12: Fresh browser retrieves personnel from PostgreSQL');
      assert(exports.state.financeSettings.taxId === 'TIN-9988-2026', 'Test 13: Fresh browser retrieves company settings from PostgreSQL');
    }

    // ----------------------------------------------------
    // Section 4: Authoritative Write -> Database -> Read Back Persistence Cycle
    // ----------------------------------------------------
    console.log('\nSection 4: Authoritative Write -> Database -> Read Back Cycle');
    {
      const remoteDatabaseStore = {
        invoices: [],
        payments: [],
        expenses: [],
        payslips: [],
        finance_audit_log: []
      };

      const mockLiveFetch = async (url, opts = {}) => {
        const urlStr = String(url);
        const match = urlStr.match(/\/rest\/v1\/([a-z_]+)/);
        const tableName = match ? match[1] : '';
        const method = opts.method || 'GET';

        if (urlStr.includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, json: async () => [{ id: 'prog_test' }] };
        }

        if (method === 'POST') {
          const body = JSON.parse(opts.body || '[]');
          const rows = Array.isArray(body) ? body : [body];
          remoteDatabaseStore[tableName] = remoteDatabaseStore[tableName] || [];
          rows.forEach(r => {
            const idx = remoteDatabaseStore[tableName].findIndex(x => x.id === r.id);
            if (idx >= 0) remoteDatabaseStore[tableName][idx] = r;
            else remoteDatabaseStore[tableName].push(r);
          });
          return { ok: true, status: 201, json: async () => rows };
        }

        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => remoteDatabaseStore[tableName] || [] };
        }

        return { ok: true, status: 200, json: async () => ({}) };
      };

      const seedConfig = {
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'live_test_key' })
      };

      // 1. First session: Create records
      const session1 = createSandboxEnvironment(seedConfig, mockLiveFetch);
      await session1.exports.loadAll();

      const newInv = {
        id: 'inv_cycle_01',
        invoiceNo: 7001,
        clientName: 'Emeka Okafor',
        programmeName: 'SAT Preparation',
        total: 180000,
        status: 'unpaid'
      };

      await session1.exports.dbRepo.saveRecord('clasptek:invoices', newInv);
      assert(remoteDatabaseStore.invoices.length === 1 && remoteDatabaseStore.invoices[0].id === 'inv_cycle_01', 'Test 14: dbRepo.saveRecord writes directly to PostgreSQL remote table');

      // 2. Second session: Simulate browser reload / new device with empty localStorage
      const session2 = createSandboxEnvironment(seedConfig, mockLiveFetch);
      await session2.exports.loadAll();

      assert(session2.exports.state.invoices.length === 1 && session2.exports.state.invoices[0].clientName === 'Emeka Okafor', 'Test 15: Re-opened application reconstructs exact state from PostgreSQL');
      assert(session2.exports.state.supabase.lastSuccessfulRead !== null, 'Test 16: Last successful read timestamp is recorded');
    }

    // ----------------------------------------------------
    // Section 5: Relational Integrity & RLS Role Gates
    // ----------------------------------------------------
    console.log('\nSection 5: Relational Integrity & Access Control Preservation');
    {
      const { exports } = createSandboxEnvironment();
      
      const superAdminUser = { id: 'usr_sa', role: 'Super Admin', email: 'admin@clasptek.org' };
      const staffUser = { id: 'usr_st', role: 'Staff', email: 'mary@clasptek.org', personnelId: 'emp_mary' };
      const facilitatorUser = { id: 'usr_fc', role: 'Facilitator', email: 'trainer@clasptek.org', personnelId: 'emp_trainer' };

      assert(exports.canAccessTab(superAdminUser, 'settings') === true, 'Test 17: Super Admin has full governance and settings access');
      assert(exports.canAccessTab(staffUser, 'settings') === false, 'Test 18: Staff is barred from settings and governance tabs');
      assert(exports.canAccessTab(facilitatorUser, 'invoices') === false, 'Test 19: Facilitator is strictly barred from finance invoices');
      assert(exports.canAccessTab(facilitatorUser, 'myPayslips') === true, 'Test 20: Facilitator has authorized access to self-service payslips');
    }

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n================================================================');
    console.log(` PERSISTENCE TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL 20 TESTS)`);
    console.log('================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  }
})();
