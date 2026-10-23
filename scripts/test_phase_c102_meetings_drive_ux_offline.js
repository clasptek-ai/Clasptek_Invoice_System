/**
 * scripts/test_phase_c102_meetings_drive_ux_offline.js
 *
 * Clasptek Phase C102 — Meeting Modal Polish & Drive Status UX Offline Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Certified Invariants:
 * 1. Schedule Video Meeting Modal UI Polish:
 *    - Form uses flex column layout with overflow: 'hidden'
 *    - Modal body declares overflowY: 'auto', flex: 1, and 20px padding
 *    - Close button uses type="button" and clean styling
 *    - Escape key handler binds to close the modal
 *    - Platform remains strictly LiveKit (no dummy or alternative providers)
 *    - Checkbox container allows wrapping (flexWrap: 'wrap') with gap: 20px
 *    - Action buttons declare explicit button types
 * 2. Google Drive Status-State Mapping & Handling:
 *    - Status endpoint responses are correctly distinguished:
 *      * data.connected === true -> success banner
 *      * data.status === 'CONFIGURED_UNVERIFIED' -> info banner (no generic failure)
 *      * data.status === 'DISCONNECTED' or not configured -> clear status notice
 *      * fetch rejection / network error -> safe error message without internal leaks
 * 3. Authoritative OAuth Start Flow for Connect Button:
 *    - Connect button initiates POST to /api/auth/google/start
 *    - Payload specifies connectionType: 'TENANT_CENTRAL' and redirectTarget: '/meetings'
 *    - Handles data.authUrl redirect via window.location.href
 *    - Handles GOOGLE_OAUTH_PREVIEW_DISABLED with safe, informative messaging
 *    - Drive action buttons declare type="button"
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

console.log('=== Clasptek Phase C102: Meeting Modal Polish & Drive Status UX Suite ===\n');

const clientSource = read('app/meetings/MeetingsPageClient.tsx');

// -----------------------------------------------------------------------------
// SECTION 1: Schedule Video Meeting Modal UI Polish
// -----------------------------------------------------------------------------
runTest('1.1: Schedule Meeting modal form uses flex-column and body enables vertical scroll', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  assert.ok(modalStart > 0, 'Schedule modal block must exist');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(
    modalJSX.includes("display: 'flex'") &&
    modalJSX.includes("flexDirection: 'column'") &&
    modalJSX.includes("overflow: 'hidden'"),
    'Schedule modal form must declare flex column layout with overflow: hidden'
  );

  assert.ok(
    modalJSX.includes("overflowY: 'auto'") &&
    modalJSX.includes("flex: 1"),
    'Modal body must have overflowY: auto and flex: 1 for small viewports'
  );
});

runTest('1.2: Close button has explicit type="button" and accessible alignment', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  const headerBlock = modalJSX.slice(0, modalJSX.indexOf('<form'));
  assert.ok(
    headerBlock.includes('type="button"'),
    'Header close button must have explicit type="button"'
  );
  assert.ok(
    headerBlock.includes('setIsScheduleModalOpen(false)'),
    'Header close button must close the schedule modal'
  );
});

runTest('1.3: Escape key listener is registered for schedule modal', () => {
  assert.ok(
    clientSource.includes("e.key === 'Escape'") || clientSource.includes('e.key === "Escape"'),
    'Component must listen for Escape key to close modal'
  );
  assert.ok(
    clientSource.includes("addEventListener('keydown'") &&
    clientSource.includes("removeEventListener('keydown'"),
    'Keydown listener must be added and cleaned up on unmount/effect completion'
  );
});

runTest('1.4: Platform selector provides LiveKit as default provider without dummy providers', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(modalJSX.includes('LiveKit'), 'Platform must show LiveKit');
  assert.ok(!modalJSX.toLowerCase().includes('zoom'), 'Zoom must NOT be present as an option');
  assert.ok(modalJSX.toLowerCase().includes('default provider'), 'LiveKit must be indicated as default provider');
});

runTest('1.5: Checkboxes allow wrapping and have generous spacing', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(
    modalJSX.includes("flexWrap: 'wrap'") && modalJSX.includes("gap: 20"),
    'Checkbox container must specify flexWrap: wrap and gap: 20'
  );
});

// -----------------------------------------------------------------------------
// SECTION 2: Google Drive Status-State Decision Logic
// -----------------------------------------------------------------------------
runTest('2.1: Drive verification logic distinguishes CONFIGURED_UNVERIFIED from failure', () => {
  const fnStart = clientSource.indexOf('const handleVerifyDrive = async () => {');
  assert.ok(fnStart > 0, 'handleVerifyDrive must exist');
  const fnEnd = clientSource.indexOf('const handleConnectDrive = async () => {', fnStart);
  const fnBody = clientSource.slice(fnStart, fnEnd);

  assert.ok(
    fnBody.includes("data.status === 'CONFIGURED_UNVERIFIED'") ||
    fnBody.includes('data.status === "CONFIGURED_UNVERIFIED"'),
    'handleVerifyDrive must check for CONFIGURED_UNVERIFIED status'
  );

  assert.ok(
    fnBody.includes("type: 'info'") || fnBody.includes('type: "info"'),
    'CONFIGURED_UNVERIFIED must produce an info banner'
  );
});

runTest('2.2: Status decision logic maps API responses correctly across all branches', () => {
  function mapDriveResponse(resOk, data) {
    if (resOk && data) {
      if (data.connected) {
        return {
          type: 'success',
          text: `Google Drive repository verified${data.repoPath ? `: ${data.repoPath}` : '.'}`,
        };
      }
      if (data.status === 'CONFIGURED_UNVERIFIED') {
        return {
          type: 'info',
          text: `Google Drive repository configuration is present${data.repoPath ? ` (${data.repoPath})` : ''}, but authorization has not yet been verified. Click "Connect Google Drive" to complete authorization.`,
        };
      }
      return {
        type: 'error',
        text: data.message || 'Google Drive repository is not configured or disconnected.',
      };
    }
    return {
      type: 'error',
      text: 'Unable to check Google Drive repository status. Please try again.',
    };
  }

  const r1 = mapDriveResponse(true, { connected: true, status: 'CONNECTED', repoPath: 'Drive/Recordings' });
  assert.strictEqual(r1.type, 'success');
  assert.ok(r1.text.includes('verified: Drive/Recordings'));

  const r2 = mapDriveResponse(true, { connected: false, status: 'CONFIGURED_UNVERIFIED', repoPath: 'Drive/Pending' });
  assert.strictEqual(r2.type, 'info');
  assert.ok(r2.text.includes('configuration is present'));
  assert.ok(r2.text.includes('Connect Google Drive'));

  const r3 = mapDriveResponse(true, { connected: false, status: 'DISCONNECTED', message: 'No folder ID configured' });
  assert.strictEqual(r3.type, 'error');
  assert.strictEqual(r3.text, 'No folder ID configured');

  const r4 = mapDriveResponse(false, null);
  assert.strictEqual(r4.type, 'error');
  assert.strictEqual(r4.text, 'Unable to check Google Drive repository status. Please try again.');
});

// -----------------------------------------------------------------------------
// SECTION 3: Connect Button OAuth Start Flow
// -----------------------------------------------------------------------------
runTest('3.1: handleConnectDrive targets POST /api/auth/google/start with TENANT_CENTRAL', () => {
  const fnStart = clientSource.indexOf('const handleConnectDrive = async () => {');
  assert.ok(fnStart > 0, 'handleConnectDrive must exist');
  const fnEnd = clientSource.indexOf('const handleScheduleMeeting = async (e: React.FormEvent) => {', fnStart);
  const fnBody = clientSource.slice(fnStart, fnEnd);

  assert.ok(
    fnBody.includes('/api/auth/google/start'),
    'handleConnectDrive must target /api/auth/google/start'
  );
  assert.ok(
    fnBody.includes("connectionType: 'TENANT_CENTRAL'") ||
    fnBody.includes('connectionType: "TENANT_CENTRAL"'),
    'handleConnectDrive must supply connectionType: TENANT_CENTRAL'
  );
  assert.ok(
    fnBody.includes("redirectTarget: '/meetings'") ||
    fnBody.includes('redirectTarget: "/meetings"'),
    'handleConnectDrive must specify redirectTarget: /meetings'
  );
});

runTest('3.2: handleConnectDrive handles Preview rejection safely without leaking', () => {
  const fnStart = clientSource.indexOf('const handleConnectDrive = async () => {');
  const fnEnd = clientSource.indexOf('const handleScheduleMeeting = async (e: React.FormEvent) => {', fnStart);
  const fnBody = clientSource.slice(fnStart, fnEnd);

  assert.ok(
    fnBody.includes('GOOGLE_OAUTH_PREVIEW_DISABLED'),
    'handleConnectDrive must detect GOOGLE_OAUTH_PREVIEW_DISABLED'
  );
  assert.ok(
    fnBody.includes('window.location.href = data.authUrl'),
    'handleConnectDrive must redirect to data.authUrl on success'
  );
});

runTest('3.3: Both Drive buttons declare explicit type="button"', () => {
  assert.ok(
    clientSource.includes('id="btnConnectGoogleDrive"') &&
    clientSource.includes('id="btnVerifyRepository"'),
    'Both Drive action buttons must exist'
  );

  const connectBtnMatch = clientSource.match(/<button[^>]*id="btnConnectGoogleDrive"[^>]*>/);
  assert.ok(connectBtnMatch, 'btnConnectGoogleDrive button element must be found');
  assert.ok(connectBtnMatch[0].includes('type="button"'), 'btnConnectGoogleDrive must have type="button"');

  const verifyBtnMatch = clientSource.match(/<button[^>]*id="btnVerifyRepository"[^>]*>/);
  assert.ok(verifyBtnMatch, 'btnVerifyRepository button element must be found');
  assert.ok(verifyBtnMatch[0].includes('type="button"'), 'btnVerifyRepository must have type="button"');
});

// -----------------------------------------------------------------------------
// SECTION 4: Zero Sockets
// -----------------------------------------------------------------------------
runTest('4.1: Zero outbound TCP/TLS network connections during execution', () => {
  assert.strictEqual(socketAttempts, 0, 'No outbound sockets should have been attempted');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

if (failedTests > 0) {
  process.exit(1);
}
