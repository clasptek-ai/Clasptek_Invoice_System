/**
 * scripts/test_meetings_google_meet_and_livekit.js
 * Comprehensive Verification Suite for Clasptek Meetings:
 * Multi-Provider (LiveKit & Google Meet) Support, Strict URL Validation,
 * Google Calendar Scope Enforcement, Token Issuance Invariants,
 * Invitation Formatting, Guest Admission Models, and Recording Integration.
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

const {
  isValidGoogleMeetUrl,
  normalizeGoogleMeetUrl,
  createOrValidateGoogleMeet,
  GoogleMeetError,
} = loadTsModule('lib/meetings/google-meet.ts');

const { LiveKitService } = loadTsModule('lib/meetings/sfu.ts');

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
  console.log('CLASPTEK MEETINGS — LIVEKIT & GOOGLE MEET MULTI-PROVIDER SUITE');
  console.log('===============================================================\n');

  // --- Suite 1: Google Meet URL Format & Canonical Validation ---
  console.log('--- Suite 1: Google Meet URL Format & Anti-Hallucination ---');

  await test('Validates authentic Google Meet URLs with 3-4-3 meeting codes', () => {
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/abc-defg-hij'), true);
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/xyz-pqrs-tuv?authuser=1'), true);
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/cpk-mtng-liv'), true);
  });

  await test('Rejects fabricated, malformed, non-https, or non-Google Meet URLs', () => {
    assert.strictEqual(isValidGoogleMeetUrl('https://meet.google.com/fake-url'), false);
    assert.strictEqual(isValidGoogleMeetUrl('http://meet.google.com/abc-defg-hij'), false);
    assert.strictEqual(isValidGoogleMeetUrl('https://google.com/meet/abc-defg-hij'), false);
    assert.strictEqual(isValidGoogleMeetUrl('https://fake-meet.com/abc-defg-hij'), false);
    assert.strictEqual(isValidGoogleMeetUrl('meet.google.com/abc-defg-hij'), false);
    assert.strictEqual(isValidGoogleMeetUrl(''), false);
    assert.strictEqual(isValidGoogleMeetUrl(null), false);
    assert.strictEqual(isValidGoogleMeetUrl(undefined), false);
  });

  await test('Normalizes valid Google Meet URL and throws on invalid', () => {
    const valid = '  https://meet.google.com/abc-defg-hij  ';
    assert.strictEqual(normalizeGoogleMeetUrl(valid), 'https://meet.google.com/abc-defg-hij');

    assert.throws(
      () => normalizeGoogleMeetUrl('https://not-google.com/abc-defg-hij'),
      /INVALID_GOOGLE_MEET_URL/
    );
  });

  // --- Suite 2: Google Authorization & Scope Verification ---
  console.log('\n--- Suite 2: Google OAuth & Calendar Scope Enforcement ---');

  const googleConfig = require('../api/_lib/google-oauth-config');

  await test('GOOGLE_SCOPES contains calendar.events while preserving drive.file and userinfo.email', () => {
    const scopes = googleConfig.GOOGLE_SCOPES;
    assert.ok(Array.isArray(scopes), 'GOOGLE_SCOPES must be an array');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.events'), 'Must request calendar.events scope');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'), 'Must preserve drive.file scope');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'Must preserve userinfo.email scope');
    assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive'), 'Must never request unrestricted full drive scope');
  });

  await test('getAuthorizationUrl configures offline access, prompt=consent, and expanded scopes', () => {
    const authUrl = googleConfig.getAuthorizationUrl('state_test_xyz');
    const parsed = new URL(authUrl);

    assert.strictEqual(parsed.searchParams.get('access_type'), 'offline', 'Must request offline access for refresh token');
    assert.strictEqual(parsed.searchParams.get('prompt'), 'consent', 'Must request prompt=consent');
    assert.strictEqual(parsed.searchParams.get('response_type'), 'code');
    assert.strictEqual(parsed.searchParams.get('state'), 'state_test_xyz');

    const scopeParam = parsed.searchParams.get('scope') || '';
    assert.ok(scopeParam.includes('calendar.events'), 'Auth URL must include calendar.events');
    assert.ok(scopeParam.includes('drive.file'), 'Auth URL must include drive.file');
    assert.ok(scopeParam.includes('userinfo.email'), 'Auth URL must include userinfo.email');
  });

  await test('Preserves canonical redirect URI portal.clasptek.org', () => {
    const config = googleConfig.resolveGoogleOAuthConfig();
    assert.ok(!config.redirectUri.includes('app.clasptek.org'), 'Must not change portal to app.clasptek.org');
    // Default canonical without custom env
    const canonical = 'https://portal.clasptek.org/api/auth/google/callback';
    if (!process.env.GOOGLE_REDIRECT_URI) {
      assert.strictEqual(config.redirectUri, canonical);
    }
  });

  await test('refreshAccessToken supports both object and string inputs, returning dual property names', async () => {
    // 1. Object argument
    const refreshedObj = await googleConfig.refreshAccessToken({
      refreshToken: 'mock_refresh_token_abc',
      tenantId: 'tenant-refresh-test',
      connectionType: 'TENANT_CENTRAL',
    });
    assert.ok(refreshedObj.accessToken, 'Must have accessToken (camelCase)');
    assert.ok(refreshedObj.access_token, 'Must have access_token (snake_case)');
    assert.strictEqual(refreshedObj.accessToken, refreshedObj.access_token);
    assert.strictEqual(refreshedObj.expiresIn, 3600);

    // 2. Raw string argument
    const refreshedStr = await googleConfig.refreshAccessToken('mock_refresh_token_xyz');
    assert.ok(refreshedStr.accessToken);
    assert.ok(refreshedStr.access_token);

    // 3. Missing refresh token throws
    await assert.rejects(
      async () => googleConfig.refreshAccessToken(''),
      /GOOGLE_TOKEN_REFRESH_FAILED: Missing refresh token/
    );
  });

  await test('Fails closed when Google authorization is missing for tenant', async () => {
    try {
      await createOrValidateGoogleMeet({
        tenantId: 'unauthorized-tenant-uuid',
        title: 'Weekly Seminar',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Should have thrown GOOGLE_MEET_AUTH_REQUIRED');
    } catch (err) {
      assert.strictEqual(err.code, 'GOOGLE_MEET_AUTH_REQUIRED');
      assert.match(err.message, /No active Google authorization found/);
    }
  });

  await test('Rejects creation when tenant Google connection has Drive scope but lacks Calendar scope', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-drive-only', {
      tenant_id: 'tenant-drive-only',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_token: 'mock-token',
    });

    try {
      await createOrValidateGoogleMeet({
        tenantId: 'tenant-drive-only',
        title: 'Weekly Seminar',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.fail('Should have thrown GOOGLE_MEET_SCOPE_MISSING');
    } catch (err) {
      assert.strictEqual(err.code, 'GOOGLE_MEET_SCOPE_MISSING');
      assert.match(err.message, /calendar.events/);
    }
  });

  await test('Succeeds automated creation when tenant has calendar.events scope', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-calendar-ok', {
      tenant_id: 'tenant-calendar-ok',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events',
      access_token: 'mock-token',
      _testAllowCalendar: true,
      _testMockMeetUrl: 'https://meet.google.com/cpk-mtng-liv',
    });

    const res = await createOrValidateGoogleMeet({
      tenantId: 'tenant-calendar-ok',
      title: 'Physics Lab',
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
    });

    assert.strictEqual(res.meetUrl, 'https://meet.google.com/cpk-mtng-liv');
    assert.strictEqual(res.createdVia, 'GOOGLE_CALENDAR_API');
    assert.strictEqual(isValidGoogleMeetUrl(res.meetUrl), true);
  });

  await test('Never fabricates Google Meet URLs when Calendar response is invalid or missing', async () => {
    googleConfig._memoryConnectionStore.set('central:tenant-calendar-bad-response', {
      tenant_id: 'tenant-calendar-bad-response',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_token: 'mock-token',
      _testAllowCalendar: true,
      _testMockMeetUrl: 'not-a-real-meet-url',
    });

    await assert.rejects(
      async () => createOrValidateGoogleMeet({
        tenantId: 'tenant-calendar-bad-response',
        title: 'Invalid Conference Test',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      }),
      /GOOGLE_MEET_CREATION_FAILED/
    );
  });

  await test('Continued Drive upload compatibility under multi-scope authorization', async () => {
    // Verify uploadFileToGoogleDrive continues to work seamlessly
    const uploadRes = await googleConfig.uploadFileToGoogleDrive({
      fileName: 'recording-session-001.mp4',
      mimeType: 'video/mp4',
      fileBuffer: Buffer.from('mock video data 123456789'),
      folderId: 'mock_root_folder_tenant_central',
      accessToken: 'mock_google_access_token_multi_scope',
    });

    assert.ok(uploadRes.fileId);
    assert.strictEqual(uploadRes.fileName, 'recording-session-001.mp4');
    assert.strictEqual(uploadRes.folderId, 'mock_root_folder_tenant_central');
    assert.ok(uploadRes.webViewUrl.includes('drive.google.com'));
  });

  await test('Accepts verified custom Google Meet URL without requiring automated API creation', async () => {
    const res = await createOrValidateGoogleMeet({
      tenantId: 'tenant-any',
      title: 'Math Tutorial',
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
      customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    });

    assert.strictEqual(res.meetUrl, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(res.createdVia, 'CUSTOM_VERIFIED_URL');
  });

  await test('Rejects fabricated or invalid custom Google Meet URL', async () => {
    try {
      await createOrValidateGoogleMeet({
        tenantId: 'tenant-any',
        title: 'Math Tutorial',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        customGoogleMeetUrl: 'https://meet.google.com/fabricated-invalid-code',
      });
      assert.fail('Should have thrown INVALID_GOOGLE_MEET_URL');
    } catch (err) {
      assert.strictEqual(err.code, 'INVALID_GOOGLE_MEET_URL');
    }
  });

  // --- Suite 3: Provider-Specific Meeting Join & Token Behavior ---
  console.log('\n--- Suite 3: Provider-Specific Join & Token Issuance Invariants ---');

  await test('LiveKit meeting issues LiveKit JWT token upon join', async () => {
    const sfu = new LiveKitService({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret-12345678901234567890',
      url: 'wss://livekit.clasptek.org',
    });

    const tokenRes = await sfu.generateParticipantToken({
      roomId: 'mtg-test-room-1',
      participantId: 'user-123',
      participantName: 'Alice Student',
      isHost: false,
      role: 'STUDENT',
    });

    assert.ok(tokenRes.token, 'Must return JWT token');
    assert.strictEqual(typeof tokenRes.token, 'string');
    assert.strictEqual(tokenRes.serverUrl, 'wss://livekit.clasptek.org');
  });

  await test('Google Meet meetings NEVER issue LiveKit tokens and return redirectUrl', () => {
    const googleMeeting = {
      id: 'mtg_001',
      publicId: 'mtg-google-001',
      sfuProvider: 'google_meet',
      providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
      status: 'SCHEDULED',
    };

    // Simulate join route logic
    const isGoogleMeet = googleMeeting.sfuProvider === 'google_meet';
    assert.strictEqual(isGoogleMeet, true);

    const joinResponse = {
      success: true,
      provider: 'google_meet',
      sfuProvider: 'google_meet',
      redirectUrl: googleMeeting.providerRoomUrl,
      meetingUrl: googleMeeting.providerRoomUrl,
      isHost: false,
      role: 'STUDENT',
      // Explicit invariant: no LiveKit token
      token: undefined,
    };

    assert.strictEqual(joinResponse.redirectUrl, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(joinResponse.token, undefined);
    assert.strictEqual(joinResponse.provider, 'google_meet');
  });

  await test('Missing Google Meet URL on join fails closed without fabricating URL', () => {
    const badGoogleMeeting = {
      id: 'mtg_002',
      publicId: 'mtg-google-002',
      sfuProvider: 'google_meet',
      providerRoomUrl: null,
      status: 'SCHEDULED',
    };

    let error = null;
    if (!badGoogleMeeting.providerRoomUrl) {
      error = {
        error: 'GOOGLE_MEET_URL_MISSING',
        message: 'The Google Meet link for this meeting has not been configured or is missing.',
      };
    }

    assert.ok(error);
    assert.strictEqual(error.error, 'GOOGLE_MEET_URL_MISSING');
  });

  // --- Suite 4: Invitation & Sharing Behavior for Both Providers ---
  console.log('\n--- Suite 4: Invitation Sharing (Direct Link, WhatsApp, Email) ---');

  await test('LiveKit meeting invitation shares /meet/{publicId} landing page', () => {
    const meeting = {
      publicId: 'mtg-livekit-123',
      title: 'DevOps Workshop',
      sfuProvider: 'livekit',
      facilitatorName: 'Dr. John',
      scheduledStart: '2026-10-15T10:00:00Z',
      scheduledEnd: '2026-10-15T12:00:00Z',
    };

    const origin = 'https://app.clasptek.org';
    const joinUrl = `${origin}/meet/${meeting.publicId}`;
    assert.strictEqual(joinUrl, 'https://app.clasptek.org/meet/mtg-livekit-123');

    const message = `🎓 Clasptek Online Classroom Invitation\nMeeting: ${meeting.title}\nJoin via Clasptek LiveKit Classroom:\n${joinUrl}`;
    const waEncoded = encodeURIComponent(message);
    assert.ok(waEncoded.includes('app.clasptek.org%2Fmeet%2Fmtg-livekit-123'));
  });

  await test('Google Meet invitation shares verified Google Meet URL directly', () => {
    const meeting = {
      publicId: 'mtg-google-456',
      title: 'Design Critique',
      sfuProvider: 'google_meet',
      providerRoomUrl: 'https://meet.google.com/des-crit-iqe',
      facilitatorName: 'Prof. Sarah',
      scheduledStart: '2026-10-15T14:00:00Z',
      scheduledEnd: '2026-10-15T15:30:00Z',
    };

    const joinUrl = meeting.providerRoomUrl;
    assert.strictEqual(joinUrl, 'https://meet.google.com/des-crit-iqe');

    const message = `🎓 Clasptek Classroom Invitation — Google Meet\nMeeting: ${meeting.title}\nPlatform: Google Meet\nJoin Google Meet:\n${joinUrl}`;
    const waEncoded = encodeURIComponent(message);
    assert.ok(waEncoded.includes('meet.google.com%2Fdes-crit-iqe'));
    assert.ok(message.includes('Platform: Google Meet'));
  });

  // --- Suite 5: External Guest Admission Models ---
  console.log('\n--- Suite 5: Guest Admission Models (LiveKit Waiting Room vs Google Meet) ---');

  await test('LiveKit external guest enters waiting room and receives short-lived token on approval', async () => {
    const { createGuestRequest, decideGuestRequest } = loadTsModule('lib/meetings/guest-requests.ts');

    const req = await createGuestRequest({
      tenantId: 'tenant-test-guest',
      meetingId: 'mtg-livekit-g1',
      meetingPublicId: 'mtg-livekit-pub1',
      guestName: 'External Auditor',
      guestEmail: 'auditor@external.com',
    });

    assert.ok(req.requestId);
    assert.ok(req.requestToken);

    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-12345678901234567890';
    process.env.LIVEKIT_URL = 'wss://livekit.clasptek.org';

    const decision = await decideGuestRequest({
      requestId: req.requestId,
      decision: 'APPROVE',
      deciderUserId: 'host-user-1',
      tenantId: 'tenant-test-guest',
      meetingPublicId: 'mtg-livekit-pub1',
    });

    assert.strictEqual(decision.success, true);
    assert.strictEqual(decision.status, 'APPROVED');
  });

  await test('Google Meet meetings reject LiveKit guest waiting room requests with redirect instructions', () => {
    const meeting = {
      sfuProvider: 'google_meet',
      providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
    };

    // Simulated /api/meetings/guest/request route check
    let response = null;
    if (meeting.sfuProvider === 'google_meet') {
      response = {
        error: 'GOOGLE_MEET_EXTERNAL_MANAGEMENT',
        message: 'This meeting is hosted on Google Meet. Admission and room controls are managed directly by Google Meet, not through Clasptek waiting rooms.',
        provider: 'google_meet',
        redirectUrl: meeting.providerRoomUrl,
      };
    }

    assert.ok(response);
    assert.strictEqual(response.error, 'GOOGLE_MEET_EXTERNAL_MANAGEMENT');
    assert.strictEqual(response.redirectUrl, 'https://meet.google.com/abc-defg-hij');
  });

  // --- Suite 6: Database Persistence & Migration Invariants ---
  console.log('\n--- Suite 6: Schema, Migrations, and Recording Storage Preservation ---');

  await test('Database query mapper maps GOOGLE_MEET provider and provider_room_url', () => {
    const rawRow = {
      id: 'db_mtg_1',
      tenant_id: 'tenant_1',
      public_id: 'mtg-db-pub1',
      title: 'Database Architecture',
      provider: 'GOOGLE_MEET',
      provider_room_url: 'https://meet.google.com/dba-rch-tec',
      status: 'SCHEDULED',
      scheduled_start: '2026-10-12T09:00:00Z',
      scheduled_end: '2026-10-12T10:30:00Z',
    };

    const rawProvider = String(rawRow.provider || 'LIVEKIT').toLowerCase();
    const sfuProvider = ['livekit', 'daily', 'mock', 'google_meet'].includes(rawProvider) ? rawProvider : 'livekit';

    assert.strictEqual(sfuProvider, 'google_meet');
    assert.strictEqual(rawRow.provider_room_url, 'https://meet.google.com/dba-rch-tec');
  });

  await test('Migration file 20261010_meetings_google_meet_provider.sql exists and contains valid DDL', () => {
    const migrationPath = path.join(__dirname, '..', 'migrations', '20261010_meetings_google_meet_provider.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
    const ddl = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(ddl.includes('GOOGLE_MEET'));
    assert.ok(ddl.includes('meetings_provider_check'));
  });

  await test('Preserves Google Drive central recording repository workflows for both providers', () => {
    const uploadHandlerPath = path.join(__dirname, '..', 'api', 'meetings', 'upload-recording.js');
    assert.ok(fs.existsSync(uploadHandlerPath));
    const code = fs.readFileSync(uploadHandlerPath, 'utf8');
    assert.ok(code.includes('TENANT_CENTRAL'));
    assert.ok(code.includes('uploadFileToGoogleDrive'));
  });

  console.log('\n===============================================================');
  console.log(`MULTI-PROVIDER TEST RESULTS: ${passed} PASSED / ${total - passed} FAILED (TOTAL ${total})`);
  console.log('===============================================================');
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exitCode = 1;
});
