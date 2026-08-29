/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Test Suite 29: Phase 17 — Production Supabase Schema Deployment & Verified Migration Readiness
 * 
 * Validates canonical SQL schema inventory, 27 production tables, foreign keys, tenant isolation,
 * RLS policies, PostgREST route exposure, strict non-empty classifications, zero-destructive SQL,
 * non-secret exposure, project identity, and migration readiness gating.
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

function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_phase17').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function createHarness(customEnv = {}) {
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
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_phase17_prod_key_11111',
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
          return createMockElement('meta', { name: 'supabase-publishable-key', content: 'sb_pub_phase17_prod_key_11111' });
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
    fetch: async () => ({ ok: true, status: 200, json: async () => ([]), text: async () => '[]' }),
    module: { exports: {} },
    process: { env: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return { app: sandbox.module.exports, sandbox, storageMap };
}

async function runPhase17Tests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK PHASE 17: PRODUCTION SUPABASE SCHEMA DEPLOYMENT & VERIFIED MIGRATION READINESS');
  console.log('====================================================================================================\n');

  const { app, sandbox } = createHarness();

  // ---------------------------------------------------------------------------
  // SECTION 1: Canonical Schema Inventory Verification
  // ---------------------------------------------------------------------------
  console.log('--- Section 1: Canonical Schema Inventory Verification ---');

  const inventoryPath = path.join(__dirname, 'schema_inventory.json');
  assert(fs.existsSync(inventoryPath), 'Test 001: Machine-readable schema_inventory.json exists');

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  assert(inventory.targetProjectRef === 'logaawoigfxnisimfatf', 'Test 002: Inventory target matches logaawoigfxnisimfatf');
  assert(inventory.targetUrl === 'https://logaawoigfxnisimfatf.supabase.co', 'Test 003: Inventory target matches canonical URL');
  assert(inventory.summary.canonical27PresentInSql === 27, 'Test 004: Exactly 27/27 canonical tables present in schema');
  assert(inventory.summary.canonical27MissingInSql.length === 0, 'Test 005: Zero canonical tables missing in schema');
  assert(inventory.summary.totalRlsEnabled >= 27, 'Test 006: RLS enabled on all canonical tables');
  assert(inventory.summary.totalPoliciesDefined >= 50, 'Test 007: Comprehensive RLS policies defined (>= 50)');
  assert(inventory.summary.totalFunctionsDefined >= 10, 'Test 008: Helper functions defined in schema');
  assert(inventory.summary.totalIndexesDefined >= 27, 'Test 009: Performance & constraint indexes defined');

  // ---------------------------------------------------------------------------
  // SECTION 2: 27 Required Canonical Production Tables Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 2: 27 Required Canonical Production Tables ---');

  const canonicalTables = app.CANONICAL_27_PRODUCTION_TABLES;
  assert(Array.isArray(canonicalTables) && canonicalTables.length === 27, 'Test 010: CANONICAL_27_PRODUCTION_TABLES length is exactly 27');

  canonicalTables.forEach((tableName, idx) => {
    const tableDef = inventory.allTables[tableName];
    assert(tableDef !== undefined, `Test ${String(011 + idx).padStart(3, '0')}: Table ${tableName} exists in schema`);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: Primary Keys & Tenant Isolation Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 3: Primary Keys & Tenant Isolation ---');

  canonicalTables.forEach((tableName, idx) => {
    const tableDef = inventory.allTables[tableName];
    const hasPk = tableDef && tableDef.primaryKey !== null;
    assert(hasPk, `Test ${String(038 + idx).padStart(3, '0')}: Table ${tableName} has primary key defined`);
  });

  const tenantTables = canonicalTables.filter(t => t !== 'finance_settings' && t !== 'approval_thresholds');
  tenantTables.forEach((tableName, idx) => {
    const tableDef = inventory.allTables[tableName];
    const hasTenant = tableDef && tableDef.hasTenantId === true;
    assert(hasTenant, `Test ${String(065 + idx).padStart(3, '0')}: Table ${tableName} enforces tenant_id column`);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: Foreign Key Dependency Order Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 4: Foreign Key Dependency Order ---');

  assert(canonicalTables.indexOf('customers') < canonicalTables.indexOf('invoices'), 'Test 090: customers precedes invoices');
  assert(canonicalTables.indexOf('invoices') < canonicalTables.indexOf('invoice_items'), 'Test 091: invoices precedes invoice_items');
  assert(canonicalTables.indexOf('invoices') < canonicalTables.indexOf('payments'), 'Test 092: invoices precedes payments');
  assert(canonicalTables.indexOf('payments') < canonicalTables.indexOf('receipts'), 'Test 093: payments precedes receipts');
  assert(canonicalTables.indexOf('personnel') < canonicalTables.indexOf('payslips'), 'Test 094: personnel precedes payslips');
  assert(canonicalTables.indexOf('programmes') < canonicalTables.indexOf('enquiries'), 'Test 095: programmes precedes enquiries');
  assert(canonicalTables.indexOf('programmes') < canonicalTables.indexOf('enrolments'), 'Test 096: programmes precedes enrolments');
  assert(canonicalTables.indexOf('budgets') < canonicalTables.indexOf('budget_lines'), 'Test 097: budgets precedes budget_lines');

  // ---------------------------------------------------------------------------
  // SECTION 5: PostgREST Strict Non-Empty Invariants & Classifications
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 5: PostgREST Invariants & Classifications ---');

  assert(app.FORENSIC_SCHEMA_CLASSIFICATION.SCHEMA_MISSING === 'SCHEMA_MISSING', 'Test 098: Classification SCHEMA_MISSING defined');
  assert(app.FORENSIC_SCHEMA_CLASSIFICATION.SCHEMA_PRESENT_EMPTY === 'SCHEMA_PRESENT_EMPTY', 'Test 099: Classification SCHEMA_PRESENT_EMPTY defined');
  assert(app.FORENSIC_SCHEMA_CLASSIFICATION.SCHEMA_PRESENT_POPULATED === 'SCHEMA_PRESENT_POPULATED', 'Test 100: Classification SCHEMA_PRESENT_POPULATED defined');
  assert(app.FORENSIC_SCHEMA_CLASSIFICATION.AUTHENTICATION_BLOCKED === 'AUTHENTICATION_BLOCKED', 'Test 101: Classification AUTHENTICATION_BLOCKED defined');
  assert(app.FORENSIC_SCHEMA_CLASSIFICATION.RLS_BLOCKED === 'RLS_BLOCKED', 'Test 102: Classification RLS_BLOCKED defined');

  // Test PGRST205 mapping
  sandbox.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ code: 'PGRST205', message: "Could not find the table 'public.programmes' in the schema cache" })
  });
  const diagPgrst205 = await app.diagnosePhase15SchemaForensics();
  assert(diagPgrst205.tables['programmes'].classification === 'SCHEMA_MISSING', 'Test 103: PGRST205 maps to SCHEMA_MISSING');
  assert(diagPgrst205.tables['programmes'].rowCount === null, 'Test 104: PGRST205 rowCount is strictly null');

  // Test HTTP 200 [] mapping
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  const diagEmpty = await app.diagnosePhase15SchemaForensics();
  assert(diagEmpty.tables['programmes'].classification === 'SCHEMA_PRESENT_EMPTY', 'Test 105: HTTP 200 [] maps to SCHEMA_PRESENT_EMPTY');
  assert(diagEmpty.tables['programmes'].rowCount === 0, 'Test 106: HTTP 200 [] rowCount is strictly 0');

  // Test HTTP 401 mapping
  sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });
  const diag401 = await app.diagnosePhase15SchemaForensics();
  assert(diag401.tables['programmes'].classification === 'AUTHENTICATION_BLOCKED', 'Test 107: HTTP 401 maps to AUTHENTICATION_BLOCKED');
  assert(diag401.tables['programmes'].rowCount === null, 'Test 108: HTTP 401 rowCount is strictly null');

  // ---------------------------------------------------------------------------
  // SECTION 6: Zero-Destructive SQL & Security Scan
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 6: Zero-Destructive SQL & Security Scan ---');

  const sqlContent = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
  assert(!sqlContent.includes('DROP DATABASE'), 'Test 109: Schema contains zero DROP DATABASE statements');
  assert(!sqlContent.includes('DROP SCHEMA public CASCADE'), 'Test 110: Schema contains zero DROP SCHEMA public CASCADE statements');
  assert(!sqlContent.includes('TRUNCATE'), 'Test 111: Schema contains zero TRUNCATE statements');
  assert(!sqlContent.includes('DELETE FROM'), 'Test 112: Schema contains zero DELETE FROM statements');

  // Zero secrets
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, 'production_migration_evidence.json'), 'utf8'));
  assert(evidence.credentialsExposed === false, 'Test 113: Evidence confirms zero credentials exposed');
  assert(!JSON.stringify(evidence).includes('service_role'), 'Test 114: Zero service_role in evidence');
  assert(!JSON.stringify(evidence).includes('password'), 'Test 115: Zero passwords in evidence');
  assert(!JSON.stringify(evidence).includes('postgres://'), 'Test 116: Zero database connection URIs in evidence');

  // ---------------------------------------------------------------------------
  // SECTION 7: Authority Gating & Readiness Demarcation
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 7: Authority Gating & Readiness Demarcation ---');

  assert(evidence.authorityState === 'BLOCKED', 'Test 117: Authority state strictly BLOCKED in evidence');
  assert(evidence.projectRef === 'logaawoigfxnisimfatf', 'Test 118: Project reference strictly logaawoigfxnisimfatf');
  assert(evidence.supabaseUrl === 'https://logaawoigfxnisimfatf.supabase.co', 'Test 119: Supabase URL matches production target');
  assert(evidence.migrationExecuted === false, 'Test 120: Evidence confirms zero migration writes performed in Phase 17');

  console.log('\n====================================================================================================');
  console.log(` PHASE 17 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase17Tests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
