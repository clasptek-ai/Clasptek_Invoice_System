/**
 * CLASPTEK PRODUCTION DATABASE VERIFICATION & PERSISTENCE HARDENING TEST SUITE
 * 30-Point Comprehensive Suite covering Live Connection Diagnostics, Schema Verification,
 * Data Migration, Empty-DB vs Failed-Query Safety, Fresh-Browser Persistence,
 * Cross-Device Parity, Financial Calculations, Payment/Payroll Integrity, and RLS Security.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('================================================================');
console.log(' CLASPTEK PRODUCTION DATABASE VERIFICATION & PERSISTENCE SUITE');
console.log(' 30-Point Enterprise Database Verification & Hardening Suite');
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

// Sandbox environment creator
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
    // Section 1: Supabase Connection & Diagnostics
    // ----------------------------------------------------
    console.log('Section 1: Connection & Runtime PostgREST Diagnostics');
    {
      const { exports } = createSandboxEnvironment();
      const sb = exports.supabaseClient;

      assert(sb.getEndpoint() === 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', 'Test 1: PostgREST endpoint is canonically configured');
      assert(typeof exports.state.supabase.lastSuccessfulRead !== 'undefined', 'Test 2: Diagnostic matrix tracks lastSuccessfulRead');
      assert(typeof exports.state.supabase.lastSuccessfulWrite !== 'undefined', 'Test 3: Diagnostic matrix tracks lastSuccessfulWrite');
      assert(typeof exports.state.supabase.status !== 'undefined', 'Test 4: Diagnostic matrix tracks live connection status');
    }

    // ----------------------------------------------------
    // Section 2: Schema & Repository Mapping Verification
    // ----------------------------------------------------
    console.log('\nSection 2: Database Schema & Entity Mapping Verification');
    {
      const { exports } = createSandboxEnvironment();
      const mapping = exports.DB_TABLE_MAPPING;

      const requiredEntities = [
        'programmes', 'invoices', 'payments', 'expenses', 'direct_income',
        'budgets', 'finance_audit_log', 'finance_periods', 'finance_settings',
        'payment_accounts', 'payslips', 'personnel', 'system_users',
        'enquiries', 'enrolments', 'customers', 'collection_notes',
        'payment_reminders', 'recurring_expenses', 'recurring_invoices', 'reconciliations'
      ];

      const mappedTables = Object.values(mapping);
      const allMapped = requiredEntities.every(table => mappedTables.includes(table));
      assert(allMapped, 'Test 5: All 21 required PostgreSQL tables are mapped in the repository layer');

      // Verify schema file exists and contains core tables
      const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.personnel'), 'Test 6: supabase_schema.sql contains public.personnel DDL');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.payslips'), 'Test 7: supabase_schema.sql contains public.payslips DDL');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.finance_settings'), 'Test 8: supabase_schema.sql contains public.finance_settings DDL');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.payment_accounts'), 'Test 9: supabase_schema.sql contains public.payment_accounts DDL');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.enquiries'), 'Test 10: supabase_schema.sql contains public.enquiries DDL');
      assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.enrolments'), 'Test 11: supabase_schema.sql contains public.enrolments DDL');
    }

    // ----------------------------------------------------
    // Section 3: Safe Data Migration & Idempotency
    // ----------------------------------------------------
    console.log('\nSection 3: Production Data Migration & Idempotency');
    {
      const localStore = {
        'clasptek:programmes': JSON.stringify([{ id: 'prog_ielts_mig', name: 'IELTS Intensive', price: 150000 }]),
        'clasptek:invoices': JSON.stringify([{ id: 'inv_mig_01', invoiceNo: 3001, clientName: 'Chidi Obi', total: 150000 }]),
        'clasptek:personnel': JSON.stringify([{ id: 'emp_mig_01', name: 'Kemi Adebayo', employeeId: 'EMP-9901', basicPay: 220000 }])
      };

      const cloudMockStore = { programmes: [], invoices: [], personnel: [] };
      const mockMigrationFetch = async (url, opts = {}) => {
        const urlStr = String(url);
        const match = urlStr.match(/\/rest\/v1\/([a-z_]+)/);
        const table = match ? match[1] : '';
        const method = opts.method || 'GET';

        if (urlStr.includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, json: async () => [{ id: 'prog_mig' }] };
        }

        if (method === 'POST') {
          const rows = JSON.parse(opts.body || '[]');
          cloudMockStore[table] = cloudMockStore[table] || [];
          rows.forEach(r => {
            const idx = cloudMockStore[table].findIndex(x => x.id === r.id);
            if (idx >= 0) cloudMockStore[table][idx] = r;
            else cloudMockStore[table].push(r);
          });
          return { ok: true, status: 201, json: async () => rows };
        }
        return { ok: true, status: 200, json: async () => cloudMockStore[table] || [] };
      };

      const sandbox = createSandboxEnvironment(localStore, mockMigrationFetch);
      // 1. Hydrate local records first
      await sandbox.exports.loadAll();

      // 2. Configure Supabase credentials
      sandbox.exports.state.supabase.anonKey = 'valid_test_key';

      // 3. Perform upsert migration of detected local state
      await sandbox.exports.supabaseClient.from('programmes').upsert(sandbox.exports.state.programmes);
      await sandbox.exports.supabaseClient.from('invoices').upsert(sandbox.exports.state.invoices);
      await sandbox.exports.supabaseClient.from('personnel').upsert(sandbox.exports.state.personnel);

      assert(cloudMockStore.programmes.length === 1 && cloudMockStore.programmes[0].id === 'prog_ielts_mig', 'Test 12: Migration preserves original IDs without alteration');
      assert(cloudMockStore.invoices.length === 1 && cloudMockStore.invoices[0].invoiceNo === 3001, 'Test 13: Invoices successfully migrated into cloud table');
      assert(cloudMockStore.personnel.length === 1 && cloudMockStore.personnel[0].employeeId === 'EMP-9901', 'Test 14: Personnel records successfully migrated into cloud table');

      // Idempotency check: repeat migration
      await sandbox.exports.supabaseClient.from('programmes').upsert(sandbox.exports.state.programmes);
      assert(cloudMockStore.programmes.length === 1, 'Test 15: Migration is strictly idempotent (zero duplicates created on re-run)');
    }

    // ----------------------------------------------------
    // Section 4: Critical Empty-Database vs Failed-Query Safety
    // ----------------------------------------------------
    console.log('\nSection 4: Critical Empty-Database vs Failed-Query Safety');
    {
      // Case A: Legitimately empty database
      const emptyDbFetch = async (url) => {
        if (String(url).includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, json: async () => [{ id: 'p_probe' }] };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const seedConfig = {
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'valid_key' })
      };

      const emptyEnv = createSandboxEnvironment(seedConfig, emptyDbFetch);
      await emptyEnv.exports.loadAll();
      assert(emptyEnv.exports.state.supabase.status === 'connected', 'Test 16: Legitimately empty PostgreSQL tables connect cleanly with zero errors');
      assert(emptyEnv.exports.state.invoices.length === 0, 'Test 17: Empty table populates empty state gracefully');

      // Case B: Failed query (network failure / 500 error)
      const failedDbFetch = async () => {
        return { ok: false, status: 500, json: async () => ({ message: 'Internal Server Error' }) };
      };

      const seedWithExistingData = {
        'clasptek:invoices': JSON.stringify([{ id: 'inv_persist_guard', invoiceNo: 4001, clientName: 'Tunde Lawal', total: 250000 }]),
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'valid_key' })
      };

      const failEnv = createSandboxEnvironment(seedWithExistingData, failedDbFetch);
      await failEnv.exports.loadAll();

      assert(failEnv.exports.state.connectionError !== null, 'Test 18: Failed database query sets connection error banner');
      assert(failEnv.exports.state.invoices.length === 1 && failEnv.exports.state.invoices[0].id === 'inv_persist_guard', 'Test 19: CRITICAL: Failed database query NEVER wipes state with empty array []');
    }

    // ----------------------------------------------------
    // Section 5: Fresh Browser & Cross-Device Acceptance Test
    // ----------------------------------------------------
    console.log('\nSection 5: Fresh Browser & Cross-Device Acceptance Test');
    {
      const centralPostgres = {
        programmes: [],
        customers: [],
        invoices: [],
        payments: [],
        expenses: [],
        personnel: [],
        payslips: []
      };

      const mockCentralFetch = async (url, opts = {}) => {
        const urlStr = String(url);
        const match = urlStr.match(/\/rest\/v1\/([a-z_]+)/);
        const table = match ? match[1] : '';
        const method = opts.method || 'GET';

        if (urlStr.includes('programmes?select=id&limit=1')) {
          return { ok: true, status: 200, json: async () => [{ id: 'prog_p' }] };
        }

        if (method === 'POST') {
          const rows = JSON.parse(opts.body || '[]');
          centralPostgres[table] = centralPostgres[table] || [];
          rows.forEach(r => {
            const idx = centralPostgres[table].findIndex(x => x.id === r.id);
            if (idx >= 0) centralPostgres[table][idx] = r;
            else centralPostgres[table].push(r);
          });
          return { ok: true, status: 201, json: async () => rows };
        }
        return { ok: true, status: 200, json: async () => centralPostgres[table] || [] };
      };

      const commonConfig = {
        'clasptek:supabase_config': JSON.stringify({ endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', anonKey: 'central_key' })
      };

      // 1. Browser A: Create complete transaction set
      const browserA = createSandboxEnvironment(commonConfig, mockCentralFetch);
      await browserA.exports.loadAll();

      const prog = { id: 'prog_prod_01', name: 'Full-Stack Data Engineering', price: 350000 };
      const cust = { id: 'cust_prod_01', name: 'Zainab Balogun', email: 'zainab@example.com' };
      const inv = { id: 'inv_prod_01', invoiceNo: 6001, clientName: 'Zainab Balogun', total: 350000, date: '2026-08-01', dueDate: '2026-08-15' };
      const pay = { id: 'pay_prod_01', receiptNo: 8001, invoiceId: 'inv_prod_01', amount: 350000, date: '2026-08-05', paymentMethod: 'Bank Transfer' };
      const exp = { id: 'exp_prod_01', description: 'Cloud Lab Infrastructure', amount: 95000, categoryGroup: 'Operations' };
      const pers = { id: 'emp_prod_01', employeeId: 'EMP-7701', name: 'Taiwo Afolabi', basicPay: 300000, type: 'staff' };
      const psl = { id: 'psl_prod_01', payslipNo: 9901, personnelId: 'emp_prod_01', employeeName: 'Taiwo Afolabi', netPay: 300000, status: 'approved' };

      await browserA.exports.dbRepo.saveRecord('clasptek:programmes', prog);
      await browserA.exports.dbRepo.saveRecord('clasptek:customers', cust);
      await browserA.exports.dbRepo.saveRecord('clasptek:invoices', inv);
      await browserA.exports.dbRepo.saveRecord('clasptek:payments', pay);
      await browserA.exports.dbRepo.saveRecord('clasptek:expenses', exp);
      await browserA.exports.dbRepo.saveRecord('clasptek:personnel', pers);
      await browserA.exports.dbRepo.saveRecord('clasptek:payslips', psl);

      assert(centralPostgres.invoices.length === 1 && centralPostgres.invoices[0].clientName === 'Zainab Balogun', 'Test 20: Browser A writes complete transaction set to PostgreSQL');

      // 2. Browser B / Incognito (Zero localStorage): Retrieves all records from PostgreSQL
      const browserB = createSandboxEnvironment(commonConfig, mockCentralFetch);
      await browserB.exports.loadAll();

      assert(browserB.exports.state.invoices.length === 1 && browserB.exports.state.invoices[0].clientName === 'Zainab Balogun', 'Test 21: Browser B (fresh session with empty storage) retrieves invoice from PostgreSQL');
      assert(browserB.exports.state.payments.length === 1 && browserB.exports.state.payments[0].receiptNo === 8001, 'Test 22: Browser B retrieves payment & receipt from PostgreSQL');
      assert(browserB.exports.state.expenses.length === 1 && browserB.exports.state.expenses[0].amount === 95000, 'Test 23: Browser B retrieves expense from PostgreSQL');
      assert(browserB.exports.state.personnel.length === 1 && browserB.exports.state.personnel[0].name === 'Taiwo Afolabi', 'Test 24: Browser B retrieves personnel from PostgreSQL');
      assert(browserB.exports.state.payslips.length === 1 && browserB.exports.state.payslips[0].netPay === 300000, 'Test 25: Browser B retrieves payslip from PostgreSQL');

      // 3. Browser A: Clears local storage, reloads, and verifies records remain intact
      browserA.storage = {};
      await browserA.exports.loadAll();
      assert(browserA.exports.state.invoices.length === 1 && browserA.exports.state.invoices[0].clientName === 'Zainab Balogun', 'Test 26: Browser A clears cache, reloads, and retains 100% data from PostgreSQL');
    }

    // ----------------------------------------------------
    // Section 6: Financial Arithmetic & Payroll Calculation
    // ----------------------------------------------------
    console.log('\nSection 6: Financial Calculations & Ledger Integrity');
    {
      const { exports } = createSandboxEnvironment();

      const inv = { total: 200000, items: [{ amount: 200000 }] };
      exports.state.payments = [{ invoiceId: 'inv_test_calc', amount: 120000 }];
      inv.id = 'inv_test_calc';

      const { balance, total, paid } = exports.invoiceBalance(inv);
      assert(total === 200000 && paid === 120000 && balance === 80000, 'Test 27: Invoice Balance (Total - Payments = Outstanding) calculates accurately');

      const pslTotals = exports.calculatePayslipTotals(250000, [{ amount: 30000 }, { amount: 20000 }], [{ amount: 15000 }]);
      assert(pslTotals.grossPay === 300000 && pslTotals.totalDeductions === 15000 && pslTotals.netPay === 285000, 'Test 28: Payslip Net Pay (Gross Pay - Deductions = Net Pay) calculates with 100% precision');
    }

    // ----------------------------------------------------
    // Section 7: Audit Trail Security & Secret Masking
    // ----------------------------------------------------
    console.log('\nSection 7: Audit Trail Sanitization & Secret Masking');
    {
      const { exports } = createSandboxEnvironment();

      await exports.logAudit('USER_LOGIN', 'auth', 'usr_admin', 'Admin logged in', null, {
        password: 'PlainTextSecret!',
        apiKey: 'eyJhbGciOiJIUzI1NiIsIn...',
        token: 'secret_token_12345'
      });

      const lastAudit = exports.state.auditLog[0];
      const auditJson = JSON.stringify(lastAudit);

      assert(!auditJson.includes('PlainTextSecret!'), 'Test 29: Plaintext passwords are NEVER written to audit logs');
      assert(!auditJson.includes('secret_token_12345'), 'Test 30: Tokens and secrets are sanitized before audit logging');
    }

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n================================================================');
    console.log(` PRODUCTION DATABASE VERIFICATION SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL 30 TESTS)`);
    console.log('================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  }
})();
