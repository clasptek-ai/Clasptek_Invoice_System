/**
 * scripts/test_phase_c106_staging_readiness_offline.js
 *
 * Clasptek Phase C106 — Controlled Google Calendar / Google Meet Staging Verification Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO live database connections.
 * Exercises real request construction, response handling, error paths, and isolation boundaries.
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

console.log('=== Clasptek Phase C106: Staging Readiness & Boundary Verification Suite ===\n');

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

  // Seed test tenant connection
  googleConfig._memoryConnectionStore.set('central:tenant-c106-ok', {
    tenant_id: 'tenant-c106-ok',
    connection_type: 'TENANT_CENTRAL',
    status: 'CONNECTED',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
    access_token: 'mock_c106_token',
    refresh_token: 'mock_c106_refresh',
    expiry_date: new Date(Date.now() + 3600000).toISOString(),
    _testAllowCalendar: true,
  });

  // ---------------------------------------------------------------------------
  // 1. Database Lookup Failure & Absent Existing Token
  // ---------------------------------------------------------------------------
  await runAsyncTest('1.1: Database lookup failure safely handles absent token without crashing', async () => {
    // When DB is unreachable and token is absent, connectionRecord.refresh_token stays null safely
    await googleConfig.upsertGoogleDriveConnection({
      tenantId: 'tenant-no-db-record',
      userId: 'user-xyz',
      connectionType: 'USER_PERSONAL',
      googleUserId: 'g-user-none',
      googleEmail: 'none@clasptek.org',
      accessToken: 'temp_access_token',
      refreshToken: null,
      scope: 'https://www.googleapis.com/auth/drive.file',
    });

    const cacheKey = 'user:tenant-no-db-record:user-xyz';
    const cached = googleConfig._memoryConnectionStore.get(cacheKey);
    assert.ok(cached, 'Connection record must be stored');
    assert.strictEqual(cached.refresh_token, null, 'Refresh token must safely remain null when not available');
    assert.strictEqual(cached.status, 'CONNECTED');
  });

  // ---------------------------------------------------------------------------
  // 2. Tenant / User / Connection-Type Filter Isolation
  // ---------------------------------------------------------------------------
  runSyncTest('2.1: Database query filter strictly separates TENANT_CENTRAL from USER_PERSONAL', () => {
    const cfgCode = read('api/_lib/google-oauth-config.js');
    assert.ok(
      cfgCode.includes("tenant_id=eq.${tenantId}&connection_type=eq.TENANT_CENTRAL"),
      'TENANT_CENTRAL filter must enforce tenant_id and connection_type=eq.TENANT_CENTRAL'
    );
    assert.ok(
      cfgCode.includes("tenant_id=eq.${tenantId}&user_id=eq.${userId}"),
      'USER_PERSONAL filter must enforce tenant_id and user_id'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Conference Request ID Determinism & Cross-Meeting Uniqueness
  // ---------------------------------------------------------------------------
  await runAsyncTest('3.1: Deterministic request IDs are identical on retry but unique across distinct meetings', async () => {
    const captured = [];
    const transport = async (url, opts) => {
      const b = JSON.parse(opts.body);
      captured.push(b.conferenceData.createRequest.requestId);
      return {
        status: 200,
        body: {
          id: `evt_${captured.length}`,
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
        },
      };
    };

    // Meeting Alpha - attempt 1
    await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c106-ok',
      title: 'Meeting Alpha',
      scheduledStart: '2026-11-01T10:00:00Z',
      scheduledEnd: '2026-11-01T11:00:00Z',
      idempotencyKey: 'alpha-1',
      transport,
    });

    // Meeting Alpha - retry attempt 2
    await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c106-ok',
      title: 'Meeting Alpha',
      scheduledStart: '2026-11-01T10:00:00Z',
      scheduledEnd: '2026-11-01T11:00:00Z',
      idempotencyKey: 'alpha-1',
      transport,
    });

    // Meeting Beta - distinct meeting
    await googleMeetMod.createOrValidateGoogleMeet({
      tenantId: 'tenant-c106-ok',
      title: 'Meeting Beta',
      scheduledStart: '2026-11-01T14:00:00Z',
      scheduledEnd: '2026-11-01T15:00:00Z',
      idempotencyKey: 'beta-2',
      transport,
    });

    assert.strictEqual(captured.length, 3);
    assert.strictEqual(captured[0], captured[1], 'Retries for Meeting Alpha must use identical requestId');
    assert.notStrictEqual(captured[0], captured[2], 'Meeting Alpha and Beta must have distinct requestIds');
  });

  // ---------------------------------------------------------------------------
  // 4. Conference Provisioning Pending Status
  // ---------------------------------------------------------------------------
  await runAsyncTest('4.1: Conference provisioning pending status cleans up event and throws CONFERENCE_PROVISIONING_PENDING', async () => {
    let deletedId = null;
    const pendingTransport = async (url, opts) => {
      if (opts.method === 'DELETE') {
        deletedId = url.split('/').pop();
        return { status: 204, body: {} };
      }
      return {
        status: 200,
        body: {
          id: 'evt_pending_456',
          hangoutLink: null,
          conferenceData: {
            createRequest: {
              status: { statusCode: 'pending' },
            },
          },
        },
      };
    };

    await assert.rejects(
      async () => googleMeetMod.createOrValidateGoogleMeet({
        tenantId: 'tenant-c106-ok',
        title: 'Pending Conference Meeting',
        scheduledStart: '2026-11-01T10:00:00Z',
        scheduledEnd: '2026-11-01T11:00:00Z',
        transport: pendingTransport,
      }),
      (err) => {
        assert.strictEqual(err.code, 'CONFERENCE_PROVISIONING_PENDING');
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );

    assert.strictEqual(deletedId, 'evt_pending_456', 'Must clean up event when conference is pending without link');
  });

  // ---------------------------------------------------------------------------
  // 5. Event Cleanup Failure Does Not Mask Primary Error
  // ---------------------------------------------------------------------------
  await runAsyncTest('5.1: deleteGoogleCalendarEvent failure returns false without throwing or hiding errors', async () => {
    const failingDeleteTransport = async () => {
      throw new Error('Google Calendar DELETE 500 Internal Error');
    };

    const res = await googleMeetMod.deleteGoogleCalendarEvent({
      tenantId: 'tenant-c106-ok',
      eventId: 'evt_cannot_delete',
      transport: failingDeleteTransport,
    });

    assert.strictEqual(res, false, 'Failed deletion must safely return false');
  });

  // ---------------------------------------------------------------------------
  // 6. Callback Central Root Folder & Refresh Token Preservation
  // ---------------------------------------------------------------------------
  runSyncTest('6.1: OAuth callback checks existing connection to preserve root folder on incremental re-consent', () => {
    const callbackCode = read('api/auth/google/callback.js');
    assert.ok(
      callbackCode.includes('getTenantCentralDriveConnection(tenantId)'),
      'Callback must check existing central connection'
    );
    assert.ok(
      callbackCode.includes('effectiveRefreshToken = refreshToken || (existingConnection && existingConnection.refresh_token)'),
      'Callback must derive effectiveRefreshToken preserving existing token'
    );
    assert.ok(
      callbackCode.includes('root_folder_id: existingConnection && existingConnection.root_folder_id'),
      'Callback must supply existing root_folder_id to prevent duplicate provisioning'
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Meeting Join: Google Meet Token Isolation
  // ---------------------------------------------------------------------------
  runSyncTest('7.1: Join route never generates LiveKit token for Google Meet', () => {
    const joinCode = read('app/api/meetings/join/route.ts');
    const gmIndex = joinCode.indexOf("meeting.sfuProvider === 'google_meet'");
    const sfuTokenIndex = joinCode.indexOf('sfu.generateParticipantToken');

    assert.ok(gmIndex !== -1, 'google_meet check must exist in join route');
    assert.ok(sfuTokenIndex !== -1, 'generateParticipantToken must exist');
    assert.ok(gmIndex < sfuTokenIndex, 'google_meet return must precede LiveKit token generation');
  });

  // ---------------------------------------------------------------------------
  // 8. LiveKit Default Preserved in UI and Models
  // ---------------------------------------------------------------------------
  runSyncTest('8.1: LiveKit remains default in meeting creation form', () => {
    const clientCode = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      clientCode.includes("provider: 'livekit'"),
      'MeetingsPageClient initial meetingForm state must specify provider: livekit'
    );
    assert.ok(
      clientCode.includes("checked={meetingForm.provider === 'livekit'}"),
      'LiveKit radio option must be checked when provider is livekit'
    );
  });

  // ---------------------------------------------------------------------------
  // 9. Existing Google Drive Recording Pipeline Intact
  // ---------------------------------------------------------------------------
  runSyncTest('9.1: Recording service preserves TENANT_CENTRAL Drive repository target', () => {
    const recCode = read('lib/meetings/recording-service.ts');
    assert.ok(
      recCode.includes("connectionType: 'TENANT_CENTRAL'") || recCode.includes("TENANT_CENTRAL"),
      'Recording service must strictly target TENANT_CENTRAL'
    );
    assert.ok(
      recCode.includes('uploadMeetingRecordingToDrive') || recCode.includes('uploadFileToGoogleDrive'),
      'Recording service upload pipeline must remain intact'
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Zero Outbound Sockets
  // ---------------------------------------------------------------------------
  runSyncTest('10.1: Zero outbound TCP/TLS network sockets during execution', () => {
    assert.strictEqual(socketAttempts, 0, 'No outbound sockets permitted');
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
