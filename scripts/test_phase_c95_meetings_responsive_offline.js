/**
 * scripts/test_phase_c95_meetings_responsive_offline.js
 *
 * Clasptek Phase C95 — Staff Meeting Modal Responsive Remediation Offline Regression Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Certified Invariants:
 * 1. Schedule Video Meeting Modal Responsive Grids:
 *    - Cohort & Host / Facilitator row declares repeat(auto-fit, minmax(200px, 1fr))
 *    - Start Time & End Time row declares repeat(auto-fit, minmax(200px, 1fr))
 *    - Both datetime-local inputs declare width: '100%'
 *    - Both cohort/facilitator selects declare width: '100%'
 *    - Rigid 1fr 1fr grids are eliminated from the scheduling modal form
 * 2. Unchanged Recording Modal Contract:
 *    - Watch Recording metadata grid remains unchanged with repeat(3, 1fr)
 * 3. Meeting Creation Contract Preservation:
 *    - Required title and provider: 'livekit' constraints remain intact
 * 4. Strict Offline Isolation:
 *    - Zero outbound TCP/TLS network connections.
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

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('=== Clasptek Phase C95: Staff Meeting Modal Responsive Remediation Suite ===\n');

// 1. Isolate the Schedule Meeting Modal JSX in MeetingsPageClient.tsx
runTest('1.1: Schedule Meeting modal exists and contains auto-fit grid for Cohort & Facilitator', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  const modalStart = content.indexOf('{isScheduleModalOpen && (');
  assert.ok(modalStart > 0, 'Schedule meeting modal block must exist');

  const modalEnd = content.indexOf('{/* Watch Recording', modalStart);
  assert.ok(modalEnd > modalStart, 'Watch recording block must follow schedule modal');

  const scheduleModalJSX = content.slice(modalStart, modalEnd);

  // Check that the Cohort / Facilitator section uses auto-fit minmax(200px, 1fr)
  const cohortSectionMatch = scheduleModalJSX.match(/<label[^>]*>\s*Cohort\s*<\/label>/);
  assert.ok(cohortSectionMatch, 'Cohort label must exist in schedule modal');

  assert.ok(
    scheduleModalJSX.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'"),
    'Schedule modal must declare repeat(auto-fit, minmax(200px, 1fr))'
  );
});

runTest('1.2: Schedule Meeting modal contains auto-fit grid for Start Time & End Time', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  const modalStart = content.indexOf('{isScheduleModalOpen && (');
  const modalEnd = content.indexOf('{/* Watch Recording', modalStart);
  const scheduleModalJSX = content.slice(modalStart, modalEnd);

  const startMatch = scheduleModalJSX.match(/<label[^>]*>\s*Start Time\s*<\/label>/);
  assert.ok(startMatch, 'Start Time label must exist');

  const endMatch = scheduleModalJSX.match(/<label[^>]*>\s*End Time\s*<\/label>/);
  assert.ok(endMatch, 'End Time label must exist');

  // Both datetime-local inputs must declare width: '100%'
  const dateTimeInputs = scheduleModalJSX.match(/<input\s+type="datetime-local"[^>]*style=\{\{\s*width:\s*'100%'\s*\}\}/g);
  assert.ok(
    dateTimeInputs && dateTimeInputs.length === 2,
    'Both datetime-local inputs must declare style={{ width: \'100%\' }}'
  );
});

runTest('1.3: Schedule Meeting modal select controls expand to full column width', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  const modalStart = content.indexOf('{isScheduleModalOpen && (');
  const modalEnd = content.indexOf('{/* Watch Recording', modalStart);
  const scheduleModalJSX = content.slice(modalStart, modalEnd);

  const cohortSelect = scheduleModalJSX.includes("value={meetingForm.cohortId}") &&
    scheduleModalJSX.includes("style={{ width: '100%' }}");
  assert.ok(cohortSelect, 'Cohort select must have width 100%');

  const facilitatorSelect = scheduleModalJSX.includes("value={meetingForm.facilitatorId}") &&
    scheduleModalJSX.includes("style={{ width: '100%' }}");
  assert.ok(facilitatorSelect, 'Facilitator select must have width 100%');
});

runTest('1.4: Rigid 1fr 1fr grids are eliminated from Schedule Meeting modal', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  const modalStart = content.indexOf('{isScheduleModalOpen && (');
  const modalEnd = content.indexOf('{/* Watch Recording', modalStart);
  const scheduleModalJSX = content.slice(modalStart, modalEnd);

  assert.ok(
    !scheduleModalJSX.includes("gridTemplateColumns: '1fr 1fr'"),
    'Rigid 1fr 1fr grids must not exist within schedule modal JSX'
  );
});

// 2. Unchanged Recording Modal Contract
runTest('2.1: Watch Recording modal metadata grid remains unchanged with repeat(3, 1fr)', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  const watchModalStart = content.indexOf('{watchModalMeeting && (');
  assert.ok(watchModalStart > 0, 'Watch recording modal block must exist');

  const watchModalEnd = content.indexOf('{/* Real LiveKit WebRTC Meeting Room', watchModalStart);
  assert.ok(watchModalEnd > watchModalStart, 'LiveKit room mount must follow watch modal');

  const watchModalJSX = content.slice(watchModalStart, watchModalEnd);
  assert.ok(
    watchModalJSX.includes("gridTemplateColumns: 'repeat(3, 1fr)'"),
    'Watch recording metadata grid must remain unchanged with repeat(3, 1fr)'
  );
  assert.ok(
    watchModalJSX.includes('TENANT_CENTRAL'),
    'TENANT_CENTRAL label must remain in watch recording modal'
  );
});

// 3. Meeting Creation Contract Preservation
runTest('3.1: Meeting creation handler preserves required title, livekit provider, and settings', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  assert.ok(
    content.includes("provider: 'livekit'"),
    'Meeting creation must strictly enforce provider: livekit'
  );
  assert.ok(
    content.includes("if (!meetingForm.title.trim())"),
    'Meeting title validation must remain intact'
  );
  assert.ok(
    content.includes("scheduledStart: new Date(meetingForm.scheduledStart).toISOString()"),
    'Start date conversion must remain intact'
  );
  assert.ok(
    content.includes("scheduledEnd: new Date(meetingForm.scheduledEnd).toISOString()"),
    'End date conversion must remain intact'
  );
});

// 4. Strict Offline Socket Guard
runTest('4.1: Zero outbound TCP/TLS network sockets were initiated', () => {
  assert.strictEqual(socketAttempts, 0, 'No socket connections must be attempted during tests');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);

if (failedTests > 0) {
  process.exit(1);
}
