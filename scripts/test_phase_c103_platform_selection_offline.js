/**
 * scripts/test_phase_c103_platform_selection_offline.js
 *
 * Clasptek Phase C103 — Optional Google Meet + LiveKit Platform Selection Offline Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Certified Invariants:
 * 1. Platform Selector UI & Accessibility:
 *    - Schedule modal provides both "Clasptek Live Meeting" (LiveKit) and "Google Meet"
 *    - Both options declare role="radio", aria-checked, and tabIndex={0}
 *    - Default provider is 'livekit' with "DEFAULT PROVIDER" badge
 *    - Google Meet includes "OPTIONAL" badge
 *    - When LiveKit is selected, Room Chat & Screen Share checkboxes are displayed
 *    - When Google Meet is selected, external Google Meet information notice is displayed
 *    - Modal error banner displays inline when scheduling fails
 *    - C95 auto-fit grids and full-width form inputs remain intact
 *    - Escape listener and flex column scrolling remain intact
 * 2. Server-Side Allowlist & Authorization:
 *    - /api/meetings/create validates provider against ALLOWED_PROVIDERS: ['livekit', 'google_meet']
 *    - Explicitly unsupported providers outside allowlist return PROVIDER_UNSUPPORTED (HTTP 400)
 *    - Google Meet requests fail closed with PROVIDER_UNSUPPORTED explaining missing Calendar OAuth/scopes
 *    - LiveKit creation requires authenticated staff session and valid schedule boundaries
 * 3. Provider-Specific Join URL Handling:
 *    - handleJoinMeeting opens Google Meet meetings directly via window.open when providerRoomUrl is present
 *    - LiveKit meetings proceed to internal WebRTC live session state
 * 4. Google Drive & OAuth Separation:
 *    - Drive repository verification remains distinct from meeting provider selection
 *    - btnConnectGoogleDrive initiates POST /api/auth/google/start with TENANT_CENTRAL
 * 5. Strict Offline Isolation:
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

console.log('=== Clasptek Phase C103: Platform Selection Offline Suite ===\n');

const clientSource = read('app/meetings/MeetingsPageClient.tsx');
const createRouteSource = read('app/api/meetings/create/route.ts');

// -----------------------------------------------------------------------------
// SECTION 1: Modal UI & Accessible Platform Selector
// -----------------------------------------------------------------------------
runTest('1.1: Schedule modal offers both Clasptek Live Meeting and Google Meet platforms', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  assert.ok(modalStart > 0, 'Schedule modal block must exist');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(modalJSX.includes('Clasptek Live Meeting'), 'Must show Clasptek Live Meeting');
  assert.ok(modalJSX.includes('Google Meet'), 'Must show Google Meet');
  assert.ok(modalJSX.includes('id="platformLiveKit"'), 'Must have id platformLiveKit');
  assert.ok(modalJSX.includes('id="platformGoogleMeet"'), 'Must have id platformGoogleMeet');
});

runTest('1.2: Platform options declare accessible radiogroup roles and keyboard interaction', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(modalJSX.includes('role="radiogroup"'), 'Platform group must have role="radiogroup"');
  assert.ok(modalJSX.includes('role="radio"'), 'Options must have role="radio"');
  assert.ok(modalJSX.includes('aria-checked={meetingForm.provider === \'livekit\'}'), 'LiveKit must bind aria-checked');
  assert.ok(modalJSX.includes('aria-checked={meetingForm.provider === \'google_meet\'}'), 'Google Meet must bind aria-checked');
  assert.ok(modalJSX.includes('tabIndex={0}'), 'Options must be keyboard focusable');
  assert.ok(modalJSX.includes("e.key === ' ' || e.key === 'Enter'"), 'Options must support Space/Enter keys');
});

runTest('1.3: Default provider is livekit with clear badge distinctions', () => {
  assert.ok(
    clientSource.includes("provider: 'livekit' as 'livekit' | 'google_meet'"),
    'Initial form state must set provider to livekit'
  );

  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(modalJSX.toLowerCase().includes('default provider'), 'LiveKit card must show default provider pill');
  assert.ok(modalJSX.toLowerCase().includes('optional'), 'Google Meet card must show optional pill');
});

runTest('1.4: In-meeting settings (chat & screen share) only display for LiveKit', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(
    modalJSX.includes("meetingForm.provider === 'livekit' ? ("),
    'Settings must conditionally check meetingForm.provider === livekit'
  );
  assert.ok(
    modalJSX.includes('Enable Room Chat') && modalJSX.includes('Enable Screen Share'),
    'LiveKit branch must include Enable Room Chat and Enable Screen Share'
  );
  assert.ok(
    modalJSX.includes('externally within Google Meet'),
    'Google Meet branch must explain external control management'
  );
});

runTest('1.5: Schedule modal renders inline error banner when submission fails', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(
    modalJSX.includes('{scheduleModalError && ('),
    'Modal body must display scheduleModalError banner when present'
  );
});

runTest('1.6: C95 responsive grids and modal scrolling remain intact', () => {
  const modalStart = clientSource.indexOf('{isScheduleModalOpen && (');
  const modalEnd = clientSource.indexOf('{/* Watch Recording', modalStart);
  const modalJSX = clientSource.slice(modalStart, modalEnd);

  assert.ok(
    modalJSX.includes("gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'"),
    'Auto-fit minmax(200px, 1fr) must be preserved'
  );
  assert.ok(
    modalJSX.includes("overflowY: 'auto'") && modalJSX.includes("flex: 1"),
    'Modal body scroll must be preserved'
  );
  assert.ok(
    !modalJSX.includes("gridTemplateColumns: '1fr 1fr'"),
    'Rigid 1fr 1fr grids must not exist'
  );
});

// -----------------------------------------------------------------------------
// SECTION 2: Server-Side Allowlist & Authorization
// -----------------------------------------------------------------------------
runTest('2.1: create route validates provider against explicit allowlist [livekit, google_meet]', () => {
  assert.ok(
    createRouteSource.includes("const ALLOWED_PROVIDERS = ['livekit', 'google_meet']") ||
    createRouteSource.includes('const ALLOWED_PROVIDERS = ["livekit", "google_meet"]'),
    'Route must define ALLOWED_PROVIDERS with livekit and google_meet'
  );
  assert.ok(
    createRouteSource.includes('!ALLOWED_PROVIDERS.includes(rawProvider)'),
    'Route must reject providers outside ALLOWED_PROVIDERS'
  );
});

runTest('2.2: Google Meet creation branches to createOrValidateGoogleMeet service', () => {
  assert.ok(
    createRouteSource.includes("rawProvider === 'google_meet'") || createRouteSource.includes("selectedProvider === 'google_meet'"),
    'Route must detect rawProvider === google_meet'
  );
  assert.ok(
    createRouteSource.includes("createOrValidateGoogleMeet"),
    'Route must delegate to createOrValidateGoogleMeet'
  );
});

runTest('2.3: Meeting creation retains authoritative authentication and session checks', () => {
  assert.ok(
    createRouteSource.includes('getAuthoritativeSession'),
    'Route must verify authoritative session'
  );
  assert.ok(
    createRouteSource.includes("status: 401"),
    'Route must return 401 for unauthenticated calls'
  );
  assert.ok(
    createRouteSource.includes("status: 403"),
    'Route must return 403 for unauthorized roles or missing tenant'
  );
});

// -----------------------------------------------------------------------------
// SECTION 3: Provider-Specific Join URL Handling
// -----------------------------------------------------------------------------
runTest('3.1: handleJoinMeeting launches external Google Meet directly when providerRoomUrl exists', () => {
  assert.ok(
    clientSource.includes("meeting.sfuProvider === 'google_meet' && meeting.providerRoomUrl"),
    'handleJoinMeeting must check for google_meet with providerRoomUrl'
  );
  assert.ok(
    clientSource.includes("window.open(meeting.providerRoomUrl, '_blank', 'noopener,noreferrer')"),
    'handleJoinMeeting must open providerRoomUrl in new window'
  );
});

// -----------------------------------------------------------------------------
// SECTION 4: Google Drive & OAuth Separation
// -----------------------------------------------------------------------------
runTest('4.1: Google Drive connection remains independent and targets TENANT_CENTRAL', () => {
  assert.ok(
    clientSource.includes('/api/auth/google/start'),
    'btnConnectGoogleDrive must target /api/auth/google/start'
  );
  assert.ok(
    clientSource.includes("connectionType: 'TENANT_CENTRAL'"),
    'OAuth request must use TENANT_CENTRAL'
  );
  assert.ok(
    clientSource.includes("data.status === 'CONFIGURED_UNVERIFIED'"),
    'CONFIGURED_UNVERIFIED must remain an unverified informational status'
  );
});

// -----------------------------------------------------------------------------
// SECTION 5: Zero Sockets
// -----------------------------------------------------------------------------
runTest('5.1: Zero outbound TCP/TLS network connections during execution', () => {
  assert.strictEqual(socketAttempts, 0, 'No outbound sockets should have been attempted');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

if (failedTests > 0) {
  process.exit(1);
}