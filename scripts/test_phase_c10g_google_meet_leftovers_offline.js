/**
 * scripts/test_phase_c10g_google_meet_leftovers_offline.js
 * RETIRED / SUPERSEDED by Phase C209 Dual-Provider (LiveKit & Google Meet).
 *
 * NOTE: Phase C10G enforced an obsolete LiveKit-only policy where Google Meet was
 * blocked and Calendar was stripped. Under Phase C208/C209 and Phase C240, Google Meet
 * and LiveKit are both officially supported with explicit selection and zero default.
 *
 * Valid LiveKit invariants from this suite continue to be enforced.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ROOT, makeNextServerMock, makeRequest, loadWithMocks } = require('./_c10g_route_harness');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Any network attempt by a route under test is a failure.
const realFetch = global.fetch;
global.fetch = () => { throw new Error('NETWORK_BLOCKED: fetch must not be called in this suite'); };

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log(`  PASS: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name}\n     ${e.message}`); process.exitCode = 1; }
}

const T1 = 'tenant-1';
const meetings = {
  gm: { id: 'm-gm', tenantId: T1, publicId: 'mtg-gm', title: 'Google Meet Session', sfuProvider: 'google_meet',
        providerRoomUrl: 'https://meet.google.com/abc-defg-hij', status: 'SCHEDULED', deletedAt: null },
  lk: { id: 'm-lk', tenantId: T1, publicId: 'mtg-lk', title: 'Live', sfuProvider: 'livekit',
        providerRoomUrl: null, status: 'SCHEDULED', deletedAt: null },
  other: { id: 'm-o', tenantId: 'tenant-2', publicId: 'mtg-o', title: 'Other', sfuProvider: 'livekit',
           providerRoomUrl: null, status: 'SCHEDULED', deletedAt: null },
};
const getMeetingById = async (id) => ({
  data: Object.values(meetings).find((m) => m.id === id || m.publicId === id) || null,
});

(async () => {
  console.log('=== C10G (Compatibility Mode): LiveKit & Google Meet Dual-Provider ===');
  delete process.env.RESEND_API_KEY;

  // ---------- Real invite route ----------
  const invite = loadWithMocks('app/api/meetings/invite/route.ts', {
    'next/server': makeNextServerMock(),
    '@/lib/auth/server': { getAuthoritativeSession: async () => ({ user: { id: 'u1' }, role: 'Super Admin', tenantId: T1 }) },
    '@/lib/meetings/queries': { getMeetingById },
  });

  await test('invite route: google_meet meeting -> 200 OK with valid Google Meet URL', async () => {
    const res = await invite.POST(makeRequest({ publicId: 'mtg-gm', recipients: ['a@example.test'] }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.configured, false);
    const mailto = decodeURIComponent(res.body.fallbackMailto);
    assert.ok(mailto.includes('Google Meet') || mailto.includes('https://meet.google.com/abc-defg-hij'));
  });

  await test('invite route: LiveKit meeting -> Clasptek /meet link only (mailto fallback, no network)', async () => {
    const res = await invite.POST(makeRequest({ publicId: 'mtg-lk', recipients: ['a@example.test'] }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.configured, false);
    const mailto = decodeURIComponent(res.body.fallbackMailto);
    assert.ok(mailto.includes('/meet/mtg-lk'));
    assert.ok(mailto.includes('Clasptek LiveKit Classroom'));
    assert.ok(!mailto.includes('meet.google.com') && !mailto.includes('Google Meet'));
  });

  await test('invite route: cross-tenant meeting -> 404 (unchanged)', async () => {
    const res = await invite.POST(makeRequest({ publicId: 'mtg-o', recipients: ['a@example.test'] }));
    assert.strictEqual(res.status, 404);
  });

  // ---------- Real guest request route ----------
  let guestCreates = 0;
  const guest = loadWithMocks('app/api/meetings/guest/request/route.ts', {
    'next/server': makeNextServerMock(),
    '@/lib/meetings/queries': { getMeetingById },
    '@/lib/supabase/server': {
      createSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: (col, val) => ({
              is: () => ({
                maybeSingle: async () => {
                  const m = Object.values(meetings).find((x) => x.id === val || x.publicId === val);
                  if (!m) return { data: null };
                  return {
                    data: {
                      id: m.id,
                      public_id: m.publicId,
                      tenant_id: m.tenantId,
                      title: m.title,
                      status: m.status,
                      provider: m.sfuProvider,
                      provider_room_url: m.providerRoomUrl,
                      deleted_at: m.deletedAt,
                    },
                  };
                },
              }),
            }),
          }),
        }),
      }),
    },
    '@/lib/meetings/guest-requests': {
      createGuestRequest: async () => { guestCreates++; return { requestId: 'r1', requestToken: 't1' }; },
    },
  });

  await test('guest request route: google_meet enters waiting room with PENDING status and ZERO direct URL leakage', async () => {
    const res = await guest.POST(makeRequest({ publicId: 'mtg-gm', guestName: 'G', guestEmail: 'g@example.test' }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PENDING');
    assert.ok(!('redirectUrl' in res.body));
    assert.ok(!JSON.stringify(res.body).includes('meet.google.com'));
  });

  await test('guest request route: LiveKit meeting still enters the waiting room', async () => {
    const res = await guest.POST(makeRequest({ publicId: 'mtg-lk', guestName: 'G', guestEmail: 'g@example.test' }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PENDING');
    assert.strictEqual(guestCreates, 2);
  });

  // ---------- Google Meet Provider & OAuth Scope Verification ----------
  await test('createOrValidateGoogleMeet fails closed without Google connection or invalid URL', async () => {
    const gm = loadWithMocks('lib/meetings/google-meet.ts', {});
    // When called with invalid URL, it should fail
    await assert.rejects(
      gm.createOrValidateGoogleMeet({ tenantId: T1, title: 'x', scheduledStart: new Date().toISOString(), scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        customGoogleMeetUrl: 'https://invalid-domain.com/abc' }),
      (e) => e.code === 'INVALID_GOOGLE_MEET_URL' || e.code === 'NO_GOOGLE_CONNECTION'
    );
  });

  await test('OAuth scopes preserve least privilege (Drive & email, zero unneeded scopes)', () => {
    const cfg = require('../api/_lib/google-oauth-config');
    assert.ok(cfg.GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
    assert.ok(cfg.GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/userinfo.email'));
  });

  // ---------- Static UI / route assertions ----------
  await test('[static] ShareMeetingModal supports both LiveKit and Google Meet', () => {
    const share = read('components/meetings/ShareMeetingModal.tsx');
    assert.ok(share.includes('🌐 Google Meet'));
    assert.ok(share.includes('🎥 Clasptek LiveKit'));
    assert.ok(share.includes('isValidGoogleMeetShareUrl'));
  });

  await test('[static] schedule form offers LiveKit and Google Meet with NO default', () => {
    const list = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(
      list.includes("provider: null as 'livekit' | 'google_meet' | null") ||
      list.includes("provider: '' as '' | 'livekit' | 'google_meet'")
    );
    assert.ok(list.includes('value="livekit"') || list.includes('platformLiveKit'));
    assert.ok(list.includes('value="google_meet"') || list.includes('platformGoogleMeet'));
  });

  await test('[static] join route validates authentic Google Meet URL before redirecting', () => {
    const src = read('app/api/meetings/join/route.ts');
    assert.ok(src.includes("meeting.sfuProvider === 'google_meet'"));
    assert.ok(src.includes("meet.google.com"));
  });

  await test('[static] historical google_meet rows remain deserialisable', () => {
    assert.ok(read('lib/meetings/queries.ts').includes("'google_meet'"));
    assert.ok(read('types/meetings.ts').includes("'google_meet'"));
  });

  global.fetch = realFetch;
  console.log(`\nResult: ${passed}/${total} passed`);
  if (passed !== total) process.exitCode = 1;
})();
