/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM — PHASE 15 CERTIFICATION SUITE
 * Production Cutover, Continuous Reconciliation, Financial Controls & Disaster Recovery
 *
 * 100+ Automated Assertions Across 7 Production Control Categories:
 * Category 1: Continuous Data Reconciliation Engine (runProductionReconciliation)
 * Category 2: Financial Control Ledger Equations (reconcileFinancialLedger)
 * Category 3: Transaction Failure & Recovery Queue (enqueueFailedTransaction & retryFailedTransaction)
 * Category 4: Bank Balance Reconciliation (performBankReconciliation)
 * Category 5: Month-End Financial Closing Lifecycle (createMonthEndClosure & advanceMonthEndClosing)
 * Category 6: Production Security Audit Engine (runProductionSecurityAudit)
 * Category 7: 15-Point Production Deployment Gate Engine (verifyProductionGate)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Headless Environment Setup
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
};

global.window = {
  location: { href: 'https://app.clasptek.org/clasptek_invoice_system.html', search: '' },
  print: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

const mockElement = {
  innerHTML: '',
  textContent: '',
  style: {},
  value: '',
  type: '',
  appendChild: () => {},
  removeChild: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  querySelector: () => mockElement,
  querySelectorAll: () => []
};

global.document = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [],
  createElement: () => mockElement,
  body: mockElement
};
global.alert = () => {};
global.confirm = () => true;

if (!global.crypto) {
  global.crypto = {
    subtle: {
      digest: async (algo, data) => {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.from(data));
        return hash.digest();
      }
    },
    getRandomValues: (arr) => crypto.randomFillSync(arr)
  };
}

// 2. Load Clasptek Core Script
const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);

if (!scriptMatch) {
  console.error('FATAL: Could not locate <script> tag in clasptek_invoice_system.html');
  process.exit(1);
}

let mockFetchHandler = null;
global.fetch = async (url, opts) => {
  if (mockFetchHandler) {
    return await mockFetchHandler(url, opts);
  }
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ([]),
    text: async () => '[]'
  };
};

eval(scriptMatch[1]);
const app = module.exports;

