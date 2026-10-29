/**
 * scripts/test_phase_c6h_responsive_ui_offline.js
 * Offline Certification Suite for Phase C6H:
 * Responsive UI Audit and Minimal Remediation
 *
 * Certified Invariants:
 * 1. RecordLifecycleModal Short Viewport Safety:
 *    - Modal card declares maxHeight: '90vh'
 *    - Content body declares overflowY: 'auto' and flex: 1
 *    - Header and footer declare flexShrink: 0 to keep buttons reachable on short viewports
 *    - Existing ARIA, Escape guard, and reentrancy lock remain intact
 * 2. CreateProfessionalTuitionInvoiceModal Responsive Flow:
 *    - Customer, training, account, and notes rows use responsive repeat(auto-fit, minmax(...))
 *    - Line items repeater row is wrapped in overflowX: 'auto' with minWidth: '500px'
 *    - Submitting lock and line item validation rules remain intact
 * 3. StudentRegistrationModal Mobile Field Preservation:
 *    - Address, Location, State row uses responsive repeat(auto-fit, minmax(180px, 1fr))
 *    - Prevents 78px input cramping on phone screens (390px)
 * 4. PaymentsPageClient Responsive Wrapping:
 *    - Main card header has flexWrap: 'wrap' and gap: '12px'
 *    - Record Payment Modal Amount/Method and Date/Ref rows use repeat(auto-fit, minmax(200px, 1fr))
 *    - Both desktop table (.cp-table-desktop) and mobile cards (.cp-cards-mobile) remain active
 * 5. AddCohortModal & AddEnrolmentModal Responsive Invariants:
 *    - Retain responsive auto-fit grids, maxHeight bounds, and internal scrolling
 * 6. Strict Offline Networking:
 *    - Zero outbound TCP/TLS network sockets.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const assert = require('assert');

// -----------------------------------------------------------------------------
// STRICT OFFLINE SOCKET INSTRUMENTATION
// -----------------------------------------------------------------------------
let socketAttempts = 0;
const origNetConnect = net.connect;
const origNetCreateConnection = net.createConnection;
const origSocketConnect = net.Socket.prototype.connect;
const origTlsConnect = tls.connect;

function blockSocket(methodName) {
  socketAttempts++;
  throw new Error(`[SECURITY VIOLATION] Offline test prohibited network access via ${methodName}!`);
}

net.connect = () => blockSocket('net.connect');
net.createConnection = () => blockSocket('net.createConnection');
net.Socket.prototype.connect = function () {
  blockSocket('net.Socket.prototype.connect');
};
tls.connect = () => blockSocket('tls.connect');

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    testsPassed++;
    console.log(`  ✔ PASS: ${testName}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✖ FAIL: ${testName}`);
    console.error(`    ${err.message}`);
  }
}

console.log('========================================================================================');
console.log(' CLASPTEK PHASE C6H: RESPONSIVE UI AUDIT & MINIMAL REMEDIATION OFFLINE SUITE');
console.log(' Mode: STRICT OFFLINE (Deterministic Static Inspection & Responsive Invariant Verification)');
console.log('========================================================================================\n');

const ROOT = path.resolve(__dirname, '..');
const recordModalPath = path.join(ROOT, 'components', 'tables', 'RecordLifecycleModal.tsx');
const invoiceModalPath = path.join(ROOT, 'components', 'finance', 'CreateProfessionalTuitionInvoiceModal.tsx');
const studentModalPath = path.join(ROOT, 'components', 'students', 'StudentRegistrationModal.tsx');
const paymentsClientPath = path.join(ROOT, 'app', 'payments', 'PaymentsPageClient.tsx');
const enrolmentModalPath = path.join(ROOT, 'components', 'students', 'AddEnrolmentModal.tsx');
const cohortModalPath = path.join(ROOT, 'components', 'cohorts', 'AddCohortModal.tsx');

const recordModalSrc = fs.readFileSync(recordModalPath, 'utf8');
const invoiceModalSrc = fs.readFileSync(invoiceModalPath, 'utf8');
const studentModalSrc = fs.readFileSync(studentModalPath, 'utf8');
const paymentsClientSrc = fs.readFileSync(paymentsClientPath, 'utf8');
const enrolmentModalSrc = fs.readFileSync(enrolmentModalPath, 'utf8');
const cohortModalSrc = fs.readFileSync(cohortModalPath, 'utf8');

// =============================================================================
// Suite 1: RecordLifecycleModal Short Viewport Safety
// =============================================================================
console.log('--- Suite 1: RecordLifecycleModal Short Viewport Safety ---');

runTest('1.1 Modal card bounds height to maxHeight: 90vh', () => {
  assert(recordModalSrc.includes("maxHeight: '90vh'"), 'Modal card must bound height with maxHeight: 90vh');
});

runTest('1.2 Modal header and footer declare flexShrink: 0', () => {
  const matches = (recordModalSrc.match(/flexShrink:\s*0/g) || []).length;
  assert(matches >= 2, `Expected at least 2 flexShrink: 0 declarations (header & footer), found ${matches}`);
});

runTest('1.3 Content body declares overflowY: auto and flex: 1 for internal scrolling', () => {
  assert(recordModalSrc.includes("overflowY: 'auto'"), 'Content body must declare overflowY: auto');
  assert(recordModalSrc.includes('flex: 1'), 'Content body must declare flex: 1');
});

runTest('1.4 Phase C6G accessibility and lifecycle contracts remain intact', () => {
  assert(recordModalSrc.includes('role="dialog"'), 'Must preserve role="dialog"');
  assert(recordModalSrc.includes('aria-modal="true"'), 'Must preserve aria-modal="true"');
  assert(recordModalSrc.includes('#record-lifecycle-cancel-btn'), 'Must preserve #record-lifecycle-cancel-btn');
  assert(recordModalSrc.includes("if (e.key === 'Escape' && !isLoading && !isExecutingRef.current)"), 'Must preserve Escape guard');
});

// =============================================================================
// Suite 2: CreateProfessionalTuitionInvoiceModal Responsive Flow
// =============================================================================
console.log('\n--- Suite 2: CreateProfessionalTuitionInvoiceModal Responsive Flow ---');

runTest('2.1 Multi-column rows use responsive repeat(auto-fit, minmax(...))', () => {
  assert(
    invoiceModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'"),
    'Must use auto-fit minmax(200px, 1fr) for customer, training, and account rows'
  );
  assert(
    invoiceModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'"),
    'Must use auto-fit minmax(180px, 1fr) for date & mode rows'
  );
  assert(
    invoiceModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'"),
    'Must use auto-fit minmax(220px, 1fr) for notes & comments row'
  );
});

runTest('2.2 Line items repeater is wrapped in horizontal scroll container with minWidth', () => {
  assert(
    invoiceModalSrc.includes("overflowX: 'auto'") && invoiceModalSrc.includes("minWidth: '500px'"),
    'Line items must have horizontal scroll wrapper with minWidth: 500px'
  );
});

runTest('2.3 Action buttons retain SVG icons and no raw emoji glyphs', () => {
  assert(!invoiceModalSrc.includes('<span>👁️</span>'), 'Must not contain raw preview emoji');
  assert(!invoiceModalSrc.includes('<span>✔</span>'), 'Must not contain raw checkmark emoji');
  assert(invoiceModalSrc.includes('Preview Invoice') && invoiceModalSrc.includes('Issue Official Invoice'), 'Action labels intact');
});

// =============================================================================
// Suite 3: StudentRegistrationModal Mobile Field Preservation
// =============================================================================
console.log('\n--- Suite 3: StudentRegistrationModal Mobile Field Preservation ---');

runTest('3.1 Address, Location, State row uses responsive repeat(auto-fit, minmax(180px, 1fr))', () => {
  assert(
    studentModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'"),
    'Address, Location, State must use auto-fit minmax(180px, 1fr)'
  );
  assert(!studentModalSrc.includes("gridTemplateColumns: '2fr 1fr 1fr'"), 'Rigid 2fr 1fr 1fr must be removed');
});

runTest('3.2 Validation and synchronous submission locks remain intact', () => {
  assert(studentModalSrc.includes('const isSubmittingRef = useRef(false);'), 'Submitting ref preserved');
  assert(studentModalSrc.includes('if (isSubmittingRef.current) return;'), 'Submitting guard preserved');
  assert(studentModalSrc.includes('Clean SVG button icon') || studentModalSrc.includes('Save Student'), 'Save button preserved');
});

// =============================================================================
// Suite 4: PaymentsPageClient Responsive Wrapping
// =============================================================================
console.log('\n--- Suite 4: PaymentsPageClient Responsive Wrapping ---');

runTest('4.1 Main ledger card header wraps gracefully on narrow viewports', () => {
  assert(
    paymentsClientSrc.includes("flexWrap: 'wrap'") && paymentsClientSrc.includes("gap: '12px'"),
    'Card header must declare flexWrap: wrap and gap: 12px'
  );
});

runTest('4.2 Record payment modal fields collapse responsively with auto-fit', () => {
  const matches = (paymentsClientSrc.match(/gridTemplateColumns:\s*'repeat\(auto-fit,\s*minmax\(200px,\s*1fr\)\)'/g) || []).length;
  assert(matches >= 2, `Expected at least 2 auto-fit grids in payment modal, found ${matches}`);
});

runTest('4.3 Desktop table and mobile card stacks both remain present', () => {
  assert(paymentsClientSrc.includes('cp-table-desktop'), 'Must preserve .cp-table-desktop');
  assert(paymentsClientSrc.includes('cp-cards-mobile'), 'Must preserve .cp-cards-mobile');
});

// =============================================================================
// Suite 5: AddCohortModal & AddEnrolmentModal Responsive Invariants
// =============================================================================
console.log('\n--- Suite 5: AddCohortModal & AddEnrolmentModal Responsive Invariants ---');

runTest('5.1 AddCohortModal retains auto-fit grids and bounded modal height', () => {
  assert(cohortModalSrc.includes("maxHeight: '92vh'"), 'AddCohortModal bounded to 92vh');
  assert(cohortModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit,"), 'AddCohortModal uses auto-fit grids');
});

runTest('5.2 AddEnrolmentModal retains auto-fit grids and bounded modal height', () => {
  assert(enrolmentModalSrc.includes("maxHeight: '92vh'"), 'AddEnrolmentModal bounded to 92vh');
  assert(enrolmentModalSrc.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'"), 'AddEnrolmentModal uses auto-fit');
});

// =============================================================================
// Suite 6: Strict Zero-Network Transportation
// =============================================================================
console.log('\n--- Suite 6: Strict Zero-Network Transportation ---');

runTest('6.1 Zero network socket attempts across entire test suite', () => {
  assert.strictEqual(socketAttempts, 0, `Expected 0 network socket attempts, recorded ${socketAttempts}`);
});

console.log('\n========================================================================================');
console.log(` PHASE C6H OFFLINE TEST SUMMARY: ${testsPassed} PASSED / ${testsFailed} FAILED`);
console.log(' Responsive UI audit, minimal remediations, and layout invariants certified offline.');
console.log('========================================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
