/**
 * scripts/test_phase_c105_integrity_audit_offline.js
 *
 * Clasptek Phase C105 — Google Meet Integration Integrity Audit and Remediation Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO live database connections.
 * Injected mocks exercising real service logic and transport boundaries.
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

console.log('=== Clasptek Phase C105: Google Meet Integration Integrity Audit Suite ===\n');

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
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', js);
  fn(customRequire, mod, mod.exports, path.dirname(fullPath), fullPath);
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

async function runSuite() {
  const googleMeetMod = loadTsModule('lib/meetings/google-meet.ts');
  const googleConfig = require('../api/_lib/google-oauth-config');

  // Seed mock connection store with certified tenant
  googleConfig._memoryConnectionStore.set('central:tenant-c105-ok', {
    tenant_id: 'tenant-c105-ok',
    connection_type: 'TENANT_CENTRAL',
    status: 'CONNECTED',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
    access_token: 'mock_c105_access_token',
    refresh_token: 'mock_c105_refresh_token',
    expiry_date: new Date(Date.now() + 3600000).toISOString(),
    _testAllowCalendar: true,
  });

  googleConfig._memoryConnectionStore.set('central:tenant-c105-drive-only', {
    tenant_id: 'tenant-c105-drive-only',
    connection_type: 'TENANT_CENTRAL',
    status: 'CONNECTED',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    access_token: 'mock_drive_only_token',
    refresh_token: 'mock_drive_only_refresh',
    expiry_date: new Date(Date.now() + 3600000).toISOString(),
  });

  // ---------------------------------------------------------------------------
  // 1. Injected Transport: Real Service Logic & Meet URL Extraction
  // ---------------------------------------------------------------------------
  await runAsyncTest('1.1: Real service logic executes endpoint, parameters and extracts Meet URL', async () => {
    let capturedUrl = null;
    let capturedOptions = null;

    const mockTransport = async (url, opts) => {
      capturedUrl = url;
      capturedOptions = opts;
      const body = JSON.parse(opts.body);

      assert.strictEqual(opts.method, 'POST');
      assert.strictEqual(opts.headers.Authorization, 'Bearer mock_c105_access_token');
      assert.strictEqual(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
      assert.ok(body.conferenceData.createRequest.requestId, 'Must contain requestId');

      return {
        status: 200,
        body: {
          id: 'cal_evt_real_105',
          hangoutLink: 'https://meet.google.com/xyz-uvwx-rst',
          conferenceData: {
            conferenceId: 'xyz-uvwx-rst',
          },
        },
      };
    };

    const res = await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c105-ok',
      title: 'Distributed Systems Lecture',
      scheduledStart: '2026-11-01T10:00:00Z',
      scheduledEnd: '2026-11-01T12:00:00Z',
      idempotencyKey: 'public-id-abc',
      transport: mockTransport,
    });

    assert.ok(capturedUrl.includes('conferenceDataVersion=1'), 'Endpoint must include conferenceDataVersion=1');
    assert.strictEqual(res.meetUrl, 'https://meet.google.com/xyz-uvwx-rst');
    assert.strictEqual(res.calendarEventId, 'cal_evt_real_105');
    assert.strictEqual(res.conferenceId, 'xyz-uvwx-rst');
    assert.strictEqual(res.createdVia, 'GOOGLE_CALENDAR_API');
  });

  // ---------------------------------------------------------------------------
  // 2. Missing Scope and Authorization Failures
  // ---------------------------------------------------------------------------
  await runAsyncTest('2.1: Drive-only connection without Calendar scope is rejected safely', async () => {
    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-drive-only',
        title: 'Unauthorized Calendar Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
      }),
      (err) => {
        assert.strictEqual(err.code, 'CALENDAR_SCOPE_REQUIRED');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 3. HTTP Error Mapping: 401, 403, 429, 500, Timeout
  // ---------------------------------------------------------------------------
  await runAsyncTest('3.1: Google API 401 maps to CREDENTIALS_EXPIRED without token leakage', async () => {
    const mockTransport401 = async () => ({
      status: 401,
      body: { error: { message: 'Invalid Credentials', code: 401 } },
    });

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Auth Expired Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
        transport: mockTransport401,
      }),
      (err) => {
        assert.strictEqual(err.code, 'CREDENTIALS_EXPIRED');
        assert.strictEqual(err.statusCode, 401);
        assert.ok(!err.message.includes('mock_c105_access_token'), 'Error must not leak access token');
        return true;
      }
    );
  });

  await runAsyncTest('3.2: Google API 403 maps to CALENDAR_SCOPE_REQUIRED', async () => {
    const mockTransport403 = async () => ({
      status: 403,
      body: { error: { message: 'Insufficient Permission', code: 403 } },
    });

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Forbidden Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
        transport: mockTransport403,
      }),
      (err) => {
        assert.strictEqual(err.code, 'CALENDAR_SCOPE_REQUIRED');
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });

  await runAsyncTest('3.3: Google API 429 maps to RATE_LIMITED', async () => {
    const mockTransport429 = async () => ({
      status: 429,
      body: { error: { message: 'Rate Limit Exceeded', code: 429 } },
    });

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Rate Limited Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
        transport: mockTransport429,
      }),
      (err) => {
        assert.strictEqual(err.code, 'RATE_LIMITED');
        assert.strictEqual(err.statusCode, 429);
        return true;
      }
    );
  });

  await runAsyncTest('3.4: Network timeout maps to CALENDAR_TIMEOUT (504)', async () => {
    const mockTimeout = async () => {
      const err = new Error('Connection timed out');
      err.code = 'ETIMEDOUT';
      throw err;
    };

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Timeout Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
        transport: mockTimeout,
      }),
      (err) => {
        assert.strictEqual(err.code, 'CALENDAR_TIMEOUT');
        assert.strictEqual(err.statusCode, 504);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Orphaned Calendar Event Cleanup
  // ---------------------------------------------------------------------------
  await runAsyncTest('4.1: Missing Meet URL triggers immediate DELETE cleanup of orphaned event', async () => {
    let deletedUrl = null;
    let deletedMethod = null;

    const mockTransportMissingLink = async (url, opts) => {
      if (opts.method === 'DELETE') {
        deletedUrl = url;
        deletedMethod = opts.method;
        return { status: 204, body: {} };
      }
      return {
        status: 200,
        body: {
          id: 'cal_orphan_999',
          hangoutLink: null, // Google created event, but no Meet conference link
          conferenceData: {},
        },
      };
    };

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Missing Link Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T12:00:00Z',
        transport: mockTransportMissingLink,
      }),
      (err) => {
        assert.strictEqual(err.code, 'CONFERENCE_DATA_MISSING');
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );

    assert.strictEqual(deletedMethod, 'DELETE');
    assert.ok(deletedUrl.includes('cal_orphan_999'), 'DELETE call must clean up orphaned event ID');
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic Idempotency Key
  // ---------------------------------------------------------------------------
  await runAsyncTest('5.1: Retry with same logical meeting derives identical clientRequestId', async () => {
    const recordedRequestIds = [];

    const captureTransport = async (url, opts) => {
      const b = JSON.parse(opts.body);
      recordedRequestIds.push(b.conferenceData.createRequest.requestId);
      return {
        status: 200,
        body: {
          id: 'cal_idem_1',
          hangoutLink: 'https://meet.google.com/ide-mpot-ent',
        },
      };
    };

    // First attempt
    await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c105-ok',
      title: 'Idempotency Test Meeting',
      scheduledStart: '2026-11-01T10:00:00Z',
      scheduledEnd: '2026-11-01T12:00:00Z',
      idempotencyKey: 'mtg-idem-12345',
      transport: captureTransport,
    });

    // Retry attempt
    await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c105-ok',
      title: 'Idempotency Test Meeting',
      scheduledStart: '2026-11-01T10:00:00Z',
      scheduledEnd: '2026-11-01T12:00:00Z',
      idempotencyKey: 'mtg-idem-12345',
      transport: captureTransport,
    });

    assert.strictEqual(recordedRequestIds.length, 2);
    assert.strictEqual(recordedRequestIds[0], recordedRequestIds[1], 'Request IDs must be strictly identical on retry');
  });

  // ---------------------------------------------------------------------------
  // 6. Time Range Validation
  // ---------------------------------------------------------------------------
  await runAsyncTest('6.1: Invalid schedule times (end <= start or invalid format) fail with 400', async () => {
    // End before start
    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Backwards Time Meeting',
        scheduledStart: '2026-11-01T12:00:00Z',
        scheduledEnd: '2026-11-01T10:00:00Z',
      }),
      (err) => err.code === 'INVALID_TIME_RANGE' && err.statusCode === 400
    );

    // Invalid format
    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c105-ok',
        title: 'Malformed Time Meeting',
        scheduledStart: 'not-a-date',
        scheduledEnd: 'also-not-a-date',
      }),
      (err) => err.code === 'INVALID_TIME_RANGE' && err.statusCode === 400
    );
  });

  // ---------------------------------------------------------------------------
  // 7. deleteGoogleCalendarEvent Helper
  // ---------------------------------------------------------------------------
  await runAsyncTest('7.1: deleteGoogleCalendarEvent helper cleans up external event safely', async () => {
    let deletedUrl = null;
    const mockDeleteTransport = async (url, opts) => {
      deletedUrl = url;
      return { status: 204, body: {} };
    };

    const ok = await googleMeetMod.deleteGoogleCalendarEvent({
      tenantId: 'tenant-c105-ok',
      eventId: 'evt_to_cancel_123',
      transport: mockDeleteTransport,
    });

    assert.strictEqual(ok, true);
    assert.ok(deletedUrl.includes('evt_to_cancel_123'), 'URL must target eventId');
  });

  // ---------------------------------------------------------------------------
  // 8. OAuth Incremental Re-consent: Refresh Token Retention
  // ---------------------------------------------------------------------------
  await runAsyncTest('8.1: upsertGoogleDriveConnection preserves refresh_token from memory cache if omitted', async () => {
    // Seed initial connection with refresh token
    await googleConfig.upsertGoogleDriveConnection({
      tenantId: 'tenant-reconsent-test',
      userId: 'admin-1',
      connectionType: 'TENANT_CENTRAL',
      googleUserId: 'g-user-1',
      googleEmail: 'admin@clasptek.org',
      accessToken: 'first_access_token',
      refreshToken: 'authoritative_refresh_token_keep_me',
      rootFolderId: 'folder-123',
      rootFolderName: 'Clasptek Recordings',
      scope: 'https://www.googleapis.com/auth/drive.file',
    });

    // Re-consent for incremental Calendar scope: Google returns access_token & scope, but OMITs refresh_token
    await googleConfig.upsertGoogleDriveConnection({
      tenantId: 'tenant-reconsent-test',
      userId: 'admin-1',
      connectionType: 'TENANT_CENTRAL',
      googleUserId: 'g-user-1',
      googleEmail: 'admin@clasptek.org',
      accessToken: 'second_access_token',
      refreshToken: null, // Google omitted refresh_token!
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
    });

    // Verify stored connection retained authoritative_refresh_token_keep_me
    const status = await googleConfig.getTenantCentralDriveConnection('tenant-reconsent-test');
    assert.strictEqual(
      status.refresh_token,
      'authoritative_refresh_token_keep_me',
      'Existing refresh token must NOT be overwritten with null'
    );
    assert.strictEqual(
      status.root_folder_id,
      'folder-123',
      'Existing root_folder_id must NOT be lost'
    );
  });

  // ---------------------------------------------------------------------------
  // 9. Meeting Join: Google Meet vs LiveKit Token Boundary
  // ---------------------------------------------------------------------------
  runSyncTest('9.1: Join route redirects Google Meet meetings to verified URL with zero LiveKit token', () => {
    const joinSource = read('app/api/meetings/join/route.ts');
    assert.ok(
      joinSource.includes("meeting.sfuProvider === 'google_meet'"),
      'Join route must branch for google_meet'
    );
    assert.ok(
      joinSource.includes("redirectUrl: meeting.providerRoomUrl"),
      'Join route must return redirectUrl targeting verified providerRoomUrl'
    );
    assert.ok(
      joinSource.includes("sfu.generateParticipantToken"),
      'LiveKit token issuance must remain isolated to LiveKit branch'
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Meeting Sharing: Google Meet Invitation Content
  // ---------------------------------------------------------------------------
  runSyncTest('10.1: ShareMeetingModal displays Google Meet link and platform title', () => {
    const shareSource = read('components/meetings/ShareMeetingModal.tsx');
    assert.ok(
      shareSource.includes("Platform: Google Meet"),
      'Share modal must identify Google Meet platform'
    );
    assert.ok(
      shareSource.includes("meeting.providerRoomUrl"),
      'Share modal must offer real providerRoomUrl'
    );
    assert.ok(
      !shareSource.includes("This meeting was created on a retired video provider"),
      'Retired provider banner must be eliminated'
    );
  });

  // ---------------------------------------------------------------------------
  // 11. Database Cleanup on Create Failure
  // ---------------------------------------------------------------------------
  runSyncTest('11.1: Create route triggers deleteGoogleCalendarEvent if saveMeetingRecord fails', () => {
    const createSource = read('app/api/meetings/create/route.ts');
    assert.ok(
      createSource.includes('deleteGoogleCalendarEvent'),
      'Create route must invoke deleteGoogleCalendarEvent on saveMeetingRecord error'
    );
    assert.ok(
      createSource.includes('idempotencyKey: publicId'),
      'Create route must pass deterministic idempotencyKey'
    );
  });

  // ---------------------------------------------------------------------------
  // 12. Zero Outbound Network Sockets
  // ---------------------------------------------------------------------------
  runSyncTest('12.1: Zero outbound TCP/TLS network connections during execution', () => {
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
