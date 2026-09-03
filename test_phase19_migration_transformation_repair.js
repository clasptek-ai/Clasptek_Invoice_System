/**
 * CLASPTEK ENTERPRISE PLATFORM — PHASE 19 AUTOMATED TEST SUITE
 * Test Suite: Migration Transformation Repair, Whitelist Attribute Enforcement,
 * 27-Entity Schema Alignment, CamelCase Elimination & Abort Guarantees
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  ✔ PASS [Test ${String(totalPassed).padStart(2, '0')}]: ${message}`);
  } else {
    totalFailed++;
    console.error(`  ✖ FAIL [Test ${String(totalPassed + totalFailed).padStart(2, '0')}]: ${message}`);
    failures.push(message);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store
  };
}

async function runPhase19Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 19: HISTORICAL MIGRATION TRANSFORMATION & SCHEMA INTEGRITY');
  console.log('========================================================================================\n');

  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  let scriptMatch = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    const allMatches = [...htmlContent.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    scriptMatch = allMatches[allMatches.length - 1];
  }
  const scriptContent = scriptMatch[1];

  const invPath = path.join(__dirname, 'schema_inventory.json');
  const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
  const tables = inv.allTables;

  const mockStorage = createMockLocalStorage();
  const customTenantUuid = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

  const sandbox = {
    window: {
      addEventListener: () => {},
      location: { reload: () => {}, href: 'http://localhost' },
      __CLASPTEK_ENV__: {
        SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_mock_long_key_12345',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock_long_key_12345'
      }
    },
    document: {
      getElementById: () => ({ addEventListener: () => {}, style: {}, textContent: '' }),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: mockStorage,
    sessionStorage: createMockLocalStorage(),
    module: { exports: {} },
    exports: {},
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {}
  };

  vm.runInNewContext(scriptContent, sandbox);
  const app = sandbox.module.exports;

  // ---------------------------------------------------------------------------
  // Category 1: finance_settings Whitelist Transformation & CamelCase Elimination
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: finance_settings Whitelist Transformation ---');

  const rawFinanceSettings = {
    companyName: 'CLASPTEK COACHING LIMITED',
    tradingName: 'Clasptek Coaching Limited',
    address: '1, Baptist Close Off Access Ibiyemi Avenue, Magboro, Ogun 110115 NG',
    phone: '+2347041316925',
    email: 'info@clasptek.org',
    website: 'https://clasptek.org',
    taxId: 'TIN-9842104-001',
    registrationNumber: 'RC-1849201',
    defaultTerms: 'Payment is due according to the schedule specified above.',
    invoiceFooter: 'Thank you for choosing Clasptek Coaching Limited!',
    extraNonExistentProperty: 'SHOULD_BE_DROPPED'
  };

  const transformedSettings = app.transformEntityForPostgres('finance_settings', rawFinanceSettings, customTenantUuid);

  assert(transformedSettings.tenant_id === customTenantUuid, 'Attaches correct tenant_id to finance_settings');
  assert(transformedSettings.id === 'finance_settings_' + customTenantUuid, 'Generates deterministic tenant-scoped ID');
  assert(transformedSettings.company_name === 'CLASPTEK COACHING LIMITED', 'Maps companyName to company_name');
  assert(transformedSettings.trading_name === 'Clasptek Coaching Limited', 'Maps tradingName to trading_name');
  assert(transformedSettings.tax_id === 'TIN-9842104-001', 'Maps taxId to tax_id');
  assert(transformedSettings.registration_number === 'RC-1849201', 'Maps registrationNumber to registration_number');
  assert(transformedSettings.default_terms.includes('Payment is due'), 'Maps defaultTerms to default_terms');
  assert(transformedSettings.invoice_footer.includes('Thank you for choosing'), 'Maps invoiceFooter to invoice_footer');
  assert(transformedSettings.companyName === undefined, 'camelCase companyName is completely removed');
  assert(transformedSettings.tradingName === undefined, 'camelCase tradingName is completely removed');
  assert(transformedSettings.taxId === undefined, 'camelCase taxId is completely removed');
  assert(transformedSettings.registrationNumber === undefined, 'camelCase registrationNumber is completely removed');
  assert(transformedSettings.defaultTerms === undefined, 'camelCase defaultTerms is completely removed');
  assert(transformedSettings.invoiceFooter === undefined, 'camelCase invoiceFooter is completely removed');
  assert(transformedSettings.extraNonExistentProperty === undefined, 'Extraneous non-schema property is dropped');

  // Verify all fields exist in public.finance_settings
  const financeCols = new Set(tables.finance_settings.columns.map(c => c.name));
  for (const k of Object.keys(transformedSettings)) {
    assert(financeCols.has(k), `Field '${k}' exists in public.finance_settings column schema`);
  }

  // ---------------------------------------------------------------------------
  // Category 2: payment_accounts Whitelist Transformation & CamelCase Elimination
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: payment_accounts Whitelist Transformation ---');

  const rawPaymentAccount = {
    id: 'acc_gtb_01',
    accountName: 'Clasptek Coaching Ltd Operating',
    bankName: 'Guaranty Trust Bank',
    accountNumber: '0123456789',
    accountType: 'Corporate Current',
    currency: 'NGN',
    instructions: 'Use invoice number as payment memo.',
    isActive: true,
    isDefault: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'Admin',
    unmappedAttribute: 'DO_NOT_SEND'
  };

  const transformedAccount = app.transformEntityForPostgres('payment_accounts', rawPaymentAccount, customTenantUuid);

  assert(transformedAccount.tenant_id === customTenantUuid, 'Attaches tenant_id to payment_accounts');
  assert(transformedAccount.id === 'acc_gtb_01', 'Preserves account primary key');
  assert(transformedAccount.account_name === 'Clasptek Coaching Ltd Operating', 'Maps accountName to account_name');
  assert(transformedAccount.bank_name === 'Guaranty Trust Bank', 'Maps bankName to bank_name');
  assert(transformedAccount.account_number === '0123456789', 'Maps accountNumber to account_number');
  assert(transformedAccount.account_type === 'Corporate Current', 'Maps accountType to account_type');
  assert(transformedAccount.is_active === true, 'Maps isActive to is_active boolean');
  assert(transformedAccount.is_default === true, 'Maps isDefault to is_default boolean');
  assert(transformedAccount.accountName === undefined, 'camelCase accountName is removed');
  assert(transformedAccount.bankName === undefined, 'camelCase bankName is removed');
  assert(transformedAccount.accountNumber === undefined, 'camelCase accountNumber is removed');
  assert(transformedAccount.accountType === undefined, 'camelCase accountType is removed');
  assert(transformedAccount.isActive === undefined, 'camelCase isActive is removed');
  assert(transformedAccount.isDefault === undefined, 'camelCase isDefault is removed');
  assert(transformedAccount.unmappedAttribute === undefined, 'Unmapped attribute is dropped');

  const accountCols = new Set(tables.payment_accounts.columns.map(c => c.name));
  for (const k of Object.keys(transformedAccount)) {
    assert(accountCols.has(k), `Field '${k}' exists in public.payment_accounts column schema`);
  }

  // ---------------------------------------------------------------------------
  // Category 3: Strict Schema Conformance Across ALL 27 Migration Entities
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Strict Schema Conformance Across ALL 27 Entities ---');

  const sequence = [
    { entity: 'finance_settings', table: 'finance_settings' },
    { entity: 'payment_accounts', table: 'payment_accounts' },
    { entity: 'programmes', table: 'programmes' },
    { entity: 'personnel', table: 'personnel' },
    { entity: 'customers', table: 'customers' },
    { entity: 'enquiries', table: 'enquiries' },
    { entity: 'enrolments', table: 'enrolments' },
    { entity: 'invoices', table: 'invoices' },
    { entity: 'invoice_items', table: 'invoice_items' },
    { entity: 'payments', table: 'payments' },
    { entity: 'receipts', table: 'receipts' },
    { entity: 'expenses', table: 'expenses' },
    { entity: 'direct_income', table: 'direct_income' },
    { entity: 'budgets', table: 'budgets' },
    { entity: 'budget_lines', table: 'budget_lines' },
    { entity: 'payslips', table: 'payslips' },
    { entity: 'facilitator_sessions', table: 'facilitator_sessions' },
    { entity: 'customer_timeline', table: 'customer_timeline' },
    { entity: 'collection_actions', table: 'collection_actions' },
    { entity: 'finance_audit_log', table: 'finance_audit_log' },
    { entity: 'management_alerts', table: 'management_alerts' },
    { entity: 'approval_thresholds', table: 'approval_thresholds' },
    { entity: 'financial_adjustments', table: 'financial_adjustments' },
    { entity: 'report_snapshots', table: 'report_snapshots' },
    { entity: 'management_metrics', table: 'management_metrics' },
    { entity: 'cash_flow_forecasts', table: 'cash_flow_forecasts' },
    { entity: 'customer_segments', table: 'customer_segments' }
  ];

  assert(sequence.length === 27, 'Exact 27 entities defined in migration dependency order');

  const testObjects = {
    finance_settings: { companyName: 'C', tradingName: 'C', taxId: 'T', registrationNumber: 'R', defaultTerms: 'T', invoiceFooter: 'F' },
    payment_accounts: { accountName: 'A', bankName: 'B', accountNumber: '1', accountType: 'Current', isActive: true, isDefault: true },
    programmes: { id: 'p1', name: 'P', code: 'C', tuitionFee: 1000, maxDiscountPct: 5, allowInstallments: true, installmentFirstPct: 50, installmentSecondPct: 50 },
    personnel: { id: 'emp_1', employeeNo: 'EMP-01', name: 'John Doe', type: 'staff', role: 'Dev', employmentStatus: 'Full-Time', basicPay: 100000, userId: 'usr_sa_1' },
    customers: { id: 'c1', name: 'Cust', email: 'c@c.com', totalInvoiced: 100, totalPaid: 50, outstandingBalance: 50 },
    enquiries: { id: 'e1', studentName: 'S', email: 's@s.com', programmeId: 'p1', source: 'Web', status: 'open' },
    enrolments: { id: 'en1', studentName: 'S', studentEmail: 's@s.com', programmeId: 'p1', status: 'active', startDate: '2026-09-01' },
    invoices: { id: 'inv1', invoiceNo: 'INV-1', clientName: 'S', programmeId: 'p1', subTotal: 1000, total: 1000, date: '2026-09-01', dueDate: '2026-09-15' },
    invoice_items: { id: 'it1', invoiceId: 'inv1', itemDescription: 'Tuition', unitPrice: 1000, totalPrice: 1000, quantity: 1 },
    payments: { id: 'pay1', receiptNo: 'REC-1', invoiceId: 'inv1', amount: 1000, paymentMethod: 'Bank Transfer', date: '2026-09-02' },
    receipts: { id: 'rec1', receiptNo: 'REC-1', invoiceId: 'inv1', paymentId: 'pay1', amount: 1000, receiptDate: '2026-09-02' },
    expenses: { id: 'exp1', expenseNo: 'EXP-1', expenseDate: '2026-09-02', categoryGroup: 'Ops', subCategory: 'General', amount: 500, beneficiary: 'Vendor' },
    direct_income: { id: 'inc1', incomeNo: 'INC-1', incomeDate: '2026-09-02', incomeCategory: 'Consulting', amount: 2000 },
    budgets: { id: 'b1', budgetPeriod: '2026-09', categoryGroup: 'Ops', allocatedAmount: 10000 },
    budget_lines: { id: 'bl1', budgetId: 'b1', category: 'Ops', monthKey: '2026-09', allocatedAmount: 5000, spentAmount: 1000 },
    payslips: { id: 'ps1', payslipNo: 'PSL-1', personnelId: 'emp_1', payrollPeriod: '2026-09', basicSalary: 80000, grossPay: 100000, netPay: 90000 },
    facilitator_sessions: { id: 'ses1', sessionNo: 'SES-1', personnelId: 'emp_1', programmeId: 'p1', sessionDate: '2026-09-02', hourlyRate: 5000, totalEarnings: 10000 },
    customer_timeline: { id: 'tl1', customerId: 'c1', activityType: 'Call', title: 'Call', eventDate: '2026-09-02' },
    collection_actions: { id: 'ca1', customerId: 'c1', invoiceId: 'inv1', actionType: 'Reminder', actionDate: '2026-09-02' },
    finance_audit_log: { id: 'aud1', entityType: 'invoice', entityId: 'inv1', previousValue: '{}', newValue: '{\"status\":\"paid\"}', performedBy: 'Admin', performedAt: '2026-09-02' },
    management_alerts: { id: 'alt1', alertType: 'Budget', alertTitle: 'Alert', alertMessage: 'Warning', isResolved: false },
    approval_thresholds: { thresholdAmount: 500000, requireSuperAdmin: true },
    financial_adjustments: { id: 'adj1', originalTable: 'invoices', originalRecordId: 'inv1', adjustmentType: 'Credit Note', amount: 100 },
    report_snapshots: { id: 'snap1', reportType: 'PnL', reportTitle: 'PnL', financialPeriod: '2026-09' },
    management_metrics: { metricPeriod: '2026-09', totalRevenue: 500000, operatingExpenses: 200000 },
    cash_flow_forecasts: { id: 'cff1', forecastDate: '2026-09-01', horizonDays: 30, openingCash: 100000 },
    customer_segments: { id: 'cs1', customerId: 'c1', segment: 'VIP', lifetimeValue: 50000 }
  };

  sequence.forEach(s => {
    const tableDef = tables[s.table];
    assert(Boolean(tableDef), `Table definition for '${s.table}' exists in schema inventory`);
    const validCols = new Set(tableDef.columns.map(c => c.name));

    const raw = testObjects[s.entity] || { id: 'test_1' };
    const transformed = app.transformEntityForPostgres(s.entity, raw, customTenantUuid);

    // Verify tenant_id attached
    assert(transformed.tenant_id === customTenantUuid, `${s.entity}: injects authoritative tenant_id`);

    // Verify no camelCase keys exist
    for (const key of Object.keys(transformed)) {
      assert(!/[A-Z]/.test(key), `${s.entity}: key '${key}' does NOT contain camelCase letters`);
      assert(validCols.has(key), `${s.entity}: key '${key}' exists in PostgreSQL table '${s.table}'`);
    }
  });

  // ---------------------------------------------------------------------------
  // Category 4: Migration Failure Abort & Lock Invariant Guarantees
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Migration Failure Abort & Invariant Guarantees ---');

  // Verify that DATABASE_AUTHORITY_STATE has BLOCKED state
  assert(app.DATABASE_AUTHORITY_STATE && app.DATABASE_AUTHORITY_STATE.BLOCKED, 'DATABASE_AUTHORITY_STATE includes BLOCKED');

  // Configure sandbox env for mock Supabase run
  sandbox.window.__CLASPTEK_ENV__ = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_mock_long_key_12345',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock_long_key_12345'
  };
  mockStorage.setItem('clasptek:supabase_url', 'https://mock.supabase.co');
  mockStorage.setItem('clasptek:supabase_anon_key', 'sb_publishable_mock_long_key_12345');

  app.state.auth = {
    user: {
      id: 'usr_mock_sa',
      role: 'SUPER_ADMIN',
      tenant_id: customTenantUuid,
      name: 'Super Admin',
      email: 'admin@clasptek.org'
    },
    session: {
      access_token: 'mock_token'
    }
  };

  // Seed local storage with finance_settings so inspectLegacyLocalData detects records
  mockStorage.setItem('clasptek:finance_settings', JSON.stringify({
    companyName: 'Mock Company',
    tradingName: 'Mock Trading',
    taxId: 'TIN-001'
  }));

  // Verify that an upsert failure locks authority state and halts processing
  let simulatedErrorTriggered = false;
  let simulatedTable = null;

  const origFrom = app.supabaseClient.from;
  app.supabaseClient.from = (tableName) => ({
    select: async () => ({ status: 200, ok: true, data: [] }),
    upsert: async (rows) => {
      if (tableName === 'finance_settings') {
        simulatedErrorTriggered = true;
        simulatedTable = tableName;
        return { data: null, error: { message: `Simulated PostgREST PGRST204 on ${tableName}` } };
      }
      return { data: rows, error: null };
    }
  });

  // Set initial authority state to LOCAL_ONLY and unlock migration
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.LOCAL_ONLY;
  app.state.migrationLockActive = false;

  const migrationRes = await app.migrateLegacyDataToPostgres({ dryRun: false });

  assert(simulatedErrorTriggered === true, 'Migration triggered PostgREST upsert call');
  assert(simulatedTable === 'finance_settings', 'First table attempted in dependency sequence is finance_settings');
  assert(migrationRes.success === false, 'Migration reports success === false on schema/API error');
  assert(migrationRes.hasFatalError === true, 'Migration flags hasFatalError === true');
  assert(migrationRes.failedTable === 'finance_settings', 'Failed table correctly captured as finance_settings');
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.BLOCKED || app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.RECONCILIATION_FAILED, 'Authority state safely locked upon fatal error');

  // Restore client
  app.supabaseClient.from = origFrom;

  // ---------------------------------------------------------------------------
  // Category 5: Reconciliation Integrity & False Zero-Record Guard Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Reconciliation Integrity & False-Zero Protection ---');

  // Test 11: Reconciliation on failed/empty remote state must not be authoritative
  const failedRecon = await app.reconcileProductionData();
  assert(failedRecon.isReconciled === false, 'Reconciliation confirms isReconciled === false when remote is empty but local has records');
  assert(failedRecon.status !== 'RECONCILED', 'Status is NOT RECONCILED on unsynced state');

  // Test 12: Protection against treating failed query (HTTP 401) as 0 records
  app.supabaseClient.from = () => ({
    select: async () => ({ status: 401, ok: false, data: null, error: { message: 'JWT expired' } })
  });

  const authGuardedRecon = await app.reconcileProductionData();
  assert(authGuardedRecon.isReconciled === false, 'Reconciliation guarded against treating 401 as 0 records');
  assert(authGuardedRecon.authenticationRequired === true || authGuardedRecon.status === 'DATABASE_AUTHENTICATION_REQUIRED', 'Reconciliation flags authenticationRequired on 401');

  // Test 10: Successful simulated migration & reconciliation
  const mockDb = { finance_settings: [] };
  app.supabaseClient.from = (tableName) => ({
    select: async () => ({ status: 200, ok: true, data: mockDb[tableName] || [] }),
    upsert: async (rows) => {
      mockDb[tableName] = [...rows];
      return { data: rows, error: null };
    }
  });
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.LOCAL_ONLY;
  app.state.migrationLockActive = false;

  const successMig = await app.migrateLegacyDataToPostgres({ dryRun: false });
  assert(successMig.success === true, 'Migration succeeds when upsert succeeds across entities');
  assert(successMig.stats.failed === 0, 'Zero failed records on successful migration');
  assert(successMig.reconciliation.isReconciled === true, 'Reconciliation confirms 100% match on successful migration');

  // Test 8: Upsert idempotency check (second run)
  const rerunMig = await app.migrateLegacyDataToPostgres({ dryRun: false });
  assert(rerunMig.success === true, 'Second migration run succeeds idempotently');
  assert(rerunMig.stats.alreadyExisting >= 1, 'Second migration run detects pre-existing records without duplication');

  // Restore client from
  app.supabaseClient.from = origFrom;

  console.log('\n========================================================================================');
  console.log(` PHASE 19 CERTIFICATION SUMMARY: ${totalPassed} PASSED / ${totalFailed} FAILED (TOTAL ${totalPassed + totalFailed} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhase19Tests().catch(err => {
  console.error('Fatal error running Phase 19 tests:', err);
  process.exit(1);
});
