/**
 * scripts/test_phase_c93_meetings_responsive_offline.js
 *
 * Clasptek Phase C93 — Meetings Responsive Layout Remediation Offline Regression Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Certified Invariants:
 * 1. MeetLandingClient Viewport Height Safety:
 *    - Card container declares maxHeight bound (calc(100vh - ...))
 *    - Card container declares flex-column display (display: 'flex', flexDirection: 'column')
 *    - Card container declares margin: 'auto' to prevent flexbox center scroll clipping
 *    - Outer container declares overflowY: 'auto'
 * 2. MeetLandingClient Internal Scroll Contract:
 *    - Content container declares overflowY: 'auto' and flex: 1
 *    - Content container encloses the primary submit button and sign-in link
 *    - Banner and metadata containers declare flexShrink: 0
 * 3. MeetLandingClient Narrow Viewport Wrapping:
 *    - Metadata grid declares responsive wrapping repeat(auto-fit, minmax(140px, 1fr))
 * 4. Staff Meeting Modal Viewport Safety:
 *    - Global .cp-modal declares max-height: 90vh and column flexbox
 *    - Global .cp-modal-body declares overflow-y: auto
 *    - ShareMeetingModal declares maxHeight: '90vh'
 * 5. Strict Offline Isolation:
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

console.log('=== Clasptek Phase C93: Meetings Responsive Layout Remediation Suite ===\n');

// 1. Guest Landing Page Layout Bounds & Centering
runTest('1.1: MeetLandingClient outer container enables page-level vertical scrolling', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  // Outer container must have minHeight: '100vh' and overflowY: 'auto'
  assert.ok(
    content.includes("minHeight: '100vh'") && content.includes("overflowY: 'auto'"),
    'MeetLandingClient outer wrapper must declare minHeight 100vh and overflowY auto'
  );
});

runTest('1.2: MeetLandingClient card bounds height to viewport and declares flex column', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("maxHeight: 'calc(100vh - 48px)'"),
    'MeetLandingClient card must bound height with maxHeight calc(100vh - ...)'
  );
  assert.ok(
    content.includes("display: 'flex'") && content.includes("flexDirection: 'column'"),
    'MeetLandingClient card must configure flex column layout'
  );
});

runTest('1.3: MeetLandingClient card declares margin: auto to prevent flex centering scroll clipping', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("margin: 'auto'"),
    'MeetLandingClient card must declare margin auto for safe flex centering scroll'
  );
});

// 2. Guest Landing Page Internal Scrollability
runTest('2.1: MeetLandingClient banner and metadata headers declare flexShrink: 0', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  const bannerMatch = content.match(/{\/\* Banner \*\/}\s*<div[^>]*style=\{\{([^}]+)\}\}/);
  assert.ok(bannerMatch, 'Banner element must exist');
  assert.ok(bannerMatch[1].includes('flexShrink: 0'), 'Banner must declare flexShrink: 0');

  const metadataMatch = content.match(/{\/\* Meeting Metadata \*\/}\s*<div[^>]*style=\{\{([^}]+)\}\}/);
  assert.ok(metadataMatch, 'Metadata container must exist');
  assert.ok(metadataMatch[1].includes('flexShrink: 0'), 'Metadata container must declare flexShrink: 0');
});

runTest('2.2: MeetLandingClient content container declares overflowY: auto and flex: 1', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  const contentAreaMatch = content.match(/{\/\* Content Area \*\/}\s*<div[^>]*style=\{\{([^}]+)\}\}/);
  assert.ok(contentAreaMatch, 'Content Area element must exist');
  assert.ok(contentAreaMatch[1].includes("overflowY: 'auto'"), 'Content area must have overflowY auto');
  assert.ok(contentAreaMatch[1].includes('flex: 1'), 'Content area must have flex: 1');
});

runTest('2.3: Primary guest action and Sign In link are nested inside scrollable Content Area', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  const contentAreaStart = content.indexOf('{/* Content Area */}');
  assert.ok(contentAreaStart > 0, 'Content Area comment must exist');
  const contentAreaSlice = content.slice(contentAreaStart);

  assert.ok(
    contentAreaSlice.includes('Request Entry to Classroom'),
    'Submit button must be inside scrollable Content Area'
  );
  assert.ok(
    contentAreaSlice.includes('Sign In'),
    'Sign In link must be inside scrollable Content Area'
  );
  assert.ok(
    contentAreaSlice.includes('handleAuthenticatedJoin'),
    'Authenticated join button must be inside scrollable Content Area'
  );
});

// 3. Narrow Viewport Metadata Grid Wrapping
runTest('3.1: Meeting metadata grid declares responsive auto-fit wrap', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'"),
    'Metadata grid must declare repeat(auto-fit, minmax(140px, 1fr))'
  );
  assert.ok(
    !content.includes("gridTemplateColumns: '1fr 1fr'"),
    'Rigid 1fr 1fr grid must be replaced by responsive auto-fit grid'
  );
});

// 4. Staff Modals Viewport Safety Contract
runTest('4.1: styles/globals.css .cp-modal contract bounds modal height and scrolls body', () => {
  const globals = read('styles/globals.css');
  assert.ok(
    globals.includes('.cp-modal {') || globals.includes('.cp-modal{'),
    '.cp-modal class must exist in globals.css'
  );
  assert.ok(
    globals.includes('max-height: 90vh'),
    '.cp-modal must declare max-height: 90vh'
  );
  assert.ok(
    globals.includes('.cp-modal-body'),
    '.cp-modal-body class must exist'
  );
  assert.ok(
    globals.includes('overflow-y: auto'),
    '.cp-modal-body must declare overflow-y: auto'
  );
});

runTest('4.2: ShareMeetingModal declares maxHeight 90vh and column layout', () => {
  const shareModal = read('components/meetings/ShareMeetingModal.tsx');
  assert.ok(
    shareModal.includes("maxHeight: '90vh'"),
    'ShareMeetingModal must declare maxHeight 90vh'
  );
  assert.ok(
    shareModal.includes("display: 'flex'") && shareModal.includes("flexDirection: 'column'"),
    'ShareMeetingModal must declare flex column layout'
  );
});

// 5. Strict Offline Socket Guard
runTest('5.1: Zero outbound TCP/TLS network sockets were initiated', () => {
  assert.strictEqual(socketAttempts, 0, 'No socket connections must be attempted during tests');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);

if (failedTests > 0) {
  process.exit(1);
}
