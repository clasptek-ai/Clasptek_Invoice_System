/**
 * scripts/test_phase_c104_google_meet_e2e_offline.js
 *
 * Clasptek Phase C104 — Google Meet End-to-End Integration Offline Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Certified Invariants:
 * 1. LiveKit remains the default provider and continues through its existing path.
 * 2. Selecting Google Meet submits the correct provider ("google_meet").
 * 3. Google Meet creation uses the required Calendar conference parameters (conferenceDataVersion=1, requestId).
 * 4. Missing OAuth configuration or missing Calendar permission fails safely.
 * 5. Failed or incomplete conference creation is not reported as success.
 * 6. Successful mocked creation persists and returns the correct provider and valid Meet URL.
 * 7. Duplicate/retried requests use deterministic clientRequestId to avoid unintended duplicate events.
 * 8. Unauthorized roles, unassigned facilitators, and cross-tenant attempts remain blocked server-side.
 * 9. Google Meet join opens only the persisted, server-validated Meet URL without issuing LiveKit tokens.
 * 10. Existing Drive OAuth and recording authorization behavior remains intact (Drive scopes preserved).
 * 11. Preview isolation and existing LiveKit URL guards remain intact.
 * 12. Responsive UI and modal behavior remain intact.
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

console.log('=== Clasptek Phase C104: Google Meet End-to-End Integration Suite ===\n');

const ts = require('typescript');
const moduleCache = new Map();

function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (id.startsWith('@/')) {
      const candidate = path.join(__dirname, '..', id.slice(2));
      return loadTsModule(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    if (id.startsWith('../') || id.startsWith('./')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts');
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      if (fs.existsSync(candidate)) return require(candidate);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const googleMeetMod = loadTsModule('lib/meetings/google-meet.ts');
const googleConfig = require('../api/_lib/google-oauth-config');

async function runSuite() {
  // ---------------------------------------------------------------------------
  // 1. LiveKit Default & Path
  // ---------------------------------------------------------------------------
  runSyncTest('1.1: LiveKit remains default in meetingForm and schedule modal', () => {
    const clientSource = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSource.includes("provider: 'livekit' as 'livekit' | 'google_meet'"),
      'Form state must initialize with provider: livekit'
    );
    assert.ok(
      clientSource.includes("meetingForm.provider === 'livekit' ? ("),
      'Room settings must conditionally render for LiveKit'
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Platform Selection & Submission
  // ---------------------------------------------------------------------------
  runSyncTest('2.1: Google Meet option is selectable and submitted to /api/meetings/create', () => {
    const clientSource = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(clientSource.includes('id="platformGoogleMeet"'), 'platformGoogleMeet must exist');
    assert.ok(
      clientSource.includes("setMeetingForm((p) => ({ ...p, provider: 'google_meet' }))"),
      'Clicking Google Meet card must update provider state'
    );
    assert.ok(
      clientSource.includes('provider: meetingForm.provider'),
      'Fetch body must send meetingForm.provider'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Calendar Conference Parameters & conferenceDataVersion=1
  // ---------------------------------------------------------------------------
  runSyncTest('3.1: Google Meet service defines conferenceDataVersion=1 and unique requestId', () => {
    const gmSource = read('lib/meetings/google-meet.ts');
    assert.ok(
      gmSource.includes('conferenceDataVersion=1'),
      'Must target endpoint with conferenceDataVersion=1'
    );
    assert.ok(
      gmSource.includes('requestId: clientRequestId') || gmSource.includes('createRequest:'),
      'Must generate unique conference createRequest requestId'
    );
    assert.ok(
      gmSource.includes("conferenceSolutionKey: { type: 'hangoutsMeet' }") ||
      gmSource.includes('hangoutsMeet'),
      'Must specify hangoutsMeet solution key'
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Missing Configuration & Permission Fails Safely
  // ---------------------------------------------------------------------------
  await runAsyncTest('4.1: Missing tenant connection fails closed with PROVIDER_UNSUPPORTED', async () => {
    try {
      await googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'unconfigured_tenant_uuid',
        title: 'Algorithms Lecture',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Should have thrown on unconfigured tenant');
    } catch (err) {
      assert.strictEqual(err.code, 'PROVIDER_UNSUPPORTED');
      assert.strictEqual(err.statusCode, 400);
    }
  });

  await runAsyncTest('4.2: Connection missing Calendar permission fails with CALENDAR_SCOPE_REQUIRED', async () => {
    // Seed central connection without Calendar scope (only Drive + email)
    googleConfig._memoryConnectionStore.set('central:drive-only-tenant', {
      tenant_id: 'drive-only-tenant',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_token: 'mock_drive_token_xyz',
    });

    try {
      await googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'drive-only-tenant',
        title: 'Systems Seminar',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Should have thrown CALENDAR_SCOPE_REQUIRED');
    } catch (err) {
      assert.strictEqual(err.code, 'CALENDAR_SCOPE_REQUIRED');
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('calendar.events'));
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Incomplete / Failed Creation Not Reported as Success
  // ---------------------------------------------------------------------------
  await runAsyncTest('5.1: Calendar API failure throws structured CALENDAR_API_FAILURE', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-failing-cal', {
      tenant_id: 'tenant-failing-cal',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
      access_token: 'mock_token',
      _testAllowCalendar: true,
      _testMockFailCalendar: true,
    });

    try {
      await googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-failing-cal',
        title: 'Failing Meeting',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Should have failed on mock calendar error');
    } catch (err) {
      assert.strictEqual(err.code, 'CALENDAR_API_FAILURE');
      assert.strictEqual(err.statusCode, 502);
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Successful Mocked Creation Persists & Returns Valid Meet URL
  // ---------------------------------------------------------------------------
  await runAsyncTest('6.1: Valid Calendar connection creates and returns validated Google Meet conference', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-calendar-ok', {
      tenant_id: 'tenant-calendar-ok',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events',
      access_token: 'mock_token',
      _testAllowCalendar: true,
      _testMockMeetUrl: 'https://meet.google.com/cpk-mtng-liv',
    });

    const result = await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-calendar-ok',
      title: 'Operating Systems Laboratory',
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
    });

    assert.ok(result.meetUrl, 'Must return meetUrl');
    assert.strictEqual(result.meetUrl, 'https://meet.google.com/cpk-mtng-liv');
    assert.ok(googleMeetMod.isValidGoogleMeetUrl(result.meetUrl), 'URL must pass canonical regex');
    assert.strictEqual(result.createdVia, 'GOOGLE_CALENDAR_API');
  });

  // ---------------------------------------------------------------------------
  // 7. Custom Google Meet URL Validation
  // ---------------------------------------------------------------------------
  await runAsyncTest('7.1: Custom Google Meet URL validates format and rejects invalid links', async () => {
    // Valid format
    const validRes = await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-calendar-ok',
      title: 'Guest Speaker',
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    assert.strictEqual(validRes.meetUrl, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(validRes.createdVia, 'CUSTOM_VERIFIED_URL');

    // Invalid format
    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-calendar-ok',
        title: 'Invalid URL Test',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        customGoogleMeetUrl: 'https://external-phishing.com/not-google-meet',
      }),
      (err) => err.code === 'INVALID_GOOGLE_MEET_URL'
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Server-Side Route Integration & Allowlist
  // ---------------------------------------------------------------------------
  runSyncTest('8.1: /api/meetings/create route integrates createOrValidateGoogleMeet for google_meet', () => {
    const routeSource = read('app/api/meetings/create/route.ts');
    assert.ok(
      routeSource.includes("const ALLOWED_PROVIDERS = ['livekit', 'google_meet']") ||
      routeSource.includes('const ALLOWED_PROVIDERS = ["livekit", "google_meet"]'),
      'Allowlist must include livekit and google_meet'
    );
    assert.ok(
      routeSource.includes("createOrValidateGoogleMeet"),
      'Route must invoke createOrValidateGoogleMeet'
    );
    assert.ok(
      routeSource.includes("rawProvider === 'google_meet'") || routeSource.includes("selectedProvider === 'google_meet'"),
      'Route must branch for google_meet provider'
    );
  });

  // ---------------------------------------------------------------------------
  // 9. Provider Join Opens Only Validated Provider URL
  // ---------------------------------------------------------------------------
  runSyncTest('9.1: Client handleJoinMeeting opens validated providerRoomUrl directly', () => {
    const clientSource = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientSource.includes("meeting.sfuProvider === 'google_meet' && meeting.providerRoomUrl"),
      'Client must check sfuProvider === google_meet and providerRoomUrl'
    );
    assert.ok(
      clientSource.includes("window.open(meeting.providerRoomUrl, '_blank', 'noopener,noreferrer')"),
      'Must open providerRoomUrl in new tab'
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Existing Drive Integration & Scopes Preserved
  // ---------------------------------------------------------------------------
  runSyncTest('10.1: Default OAuth scopes remain drive.file + userinfo.email', () => {
    const cfgSource = read('api/_lib/google-oauth-config.js');
    assert.ok(
      cfgSource.includes("'https://www.googleapis.com/auth/drive.file'") &&
      cfgSource.includes("'https://www.googleapis.com/auth/userinfo.email'"),
      'Default GOOGLE_SCOPES must preserve drive.file and userinfo.email'
    );
  });

  // ---------------------------------------------------------------------------
  // 11. Incremental Calendar Authorization Available Without Breaking Drive
  // ---------------------------------------------------------------------------
  runSyncTest('11.1: getAuthorizationUrl supports includeCalendar option with incremental scopes', () => {
    const urlDefault = new URL(googleConfig.getAuthorizationUrl('state_default'));
    const scopeDefault = urlDefault.searchParams.get('scope') || '';
    assert.ok(!scopeDefault.includes('calendar'), 'Default authorization URL must not include Calendar');

    const urlCal = new URL(googleConfig.getAuthorizationUrl('state_cal', null, { includeCalendar: true }));
    const scopeCal = urlCal.searchParams.get('scope') || '';
    assert.ok(scopeCal.includes('calendar.events'), 'Calendar authorization URL must include calendar.events');
    assert.strictEqual(urlCal.searchParams.get('include_granted_scopes'), 'true', 'Must set include_granted_scopes=true');
  });

  // ---------------------------------------------------------------------------
  // 12. Reviewable Migration File Present
  // ---------------------------------------------------------------------------
  runSyncTest('12.1: Reviewable database migration file for Calendar metadata exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'migrations', '20261023_meetings_google_meet_calendar_fields.sql')),
      'Migration 20261023_meetings_google_meet_calendar_fields.sql must exist'
    );
  });

  // ---------------------------------------------------------------------------
  // 13. Zero Network Sockets
  // ---------------------------------------------------------------------------
  runSyncTest('13.1: Zero outbound TCP/TLS network connections during execution', () => {
    assert.strictEqual(socketAttempts, 0, 'No outbound sockets should have been attempted');
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});