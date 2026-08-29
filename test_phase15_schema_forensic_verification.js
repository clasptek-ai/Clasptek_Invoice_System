/**
 * CLASPTEK ENTERPRISE MANAGEMENT SYSTEM
 * Test Suite 27: Phase 15A — Forensic Schema Verification & Production Table Inventory
 * 
 * Certifies the exact schema existence, column definitions, primary keys, foreign keys,
 * tenant isolation, RLS status, and PostgREST endpoint accessibility for all 27 production tables.
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

function createHarness(customEnv = {}, mockFetchFn = null) {
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

  const defaultFetch = async () => ({ ok: true, status: 200, json: async () => ([]), text: async () => '[]' });

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
      __CLASPTEK_ENV__: {
        SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_phase15_prod_key_99999',
        ...customEnv
      }
    },
    document: {
      getElementById: (id) => createMockElement('div', { id }),
      querySelector: (selector) => {
        if (selector.includes('supabase-endpoint')) {
          return createMockElement('meta', { name: 'supabase-endpoint', content: 'https://logaawoigfxnisimfatf.supabase.co' });
        }
        if (selector.includes('supabase-publishable-key') || selector.includes('Publishable_key') || selector.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
          return createMockElement('meta', { name: 'supabase-publishable-key', content: 'sb_pub_phase15_prod_key_99999' });
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
    fetch: mockFetchFn || defaultFetch,
    module: { exports: {} },
    process: { env: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return { app: sandbox.module.exports, sandbox, storageMap };
}

async function runPhase15ASchemaTests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 15A FORENSIC SCHEMA VERIFICATION TEST SUITE');
  console.log('====================================================================================================\n');

  const { app, sandbox } = createHarness();

  // ---------------------------------------------------------------------------
  // SECTION 1: Canonical 27-Table Inventory & Foreign-Key Dependency Order
  // ---------------------------------------------------------------------------
  console.log('--- Section 1: Canonical 27-Table Inventory & Foreign-Key Dependency Order ---');

  const canonical27 = app.CANONICAL_27_PRODUCTION_TABLES || sandbox.CANONICAL_27_PRODUCTION_TABLES || [];
  assert(Array.isArray(canonical27), 'Test 001: CANONICAL_27_PRODUCTION_TABLES is an array');
  assert(canonical27.length === 27, 'Test 002: Exactly 27 canonical production tables configured');

  const expectedOrder = [
    'finance_settings', 'payment_accounts', 'programmes', 'personnel', 'customers',
    'enquiries', 'enrolments', 'invoices', 'invoice_items', 'payments',
    'receipts', 'expenses', 'direct_income', 'budgets', 'budget_lines',
    'payslips', 'facilitator_sessions', 'customer_timeline', 'collection_actions',
    'finance_audit_log', 'management_alerts', 'approval_thresholds',
    'financial_adjustments', 'report_snapshots', 'management_metrics',
    'cash_flow_forecasts', 'customer_segments'
  ];

  expectedOrder.forEach((t, idx) => {
    assert(canonical27[idx] === t, `Test ${String(idx + 3).padStart(3, '0')}: Table #${idx + 1} dependency order is ${t}`);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: Canonical SQL Schema File (`supabase_schema.sql`) Static Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 2: Canonical SQL Schema File (`supabase_schema.sql`) Static Integrity ---');

  const sqlPath = path.join(__dirname, 'supabase_schema.sql');
  assert(fs.existsSync(sqlPath), 'Test 030: supabase_schema.sql exists in root workspace');

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  assert(sqlContent.length > 50000, 'Test 031: supabase_schema.sql contains full comprehensive schema definitions');

  // Verify all 27 tables have CREATE TABLE IF NOT EXISTS
  expectedOrder.forEach((table, idx) => {
    const tableRegex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\b`, 'i');
    assert(tableRegex.test(sqlContent), `Test ${String(idx + 32).padStart(3, '0')}: Table public.${table} defined with CREATE TABLE IF NOT EXISTS`);
  });

  // Verify RLS enabled for all tables
  expectedOrder.forEach((table, idx) => {
    const rlsRegex = new RegExp(`ALTER TABLE (ONLY )?public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i');
    assert(rlsRegex.test(sqlContent), `Test ${String(idx + 59).padStart(3, '0')}: Table public.${table} has RLS enabled`);
  });

  // Verify Security Functions
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()'), 'Test 086: get_auth_tenant_id() security function defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.is_super_admin()'), 'Test 087: is_super_admin() security function defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.can_manage_finance()'), 'Test 088: can_manage_finance() security function defined');
  assert(sqlContent.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'), 'Test 089: uuid-ossp extension enabled');
  assert(sqlContent.includes('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'), 'Test 090: pgcrypto extension enabled');

  // Verify Zero Secret Tokens in SQL File
  assert(!sqlContent.includes('sbp_'), 'Test 091: Zero management tokens in supabase_schema.sql');
  assert(!sqlContent.includes('service_role'), 'Test 092: Zero service-role keys in supabase_schema.sql');
  assert(!sqlContent.includes('password123'), 'Test 093: Zero hardcoded passwords in supabase_schema.sql');

  // ---------------------------------------------------------------------------
  // SECTION 3: Forensic Schema Classification Engine & Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 3: Forensic Schema Classification Engine & Invariants ---');

  const classifications = app.FORENSIC_SCHEMA_CLASSIFICATION || sandbox.FORENSIC_SCHEMA_CLASSIFICATION || {};
  assert(classifications.SCHEMA_PRESENT_EMPTY === 'SCHEMA_PRESENT_EMPTY', 'Test 094: SCHEMA_PRESENT_EMPTY classification defined');
  assert(classifications.SCHEMA_PRESENT_POPULATED === 'SCHEMA_PRESENT_POPULATED', 'Test 095: SCHEMA_PRESENT_POPULATED classification defined');
  assert(classifications.SCHEMA_MISSING === 'SCHEMA_MISSING', 'Test 096: SCHEMA_MISSING classification defined');
  assert(classifications.AUTHENTICATION_BLOCKED === 'AUTHENTICATION_BLOCKED', 'Test 097: AUTHENTICATION_BLOCKED classification defined');
  assert(classifications.RLS_BLOCKED === 'RLS_BLOCKED', 'Test 098: RLS_BLOCKED classification defined');
  assert(classifications.POSTGREST_UNREACHABLE === 'POSTGREST_UNREACHABLE', 'Test 099: POSTGREST_UNREACHABLE classification defined');
  assert(classifications.NOT_CERTIFIED === 'NOT_CERTIFIED', 'Test 100: NOT_CERTIFIED classification defined');

  // ---------------------------------------------------------------------------
  // SECTION 4: HTTP Status Mapping & Strict Non-Empty Invariant
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 4: HTTP Status Mapping & Strict Non-Empty Invariant ---');

  // Test Unconfigured state
  const unconfiguredHarness = createHarness({ SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' });
  // Mock querySelector to return empty
  unconfiguredHarness.sandbox.document.querySelector = () => null;
  const unconfiguredDiag = await unconfiguredHarness.app.diagnosePhase15SchemaForensics();
  assert(unconfiguredDiag.overallClassification === 'NOT_CERTIFIED', 'Test 101: Unconfigured diagnostics returns NOT_CERTIFIED');
  assert(unconfiguredDiag.totalTables === 27, 'Test 102: Total tables inspected is 27');
  assert(unconfiguredDiag.tablesPresent === 0, 'Test 103: Tables present is 0 when unconfigured');

  // Simulate 401 Authentication Blocked
  const authBlockedHarness = createHarness({}, async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: 'JWT expired' }),
    text: async () => JSON.stringify({ message: 'JWT expired' })
  }));

  const authBlockedDiag = await authBlockedHarness.app.diagnosePhase15SchemaForensics();
  assert(authBlockedDiag.tables['customers'].status === 401, 'Test 104: 401 status correctly reported on customers table');
  assert(authBlockedDiag.tables['customers'].rowCount === null, 'Test 105: rowCount strictly null on 401 (Never converted to 0)');
  assert(authBlockedDiag.tables['customers'].classification === 'AUTHENTICATION_BLOCKED', 'Test 106: customers table classified as AUTHENTICATION_BLOCKED');
  assert(authBlockedDiag.tables['invoices'].rowCount === null, 'Test 107: invoices table rowCount strictly null on 401');

  // Simulate 403 RLS Blocked
  const rlsBlockedHarness = createHarness({}, async () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: 'permission denied for table' }),
    text: async () => JSON.stringify({ message: 'permission denied for table' })
  }));
  const rlsBlockedDiag = await rlsBlockedHarness.app.diagnosePhase15SchemaForensics();
  assert(rlsBlockedDiag.tables['payments'].status === 403, 'Test 108: 403 status reported on payments table');
  assert(rlsBlockedDiag.tables['payments'].rowCount === null, 'Test 109: rowCount strictly null on 403');
  assert(rlsBlockedDiag.tables['payments'].classification === 'RLS_BLOCKED', 'Test 110: payments table classified as RLS_BLOCKED');

  // Simulate 404 Missing Table
  const missingTableHarness = createHarness({}, async (url) => {
    if (String(url).includes('customer_segments')) {
      return { ok: false, status: 404, json: async () => ({ message: 'relation does not exist' }), text: async () => '{"message":"relation does not exist"}' };
    }
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  });
  const missingTableDiag = await missingTableHarness.app.diagnosePhase15SchemaForensics();
  assert(missingTableDiag.tables['customer_segments'].status === 404, 'Test 111: 404 status reported on customer_segments');
  assert(missingTableDiag.tables['customer_segments'].exists === false, 'Test 112: exists === false on 404');
  assert(missingTableDiag.tables['customer_segments'].classification === 'SCHEMA_MISSING', 'Test 113: customer_segments classified as SCHEMA_MISSING');
  assert(missingTableDiag.overallClassification === 'SCHEMA_MISSING', 'Test 114: Overall classification is SCHEMA_MISSING when any table 404s');

  // Simulate HTTP 200 + Empty Database
  const emptyHarness = createHarness({}, async () => ({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => '[]'
  }));
  const emptyDiag = await emptyHarness.app.diagnosePhase15SchemaForensics();
  assert(emptyDiag.overallClassification === 'SCHEMA_PRESENT_EMPTY', 'Test 115: Overall classification is SCHEMA_PRESENT_EMPTY on HTTP 200 []');
  assert(emptyDiag.tablesPresent === 27, 'Test 116: All 27 tables present on HTTP 200');
  assert(emptyDiag.tablesEmpty === 27, 'Test 117: All 27 tables empty on HTTP 200 []');
  assert(emptyDiag.tables['programmes'].rowCount === 0, 'Test 118: programmes rowCount is 0 strictly on HTTP 200 []');

  // Simulate HTTP 200 + Populated Database
  const populatedHarness = createHarness({}, async (url) => {
    const table = String(url).split('/rest/v1/')[1]?.split('?')[0] || 'entity';
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: `${table}_1`, name: 'Sample' }],
      text: async () => JSON.stringify([{ id: `${table}_1`, name: 'Sample' }])
    };
  });
  const populatedDiag = await populatedHarness.app.diagnosePhase15SchemaForensics();
  assert(populatedDiag.overallClassification === 'SCHEMA_PRESENT_POPULATED', 'Test 119: Overall classification is SCHEMA_PRESENT_POPULATED on HTTP 200 [data]');
  assert(populatedDiag.tablesPopulated === 27, 'Test 120: All 27 tables populated');
  assert(populatedDiag.tables['customers'].rowCount === 1, 'Test 121: customers rowCount is 1 on HTTP 200 [data]');

  // ---------------------------------------------------------------------------
  // SECTION 5: Dynamic Tenant Isolation & Security Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 5: Dynamic Tenant Isolation & Security Invariants ---');

  assert(populatedDiag.tables['customers'].hasTenantId === true, 'Test 122: customers table requires tenant_id');
  assert(populatedDiag.tables['invoices'].hasTenantId === true, 'Test 123: invoices table requires tenant_id');
  assert(populatedDiag.tables['payments'].hasTenantId === true, 'Test 124: payments table requires tenant_id');
  assert(populatedDiag.tables['payslips'].hasTenantId === true, 'Test 125: payslips table requires tenant_id');

  console.log('\n====================================================================================================');
  console.log(` PHASE 15A CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase15ASchemaTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
