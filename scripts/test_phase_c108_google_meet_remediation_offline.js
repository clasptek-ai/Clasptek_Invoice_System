/**
 * scripts/test_phase_c108_google_meet_remediation_offline.js
 *
 * Clasptek Phase C108 — Google Meet Blocker Remediation & Safety Verification Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO live database connections.
 *
 * Remediated Items Verified:
 * 1. Blocker 1: api/auth/google/callback.js properly imports getTenantCentralDriveConnection.
 * 2. Blocker 1: Callback handles tenant-central re-consent with existing refresh_token fallback.
 * 3. Blocker 1: Callback preserves existing root folder id and name when Google omits replacement values.
 * 4. Blocker 3: staging-bootstrap/meetings_preview_bootstrap.sql allows GOOGLE_MEET alongside LIVEKIT, DAILY, MOCK.
 * 5. Blocker 3: Bootstrap schema preserves LIVEKIT as the default provider.
 * 6. Blocker 2: migrations/20261023_meetings_google_meet_calendar_fields.sql correctly checks
 *    table_name = 'meetings' AND column_name = 'calendar_conference_id' without typo.
 * 7. Cancellation & Deletion: deleteMeetingSafe soft-deletes with status = 'CANCELLED' and preserves LiveKit lifecycle.
 * 8. Cancellation & Deletion: deleteGoogleCalendarEvent fails closed safely on network/API failure.
 * 9. Isolation: Zero network sockets opened during execution.
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

async function main() {
  console.log('=== Clasptek Phase C108: Google Meet Blocker Remediation Offline Suite ===\n');

  // =============================================================================
  // 1. Blocker 1: OAuth Callback Import & Wiring
  // =============================================================================
  runSyncTest('1.1: callback.js imports getTenantCentralDriveConnection from google-oauth-config', () => {
    const callbackCode = read('api/auth/google/callback.js');
    assert.ok(
      callbackCode.includes('getTenantCentralDriveConnection'),
      'callback.js must import getTenantCentralDriveConnection'
    );
    assert.ok(
      /getTenantCentralDriveConnection[\s\S]*require\(['"]\.\.\/\.\.\/_lib\/google-oauth-config['"]\)/.test(callbackCode),
      'getTenantCentralDriveConnection must be imported from ../../_lib/google-oauth-config'
    );
  });

  runSyncTest('1.2: google-oauth-config.js exports getTenantCentralDriveConnection', () => {
    const configCode = read('api/_lib/google-oauth-config.js');
    assert.ok(
      configCode.includes('getTenantCentralDriveConnection'),
      'google-oauth-config.js must define getTenantCentralDriveConnection'
    );
    assert.ok(
      /module\.exports\s*=\s*\{[\s\S]*getTenantCentralDriveConnection[\s\S]*\}/.test(configCode),
      'google-oauth-config.js must export getTenantCentralDriveConnection'
    );
  });

  runSyncTest('1.3: callback.js uses existingConnection to preserve refresh_token on re-consent', () => {
    const callbackCode = read('api/auth/google/callback.js');
    assert.ok(
      callbackCode.includes('existingConnection = await getTenantCentralDriveConnection(tenantId)'),
      'callback.js must attempt to load existing tenant-central connection'
    );
    assert.ok(
      callbackCode.includes('effectiveRefreshToken = refreshToken || (existingConnection && existingConnection.refresh_token)'),
      'effectiveRefreshToken must fall back to existingConnection.refresh_token'
    );
    assert.ok(
      callbackCode.includes('refreshToken: effectiveRefreshToken'),
      'upsertGoogleDriveConnection must receive effectiveRefreshToken'
    );
  });

  runSyncTest('1.4: callback.js preserves existing root_folder_id on re-consent', () => {
    const callbackCode = read('api/auth/google/callback.js');
    assert.ok(
      callbackCode.includes('rootFolderId || (existingConnection && existingConnection.root_folder_id)'),
      'rootFolderId must fall back to existingConnection.root_folder_id if resolution omitted'
    );
    assert.ok(
      callbackCode.includes('rootFolderName || (existingConnection && existingConnection.root_folder_name)'),
      'rootFolderName must fall back to existingConnection.root_folder_name if resolution omitted'
    );
  });

  // =============================================================================
  // 2. Blocker 3: Bootstrap Schema Provider Constraint
  // =============================================================================
  runSyncTest('2.1: meetings_preview_bootstrap.sql allows GOOGLE_MEET in provider constraint', () => {
    const bootstrapSql = read('staging-bootstrap/meetings_preview_bootstrap.sql');
    const constraintMatch = bootstrapSql.match(/CHECK\s*\(\s*provider\s+IN\s*\(([^)]+)\)\s*\)/i);
    assert.ok(constraintMatch, 'Provider CHECK constraint must be present in meetings_preview_bootstrap.sql');
    const allowed = constraintMatch[1];
    assert.ok(allowed.includes("'LIVEKIT'"), 'Must allow LIVEKIT');
    assert.ok(allowed.includes("'DAILY'"), 'Must allow DAILY');
    assert.ok(allowed.includes("'MOCK'"), 'Must allow MOCK');
    assert.ok(allowed.includes("'GOOGLE_MEET'"), 'Must allow GOOGLE_MEET');
  });

  runSyncTest('2.2: Bootstrap schema preserves LIVEKIT as default provider', () => {
    const bootstrapSql = read('staging-bootstrap/meetings_preview_bootstrap.sql');
    assert.ok(
      /provider\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'LIVEKIT'/i.test(bootstrapSql),
      "provider column must default to 'LIVEKIT'"
    );
  });

  runSyncTest('2.3: Provider constraint rejects non-allowlisted values', () => {
    const bootstrapSql = read('staging-bootstrap/meetings_preview_bootstrap.sql');
    const constraintMatch = bootstrapSql.match(/CHECK\s*\(\s*provider\s+IN\s*\(([^)]+)\)\s*\)/i);
    assert.ok(constraintMatch);
    const allowedProviders = constraintMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''));
    assert.strictEqual(allowedProviders.includes('ZOOM'), false, 'ZOOM must not be allowed');
    assert.strictEqual(allowedProviders.includes('TEAMS'), false, 'TEAMS must not be allowed');
    assert.strictEqual(allowedProviders.includes('WEBEX'), false, 'WEBEX must not be allowed');
    assert.deepStrictEqual(allowedProviders.sort(), ['DAILY', 'GOOGLE_MEET', 'LIVEKIT', 'MOCK'].sort());
  });

  // =============================================================================
  // 3. Blocker 2: Migration SQL Column Existence Check Typo
  // =============================================================================
  runSyncTest('3.1: Migration SQL checks table_name = meetings for calendar_conference_id', () => {
    const migrationSql = read('migrations/20261023_meetings_google_meet_calendar_fields.sql');
    assert.ok(
      !migrationSql.includes("table_name = 'calendar_conference_id'"),
      "Typo table_name = 'calendar_conference_id' must be eliminated"
    );
    assert.ok(
      /table_name\s*=\s*'meetings'\s+AND\s+column_name\s*=\s*'calendar_conference_id'/i.test(migrationSql),
      "Must check table_name = 'meetings' AND column_name = 'calendar_conference_id'"
    );
  });

  runSyncTest('3.2: Migration SQL checks table_name = meetings for calendar_event_id', () => {
    const migrationSql = read('migrations/20261023_meetings_google_meet_calendar_fields.sql');
    assert.ok(
      /table_name\s*=\s*'meetings'\s+AND\s+column_name\s*=\s*'calendar_event_id'/i.test(migrationSql),
      "Must check table_name = 'meetings' AND column_name = 'calendar_event_id'"
    );
  });

  // =============================================================================
  // 4. Cancellation & Lifecycle Verification
  // =============================================================================
  runSyncTest('4.1: deleteMeetingSafe performs soft-delete setting status to CANCELLED', () => {
    const queriesCode = read('lib/meetings/queries.ts');
    assert.ok(
      queriesCode.includes("status: 'CANCELLED'"),
      "deleteMeetingSafe must set status to 'CANCELLED'"
    );
    assert.ok(
      queriesCode.includes('deleted_at: now'),
      'deleteMeetingSafe must set deleted_at timestamp'
    );
  });

  runSyncTest('4.2: LiveKit meeting lifecycle remains unchanged', () => {
    const sfuCode = read('lib/meetings/sfu.ts');
    assert.ok(
      sfuCode.includes('LiveKitService'),
      'lib/meetings/sfu.ts must maintain LiveKitService'
    );
    const actionCode = read('app/api/meetings/action/route.ts');
    assert.ok(
      actionCode.includes("action === 'DELETE_MEETING'"),
      'app/api/meetings/action/route.ts must handle DELETE_MEETING'
    );
  });

  await runAsyncTest('4.3: deleteGoogleCalendarEvent fails closed safely on network error', async () => {
    const ts = require('typescript');
    const googleMeetSrc = read('lib/meetings/google-meet.ts');
    const compiled = ts.transpileModule(googleMeetSrc, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;

    const fn = new Function('require', 'module', 'exports', compiled);
    const mod = { exports: {} };
    fn(require, mod, mod.exports);

    const mockFailTransport = async () => {
      throw new Error('Connection refused');
    };

    const res = await mod.exports.deleteGoogleCalendarEvent({
      tenantId: '00000000-0000-0000-0000-000000000001',
      eventId: 'evt_test_offline',
      transport: mockFailTransport,
    });

    assert.strictEqual(res, false, 'deleteGoogleCalendarEvent must return false on error');
  });

  runSyncTest('4.4: Zero network sockets were opened across the entire test run', () => {
    assert.strictEqual(socketAttempts, 0, 'No outbound TCP or TLS sockets permitted during offline testing');
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
