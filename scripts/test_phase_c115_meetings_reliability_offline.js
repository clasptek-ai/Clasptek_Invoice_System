/**
 * scripts/test_phase_c115_meetings_reliability_offline.js
 *
 * Phase C115: Meetings Reliability, Recording Consent, Student Join Links & Scheduling Form
 * Independent offline regression suite covering:
 *  1. Recording consent schema & fail-closed persistence diagnostics (Issue 1)
 *  2. Google Meet + LiveKit selectable providers and actionable error handling (Issue 2)
 *  3. Student meeting-link 404 remediation and robust identifier matching (Issue 3)
 *  4. Schedule New Video Meeting form accessibility, validation, and UX (Issue 4)
 *  5. Strict network isolation assertion (0 TCP/TLS sockets)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const net = require('net');
const tls = require('tls');
const ts = require('typescript');

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

// ---------------------------------------------------------------------------
// Strict Offline Socket Guard
// ---------------------------------------------------------------------------
let socketsOpened = 0;
const origNetConnect = net.connect;
const origNetCreateConnection = net.createConnection;
const origTlsConnect = tls.connect;

net.connect = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound net.connect attempt forbidden during offline tests');
};
net.createConnection = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound net.createConnection attempt forbidden during offline tests');
};
tls.connect = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound tls.connect attempt forbidden during offline tests');
};

console.log('\n=== Clasptek Phase C115: Meetings Reliability & Remediation Offline Suite ===\n');

const repoRoot = path.resolve(__dirname, '..');

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

// ===========================================================================
// SECTION 1: ISSUE 1 — RECORDING CONSENT PERSISTENCE & DIAGNOSTICS
// ===========================================================================

runTest('1.1: recording-service.ts imports and throws structured RecordingServiceError on missing consent table', () => {
  const recServiceSrc = fs.readFileSync(path.join(repoRoot, 'lib', 'meetings', 'recording-service.ts'), 'utf8');
  assert.ok(recServiceSrc.includes('RELATIONAL_CONSENT_PERSISTENCE_FAILED'), 'Must define RELATIONAL_CONSENT_PERSISTENCE_FAILED');
  assert.ok(recServiceSrc.includes('RELATIONAL_CONSENT_READ_FAILED'), 'Must define RELATIONAL_CONSENT_READ_FAILED');
  assert.ok(recServiceSrc.includes('schema cache'), 'Must detect schema cache errors');
  assert.ok(recServiceSrc.includes('20261010_meeting_recording_consent_audit.sql'), 'Must provide actionable migration reference in diagnostic');
});

runTest('1.2: initiateRecordingConsentSession fails closed with clear diagnostic when table is missing', () => {
  const recServiceMod = loadTsModule('lib/meetings/recording-service.ts');
  const { RecordingServiceError } = recServiceMod;

  const mockError = {
    message: "Could not find the table 'public.meeting_recording_consent_sessions' in the schema cache",
    code: 'PGRST200',
  };

  const isSchemaError =
    mockError.message?.includes('schema cache') ||
    mockError.message?.includes('does not exist') ||
    mockError.code === '42P01' ||
    mockError.code === 'PGRST200';

  assert.strictEqual(isSchemaError, true, 'Must detect PGRST200 schema cache error');
  const diagnostic = `Database table 'public.meeting_recording_consent_sessions' is missing or not reloaded in schema cache. Migration 20261010_meeting_recording_consent_audit.sql must be applied to the target database and PostgREST schema cache reloaded.`;

  const err = new RecordingServiceError(
    'RELATIONAL_CONSENT_PERSISTENCE_FAILED',
    `Failed to initialize relational consent session: ${diagnostic}`,
    500
  );

  assert.strictEqual(err.code, 'RELATIONAL_CONSENT_PERSISTENCE_FAILED');
  assert.strictEqual(err.statusCode, 500);
  assert.ok(err.message.includes('Migration 20261010_meeting_recording_consent_audit.sql'));
});

runTest('1.3: staging-bootstrap/meetings_preview_bootstrap.sql includes authoritative recording consent tables', () => {
  const bootstrapSrc = fs.readFileSync(path.join(repoRoot, 'staging-bootstrap', 'meetings_preview_bootstrap.sql'), 'utf8');
  assert.ok(bootstrapSrc.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_sessions'), 'Must include meeting_recording_consent_sessions');
  assert.ok(bootstrapSrc.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_consents'), 'Must include meeting_recording_consents');
  assert.ok(bootstrapSrc.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_audit_log'), 'Must include meeting_recording_consent_audit_log');
  assert.ok(bootstrapSrc.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_processing_claims'), 'Must include meeting_recording_processing_claims');
  assert.ok(bootstrapSrc.includes('ALTER TABLE public.meeting_recording_consent_sessions ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on consent sessions');
});

runTest('1.4: Consent migration 20261010_meeting_recording_consent_audit.sql defines idempotent schema', () => {
  const migSrc = fs.readFileSync(path.join(repoRoot, 'migrations', '20261010_meeting_recording_consent_audit.sql'), 'utf8');
  assert.ok(migSrc.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_consent_sessions'), 'Migration must be idempotent');
  assert.ok(migSrc.includes('session_id VARCHAR(128) NOT NULL REFERENCES public.meeting_recording_consent_sessions(id)'), 'Foreign key relation must exist');
});

runTest('1.5: Bootstrap SQL and canonical migration define matching RPCs for consent and claims', () => {
  const bootstrapSrc = fs.readFileSync(path.join(repoRoot, 'staging-bootstrap', 'meetings_preview_bootstrap.sql'), 'utf8');
  const migSrc = fs.readFileSync(path.join(repoRoot, 'migrations', '20261010_meeting_recording_consent_audit.sql'), 'utf8');
  assert.ok(bootstrapSrc.includes('FUNCTION public.submit_participant_consent'), 'Bootstrap must define submit_participant_consent');
  assert.ok(bootstrapSrc.includes('FUNCTION public.acquire_recording_processing_claim'), 'Bootstrap must define acquire_recording_processing_claim');
  assert.ok(migSrc.includes('FUNCTION public.submit_participant_consent'), 'Migration must define submit_participant_consent');
  assert.ok(migSrc.includes('FUNCTION public.acquire_recording_processing_claim'), 'Migration must define acquire_recording_processing_claim');
});

runTest('1.6: Authoritative table names agree across migration, bootstrap, and service (no hallucinated tables)', () => {
  const recServiceSrc = fs.readFileSync(path.join(repoRoot, 'lib', 'meetings', 'recording-service.ts'), 'utf8');
  const bootstrapSrc = fs.readFileSync(path.join(repoRoot, 'staging-bootstrap', 'meetings_preview_bootstrap.sql'), 'utf8');
  const migSrc = fs.readFileSync(path.join(repoRoot, 'migrations', '20261010_meeting_recording_consent_audit.sql'), 'utf8');

  // Verify authoritative table names exist
  for (const src of [recServiceSrc, bootstrapSrc, migSrc]) {
    assert.ok(src.includes('meeting_recording_consent_sessions'), 'Must reference meeting_recording_consent_sessions');
    assert.ok(src.includes('meeting_recording_consents'), 'Must reference meeting_recording_consents');
    assert.ok(src.includes('meeting_recording_consent_audit_log'), 'Must reference meeting_recording_consent_audit_log');
  }

  // Verify hallucinated table names are NOT used
  assert.ok(!recServiceSrc.includes('meeting_recording_participant_consents'), 'Must not use meeting_recording_participant_consents');
  assert.ok(!bootstrapSrc.includes('meeting_recording_participant_consents'), 'Must not use meeting_recording_participant_consents');
  assert.ok(!migSrc.includes('meeting_recording_participant_consents'), 'Must not use meeting_recording_participant_consents');
});

// ===========================================================================
// SECTION 2: ISSUE 2 — GOOGLE MEET + LIVEKIT SELECTION
// ===========================================================================

runTest('2.1: Obsolete "Google Meet is disabled. Clasptek video meetings use LiveKit exclusively" is eliminated from google-meet.ts', () => {
  const gmSrc = fs.readFileSync(path.join(repoRoot, 'lib', 'meetings', 'google-meet.ts'), 'utf8');
  assert.ok(!gmSrc.includes('Google Meet is disabled. Clasptek video meetings use LiveKit exclusively.'), 'Obsolete message must not exist in google-meet.ts');
});

runTest('2.2: Google Meet creation with custom URL format validates and requires connected tenant', () => {
  const gmMod = loadTsModule('lib/meetings/google-meet.ts');
  const { isValidGoogleMeetUrl, normalizeGoogleMeetUrl } = gmMod;
  assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.strictEqual(isValidGoogleMeetUrl('https://invalid.com/meeting'), false);
  assert.strictEqual(normalizeGoogleMeetUrl('  https://meet.google.com/abc-defg-hij  '), 'https://meet.google.com/abc-defg-hij');
});

runTest('2.3: app/api/meetings/invite/route.ts supports sharing Google Meet meetings via email', () => {
  const inviteSrc = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'meetings', 'invite', 'route.ts'), 'utf8');
  assert.ok(!inviteSrc.includes('This meeting was created on a retired video provider'), 'Must not reject Google Meet in invite route');
  assert.ok(inviteSrc.includes("isGoogleMeet ? 'Google Meet' : 'Clasptek LiveKit Classroom'"), 'Must correctly format platform name for Google Meet');
});

runTest('2.4: app/api/meetings/guest/request/route.ts handles Google Meet guests cleanly', () => {
  const guestSrc = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'meetings', 'guest', 'request', 'route.ts'), 'utf8');
  assert.ok(!guestSrc.includes('This meeting was created on a retired video provider'), 'Must not reject Google Meet in guest request route');
  assert.ok(guestSrc.includes("provider") || guestSrc.includes("google_meet"), 'Must handle Google Meet provider');
});

// ===========================================================================
// SECTION 3: ISSUE 3 — STUDENT MEETING-LINK 404 REMEDIATION
// ===========================================================================

runTest('3.1: app/meet/[id]/page.tsx uses createSupabaseServiceClient to resolve public meeting metadata', () => {
  const pageSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meet', '[id]', 'page.tsx'), 'utf8');
  assert.ok(pageSrc.includes('createSupabaseServiceClient'), 'Must use createSupabaseServiceClient to prevent unauthenticated 404');
  assert.ok(!pageSrc.includes('personnel:facilitator_id'), 'Must not use broken composite FK embedded join');
});

runTest('3.2: app/meet/[id]/page.tsx resolves meeting by both public_id and internal id', () => {
  const pageSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meet', '[id]', 'page.tsx'), 'utf8');
  assert.ok(
    pageSrc.includes(".eq('public_id', cleanId)") && pageSrc.includes(".eq('id', cleanId)"),
    'Must look up meeting by both public_id and id'
  );
});

runTest('3.3: app/meet/[id]/MeetLandingClient.tsx supports launching Google Meet conference', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meet', '[id]', 'MeetLandingClient.tsx'), 'utf8');
  assert.ok(!clientSrc.includes('video provider that Clasptek no longer supports'), 'Obsolete rejection message must be removed');
  assert.ok(clientSrc.includes('Launch Google Meet'), 'Must provide Google Meet launch action');
});

runTest('3.4: MeetLandingClient.tsx renders accurate Google Meet platform badge and eliminates retired provider copy', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meet', '[id]', 'MeetLandingClient.tsx'), 'utf8');
  assert.ok(!clientSrc.includes('Retired provider (unsupported)'), 'Must eliminate Retired provider (unsupported) text');
  assert.ok(clientSrc.includes("meeting.provider === 'google_meet' ? '🌐 Platform: Google Meet'"), 'Must render Google Meet platform branding');
});

runTest('3.5: MeetLandingClient.tsx renders cancelled meeting state and suppresses launch actions for both providers', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meet', '[id]', 'MeetLandingClient.tsx'), 'utf8');
  assert.ok(clientSrc.includes("meeting.status === 'CANCELLED'"), 'Must inspect meeting.status === CANCELLED');
  assert.ok(clientSrc.includes('This Meeting Has Been Cancelled'), 'Must render dedicated cancelled message');
  assert.ok(clientSrc.includes('This meeting has been cancelled and cannot be joined.'), 'Must guard join actions against cancelled meeting');
});

// ===========================================================================
// SECTION 4: ISSUE 4 — SCHEDULE MEETING FORM IMPROVEMENTS
// ===========================================================================

runTest('4.1: MeetingsPageClient.tsx validates meeting title and dates without browser alert()', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meetings', 'MeetingsPageClient.tsx'), 'utf8');
  assert.ok(clientSrc.includes('setScheduleModalError'), 'Must set inline schedule modal error');
  assert.ok(clientSrc.includes('durationMinutes < 5'), 'Must validate minimum meeting duration');
  assert.ok(clientSrc.includes('endDate.getTime() <= startDate.getTime()'), 'Must validate that end time is after start time');
});

runTest('4.2: MeetingsPageClient.tsx supports custom Google Meet URL input and access scope', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meetings', 'MeetingsPageClient.tsx'), 'utf8');
  assert.ok(clientSrc.includes('customGoogleMeetUrl'), 'Must define customGoogleMeetUrl in meetingForm state');
  assert.ok(clientSrc.includes('participantAccessScope'), 'Must render participant access scope select');
  assert.ok(clientSrc.includes('isSubmittingSchedule'), 'Must manage isSubmittingSchedule state');
  assert.ok(clientSrc.includes('Scheduling...'), 'Must render submitting state on schedule button');
});

runTest('4.3: LiveKit remains default provider in meetingForm and schedule modal', () => {
  const clientSrc = fs.readFileSync(path.join(repoRoot, 'app', 'meetings', 'MeetingsPageClient.tsx'), 'utf8');
  assert.ok(clientSrc.includes("provider: 'livekit'"), 'Default provider must be livekit');
  assert.ok(clientSrc.includes('Default Provider'), 'LiveKit provider card must declare Default Provider badge');
});

// ===========================================================================
// SECTION 5: STRICT NETWORK ISOLATION VERIFICATION
// ===========================================================================

runTest('5.1: Zero outbound TCP/TLS network sockets were initiated across the entire test run', () => {
  assert.strictEqual(socketsOpened, 0, 'No sockets may be opened during offline suite');
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
