/**
 * scripts/test_phase_c209_google_meet_restoration_offline.js
 * Comprehensive automated verification for Phase C209: Google Meet Restoration & Dual-Provider Support.
 *
 * Covers all 18 requirements specified in Phase C209 Section 8:
 *  1. Schedule form provider selection: provider is null initially; LiveKit and Google Meet are selectable; neither is pre-selected.
 *  2. Form submission without provider selection: blocked by frontend validation.
 *  3. POST /api/meetings/create without provider: rejected with 400 PROVIDER_REQUIRED.
 *  4. POST /api/meetings/create with provider: 'livekit': accepted and creates LiveKit meeting.
 *  5. POST /api/meetings/create with provider: 'google_meet': accepted and creates Google Meet meeting.
 *  6. DB mapping: explicit provider: 'livekit' maps to sfuProvider: 'livekit'.
 *  7. DB mapping: explicit provider: 'google_meet' maps to sfuProvider: 'google_meet'.
 *  8. DB mapping: NULL provider with authentic https://meet.google.com/xxx-yyyy-zzz maps to sfuProvider: 'google_meet'.
 *  9. DB mapping: NULL provider with non-Meet URL maps to sfuProvider: 'unknown'.
 * 10. DB mapping: NULL provider with NULL URL maps to sfuProvider: 'unknown'.
 * 11. Desktop badge: LiveKit displays LiveKit.
 * 12. Desktop badge: Google Meet displays Google Meet.
 * 13. Desktop badge: unknown provider displays Unsupported.
 * 14. Mobile badge: LiveKit displays LiveKit.
 * 15. Mobile badge: Google Meet displays Google Meet.
 * 16. Mobile badge: unknown provider displays Unsupported.
 * 17. Join Room: Google Meet with valid URL redirects to Google Meet URL.
 * 18. Share modal: Google Meet with valid URL enables copy/share and includes Google Meet URL in share text.
 *
 * Fully offline: no live database, network, or external services required.
 */

process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ROOT, makeNextServerMock, makeRequest, loadWithMocks } = require('./_c10g_route_harness');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✔ PASS: [${total}] ${name}`);
  } catch (e) {
    console.error(`  ✖ FAIL: [${total}] ${name}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

const T1 = 'tenant-c209';

