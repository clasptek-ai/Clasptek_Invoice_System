/**
 * scripts/test_phase_c96_students_responsive_offline.js
 *
 * Clasptek Phase C96 ? Student Directory Responsive Remediation Offline Regression Suite
 * Mode: STRICTLY OFFLINE ? ZERO network calls, ZERO database connections.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const assert = require('assert');

// STRICT OFFLINE SOCKET INSTRUMENTATION
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

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ? PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ? FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('=== Clasptek Phase C96: Student Directory Responsive Remediation Suite ===\n');

runTest('1.1: StudentDrawer modal container pins header/footer with flex column and overflow hidden', () => {
  const content = read('components/students/StudentDrawer.tsx');
  assert.ok(content.includes('className="cp-modal"'), 'cp-modal container must exist');
  assert.ok(
    content.includes("maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'"),
    'cp-modal must declare flex column layout with overflow hidden to prevent double scrollbars'
  );
  assert.ok(
    !content.includes("maxHeight: '92vh', overflowY: 'auto'"),
    'cp-modal must not have overflowY: auto directly on outer modal container'
  );
});

runTest('1.2: StudentDrawer header actions declare flexWrap wrap to prevent button clipping', () => {
  const content = read('components/students/StudentDrawer.tsx');
  const headerStart = content.indexOf('{/* Header */}');
  assert.ok(headerStart > 0, 'Header comment must exist');
  const headerEnd = content.indexOf('{/* Dossier Tabs Navigation */}', headerStart);
  assert.ok(headerEnd > headerStart, 'Dossier Tabs section must follow header');
  const headerJSX = content.slice(headerStart, headerEnd);

  assert.ok(
    headerJSX.includes("flexWrap: 'wrap'") && headerJSX.includes("gap: '8px'"),
    'Header action container must enable flexWrap: wrap'
  );
  assert.ok(
    !headerJSX.includes("gap: '8px', flexShrink: 0"),
    'Header action container must not rigid-lock with flexShrink: 0'
  );
  assert.ok(headerJSX.includes('btnEnrolStudentFromDossier'), 'Enrol Student button must be present in header');
  assert.ok(headerJSX.includes('Edit Profile'), 'Edit Profile button must be present in header');
});

runTest('1.3: StudentDrawer retains scrollable cp-modal-body and sticky footer', () => {
  const content = read('components/students/StudentDrawer.tsx');
  assert.ok(content.includes('className="cp-modal-body"'), 'cp-modal-body must exist for interior scroll');
  assert.ok(content.includes('className="cp-modal-footer no-print"'), 'cp-modal-footer must exist');
  assert.ok(content.includes('Close Dossier'), 'Close Dossier button must exist in footer');
});

runTest('2.1: StudentFilters maintains responsive flex toolbar with auto-wrapping', () => {
  const content = read('components/students/StudentFilters.tsx');
  assert.ok(
    content.includes("display: 'flex'") && content.includes("flexWrap: 'wrap'"),
    'Filters container must use flex-wrap'
  );
  assert.ok(content.includes('Search by name, student ID, phone, email...'), 'Search input placeholder must exist');
  assert.ok(content.includes('All Programmes'), 'Programme filter select must exist');
  assert.ok(content.includes('All Enrolments'), 'Enrolment filter select must exist');
  assert.ok(content.includes('All Financial'), 'Financial filter select must exist');
});

runTest('3.1: StudentTable preserves desktop table with horizontal scroll fallback', () => {
  const content = read('components/students/StudentTable.tsx');
  assert.ok(content.includes('student-table-desktop'), 'Desktop table container must exist');
  assert.ok(content.includes("overflowX: 'auto'"), 'Desktop table container must specify overflowX: auto');
});

runTest('3.2: StudentTable preserves mobile card stack under 850px media query', () => {
  const content = read('components/students/StudentTable.tsx');
  assert.ok(content.includes('@media (max-width: 850px)'), 'Mobile media query at 850px must be present');
  assert.ok(content.includes('.student-cards-mobile'), 'Mobile cards class must be present');
  assert.ok(content.includes('className="cp-cards-mobile student-cards-mobile"'), 'Mobile card container element must be rendered');
});

runTest('4.1: StudentsPageClient maintains responsive title/action toolbar', () => {
  const content = read('app/students/StudentsPageClient.tsx');
  assert.ok(content.includes('Student &amp; Client Directory'), 'Page title must be preserved');
  assert.ok(content.includes("flexWrap: 'wrap'"), 'Page card header must use flex-wrap');
  assert.ok(content.includes('btnAddNewStudent'), '+ Add Student action button must be preserved');
});

runTest('5.1: Zero outbound TCP/TLS connections attempted during audit', () => {
  assert.strictEqual(socketAttempts, 0, 'No socket connections may be attempted');
});

console.log(`\nSuite Results: ${passedTests}/${totalTests} passed (${failedTests} failed).\n`);

if (failedTests > 0) {
  process.exit(1);
}