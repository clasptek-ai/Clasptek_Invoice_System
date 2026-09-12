/**
 * CLASPTEK PRODUCTION — RECEIPT STUDENT NAME & PAYMENT DATE AUDIT SUITE
 *
 * 15-Point Forensic Certification Suite for Phase 18
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('================================================================================');
console.log(' CLASPTEK RECEIPT STUDENT NAME & PAYMENT DATE FORENSIC CERTIFICATION');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================================\n');

// Load application script from clasptek_invoice_system.html
const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

if (!scriptMatch) {
  console.error('FAILED: Could not find <script> block in clasptek_invoice_system.html');
  process.exit(1);
}

// Set up mock browser environment
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

// Execute the application script inside Node VM
const scriptCode = scriptMatch[1];
const sandbox = {
  window: global.window,
  document: global.document,
  localStorage: global.localStorage,
  crypto: global.crypto,
  console: { log: () => {}, warn: () => {}, error: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Blob: function(parts, opts) { this.parts = parts; this.opts = opts; },
  URL: { createObjectURL: () => 'blob:mock' },
  module: { exports: {} },
  exports: {}
};

try {
  const runFn = new Function(
    'window', 'document', 'localStorage', 'crypto', 'console',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'Blob', 'URL', 'module', 'exports',
    scriptCode
  );
  runFn(
    sandbox.window, sandbox.document, sandbox.localStorage, sandbox.crypto, sandbox.console,
    sandbox.setTimeout, sandbox.clearTimeout, sandbox.setInterval, sandbox.clearInterval,
    sandbox.Blob, sandbox.URL, sandbox.module, sandbox.exports
  );
} catch (e) {
  console.error('FATAL: Script execution failed during module initialization:', e);
  process.exit(1);
}

const app = sandbox.module.exports;
const {
  state,
  transformEntityFromPostgres,
  renderCanonicalReceiptDocument,
  fmtReceiptPaymentDate,
  resolveReceiptStudentName,
  invoiceBalance,
  invoiceStatus
} = app;

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✔ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✖ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runTests() {
  // Reset state
  state.invoices = [];
  state.payments = [];
  state.students = [];
  state.enrolments = [];
  state.programmes = [{ id: 'prog_ielts_01', name: 'IELTS Masterclass Coaching' }];

  // =========================================================================
  // TEST 1 — Complete workflow
  // Simulate: Student -> Enrolment -> Invoice -> Payment -> Receipt
  // =========================================================================
  const testStudent = {
    id: 'stu_wf_01',
    studentNumber: 'STU-2026-0501',
    firstName: 'Amaka',
    lastName: 'Okonkwo',
    name: 'Amaka Okonkwo',
    email: 'amaka.o@example.com',
    phone: '08021112233'
  };
  state.students.push(testStudent);

  const testEnrolment = {
    id: 'enr_wf_01',
    studentId: testStudent.id,
    studentName: testStudent.name,
    programmeId: 'prog_ielts_01',
    invoiceId: 'inv_wf_01',
    enrolmentNumber: 'ENR-2026-0501'
  };
  state.enrolments.push(testEnrolment);

  const testInvoice = {
    id: 'inv_wf_01',
    invoiceNo: 11092080,
    invoice_display_no: 'INV-2026-11092080',
    studentId: testStudent.id,
    clientName: testStudent.name,
    studentName: testStudent.name,
    programmeId: 'prog_ielts_01',
    programmeName: 'IELTS Masterclass Coaching',
    date: '2026-08-10',
    total: 250000,
    totalAmount: 250000,
    status: 'unpaid'
  };
  state.invoices.push(testInvoice);

  const testPayment = {
    id: 'pay_wf_01',
    receiptNo: 20088,
    receipt_display_no: 'RCT-2026-20088',
    invoiceId: testInvoice.id,
    invoice_id: testInvoice.id,
    amount: 250000,
    date: '2026-08-12',
    paymentDate: '2026-08-12',
    payment_date: '2026-08-12',
    paymentMethod: 'Bank Transfer',
    reference: 'GTB/NIBSS/20260812'
  };
  state.payments.push(testPayment);

  const receiptHtml1 = renderCanonicalReceiptDocument(testPayment, testInvoice);
  assert(
    receiptHtml1.includes('Amaka Okonkwo') && receiptHtml1.includes('12 Aug 2026'),
    'TEST 1: Complete workflow Student -> Enrolment -> Invoice -> Payment -> Receipt renders student name and payment date'
  );

  // =========================================================================
  // TEST 2 — Exact student name
  // Database row: { student_name: "John Ade" }
  // Receipt MUST contain: John Ade (Exact match)
  // =========================================================================
  const dbInvoiceRow2 = {
    id: 'inv_exact_02',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    invoice_no: 11092081,
    invoice_display_no: 'INV-2026-11092081',
    programme_id: 'prog_ielts_01',
    student_name: 'John Ade',
    invoice_date: '2026-09-01',
    total_amount: 300000
  };
  const hydratedInvoice2 = transformEntityFromPostgres('invoices', dbInvoiceRow2);
  const pay2 = {
    id: 'pay_exact_02',
    invoiceId: hydratedInvoice2.id,
    receiptNo: 20089,
    amount: 300000,
    date: '2026-09-02'
  };
  const receiptHtml2 = renderCanonicalReceiptDocument(pay2, hydratedInvoice2);
  assert(
    receiptHtml2.includes('John Ade'),
    'TEST 2: Exact student name "John Ade" rendered in receipt from PostgreSQL row'
  );

  // =========================================================================
  // TEST 3 — PostgreSQL precedence
  // Given: { student_name: "John Ade", client_name: "Wrong Name" }
  // Expected: John Ade, NOT: Wrong Name
  // =========================================================================
  const dbInvoiceRow3 = {
    id: 'inv_prec_03',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    invoice_no: 11092082,
    student_name: 'John Ade',
    client_name: 'Wrong Name',
    invoice_date: '2026-09-01',
    total_amount: 150000
  };
  const hydratedInvoice3 = transformEntityFromPostgres('invoices', dbInvoiceRow3);
  const pay3 = {
    id: 'pay_prec_03',
    invoiceId: hydratedInvoice3.id,
    receiptNo: 20090,
    amount: 150000,
    date: '2026-09-02'
  };
  const receiptHtml3 = renderCanonicalReceiptDocument(pay3, hydratedInvoice3);
  assert(
    receiptHtml3.includes('John Ade') && !receiptHtml3.includes('Wrong Name'),
    'TEST 3: PostgreSQL canonical student_name wins over client_name'
  );

  // =========================================================================
  // TEST 4 — Payment date ISO
  // Input: 2026-09-10T13:15:29.106+00:00
  // Receipt must show the correct calendar date (10 Sep 2026). It must NOT show today's date.
  // =========================================================================
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const pay4 = {
    id: 'pay_iso_04',
    invoiceId: hydratedInvoice2.id,
    receiptNo: 20091,
    amount: 100000,
    payment_date: '2026-09-10T13:15:29.106+00:00'
  };
  const receiptHtml4 = renderCanonicalReceiptDocument(pay4, hydratedInvoice2);
  assert(
    /10 Sep(t)? 2026/.test(receiptHtml4),
    'TEST 4: ISO timestamp "2026-09-10T13:15:29.106+00:00" formats to "10 Sep(t) 2026"'
  );
  if (!/10 Sep(t)? 2026/.test(todayFormatted)) {
    assert(
      !receiptHtml4.includes(`Payment Date:</span><strong>${todayFormatted}</strong>`),
      'TEST 4b: Payment date does NOT silently substitute today\'s date'
    );
  }

  // =========================================================================
  // TEST 5 — Payment date YYYY-MM-DD
  // Input: 2026-08-15 -> Receipt must show 15 Aug 2026
  // =========================================================================
  const pay5 = {
    id: 'pay_ymd_05',
    invoiceId: hydratedInvoice2.id,
    receiptNo: 20092,
    amount: 50000,
    date: '2026-08-15'
  };
  const receiptHtml5 = renderCanonicalReceiptDocument(pay5, hydratedInvoice2);
  assert(
    receiptHtml5.includes('15 Aug 2026'),
    'TEST 5: Date-only "2026-08-15" formats to "15 Aug 2026" without timezone shift'
  );

  // =========================================================================
  // TEST 6 — Payment date precedence
  // Given: { payment_date: "2026-09-10", paymentDate: "2026-09-11", date: "2026-09-12" }
  // Expected: 2026-09-10 (10 Sep 2026)
  // =========================================================================
  const pay6 = {
    id: 'pay_prec_06',
    invoiceId: hydratedInvoice2.id,
    receiptNo: 20093,
    amount: 50000,
    payment_date: '2026-09-10',
    paymentDate: '2026-09-11',
    date: '2026-09-12'
  };
  const receiptHtml6 = renderCanonicalReceiptDocument(pay6, hydratedInvoice2);
  assert(
    /10 Sep(t)? 2026/.test(receiptHtml6) && !receiptHtml6.includes('11 Sep') && !receiptHtml6.includes('12 Sep'),
    'TEST 6: Canonical PostgreSQL payment_date wins over paymentDate and date'
  );

  // =========================================================================
  // TEST 7 — Reload persistence
  // Simulate: PostgreSQL row -> transformEntityFromPostgres() -> application state -> renderCanonicalReceiptDocument()
  // Verify student_name and payment_date survive reload
  // =========================================================================
  const rawPgInvoice = {
    id: 'inv_reload_07',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    invoice_no: 11092055,
    invoice_display_no: 'INV-2026-11092055',
    student_name: 'Oluwatosin Benjamin',
    student_email: 'lovelifeben27@gmail.com',
    student_phone: '08160298193',
    programme_id: 'prog_ielts_01',
    invoice_date: '2026-09-11',
    total_amount: 450000,
    status: 'paid'
  };
  const rawPgPayment = {
    id: 'pay_reload_07',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    invoice_id: 'inv_reload_07',
    receipt_no: 20005,
    receipt_display_no: 'RCT-2026-20005',
    amount: 450000,
    payment_date: '2026-09-11',
    payment_method: 'Bank Transfer'
  };

  // Hydrate via transformEntityFromPostgres (simulating app reload)
  const hydratedInv7 = transformEntityFromPostgres('invoices', rawPgInvoice);
  const hydratedPay7 = transformEntityFromPostgres('payments', rawPgPayment);

  // Update in-memory state with hydrated entities
  state.invoices = [hydratedInv7];
  state.payments = [hydratedPay7];

  // Render receipt directly and via lookup (inv omitted)
  const receiptWithInv = renderCanonicalReceiptDocument(hydratedPay7, hydratedInv7);
  const receiptFromLookup = renderCanonicalReceiptDocument(hydratedPay7);

  assert(
    receiptWithInv.includes('Oluwatosin Benjamin') && /11 Sep(t)? 2026/.test(receiptWithInv),
    'TEST 7A: Reload persistence: student_name and payment_date survive PostgreSQL hydration'
  );
  assert(
    receiptFromLookup.includes('Oluwatosin Benjamin') && /11 Sep(t)? 2026/.test(receiptFromLookup),
    'TEST 7B: Reload persistence: receipt finds linked invoice and renders student name & date without explicit inv argument'
  );

  // =========================================================================
  // TEST 8 — Missing student
  // No usable student identity -> Expected: "Student name unavailable"
  // Never undefined, null, [object Object], blank
  // =========================================================================
  const invoiceNoStudent = {
    id: 'inv_no_stu_08',
    invoiceNo: 11092099,
    total: 100000
  };
  const paymentNoStudent = {
    id: 'pay_no_stu_08',
    invoiceId: 'inv_no_stu_08',
    amount: 100000,
    date: '2026-09-01'
  };
  const receiptHtml8 = renderCanonicalReceiptDocument(paymentNoStudent, invoiceNoStudent);
  assert(
    receiptHtml8.includes('Student name unavailable'),
    'TEST 8A: Missing student identity renders "Student name unavailable"'
  );
  assert(
    !receiptHtml8.includes('undefined') && !receiptHtml8.includes('null') && !receiptHtml8.includes('[object Object]'),
    'TEST 8B: Missing student identity never produces undefined, null, or [object Object]'
  );

  // =========================================================================
  // TEST 9 — Missing payment date
  // No usable payment date -> Expected: "Payment date unavailable", never today's date
  // =========================================================================
  const paymentNoDate = {
    id: 'pay_no_date_09',
    invoiceId: hydratedInv7.id,
    amount: 100000
  };
  const receiptHtml9 = renderCanonicalReceiptDocument(paymentNoDate, hydratedInv7);
  assert(
    receiptHtml9.includes('Payment date unavailable'),
    'TEST 9A: Missing payment date displays "Payment date unavailable"'
  );
  if (todayFormatted !== 'Payment date unavailable') {
    assert(
      !receiptHtml9.includes(`Payment Date:</span><strong>${todayFormatted}</strong>`),
      'TEST 9B: Missing payment date never silently defaults to today\'s date'
    );
  }

  // =========================================================================
  // TEST 10 — Invalid payment date
  // Test: "not-a-date", "2026-99-99" -> Expected: "Payment date unavailable", never "Invalid Date"
  // =========================================================================
  const payInvalid1 = { id: 'p_inv_1', invoiceId: hydratedInv7.id, date: 'not-a-date', amount: 50000 };
  const payInvalid2 = { id: 'p_inv_2', invoiceId: hydratedInv7.id, date: '2026-99-99', amount: 50000 };
  const receiptHtml10A = renderCanonicalReceiptDocument(payInvalid1, hydratedInv7);
  const receiptHtml10B = renderCanonicalReceiptDocument(payInvalid2, hydratedInv7);
  assert(
    receiptHtml10A.includes('Payment date unavailable') && !receiptHtml10A.includes('Invalid Date'),
    'TEST 10A: Invalid date "not-a-date" renders "Payment date unavailable", not "Invalid Date"'
  );
  assert(
    receiptHtml10B.includes('Payment date unavailable') && !receiptHtml10B.includes('Invalid Date'),
    'TEST 10B: Invalid date "2026-99-99" renders "Payment date unavailable", not "Invalid Date"'
  );

  // =========================================================================
  // TEST 11 — Financial integrity
  // Verify that receipt rendering does not change invoice total, payment amount, total paid, balance, status
  // =========================================================================
  const inv11 = {
    id: 'inv_fin_11',
    invoiceNo: 11092050,
    total: 500000,
    totalAmount: 500000,
    status: 'partial'
  };
  const pay11 = {
    id: 'pay_fin_11',
    invoiceId: 'inv_fin_11',
    amount: 200000,
    date: '2026-09-05'
  };
  state.invoices = [inv11];
  state.payments = [pay11];

  const beforeBalance = invoiceBalance(inv11);
  const beforeStatus = inv11.status;

  // Render receipt multiple times
  renderCanonicalReceiptDocument(pay11, inv11);
  renderCanonicalReceiptDocument(pay11, inv11);

  const afterBalance = invoiceBalance(inv11);
  const afterStatus = inv11.status;

  assert(
    beforeBalance.total === afterBalance.total &&
    beforeBalance.paid === afterBalance.paid &&
    beforeBalance.balance === afterBalance.balance &&
    beforeStatus === afterStatus &&
    pay11.amount === 200000,
    'TEST 11: Receipt rendering does NOT alter financial calculations, amounts, or invoice status'
  );

  // =========================================================================
  // TEST 12 — Status transitions
  // Verify unpaid -> partial -> paid remains correct
  // =========================================================================
  const inv12 = { id: 'inv_trans_12', total: 400000, totalAmount: 400000, status: 'unpaid' };
  state.invoices = [inv12];
  state.payments = [];

  assert(invoiceStatus(inv12) === 'unpaid', 'TEST 12A: Initial invoice status is unpaid (paid = 0)');

  // Partial payment
  state.payments.push({ id: 'pay_t1', invoiceId: inv12.id, amount: 150000 });
  assert(invoiceStatus(inv12) === 'partial', 'TEST 12B: After partial payment (150,000 / 400,000), status is partial');

  // Full settlement
  state.payments.push({ id: 'pay_t2', invoiceId: inv12.id, amount: 250000 });
  assert(invoiceStatus(inv12) === 'paid', 'TEST 12C: After full settlement (400,000 / 400,000), status is paid');

  // =========================================================================
  // TEST 13 — Duplicate receipt protection
  // Generate/render receipt multiple times. Verify new database records = 0
  // =========================================================================
  const initialInvoicesCount = state.invoices.length;
  const initialPaymentsCount = state.payments.length;

  for (let i = 0; i < 5; i++) {
    renderCanonicalReceiptDocument(pay11, inv11);
  }

  assert(
    state.invoices.length === initialInvoicesCount && state.payments.length === initialPaymentsCount,
    'TEST 13: Calling renderCanonicalReceiptDocument 5 times creates ZERO new payment/invoice records'
  );

  // =========================================================================
  // TEST 14 — Snake/camel compatibility
  // Test: invoiceId / invoice_id, paymentDate / payment_date / date, studentName / student_name, clientName / client_name
  // =========================================================================
  const snakePayment = {
    id: 'pay_snake_14',
    invoice_id: 'inv_snake_14',
    receipt_no: 30001,
    payment_date: '2026-07-20',
    amount: 120000
  };
  const snakeInvoice = {
    id: 'inv_snake_14',
    invoice_no: 11092014,
    student_name: 'Babatunde Fashola',
    total_amount: 120000
  };
  state.invoices.push(snakeInvoice);
  state.payments.push(snakePayment);

  const receiptHtml14 = renderCanonicalReceiptDocument(snakePayment);
  assert(
    receiptHtml14.includes('Babatunde Fashola') && receiptHtml14.includes('20 Jul 2026'),
    'TEST 14: Snake-case invoice_id, student_name, and payment_date correctly resolved without explicit camelCase properties'
  );

  // =========================================================================
  // TEST 15 — Four-file SHA-256 parity
  // Verify all four production files are byte-for-byte identical
  // =========================================================================
  const files = [
    'clasptek_invoice_system.html',
    'index.html',
    'public/clasptek_invoice_system.html',
    'public/index.html'
  ];
  const hashes = files.map(f => {
    const fullPath = path.join(__dirname, f);
    return crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
  });

  const allIdentical = hashes.every(h => h === hashes[0]);
  assert(
    allIdentical,
    'TEST 15: Four-file SHA-256 parity is 100% byte-for-byte identical',
    `Hashes: ${hashes.join(', ')}`
  );

  console.log('\n================================================================================');
  console.log(` RESULTS: ${passed}/${passed + failed} TESTS PASSED (${failed} FAILURES)`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
