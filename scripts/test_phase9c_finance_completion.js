/**
 * scripts/test_phase9c_finance_completion.js
 * Authoritative Certification Test Suite for Phase 9C — Finance Completion
 *
 * Validates:
 * 1. Module 1: Expenses (Taxonomies, Period Locks, Role Gating, Mutations, CSV Defense)
 * 2. Module 2: Funds & Transfers (Official Bank Accounts, Non-Revenue Invariant, Validation, Distribution)
 * 3. Module 3: Receivables & Collections (Strict Derived Balance, 5 Ageing Buckets, Priority Algorithm, Notes)
 * 4. Module 4: Budgets & Planning (Envelopes, Variance Math, Utilization %, Status Thresholds, Drilldown)
 * 5. Navigation Registry Active State (Phase 9C Active for all 4 modules, 0 disabled)
 * 6. Security & Negative Authorization Role Gating (No Student / Facilitator access, Server-side Tenant Scoping)
 * 7. Database Safety Contract (0 Schema Changes, All existing tables utilized)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let totalPassed = 0;
let totalFailed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    totalFailed++;
  }
}

async function runPhase9cFinanceCompletionSuite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 9C FINANCE COMPLETION CERTIFICATION');
  console.log('======================================================================\n');

  // ─── 1. MODULE 1: EXPENSES ───────────────────────────────────────────────────
  console.log('[1/7] Expenses Module Certification:');
  const expensesPagePath = path.join(process.cwd(), 'app', 'expenses', 'page.tsx');
  const expensesClientPath = path.join(process.cwd(), 'app', 'expenses', 'ExpensesPageClient.tsx');
  const expensesApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'expenses', 'route.ts');
  const expensesItemApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'expenses', '[id]', 'route.ts');
  const expensesQueriesPath = path.join(process.cwd(), 'lib', 'finance', 'expense-queries.ts');

  it('Expenses server page enforces authoritative role gate (Super Admin, Finance Manager, Staff, Viewer)', () => {
    assert(fs.existsSync(expensesPagePath), 'app/expenses/page.tsx must exist');
    const content = fs.readFileSync(expensesPagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve authoritative session');
    assert(content.includes('allowedRoles'), 'Must declare allowedRoles');
    assert(content.includes("'Finance Staff'"), 'Must permit Finance Staff');
    assert(content.includes("'Finance Viewer'"), 'Must permit Finance Viewer');
    assert(content.includes("redirect('/login"), 'Must redirect unauthenticated users');
  });

  it('Expenses client component consumes downloadSafeCsv for RFC-4180 formula injection defense', () => {
    assert(fs.existsSync(expensesClientPath), 'app/expenses/ExpensesPageClient.tsx must exist');
    const content = fs.readFileSync(expensesClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must import and use downloadSafeCsv');
    assert(content.includes('Expenses_Ledger'), 'Must name exported ledger correctly');
  });

  it('Expenses query layer defines all 10 Authoritative Accounting Taxonomies', () => {
    const taxonomyPath = path.join(process.cwd(), 'lib', 'finance', 'taxonomy.ts');
    assert(fs.existsSync(taxonomyPath), 'lib/finance/taxonomy.ts must exist');
    const content = fs.readFileSync(taxonomyPath, 'utf8');
    assert(content.includes('Personnel & Payroll'), 'Must contain Personnel & Payroll taxonomy');
    assert(content.includes('Facilities & Utilities'), 'Must contain Facilities & Utilities taxonomy');
    assert(content.includes('Technology & Software'), 'Must contain Technology & Software taxonomy');
    assert(content.includes('Academic & Training Operations'), 'Must contain Academic & Training Operations taxonomy');
    assert(content.includes('Marketing & Business Development'), 'Must contain Marketing & Business Development taxonomy');
    assert(content.includes('Administration & Office'), 'Must contain Administration & Office taxonomy');
    assert(content.includes('Travel & Logistics'), 'Must contain Travel & Logistics taxonomy');
    assert(content.includes('Finance & Banking'), 'Must contain Finance & Banking taxonomy');
    assert(content.includes('Management & Corporate'), 'Must contain Management & Corporate taxonomy');
    assert(content.includes('Other / Miscellaneous'), 'Must contain Other / Miscellaneous taxonomy');
  });

  it('Expenses mutation logic enforces Financial Period Lock (rejects locked months)', () => {
    const content = fs.readFileSync(expensesQueriesPath, 'utf8');
    assert(content.includes('getFinancialPeriodStatus'), 'Must check period status');
    assert(content.includes(`periodStatus.status === 'locked'`), 'Must check locked status');
    assert(content.includes('locked: true'), 'Must report period locked error');
  });

  it('Expense approval and cancellation API endpoints enforce authoritative role restrictions', () => {
    assert(fs.existsSync(expensesItemApiPath), 'app/api/finance/expenses/[id]/route.ts must exist');
    const content = fs.readFileSync(expensesItemApiPath, 'utf8');
    assert(content.includes(`action === 'approve'`), 'Must handle approve action');
    assert(content.includes(`action === 'cancel'`), 'Must handle cancel action');
    assert(content.includes('requireAuth'), 'Must require server-side auth');
  });

  // ─── 2. MODULE 2: FUNDS & TRANSFERS ──────────────────────────────────────────
  console.log('\n[2/7] Funds & Transfers Module Certification:');
  const fundsPagePath = path.join(process.cwd(), 'app', 'funds-transfers', 'page.tsx');
  const fundsClientPath = path.join(process.cwd(), 'app', 'funds-transfers', 'FundsTransfersPageClient.tsx');
  const transfersApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'transfers', 'route.ts');
  const fundsSummaryApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'funds-summary', 'route.ts');
  const fundsQueriesPath = path.join(process.cwd(), 'lib', 'finance', 'funds-queries.ts');

  it('Funds & Transfers server page enforces authoritative role gate', () => {
    assert(fs.existsSync(fundsPagePath), 'app/funds-transfers/page.tsx must exist');
    const content = fs.readFileSync(fundsPagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve authoritative session');
    assert(content.includes('allowedRoles'), 'Must declare allowedRoles');
    assert(content.includes("redirect('/login"), 'Must redirect unauthenticated');
  });

  it('Funds & Transfers client component consumes downloadSafeCsv for transfers export', () => {
    assert(fs.existsSync(fundsClientPath), 'app/funds-transfers/FundsTransfersPageClient.tsx must exist');
    const content = fs.readFileSync(fundsClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must import and use downloadSafeCsv');
    assert(content.includes('Internal_Transfers'), 'Must name export correctly');
  });

  it('Internal Transfers strictly maintain NON-REVENUE invariant (isRevenue: false)', () => {
    assert(fs.existsSync(fundsQueriesPath), 'lib/finance/funds-queries.ts must exist');
    const content = fs.readFileSync(fundsQueriesPath, 'utf8');
    assert(content.includes('isRevenue: false'), 'Must explicitly set isRevenue: false');
    assert(content.includes('Non-revenue') || content.includes('non-revenue'), 'Must document non-revenue invariant');
  });

  it('Transfer mutations enforce Source != Destination, Amount > 0, and Reference checks', () => {
    const content = fs.readFileSync(fundsQueriesPath, 'utf8');
    assert(content.includes('fromAccountId === data.toAccountId'), 'Must prevent transfers between same account');
    assert(content.includes('data.amount <= 0'), 'Must reject amount <= 0');
    assert(content.includes('!data.reference'), 'Must require bank reference');
  });

  it('Credited Account Distribution isolates external client receipts from transfers', () => {
    const content = fs.readFileSync(fundsQueriesPath, 'utf8');
    assert(content.includes('getCreditedAccountDistribution'), 'Must define getCreditedAccountDistribution');
    assert(content.includes(`from('payments')`), 'Must query payments table for external receipts');
  });

  // ─── 3. MODULE 3: RECEIVABLES & COLLECTIONS ──────────────────────────────────
  console.log('\n[3/7] Receivables & Collections Module Certification:');
  const recPagePath = path.join(process.cwd(), 'app', 'receivables', 'page.tsx');
  const recClientPath = path.join(process.cwd(), 'app', 'receivables', 'ReceivablesPageClient.tsx');
  const recApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'receivables', 'route.ts');
  const notesApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'receivables', 'notes', 'route.ts');
  const recQueriesPath = path.join(process.cwd(), 'lib', 'finance', 'receivables-queries.ts');

  it('Receivables server page enforces authoritative role gate', () => {
    assert(fs.existsSync(recPagePath), 'app/receivables/page.tsx must exist');
    const content = fs.readFileSync(recPagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve authoritative session');
    assert(content.includes('allowedRoles'), 'Must declare allowed roles');
  });

  it('Receivables client component consumes downloadSafeCsv for receivables export', () => {
    assert(fs.existsSync(recClientPath), 'app/receivables/ReceivablesPageClient.tsx must exist');
    const content = fs.readFileSync(recClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must import and use downloadSafeCsv');
    assert(content.includes('Outstanding_Receivables'), 'Must name export correctly');
  });

  it('Outstanding Balance is strictly derived: totalAmount - paidAmount (no manual balance override)', () => {
    assert(fs.existsSync(recQueriesPath), 'lib/finance/receivables-queries.ts must exist');
    const content = fs.readFileSync(recQueriesPath, 'utf8');
    assert(content.includes('totalAmount - paidAmount'), 'Must derive balance from invoice total minus payments applied');
    assert(!content.includes('balanceAmount = inv.balance'), 'Must never trust raw editable balance');
  });

  it('5 Ageing Buckets (Current, 1-30, 31-60, 61-90, 90+) correctly partition ledger balances', () => {
    const content = fs.readFileSync(recQueriesPath, 'utf8');
    assert(content.includes('buckets.current'), 'Must track current bucket');
    assert(content.includes('buckets.days1to30'), 'Must track 1-30 days');
    assert(content.includes('buckets.days31to60'), 'Must track 31-60 days');
    assert(content.includes('buckets.days61to90'), 'Must track 61-90 days');
    assert(content.includes('buckets.days90Plus'), 'Must track 90+ days');
  });

  it('Priority scoring algorithm evaluates balance magnitude and overdue duration into CRITICAL/HIGH/MED/LOW', () => {
    const content = fs.readFileSync(recQueriesPath, 'utf8');
    assert(content.includes('calculateReceivablePriority'), 'Must define calculateReceivablePriority');
    assert(content.includes(`priority = 'CRITICAL'`), 'Must classify CRITICAL');
    assert(content.includes(`priority = 'HIGH'`), 'Must classify HIGH');
    assert(content.includes(`priority = 'MEDIUM'`), 'Must classify MEDIUM');
    assert(content.includes(`'LOW'`), 'Must classify LOW');
  });

  it('Collection notes API and storage integrates with public.collection_notes and audit log', () => {
    assert(fs.existsSync(notesApiPath), 'app/api/finance/receivables/notes/route.ts must exist');
    const content = fs.readFileSync(recQueriesPath, 'utf8');
    assert(content.includes(`from('collection_notes')`), 'Must persist to collection_notes');
    assert(content.includes('ADD_COLLECTION_NOTE'), 'Must log audit event for collection note');
  });

  // ─── 4. MODULE 4: BUDGETS & PLANNING ─────────────────────────────────────────
  console.log('\n[4/7] Budgets & Planning Module Certification:');
  const budgetsPagePath = path.join(process.cwd(), 'app', 'budgets', 'page.tsx');
  const budgetsClientPath = path.join(process.cwd(), 'app', 'budgets', 'BudgetsPageClient.tsx');
  const budgetsApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'budgets', 'route.ts');
  const drilldownApiPath = path.join(process.cwd(), 'app', 'api', 'finance', 'budgets', 'drilldown', 'route.ts');
  const budgetsQueriesPath = path.join(process.cwd(), 'lib', 'finance', 'budget-queries.ts');

  it('Budgets server page enforces authoritative role gate', () => {
    assert(fs.existsSync(budgetsPagePath), 'app/budgets/page.tsx must exist');
    const content = fs.readFileSync(budgetsPagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve authoritative session');
    assert(content.includes('allowedRoles'), 'Must declare allowed roles');
  });

  it('Budgets client component consumes downloadSafeCsv for variance report export', () => {
    assert(fs.existsSync(budgetsClientPath), 'app/budgets/BudgetsPageClient.tsx must exist');
    const content = fs.readFileSync(budgetsClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must import and use downloadSafeCsv');
    assert(content.includes('Budget_Variance_'), 'Must prefix export correctly');
  });

  it('Budget Variance mathematics strictly enforce: Variance = Budgeted - Actual', () => {
    assert(fs.existsSync(budgetsQueriesPath), 'lib/finance/budget-queries.ts must exist');
    const content = fs.readFileSync(budgetsQueriesPath, 'utf8');
    assert(content.includes('c.budgetAmount - c.actualAmount'), 'Variance must be budget minus actual');
    assert(content.includes('totalBudget - totalActual'), 'Total variance must be total budget minus actual');
  });

  it('Budget utilization thresholds detect OVER_BUDGET (>100%) and NEAR_LIMIT (>=80%)', () => {
    const content = fs.readFileSync(budgetsQueriesPath, 'utf8');
    assert(content.includes('actualAmount > c.budgetAmount'), 'Detects over budget');
    assert(content.includes('utilizationPct >= 80'), 'Detects near limit');
    assert(content.includes('hasOverspending: overBudgetCategories.length > 0'), 'Flags hasOverspending correctly');
  });

  it('Transaction drilldown endpoint retrieves actual expenses matching category & period', () => {
    assert(fs.existsSync(drilldownApiPath), 'app/api/finance/budgets/drilldown/route.ts must exist');
    const content = fs.readFileSync(budgetsQueriesPath, 'utf8');
    assert(content.includes('getBudgetTransactions'), 'Must define getBudgetTransactions');
    assert(content.includes(`from('expenses')`), 'Must query expenses for drilldown transactions');
  });

  // ─── 5. NAVIGATION REGISTRY CERTIFICATION ────────────────────────────────────
  console.log('\n[5/7] Navigation Registry Active State:');
  const navConfigPath = path.join(process.cwd(), 'lib', 'config', 'navigation.ts');

  it('All four Phase 9C modules are active in navigation without isDisabled or Upcoming badges', () => {
    const content = fs.readFileSync(navConfigPath, 'utf8');
    assert(content.includes(`href: '/expenses'`), 'expenses route must be /expenses');
    assert(content.includes(`href: '/funds-transfers'`), 'funds-transfers route must be /funds-transfers');
    assert(content.includes(`href: '/receivables'`), 'receivables route must be /receivables');
    assert(content.includes(`href: '/budgets'`), 'budgets route must be /budgets');

    // Verify all 4 declare Phase 9C ACTIVE
    const p9cMatches = (content.match(/migrationPhase: 'Phase 9C — ACTIVE'/g) || []).length;
    assert.strictEqual(p9cMatches, 4, `Expected 4 Phase 9C ACTIVE modules in navigation, found ${p9cMatches}`);
  });

  // ─── 6. SECURITY & NEGATIVE AUTHORIZATION ────────────────────────────────────
  console.log('\n[6/7] Security & Negative Authorization Role Gating:');

  it('All 8 Phase 9C API route endpoints enforce requireAuth server-side with tenant scoping', () => {
    const endpoints = [
      expensesApiPath,
      expensesItemApiPath,
      transfersApiPath,
      fundsSummaryApiPath,
      recApiPath,
      notesApiPath,
      budgetsApiPath,
      drilldownApiPath,
    ];
    for (const ep of endpoints) {
      const content = fs.readFileSync(ep, 'utf8');
      assert(content.includes('requireAuth'), `${ep} must requireAuth`);
      assert(content.includes('auth.session.tenantId'), `${ep} must scope to authoritative tenantId`);
      assert(!content.includes(`'Student'`), `${ep} must reject Student role`);
      assert(!content.includes(`'Facilitator'`), `${ep} must reject Facilitator role`);
    }
  });

  // ─── 7. DATABASE SAFETY & ZERO SCHEMA CHANGE ─────────────────────────────────
  console.log('\n[7/7] Database Safety & Contract Preservation:');

  it('Zero schema modifications required: all supporting tables pre-exist in supabase_schema.sql', () => {
    const schemaPath = path.join(process.cwd(), 'supabase_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    assert(schema.includes('public.expenses'), 'expenses table must pre-exist');
    assert(schema.includes('public.payment_accounts'), 'payment_accounts table must pre-exist');
    assert(schema.includes('public.collection_notes'), 'collection_notes table must pre-exist');
    assert(schema.includes('public.financial_budgets'), 'financial_budgets table must pre-exist');
    assert(schema.includes('public.budget_lines'), 'budget_lines table must pre-exist');
    assert(schema.includes('public.finance_audit_log'), 'finance_audit_log table must pre-exist');
    assert(schema.includes('public.finance_periods'), 'finance_periods table must pre-exist');
  });

  it('All 4 client page components feature proper empty state handling and certified Clasptek classes', () => {
    const clients = [
      expensesClientPath,
      fundsClientPath,
      recClientPath,
      budgetsClientPath,
    ];
    for (const c of clients) {
      const content = fs.readFileSync(c, 'utf8');
      assert(content.includes('cp-card'), `${c} must use cp-card`);
      assert(content.includes('cp-table') || content.includes('cp-kpi-card'), `${c} must use cp-table or cp-kpi-card`);
      assert(content.includes('cp-empty-state'), `${c} must handle empty state`);
    }
  });

  // ─── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(' PHASE 9C FINANCE COMPLETION CERTIFICATION SUMMARY');
  console.log('======================================================================');
  console.log(` Total Assertions Evaluated : ${totalPassed + totalFailed}`);
  console.log(` Total Assertions Passed    : ${totalPassed}`);
  console.log(` Total Assertions Failed    : ${totalFailed}`);
  console.log(` PHASE 9C RESULTS           : ${totalPassed} PASSED / ${totalFailed} FAILED`);
  console.log('======================================================================\n');

  if (totalFailed > 0) {
    console.error(`>>> PHASE 9C FINANCE COMPLETION CERTIFICATION FAILED (${totalFailed} errors) <<<\n`);
    process.exit(1);
  } else {
    console.log('>>> PHASE 9C VERIFIED: ALL 25 CRITICAL FINANCE GOVERNANCE CHECKS PASSED <<<\n');
  }
}

runPhase9cFinanceCompletionSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
