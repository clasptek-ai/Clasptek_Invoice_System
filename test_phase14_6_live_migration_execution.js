/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.6 Master Suite: Controlled Live Production Migration Execution & Authority Certification
 * 
 * Comprehensive 80+ assertion test suite covering Phases A through J:
 * - Phase A: Live Pre-flight Engine
 * - Phase B: Production Database & Legacy Local Inventory
 * - Phase C: Zero-Write Dry-Run Simulation
 * - Phase D: Live Non-Destructive 27-Entity Batch Migration
 * - Phase E: Complete Read-Back Verification
 * - Phase F: Record-Level & Referential Integrity Reconciliation
 * - Phase G: Financial Ledger Reconciliation (₦0.00 Variance)
 * - Phase H: Second-Run Idempotency Certification
 * - Phase I: 14-Gate PostgreSQL Authority Certification
 * - Phase J: Post-Activation Operational Persistence Verification
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
  const sig = Buffer.from('mock_signature_hash').toString('base64url');
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
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_phase14_6_prod_key_12345',
        ...customEnv
      }
    },
    document: {
      getElementById: (id) => createMockElement('div', { id }),
      querySelector: (selector) => {
        if (selector.includes('supabase-endpoint')) {
          return createMockElement('meta', { name: 'supabase-endpoint', content: 'https://logaawoigfxnisimfatf.supabase.co' });
        }
        if (selector.includes('supabase-publishable-key') || selector.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
          return createMockElement('meta', { name: 'supabase-publishable-key', content: 'sb_pub_phase14_6_prod_key_12345' });
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

async function runPhase14_6Tests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK PHASE 14.6: CONTROLLED LIVE PRODUCTION MIGRATION EXECUTION & CERTIFICATION');
  console.log('====================================================================================================\n');

  const tenantUuid = 'e8b23c91-4d1a-4e2b-98f1-c3091df882a1';
  const userJwt = generateMockJwt({
    sub: 'usr_sa_1',
    email: 'admin@clasptek.org',
    role: 'SUPER_ADMIN',
    tenant_id: tenantUuid,
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 7200
  });

  const { app, sandbox, storageMap } = createHarness();

  // Seed authentic authenticated session in app state
  app.state.auth = {
    isAuthenticated: true,
    supabaseJwt: userJwt,
    tokenExpiresAt: Date.now() + 7200000,
    user: {
      id: 'usr_sa_1',
      email: 'admin@clasptek.org',
      role: 'SUPER_ADMIN',
      tenant_id: tenantUuid
    },
    supabaseUser: {
      id: 'usr_sa_1',
      email: 'admin@clasptek.org',
      role: 'SUPER_ADMIN',
      tenant_id: tenantUuid
    }
  };

  // Mock PostgreSQL Storage
  const postgreSqlDatabase = {};
  const insertSequence = [];

  sandbox.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const parsedUrl = new URL(url);
    const table = parsedUrl.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      const rows = postgreSqlDatabase[table] || [];
      return { ok: true, status: 200, json: async () => rows };
    } else if (method === 'POST') {
      insertSequence.push(table);
      const body = JSON.parse(opts.body || '[]');
      const items = Array.isArray(body) ? body : [body];
      postgreSqlDatabase[table] = (postgreSqlDatabase[table] || []).concat(items);
      return { ok: true, status: 200, json: async () => items };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };

  // ---------------------------------------------------------------------------
  // PHASE A: Live Pre-flight Diagnostic Engine
  // ---------------------------------------------------------------------------
  console.log('--- Phase A: Live Pre-flight Diagnostic Engine ---');

  const preflight = await app.runProductionMigrationPreflight();
  assert(typeof preflight === 'object', 'Test 001: Preflight returns structured diagnostic report');
  assert(preflight.eligible === true, 'Test 002: Preflight verifies eligibility === true');
  assert(preflight.failures.length === 0, 'Test 003: Preflight reports zero blocking failures');
  assert(preflight.projectRef === 'logaawoigfxnisimfatf', 'Test 004: Preflight confirms canonical project reference');
  assert(preflight.role === 'SUPER_ADMIN', 'Test 005: Preflight authorizes SUPER_ADMIN role');
  assert(preflight.databaseAuthority !== app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 006: Preflight verifies authority is pre-authoritative');

  // ---------------------------------------------------------------------------
  // PHASE B: Production Database & Legacy Local Inventory
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase B: Production Database & Legacy Local Inventory ---');

  // Seed authentic business data in local legacy storage
  const prog1 = { id: 'prog_p14_6', name: 'Executive Masterclass in Data Analytics', tuitionFee: 650000, maxDiscountPct: 15, durationWeeks: 12 };
  const cust1 = { id: 'cust_p14_6_1', name: 'Dr. Fatima Umar', email: 'fatima.umar@clasptek.org', phone: '+2348011223344', balance: 250000 };
  const enq1 = { id: 'enq_p14_6_1', enquiryNo: 'ENQ-2026-801', customerId: 'cust_p14_6_1', programmeId: 'prog_p14_6', status: 'INVOICE GENERATED' };
  const enrl1 = { id: 'enrl_p14_6_1', enrolmentNo: 'ENRL-2026-801', customerId: 'cust_p14_6_1', programmeId: 'prog_p14_6', status: 'ACTIVE' };
  const inv1 = { id: 'inv_p14_6_1', invoiceNo: 'INV-2026-801', customerId: 'cust_p14_6_1', programmeId: 'prog_p14_6', subTotal: 600000, taxAmount: 50000, total: 650000, balance: 250000 };
  const invItem1 = { id: 'item_p14_6_1', invoiceId: 'inv_p14_6_1', description: 'Tuition Fee', unitPrice: 600000, totalPrice: 600000 };
  const pay1 = { id: 'pay_p14_6_1', paymentNo: 'PAY-2026-801', receiptNo: 'REC-2026-801', invoiceId: 'inv_p14_6_1', customerId: 'cust_p14_6_1', amount: 400000, paymentMethod: 'Bank Transfer' };
  const rec1 = { id: 'rec_p14_6_1', receiptNo: 'REC-2026-801', paymentId: 'pay_p14_6_1', invoiceId: 'inv_p14_6_1', amount: 400000 };
  const pers1 = { id: 'pers_p14_6_1', employeeId: 'EMP-0801', name: 'Engr. Haruna Bello', role: 'Faculty Lead', basicPay: 700000 };
  const psl1 = { id: 'psl_p14_6_1', payslipNo: 'PSL-2026-801', personnelId: 'pers_p14_6_1', grossPay: 700000, totalDeductions: 70000, netPay: 630000, status: 'issued' };
  const exp1 = { id: 'exp_p14_6_1', expenseNo: 'EXP-2026-801', description: 'Cloud Infrastructure License', amount: 120000, status: 'approved' };
  const dir1 = { id: 'dir_p14_6_1', description: 'Enterprise Data Architecture Advisory', amount: 350000 };
  const acc1 = { id: 'acc_p14_6_1', name: 'FirstBank Corporate Operations', balance: 8500000, currency: 'NGN' };

  app.state.programmes = [prog1];
  app.state.customers = [cust1];
  app.state.enquiries = [enq1];
  app.state.enrolments = [enrl1];
  app.state.invoices = [inv1];
  app.state.payments = [pay1];
  app.state.personnel = [pers1];
  app.state.payslips = [psl1];
  app.state.expenses = [exp1];
  app.state.directIncome = [dir1];
  app.state.paymentAccounts = [acc1];

  const dbInventoryBefore = await app.inspectProductionDatabase();
  assert(dbInventoryBefore.connected === true, 'Test 007: Remote database inventory connected === true');
  assert(dbInventoryBefore.totalRecords === 0, 'Test 008: Database confirmed empty before migration (0 records)');

  const localInventory = await app.inspectLegacyLocalData();
  assert(localInventory.hasLegacyData === true, 'Test 009: Local legacy inventory reports hasLegacyData === true');
  assert(localInventory.totalRecords >= 11, 'Test 010: Total legacy records >= 11');
  assert(localInventory.financialSummary.totalInvoiced === 650000, 'Test 011: Financial aggregate totalInvoiced = ₦650,000');
  assert(localInventory.financialSummary.totalCollected === 400000, 'Test 012: Financial aggregate totalCollected = ₦400,000');
  assert(localInventory.financialSummary.totalExpenses === 120000, 'Test 013: Financial aggregate totalExpenses = ₦120,000');
  assert(localInventory.financialSummary.totalDirectIncome === 350000, 'Test 014: Financial aggregate totalDirectIncome = ₦350,000');
  assert(localInventory.financialSummary.totalGrossPayroll === 700000, 'Test 015: Financial aggregate totalGrossPayroll = ₦700,000');
  assert(localInventory.financialSummary.totalNetPayroll === 630000, 'Test 016: Financial aggregate totalNetPayroll = ₦630,000');

  // ---------------------------------------------------------------------------
  // PHASE C: Zero-Write Dry-Run Simulation
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase C: Zero-Write Dry-Run Simulation ---');

  let dbWriteAttempted = false;
  const originalFetch = sandbox.fetch;
  sandbox.fetch = async (url, opts) => {
    if (opts && (opts.method === 'POST' || opts.method === 'PATCH' || opts.method === 'DELETE')) {
      dbWriteAttempted = true;
    }
    return originalFetch(url, opts);
  };

  const dryRun = await app.migrateLegacyDataToPostgres({ dryRun: true });
  assert(dryRun.dryRun === true, 'Test 017: Dry run returns dryRun === true');
  assert(dryRun.readyToExecute === true, 'Test 018: Dry run returns readyToExecute === true');
  assert(dbWriteAttempted === false, 'Test 019: ZERO database writes during dry-run');
  assert(dryRun.unmappableRecords === 0, 'Test 020: Zero unmappable records detected');
  assert(dryRun.potentialOrphans === 0, 'Test 021: Zero potential orphans detected');
  assert(app.state.customers.length === 1, 'Test 022: Local customers preserved during dry-run');

  sandbox.fetch = originalFetch;

  // ---------------------------------------------------------------------------
  // PHASE D: Live Non-Destructive 27-Entity Batch Migration
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase D: Live Non-Destructive Batch Migration ---');

  const migrationRes = await app.migrateLegacyDataToPostgres();
  assert(migrationRes.success === true, 'Test 023: Live migration reports success === true');
  assert(migrationRes.stats.failed === 0, 'Test 024: Zero failed records during migration');
  assert(migrationRes.stats.migrated >= 11, `Test 025: Migrated ${migrationRes.stats.migrated} records`);

  // Verify foreign-key hierarchy
  const pProgIdx = insertSequence.indexOf('programmes');
  const pCustIdx = insertSequence.indexOf('customers');
  const pEnqIdx = insertSequence.indexOf('enquiries');
  const pEnrlIdx = insertSequence.indexOf('enrolments');
  const pInvIdx = insertSequence.indexOf('invoices');
  const pPayIdx = insertSequence.indexOf('payments');
  const pPersIdx = insertSequence.indexOf('personnel');
  const pPslIdx = insertSequence.indexOf('payslips');

  assert(pCustIdx < pEnqIdx, 'Test 026: Customers migrated before Enquiries');
  assert(pCustIdx < pEnrlIdx, 'Test 027: Customers migrated before Enrolments');
  assert(pProgIdx < pEnrlIdx, 'Test 028: Programmes migrated before Enrolments');
  assert(pCustIdx < pInvIdx, 'Test 029: Customers migrated before Invoices');
  assert(pInvIdx < pPayIdx, 'Test 030: Invoices migrated before Payments');
  assert(pPersIdx < pPslIdx, 'Test 031: Personnel migrated before Payslips');

  // Verify ID preservation
  const migratedInvoices = postgreSqlDatabase['invoices'] || [];
  assert(migratedInvoices.length === 1, 'Test 032: Exactly 1 invoice in PostgreSQL');
  assert(migratedInvoices[0].id === 'inv_p14_6_1', 'Test 033: Invoice ID inv_p14_6_1 strictly preserved verbatim');
  assert(migratedInvoices[0].tenant_id === tenantUuid, 'Test 034: Dynamic tenant UUID attached to invoice');

  // ---------------------------------------------------------------------------
  // PHASE E: Complete PostgreSQL Read-Back Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase E: Complete PostgreSQL Read-Back Verification ---');

  const readBack = await app.readBackProductionMigration();
  assert(typeof readBack === 'object', 'Test 035: Read-back returns structured report');
  assert(readBack.is100Percent === true, 'Test 036: Read-back confirms 100% verification');
  assert(readBack.missingCount === 0, 'Test 037: Zero missing records on read-back');
  assert(readBack.fieldMismatchCount === 0, 'Test 038: Zero field-level mismatches');
  assert(readBack.verifiedCount >= 11, `Test 039: Verified count >= 11 (${readBack.verifiedCount})`);

  // ---------------------------------------------------------------------------
  // PHASE F: Record-Level & Referential Integrity Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase F: Record-Level & Referential Reconciliation ---');

  const recordRecon = await app.reconcileProductionData();
  assert(recordRecon.isReconciled === true, 'Test 040: Record reconciliation confirms isReconciled === true');
  assert(recordRecon.reconciliationPercentage === 100, 'Test 041: Reconciliation percentage is exactly 100%');
  assert(recordRecon.missingCount === 0, 'Test 042: Record reconciliation zero missing');
  assert(recordRecon.unexpectedCount === 0, 'Test 043: Record reconciliation zero unexpected');
  assert(recordRecon.criticalOrphanCount === 0, 'Test 044: Record reconciliation zero critical orphans');
  assert(recordRecon.referentialIntegrity.valid === true, 'Test 045: Referential integrity valid across all 14 relations');

  // ---------------------------------------------------------------------------
  // PHASE G: Financial Reconciliation (Variance = ₦0.00)
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase G: Financial Reconciliation (₦0.00 Variance) ---');

  const finRecon = await app.reconcileFinancialLedger();
  assert(finRecon.isBalanced === true, 'Test 046: Financial reconciliation confirms isBalanced === true');
  assert(finRecon.status === 'BALANCED', 'Test 047: Financial status is BALANCED');
  assert(finRecon.summary.totalDiscrepancy === 0, 'Test 048: Financial totalDiscrepancy = ₦0.00');
  assert(finRecon.equations.eq1InvoiceBalance.valid === true, 'Test 049: Equation 1 (Invoice - Payments = Balance) valid with ₦0.00 variance');
  assert(finRecon.equations.eq2PayrollBalance.valid === true, 'Test 050: Equation 2 (Gross - Deductions = Net) valid with ₦0.00 variance');
  assert(finRecon.equations.eq3RevenueRecognition.valid === true, 'Test 051: Equation 3 (Payments + Direct Income = Revenue) valid with ₦0.00 variance');
  assert(finRecon.equations.eq4ExpenseLedger.valid === true, 'Test 052: Equation 4 (Expenses posted = GL Expenses) valid with ₦0.00 variance');
  assert(finRecon.equations.eq5PayrollExpense.valid === true, 'Test 053: Equation 5 (Paid Payslips = Staff Payroll Expense) valid with ₦0.00 variance');

  // ---------------------------------------------------------------------------
  // PHASE H: Second-Run Idempotency Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase H: Second-Run Idempotency Certification ---');

  const secondRun = await app.migrateLegacyDataToPostgres();
  assert(secondRun.success === true, 'Test 054: Second migration run succeeds');
  assert(secondRun.stats.migrated === 0, 'Test 055: Exactly 0 new records inserted on second run');
  assert(secondRun.stats.alreadyExisting >= 11, 'Test 056: All existing records detected on second run');
  assert(secondRun.stats.failed === 0, 'Test 057: Zero failures on second run');

  const dbInventoryAfter = await app.inspectProductionDatabase();
  assert(dbInventoryAfter.totalRecords >= 11, 'Test 058: PostgreSQL record count confirmed >= 11 after migration');

  // ---------------------------------------------------------------------------
  // PHASE I: 14-Gate PostgreSQL Authority Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase I: 14-Gate PostgreSQL Authority Certification ---');

  const authActivation = await app.activatePostgresAuthoritativeMode();
  assert(authActivation.success === true, 'Test 059: Authority activation returns success === true');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 060: Authority state transitions to AUTHORITATIVE');
  assert(authActivation.gates.supabaseConfigured === true || authActivation.gates.supabaseConfigured === 'PASS', 'Test 061: Gate 1 (supabaseConfigured) PASS');
  assert(authActivation.gates.projectIdentityVerified === true || authActivation.gates.projectIdentityVerified === 'PASS', 'Test 062: Gate 2 (projectIdentityVerified) PASS');
  assert(authActivation.gates.authenticatedSessionValid === true || authActivation.gates.authenticatedSessionValid === 'PASS', 'Test 063: Gate 3 (authenticatedSessionValid) PASS');
  assert(authActivation.gates.postgreSqlReachable === true || authActivation.gates.postgreSqlReachable === 'PASS', 'Test 064: Gate 4 (postgreSqlReachable) PASS');
  assert(authActivation.gates.postgrestReachable === true || authActivation.gates.postgrestReachable === 'PASS', 'Test 065: Gate 5 (postgrestReachable) PASS');
  assert(authActivation.gates.requiredSchemaPresent === true || authActivation.gates.requiredSchemaPresent === 'PASS', 'Test 066: Gate 6 (requiredSchemaPresent) PASS');
  assert(authActivation.gates.rlsVerified === true || authActivation.gates.rlsVerified === 'PASS', 'Test 067: Gate 7 (rlsVerified) PASS');
  assert(authActivation.gates.legacyInventoryCompleted === true || authActivation.gates.legacyInventoryCompleted === 'PASS', 'Test 068: Gate 8 (legacyInventoryCompleted) PASS');
  assert(authActivation.gates.migrationCompleted === true || authActivation.gates.migrationCompleted === 'PASS', 'Test 069: Gate 9 (migrationCompleted) PASS');
  assert(authActivation.gates.readBackCompleted === true || authActivation.gates.readBackCompleted === 'PASS', 'Test 070: Gate 10 (readBackCompleted) PASS');
  assert(authActivation.gates.reconciliation100Percent === true || authActivation.gates.reconciliation100Percent === 'PASS', 'Test 071: Gate 11 (reconciliation100Percent) PASS');
  assert(authActivation.gates.noCriticalOrphans === true || authActivation.gates.noCriticalOrphans === 'PASS', 'Test 072: Gate 12 (noCriticalOrphans) PASS');
  assert(authActivation.gates.financialArithmeticVerified === true || authActivation.gates.financialArithmeticVerified === 'PASS', 'Test 073: Gate 13 (financialArithmeticVerified) PASS');
  assert(authActivation.gates.idempotencyAndSecurityPassed === true || authActivation.gates.idempotencyAndSecurityPassed === 'PASS', 'Test 074: Gate 14 (idempotencyAndSecurityPassed) PASS');

  // ---------------------------------------------------------------------------
  // PHASE J: Post-Activation Operational Persistence Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase J: Post-Activation Operational Persistence Verification ---');

  const client = app.getSupabaseClient();
  const activeQuery = await client.from('invoices').select('*');
  assert(activeQuery.ok === true, 'Test 075: Invoice query succeeds in authoritative mode');
  assert(Array.isArray(activeQuery.data) && activeQuery.data.length >= 1, 'Test 076: Query returns authoritative invoice record');
  assert(activeQuery.data[0].invoice_no === 'INV-2026-801', 'Test 077: Query returns correct invoice number INV-2026-801');
  assert(activeQuery.data[0].total_amount === 650000, 'Test 078: Query returns correct total_amount ₦650,000');

  // Verify non-destructive invariant: Local data untouched
  assert(app.state.customers.length === 1, 'Test 079: Local customers array preserved intact');
  assert(app.state.invoices.length === 1, 'Test 080: Local invoices array preserved intact');
  assert(app.state.payments.length === 1, 'Test 081: Local payments array preserved intact');
  assert(app.state.payslips.length === 1, 'Test 082: Local payslips array preserved intact');

  console.log('\n====================================================================================================');
  console.log(` PHASE 14.6 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_6Tests().catch(err => {
  console.error('Unhandled error in Phase 14.6 test suite:', err);
  process.exit(1);
});
