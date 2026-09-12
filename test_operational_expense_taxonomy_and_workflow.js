/**
 * test_operational_expense_taxonomy_and_workflow.js
 * 
 * Production Certification Test Suite for CLASPTEK Operational Expense Taxonomy & Workflow
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`  ✔ PASS: ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✖ FAIL: ${message}`);
  }
}

console.log('\n============================================================');
console.log('CLASPTEK OPERATIONAL EXPENSE TAXONOMY & WORKFLOW CERTIFICATION');
console.log('Timestamp: ' + new Date().toISOString());
console.log('============================================================\n');

// Mock browser environment
const localStorageStore = {};
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
  getElementById: () => ({ value: '', addEventListener: () => {}, querySelector: () => ({ value: '' }), innerHTML: '', style: {} }),
  querySelectorAll: () => [],
  createElement: () => ({ setAttribute: () => {}, click: () => {}, addEventListener: () => {}, appendChild: () => {}, querySelector: () => ({ addEventListener: () => {} }), style: {} }),
  body: { appendChild: () => {}, removeChild: () => {}, classList: { add: () => {}, remove: () => {} } }
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

// Load application script from clasptek_invoice_system.html
const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

if (!scriptMatch) {
  console.error('FAILED: Could not find <script> block in clasptek_invoice_system.html');
  process.exit(1);
}

// Execute application code within node context
try {
  eval(scriptMatch[1]);
} catch (e) {
  console.error('Error evaluating clasptek_invoice_system.html script:', e);
  process.exit(1);
}

const app = global.window;

// ------------------------------------------------------------
// TEST SUITE 1: 10 Authoritative Expense Groups & Categories
// ------------------------------------------------------------
console.log('--- SUITE 1: Authoritative Accounting Taxonomy Structure ---');
const taxonomy = app.AUTHORITATIVE_EXPENSE_TAXONOMY;
assert(taxonomy && typeof taxonomy === 'object', 'AUTHORITATIVE_EXPENSE_TAXONOMY is defined and accessible');

const groups = app.getAuthoritativeExpenseGroups ? app.getAuthoritativeExpenseGroups() : [];
assert(Array.isArray(groups) && groups.length === 10, `Exactly 10 authoritative expense groups exist (got ${groups.length})`);

const expectedGroups = [
  'Personnel & Payroll',
  'Facilities & Utilities',
  'Technology & Software',
  'Academic & Training Operations',
  'Marketing & Business Development',
  'Administration & Office',
  'Travel & Logistics',
  'Finance & Banking',
  'Management & Corporate',
  'Other / Miscellaneous'
];

expectedGroups.forEach(grp => {
  assert(groups.includes(grp), `Expense group "${grp}" is present in taxonomy`);
  const cats = app.getAuthoritativeExpenseCategories(grp);
  assert(Array.isArray(cats) && cats.length > 0, `Group "${grp}" has ${cats.length} non-empty dependent categories`);
});

// Verify distinct categories
const allCategories = [];
groups.forEach(g => {
  taxonomy[g].forEach(c => allCategories.push({ group: g, category: c }));
});
assert(allCategories.length >= 40, `Taxonomy includes comprehensive accounting coverage (${allCategories.length} categories defined)`);

// ------------------------------------------------------------
// TEST SUITE 2: Classification Validation & Hierarchy Rules
// ------------------------------------------------------------
console.log('\n--- SUITE 2: Classification Validation & Hierarchy Integrity ---');
assert(app.isValidExpenseClassification('Personnel & Payroll', 'Salaries'), 'Valid pair: Personnel & Payroll -> Salaries');
assert(app.isValidExpenseClassification('Technology & Software', 'Cloud Services'), 'Valid pair: Technology & Software -> Cloud Services');
assert(app.isValidExpenseClassification('Academic & Training Operations', 'Training Materials'), 'Valid pair: Academic & Training Operations -> Training Materials');
assert(!app.isValidExpenseClassification('Personnel & Payroll', 'Cloud Services'), 'Rejects cross-group mismatch (Personnel & Payroll cannot have Cloud Services)');
assert(!app.isValidExpenseClassification('Unknown Group', 'Salaries'), 'Rejects nonexistent expense group');
assert(!app.isValidExpenseClassification('Personnel & Payroll', 'Nonexistent Category'), 'Rejects nonexistent category');

// ------------------------------------------------------------
// TEST SUITE 3: Comprehensive Expense Record Validation
// ------------------------------------------------------------
console.log('\n--- SUITE 3: Expense Record Business Logic Validation ---');
const validRecord = {
  categoryGroup: 'Technology & Software',
  category: 'Cloud Services',
  description: 'AWS Production Infrastructure monthly billing',
  amount: 175000,
  date: '2026-09-12',
  department: 'Technology',
  paymentMethod: 'Bank Transfer',
  reference: 'AWS-INV-202609'
};

const valSuccess = app.validateExpenseRecord(validRecord);
assert(valSuccess.valid === true, 'Valid expense record passes validation');

const missingDesc = { ...validRecord, description: '' };
assert(app.validateExpenseRecord(missingDesc).valid === false, 'Rejects empty description');

const zeroAmount = { ...validRecord, amount: 0 };
assert(app.validateExpenseRecord(zeroAmount).valid === false, 'Rejects zero amount');

const negAmount = { ...validRecord, amount: -5000 };
assert(app.validateExpenseRecord(negAmount).valid === false, 'Rejects negative amount');

const badDate = { ...validRecord, date: 'not-a-date' };
assert(app.validateExpenseRecord(badDate).valid === false, 'Rejects malformed date');

const badGroup = { ...validRecord, categoryGroup: 'Invalid Group' };
assert(app.validateExpenseRecord(badGroup).valid === false, 'Rejects invalid group in record validation');

const badCat = { ...validRecord, category: 'Salaries' };
assert(app.validateExpenseRecord(badCat).valid === false, 'Rejects category that belongs to another group');

const badMethod = { ...validRecord, paymentMethod: 'Crypto' };
assert(app.validateExpenseRecord(badMethod).valid === false, 'Rejects non-whitelisted payment method');

// ------------------------------------------------------------
// TEST SUITE 4: PostgreSQL Transformation & Hydration Round-Trip
// ------------------------------------------------------------
console.log('\n--- SUITE 4: PostgreSQL Transformation & Hydration Round-Trip ---');
const rawExpense = {
  id: 'exp_test_001',
  categoryGroup: 'Academic & Training Operations',
  category: 'Training Materials',
  subCategory: 'Training Materials',
  description: 'Payment to Senior DevSecOps Trainer Course Books',
  amount: 250000.50,
  date: '2026-09-10',
  expenseDate: '2026-09-10',
  vendor: 'Engr. Daniel Adeyemi',
  beneficiary: 'Engr. Daniel Adeyemi',
  department: 'Academics',
  paymentMethod: 'Bank Transfer',
  reference: 'FAC-MOD3-001',
  status: 'approved'
};

const pgPayload = app.transformEntityForPostgres ? app.transformEntityForPostgres('expenses', rawExpense, 'test_tenant') : null;
assert(pgPayload && pgPayload.category_group === 'Academic & Training Operations', 'PG Payload maps category_group accurately');
assert(pgPayload && pgPayload.sub_category === 'Training Materials', 'PG Payload maps sub_category from category (not description)');
assert(pgPayload && pgPayload.amount === 250000.50, 'PG Payload preserves exact numeric amount');
assert(pgPayload && pgPayload.expense_date === '2026-09-10', 'PG Payload maps expense_date');
assert(pgPayload && pgPayload.beneficiary === 'Engr. Daniel Adeyemi', 'PG Payload maps beneficiary');
assert(pgPayload && pgPayload.payment_method === 'Bank Transfer', 'PG Payload maps payment_method');
assert(pgPayload && pgPayload.reference === 'FAC-MOD3-001', 'PG Payload maps reference');
assert(pgPayload && pgPayload.department === 'Academics', 'PG Payload includes department');

// Now simulate reading back from Postgres row
const pgRow = {
  id: pgPayload.id,
  tenant_id: pgPayload.tenant_id,
  category_group: pgPayload.category_group,
  sub_category: pgPayload.sub_category,
  amount: '250000.50',
  expense_date: pgPayload.expense_date,
  description: pgPayload.description,
  beneficiary: pgPayload.beneficiary,
  payment_method: pgPayload.payment_method,
  reference: pgPayload.reference,
  department: pgPayload.department,
  status: pgPayload.status,
  created_at: new Date().toISOString()
};

const hydrated = app.transformEntityFromPostgres ? app.transformEntityFromPostgres('expenses', pgRow) : null;
assert(hydrated && hydrated.categoryGroup === 'Academic & Training Operations', 'Hydrated entity provides camelCase categoryGroup');
assert(hydrated && hydrated.category === 'Training Materials', 'Hydrated entity provides camelCase category');
assert(hydrated && hydrated.subCategory === 'Training Materials', 'Hydrated entity provides subCategory alias');
assert(hydrated && hydrated.amount === 250000.50, 'Hydrated entity provides numeric amount (not string)');
assert(hydrated && hydrated.date === '2026-09-10', 'Hydrated entity provides date alias');
assert(hydrated && hydrated.expenseDate === '2026-09-10', 'Hydrated entity provides expenseDate');
assert(hydrated && hydrated.vendor === 'Engr. Daniel Adeyemi', 'Hydrated entity provides vendor alias');
assert(hydrated && hydrated.beneficiary === 'Engr. Daniel Adeyemi', 'Hydrated entity provides beneficiary');
assert(hydrated && hydrated.department === 'Academics', 'Hydrated entity provides department');

// ------------------------------------------------------------
// TEST SUITE 5: Financial Aggregations & Mathematical Reconciliation
// ------------------------------------------------------------
console.log('\n--- SUITE 5: Aggregations & Mathematical Invariant Reconciliation ---');
const sampleExpenses = [
  { categoryGroup: 'Technology & Software', category: 'Cloud Services', department: 'Technology', amount: 150000 },
  { categoryGroup: 'Technology & Software', category: 'Software Subscriptions', department: 'Technology', amount: 50000 },
  { categoryGroup: 'Personnel & Payroll', category: 'Salaries', department: 'Management', amount: 500000 },
  { categoryGroup: 'Academic & Training Operations', category: 'Training Materials', department: 'Academics', amount: 200000 },
  { categoryGroup: 'Administration & Office', category: 'Stationery & Supplies', department: 'Administration', amount: 25000 }
];

const aggs = app.calculateExpenseAggregations(sampleExpenses);
const expectedTotal = 150000 + 50000 + 500000 + 200000 + 25000;
assert(aggs.totalAmount === expectedTotal, `Total sum matches expected (₦${expectedTotal})`);

let sumFromGroups = 0;
Object.values(aggs.byGroup).forEach(amt => { sumFromGroups += amt; });
assert(sumFromGroups === expectedTotal, 'SUM(Group totals) === Total amount invariant holds');

let sumFromDepts = 0;
Object.values(aggs.byDepartment).forEach(amt => { sumFromDepts += amt; });
assert(sumFromDepts === expectedTotal, 'SUM(Department totals) === Total amount invariant holds');

let sumFromCats = 0;
Object.values(aggs.byCategory).forEach(amt => { sumFromCats += amt; });
assert(sumFromCats === expectedTotal, 'SUM(Category totals) === Total amount invariant holds');

assert(aggs.count === 5, 'Total count matches expected (5 records)');
assert(aggs.reconciliation && aggs.reconciliation.isReconciled === true, 'Built-in reconciliation engine confirms isReconciled === true');

// ------------------------------------------------------------
// TEST SUITE 6: Four-File Byte-for-Byte Distribution Parity
// ------------------------------------------------------------
console.log('\n--- SUITE 6: Four Production Files SHA-256 Parity ---');
const distributionFiles = [
  'clasptek_invoice_system.html',
  'index.html',
  'public/clasptek_invoice_system.html',
  'public/index.html'
];

const hashes = distributionFiles.map(rel => {
  const fullPath = path.join(__dirname, rel);
  assert(fs.existsSync(fullPath), `Distribution file exists: ${rel}`);
  const buf = fs.readFileSync(fullPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
});

const baseHash = hashes[0];
assert(hashes.every(h => h === baseHash), `All 4 distribution files have identical SHA-256: ${baseHash}`);

// Summary
console.log('\n============================================================');
console.log(`TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log('============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
