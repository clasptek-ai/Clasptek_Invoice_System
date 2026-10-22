/**
 * scripts/test_phase_c78b_livekit_url_hardening_offline.js
 *
 * Clasptek Phase C78B — Fail-Closed LiveKit URL Hardening Offline Regression Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Verifies:
 * 1. Neither MeetLandingClient.tsx nor MeetingsPageClient.tsx contains the former hardcoded LiveKit URL fallback:
 *    wss://clasptek-portal-tpfi0pb9.livekit.cloud
 * 2. Missing/empty/malformed serverUrl stops host join and displays user-facing alert without mounting LiveMeetingRoom.
 * 3. Missing/empty/malformed serverUrl in guest waiting room polling or authenticated join halts flow and displays inline error without mounting LiveMeetingRoom.
 * 4. In both components, LiveMeetingRoom is guarded by truthy serverUrl.
 * 5. Valid server-supplied URL proceeds through intended flow.
 * 6. Google Meet remains unsupported across meetings services.
 * 7. lib/meetings/sfu.ts staging isolation guard is preserved and not weakened.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

console.log('=== Clasptek Phase C78B: LiveKit URL Hardening Offline Suite ===\n');

// 1. Static check: former hardcoded fallback completely removed
runTest('1.1: MeetLandingClient.tsx does NOT contain former hardcoded LiveKit URL', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    !content.includes('wss://clasptek-portal-tpfi0pb9.livekit.cloud'),
    'Former hardcoded LiveKit URL must not be present in MeetLandingClient.tsx'
  );
  assert.ok(
    !content.includes('tpfi0pb9.livekit.cloud'),
    'Subdomain tpfi0pb9.livekit.cloud must not appear in MeetLandingClient.tsx'
  );
});

runTest('1.2: MeetingsPageClient.tsx does NOT contain former hardcoded LiveKit URL', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  assert.ok(
    !content.includes('wss://clasptek-portal-tpfi0pb9.livekit.cloud'),
    'Former hardcoded LiveKit URL must not be present in MeetingsPageClient.tsx'
  );
  assert.ok(
    !content.includes('tpfi0pb9.livekit.cloud'),
    'Subdomain tpfi0pb9.livekit.cloud must not appear in MeetingsPageClient.tsx'
  );
});

// 2. MeetLandingClient fail-closed logic analysis
runTest('2.1: MeetLandingClient authenticated join requires non-empty serverUrl', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("!data.serverUrl || typeof data.serverUrl !== 'string' || !data.serverUrl.trim()"),
    'Must explicitly validate data.serverUrl presence and non-empty string in handleAuthenticatedJoin'
  );
  assert.ok(
    content.includes("setErrorMessage('Meeting service did not provide an approved LiveKit server URL."),
    'Must set user-facing error message when serverUrl is missing in handleAuthenticatedJoin'
  );
});

runTest('2.2: MeetLandingClient guest waiting-room polling halts and errors on missing serverUrl', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("setViewState('idle')"),
    'Must reset viewState to idle if approved but serverUrl is missing'
  );
  assert.ok(
    content.includes("Host approved your entry, but the meeting service did not provide an approved LiveKit server URL."),
    'Must set inline error message for guest when approved but serverUrl is missing'
  );
});

runTest('2.3: MeetLandingClient LiveMeetingRoom render guard strictly checks liveCredentials.serverUrl', () => {
  const content = read('app/meet/[id]/MeetLandingClient.tsx');
  assert.ok(
    content.includes("if (viewState === 'connected' && liveCredentials && liveCredentials.serverUrl)"),
    'LiveMeetingRoom rendering must check liveCredentials.serverUrl'
  );
});

// 3. MeetingsPageClient host fail-closed logic analysis
runTest('3.1: MeetingsPageClient handleJoinMeeting halts on missing serverUrl without entering live session', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  assert.ok(
    content.includes("!data.serverUrl || typeof data.serverUrl !== 'string' || !data.serverUrl.trim()"),
    'Must validate data.serverUrl in handleJoinMeeting before activating meeting'
  );
  assert.ok(
    content.includes("alert('Meeting service did not provide an approved LiveKit server URL. Please check server configuration.');"),
    'Must alert user and return early on missing serverUrl in handleJoinMeeting'
  );
});

runTest('3.2: MeetingsPageClient LiveMeetingRoom render guard checks liveSessionState.serverUrl', () => {
  const content = read('app/meetings/MeetingsPageClient.tsx');
  assert.ok(
    content.includes("activeLiveMeeting && liveSessionState && liveSessionState.serverUrl && ("),
    'LiveMeetingRoom JSX mount must require liveSessionState.serverUrl'
  );
  assert.ok(
    content.includes("serverUrl={liveSessionState.serverUrl}"),
    'serverUrl prop must be passed directly without fallback'
  );
});

// 4. Verification that valid server-supplied URL proceeds
runTest('4.1: Trimmed serverUrl is stored when valid', () => {
  const meetLanding = read('app/meet/[id]/MeetLandingClient.tsx');
  const meetingsPage = read('app/meetings/MeetingsPageClient.tsx');

  assert.ok(
    meetLanding.includes("serverUrl: data.serverUrl.trim()"),
    'MeetLandingClient must trim and set serverUrl'
  );
  assert.ok(
    meetingsPage.includes("serverUrl: data.serverUrl.trim()"),
    'MeetingsPageClient must trim and set serverUrl'
  );
});

// 5. SFU & Google Meet constraints preserved
runTest('5.1: lib/meetings/sfu.ts staging isolation guard is intact', () => {
  const sfu = read('lib/meetings/sfu.ts');
  assert.ok(
    sfu.includes('LIVEKIT_PREVIEW_DENIED') && sfu.includes('assertLiveKitStagingAllowed'),
    'sfu.ts must contain assertLiveKitStagingAllowed guard'
  );
  assert.ok(
    sfu.includes('export class LiveKitService') && sfu.includes('export function getSFUService'),
    'sfu.ts must export LiveKitService and getSFUService'
  );
});

runTest('5.2: Google Meet remains unsupported across API handlers and helper modules', () => {
  const googleMeetHelper = read('lib/meetings/google-meet.ts');
  assert.ok(
    googleMeetHelper.includes('PROVIDER_UNSUPPORTED'),
    'google-meet.ts must reject with PROVIDER_UNSUPPORTED'
  );
  const createRoute = read('app/api/meetings/create/route.ts');
  assert.ok(
    createRoute.includes('PROVIDER_UNSUPPORTED'),
    'create/route.ts must reject with PROVIDER_UNSUPPORTED'
  );
  const joinRoute = read('app/api/meetings/join/route.ts');
  assert.ok(
    joinRoute.includes('PROVIDER_UNSUPPORTED'),
    'join/route.ts must reject with PROVIDER_UNSUPPORTED'
  );
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

if (failedTests > 0) {
  process.exit(1);
}