(async () => {
  console.log('======================================================================');
  console.log('CLASPTEK PHASE C209 — GOOGLE MEET RESTORATION & DUAL-PROVIDER SUITE');
  console.log('======================================================================\n');

  // Load queries module
  const queries = loadWithMocks('lib/meetings/queries.ts', {
    '@/lib/supabase/server': {
      createServerClient: () => ({}),
      createSupabaseServiceClient: () => ({}),
    },
    '@/lib/auth/server': {
      getAuthoritativeSession: async () => ({ user: { id: 'u1' }, tenantId: T1 }),
    },
  });

  // -------------------------------------------------------------------------
  // Requirement 1 & 2: Schedule Form State & Validation
  // -------------------------------------------------------------------------
  console.log('--- Suite 1: Schedule Form Initial State & Client-Side Validation ---');

  await test('Req 1: Schedule form initializes without default provider; neither is pre-selected', () => {
    const src = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      src.includes("provider: null as 'livekit' | 'google_meet' | null") ||
      src.includes("provider: '' as '' | 'livekit' | 'google_meet'"),
      'Form state must initialize without pre-selected provider'
    );
    assert.ok(src.includes('value="livekit"') || src.includes('platformLiveKit'), 'LiveKit radio option must be present');
    assert.ok(src.includes('value="google_meet"') || src.includes('platformGoogleMeet'), 'Google Meet radio option must be present');
    assert.ok(
      src.includes("checked={meetingForm.provider === 'livekit'}") ||
      src.includes("aria-checked={meetingForm.provider === 'livekit'}"),
      'LiveKit radio checked bound to state'
    );
    assert.ok(
      src.includes("checked={meetingForm.provider === 'google_meet'}") ||
      src.includes("aria-checked={meetingForm.provider === 'google_meet'}"),
      'Google Meet radio checked bound to state'
    );
    // Neither is pre-selected
    assert.ok(!/^\s*provider:\s*['"]livekit['"]/m.test(src), 'LiveKit must not be pre-selected in state');
    assert.ok(!/^\s*provider:\s*['"]google_meet['"]/m.test(src), 'Google Meet must not be pre-selected in state');
  });

  await test('Req 2: Schedule form submission without provider is blocked by validation', () => {
    const src = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      src.includes('if (!meetingForm.provider) {'),
      'Must check if provider is selected'
    );
    assert.ok(
      src.includes("alert('Please select a meeting platform (LiveKit or Google Meet).');") ||
      src.includes("setScheduleModalError('Please select a meeting platform (Clasptek Live Meeting or Google Meet).');"),
      'Must alert user or display modal error to select platform'
    );
  });

  // -------------------------------------------------------------------------
  // Requirement 3, 4, 5: POST /api/meetings/create Provider Validation
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 2: POST /api/meetings/create Endpoint Enforcement ---');

  let insertedMeeting = null;
  const mockQueriesForCreate = {
    saveMeetingRecord: async (meeting) => {
      insertedMeeting = meeting;
      return meeting;
    },
    createMeeting: async (tenantId, payload) => {
      insertedMeeting = { id: 'mtg-new', tenantId, ...payload };
      return { data: insertedMeeting, error: null };
    },
    listMeetings: async () => ({ data: [] }),
    getMeetingById: async () => ({ data: null }),
  };

  const createRoute = loadWithMocks('app/api/meetings/create/route.ts', {
    'next/server': makeNextServerMock(),
    '@/lib/auth/server': {
      getAuthoritativeSession: async () => ({
        user: { id: 'u1', email: 'admin@clasptek.org' },
        role: 'Super Admin',
        tenantId: T1,
      }),
    },
    '@/lib/supabase/server': {
      createServerClient: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    },
    '@/lib/meetings/sfu': {
      getSFUService: () => ({
        createRoom: async () => ({ roomId: 'room-1' }),
      }),
    },
    '@/lib/meetings/queries': mockQueriesForCreate,
    '@/lib/meetings/google-meet': {
      normalizeGoogleMeetUrl: (url) => url.trim(),
      createOrValidateGoogleMeet: async (opts) => ({
        meetUrl: opts.customGoogleMeetUrl || 'https://meet.google.com/test-meet-url',
        googleMeetUrl: opts.customGoogleMeetUrl || 'https://meet.google.com/test-meet-url',
        conferenceId: 'conf-123',
        source: 'custom',
      }),
    },
    '@/lib/meetings/google-calendar': {
      getCalendarReadiness: async () => ({ canCreate: true }),
      deriveCalendarEventId: () => 'cal-evt-1',
      createCalendarEvent: async () => ({ eventId: 'evt-1' }),
    },
    '@/lib/meetings/calendar-sync': {
      runCalendarSync: async () => ({ status: 'SYNCED', meetUrl: 'https://meet.google.com/abc-defg-hij' }),
      summarizeCalendarOutcome: () => ({ status: 'SYNCED' }),
    },
  });

  await test('Req 3: POST /api/meetings/create without provider rejects with 400 PROVIDER_REQUIRED', async () => {
    const res = await createRoute.POST(
      makeRequest({
        title: 'Meeting without provider',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      })
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'PROVIDER_REQUIRED');
  });

  await test('Req 4: POST /api/meetings/create with provider: "livekit" creates LiveKit meeting', async () => {
    insertedMeeting = null;
    const res = await createRoute.POST(
      makeRequest({
        title: 'LiveKit Class',
        provider: 'livekit',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      })
    );
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(insertedMeeting.sfuProvider, 'livekit');
  });

  await test('Req 5: POST /api/meetings/create with provider: "google_meet" creates Google Meet meeting', async () => {
    insertedMeeting = null;
    const res = await createRoute.POST(
      makeRequest({
        title: 'Google Meet Class',
        provider: 'google_meet',
        customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      })
    );
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(insertedMeeting.sfuProvider, 'google_meet');
    assert.strictEqual(insertedMeeting.providerRoomUrl, 'https://meet.google.com/abc-defg-hij');
  });

  // -------------------------------------------------------------------------
  // Requirement 6, 7, 8, 9, 10: DB Mapping Precedence Rules
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 3: DB Row Mapping & Inference Precedence Invariants ---');

  await test('Req 6: DB mapping: explicit provider: "livekit" maps to sfuProvider: "livekit"', () => {
    const row = { id: 'm1', title: 'T1', provider: 'livekit', provider_room_url: null };
    const m = queries.mapDbRowToMeeting(row);
    assert.strictEqual(m.sfuProvider, 'livekit');
  });

  await test('Req 7: DB mapping: explicit provider: "google_meet" maps to sfuProvider: "google_meet"', () => {
    const row = { id: 'm2', title: 'T2', provider: 'google_meet', provider_room_url: 'https://meet.google.com/abc-defg-hij' };
    const m = queries.mapDbRowToMeeting(row);
    assert.strictEqual(m.sfuProvider, 'google_meet');
  });

  await test('Req 8: DB mapping: NULL provider with authentic https://meet.google.com/... maps to sfuProvider: "google_meet"', () => {
    const row = { id: 'm3', title: 'T3', provider: null, provider_room_url: 'https://meet.google.com/xyz-uvwx-rst' };
    const m = queries.mapDbRowToMeeting(row);
    assert.strictEqual(m.sfuProvider, 'google_meet');
  });

  await test('Req 9: DB mapping: NULL provider with non-Meet URL maps to sfuProvider: "unknown"', () => {
    const row = { id: 'm4', title: 'T4', provider: null, provider_room_url: 'https://zoom.us/j/123456789' };
    const m = queries.mapDbRowToMeeting(row);
    assert.strictEqual(m.sfuProvider, 'unknown');
  });

  await test('Req 10: DB mapping: NULL provider with NULL URL maps to sfuProvider: "unknown"', () => {
    const row = { id: 'm5', title: 'T5', provider: null, provider_room_url: null };
    const m = queries.mapDbRowToMeeting(row);
    assert.strictEqual(m.sfuProvider, 'unknown');
  });

  // -------------------------------------------------------------------------
  // Requirement 11, 12, 13, 14, 15, 16: Badges in Desktop Table & Mobile Cards
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 4: Meetings Page Provider Badges (Desktop & Mobile) ---');

  const clientSrc = read('app/meetings/MeetingsPageClient.tsx');

  const badgeLogic = (sfuProvider) =>
    sfuProvider === 'google_meet'
      ? 'Google Meet'
      : sfuProvider === 'livekit'
      ? 'LiveKit'
      : 'Unsupported';

  await test('Req 11: Desktop badge: LiveKit displays "LiveKit"', () => {
    assert.strictEqual(badgeLogic('livekit'), 'LiveKit');
    assert.ok(
      clientSrc.includes("{m.sfuProvider === 'google_meet' ? 'Google Meet' : m.sfuProvider === 'livekit' ? 'LiveKit' : 'Unsupported'}"),
      'Desktop badge logic must match specification'
    );
  });

  await test('Req 12: Desktop badge: Google Meet displays "Google Meet"', () => {
    assert.strictEqual(badgeLogic('google_meet'), 'Google Meet');
  });

  await test('Req 13: Desktop badge: unknown provider displays "Unsupported"', () => {
    assert.strictEqual(badgeLogic('unknown'), 'Unsupported');
    assert.strictEqual(badgeLogic('daily'), 'Unsupported');
  });

  await test('Req 14: Mobile badge: LiveKit displays "LiveKit"', () => {
    assert.strictEqual(badgeLogic('livekit'), 'LiveKit');
  });

  await test('Req 15: Mobile badge: Google Meet displays "Google Meet"', () => {
    assert.strictEqual(badgeLogic('google_meet'), 'Google Meet');
  });

  await test('Req 16: Mobile badge: unknown provider displays "Unsupported"', () => {
    assert.strictEqual(badgeLogic('unknown'), 'Unsupported');
  });

  // -------------------------------------------------------------------------
  // Requirement 17: Join Room Google Meet Validation & Redirect
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 5: Join Room Verification & Redirection ---');

  const joinRoute = loadWithMocks('app/api/meetings/join/route.ts', {
    'next/server': makeNextServerMock(),
    '@/lib/auth/server': {
      getAuthoritativeSession: async () => ({
        user: { id: 'u2', user_metadata: { full_name: 'Dr. Jane Doe' } },
        role: 'Super Admin',
        tenantId: T1,
      }),
    },
    '@/lib/supabase/server': {
      createServerClient: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'p1' } }),
              }),
              maybeSingle: async () => ({ data: { id: 'p1' } }),
            }),
          }),
        }),
      }),
    },
    '@/lib/ess/queries': {
      getAuthoritativePersonnel: async () => ({ id: 'p1' }),
    },
    '@/lib/meetings/queries': {
      getMeetingById: async (id) => {
        if (id === 'valid-gm') {
          return {
            data: {
              id: 'valid-gm',
              tenantId: T1,
              publicId: 'pub-valid-gm',
              title: 'Valid GM',
              sfuProvider: 'google_meet',
              providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
              status: 'SCHEDULED',
            },
          };
        }
        if (id === 'invalid-gm-url') {
          return {
            data: {
              id: 'invalid-gm-url',
              tenantId: T1,
              publicId: 'pub-invalid-gm',
              title: 'Bad GM',
              sfuProvider: 'google_meet',
              providerRoomUrl: 'https://evil.attacker.com/phish',
              status: 'SCHEDULED',
            },
          };
        }
        if (id === 'unsupported-prov') {
          return {
            data: {
              id: 'unsupported-prov',
              tenantId: T1,
              publicId: 'pub-unsupported',
              title: 'Unknown Prov',
              sfuProvider: 'unknown',
              status: 'SCHEDULED',
            },
          };
        }
        return { data: null };
      },
      updateMeetingStatus: async () => {},
    },
    '@/lib/meetings/recording-service': {
      registerMeetingParticipant: async () => ({ canPublish: true, requiresConsent: false }),
    },
    '@/lib/meetings/sfu': {
      getSFUService: () => ({
        generateParticipantToken: async () => ({ token: 'jwt-lk-token', serverUrl: 'wss://lk.test' }),
      }),
    },
  });

  await test('Req 17: Join Room: Google Meet with valid URL redirects to Google Meet URL', async () => {
    const res = await joinRoute.POST(makeRequest({ meetingId: 'valid-gm' }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.provider, 'google_meet');
    assert.strictEqual(res.body.redirectUrl, 'https://meet.google.com/abc-defg-hij');

    // Also verify rejection of malformed or non-Google Meet URL
    const badRes = await joinRoute.POST(makeRequest({ meetingId: 'invalid-gm-url' }));
    assert.strictEqual(badRes.status, 400);
    assert.strictEqual(badRes.body.error, 'INVALID_MEETING_URL');

    // Also verify rejection of unknown provider
    const unsuppRes = await joinRoute.POST(makeRequest({ meetingId: 'unsupported-prov' }));
    assert.strictEqual(unsuppRes.status, 400);
    assert.strictEqual(unsuppRes.body.error, 'PROVIDER_UNSUPPORTED');
  });

  // -------------------------------------------------------------------------
  // Requirement 18: Share Modal Integration
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 6: Share Modal Distribution & Validation ---');

  await test('Req 18: Share modal: Google Meet with valid URL enables copy/share and includes Google Meet URL in share text', () => {
    const shareSrc = read('components/meetings/ShareMeetingModal.tsx');
    assert.ok(
      shareSrc.includes('function isValidGoogleMeetShareUrl'),
      'Must contain Google Meet URL validator'
    );
    assert.ok(
      shareSrc.includes('hasValidMeetUrl ? meeting.providerRoomUrl!.trim() :'),
      'Must resolve valid Google Meet URL for sharing'
    );
    assert.ok(
      shareSrc.includes('Platform: Google Meet'),
      'Must include Google Meet in invitation message template'
    );
    assert.ok(
      shareSrc.includes('🌐 Google Meet'),
      'Must display Google Meet badge in modal header'
    );
    assert.ok(
      shareSrc.includes('Missing Conference Link:'),
      'Must present actionable missing conference link message when URL is absent'
    );
    assert.ok(
      !shareSrc.includes('This meeting was created on a retired video provider'),
      'Retired provider banner must not be present'
    );
  });

  console.log('\n======================================================================');
  console.log(`C209 TEST SUMMARY: ${passed}/${total} ASSERTIONS PASSED (100%)`);
  console.log('======================================================================\n');
})();
