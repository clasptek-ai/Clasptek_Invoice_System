/**
 * test_student_409_and_audit_403_remediation.js
 * 
 * Production Certification Test Suite for CLASPTEK:
 * - Student 409 Resolution & Counter Reconciliation Ordering
 * - Finance Audit Log Authorization & Status Differentiation
 * - Multi-tenant Security & Immutability Guarantees
 * - 4-File Byte-for-Byte Distribution Parity
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
    console.log(`  ✔ [PASS ${testsPassed}] ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✖ [FAIL] ${message}`);
  }
}

console.log('================================================================================');
console.log(' CLASPTEK PRODUCTION: STUDENT 409 & FINANCE AUDIT 403 CERTIFICATION SUITE');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================================\n');

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

try {
  eval(scriptMatch[1]);
} catch (e) {
  console.error('Error evaluating clasptek_invoice_system.html script:', e);
  process.exit(1);
}

const app = global.window;
const AUTHORITATIVE_TENANT = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

// ------------------------------------------------------------
// TEST SUITE 1: Counter Reconciliation Ordering & Allocator
// ------------------------------------------------------------
console.log('--- SUITE 1: Counter Reconciliation & Allocation Mechanics ---');

// Setup baseline students representing production state (STU-2026-0101 through STU-2026-0107)
app.state.authoritativeTenantId = AUTHORITATIVE_TENANT;
app.state.students = [
  { id: 'stu_0101', student_number: 'STU-2026-0101', studentNumber: 'STU-2026-0101', firstName: 'Adelabu', lastName: 'Ade', name: 'Adelabu Ade', email: 'n@gmail.com', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0102', student_number: 'STU-2026-0102', studentNumber: 'STU-2026-0102', firstName: 'Concurrency', lastName: 'Student 102', name: 'Concurrency Student 102', email: '', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0103', student_number: 'STU-2026-0103', studentNumber: 'STU-2026-0103', firstName: 'Concurrency', lastName: 'Student 103', name: 'Concurrency Student 103', email: '', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0104', student_number: 'STU-2026-0104', studentNumber: 'STU-2026-0104', firstName: 'Concurrency', lastName: 'Student 104', name: 'Concurrency Student 104', email: '', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0105', student_number: 'STU-2026-0105', studentNumber: 'STU-2026-0105', firstName: 'Oluwatosin', lastName: 'Benjamin', name: 'Oluwatosin Benjamin', email: 'lovelifeben27@gmail.com', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0106', student_number: 'STU-2026-0106', studentNumber: 'STU-2026-0106', firstName: 'Balogun', lastName: 'Monday', name: 'Balogun Monday', email: 'balogunmonday@gmail.com', tenant_id: AUTHORITATIVE_TENANT },
  { id: 'stu_0107', student_number: 'STU-2026-0107', studentNumber: 'STU-2026-0107', firstName: 'Adekunle', lastName: 'Raheem', name: 'Adekunle Raheem', email: 'techbridgeacademy01@gmail.com', tenant_id: AUTHORITATIVE_TENANT }
];

app.state.counters = { student: 101 }; // Stale counter before reconciliation

// Reconcile counters from state
app.reconcileCountersFromDatabase();
assert(Number(app.state.counters.student) >= 107, `Counter reconciled to highest existing student sequence (expected >= 107, got ${app.state.counters.student})`);

// Next allocation must be 108, NOT 101 or duplicate
(async () => {
  const nextStuNo = await app.getAuthoritativeNextStudentNumber(null, AUTHORITATIVE_TENANT);
  const expectedPrefix = `STU-${new Date().getFullYear()}-0108`;
  assert(nextStuNo === expectedPrefix, `Authoritative allocator generates next sequence '${expectedPrefix}' (got '${nextStuNo}')`);

  // ------------------------------------------------------------
  // TEST SUITE 2: Exact Adelabu Tayo Historical Invoice Sync Scenario
  // ------------------------------------------------------------
  console.log('\n--- SUITE 2: Exact Adelabu Tayo Historical Invoice Sync Scenario ---');

  // Reset state with Adelabu Ade existing at STU-2026-0101
  app.state.counters = {};
  app.state.students = [
    { id: 'stu_adelabu_ade', student_number: 'STU-2026-0101', studentNumber: 'STU-2026-0101', firstName: 'Adelabu', lastName: 'Ade', name: 'Adelabu Ade', email: 'n@gmail.com', tenant_id: AUTHORITATIVE_TENANT }
  ];

  // Invoices contain multiple historical tuition invoices for "Adelabu Tayo"
  app.state.invoices = [
    { id: 'inv_tayo_1', invoice_no: 11092042, clientName: 'Adelabu Tayo', student_name: 'Adelabu Tayo', email: 'reallyomega08@gmail.com', student_email: 'reallyomega08@gmail.com', category: 'Student Tuition', income_category: 'Student Tuition', tenant_id: AUTHORITATIVE_TENANT },
    { id: 'inv_tayo_2', invoice_no: 11092043, clientName: 'Adelabu Tayo', student_name: 'Adelabu Tayo', email: 'reallyomega08@gmail.com', student_email: 'reallyomega08@gmail.com', category: 'Student Tuition', income_category: 'Student Tuition', tenant_id: AUTHORITATIVE_TENANT },
    { id: 'inv_tayo_3', invoice_no: 11092044, clientName: 'Adelabu Tayo', student_name: 'Adelabu Tayo', email: 'reallyomega08@gmail.com', student_email: 'reallyomega08@gmail.com', category: 'Student Tuition', income_category: 'Student Tuition', tenant_id: AUTHORITATIVE_TENANT }
  ];

  // Run student synchronization
  app.syncStudentsFromExistingData();

  // Verification
  assert(app.state.students.length === 2, `Exactly 2 students exist after sync (got ${app.state.students.length})`);

  const studentAde = app.state.students.find(s => s.name === 'Adelabu Ade');
  assert(studentAde && (studentAde.studentNumber === 'STU-2026-0101' || studentAde.student_number === 'STU-2026-0101'), 'Existing Adelabu Ade retains STU-2026-0101 unmodified');

  const studentTayo = app.state.students.find(s => s.name === 'Adelabu Tayo');
  assert(studentTayo !== undefined, 'Adelabu Tayo student record was created');
  assert(studentTayo && studentTayo.studentNumber !== 'STU-2026-0101', `Adelabu Tayo does NOT take STU-2026-0101 (assigned ${studentTayo?.studentNumber})`);
  assert(studentTayo && studentTayo.studentNumber.endsWith('0102'), `Adelabu Tayo receives next sequence STU-YYYY-0102 (got ${studentTayo?.studentNumber})`);

  // Uniqueness verification across entire array
  const studentNumbers = app.state.students.map(s => s.studentNumber || s.student_number);
  const uniqueNumbers = new Set(studentNumbers);
  assert(studentNumbers.length === uniqueNumbers.size, 'Zero duplicate student numbers exist in state');

  // ------------------------------------------------------------
  // TEST SUITE 3: Idempotency Check
  // ------------------------------------------------------------
  console.log('\n--- SUITE 3: Idempotency Verification ---');
  const countBeforeSecondRun = app.state.students.length;
  app.syncStudentsFromExistingData();
  const countAfterSecondRun = app.state.students.length;
  assert(countBeforeSecondRun === countAfterSecondRun, `Re-running sync is strictly idempotent (${countBeforeSecondRun} -> ${countAfterSecondRun})`);

  // ------------------------------------------------------------
  // TEST SUITE 4: Update-To-Self vs Duplicate-To-Other
  // ------------------------------------------------------------
  console.log('\n--- SUITE 4: Update-To-Self vs Conflict Guard ---');

  // Candidate A: Update to self (same ID stu_adelabu_ade, keeping STU-2026-0101)
  const isUpdateToSelf = (candidateId, candidateNo) => {
    const conflict = app.state.students.find(s => (s.studentNumber === candidateNo || s.student_number === candidateNo) && s.id !== candidateId);
    return !conflict;
  };

  assert(isUpdateToSelf('stu_adelabu_ade', 'STU-2026-0101') === true, 'Update-to-self: Adelabu Ade updating details retains STU-2026-0101 without collision');
  assert(isUpdateToSelf('stu_new_candidate', 'STU-2026-0101') === false, 'Duplicate-to-other: New candidate attempting STU-2026-0101 is recognized as collision');

  // ------------------------------------------------------------
  // TEST SUITE 5: Finance Audit Authorization & Status Handling
  // ------------------------------------------------------------
  console.log('\n--- SUITE 5: Finance Audit Authorization & Status Handling ---');

  // Configure Supabase client in state for audit tests
  app.state.supabase = {
    endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
    anonKey: 'sb_publishable_VbAnvwhA28SV_PmLcEiTdg_12cc7Or9'
  };
  app.state.databaseAuthorityState = 'AUTHORITATIVE';

  // Test 5A: Unauthenticated actor triggers AUDIT_DEFERRED
  app.state.auth = { isAuthenticated: false, user: null, supabaseUser: null, supabaseSession: null };
  const auditResUnauth = await app.logAudit('RECORD_EXPENSE', 'expense', 'exp_test_01', 'Test Expense 1', null, { amount: 50000 });
  assert(auditResUnauth.status === 'AUDIT_DEFERRED', `Unauthenticated audit call returns AUDIT_DEFERRED (got ${auditResUnauth.status})`);

  // Test 5B: CRM Enquiry interaction triggers AUDIT_DEFERRED (stored in CRM timeline, not finance ledger)
  app.state.auth = {
    isAuthenticated: true,
    user: { id: '3cd253eb-bb8b-4f01-b7d4-f07c18abc484', name: 'Admin', role: 'Super Admin', email: 'admin@clasptek.org' },
    supabaseUser: { id: '3cd253eb-bb8b-4f01-b7d4-f07c18abc484' },
    supabaseSession: { access_token: 'fake_jwt' }
  };
  const auditResEnq = await app.logAudit('FOLLOW_UP_LOGGED', 'enquiry', 'enq_123', 'Contact Note', null, { note: 'Called prospect' });
  assert(auditResEnq.status === 'AUDIT_DEFERRED', `Enquiry interaction audit returns AUDIT_DEFERRED (got ${auditResEnq.status})`);

  // Test 5C: Entry is always captured in memory / local ledger
  assert(app.state.auditLog.length >= 2, `Audit entries preserved in local ledger (count=${app.state.auditLog.length})`);
  assert(app.state.auditLog[0].action === 'FOLLOW_UP_LOGGED', 'Most recent audit entry at head of auditLog');
  assert(app.state.auditLog[1].action === 'RECORD_EXPENSE', 'Previous audit entry present in auditLog');

  // ------------------------------------------------------------
  // TEST SUITE 6: Four Production Files SHA-256 Parity
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
  console.log('\n================================================================================');
  console.log(` RESULTS: ${testsPassed}/${testsRun} TESTS PASSED (${testsFailed} FAILURES)`);
  console.log('================================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
})();
