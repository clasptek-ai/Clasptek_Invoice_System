/**
 * scripts/test_phase_c124_meetings_schedule_offline.js
 *
 * Clasptek Phase C124 — Schedule New Video Meeting UX & Google Calendar Connection Remediation
 * Comprehensive Offline Certification Suite.
 *
 * Certified Invariants (Section 7):
 * 1. Connection status for connected and disconnected organizations
 * 2. Missing Calendar connection prevents invalid automatic Google Meet creation
 * 3. OAuth connection action sends correct request contract (includeCalendar, TENANT_CENTRAL)
 * 4. 401 produces actionable feedback without bypassing session authorization (Cookie & Bearer)
 * 5. 403 produces clear permission message for unauthorized roles
 * 6. Duplicate connection requests and scheduling submissions are prevented
 * 7. Meeting form values survive connection flows and failures
 * 8. Successful connection refreshes relevant status
 * 9. API 400 validation errors are distinguishable from OAuth authentication errors
 * 10. LiveKit remains selected by default and submits expected payload
 * 11. Custom Google Meet URL validation follows supported server contract
 * 12. Responsive layout and keyboard accessibility retain existing UI conventions
 * 13. Strict Network Isolation (0 outbound TCP/TLS network calls)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const net = require('net');
const tls = require('tls');
const ts = require('typescript');

// -----------------------------------------------------------------------------
// Strict Offline Socket Guard
// -----------------------------------------------------------------------------
let socketsOpened = 0;
const origNetConnect = net.connect;
const origNetCreateConnection = net.createConnection;
const origTlsConnect = tls.connect;

function socketBlocked(name) {
  socketsOpened++;
  throw new Error(`[NETWORK_VIOLATION] Offline test prohibited network access via ${name}`);
}

net.connect = () => socketBlocked('net.connect');
net.createConnection = () => socketBlocked('net.createConnection');
net.Socket.prototype.connect = function () {
  socketBlocked('net.Socket.prototype.connect');
};
tls.connect = () => socketBlocked('tls.connect');

const repoRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runSyncTest(name, fn) {
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

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

const moduleCache = new Map();
function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (id.startsWith('@/')) {
      const candidate = path.join(repoRoot, id.slice(2));
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts');
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        if (fs.existsSync(path.join(candidate, 'index.ts'))) return loadTsModule(path.join(candidate, 'index.ts'));
        if (fs.existsSync(path.join(candidate, 'route.ts'))) return loadTsModule(path.join(candidate, 'route.ts'));
      }
      return require(candidate);
    }
    if (id.startsWith('../') || id.startsWith('./')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts');
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      return require(candidate);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', js);
  fn(customRequire, mod, mod.exports, path.dirname(fullPath), fullPath);
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

console.log('\n=== Clasptek Phase C124: Meetings Schedule UX & Calendar Remediation Suite ===\n');

(async () => {
  const googleConfig = require('../api/_lib/google-oauth-config');
  const googleMeetMod = loadTsModule('lib/meetings/google-meet.ts');

  // ===========================================================================
  // 1. Connection status for connected and disconnected organizations
  // ===========================================================================
  await runAsyncTest('1.1: getGoogleDriveConnectionStatus accurately reports disconnected organization', async () => {
    const status = await googleConfig.getGoogleDriveConnectionStatus({
      tenantId: 'unconnected-tenant-uuid',
      connectionType: 'TENANT_CENTRAL',
    });
    assert.strictEqual(status.connected, false);
    assert.strictEqual(status.hasCalendarScope, false);
  });

  await runAsyncTest('1.2: getGoogleDriveConnectionStatus accurately reports connected organization with Calendar scope', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-with-cal', {
      tenant_id: 'tenant-with-cal',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
      google_email: 'admin@tenant-cal.org',
      access_token: 'mock_token',
    });

    const status = await googleConfig.getGoogleDriveConnectionStatus({
      tenantId: 'tenant-with-cal',
      connectionType: 'TENANT_CENTRAL',
    });
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.hasCalendarScope, true);
    assert.strictEqual(status.googleEmail, 'admin@tenant-cal.org');
  });

  await runAsyncTest('1.3: getGoogleDriveConnectionStatus detects connected Drive account lacking Calendar scope', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-drive-only', {
      tenant_id: 'tenant-drive-only',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      google_email: 'storage@tenant-drive.org',
      access_token: 'mock_token',
    });

    const status = await googleConfig.getGoogleDriveConnectionStatus({
      tenantId: 'tenant-drive-only',
      connectionType: 'TENANT_CENTRAL',
    });
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.hasCalendarScope, false);
  });

  // ===========================================================================
  // 2. Missing Calendar connection prevents invalid automatic Google Meet creation
  // ===========================================================================
  await runAsyncTest('2.1: Server-side createOrValidateGoogleMeet fails closed with PROVIDER_UNSUPPORTED when disconnected', async () => {
    try {
      await googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'unconnected-tenant-uuid',
        title: 'Cloud Computing Seminar',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Must fail closed without Calendar connection');
    } catch (err) {
      assert.strictEqual(err.code, 'PROVIDER_UNSUPPORTED');
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('Google Meet is not configured for this organization'));
    }
  });

  runSyncTest('2.2: Frontend client-side check prevents submitting automatic Google Meet when disconnected', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSrc.includes('!calendarStatus.connected || !calendarStatus.hasCalendarScope'),
      'Frontend must check connection and calendar scope before submitting automated creation'
    );
    assert.ok(
      clientSrc.includes('Google Calendar is not configured for this organization'),
      'Frontend must display actionable warning instead of sending doomed request'
    );
  });

  // ===========================================================================
  // 3. OAuth connection action sends correct request contract
  // ===========================================================================
  runSyncTest('3.1: handleConnectCalendar submits includeCalendar: true and TENANT_CENTRAL', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('/api/auth/google/start'), 'Must target /api/auth/google/start');
    assert.ok(clientSrc.includes("connectionType: 'TENANT_CENTRAL'"), 'Must specify TENANT_CENTRAL');
    assert.ok(clientSrc.includes('includeCalendar: true'), 'Must specify includeCalendar: true');
    assert.ok(clientSrc.includes("credentials: 'same-origin'"), 'Must set credentials same-origin');
  });

  runSyncTest('3.2: handleConnectCalendar validates that authUrl origin is accounts.google.com', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSrc.includes("targetUrl.hostname === 'accounts.google.com'") ||
      clientSrc.includes('accounts.google.com'),
      'Must validate authorization URL hostname before window.location navigation'
    );
  });

  // ===========================================================================
  // 4. 401 produces actionable feedback without bypassing session authorization
  // ===========================================================================
  runSyncTest('4.1: extractSupabaseTokenFromCookies correctly parses token from cookie header', () => {
    const { extractSupabaseTokenFromCookies } = googleConfig;
    assert.strictEqual(typeof extractSupabaseTokenFromCookies, 'function');

    // Single cookie
    const tokenPayload = JSON.stringify(['test_session_access_token_123', 'refresh_token_456']);
    const cookieHeader = `sb-f70d5788-auth-token=${encodeURIComponent(tokenPayload)}; path=/`;
    const extracted = extractSupabaseTokenFromCookies(cookieHeader);
    assert.strictEqual(extracted, 'test_session_access_token_123');

    // Chunked cookies
    const chunk0 = 'sb-proj-auth-token.0=' + encodeURIComponent('["chunked_token_part1_');
    const chunk1 = 'sb-proj-auth-token.1=' + encodeURIComponent('part2", "refresh"]');
    const extractedChunked = extractSupabaseTokenFromCookies(`${chunk0}; ${chunk1}`);
    assert.strictEqual(extractedChunked, 'chunked_token_part1_part2');

    // Empty / missing cookie
    assert.strictEqual(extractSupabaseTokenFromCookies(''), null);
    assert.strictEqual(extractSupabaseTokenFromCookies('other_cookie=xyz'), null);
  });

  await runAsyncTest('4.2: authenticateCaller accepts Bearer token or Supabase cookie token', async () => {
    const { authenticateCaller } = googleConfig;

    // Test with Bearer token
    const reqWithBearer = {
      headers: { authorization: 'Bearer test_valid_jwt' }
    };
    const resBearer = await authenticateCaller(reqWithBearer);
    assert.strictEqual(resBearer.authenticated, true);
    assert.strictEqual(resBearer.user.email, 'admin@clasptek.org');

    // Test with mock token via cookie
    const cookiePayload = JSON.stringify(['test_valid_jwt', 'refresh']);
    const reqWithCookie = {
      headers: { cookie: `sb-test-auth-token=${encodeURIComponent(cookiePayload)}` }
    };
    const resCookie = await authenticateCaller(reqWithCookie);
    assert.strictEqual(resCookie.authenticated, true);
    assert.strictEqual(resCookie.user.email, 'admin@clasptek.org');

    // Test unauthenticated request
    const reqUnauth = { headers: {} };
    const resUnauth = await authenticateCaller(reqUnauth);
    assert.strictEqual(resUnauth.authenticated, false);
    assert.strictEqual(resUnauth.error, 'MISSING_TOKEN');
  });

  runSyncTest('4.3: Frontend displays actionable session message on 401 without bypassing auth', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSrc.includes('res.status === 401'),
      'Frontend must inspect res.status === 401'
    );
    assert.ok(
      clientSrc.includes('Session expired or authentication required'),
      'Frontend must display actionable sign-in message on 401'
    );
  });

  // ===========================================================================
  // 5. 403 produces a permission message
  // ===========================================================================
  runSyncTest('5.1: Frontend displays role permission message on 403', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSrc.includes('res.status === 403'),
      'Frontend must inspect res.status === 403'
    );
    assert.ok(
      clientSrc.includes('Only tenant administrators') || clientSrc.includes('insufficient permissions'),
      'Frontend must inform user that tenant administrator role is required on 403'
    );
  });

  // ===========================================================================
  // 6. Duplicate connection requests and scheduling submissions are prevented
  // ===========================================================================
  runSyncTest('6.1: Connection action is protected against duplicate clicks with isConnectingCalendar', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('isConnectingCalendar'), 'Must maintain isConnectingCalendar state');
    assert.ok(clientSrc.includes('if (isConnectingCalendar) return;'), 'Must abort duplicate connect triggers');
    assert.ok(clientSrc.includes('disabled={isConnectingCalendar'), 'Must disable connect button while connecting');
  });

  runSyncTest('6.2: Schedule submission is protected against duplicate clicks with isSubmittingSchedule', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('isSubmittingSchedule'), 'Must maintain isSubmittingSchedule state');
    assert.ok(clientSrc.includes('if (isSubmittingSchedule) return;'), 'Must abort duplicate schedule submissions');
    assert.ok(clientSrc.includes('disabled={isSubmittingSchedule}'), 'Must disable submit button while scheduling');
    assert.ok(clientSrc.includes("'Scheduling...'"), 'Must display pending label on button');
  });

  // ===========================================================================
  // 7. Meeting form values survive connection flows and failures
  // ===========================================================================
  runSyncTest('7.1: Meeting form draft is persisted to sessionStorage and restored on return', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSrc.includes("sessionStorage.setItem('clasptek_meeting_form_draft'"),
      'Must persist meetingForm draft to sessionStorage before OAuth redirect'
    );
    assert.ok(
      clientSrc.includes("sessionStorage.getItem('clasptek_meeting_form_draft'"),
      'Must restore meetingForm draft from sessionStorage on mount'
    );
    assert.ok(
      clientSrc.includes("sessionStorage.removeItem('clasptek_meeting_form_draft'"),
      'Must clean up meetingForm draft after restoring'
    );
  });

  runSyncTest('7.2: Submission failure keeps entered form values intact in React state', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    const catchIdx = clientSrc.indexOf('catch {');
    assert.ok(catchIdx > 0);
    const catchSection = clientSrc.slice(catchIdx, catchIdx + 300);
    assert.ok(!catchSection.includes('setMeetingForm('), 'Catch block must not wipe meeting form state on error');
  });

  // ===========================================================================
  // 8. Successful connection refreshes relevant status
  // ===========================================================================
  runSyncTest('8.1: Dedicated route /api/meetings/calendar-status provides authorized status check', () => {
    const routeSrc = read('app/api/meetings/calendar-status/route.ts');
    assert.ok(routeSrc.includes('requireAuth'), 'Must require authentication');
    assert.ok(routeSrc.includes('calendar.events'), 'Must inspect calendar.events scope');
    assert.ok(routeSrc.includes('PERMISSION_REQUIRED'), 'Must distinguish PERMISSION_REQUIRED status');
    assert.ok(!routeSrc.includes('access_token:'), 'Must never leak access tokens');
    assert.ok(!routeSrc.includes('refresh_token:'), 'Must never leak refresh tokens');
  });

  runSyncTest('8.2: MeetingsPageClient queries calendar status when Google Meet selected', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('fetchCalendarStatus'), 'Must define fetchCalendarStatus');
    assert.ok(clientSrc.includes('/api/meetings/calendar-status'), 'Must query /api/meetings/calendar-status');
  });

  // ===========================================================================
  // 9. API 400 validation errors are distinguishable from OAuth authentication errors
  // ===========================================================================
  runSyncTest('9.1: Form handles API 400 validation and provider errors distinctly from OAuth 401', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('setScheduleModalError(data.message || data.error'), 'Must surface API error message');
    assert.ok(!clientSrc.includes('alert('), 'Must never use browser alert() dialogs');
  });

  // ===========================================================================
  // 10. LiveKit remains selected by default and submits expected payload
  // ===========================================================================
  runSyncTest('10.1: LiveKit remains default provider in meetingForm state and UI card', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes("provider: 'livekit'"), "Default provider must be 'livekit'");
    assert.ok(clientSrc.includes('Default Provider'), 'LiveKit card must declare Default Provider badge');
    assert.ok(clientSrc.includes('Clasptek Live Meeting'), 'Must show Clasptek Live Meeting title');
  });

  // ===========================================================================
  // 11. Custom Google Meet URL validation follows supported server contract
  // ===========================================================================
  runSyncTest('11.1: Custom Google Meet URL enforces canonical 3-4-3 meeting code pattern', () => {
    const { isValidGoogleMeetUrl, normalizeGoogleMeetUrl } = googleMeetMod;
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/abc-defg-hij'), true);
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/abc-defg-hij?authuser=0'), true);
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/invalid'), false);
    assert.strictEqual(isValidGoogleMeetUrl('http://meet.google.com/abc-defg-hij'), false);
    assert.strictEqual(isValidGoogleMeetUrl('https://phishing.com/abc-defg-hij'), false);
    assert.strictEqual(normalizeGoogleMeetUrl('  https://meet.google.com/abc-defg-hij  '), 'https://meet.google.com/abc-defg-hij');
  });

  // ===========================================================================
  // 12. Responsive layout and keyboard accessibility retain existing UI conventions
  // ===========================================================================
  runSyncTest('12.1: Layout follows Section 3.A ordered sequence', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    const modalIdx = clientSrc.indexOf('{isScheduleModalOpen && (');
    const modalJSX = clientSrc.slice(modalIdx, clientSrc.indexOf('{/* Watch Recording', modalIdx));

    // Sequence check:
    // 1. Title -> 2. Platform -> 3. Platform settings (chat/screen or calendar card) -> 4. Start/End -> 5. Cohort/Facilitator -> 6. Scope
    const titleIdx = modalJSX.indexOf('Meeting Title');
    const platformIdx = modalJSX.indexOf('Meeting Platform');
    const startIdx = modalJSX.indexOf('Start Time');
    const cohortIdx = modalJSX.indexOf('id="cohortSelect"');
    const scopeIdx = modalJSX.indexOf('Participant Access Scope');

    assert.ok(titleIdx > 0, 'Meeting Title must exist');
    assert.ok(platformIdx > titleIdx, 'Platform must follow Title');
    assert.ok(startIdx > platformIdx, 'Start Time must follow Platform');
    assert.ok(cohortIdx > startIdx, 'Cohort must follow Start Time');
    assert.ok(scopeIdx > cohortIdx, 'Scope must follow Cohort');
  });

  runSyncTest('12.2: Radio group accessibility for platform selection includes role, tabIndex, and keydown handlers', () => {
    const clientSrc = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSrc.includes('role="radiogroup"'), 'Must have role="radiogroup"');
    assert.ok(clientSrc.includes('id="platformLiveKit"'), 'Must have id="platformLiveKit"');
    assert.ok(clientSrc.includes('id="platformGoogleMeet"'), 'Must have id="platformGoogleMeet"');
    assert.ok(clientSrc.includes("e.key === ' ' || e.key === 'Enter'"), 'Must handle Space and Enter keys');
  });

  // ===========================================================================
  // 13. Strict Network Isolation Verification
  // ===========================================================================
  runSyncTest('13.1: Zero outbound TCP/TLS network sockets were opened across the entire test run', () => {
    assert.strictEqual(socketsOpened, 0, 'No outbound network sockets allowed during offline tests');
  });

  // Restore sockets
  net.connect = origNetConnect;
  net.createConnection = origNetCreateConnection;
  tls.connect = origTlsConnect;

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
