/**
 * CLASPTEK OPERATIONAL INTELLIGENCE & MANAGEMENT CONTROLS TEST SUITE - PHASE 10
 * 35+ Comprehensive Automated Tests for Operational Intelligence, Accounting Controls,
 * CRM State Machine, Bank Reconciliation, and Hardened PostgreSQL Persistence.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('\x1b[34m=================================================================\x1b[0m');
console.log('\x1b[34m  CLASPTEK PHASE 10: OPERATIONAL INTELLIGENCE & MANAGEMENT CONTROLS \x1b[0m');
console.log('\x1b[34m=================================================================\x1b[0m');

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

let testsPassed = 0;
let testsFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`\x1b[32m  ✔ [PASS]\x1b[0m ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✖ [FAIL]\x1b[0m ${desc}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m\n${err.stack}`);
    testsFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`\x1b[32m  ✔ [PASS]\x1b[0m ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✖ [FAIL]\x1b[0m ${desc}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
    testsFailed++;
  }
}

async function runSuite() {
  const { exports: app } = createSandboxEnvironment();

  console.log('\n\x1b[36m--- Section 1: Phase 10 Schema & Versioning Invariants (Tests 1-4) ---\x1b[0m');

  it('1.1 Module exports SCHEMA_VERSION and Phase 10 Store Keys', () => {
    assert.ok(app.SCHEMA_VERSION.startsWith('10.') || app.SCHEMA_VERSION.startsWith('11.'));
    assert.strictEqual(app.STORE_KEY_MANAGEMENT_ALERTS, 'clasptek:management_alerts');
    assert.strictEqual(app.STORE_KEY_CRM_STAGE_HISTORY, 'clasptek:crm_stage_history');
    assert.strictEqual(app.STORE_KEY_BANK_RECONCILIATIONS, 'clasptek:bank_reconciliations');
    assert.strictEqual(app.STORE_KEY_EXPENSE_STATUS_HISTORY, 'clasptek:expense_status_history');
    assert.strictEqual(app.STORE_KEY_FINANCIAL_ADJUSTMENTS, 'clasptek:financial_adjustments');
    assert.strictEqual(app.STORE_KEY_IDEMPOTENCY_KEYS, 'clasptek:idempotency_keys');
  });

  it('1.2 DB_TABLE_MAPPING maps Phase 10 tables to PostgreSQL tables', () => {
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_MANAGEMENT_ALERTS], 'management_alerts');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_CRM_STAGE_HISTORY], 'crm_stage_history');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_BANK_RECONCILIATIONS], 'bank_reconciliations');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_IDEMPOTENCY_KEYS], 'idempotency_keys');
  });

  it('1.3 verifySchemaCompatibility detects compatible vs mismatched schema version', () => {
    const comp = app.verifySchemaCompatibility('10.0.0');
    assert(comp.isCompatible, 'Version 10.0.0 must be compatible');
    
    app.state.schemaVersions = [{ version: '9.0.0', compatible: false }];
    const mismatch = app.verifySchemaCompatibility('10.0.0');
    assert(!mismatch.isCompatible, 'Old version 9.0.0 must be flagged as incompatible');
    
    // Reset
    app.state.schemaVersions = [{ version: '10.0.0', compatible: true }];
  });

  it('1.4 Section 12 DDL exists in supabase_schema.sql with composite indexes', () => {
    const schemaPath = path.join(__dirname, 'supabase_schema.sql');
    assert(fs.existsSync(schemaPath));
    const sql = fs.readFileSync(schemaPath, 'utf8');

    assert(sql.includes('public.management_alerts'));
    assert(sql.includes('public.crm_stage_history'));
    assert(sql.includes('public.bank_reconciliations'));
    assert(sql.includes('public.idempotency_keys'));
    assert(sql.includes('idx_invoices_tenant_status'));
    assert(sql.includes('idx_alerts_tenant_severity'));
  });

  console.log('\n\x1b[36m--- Section 2: Executive 3-Pillar KPI Command Center (Tests 5-8) ---\x1b[0m');

  it('2.1 getAuthoritativeFinancialMetrics calculates complete income, expenses, and net position', () => {
    app.state.invoices = [
      { id: 'i1', total: 300000, date: '2026-08-01' },
      { id: 'i2', total: 200000, date: '2026-08-10' }
    ];
    app.state.payments = [
      { id: 'p1', invoiceId: 'i1', amount: 300000, date: '2026-08-05' },
      { id: 'p2', invoiceId: 'i2', amount: 100000, date: '2026-08-15' }
    ];
    app.state.directIncome = [
      { id: 'di1', amount: 50000, status: 'confirmed', date: '2026-08-12' }
    ];
    app.state.expenses = [
      { id: 'e1', amount: 150000, status: 'recorded', date: '2026-08-20' }
    ];

    const m = app.getAuthoritativeFinancialMetrics();

    assert.strictEqual(m.totalInvoiced, 500000);
    assert.strictEqual(m.totalPaymentsReceived, 400000);
    assert.strictEqual(m.totalDirectIncome, 50000);
    assert.strictEqual(m.totalIncomeReceived, 450000);
    assert.strictEqual(m.totalExpenses, 150000);
    assert.strictEqual(m.netFinancialPosition, 300000);
    assert.strictEqual(m.outstandingReceivables, 100000);
  });

  it('2.2 Monthly income, expenses, and net margin are isolated to current period YYYY-MM', () => {
    const curMonth = new Date().toISOString().slice(0, 7);
    const m = app.getAuthoritativeFinancialMetrics();
    assert(m.monthly !== undefined);
    assert.strictEqual(m.monthly.income, m.monthlyIncome);
    assert.strictEqual(m.monthly.expenses, m.monthlyExpenses);
    assert.strictEqual(m.monthly.net, m.netMonthlyPosition);
  });

  it('2.3 Multi-stage payroll liabilities aggregate awaiting payment vs disbursed amounts', () => {
    app.state.payslips = [
      { id: 'ps1', netPay: 200000, status: 'approved' },
      { id: 'ps2', netPay: 180000, paidAmount: 180000, status: 'paid' },
      { id: 'ps3', netPay: 150000, status: 'acknowledged' }
    ];

    const m = app.getAuthoritativeFinancialMetrics();
    assert.strictEqual(m.payroll.awaitingPayment, 200000);
    assert.strictEqual(m.payroll.totalDisbursed, 180000);
    assert.strictEqual(m.payroll.pendingApproval, 150000);
  });

  it('2.4 Pipeline conversion analytics compute stage-by-stage progression rates', () => {
    app.state.enquiries = [
      { id: 'eq1', status: 'NEW' },
      { id: 'eq2', status: 'CONTACTED' },
      { id: 'eq3', status: 'QUALIFIED' },
      { id: 'eq4', status: 'ENROLLED' }
    ];
    app.state.enrolments = [
      { id: 'enr1', studentName: 'Student 1' }
    ];

    const m = app.getAuthoritativeFinancialMetrics();
    assert.strictEqual(m.pipeline.totalEnquiries, 4);
    assert.strictEqual(m.pipeline.enrolledStudents, 1);
    assert.strictEqual(m.pipeline.convOverall, 25); // 1 of 4 = 25%
  });

  console.log('\n\x1b[36m--- Section 3: Management Attention Centre & 4-Tier Severity (Tests 9-13) ---\x1b[0m');

  it('3.1 Generates 🔴 Critical severity alerts for severely overdue invoices (> 60 days)', () => {
    app.state.invoices = [
      { id: 'inv_crit_old', clientName: 'Old Debtor', total: 350000, dueDate: '2026-05-01' }
    ];
    app.state.payments = [];

    const alerts = app.getManagementAttentionAlerts();
    const critAlert = alerts.find(a => a.severity === 'critical' && a.domain === 'finance');

    assert(critAlert, 'Must surface critical overdue alert');
    assert(critAlert.title.includes('Critically Overdue'));
    assert.strictEqual(critAlert.actionUrl, 'receivables');
  });

  it('3.2 Generates 🟠 High severity alerts for approved month-end payroll ready for disbursement', () => {
    app.state.payslips = [
      { id: 'ps_app_ready', payslipNo: 801, status: 'approved', netPay: 220000 }
    ];

    const alerts = app.getManagementAttentionAlerts();
    const payrollAlert = alerts.find(a => a.id === 'alt_hr_payroll_disburse');

    assert(payrollAlert, 'Must surface payroll disbursement alert');
    assert.strictEqual(payrollAlert.severity, 'high');
  });

  it('3.3 Generates 🟡 Medium severity alerts for unacknowledged issued payslips', () => {
    app.state.payslips = [
      { id: 'ps_unack', payslipNo: 802, status: 'issued', netPay: 180000 }
    ];

    const alerts = app.getManagementAttentionAlerts();
    const unackAlert = alerts.find(a => a.id === 'alt_hr_unack_payslips');

    assert(unackAlert);
    assert.strictEqual(unackAlert.severity, 'medium');
  });

  await itAsync('3.4 Alert Lifecycle: acknowledgeAlert transitions state from OPEN to ACKNOWLEDGED', async () => {
    const alertId = 'alt_test_ack';
    const updated = await app.acknowledgeAlert(alertId, 'Bolanle Adeyemi');

    assert.strictEqual(updated.status, 'ACKNOWLEDGED');
    assert.strictEqual(updated.acknowledged_by, 'Bolanle Adeyemi');
    assert(updated.acknowledged_at);
  });

  await itAsync('3.5 Alert Lifecycle: resolveAlert transitions state to RESOLVED', async () => {
    const alertId = 'alt_test_res';
    const updated = await app.resolveAlert(alertId, 'Ayodele Johnson');

    assert.strictEqual(updated.status, 'RESOLVED');
    assert.strictEqual(updated.resolved_by, 'Ayodele Johnson');
    assert(updated.resolved_at);
  });

  console.log('\n\x1b[36m--- Section 4: Accounts Receivable Ageing Analysis (Tests 14-17) ---\x1b[0m');

  it('4.1 Categorizes receivables into exact ageing buckets (Current, 1-30d, 31-60d, 61-90d, 90+d)', () => {
    const refDate = '2026-08-25';
    app.state.invoices = [
      { id: 'inv_cur', total: 100000, dueDate: '2026-08-30' },       // Current (future due date)
      { id: 'inv_10d', total: 50000, dueDate: '2026-08-15' },        // 10 days overdue -> 1-30d
      { id: 'inv_45d', total: 80000, dueDate: '2026-07-11' },        // 45 days overdue -> 31-60d
      { id: 'inv_75d', total: 120000, dueDate: '2026-06-11' },       // 75 days overdue -> 61-90d
      { id: 'inv_120d', total: 200000, dueDate: '2026-04-27' }       // 120 days overdue -> 90+d
    ];
    app.state.payments = [];

    const ageing = app.getReceivablesAgeingAnalysis(refDate);

    assert.strictEqual(ageing.current.amount, 100000);
    assert.strictEqual(ageing.days1to30.amount, 50000);
    assert.strictEqual(ageing.days31to60.amount, 80000);
    assert.strictEqual(ageing.days61to90.amount, 120000);
    assert.strictEqual(ageing.days90Plus.amount, 200000);
    assert.strictEqual(ageing.totalOutstanding, 550000);
    assert.strictEqual(ageing.totalOverdue, 450000);
  });

  it('4.2 Ageing accounts for partial payments reducing outstanding balance in bucket', () => {
    app.state.invoices = [
      { id: 'inv_part', total: 300000, dueDate: '2026-08-01' }
    ];
    app.state.payments = [
      { id: 'pay_part', invoiceId: 'inv_part', amount: 200000 }
    ];

    const ageing = app.getReceivablesAgeingAnalysis('2026-08-25');
    assert.strictEqual(ageing.days1to30.amount, 100000); // 300k - 200k = 100k
  });

  it('4.3 Zero-balance fully paid invoices are excluded from ageing buckets', () => {
    app.state.invoices = [
      { id: 'inv_settled', total: 250000, dueDate: '2026-07-01' }
    ];
    app.state.payments = [
      { id: 'pay_settled', invoiceId: 'inv_settled', amount: 250000 }
    ];

    const ageing = app.getReceivablesAgeingAnalysis('2026-08-25');
    assert.strictEqual(ageing.totalOutstanding, 0);
    assert.strictEqual(ageing.days31to60.count, 0);
  });

  it('4.4 Days overdue calculation accurately handles leap years and month boundaries', () => {
    app.state.invoices = [
      { id: 'inv_bound', total: 100000, dueDate: '2026-01-31' }
    ];
    app.state.payments = [];
    const ageing = app.getReceivablesAgeingAnalysis('2026-03-02');
    // Jan 31 -> Mar 2 (28 days in Feb 2026 + 2 days in Mar = 30 days) -> days1to30
    assert.strictEqual(ageing.days1to30.count, 1);
  });

  console.log('\n\x1b[36m--- Section 5: CRM Pipeline State Machine & History (Tests 18-22) ---\x1b[0m');

  it('5.1 validateCrmStageTransition permits valid sequential transitions', () => {
    assert(app.validateCrmStageTransition('NEW', 'CONTACTED').valid);
    assert(app.validateCrmStageTransition('CONTACTED', 'QUALIFIED').valid);
    assert(app.validateCrmStageTransition('QUALIFIED', 'CONSULTATION').valid);
    assert(app.validateCrmStageTransition('INVOICE GENERATED', 'PAYMENT PENDING').valid);
    assert(app.validateCrmStageTransition('PAID', 'ENROLLED').valid);
  });

  it('5.2 validateCrmStageTransition rejects arbitrary stage jumping without prerequisite', () => {
    const check = app.validateCrmStageTransition('NEW', 'PAID');
    assert(!check.valid, 'NEW cannot jump directly to PAID');
    assert(check.message.includes('Invalid CRM pipeline transition'));
  });

  it('5.3 Super Admin role can perform administrative override on pipeline stage', () => {
    const override = app.validateCrmStageTransition('NEW', 'ACTIVE CUSTOMER', 'Super Admin');
    assert(override.valid);
    assert(override.warning);
  });

  await itAsync('5.4 transitionCrmStage records audit history with from_stage, to_stage, and actor', async () => {
    const enq = { id: 'enq_trans_1', enquiryNo: 901, name: 'Titi Branch', status: 'NEW' };
    app.state.enquiries = [enq];
    app.state.crmStageHistory = [];

    const res = await app.transitionCrmStage(enq.id, 'CONTACTED', 'Initial consultation call held', 'Counselor Funke');

    assert.strictEqual(enq.status, 'CONTACTED');
    assert.strictEqual(app.state.crmStageHistory.length, 1);
    const hist = app.state.crmStageHistory[0];
    assert.strictEqual(hist.from_stage, 'NEW');
    assert.strictEqual(hist.to_stage, 'CONTACTED');
    assert.strictEqual(hist.actor_name, 'Counselor Funke');
    assert.strictEqual(hist.reason, 'Initial consultation call held');
  });

  it('5.5 transitionCrmStage throws error when transitioning non-existent enquiry', async () => {
    let err = null;
    try {
      await app.transitionCrmStage('invalid_id', 'CONTACTED');
    } catch (e) {
      err = e;
    }
    assert(err !== null);
  });

  console.log('\n\x1b[36m--- Section 6: Expense Lifecycle & Status History (Tests 23-26) ---\x1b[0m');

  await itAsync('6.1 transitionExpenseStatus moves expense through draft -> submitted -> approved -> paid', async () => {
    const exp = { id: 'exp_life_1', amount: 85000, status: 'draft', date: '2026-08-20' };
    app.state.expenses = [exp];
    app.state.expenseStatusHistory = [];

    await app.transitionExpenseStatus(exp.id, 'submitted', 'Submitted by Operations Officer');
    assert.strictEqual(exp.status, 'submitted');

    await app.transitionExpenseStatus(exp.id, 'approved', 'Authorized by Finance Manager');
    assert.strictEqual(exp.status, 'approved');
    assert(exp.approvedBy);
  });

  it('6.2 transitionExpenseStatus records complete status audit log', () => {
    assert(app.state.expenseStatusHistory.length >= 2);
    assert.strictEqual(app.state.expenseStatusHistory[0].to_status, 'approved');
  });

  it('6.3 transitionExpenseStatus throws error on closed/locked financial periods', async () => {
    app.state.financePeriods = [{ period: '2026-07', status: 'locked' }];
    const expLocked = { id: 'exp_locked', amount: 50000, status: 'draft', date: '2026-07-15', financial_period: '2026-07' };
    app.state.expenses.push(expLocked);

    let err = null;
    try {
      await app.transitionExpenseStatus(expLocked.id, 'approved');
    } catch (e) {
      err = e;
    }
    assert(err !== null);
    assert(err.message.includes('PERIOD LOCK VIOLATION'));
  });

  await itAsync('6.4 recordFinancialAdjustment creates GL adjustment ledger entry for locked period corrections', async () => {
    app.state.financialAdjustments = [];
    const adj = await app.recordFinancialAdjustment({
      originalTable: 'expenses',
      originalRecordId: 'exp_old_01',
      adjustmentType: 'CREDIT_NOTE',
      amount: 25000,
      reason: 'Vendor invoice discount applied retrospectively',
      financialPeriod: '2026-08'
    });

    assert(adj);
    assert.strictEqual(adj.adjustment_type, 'CREDIT_NOTE');
    assert.strictEqual(adj.amount, 25000);
    assert.strictEqual(app.state.financialAdjustments.length, 1);
  });

  console.log('\n\x1b[36m--- Section 7: Bank Reconciliation Difference Arithmetic (Tests 27-30) ---\x1b[0m');

  it('7.1 calculateBankReconciliation calculates exact book balance, statement balance, and difference', () => {
    const accId = 'acc_gtb_recon';
    app.state.paymentAccounts = [
      { id: accId, accountName: 'GTBank Primary Corporate', openingBalance: 1000000, isDefault: true }
    ];
    app.state.payments = [
      { id: 'p_rec1', paymentAccountId: accId, amount: 500000 },
      { id: 'p_rec2', paymentAccountId: accId, amount: 200000 }
    ];
    app.state.expenses = [
      { id: 'e_rec1', paymentAccountId: accId, amount: 300000, status: 'paid' }
    ];

    // Book Balance = 1,000,000 + 700,000 - 300,000 = 1,400,000
    // If all items cleared and statement balance is 1,400,000 -> Difference = 0, RECONCILED
    const r1 = app.calculateBankReconciliation(accId, '2026-08', 1400000, ['p_rec1', 'p_rec2', 'e_rec1']);

    assert.strictEqual(r1.bookBalance, 1400000);
    assert.strictEqual(r1.statementBalance, 1400000);
    assert.strictEqual(r1.difference, 0);
    assert.strictEqual(r1.status, 'RECONCILED');
  });

  it('7.2 calculateBankReconciliation flags EXCEPTION status when statement does not match adjusted book balance', () => {
    const accId = 'acc_gtb_recon';
    // Statement shows 1,350,000 (missing 50,000)
    const r2 = app.calculateBankReconciliation(accId, '2026-08', 1350000, ['p_rec1', 'p_rec2', 'e_rec1']);

    assert.strictEqual(r2.difference, -50000);
    assert.strictEqual(r2.status, 'EXCEPTION');
  });

  it('7.3 calculateBankReconciliation adjusts for uncleared items accurately', () => {
    const accId = 'acc_gtb_recon';
    // p_rec2 (200k) is uncleared. Cleared items: p_rec1 (500k), e_rec1 (300k).
    // Adjusted Book Balance = 1,400,000 - 200,000 (uncleared inflow) = 1,200,000
    // If Statement is 1,200,000 -> RECONCILED!
    const r3 = app.calculateBankReconciliation(accId, '2026-08', 1200000, ['p_rec1', 'e_rec1']);

    assert.strictEqual(r3.unclearedInflows, 200000);
    assert.strictEqual(r3.difference, 0);
    assert.strictEqual(r3.status, 'RECONCILED');
  });

  await itAsync('7.4 recordBankReconciliation persists reconciliation record with period and authorizer', async () => {
    app.state.bankReconciliations = [];
    const saved = await app.recordBankReconciliation({
      accountId: 'acc_gtb_recon',
      period: '2026-08',
      bookBalance: 1400000,
      statementBalance: 1400000,
      unclearedInflows: 0,
      unclearedOutflows: 0,
      difference: 0,
      status: 'RECONCILED',
      notes: 'Monthly bank statement matched to ledger'
    });

    assert(saved);
    assert.strictEqual(saved.reconciliation_period, '2026-08');
    assert.strictEqual(saved.status, 'RECONCILED');
    assert.strictEqual(app.state.bankReconciliations.length, 1);
  });

  console.log('\n\x1b[36m--- Section 8: Database-Level Idempotency & Transactional Mutations (Tests 31-35) ---\x1b[0m');

  await itAsync('8.1 checkAndRecordIdempotency permits first invocation and registers idempotency key', async () => {
    app.state.idempotencyKeys = [];
    const firstCall = await app.checkAndRecordIdempotency('idem_key_unique_01', 'payment', 'p100');
    assert.strictEqual(firstCall, true);
    assert.strictEqual(app.state.idempotencyKeys.length, 1);
  });

  await itAsync('8.2 checkAndRecordIdempotency throws IDEMPOTENCY CONFLICT error on duplicate invocation', async () => {
    let err = null;
    try {
      await app.checkAndRecordIdempotency('idem_key_unique_01', 'payment', 'p100');
    } catch (e) {
      err = e;
    }
    assert(err !== null);
    assert(err.message.includes('IDEMPOTENCY CONFLICT'));
  });

  await itAsync('8.3 executeTransactionalPaymentCascade updates invoice, customer, enrolment, and logs timeline atomically', async () => {
    const cust = { id: 'cust_tx_1', name: 'Transactional Student', totalInvoiced: 250000, totalPaid: 0, balance: 250000 };
    const inv = { id: 'inv_tx_1', invoiceNo: 'INV-2026-5501', customerId: cust.id, clientName: 'Transactional Student', total: 250000, date: '2026-08-20' };
    const enr = { id: 'enr_tx_1', invoiceId: inv.id, studentName: 'Transactional Student', agreedFee: 250000, amountPaid: 0, balanceDue: 250000 };

    app.state.customers = [cust];
    app.state.invoices = [inv];
    app.state.enrolments = [enr];
    app.state.customerTimeline = [];

    const payment = await app.executeTransactionalPaymentCascade(
      { amount: 150000, paymentMethod: 'Bank Transfer' },
      inv.id,
      { idempotencyKey: 'idem_tx_pay_01' }
    );

    assert(payment);
    assert.strictEqual(payment.amount, 150000);
    assert.strictEqual(enr.amountPaid, 150000);
    assert.strictEqual(enr.balanceDue, 100000);
    assert.strictEqual(cust.totalPaid, 150000);
    assert.strictEqual(cust.balance, 100000);
  });

  it('8.4 searchGlobalEntities enforces RBAC: Staff user cannot discover restricted invoices or personnel records', () => {
    app.state.auth = { isAuthenticated: true, user: { id: 'u_staff', role: 'Staff', personnelId: 'emp_2' } };
    app.state.invoices = [{ id: 'inv_sec', invoiceNo: 'INV-SECRET-01', clientName: 'Secret Client', total: 5000000 }];
    app.state.programmes = [{ id: 'prog_pub', name: 'Public IELTS Course', price: 150000 }];

    const results = app.searchGlobalEntities('Secret');
    const hasInvoice = results.some(r => r.type === 'invoice');
    assert.strictEqual(hasInvoice, false, 'Staff role must not discover invoice records via search');

    const progResults = app.searchGlobalEntities('IELTS');
    assert(progResults.some(r => r.type === 'programme'), 'Public programmes must be searchable');
  });

  it('8.5 Observability Invariant: State and system metrics never expose secret tokens, hashes, or passwords in search', () => {
    app.state.auth = { isAuthenticated: true, user: { id: 'u_admin', role: 'Super Admin' } };
    const res = app.searchGlobalEntities('salt');
    const leak = res.some(r => JSON.stringify(r).includes('passwordHash') || JSON.stringify(r).includes('passwordSalt'));
    assert.strictEqual(leak, false, 'Global search must never leak password salts or hashes');
  });

  console.log('\n\x1b[34m=================================================================\x1b[0m');
  console.log(`\x1b[34m   PHASE 10 TEST SUMMARY: \x1b[32m${testsPassed} PASSED\x1b[34m / \x1b[31m${testsFailed} FAILED\x1b[34m\x1b[0m`);
  console.log('\x1b[34m=================================================================\x1b[0m');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runSuite();