// 3. Test Harness Utilities
let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✔ PASS [Test ${total}]: ${message}`);
  } else {
    failed++;
    console.error(`  ✖ FAIL [Test ${total}]: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 15: PRODUCTION CUTOVER, RECONCILIATION & FINANCIAL CONTROLS');
  console.log('========================================================================================\n');

  // Setup mock database and user state
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'u_superadmin', name: 'Super Admin', email: 'admin@clasptek.com', role: 'Super Admin', status: 'active' }
  };
  app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  app.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_testing_purposes_only';
  app.state.supabase.status = 'connected';
  app.state.supabase.persistenceMode = 'AUTHORITATIVE';

  // Seed baseline business data
  const cust1 = { id: 'c1', name: 'Student 1', balance: 150000, totalInvoiced: 250000, totalPaid: 100000 };
  const cust2 = { id: 'c2', name: 'Student 2', balance: 50000, totalInvoiced: 150000, totalPaid: 100000 };
  const inv1 = { id: 'i1', invoiceNo: 'INV-001', customerId: 'c1', clientName: 'Student 1', total: 250000, balance: 150000, status: 'partial' };
  const inv2 = { id: 'i2', invoiceNo: 'INV-002', customerId: 'c2', clientName: 'Student 2', total: 150000, balance: 50000, status: 'partial' };
  const pay1 = { id: 'p1', receiptNo: 'REC-001', invoiceId: 'i1', customerId: 'c1', amount: 100000, date: '2026-08-10' };
  const pay2 = { id: 'p2', receiptNo: 'REC-002', invoiceId: 'i2', customerId: 'c2', amount: 100000, date: '2026-08-15' };
  const dirInc1 = { id: 'di1', description: 'Consulting Fee', amount: 50000, date: '2026-08-20' };
  const exp1 = { id: 'e1', description: 'Staff Salaries', categoryGroup: 'Staff & People', category: 'Staff Salaries', amount: 120000, date: '2026-08-25' };
  const exp2 = { id: 'e2', description: 'Internet Connectivity', categoryGroup: 'Operations', category: 'Internet', amount: 30000, date: '2026-08-25' };
  const pers1 = { id: 'emp1', name: 'Staff John', role: 'Instructor', basicPay: 150000 };
  const psl1 = { id: 'ps1', payslipNo: 'PSL-001', personnelId: 'emp1', grossPay: 150000, totalDeductions: 30000, netPay: 120000, status: 'paid', period: '2026-08' };
  const prog1 = { id: 'prog1', name: 'Software Engineering', fee: 250000 };
  const enq1 = { id: 'enq1', customerId: 'c1', programmeId: 'prog1', status: 'ENROLLED' };
  const enrl1 = { id: 'enrl1', customerId: 'c1', programmeId: 'prog1', status: 'active' };

  app.state.customers = [cust1, cust2];
  app.state.invoices = [inv1, inv2];
  app.state.payments = [pay1, pay2];
  app.state.directIncome = [dirInc1];
  app.state.expenses = [exp1, exp2];
  app.state.personnel = [pers1];
  app.state.payslips = [psl1];
  app.state.programmes = [prog1];
  app.state.enquiries = [enq1];
  app.state.enrolments = [enrl1];
  app.state.sessions = [];
  app.state.customerTimeline = [];

  // Mock PostgREST responses to match local state
  mockFetchHandler = async (url, opts) => {
    const method = opts && opts.method ? opts.method : 'GET';
    const parsedUrl = new URL(url);
    const table = parsedUrl.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      if (table === 'customers') return { ok: true, status: 200, json: async () => app.state.customers };
      if (table === 'invoices') return { ok: true, status: 200, json: async () => app.state.invoices };
      if (table === 'payments') return { ok: true, status: 200, json: async () => app.state.payments };
      if (table === 'expenses') return { ok: true, status: 200, json: async () => app.state.expenses };
      if (table === 'direct_income') return { ok: true, status: 200, json: async () => app.state.directIncome };
      if (table === 'personnel') return { ok: true, status: 200, json: async () => app.state.personnel };
      if (table === 'payslips') return { ok: true, status: 200, json: async () => app.state.payslips };
      if (table === 'programmes') return { ok: true, status: 200, json: async () => app.state.programmes };
      if (table === 'enquiries') return { ok: true, status: 200, json: async () => app.state.enquiries };
      if (table === 'enrolments') return { ok: true, status: 200, json: async () => app.state.enrolments };
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: true, status: 201, json: async () => [] };
  };

  // ---------------------------------------------------------------------------
  // Category 1: Continuous Data Reconciliation Engine
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Continuous Data Reconciliation Engine (runProductionReconciliation) ---');
  
  const reconRun = await app.runProductionReconciliation();
  assert(reconRun.runId.startsWith('recon_'), `Generated valid run ID: ${reconRun.runId}`);
  assert(Boolean(reconRun.timestamp), 'Reconciliation run records ISO timestamp');
  assert(reconRun.isReconciled === true, 'Reconciliation confirms zero data discrepancies');
  assert(reconRun.status === 'SUCCESS', 'Run status accurately flagged as SUCCESS');
  assert(reconRun.totalEntitiesChecked >= 13, `Checked ${reconRun.totalEntitiesChecked} entity tables`);
  assert(reconRun.discrepancyCount === 0, 'Zero relational discrepancies detected');
  assert(reconRun.details.referentialIntegrity.valid === true, 'Referential integrity check passed');
  assert(reconRun.details.financialIntegrity.valid === true, 'Financial integrity equations check passed');

  // Verify state metrics update
  assert(app.state.reconciliationMetrics.matchRate === 100, 'Reconciliation match rate is 100%');
  assert(app.state.reconciliationMetrics.openExceptions === 0, 'Zero open exceptions recorded in metrics');
  assert(Boolean(app.state.reconciliationMetrics.lastRunAt), 'lastRunAt metric timestamp recorded');
  assert(app.state.reconciliationHistory.length >= 1, 'Reconciliation run history registry updated');
  assert(app.state.reconciliationHistory[0].status === 'SUCCESS', 'History stores run status SUCCESS');

  // ---------------------------------------------------------------------------
  // Category 2: Financial Control Ledger Equations
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Financial Control Ledger Equations (reconcileFinancialLedger) ---');

  const finRecon = await app.reconcileFinancialLedger();
  assert(finRecon.isBalanced === true, 'reconcileFinancialLedger reports isBalanced === true');
  assert(finRecon.status === 'BALANCED', 'Financial control status is BALANCED');
  assert(finRecon.checks.length >= 4, `Evaluated ${finRecon.checks.length} ledger balance equations`);

  // Equation 1: Accounts Receivable Equality (Σ Invoice Outstanding Balances === Customer Receivables)
  const arCheck = finRecon.checks.find(c => c.checkType === 'AR_EQUALITY');
  assert(Boolean(arCheck), 'AR Equality check is defined');
  assert(arCheck.status === 'BALANCED', 'AR Equality check is BALANCED');
  assert(arCheck.expectedValue === 200000, `Expected total AR is ₦200,000 (actual: ${arCheck.expectedValue})`);
  assert(arCheck.actualValue === 200000, `Actual customer receivables sum is ₦200,000 (actual: ${arCheck.actualValue})`);
  assert(arCheck.variance === 0, 'AR variance is exactly ₦0');
  assert(arCheck.severity === 'NONE', 'AR variance severity is NONE');

  // Equation 2: Revenue Equality (Σ Confirmed Payments + Direct Income === Reported Revenue)
  const revCheck = finRecon.checks.find(c => c.checkType === 'REVENUE_EQUALITY');
  assert(Boolean(revCheck), 'Revenue Equality check is defined');
  assert(revCheck.status === 'BALANCED', 'Revenue Equality check is BALANCED');
  assert(revCheck.actualValue === 250000, `Revenue composition equals ₦250,000 (actual: ${revCheck.actualValue})`);
  assert(revCheck.variance === 0, 'Revenue variance is exactly ₦0');

  // Equation 3: General Ledger Expense Integrity (Σ Posted Expenses === GL Expense Total)
  const expCheck = finRecon.checks.find(c => c.checkType === 'EXPENSE_EQUALITY');
  assert(Boolean(expCheck), 'Expense Equality check is defined');
  assert(expCheck.status === 'BALANCED', 'Expense Equality check is BALANCED');
  assert(expCheck.actualValue === 150000, `Expense composition equals ₦150,000 (actual: ${expCheck.actualValue})`);
  assert(expCheck.variance === 0, 'Expense variance is exactly ₦0');

  // Equation 4: Payroll Ledger Reconciliation (Σ Paid Payslips === Staff & People Expenses)
  const payCheck = finRecon.checks.find(c => c.checkType === 'PAYROLL_EQUALITY');
  assert(Boolean(payCheck), 'Payroll Equality check is defined');
  assert(payCheck.status === 'BALANCED', 'Payroll Equality check is BALANCED');
  assert(payCheck.expectedValue === 120000, `Paid payslips net pay sum is ₦120,000 (actual: ${payCheck.expectedValue})`);
  assert(payCheck.actualValue === 120000, `Staff expenses sum is ₦120,000 (actual: ${payCheck.actualValue})`);
  assert(payCheck.variance === 0, 'Payroll expense variance is exactly ₦0');

  // Verify registry persistence
  assert(app.state.financialControlChecks.length >= 1, 'financialControlChecks registry updated');
  assert(app.state.financialControlChecks[0].status === 'BALANCED', 'Registry stores status BALANCED');

  // Test variance detection
  app.state.customers[0].balance = 999999; // Introduce deliberate imbalance
  const finImbalance = await app.reconcileFinancialLedger();
  assert(finImbalance.isBalanced === false, 'Imbalance successfully detected');
  assert(finImbalance.status === 'CRITICAL' || finImbalance.status === 'MATERIAL_VARIANCE', `Status downgraded: ${finImbalance.status}`);
  assert(finImbalance.checks.find(c => c.checkType === 'AR_EQUALITY').status === 'VARIANCE_DETECTED', 'AR check flags VARIANCE_DETECTED');
  app.state.customers[0].balance = 150000; // Restore balance

  // ---------------------------------------------------------------------------
  // Category 3: Transaction Failure & Recovery Queue
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Transaction Failure & Recovery Queue (enqueue & retry) ---');

  assert(app.RECOVERY_QUEUE_STATUS.PENDING === 'PENDING', 'RECOVERY_QUEUE_STATUS defines PENDING');
  assert(app.RECOVERY_QUEUE_STATUS.RETRYING === 'RETRYING', 'RECOVERY_QUEUE_STATUS defines RETRYING');
  assert(app.RECOVERY_QUEUE_STATUS.RESOLVED === 'RESOLVED', 'RECOVERY_QUEUE_STATUS defines RESOLVED');
  assert(app.RECOVERY_QUEUE_STATUS.REQUIRES_REVIEW === 'REQUIRES_REVIEW', 'RECOVERY_QUEUE_STATUS defines REQUIRES_REVIEW');

  // Test Enqueue
  const failedOp = 'PAYMENT_CASCADE';
  const failedPayload = { invoiceId: 'i1', amount: 50000, paymentMethod: 'Bank Transfer' };
  const failedErr = new Error('503 Service Unavailable: Database write lock timeout');
  const enqRecord = await app.enqueueFailedTransaction('PAYMENT', failedOp, failedPayload, failedErr, 'idemp_test_001');

  assert(enqRecord.id.startsWith('txq_'), `Enqueued recovery record: ${enqRecord.id}`);
  assert(enqRecord.idempotency_key === 'idemp_test_001', 'Idempotency key preserved in queue');
  assert(enqRecord.status === 'PENDING', 'Initial queue status is PENDING');
  assert(enqRecord.failure_reason.includes('503 Service Unavailable'), 'Failure reason captured accurately');
  assert(enqRecord.retry_count === 0, 'Initial retry count is 0');
  assert(enqRecord.actor_name === 'Super Admin', 'Actor accurately recorded');
  assert(app.state.recoveryQueue.some(q => q.id === enqRecord.id), 'Record saved in state.recoveryQueue');

  // Test Idempotent Retry: Mark key as already completed
  app.state.idempotencyKeys = [{ key: 'idemp_test_001', status: 'COMPLETED', completed_at: new Date().toISOString() }];
  const retryRes = await app.retryFailedTransaction(enqRecord.id);
  assert(retryRes.success === true, 'Retry reports success');
  assert(retryRes.alreadyExecuted === true, 'CRITICAL: Idempotency check prevents duplicate execution');
  assert(retryRes.item.status === 'RESOLVED', 'Status resolved via idempotency');
  assert(retryRes.item.resolution_notes.includes('Idempotency prevented duplicate execution'), 'Resolution notes reflect idempotency safety');

  // ---------------------------------------------------------------------------
  // Category 4: Bank Balance Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Bank Balance Reconciliation (performBankReconciliation) ---');

  // August: Payments (200,000) + Direct Income (50,000) - Expenses (150,000) = Book Balance: 100,000
  // Uncleared Inflows: 20,000, Uncleared Outflows: 10,000
  // Adjusted Book Balance = 100,000 - 20,000 + 10,000 = 90,000
  // Bank Statement Balance = 90,000 -> Difference: 0
  const bankReconClean = app.performBankReconciliation('2026-08', 90000, 20000, 10000, 'Finance Manager');
  assert(bankReconClean.periodKey === '2026-08', 'Reconciled period key is 2026-08');
  assert(bankReconClean.bookBalance === 100000, `Calculated Book Balance is ₦100,000 (actual: ${bankReconClean.bookBalance})`);
  assert(bankReconClean.unclearedInflows === 20000, 'Uncleared Inflows recorded as ₦20,000');
  assert(bankReconClean.unclearedOutflows === 10000, 'Uncleared Outflows recorded as ₦10,000');
  assert(bankReconClean.adjustedBookBalance === 90000, `Adjusted Book Balance formula computed ₦90,000 (actual: ${bankReconClean.adjustedBookBalance})`);
  assert(bankReconClean.statementBalance === 90000, 'Statement Balance matches ₦90,000');
  assert(bankReconClean.difference === 0, 'Reconciliation difference is exactly ₦0');
  assert(bankReconClean.status === 'RECONCILED', 'Status is RECONCILED');
  assert(bankReconClean.isReconciled === true, 'isReconciled is true');
  assert(bankReconClean.authorizedBy === 'Finance Manager', 'Authorizer recorded');
  assert(app.state.bankReconciliations.length >= 1, 'bankReconciliations registry updated');

  // Test Bank Reconciliation Exception
  const bankReconException = app.performBankReconciliation('2026-08', 30000, 20000, 10000);
  assert(bankReconException.isReconciled === false, 'Difference creates reconciliation exception');
  assert(bankReconException.status === 'EXCEPTION', `Material difference flagged: ${bankReconException.status}`);
  assert(bankReconException.difference === 60000, `Difference calculated accurately: ₦${bankReconException.difference}`);

  // ---------------------------------------------------------------------------
  // Category 5: Month-End Financial Closing Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Month-End Financial Closing Lifecycle (create & advance) ---');

  assert(app.MONTH_END_STATUS.OPEN === 'OPEN', 'MONTH_END_STATUS defines OPEN');
  assert(app.MONTH_END_STATUS.PRE_CLOSE_REVIEW === 'PRE_CLOSE_REVIEW', 'MONTH_END_STATUS defines PRE_CLOSE_REVIEW');
  assert(app.MONTH_END_STATUS.RECONCILING === 'RECONCILING', 'MONTH_END_STATUS defines RECONCILING');
  assert(app.MONTH_END_STATUS.EXCEPTIONS_REVIEW === 'EXCEPTIONS_REVIEW', 'MONTH_END_STATUS defines EXCEPTIONS_REVIEW');
  assert(app.MONTH_END_STATUS.MANAGER_APPROVAL === 'MANAGER_APPROVAL', 'MONTH_END_STATUS defines MANAGER_APPROVAL');
  assert(app.MONTH_END_STATUS.CLOSED === 'CLOSED', 'MONTH_END_STATUS defines CLOSED');

  // Initialize month-end closure
  const closure = await app.createMonthEndClosure('2026-08');
  assert(closure.id.startsWith('close_2026-08_'), `Created closure record: ${closure.id}`);
  assert(closure.period_key === '2026-08', 'Period key is 2026-08');
  assert(closure.status === 'OPEN', 'Initial status is OPEN');

  // Advance through 6 stages
  const st1 = await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.PRE_CLOSE_REVIEW);
  assert(st1.status === 'PRE_CLOSE_REVIEW', 'Advanced Stage 1 -> PRE_CLOSE_REVIEW');

  const st2 = await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.RECONCILING);
  assert(st2.status === 'RECONCILING', 'Advanced Stage 2 -> RECONCILING');

  const st3 = await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.EXCEPTIONS_REVIEW);
  assert(st3.status === 'EXCEPTIONS_REVIEW', 'Advanced Stage 3 -> EXCEPTIONS_REVIEW');

  const st4 = await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.MANAGER_APPROVAL);
  assert(st4.status === 'MANAGER_APPROVAL', 'Advanced Stage 4 -> MANAGER_APPROVAL');

  const st5 = await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.CLOSED);
  assert(st5.status === 'CLOSED', 'Advanced Stage 5 -> CLOSED');
  assert(Boolean(st5.closed_by), 'Records closed_by authorizer');
  assert(Boolean(st5.closed_at), 'Records closed_at timestamp');

  // Check period locking side effect
  const lockedFp = (app.state.financePeriods || []).find(p => p.period === '2026-08');
  assert(Boolean(lockedFp), 'Finance period record exists for 2026-08');
  assert(lockedFp.isLocked === true, 'CRITICAL: Month-end close locks finance period');
  assert(lockedFp.status === 'locked', 'Finance period status is locked');

  // Test illegal transition
  let transitionError = null;
  try {
    await app.advanceMonthEndClosing(closure.id, app.MONTH_END_STATUS.OPEN);
  } catch (e) {
    transitionError = e;
  }
  assert(Boolean(transitionError), 'Engine strictly rejects invalid closing transitions');

  // ---------------------------------------------------------------------------
  // Category 6: Production Security Audit Engine
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Production Security Audit Engine (runProductionSecurityAudit) ---');

  const secAudit = app.runProductionSecurityAudit();
  assert(secAudit.status === 'PASS', 'Security audit status reports PASS');
  assert(secAudit.score === 100, 'Security audit score is 100/100');
  assert(secAudit.checks.length >= 5, `Evaluated ${secAudit.checks.length} operational security checks`);

  // Check 1: RLS
  const rlsChk = secAudit.checks.find(c => c.category === 'RLS');
  assert(rlsChk && rlsChk.passed === true, 'RLS Enforcement verified active (Zero Anon policies)');

  // Check 2: Service Role Scanner
  const secrChk = secAudit.checks.find(c => c.category === 'SECRETS');
  assert(secrChk && secrChk.passed === true, 'Service role browser key shield active');

  // Check 3: Tenant Boundary
  const tenChk = secAudit.checks.find(c => c.category === 'MULTI_TENANT');
  assert(tenChk && tenChk.passed === true, 'Tenant boundary isolation verified');

  // Check 4: Audit Immutability
  const audChk = secAudit.checks.find(c => c.category === 'AUDIT');
  assert(audChk && audChk.passed === true, 'Audit log immutability trigger verified');

  // Check 5: Secret Sanitization
  const privChk = secAudit.checks.find(c => c.category === 'DATA_PRIVACY');
  assert(privChk && privChk.passed === true, 'Secret redaction filter active');

  // ---------------------------------------------------------------------------
  // Category 7: 15-Point Production Deployment Gate Engine
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: 15-Point Production Deployment Gate Engine (verifyProductionGate) ---');

  const gateResult = await app.verifyProductionGate();
  assert(gateResult.totalGates === 15, 'Evaluates exactly 15 production operational gates');
  assert(gateResult.passCount === 15, 'All 15 production gates passed successfully');
  assert(gateResult.certified === true, 'Production deployment status is CERTIFIED');
  assert(Boolean(gateResult.evaluatedAt), 'Gate evaluation records timestamp');

  // Verify all 15 gates individually
  const expectedGateNames = [
    'PostgreSQL Connection',
    'Authentication & Session',
    'Tenant Boundary Isolation',
    'Row-Level Security (RLS)',
    'Schema Compatibility',
    'Data Count Reconciliation',
    'Financial Control Reconciliation',
    'Payment Cascade Atomicity',
    'Idempotency & Replay Protection',
    'Audit Log Immutability',
    'Closed Period Locking',
    'Secret Exposure Scanner',
    'Backup Readiness',
    'Disaster Recovery Procedure',
    'Regression Test Verification'
  ];

  expectedGateNames.forEach((expectedName, idx) => {
    const g = gateResult.gates.find(item => item.id === idx + 1);
    assert(Boolean(g), `Gate ${idx + 1} (${expectedName}) exists`);
    assert(g.passed === true, `Gate ${idx + 1} (${expectedName}) passed (Detail: ${g.detail})`);
  });

  // Verify state persistence
  assert(app.state.productionGateStatus.certified === true, 'state.productionGateStatus reflects CERTIFIED');

  console.log('\n========================================================================================');
  console.log(` PHASE 15 CERTIFICATION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL ${total} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
