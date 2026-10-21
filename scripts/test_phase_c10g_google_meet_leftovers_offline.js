/**
 * scripts/test_phase_c10g_google_meet_leftovers_offline.js
 * Phase C10G — LiveKit-only: no Google Meet creation/join/share path, scope audit, historical row handling.
 *
 * Real route handlers (invite, guest/request) run against injected mocks; other checks are static source
 * assertions and are labelled as such. No network access, no database, no live services.
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
  gm: { id: 'm-gm', tenantId: T1, publicId: 'mtg-gm', title: 'Legacy', sfuProvider: 'google_meet',
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
  console.log('=== C10G: Google Meet leftovers (LiveKit-only) ===');
  delete process.env.RESEND_API_KEY;

  // ---------- Real invite route ----------
  const invite = loadWithMocks('app/api/meetings/invite/route.ts', {
    'next/server': makeNextServerMock(),
    '@/lib/auth/server': { getAuthoritativeSession: async () => ({ user: { id: 'u1' }, role: 'Super Admin', tenantId: T1 }) },
    '@/lib/meetings/queries': { getMeetingById },
  });

  await test('invite route: legacy google_meet meeting -> 400 PROVIDER_UNSUPPORTED, no Google URL emitted', async () => {
    const res = await invite.POST(makeRequest({ publicId: 'mtg-gm', recipients: ['a@example.test'] }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'PROVIDER_UNSUPPORTED');
    assert.ok(!JSON.stringify(res.body).includes('meet.google.com'));
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
    '@/lib/meetings/guest-requests': {
      createGuestRequest: async () => { guestCreates++; return { requestId: 'r1', requestToken: 't1' }; },
    },
  });

  await test('guest request route: legacy google_meet -> 400 PROVIDER_UNSUPPORTED, no redirectUrl, no waiting-room entry', async () => {
    const res = await guest.POST(makeRequest({ publicId: 'mtg-gm', guestName: 'G', guestEmail: 'g@example.test' }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'PROVIDER_UNSUPPORTED');
    assert.ok(!('redirectUrl' in res.body));
    assert.ok(!JSON.stringify(res.body).includes('meet.google.com'));
    assert.strictEqual(guestCreates, 0);
  });

  await test('guest request route: LiveKit meeting still enters the waiting room', async () => {
    const res = await guest.POST(makeRequest({ publicId: 'mtg-lk', guestName: 'G', guestEmail: 'g@example.test' }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PENDING');
    assert.strictEqual(guestCreates, 1);
  });

  // ---------- google-meet.ts still fails closed ----------
  await test('createOrValidateGoogleMeet always throws PROVIDER_UNSUPPORTED', async () => {
    const gm = loadWithMocks('lib/meetings/google-meet.ts', {});
    await assert.rejects(
      gm.createOrValidateGoogleMeet({ tenantId: T1, title: 'x', scheduledStart: 'a', scheduledEnd: 'b',
        customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij' }),
      (e) => e.code === 'PROVIDER_UNSUPPORTED'
    );
  });

  // ---------- OAuth scope audit ----------
  await test('OAuth scopes are exactly drive.file + userinfo.email (no Calendar)', () => {
    const cfg = require('../api/_lib/google-oauth-config');
    assert.deepStrictEqual(
      [...cfg.GOOGLE_SCOPES].sort(),
      ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email']
    );
    const url = new URL(cfg.getAuthorizationUrl('state-x'));
    const scope = url.searchParams.get('scope') || '';
    assert.ok(!/calendar/i.test(scope));
    assert.ok(scope.includes('drive.file') && !/googleapis\.com\/auth\/drive(\s|$)/.test(scope));
  });

  await test('[static] no source calls the Google Calendar API or requests a Calendar scope', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) { if (!/node_modules|\.next|preview/.test(e.name)) walk(rel); continue; }
        if (!/\.(ts|tsx|js)$/.test(e.name)) continue;
        const src = read(rel);
        if (/auth\/calendar|calendar\/v3|googleapis\.com\/calendar/.test(src)) offenders.push(rel);
      }
    };
    ['app', 'lib', 'api', 'components'].forEach(walk);
    assert.deepStrictEqual(offenders, []);
  });

  // ---------- Static UI / route assertions ----------
  await test('[static] landing page and share modal expose no external Google Meet link or action', () => {
    const landing = read('app/meet/[id]/MeetLandingClient.tsx');
    assert.ok(!/Open Google Meet/.test(landing));
    assert.ok(!/href=\{meeting\.providerRoomUrl\}/.test(landing));
    assert.ok(!/Platform: Google Meet/.test(landing));
    const share = read('components/meetings/ShareMeetingModal.tsx');
    assert.ok(/const meetingUrl = isGoogleMeet \? '' :/.test(share), 'legacy rows must expose no link');
    assert.ok(!/Google Meet Conference URL|Join Google Meet/.test(share));
    const list = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(!/'Google Meet' : 'LiveKit'/.test(list));
  });

  await test('[static] schedule form offers LiveKit only', () => {
    const list = read('app/meetings/MeetingsPageClient.tsx');
    assert.ok(/provider: 'livekit' as const/.test(list));
    assert.ok(!/<option[^>]*google/i.test(list));
  });

  await test('[static] join route rejects google_meet before any token issuance', () => {
    const src = read('app/api/meetings/join/route.ts');
    const rejectAt = src.indexOf("meeting.sfuProvider === 'google_meet'");
    assert.ok(rejectAt > 0 && src.indexOf('PROVIDER_UNSUPPORTED', rejectAt) > rejectAt);
    const tokenAt = src.search(/generateToken|createParticipantToken|\.createToken\(|issueToken/);
    if (tokenAt !== -1) assert.ok(rejectAt < tokenAt, 'rejection must precede token issuance');
  });

  await test('[static] historical google_meet rows remain deserialisable; no new creation path', () => {
    assert.ok(/'google_meet'\]\.includes\(rawProvider\)/.test(read('lib/meetings/queries.ts')));
    assert.ok(/'google_meet'/.test(read('types/meetings.ts')));
    const callers = [];
    ['app', 'lib', 'components', 'api'].forEach(function walk(dir) {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) { if (!/node_modules|\.next|preview/.test(e.name)) walk(rel); continue; }
        if (/\.(ts|tsx|js)$/.test(e.name) && rel.replace(/\\/g, '/') !== 'lib/meetings/google-meet.ts'
            && /createOrValidateGoogleMeet/.test(read(rel))) callers.push(rel);
      }
    });
    assert.deepStrictEqual(callers, [], 'nothing may call createOrValidateGoogleMeet');
  });

  global.fetch = realFetch;
  console.log(`\nResult: ${passed}/${total} passed`);
  console.log('Limitation: [static] tests inspect source text only; no browser rendering was performed.');
  if (passed !== total) process.exitCode = 1;
})();
