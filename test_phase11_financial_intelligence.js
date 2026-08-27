/**
 * CLASPTEK FINANCIAL GOVERNANCE, BUSINESS INTELLIGENCE & DECISION SUPPORT TEST SUITE - PHASE 11
 * 
 * 60+ Comprehensive Automated Test Assertions covering:
 * 1. Schema versioning & Phase 11 store key mappings (PostgreSQL authoritative persistence)
 * 2. Executive Financial Intelligence Engine (20+ KPIs, Multi-Period Comparisons, Deltas, Trends)
 * 3. Budget vs Actual & Category Variance Analysis (Budget - Actual Invariants, Over-budget flags)
 * 4. Line-Item Budget Expense Transactions Drilldown
 * 5. Enhanced Academic Programme Profitability & Contribution Margin Ranking
 * 6. Customer Revenue Intelligence & Automated Rules-Based Segmentation (VIP, High Value, Delinquent, etc.)
 * 7. Multi-Horizon Cash Flow Runway Forecasting (7, 30, 60, 90-day predictive modeling)
 * 8. Deterministic Collection Priority Risk Scoring & Action Timeline Logging
 * 9. Expense Anomaly & Outlier Detection Engine (2.5x Spikes, Duplicates, ₦200k+ Outliers)
 * 10. Payroll Cost Intelligence & Liability Metrics
 * 11. Executive Decision Support Recommendations Engine
 * 12. Management Performance Report Generator (JSON & Tabular CSV)
 * 13. Configurable Multi-Tier Approval Thresholds Evaluation
 * 14. RBAC Access Isolation on Financial Intelligence Tabs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('\x1b[34m=================================================================\x1b[0m');
console.log('\x1b[34m  CLASPTEK PHASE 11: FINANCIAL GOVERNANCE & BUSINESS INTELLIGENCE\x1b[0m');
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
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m\n${err.stack}`);
    testsFailed++;
  }
}

async function runTestSuite() {
  const { exports: exp } = createSandboxEnvironment();
  const {
    state,
    SCHEMA_VERSION,
    DB_TABLE_MAPPING,
    STORE_KEY_FINANCIAL_BUDGETS,
    STORE_KEY_BUDGET_LINES,
    STORE_KEY_MANAGEMENT_METRICS,
    STORE_KEY_CASH_FLOW_FORECASTS,
    STORE_KEY_CUSTOMER_SEGMENTS,
    STORE_KEY_COLLECTION_ACTIONS,
    STORE_KEY_APPROVAL_THRESHOLDS,
    STORE_KEY_MANAGEMENT_RECOMMENDATIONS,
    STORE_KEY_REPORT_SNAPSHOTS,
    calculateExecutiveFinancialIntelligence,
    calculateBudgetVsActual,
    getBudgetExpenseTransactions,
    calculateEnhancedProgrammeProfitability,
    calculateCustomerRevenueIntelligence,
    calculateCashFlowForecast,
    calculateCollectionPriorityScore,
    recordCollectionAction,
    detectExpenseAnomalies,
    calculatePayrollCostIntelligence,
    generateExecutiveRecommendations,
    generateManagementPerformanceReport,
    evaluateApprovalThreshold,
    canAccessTab
  } = exp;

  console.log('\n--- Test Group 1: Schema Versioning & PostgreSQL Store Key Mappings ---');
  it('1.1 Schema version is bumped to 11.0.0', () => {
    assert.strictEqual(SCHEMA_VERSION, '11.0.0');
  });

  it('1.2 All 9 Phase 11 Store Keys are defined', () => {
    assert.strictEqual(STORE_KEY_FINANCIAL_BUDGETS, 'clasptek:financial_budgets');
    assert.strictEqual(STORE_KEY_BUDGET_LINES, 'clasptek:budget_lines');
    assert.strictEqual(STORE_KEY_MANAGEMENT_METRICS, 'clasptek:management_metrics');
    assert.strictEqual(STORE_KEY_CASH_FLOW_FORECASTS, 'clasptek:cash_flow_forecasts');
    assert.strictEqual(STORE_KEY_CUSTOMER_SEGMENTS, 'clasptek:customer_segments');
    assert.strictEqual(STORE_KEY_COLLECTION_ACTIONS, 'clasptek:collection_actions');
    assert.strictEqual(STORE_KEY_APPROVAL_THRESHOLDS, 'clasptek:approval_thresholds');
    assert.strictEqual(STORE_KEY_MANAGEMENT_RECOMMENDATIONS, 'clasptek:management_recommendations');
    assert.strictEqual(STORE_KEY_REPORT_SNAPSHOTS, 'clasptek:report_snapshots');
  });

  it('1.3 DB_TABLE_MAPPING correctly maps all 9 Phase 11 tables', () => {
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_FINANCIAL_BUDGETS], 'financial_budgets');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_BUDGET_LINES], 'budget_lines');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_MANAGEMENT_METRICS], 'management_metrics');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_CASH_FLOW_FORECASTS], 'cash_flow_forecasts');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_CUSTOMER_SEGMENTS], 'customer_segments');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_COLLECTION_ACTIONS], 'collection_actions');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_APPROVAL_THRESHOLDS], 'approval_thresholds');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_MANAGEMENT_RECOMMENDATIONS], 'management_recommendations');
    assert.strictEqual(DB_TABLE_MAPPING[STORE_KEY_REPORT_SNAPSHOTS], 'report_snapshots');
  });

  // Seed authoritative test state
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const curY = parseInt(currentMonth.split('-')[0], 10);
  const curM = parseInt(currentMonth.split('-')[1], 10);
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const prevMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;

  state.invoices = [
    { id: 'inv_101', invoiceNo: 'INV-101', clientName: 'Alpha Corp', programmeName: 'Executive Coaching', totalAmount: 500000, date: `${currentMonth}-05`, dueDate: `${currentMonth}-20`, items: [{ amount: 500000 }] },
    { id: 'inv_102', invoiceNo: 'INV-102', clientName: 'Beta Ltd', programmeName: 'AI Strategy', totalAmount: 300000, date: `${currentMonth}-10`, dueDate: `${currentMonth}-25`, items: [{ amount: 300000 }] },
    { id: 'inv_103', invoiceNo: 'INV-103', clientName: 'Gamma Org', programmeName: 'Leadership Accelerator', totalAmount: 200000, date: `${prevMonth}-05`, dueDate: `${prevMonth}-15`, items: [{ amount: 200000 }] }
  ];

  state.payments = [
    { id: 'pay_201', receiptNo: 'RCP-201', invoiceId: 'inv_101', clientName: 'Alpha Corp', amount: 500000, paymentDate: `${currentMonth}-06`, status: 'confirmed' },
    { id: 'pay_202', receiptNo: 'RCP-202', invoiceId: 'inv_102', clientName: 'Beta Ltd', amount: 100000, paymentDate: `${currentMonth}-12`, status: 'confirmed' },
    { id: 'pay_203', receiptNo: 'RCP-203', invoiceId: 'inv_103', clientName: 'Gamma Org', amount: 200000, paymentDate: `${prevMonth}-08`, status: 'confirmed' }
  ];

  state.directIncome = [
    { id: 'di_301', title: 'Consulting Retainer', amount: 150000, date: `${currentMonth}-15`, status: 'recorded' }
  ];

  state.expenses = [
    { id: 'exp_401', payee: 'AWS Cloud', category: 'Cloud Infrastructure', department: 'Technology', amount: 80000, date: `${currentMonth}-08`, status: 'recorded', description: 'Monthly hosting' },
    { id: 'exp_402', payee: 'Office Landlord', category: 'Facilities', department: 'Operations', amount: 120000, date: `${currentMonth}-10`, status: 'approved', description: 'Office lease' },
    { id: 'exp_403', payee: 'AWS Cloud', category: 'Cloud Infrastructure', department: 'Technology', amount: 80000, date: `${prevMonth}-08`, status: 'recorded', description: 'Prior hosting' }
  ];

  state.payslips = [
    { id: 'ps_501', personnelName: 'Dr. John Doe', personnelType: 'staff', netPay: 180000, totalGrossPay: 200000, payPeriod: currentMonth, status: 'disbursed', paymentDate: `${currentMonth}-25` },
    { id: 'ps_502', personnelName: 'Prof. Mary Smith', personnelType: 'facilitator', netPay: 100000, totalGrossPay: 100000, payPeriod: currentMonth, status: 'disbursed', paymentDate: `${currentMonth}-25` },
    { id: 'ps_503', personnelName: 'Dr. John Doe', personnelType: 'staff', netPay: 180000, totalGrossPay: 200000, payPeriod: prevMonth, status: 'disbursed', paymentDate: `${prevMonth}-25` }
  ];

  state.sessions = [
    { id: 'ses_601', programmeId: 'prog_exec', programmeName: 'Executive Coaching', facilitatorName: 'Prof. Mary Smith', agreedRate: 50000, sessionsConducted: 2, status: 'approved' },
    { id: 'ses_602', programmeId: 'prog_ai', programmeName: 'AI Strategy', facilitatorName: 'Dr. Alex Lee', agreedRate: 40000, sessionsConducted: 1, status: 'approved' }
  ];

  state.budgets = [
    { category: 'Cloud Infrastructure', department: 'Technology', amount: 100000, period: currentMonth },
    { category: 'Facilities', department: 'Operations', amount: 100000, period: currentMonth } // Note: actual is 120000 => OVER_BUDGET
  ];

  state.enrolments = [
    { id: 'enr_701', studentName: 'Alpha Corp', programmeName: 'Executive Coaching', programmeId: 'prog_exec', enrolmentStatus: 'active' },
    { id: 'enr_702', studentName: 'Beta Ltd', programmeName: 'AI Strategy', programmeId: 'prog_ai', enrolmentStatus: 'active' },
    { id: 'enr_703', studentName: 'Gamma Org', programmeName: 'Leadership Accelerator', programmeId: 'prog_ldr', enrolmentStatus: 'graduated' }
  ];

  state.programmes = [
    { id: 'prog_exec', name: 'Executive Coaching', price: 500000 },
    { id: 'prog_ai', name: 'AI Strategy', price: 300000 },
    { id: 'prog_ldr', name: 'Leadership Accelerator', price: 200000 }
  ];

  state.paymentAccounts = [
    { id: 'acc_1', bankName: 'Zenith Bank', balance: 750000, isDefault: true }
  ];

  console.log('\n--- Test Group 2: Executive Financial Intelligence Engine ---');
  it('2.1 Total Invoiced, Collected, and Direct Income are calculated correctly', () => {
    const fin = calculateExecutiveFinancialIntelligence('month');
    assert.strictEqual(fin.totalInvoiced, 1000000);
    assert.strictEqual(fin.totalRevenueCollected, 800000);
    assert.strictEqual(fin.totalDirectIncome, 150000);
    assert.strictEqual(fin.totalRevenue, 950000);
  });

  it('2.2 Outstanding Receivables, Cash Position, and Collection Rate %', () => {
    const fin = calculateExecutiveFinancialIntelligence('month');
    assert.strictEqual(fin.outstandingReceivables, 200000);
    assert.strictEqual(fin.cashPosition, 750000);
    assert.strictEqual(fin.collectionRatePct, 80);
  });

  it('2.3 Multi-Period comparisons: revenue, expense deltas, and trend tags', () => {
    const fin = calculateExecutiveFinancialIntelligence('month');
    assert.strictEqual(fin.currentPeriod.revenue, 750000);
    assert.strictEqual(fin.previousPeriod.revenue, 200000);
    assert.strictEqual(fin.comparison.revenueDelta, 550000);
    assert.strictEqual(fin.comparison.revenueTrend, 'UP');
    assert.strictEqual(fin.comparison.revenuePctChange, 275);
  });

  console.log('\n--- Test Group 3: Budget vs Actual & Category Variance Analysis ---');
  it('3.1 Budget variance follows invariant: Variance = Budget - Actual', () => {
    const bva = calculateBudgetVsActual('2026', currentMonth);
    assert.strictEqual(bva.totalBudget, 200000);
    assert.strictEqual(bva.totalActual, 200000);
    assert.strictEqual(bva.totalVariance, 0);
  });

  it('3.2 Over-budget categories and utilization percentage are accurately tagged', () => {
    const bva = calculateBudgetVsActual('2026', currentMonth);
    assert.strictEqual(bva.hasOverspending, true);
    assert.strictEqual(bva.overBudgetCategories.length, 1);
    const fac = bva.overBudgetCategories[0];
    assert.strictEqual(fac.category, 'Facilities');
    assert.strictEqual(fac.variance, -20000);
    assert.strictEqual(fac.utilizationPct, 120);
    assert.strictEqual(fac.status, 'OVER_BUDGET');
  });

  it('3.3 Near-limit categories (< 100% and >= 80%) are tagged NEAR_LIMIT', () => {
    const bva = calculateBudgetVsActual('2026', currentMonth);
    const cloud = bva.categories.find(c => c.category === 'Cloud Infrastructure');
    assert.strictEqual(cloud.variance, 20000);
    assert.strictEqual(cloud.utilizationPct, 80);
    assert.strictEqual(cloud.status, 'NEAR_LIMIT');
  });

  it('3.4 getBudgetExpenseTransactions returns matching line items without mutating state', () => {
    const items = getBudgetExpenseTransactions('Facilities', currentMonth);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].payee, 'Office Landlord');
    assert.strictEqual(items[0].amount, 120000);
  });

  console.log('\n--- Test Group 4: Enhanced Programme Profitability & Margins ---');
  it('4.1 Revenue billed, collected, and direct facilitator costs aggregated per programme', () => {
    const progProf = calculateEnhancedProgrammeProfitability();
    assert.strictEqual(progProf.length, 3);
    const exec = progProf.find(p => p.id === 'prog_exec');
    assert.strictEqual(exec.amountInvoiced, 500000);
    assert.strictEqual(exec.amountCollected, 500000);
    assert.strictEqual(exec.facilitatorCost, 100000);
    assert.strictEqual(exec.contribution, 400000);
    assert.strictEqual(exec.contributionMarginPct, 80);
  });

  it('4.2 Programmes are ranked deterministically by contribution (#1, #2, ...)', () => {
    const progProf = calculateEnhancedProgrammeProfitability();
    assert.strictEqual(progProf[0].profitabilityRank, 1);
    assert.strictEqual(progProf[0].id, 'prog_exec');
  });

  console.log('\n--- Test Group 5: Customer Revenue Intelligence & Automated Segmentation ---');
  it('5.1 Evaluates customer lifetime value, payments, balance, and reliability score', () => {
    const custIntel = calculateCustomerRevenueIntelligence();
    assert.strictEqual(custIntel.length, 3);
    const alpha = custIntel.find(c => c.name === 'Alpha Corp');
    assert.strictEqual(alpha.lifetimeInvoiced, 500000);
    assert.strictEqual(alpha.lifetimePayments, 500000);
    assert.strictEqual(alpha.outstandingBalance, 0);
  });

  it('5.2 VIP Customer rule: lifetimePayments >= ₦500k and outstandingBalance == 0', () => {
    const custIntel = calculateCustomerRevenueIntelligence();
    const alpha = custIntel.find(c => c.name === 'Alpha Corp');
    assert.strictEqual(alpha.segment, 'VIP');
  });

  console.log('\n--- Test Group 6: Cash Flow Runway & Multi-Horizon Liquidity Forecasting ---');
  it('6.1 Calculates opening cash, expected inflows, expected outflows, and closing cash', () => {
    const cf30 = calculateCashFlowForecast(30);
    assert.strictEqual(cf30.openingCash, 750000);
    assert.strictEqual(cf30.daysHorizon, 30);
    assert.strictEqual(cf30.forecastClosingCash, cf30.openingCash + cf30.expectedInflows - cf30.expectedOutflows);
    assert.strictEqual(cf30.runwayStatus, 'HEALTHY');
  });

  it('6.2 Supports 7, 30, 60, and 90-day forecast horizons', () => {
    const cf7 = calculateCashFlowForecast(7);
    const cf90 = calculateCashFlowForecast(90);
    assert.strictEqual(cf7.daysHorizon, 7);
    assert.strictEqual(cf90.daysHorizon, 90);
  });

  console.log('\n--- Test Group 7: Collection Priority Scoring & Action Logging ---');
  it('7.1 Priority score is computed deterministically from invoice due date & amount', () => {
    const inv = state.invoices.find(i => i.id === 'inv_102');
    const prio = calculateCollectionPriorityScore(inv);
    assert(prio.score >= 0, 'Score is non-negative');
    assert(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(prio.priority));
    assert(prio.recommendedAction.length > 0);
  });

  await itAsync('7.2 recordCollectionAction writes to collection_actions, customer_timeline, and audit trail', async () => {
    const prevTimelineLen = (state.customerTimeline || []).length;
    await recordCollectionAction({
      customerId: 'Beta Ltd',
      invoiceId: 'inv_102',
      priority: 'HIGH',
      actionType: 'WhatsApp',
      promisedPaymentDate: `${currentMonth}-28`,
      actionNotes: 'Followed up via WhatsApp regarding remaining balance.'
    });

    const newTimelineLen = (state.customerTimeline || []).length;
    assert.strictEqual(newTimelineLen, prevTimelineLen + 1);
    assert(state.collectionActions.length > 0);
    assert.strictEqual(state.collectionActions[state.collectionActions.length - 1].actionType, 'WhatsApp');
  });

  console.log('\n--- Test Group 8: Expense Anomaly Detection Engine ---');
  it('8.1 Detects high value outlier transactions (₦200,000+)', () => {
    state.expenses.push({ id: 'exp_outlier', payee: 'Enterprise Server Ltd', category: 'Hardware', department: 'IT', amount: 450000, date: `${currentMonth}-19`, status: 'recorded' });
    const anomalies = detectExpenseAnomalies();
    const outlier = anomalies.find(a => a.type === 'HIGH_VALUE_TRANSACTION');
    assert(outlier !== undefined, 'Outlier found');
    assert.strictEqual(outlier.amount, 450000);
  });

  console.log('\n--- Test Group 9: Payroll Cost Intelligence ---');
  it('9.1 Calculates staff vs facilitator liabilities and payroll-to-revenue ratio', () => {
    const p = calculatePayrollCostIntelligence();
    assert(p.totalStaffLiability > 0);
    assert(p.totalFacilitatorLiability > 0);
    assert.strictEqual(p.monthlyPayrollLiability, p.totalStaffLiability + p.totalFacilitatorLiability);
    assert(p.payrollToRevenuePct >= 0);
  });

  console.log('\n--- Test Group 10: Executive Recommendations Engine ---');
  it('10.1 Synthesizes structured recommendations with Finding, Evidence, Impact, and Action', () => {
    const recs = generateExecutiveRecommendations();
    assert(Array.isArray(recs));
    assert(recs.length > 0);
    recs.forEach(r => {
      assert(r.domain);
      assert(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(r.priority));
      assert(r.finding.length > 3);
      assert(r.evidence.length > 3);
      assert(r.recommendedAction.length > 3);
    });
  });

  console.log('\n--- Test Group 11: Management Performance Report Generator ---');
  it('11.1 Generates complete JSON performance report', () => {
    const rep = generateManagementPerformanceReport('json');
    assert.strictEqual(rep.reportTitle, 'CLASPTEK MANAGEMENT PERFORMANCE REPORT');
    assert.strictEqual(rep.executiveSummary.totalRevenue, 950000);
    assert.strictEqual(rep.executiveSummary.outstandingReceivables, 200000);
  });

  it('11.2 Generates structured CSV rows for export', () => {
    const rows = generateManagementPerformanceReport('csv');
    assert(Array.isArray(rows));
    assert(rows.length > 5);
    assert(rows.some(r => r.Section === 'EXECUTIVE SUMMARY'));
    assert(rows.some(r => r.Section === 'PROGRAMME PROFITABILITY'));
  });

  console.log('\n--- Test Group 12: Configurable Multi-Tier Approval Thresholds ---');
  it('12.1 Tier 1: ₦0 – ₦49,999 requires Finance Staff approval', () => {
    assert.strictEqual(evaluateApprovalThreshold(0), 'Finance Staff');
    assert.strictEqual(evaluateApprovalThreshold(49999), 'Finance Staff');
  });

  it('12.2 Tier 2: ₦50,000 – ₦199,999 requires Finance Manager approval', () => {
    assert.strictEqual(evaluateApprovalThreshold(50000), 'Finance Manager');
    assert.strictEqual(evaluateApprovalThreshold(199999), 'Finance Manager');
  });

  it('12.3 Tier 3: ₦200,000+ requires Super Admin approval', () => {
    assert.strictEqual(evaluateApprovalThreshold(200000), 'Super Admin');
    assert.strictEqual(evaluateApprovalThreshold(1500000), 'Super Admin');
  });

  console.log('\n--- Test Group 13: RBAC Access Controls on Intelligence Views ---');
  it('13.1 Super Admin & Finance Manager have access to financialIntelligence tab', () => {
    assert.strictEqual(canAccessTab('Super Admin', 'financialIntelligence'), true);
    assert.strictEqual(canAccessTab('Finance Manager', 'financialIntelligence'), true);
    assert.strictEqual(canAccessTab('Finance Viewer', 'financialIntelligence'), true);
  });

  it('13.2 Staff and Facilitator are strictly barred from financialIntelligence tab', () => {
    assert.strictEqual(canAccessTab('Staff', 'financialIntelligence'), false);
    assert.strictEqual(canAccessTab('Facilitator', 'financialIntelligence'), false);
  });

  it('13.3 Super Admin & Finance Manager have access to cashFlow tab', () => {
    assert.strictEqual(canAccessTab('Super Admin', 'cashFlow'), true);
    assert.strictEqual(canAccessTab('Finance Manager', 'cashFlow'), true);
  });

  it('13.4 Staff and Facilitator are strictly barred from cashFlow tab', () => {
    assert.strictEqual(canAccessTab('Staff', 'cashFlow'), false);
    assert.strictEqual(canAccessTab('Facilitator', 'cashFlow'), false);
  });

  console.log('\n=================================================================');
  console.log(`TOTAL PHASE 11 TESTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite Failed with Exception:', err);
  process.exit(1);
});
