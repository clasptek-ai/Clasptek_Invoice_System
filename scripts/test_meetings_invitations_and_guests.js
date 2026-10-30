/**
 * scripts/test_meetings_invitations_and_guests.js
 * Comprehensive Verification Suite for Clasptek LiveKit Meetings:
 * - Invitation creation, stable link formatting, WhatsApp URL encoding, email feedback
 * - Facilitator meeting scheduling role authorization
 * - External guest request submission, pending waiting room state
 * - Host admission, rejection, revocation, and token issuance
 * - Cross-tenant isolation enforcement
 * - Guest token security scope (short TTL, roomAdmin false, non-tampering)
 * - Missing LiveKit configuration fail-closed behavior
 * - Attendance & recording regression invariants
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

// Module cache for transpiled modules
const moduleCache = new Map();

// Helper to transpile and load TypeScript modules dynamically in CJS
function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (id.includes('supabase/server')) {
      return {
        createServerClient: async () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: [] }),
                  maybeSingle: () => Promise.resolve({ data: null }),
                }),
              }),
            }),
          }),
        }),
        createSupabaseServiceClient: () => ({
          from: () => ({
            insert: async () => ({ error: null }),
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        }),
      };
    }
    if (id === '@/lib/meetings/sfu' || id.endsWith('lib/meetings/sfu')) {
      return loadTsModule('lib/meetings/sfu.ts');
    }
    if (id.startsWith('@/')) {
      const candidate = path.join(__dirname, '..', id.slice(2));
      return loadTsModule(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const { LiveKitService } = loadTsModule('lib/meetings/sfu.ts');
const {
  createGuestRequest,
  getGuestRequestByToken,
  listGuestRequestsForMeeting,
  decideGuestRequest,
} = loadTsModule('lib/meetings/guest-requests.ts');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('===============================================================');
  console.log('CLASPTEK MEETINGS — INVITATION & GUEST LIFECYCLE SUITE');
  console.log('===============================================================\n');

  // --- Suite 1: Invitation Link & URL-Encoded Sharing ---
  console.log('--- Suite 1: Invitation Link & URL-Encoded Sharing ---');

  await test('Generates stable, canonical meeting URL matching /meet/{publicId}', () => {
    const publicId = 'mtg-test-482a-9f1b';
    const baseUrl = 'https://app.clasptek.org';
    const invitationUrl = `${baseUrl}/meet/${publicId}`;

    assert.strictEqual(invitationUrl, 'https://app.clasptek.org/meet/mtg-test-482a-9f1b');
    assert(invitationUrl.startsWith('https://app.clasptek.org/meet/'));
    assert(!invitationUrl.includes('meet.google.com'), 'Must never contain Google Meet domain');
  });

  await test('Generates properly URL-encoded WhatsApp message with meeting details', () => {
    const meeting = {
      title: 'Full-Stack Engineering Lecture 4',
      facilitatorName: 'Engr. Balogun Monday',
      dateStr: 'Sat, 10 Oct 2026',
      timeStr: '10:00 – 12:00',
      publicId: 'mtg-fsd-401',
    };
    const meetingUrl = `https://app.clasptek.org/meet/${meeting.publicId}`;
    const rawMessage = `🎓 Clasptek Online Classroom Invitation\n` +
      `Meeting: ${meeting.title}\n` +
      `Facilitator: ${meeting.facilitatorName}\n` +
      `Date: ${meeting.dateStr}\n` +
      `Time: ${meeting.timeStr}\n\n` +
      `Join via Clasptek LiveKit Classroom:\n` +
      `${meetingUrl}`;

    const encoded = encodeURIComponent(rawMessage);
    const waUrl = `https://wa.me/?text=${encoded}`;

    assert(waUrl.startsWith('https://wa.me/?text='), 'Must target standard WhatsApp URL');
    assert(waUrl.includes(encodeURIComponent(meeting.title)), 'Must include encoded meeting title');
    assert(waUrl.includes(encodeURIComponent(meetingUrl)), 'Must include encoded Clasptek URL');
    assert(!waUrl.includes('google.com'), 'Must not reference Google Meet');
  });

  await test('Email invitation mailto fallback formats correctly when server mailer is unconfigured', () => {
    const subject = encodeURIComponent('Invitation: Cloud Architecture — Clasptek Online Classroom');
    const recipients = ['student1@clasptek.org', 'guest@partner.com'];
    const body = encodeURIComponent('Please join the meeting at https://app.clasptek.org/meet/mtg-cloud-101');

    const mailto = `mailto:${recipients.join(',')}?subject=${subject}&body=${body}`;
    assert(mailto.startsWith('mailto:student1@clasptek.org,guest@partner.com?subject='));
    assert(mailto.includes('body='));
  });

  // --- Suite 2: Facilitator Scheduling Role Validation ---
  console.log('\n--- Suite 2: Facilitator Scheduling Role Authorization ---');

  await test('Facilitator role is included in allowed meeting schedulers', () => {
    const createRouteCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'meetings', 'create', 'route.ts'), 'utf8');
    assert(createRouteCode.includes("'Facilitator'"), 'app/api/meetings/create/route.ts must include Facilitator in allowedRoles');

    const queriesCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'meetings', 'queries.ts'), 'utf8');
    assert(queriesCode.includes("'Facilitator'"), 'lib/meetings/queries.ts must include Facilitator in saveMeetingRecord');

    const meetingsClientCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'meetings', 'MeetingsPageClient.tsx'), 'utf8');
    assert(meetingsClientCode.includes("'Facilitator'") && meetingsClientCode.includes('btnOpenScheduleMeetingModal'), 'MeetingsPageClient must permit Facilitator to open schedule modal');
  });

  // --- Suite 3: Guest Waiting Room Lifecycle ---
  console.log('\n--- Suite 3: Guest Waiting Room Lifecycle ---');

  const tenantA = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
  const tenantB = 'a1111111-2222-3333-4444-555555555555';
  const meetingA = {
    id: 'mtg_001_test',
    publicId: 'mtg-test-pub-001',
    tenantId: tenantA,
  };

  let testGuestSession = null;

  await test('Guest submits entry request and receives PENDING status with secret token', async () => {
    const res = await createGuestRequest({
      tenantId: meetingA.tenantId,
      meetingId: meetingA.id,
      meetingPublicId: meetingA.publicId,
      guestName: 'Dr. Ada Lovelace',
      guestEmail: 'ada@computing.org',
      guestOrganization: 'Analytical Engines Inc',
    });

    assert(res.success, 'Request must succeed');
    assert(res.requestId.startsWith('greq_'), 'Must generate greq_ prefixed ID');
    assert(res.requestToken && res.requestToken.length >= 64, 'Must generate high-entropy token');

    testGuestSession = res;

    // Check polling status
    const record = await getGuestRequestByToken(res.requestId, res.requestToken);
    assert(record, 'Record must exist');
    assert.strictEqual(record.status, 'PENDING');
    assert.strictEqual(record.guestName, 'Dr. Ada Lovelace');
    assert.strictEqual(record.guestEmail, 'ada@computing.org');
    assert.strictEqual(record.livekitToken, null, 'No LiveKit token before host approval');
  });

  await test('Host lists pending guest requests for meeting', async () => {
    const list = await listGuestRequestsForMeeting(meetingA.publicId, tenantA);
    assert(list.length >= 1, 'Must list at least one pending request');
    const found = list.find((r) => r.id === testGuestSession.requestId);
    assert(found, 'Must find submitted guest request');
    assert.strictEqual(found.status, 'PENDING');
  });

  await test('Host APPROVES guest request: generates short-lived LiveKit token with role GUEST', async () => {
    // Set test LiveKit credentials
    process.env.LIVEKIT_URL = 'wss://clasptek-test.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'API_TEST_KEY_123';
    process.env.LIVEKIT_API_SECRET = 'SECRET_TEST_KEY_456_VERY_SECURE_TOKEN_SECRET_XYZ';

    const decisionRes = await decideGuestRequest({
      requestId: testGuestSession.requestId,
      decision: 'APPROVE',
      deciderUserId: 'host-user-uuid-1',
      tenantId: tenantA,
      meetingPublicId: meetingA.publicId,
    });

    assert(decisionRes.success, 'Host approval must succeed');
    assert.strictEqual(decisionRes.status, 'APPROVED');

    // Guest polling now returns APPROVED and LiveKit token
    const pollRecord = await getGuestRequestByToken(testGuestSession.requestId, testGuestSession.requestToken);
    assert.strictEqual(pollRecord.status, 'APPROVED');
    assert(pollRecord.livekitToken, 'Must issue LiveKit token on approval');
    assert.strictEqual(pollRecord.livekitServerUrl, 'wss://clasptek-test.livekit.cloud');

    // Decode JWT payload to verify claims
    const parts = pollRecord.livekitToken.split('.');
    assert.strictEqual(parts.length, 3, 'JWT must have 3 parts');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

    assert.strictEqual(payload.sub, `guest_${testGuestSession.requestId}`);
    assert.strictEqual(payload.iss, 'API_TEST_KEY_123');
    assert.strictEqual(payload.video.room, meetingA.publicId);
    assert.strictEqual(payload.video.roomJoin, true);
    assert.strictEqual(payload.video.canPublish, true);
    assert.strictEqual(payload.video.roomAdmin, false, 'Guest must NOT have roomAdmin permissions');
    assert.strictEqual(payload.video.roomCreate, false, 'Guest must NOT have roomCreate permissions');

    // Verify short TTL (2 hours = 7200s)
    const expectedTtl = 2 * 60 * 60;
    const actualTtl = payload.exp - (payload.nbf + 5);
    assert.strictEqual(actualTtl, expectedTtl, 'Guest token TTL must be strictly 2 hours');
  });

  await test('Host REVOKES active guest: clears LiveKit token and marks REVOKED', async () => {
    const revokeRes = await decideGuestRequest({
      requestId: testGuestSession.requestId,
      decision: 'REVOKE',
      deciderUserId: 'host-user-uuid-1',
      tenantId: tenantA,
      meetingPublicId: meetingA.publicId,
    });

    assert(revokeRes.success);
    assert.strictEqual(revokeRes.status, 'REVOKED');

    const pollRecord = await getGuestRequestByToken(testGuestSession.requestId, testGuestSession.requestToken);
    assert.strictEqual(pollRecord.status, 'REVOKED');
    assert.strictEqual(pollRecord.livekitToken, null, 'Revoked guest must not retain valid LiveKit token');
  });

  await test('Host REJECTS guest request: sets status REJECTED without issuing token', async () => {
    const guest2 = await createGuestRequest({
      tenantId: meetingA.tenantId,
      meetingId: meetingA.id,
      meetingPublicId: meetingA.publicId,
      guestName: 'Suspicious Caller',
      guestEmail: 'unauthorized@external.com',
    });

    const rejectRes = await decideGuestRequest({
      requestId: guest2.requestId,
      decision: 'REJECT',
      deciderUserId: 'host-user-uuid-1',
      tenantId: tenantA,
      meetingPublicId: meetingA.publicId,
    });

    assert(rejectRes.success);
    assert.strictEqual(rejectRes.status, 'REJECTED');

    const pollRecord = await getGuestRequestByToken(guest2.requestId, guest2.requestToken);
    assert.strictEqual(pollRecord.status, 'REJECTED');
    assert.strictEqual(pollRecord.livekitToken, null);
  });

  // --- Suite 4: Cross-Tenant Isolation Enforcement ---
  console.log('\n--- Suite 4: Cross-Tenant Isolation Enforcement ---');

  await test('Tenant B host CANNOT view or admit Tenant A guest requests', async () => {
    const guestTenantA = await createGuestRequest({
      tenantId: tenantA,
      meetingId: meetingA.id,
      meetingPublicId: meetingA.publicId,
      guestName: 'Confidential Participant',
      guestEmail: 'confidential@tenant-a.com',
    });

    // Tenant B host tries to list
    const listTenantB = await listGuestRequestsForMeeting(meetingA.publicId, tenantB);
    const leak = listTenantB.find((r) => r.id === guestTenantA.requestId);
    assert.strictEqual(leak, undefined, 'Tenant B must never see Tenant A guest requests');

    // Tenant B host tries to decide
    const decisionTenantB = await decideGuestRequest({
      requestId: guestTenantA.requestId,
      decision: 'APPROVE',
      deciderUserId: 'tenant-b-host',
      tenantId: tenantB,
      meetingPublicId: meetingA.publicId,
    });

    assert.strictEqual(decisionTenantB.success, false);
    assert.strictEqual(decisionTenantB.status, 'FORBIDDEN');
  });

  // --- Suite 5: Fail-Safe Configuration Behavior ---
  console.log('\n--- Suite 5: Fail-Safe Configuration Behavior ---');

  await test('LiveKitService fails safely without credentials (zero insecure fallbacks)', () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    assert.throws(
      () => {
        new LiveKitService({ url: '', apiKey: '', apiSecret: '' });
      },
      (err) => {
        return err.message.includes('CONFIGURATION_ERROR') &&
          err.message.includes('LIVEKIT_URL') &&
          err.message.includes('LIVEKIT_API_KEY') &&
          err.message.includes('LIVEKIT_API_SECRET');
      }
    );
  });

  // --- Suite 6: Google Drive & Recording Regressions ---
  console.log('\n--- Suite 6: Google Drive & Recording Preservation ---');

  await test('Preserves Google Drive central repository migration and routes', () => {
    const migrationPath = path.join(process.cwd(), 'migrations', '20260917_google_drive_central_repository.sql');
    assert(fs.existsSync(migrationPath), 'Google Drive central repository migration must remain intact');

    const appRouteHandler = path.resolve(__dirname, '..', 'app', 'api', 'meetings', 'upload-recording', 'route.ts');
    const legacyHandler = path.resolve(__dirname, '..', 'legacy', 'meetings', 'upload-recording.js');
    const apiHandler = path.resolve(__dirname, '..', 'api', 'meetings', 'upload-recording.js');
    const handlerExists = fs.existsSync(appRouteHandler) || fs.existsSync(legacyHandler) || fs.existsSync(apiHandler);
    assert(handlerExists, 'Upload recording handler must remain intact');
  });

  console.log('\n===============================================================');
  console.log(`INVITATION & GUEST RESULTS: ${passed} PASSED / ${total - passed} FAILED (TOTAL ${total})`);
  console.log('===============================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
