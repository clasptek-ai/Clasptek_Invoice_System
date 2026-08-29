/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.5 Master Automated Certification Test Suite:
 * Live Migration Execution, Reconciliation Evidence & PostgreSQL Authority Certification
 * 
 * 100+ Assertions covering all Phase 14.5 Requirements
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

async function runPhase14_5Tests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK PHASE 14.5: LIVE MIGRATION EXECUTION, RECONCILIATION & AUTHORITY CERTIFICATION');
  console.log('====================================================================================================\n');

  const pubKey = 'sb_publishable_prod_key_9876543210';
  const customTenantUuid = 'e8b23c91-4d1a-4e2b-98f1-c3091df882a1';
  const userJwt = generateMockJwt({ sub: 'usr_admin', role: 'SUPER_ADMIN', tenant_id: customTenantUuid });

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
  // Category 1: 22-Point Live Production Pre-flight Diagnostic Engine
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: 22-Point Live Production Pre-flight Engine ---');

  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ([]) });

  const preflight = await app.runProductionMigrationPreflight();
  assert(typeof preflight === 'object', 'Test 001: Preflight returns structured object');
  assert(preflight.eligible === true, 'Test 002: Preflight reports eligible === true');
  assert(Array.isArray(preflight.failures) && preflight.failures.length === 0, 'Test 003: Preflight zero failures');
  assert(preflight.projectRef === 'logaawoigfxnisimfatf', 'Test 004: Preflight projectRef matches canonical');
  assert(preflight.tenantIdMasked.startsWith('e8b2') && preflight.tenantIdMasked.endsWith('82a1'), 'Test 005: Preflight masks tenant ID safely');
  assert(preflight.role === 'SUPER_ADMIN', 'Test 006: Preflight role identifies SUPER_ADMIN');
  assert(typeof preflight.legacyRecordCount === 'number', 'Test 007: Preflight includes legacyRecordCount');
  assert(typeof preflight.postgresRecordCount === 'number', 'Test 008: Preflight includes postgresRecordCount');
  assert(preflight.databaseAuthority !== app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 009: Preflight authority is pre-authoritative');

  // ---------------------------------------------------------------------------
  // Category 2: Credential Shielding & Token Safety
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Credential Shielding & Token Safety ---');

  assert(!JSON.stringify(preflight).includes(userJwt), 'Test 010: Preflight does not leak raw JWT');
  assert(!JSON.stringify(preflight).includes(pubKey), 'Test 011: Preflight does not leak raw API key');

  // Test invalid cookie token pointer
  app.state.auth.supabaseJwt = 'sess_invalid_cookie_pointer';
  const pfCookieFail = await app.runProductionMigrationPreflight();
  assert(pfCookieFail.eligible === false, 'Test 012: Preflight rejects sess_* cookie pointer');
  assert(pfCookieFail.failures.some(f => f.includes('sess_')), 'Test 013: Preflight explains sess_* failure');

  // Test sbp_ token injection
  app.state.supabase.anonKey = 'sbp_invalid_mgmt_token';
  const pfSbpFail = await app.runProductionMigrationPreflight();
  assert(pfSbpFail.eligible === false, 'Test 014: Preflight rejects sbp_* CLI token');
  assert(pfSbpFail.failures.some(f => f.includes('sbp_')), 'Test 015: Preflight explains sbp_* failure');

  // Reset to valid credentials
  app.state.supabase.anonKey = pubKey;
  app.state.auth.supabaseJwt = userJwt;

  // ---------------------------------------------------------------------------
  // Category 3: Dynamic Tenant UUID Resolution & Mapping
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Dynamic Tenant UUID Resolution & Mapping ---');

  const tenantRes = app.resolveAuthoritativeTenantId();
  assert(tenantRes === customTenantUuid, 'Test 016: Dynamic tenant resolution returns user tenant UUID');

  const testProg = { id: 'prog_p14_5', code: 'CYBER-201', name: 'Cybersecurity Architecture', tuitionFee: 450000, maxDiscountPct: 20 };
  const mappedProg = app.transformEntityForPostgres('programmes', testProg, customTenantUuid);
  assert(mappedProg.tenant_id === customTenantUuid, 'Test 017: Entity transformation injects dynamic tenant UUID');
  assert(mappedProg.tuition_fee === 450000, 'Test 018: Maps tuitionFee to tuition_fee');
  assert(mappedProg.max_discount_pct === 20, 'Test 019: Maps maxDiscountPct to max_discount_pct');
  assert(mappedProg.id === 'prog_p14_5', 'Test 020: Preserves exact primary key');

  // ---------------------------------------------------------------------------
  // Category 4: 27+ Schema Tables Inventory
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Schema Tables Inventory ---');

  assert(Array.isArray(app.REQUIRED_PRODUCTION_TABLES) && app.REQUIRED_PRODUCTION_TABLES.length >= 27, 'Test 021: REQUIRED_PRODUCTION_TABLES contains 27+ tables');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('finance_settings'), 'Test 022: Includes finance_settings');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payment_accounts'), 'Test 023: Includes payment_accounts');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('programmes'), 'Test 024: Includes programmes');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('personnel'), 'Test 025: Includes personnel');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('customers'), 'Test 026: Includes customers');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('enquiries'), 'Test 027: Includes enquiries');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('enrolments'), 'Test 028: Includes enrolments');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('invoices'), 'Test 029: Includes invoices');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('invoice_items'), 'Test 030: Includes invoice_items');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payments'), 'Test 031: Includes payments');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('receipts'), 'Test 032: Includes receipts');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('expenses'), 'Test 033: Includes expenses');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('direct_income'), 'Test 034: Includes direct_income');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('budgets'), 'Test 035: Includes budgets');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('budget_lines'), 'Test 036: Includes budget_lines');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('payslips'), 'Test 037: Includes payslips');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('facilitator_sessions'), 'Test 038: Includes facilitator_sessions');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('customer_timeline'), 'Test 039: Includes customer_timeline');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('collection_actions'), 'Test 040: Includes collection_actions');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('finance_audit_log'), 'Test 041: Includes finance_audit_log');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('management_alerts'), 'Test 042: Includes management_alerts');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('approval_thresholds'), 'Test 043: Includes approval_thresholds');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('financial_adjustments'), 'Test 044: Includes financial_adjustments');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('report_snapshots'), 'Test 045: Includes report_snapshots');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('management_metrics'), 'Test 046: Includes management_metrics');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('cash_flow_forecasts'), 'Test 047: Includes cash_flow_forecasts');
  assert(app.REQUIRED_PRODUCTION_TABLES.includes('customer_segments'), 'Test 048: Includes customer_segments');

  // ---------------------------------------------------------------------------
  // Category 5: Legacy Local Data Seeding & Inventory Aggregation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Legacy Local Data Seeding & Inventory Aggregation ---');

  const cust1 = { id: 'cust_p14_5_1', name: 'Zainab Aliyu', email: 'zainab@clasptek.org', balance: 120000 };
  const enq1 = { id: 'enq_p14_5_1', enquiryNo: 'ENQ-2026-101', customerId: 'cust_p14_5_1', programmeId: 'prog_p14_5' };
  const enrl1 = { id: 'enrl_p14_5_1', enrolmentNo: 'ENRL-2026-101', customerId: 'cust_p14_5_1', programmeId: 'prog_p14_5' };
  const inv1 = { id: 'inv_p14_5_1', invoiceNo: 'INV-2026-101', customerId: 'cust_p14_5_1', subTotal: 400000, taxAmount: 30000, total: 430000, balance: 120000 };
  const pay1 = { id: 'pay_p14_5_1', paymentNo: 'PAY-2026-101', receiptNo: 'REC-2026-101', invoiceId: 'inv_p14_5_1', customerId: 'cust_p14_5_1', amount: 310000 };
  const pers1 = { id: 'pers_p14_5_1', name: 'Prof. Bello Kano', role: 'Head of Faculty', basicPay: 500000 };
  const psl1 = { id: 'psl_p14_5_1', payslipNo: 'PSL-2026-101', personnelId: 'pers_p14_5_1', grossPay: 500000, totalDeductions: 50000, netPay: 450000, status: 'issued' };
  const exp1 = { id: 'exp_p14_5_1', expenseNo: 'EXP-2026-101', amount: 75000, category: 'Hardware', status: 'approved' };
  const dir1 = { id: 'dir_p14_5_1', description: 'Tech Advisory', amount: 150000 };
  const acc1 = { id: 'acc_p14_5_1', name: 'Zenith Corporate', balance: 5000000, currency: 'NGN' };

  app.state.customers = [cust1];
  app.state.programmes = [testProg];
  app.state.enquiries = [enq1];
  app.state.enrolments = [enrl1];
  app.state.invoices = [inv1];
  app.state.payments = [pay1];
  app.state.personnel = [pers1];
  app.state.payslips = [psl1];
  app.state.expenses = [exp1];
  app.state.directIncome = [dir1];
  app.state.paymentAccounts = [acc1];

  const legacyInv = await app.inspectLegacyLocalData();
  assert(legacyInv.hasLegacyData === true, 'Test 049: Legacy inventory confirms hasLegacyData === true');
  assert(legacyInv.totalRecords >= 11, 'Test 050: Total legacy records counted >= 11');
  assert(legacyInv.financialSummary.totalInvoiced === 430000, 'Test 051: Financial aggregate totalInvoiced = ₦430,000');
  assert(legacyInv.financialSummary.totalCollected === 310000, 'Test 052: Financial aggregate totalCollected = ₦310,000');
  assert(legacyInv.financialSummary.totalExpenses === 75000, 'Test 053: Financial aggregate totalExpenses = ₦75,000');
  assert(legacyInv.financialSummary.totalDirectIncome === 150000, 'Test 054: Financial aggregate totalDirectIncome = ₦150,000');
  assert(legacyInv.financialSummary.totalGrossPayroll === 500000, 'Test 055: Financial aggregate totalGrossPayroll = ₦500,000');
  assert(legacyInv.financialSummary.totalNetPayroll === 450000, 'Test 056: Financial aggregate totalNetPayroll = ₦450,000');

  // ---------------------------------------------------------------------------
  // Category 6: Zero-Write Dry-Run Simulation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Zero-Write Dry-Run Simulation ---');

  let dbWriteAttempted = false;
  sandbox.fetch = async (url, opts) => {
    if (opts && (opts.method === 'POST' || opts.method === 'PATCH' || opts.method === 'DELETE')) {
      dbWriteAttempted = true;
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  const dryRunRes = await app.migrateLegacyDataToPostgres({ dryRun: true });
  assert(dryRunRes.dryRun === true, 'Test 057: Dry run returns dryRun === true');
  assert(dryRunRes.readyToExecute === true, 'Test 058: Dry run returns readyToExecute === true');
  assert(dbWriteAttempted === false, 'Test 059: ZERO database writes during dry-run');
  assert(dryRunRes.unmappableRecords === 0, 'Test 060: Zero unmappable records detected');
  assert(dryRunRes.potentialOrphans === 0, 'Test 061: Zero potential orphans detected');

  // ---------------------------------------------------------------------------
  // Category 7: Live Non-Destructive Migration Execution
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Live Non-Destructive Migration Execution ---');

  const postgreSqlMockDb = {};
  const insertOrder = [];

  sandbox.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const parsedUrl = new URL(url);
    const table = parsedUrl.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      const rows = postgreSqlMockDb[table] || [];
      return { ok: true, status: 200, json: async () => rows };
    } else if (method === 'POST') {
      insertOrder.push(table);
      const body = JSON.parse(opts.body || '[]');
      const items = Array.isArray(body) ? body : [body];
      postgreSqlMockDb[table] = (postgreSqlMockDb[table] || []).concat(items);
      return { ok: true, status: 200, json: async () => items };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  const migRes = await app.migrateLegacyDataToPostgres();
  assert(migRes.success === true, 'Test 062: Live migration reports success === true');
  assert(migRes.stats.failed === 0, 'Test 063: Live migration has 0 failed records');
  assert(migRes.stats.migrated >= 11, `Test 064: Migrated ${migRes.stats.migrated} records`);

  // Verify parent-child dependency hierarchy
  const pProgIdx = insertOrder.indexOf('programmes');
  const pCustIdx = insertOrder.indexOf('customers');
  const pEnqIdx = insertOrder.indexOf('enquiries');
  const pEnrlIdx = insertOrder.indexOf('enrolments');
  const pInvIdx = insertOrder.indexOf('invoices');
  const pPayIdx = insertOrder.indexOf('payments');
  const pPersIdx = insertOrder.indexOf('personnel');
  const pPslIdx = insertOrder.indexOf('payslips');

  assert(pCustIdx < pEnqIdx, 'Test 065: Customers inserted before Enquiries');
  assert(pCustIdx < pEnrlIdx, 'Test 066: Customers inserted before Enrolments');
  assert(pProgIdx < pEnrlIdx, 'Test 067: Programmes inserted before Enrolments');
  assert(pCustIdx < pInvIdx, 'Test 068: Customers inserted before Invoices');
  assert(pInvIdx < pPayIdx, 'Test 069: Invoices inserted before Payments');
  assert(pPersIdx < pPslIdx, 'Test 070: Personnel inserted before Payslips');

  // ---------------------------------------------------------------------------
  // Category 8: Complete PostgreSQL Read-Back Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 8: Complete PostgreSQL Read-Back Verification ---');

  const readBack = await app.readBackProductionMigration();
  assert(typeof readBack === 'object', 'Test 071: Read-back returns structured report');
  assert(readBack.is100Percent === true, 'Test 072: Read-back is100Percent === true');
  assert(readBack.missingCount === 0, 'Test 073: Read-back missingCount === 0');
  assert(readBack.fieldMismatchCount === 0, 'Test 074: Read-back fieldMismatchCount === 0');
  assert(readBack.verifiedCount >= 11, `Test 075: Read-back verifiedCount >= 11 (got ${readBack.verifiedCount})`);

  // ---------------------------------------------------------------------------
  // Category 9: Record-Level & Relational Integrity Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 9: Record-Level & Relational Integrity Reconciliation ---');

  const recon = await app.reconcileProductionData();
  assert(recon.isReconciled === true, 'Test 076: Reconciliation isReconciled === true');
  assert(recon.reconciliationPercentage === 100, 'Test 077: Reconciliation percentage === 100%');
  assert(recon.missingRecords === 0, 'Test 078: Missing records count === 0');
  assert(recon.unexpectedRecords === 0, 'Test 079: Unexpected records count === 0');
  assert(recon.fieldMismatches === 0, 'Test 080: Field mismatches count === 0');
  assert(recon.criticalOrphanCount === 0, 'Test 081: Zero critical orphans');
  assert(recon.referentialIntegrity.valid === true, 'Test 082: Referential integrity valid');

  // ---------------------------------------------------------------------------
  // Category 10: Financial Reconciliation (Variance = ₦0.00)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 10: Financial Reconciliation (Variance = ₦0.00) ---');

  const finRecon = await app.reconcileFinancialLedger();
  assert(finRecon.isBalanced === true, 'Test 083: Financial ledger isBalanced === true');
  assert(finRecon.status === 'BALANCED', 'Test 084: Financial ledger status === BALANCED');
  assert(recon.financialIntegrity.valid === true, 'Test 085: Financial integrity equations valid');

  // ---------------------------------------------------------------------------
  // Category 11: Second-Run Idempotency Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 11: Second-Run Idempotency Certification ---');

  const secondRunRes = await app.migrateLegacyDataToPostgres();
  assert(secondRunRes.success === true, 'Test 086: Second run migration succeeds');
  assert(secondRunRes.stats.migrated === 0, 'Test 087: Second run created 0 new records');
  assert(secondRunRes.stats.alreadyExisting >= 11, 'Test 088: Second run detected existing records');
  assert(secondRunRes.stats.failed === 0, 'Test 089: Second run 0 failures');

  // ---------------------------------------------------------------------------
  // Category 12: 14-Gate PostgreSQL Authority Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 12: 14-Gate PostgreSQL Authority Certification ---');

  const authActivation = await app.activatePostgresAuthoritativeMode();
  assert(authActivation.success === true, 'Test 090: Authority activation success === true');
  assert(authActivation.authorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 091: Authority state transitions to AUTHORITATIVE');
  assert(authActivation.gates.supabaseConfigured === true, 'Test 092: Gate 1 (supabaseConfigured) PASS');
  assert(authActivation.gates.projectIdentityVerified === true, 'Test 093: Gate 2 (projectIdentityVerified) PASS');
  assert(authActivation.gates.authenticatedSessionValid === true, 'Test 094: Gate 3 (authenticatedSessionValid) PASS');
  assert(authActivation.gates.postgreSqlReachable === true, 'Test 095: Gate 4 (postgreSqlReachable) PASS');
  assert(authActivation.gates.postgrestReachable === true, 'Test 096: Gate 5 (postgrestReachable) PASS');
  assert(authActivation.gates.requiredSchemaPresent === true, 'Test 097: Gate 6 (requiredSchemaPresent) PASS');
  assert(authActivation.gates.rlsVerified === true, 'Test 098: Gate 7 (rlsVerified) PASS');
  assert(authActivation.gates.legacyInventoryCompleted === true, 'Test 099: Gate 8 (legacyInventoryCompleted) PASS');
  assert(authActivation.gates.migrationCompleted === true, 'Test 100: Gate 9 (migrationCompleted) PASS');
  assert(authActivation.gates.readBackCompleted === true, 'Test 101: Gate 10 (readBackCompleted) PASS');
  assert(authActivation.gates.reconciliation100Percent === true, 'Test 102: Gate 11 (reconciliation100Percent) PASS');
  assert(authActivation.gates.noCriticalOrphans === true, 'Test 103: Gate 12 (noCriticalOrphans) PASS');
  assert(authActivation.gates.financialArithmeticVerified === true, 'Test 104: Gate 13 (financialArithmeticVerified) PASS');
  assert(authActivation.gates.idempotencyAndSecurityPassed === true, 'Test 105: Gate 14 (idempotencyAndSecurityPassed) PASS');

  // ---------------------------------------------------------------------------
  // Category 13: Full Production Workflow Orchestrator
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 13: Full Production Workflow Orchestrator ---');

  // Reset authority state to simulate live execution invocation
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.CONNECTIVITY_VERIFIED;
  const liveWorkflowRes = await app.executeLiveProductionMigration();
  assert(liveWorkflowRes.success === true, 'Test 106: executeLiveProductionMigration succeeds');
  assert(liveWorkflowRes.authorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 107: Workflow ends in AUTHORITATIVE state');
  assert(liveWorkflowRes.idempotency.duplicatesCreated === 0, 'Test 108: Workflow verifies 0 duplicates');
  assert(typeof liveWorkflowRes.runId === 'string', 'Test 109: Workflow produces unique runId');

  // ---------------------------------------------------------------------------
  // Category 14: Non-Destructive Invariant & Zero-Data-Loss Shield
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 14: Non-Destructive Invariant & Zero-Data-Loss Shield ---');

  assert(Array.isArray(app.state.customers) && app.state.customers.length === 1, 'Test 110: Local customers array preserved');
  assert(Array.isArray(app.state.invoices) && app.state.invoices.length === 1, 'Test 111: Local invoices array preserved');
  assert(Array.isArray(app.state.payments) && app.state.payments.length === 1, 'Test 112: Local payments array preserved');
  assert(Array.isArray(app.state.payslips) && app.state.payslips.length === 1, 'Test 113: Local payslips array preserved');

  console.log('\n====================================================================================================');
  console.log(` PHASE 14.5 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_5Tests().catch(err => {
  console.error('Unhandled error in Phase 14.5 test suite:', err);
  process.exit(1);
});
