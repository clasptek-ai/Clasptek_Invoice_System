/**
 * CLASPTEK 27-ENTITY SCHEMA-TO-TRANSFORMER COMPREHENSIVE AUDIT
 * Strictly read-only analysis of transformer output vs PostgreSQL schema.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const inv = JSON.parse(fs.readFileSync('schema_inventory.json', 'utf8'));
const tables = inv.allTables || {};

const html = fs.readFileSync('clasptek_invoice_system.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

const sandbox = {
  window: { addEventListener: () => {}, location: { reload: () => {} }, __CLASPTEK_ENV__: {} },
  document: { getElementById: () => ({ addEventListener: () => {} }), querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  module: { exports: {} },
  exports: {},
  console: { log: () => {}, warn: () => {}, error: () => {} },
  setTimeout: () => {},
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {}
};

vm.runInNewContext(scriptMatch[1], sandbox);
const app = sandbox.module.exports;
const transform = app.transformEntityForPostgres;

// 27 entities from migrationSequence
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

console.log('Auditing all ' + sequence.length + ' entities...\n');

// Sample objects representing typical local data
const sampleData = {
  finance_settings: app.DEFAULT_FINANCE_SETTINGS || {
    companyName: 'Clasptek', tradingName: 'Clasptek', address: 'Lagos', phone: '123', email: 'a@c.com',
    website: 'https://c.org', taxId: 'TIN-1', registrationNumber: 'RC-1', defaultTerms: 'Terms', invoiceFooter: 'Footer'
  },
  payment_accounts: (app.DEFAULT_PAYMENT_ACCOUNTS && app.DEFAULT_PAYMENT_ACCOUNTS[0]) || {
    id: 'acc_1', accountName: 'Clasptek', bankName: 'GTB', accountNumber: '0123456789', accountType: 'Corporate Current',
    currency: 'NGN', instructions: 'Notes', isActive: true, isDefault: true
  },
  programmes: {
    id: 'prog_1', name: 'Software', code: 'SW', category: 'Tech', duration_weeks: 12,
    tuitionFee: 150000, maxDiscountPct: 10, allowInstallments: true, installmentFirstPct: 60, installmentSecondPct: 40
  },
  personnel: {
    id: 'pers_1', employeeNo: 'EMP-001', employeeType: 'Full-Time', employmentStatus: 'active',
    firstName: 'A', lastName: 'B', fullName: 'A B', email: 'a@b.com', basicPay: 200000, bankDetails: 'GTB'
  },
  customers: {
    id: 'cust_1', name: 'Cust 1', email: 'c@c.com', phone: '123', address: 'Lagos', total_invoiced: 100, total_paid: 100
  },
  enquiries: {
    id: 'enq_1', enquiryNo: 'ENQ-01', customerId: 'cust_1', programmeId: 'prog_1', student_name: 'S', email: 's@s.com'
  },
  enrolments: {
    id: 'enr_1', enrolmentNo: 'ENR-01', customerId: 'cust_1', programmeId: 'prog_1', student_name: 'S', cohort: 'C1'
  },
  invoices: {
    id: 'inv_1', invoiceNo: 'INV-01', customerId: 'cust_1', issueDate: '2026-09-01', dueDate: '2026-09-15',
    subTotal: 100000, taxAmount: 7500, discountAmount: 0, programmeId: 'prog_1', total_amount: 107500
  },
  invoice_items: {
    id: 'item_1', invoiceId: 'inv_1', unitPrice: 100000, totalPrice: 100000, programmeId: 'prog_1', quantity: 1, item_description: 'Desc'
  },
  payments: {
    id: 'pay_1', paymentNo: 'PAY-01', receiptNo: 'REC-01', invoiceId: 'inv_1', customerId: 'cust_1', paymentDate: '2026-09-02', paymentMethod: 'Bank Transfer', amount: 107500
  },
  receipts: {
    id: 'rec_1', receiptNo: 'REC-01', paymentId: 'pay_1', invoiceId: 'inv_1', receiptDate: '2026-09-02', amount: 107500
  },
  expenses: {
    id: 'exp_1', expenseNo: 'EXP-01', expenseDate: '2026-09-02', subCategory: 'Office', category_group: 'Admin', paymentMethod: 'Transfer', approvedBy: 'Admin', approvedAt: '2026-09-02', amount: 5000
  },
  direct_income: {
    id: 'inc_1', incomeNo: 'INC-01', incomeDate: '2026-09-02', incomeCategory: 'Consulting', amount: 50000
  },
  budgets: {
    id: 'bud_1', budgetPeriod: '2026-09', period: '2026-09', category_group: 'Operations', allocatedAmount: 1000000, budget_amount: 1000000
  },
  budget_lines: {
    id: 'bl_1', budgetId: 'bud_1', allocatedAmount: 500000, category: 'Ops', month_key: '2026-09', budget_amount: 500000
  },
  payslips: {
    id: 'ps_1', payslipNo: 'PSL-01', personnelId: 'pers_1', payrollPeriod: '2026-09', pay_period: '2026-09', grossPay: 200000, basicSalary: 150000, totalAllowances: 50000, totalDeductions: 10000, netPay: 190000
  },
  facilitator_sessions: {
    id: 'sess_1', sessionNo: 'SES-01', personnelId: 'pers_1', programmeId: 'prog_1', sessionDate: '2026-09-02', sessionHours: 2, hourlyRate: 15000, totalEarnings: 30000
  },
  customer_timeline: {
    id: 'tl_1', customerId: 'cust_1', activityType: 'Call', eventDate: '2026-09-02', title: 'Follow-up'
  },
  collection_actions: {
    id: 'ca_1', invoiceId: 'inv_1', customerId: 'cust_1', actionType: 'Email Reminder', actionDate: '2026-09-02'
  },
  finance_audit_log: {
    id: 'aud_1', entityType: 'invoice', entityId: 'inv_1', previousValue: '{}', newValue: '{\"status\":\"paid\"}', performedBy: 'usr_admin', performedAt: '2026-09-02'
  },
  management_alerts: {
    id: 'alt_1', alertType: 'Budget Exceeded', alertTitle: 'Alert', alertMessage: 'Warning', isResolved: false
  },
  approval_thresholds: {
    id: 'th_1', thresholdAmount: 500000, requireSuperAdmin: true
  },
  financial_adjustments: {
    id: 'adj_1', adjustmentNo: 'ADJ-01', adjustmentType: 'Credit Note', invoiceId: 'inv_1', amount: 5000
  },
  report_snapshots: {
    id: 'snap_1', reportType: 'PnL', report_type: 'PnL', reportTitle: 'PnL Snapshot', financialPeriod: '2026-Q3'
  },
  management_metrics: {
    id: 'met_1', metricPeriod: '2026-09', totalRevenue: 5000000, operatingExpenses: 2000000
  },
  cash_flow_forecasts: {
    id: 'cff_1', forecastDate: '2026-09-01', horizonDays: 30, openingCash: 10000000
  },
  customer_segments: {
    id: 'cs_1', customerId: 'cust_1', segment: 'VIP', lifetimeValue: 500000
  }
};

const tenantUuid = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
const auditResults = [];

for (const s of sequence) {
  const tableDef = tables[s.table];
  if (!tableDef) {
    auditResults.push({ entity: s.entity, table: s.table, status: 'TABLE_NOT_FOUND', issues: ['Table ' + s.table + ' not found in schema inventory'] });
    continue;
  }

  const validCols = new Set((tableDef.columns || []).map(c => c.name));
  const rawItem = sampleData[s.entity] || { id: 'test_1' };
  const transformed = transform(s.entity, rawItem, tenantUuid);

  const unexpectedCols = [];
  const camelCaseCols = [];

  for (const k of Object.keys(transformed)) {
    // Check if column exists in table
    if (!validCols.has(k)) {
      unexpectedCols.push(k);
    }
    // Check if key has camelCase
    if (/[A-Z]/.test(k)) {
      camelCaseCols.push(k);
    }
  }

  const hasIssues = unexpectedCols.length > 0 || camelCaseCols.length > 0;
  auditResults.push({
    entity: s.entity,
    table: s.table,
    status: hasIssues ? 'FAIL' : 'PASS',
    unexpectedCols,
    camelCaseCols
  });
}

console.log('=== AUDIT RESULTS ===');
auditResults.forEach(r => {
  if (r.status === 'FAIL') {
    console.log(`❌ ${r.entity} -> ${r.table}:`);
    if (r.unexpectedCols.length) console.log(`   Unexpected columns (not in DB): ${r.unexpectedCols.join(', ')}`);
    if (r.camelCaseCols.length) console.log(`   CamelCase keys left: ${r.camelCaseCols.join(', ')}`);
  } else {
    console.log(`✔ ${r.entity} -> ${r.table}: PASS`);
  }
});
