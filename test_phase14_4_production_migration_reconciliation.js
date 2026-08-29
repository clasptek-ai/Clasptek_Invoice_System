/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.4 Master Automated Test Suite:
 * Production Legacy Data Migration, Reconciliation & PostgreSQL Authority Activation
 * 
 * 60+ Assertions covering all Phase 14.4 Certification Requirements
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

async function runPhase14_4Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 14.4: PRODUCTION MIGRATION, RECONCILIATION & AUTHORITY ACTIVATION');
  console.log('========================================================================================\n');

  const pubKey = 'sb_publishable_prod_key_9876543210';
  const customTenantUuid = 'e8b23c91-4d1a-4e2b-98f1-c3091df882a1';
  const userJwt = generateMockJwt({ sub: 'usr_admin', role: 'authenticated', tenant_id: customTenantUuid });

  const { app, sandbox, storageMap } = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: pubKey
    }
  });

  app.state.auth = {
    isAuthenticated: true,
    supabaseJwt: userJwt,
    supabaseUser: { id: 'usr_admin', role: 'SUPER_ADMIN', tenant_id: customTenantUuid }
  };

  // ---------------------------------------------------------------------------
  // Category 1: Schema & Inventory Definitions (27 Entities)
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Schema & 27 Production Entities Inventory ---');

  assert(Array.isArray(app.REQUIRED_PRODUCTION_TABLES) && app.REQUIRED_PRODUCTION_TABLES.length >= 27, 'Test 01: REQUIRED_PRODUCTION_TABLES contains 27+ production tables');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('finance_settings'), 'Test 02: Tables include finance_settings');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payment_accounts'), 'Test 03: Tables include payment_accounts');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('programmes'), 'Test 04: Tables include programmes');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('invoices'), 'Test 05: Tables include invoices');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('invoice_items'), 'Test 06: Tables include invoice_items');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payments'), 'Test 07: Tables include payments');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payslips'), 'Test 08: Tables include payslips');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('customer_segments'), 'Test 09: Tables include customer_segments');

  // ---------------------------------------------------------------------------
  // Category 2: Tenant ID & Field Transformations
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Tenant ID Resolution & Field Transformations ---');

  const resolvedTenant = app.resolveAuthoritativeTenantId();
  assert(resolvedTenant === customTenantUuid, 'Test 10: Dynamic tenant resolution returns authenticated user tenant UUID');

  const sampleProg = { id: 'prog_1', code: 'TECH-101', name: 'Software Engineering', tuitionFee: 250000, maxDiscountPct: 15 };
  const transformedProg = app.transformEntityForPostgres('programmes', sampleProg, customTenantUuid);
  assert(transformedProg.tenant_id === customTenantUuid, 'Test 11: Transformation attaches tenant_id');
  assert(transformedProg.tuition_fee === 250000, 'Test 12: Transformation maps tuitionFee to tuition_fee');
  assert(transformedProg.max_discount_pct === 15, 'Test 13: Transformation maps maxDiscountPct to max_discount_pct');
  assert(transformedProg.id === 'prog_1', 'Test 14: Preserves exact primary key prog_1');

  const sampleInv = { id: 'inv_101', invoiceNo: 'INV-2026-001', customerId: 'cust_1', subTotal: 200000, taxAmount: 15000, total: 215000, balance: 115000 };
  const transformedInv = app.transformEntityForPostgres('invoices', sampleInv, customTenantUuid);
  assert(transformedInv.invoice_no === 'INV-2026-001', 'Test 15: Transformation maps invoiceNo to invoice_no');
  assert(transformedInv.customer_id === 'cust_1', 'Test 16: Transformation maps customerId to customer_id');
  assert(transformedInv.subtotal === 200000, 'Test 17: Transformation maps subTotal to subtotal');
  assert(transformedInv.tax_amount === 15000, 'Test 18: Transformation maps taxAmount to tax_amount');

  // ---------------------------------------------------------------------------
  // Category 3: Legacy Local Data Seeding & Inventory
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Legacy Local Data Seeding & Inventory ---');

  const sampleCust = { id: 'cust_1', name: 'Abubakar Dantata', email: 'dantata@example.com', phone: '08099887766', balance: 115000 };
  const samplePay = { id: 'pay_1', paymentNo: 'PAY-1001', receiptNo: 'REC-1001', invoiceId: 'inv_101', customerId: 'cust_1', amount: 100000, paymentMethod: 'Bank Transfer' };
  const samplePers = { id: 'pers_1', name: 'Dr. Chinedu Eze', role: 'Lead Facilitator', basicPay: 300000 };
  const samplePsl = { id: 'psl_1', payslipNo: 'PSL-5001', personnelId: 'pers_1', grossPay: 300000, totalDeductions: 30000, netPay: 270000, status: 'issued' };
  const sampleExp = { id: 'exp_1', expenseNo: 'EXP-9001', amount: 45000, category: 'Utilities', status: 'approved' };
  const sampleAcc = { id: 'acc_1', name: 'Main Operating Bank', balance: 2500000, currency: 'NGN' };

  app.state.customers = [sampleCust];
  app.state.programmes = [sampleProg];
  app.state.invoices = [sampleInv];
  app.state.payments = [samplePay];
  app.state.personnel = [samplePers];
  app.state.payslips = [samplePsl];
  app.state.expenses = [sampleExp];
  app.state.paymentAccounts = [sampleAcc];

  const localInv = await app.inspectLegacyLocalData();
  assert(localInv.hasLegacyData === true, 'Test 19: inspectLegacyLocalData flags hasLegacyData === true');
  assert(localInv.totalRecords >= 8, `Test 20: Total legacy records counted >= 8 (got ${localInv.totalRecords})`);
  assert(localInv.counts.customers === 1, 'Test 21: Customer count matches 1');
  assert(localInv.counts.invoices === 1, 'Test 22: Invoice count matches 1');
  assert(localInv.counts.payments === 1, 'Test 23: Payment count matches 1');
  assert(localInv.financialSummary.totalInvoiced === 215000, 'Test 24: Financial summary totalInvoiced is ₦215,000');
  assert(localInv.financialSummary.totalCollected === 100000, 'Test 25: Financial summary totalCollected is ₦100,000');
  assert(localInv.financialSummary.totalExpenses === 45000, 'Test 26: Financial summary totalExpenses is ₦45,000');
  assert(localInv.financialSummary.totalGrossPayroll === 300000, 'Test 27: Financial summary totalGrossPayroll is ₦300,000');
  assert(localInv.financialSummary.totalNetPayroll === 270000, 'Test 28: Financial summary totalNetPayroll is ₦270,000');

  // ---------------------------------------------------------------------------
  // Category 4: Production Database Inventory (Empty State)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Production Database Inventory (Empty State) ---');

  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ([]) });

  const remoteInv = await app.inspectProductionDatabase();
  assert(remoteInv.connected === true, 'Test 29: Database inventory confirms connected === true');
  assert(remoteInv.isEmpty === true, 'Test 30: Database inventory confirms isEmpty === true');
  assert(remoteInv.databaseEmpty === true, 'Test 31: Database inventory confirms databaseEmpty === true');
  assert(remoteInv.totalRecords === 0, 'Test 32: Total remote records confirms 0');
  assert(remoteInv.tablesFound.length >= 27, 'Test 33: All 27+ production tables queried successfully');

  // ---------------------------------------------------------------------------
  // Category 5: Dry-Run Mode Simulation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Dry-Run Mode Simulation ---');

  let writeAttempted = false;
  sandbox.fetch = async (url, opts) => {
    if (opts && (opts.method === 'POST' || opts.method === 'PATCH' || opts.method === 'DELETE')) {
      writeAttempted = true;
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  const dryRunRes = await app.migrateLegacyDataToPostgres({ dryRun: true });
  assert(dryRunRes.dryRun === true, 'Test 34: Dry run returns dryRun === true');
  assert(dryRunRes.readyToExecute === true, 'Test 35: Dry run flags readyToExecute === true');
  assert(writeAttempted === false, 'Test 36: ZERO database write requests made during dry run');
  assert(dryRunRes.totalDetected >= 8, 'Test 37: Dry run correctly reports detected records');

  // ---------------------------------------------------------------------------
  // Category 6: Non-Destructive, Dependency-Ordered Migration Execution
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Non-Destructive, Dependency-Ordered Migration Execution ---');

  const insertedOrder = [];
  const dbStore = {};

  sandbox.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const parsedUrl = new URL(url);
    const table = parsedUrl.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      const rows = dbStore[table] || [];
      return { ok: true, status: 200, json: async () => rows };
    } else if (method === 'POST') {
      insertedOrder.push(table);
      const body = JSON.parse(opts.body || '[]');
      const items = Array.isArray(body) ? body : [body];
      dbStore[table] = (dbStore[table] || []).concat(items);
      return { ok: true, status: 200, json: async () => items };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  const migRes = await app.migrateLegacyDataToPostgres();
  assert(migRes.success === true, 'Test 38: migrateLegacyDataToPostgres reports success === true');
  assert(migRes.stats.failed === 0, 'Test 39: Migration failed count is 0');
  assert(migRes.stats.migrated >= 8, `Test 40: Migrated ${migRes.stats.migrated} records`);

  // Foreign key hierarchy verification
  const progIdx = insertedOrder.indexOf('programmes');
  const custIdx = insertedOrder.indexOf('customers');
  const invIdx = insertedOrder.indexOf('invoices');
  const payIdx = insertedOrder.indexOf('payments');
  const persIdx = insertedOrder.indexOf('personnel');
  const pslIdx = insertedOrder.indexOf('payslips');

  assert(custIdx < invIdx, 'Test 41: Customers inserted before Invoices');
  assert(invIdx < payIdx, 'Test 42: Invoices inserted before Payments');
  assert(persIdx < pslIdx, 'Test 43: Personnel inserted before Payslips');

  // ---------------------------------------------------------------------------
  // Category 7: Double-Run Idempotency Guarantee (Zero Duplicate Records)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Double-Run Idempotency Guarantee ---');

  const preSecondRunCounts = { ...app.inspectLegacyLocalData().counts };
  const migSecondRun = await app.migrateLegacyDataToPostgres();
  assert(migSecondRun.success === true, 'Test 44: Second migration run succeeds');
  assert(migSecondRun.stats.failed === 0, 'Test 45: Second run has 0 failures');
  assert(migSecondRun.stats.alreadyExisting >= 8, 'Test 46: Second run detects existing records as alreadyExisting');

  // ---------------------------------------------------------------------------
  // Category 8: Record-by-Record & 100% Financial Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 8: Record-by-Record & 100% Financial Reconciliation ---');

  const recon = await app.reconcileProductionData();
  assert(recon.isReconciled === true, 'Test 47: reconcileProductionData reports isReconciled === true');
  assert(recon.reconciliationPercentage === 100, 'Test 48: Reconciliation percentage is 100%');
  assert(recon.referentialIntegrity.valid === true, 'Test 49: Referential integrity is valid');
  assert(recon.referentialIntegrity.criticalOrphans === 0, 'Test 50: Zero critical orphans');
  assert(recon.financialIntegrity.valid === true, 'Test 51: Financial integrity equations valid');

  const finRecon = await app.reconcileFinancialLedger();
  assert(finRecon.isBalanced === true, 'Test 52: Financial control ledger is balanced');
  assert(finRecon.status === 'BALANCED', 'Test 53: Financial control ledger status is BALANCED');

  // ---------------------------------------------------------------------------
  // Category 9: 14-Gate PostgreSQL Authority Activation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 9: 14-Gate PostgreSQL Authority Activation ---');

  const authActRes = await app.activatePostgresAuthoritativeMode();
  assert(authActRes.success === true, 'Test 54: activatePostgresAuthoritativeMode returns success === true');
  assert(authActRes.authorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 55: Authority state transitions to AUTHORITATIVE');
  assert(authActRes.gates.migrationCompleted === true, 'Test 56: Gate 9 (migrationCompleted) is PASS');
  assert(authActRes.gates.reconciliation100Percent === true, 'Test 57: Gate 11 (reconciliation100Percent) is PASS');
  assert(authActRes.gates.financialArithmeticVerified === true, 'Test 58: Gate 13 (financialArithmeticVerified) is PASS');

  // ---------------------------------------------------------------------------
  // Category 10: Zero-Data-Loss & Local Recovery Preservation Invariant
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 10: Zero-Data-Loss & Local Recovery Preservation Invariant ---');

  assert(Array.isArray(app.state.invoices) && app.state.invoices.length === 1, 'Test 59: In-memory invoices array intact');
  assert(Array.isArray(app.state.customers) && app.state.customers.length === 1, 'Test 60: In-memory customers array intact');
  assert(Array.isArray(app.state.payments) && app.state.payments.length === 1, 'Test 61: In-memory payments array intact');
  assert(Array.isArray(app.state.payslips) && app.state.payslips.length === 1, 'Test 62: In-memory payslips array intact');

  console.log('\n========================================================================================');
  console.log(` PHASE 14.4 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_4Tests().catch(err => {
  console.error('Unhandled error in Phase 14.4 test suite:', err);
  process.exit(1);
});
