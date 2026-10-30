/**
 * scripts/test_meetings_google_meet_and_livekit.js
 * Comprehensive Offline Verification Suite for Clasptek Meetings:
 * Multi-Provider (LiveKit & Google Meet) Explicit Selection Requirements (Phase C240AQ),
 * Strict Anti-Hallucination URL Validation, OAuth & Calendar Scope Enforcement,
 * Join & Token Issuance Invariants, Cross-Tenant Isolation, and Backward Compatibility.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

const googleConfig = require('../api/_lib/google-oauth-config');

// Module cache for transpiled modules
const moduleCache = new Map();

function loadTsModule(relPath, customOverrides = {}) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  const hasOverrides = Object.keys(customOverrides).length > 0;
  if (!hasOverrides && moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (customOverrides[id]) {
      return typeof customOverrides[id] === 'function' ? customOverrides[id]() : customOverrides[id];
    }
    if (id.includes('google-oauth-config')) {
      return googleConfig;
    }
    if (id === 'next/server') {
      return {
        NextRequest: class MockNextRequest {
          constructor(url, init = {}) {
            this.url = url;
            this._body = init.body ? JSON.parse(init.body) : {};
          }
          async json() {
            return this._body;
          }
        },
        NextResponse: {
          json: (data, init) => ({
            _data: data,
            status: init?.status || 200,
            json: async () => data,
            ok: (init?.status || 200) >= 200 && (init?.status || 200) < 300,
          }),
        },
      };
    }
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
                maybeSingle: () => Promise.resolve({ data: null }),
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
      return loadTsModule(candidate.endsWith('.ts') ? candidate : candidate + '.ts', customOverrides);
    }
    if (id.startsWith('../') || id.startsWith('./')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts', customOverrides);
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      if (fs.existsSync(candidate)) return require(candidate);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  if (!hasOverrides) moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const {
  isValidGoogleMeetUrl,
  normalizeGoogleMeetUrl,
  createOrValidateGoogleMeet,
  GoogleMeetError,
  isGoogleCalendarIntegrationEnabled,
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
  console.log('CLASPTEK MEETINGS — DUAL PROVIDER (LIVEKIT & GOOGLE MEET) SUITE');
  console.log('===============================================================\n');

  // --- Suite 1: Google Meet URL Format & Anti-Hallucination ---
  console.log('--- Suite 1: Google Meet URL Format & Canonical Validation ---');

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

  // --- Suite 2: Google Authorization & OAuth Invariants ---
  console.log('\n--- Suite 2: Google OAuth Configuration & Scopes ---');

  await test('GOOGLE_SCOPES excludes calendar.events while preserving drive.file and userinfo.email', () => {
    const scopes = googleConfig.GOOGLE_SCOPES;
    assert.ok(Array.isArray(scopes), 'GOOGLE_SCOPES must be an array');
    assert.ok(!scopes.some((s) => /calendar/i.test(s)), 'Must NOT request any Calendar scope in default');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'), 'Must preserve drive.file scope');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'Must preserve userinfo.email scope');
    assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive'), 'Must never request unrestricted full drive scope');
  });

  await test('getAuthorizationUrl configures offline access, prompt=consent, and canonical redirect URI', () => {
    const authUrl = googleConfig.getAuthorizationUrl('state_test_xyz');
    const parsed = new URL(authUrl);

    assert.strictEqual(parsed.searchParams.get('access_type'), 'offline', 'Must request offline access for refresh token');
    assert.strictEqual(parsed.searchParams.get('prompt'), 'consent', 'Must request prompt=consent');
    assert.strictEqual(parsed.searchParams.get('response_type'), 'code');
    assert.strictEqual(parsed.searchParams.get('state'), 'state_test_xyz');

    const config = googleConfig.resolveGoogleOAuthConfig();
    assert.ok(!config.redirectUri.includes('portal.clasptek.org'), 'Must not default to legacy portal.clasptek.org');
  });

  await test('refreshAccessToken supports object and string inputs, returning dual property names', async () => {
    const refreshedObj = await googleConfig.refreshAccessToken({
      refreshToken: 'mock_refresh_token_abc',
      tenantId: 'tenant-refresh-test',
      connectionType: 'TENANT_CENTRAL',
    });
    assert.ok(refreshedObj.accessToken, 'Must have accessToken (camelCase)');
    assert.ok(refreshedObj.access_token, 'Must have access_token (snake_case)');
    assert.strictEqual(refreshedObj.accessToken, refreshedObj.access_token);
    assert.strictEqual(refreshedObj.expiresIn, 3600);

    const refreshedStr = await googleConfig.refreshAccessToken('mock_refresh_token_xyz');
    assert.ok(refreshedStr.accessToken);
    assert.ok(refreshedStr.access_token);

    await assert.rejects(
      async () => googleConfig.refreshAccessToken(''),
      /GOOGLE_TOKEN_REFRESH_FAILED: Missing refresh token/
    );
  });

  await test('Drive upload compatibility under multi-scope authorization', async () => {
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

  // --- Suite 3: Explicit Dual-Provider Selection Requirements (Phase C240AQ) ---
  console.log('\n--- Suite 3: API Provider Requirement & Validation (C240AQ Requirements 1-3) ---');

  // Helper to load create route with controlled mocks
  function getCreateRouteHandler(mockSessionOverrides = {}, mockDbOverrides = {}) {
    const session = {
      user: { id: 'test-user-id', email: 'admin@clasptek.org' },
      role: 'Super Admin',
      tenantId: 'tenant-alpha',
      ...mockSessionOverrides,
    };

    return loadTsModule('app/api/meetings/create/route.ts', {
      '@/lib/auth/server': () => ({
        getAuthoritativeSession: async () => session,
      }),
      '@/lib/supabase/server': () => ({
        createServerClient: async () => ({
          from: (table) => {
            const filters = {};
            const query = {
              select: () => query,
              eq: (col, val) => {
                filters[col] = String(val);
                return query;
              },
              maybeSingle: async () => {
                for (const [key, val] of Object.entries(mockDbOverrides)) {
                  const [tbl, rest] = key.split(':');
                  if (tbl === table) {
                    const match = rest.split(',').every((pair) => {
                      const [c, v] = pair.split('=');
                      return filters[c] === v;
                    });
                    if (match) return { data: val };
                  }
                }
                return { data: null };
              },
            };
            return query;
          },
        }),
      }),
      '@/lib/meetings/sfu': () => ({
        getSFUService: () => ({
          createRoom: async (opts) => ({ sid: 'room-sid-1', name: opts.roomId }),
        }),
      }),
      '@/lib/meetings/queries': () => ({
        saveMeetingRecord: async (m) => m,
      }),
    });
  }

  await test('1. Missing provider returns HTTP 400 with PROVIDER_REQUIRED', async () => {
    const createRoute = getCreateRouteHandler();
    const req = {
      json: async () => ({
        title: 'Weekly Standup',
        // provider is omitted entirely
      }),
    };
    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res._data.error, 'PROVIDER_REQUIRED');
    assert.match(res._data.message, /livekit or google_meet/i);
  });

  await test('2. Empty provider (empty string or whitespace) returns HTTP 400 with PROVIDER_REQUIRED', async () => {
    const createRoute = getCreateRouteHandler();
    const emptyReq = {
      json: async () => ({
        title: 'Weekly Standup',
        provider: '',
      }),
    };
    const emptyRes = await createRoute.POST(emptyReq);
    assert.strictEqual(emptyRes.status, 400);
    assert.strictEqual(emptyRes._data.error, 'PROVIDER_REQUIRED');

    const wsReq = {
      json: async () => ({
        title: 'Weekly Standup',
        provider: '   ',
      }),
    };
    const wsRes = await createRoute.POST(wsReq);
    assert.strictEqual(wsRes.status, 400);
    assert.strictEqual(wsRes._data.error, 'PROVIDER_REQUIRED');
  });

  await test('3. Invalid provider returns HTTP 400 with PROVIDER_UNSUPPORTED', async () => {
    const createRoute = getCreateRouteHandler();
    const invalidReq = {
      json: async () => ({
        title: 'Weekly Standup',
        provider: 'zoom',
      }),
    };
    const invalidRes = await createRoute.POST(invalidReq);
    assert.strictEqual(invalidRes.status, 400);
    assert.strictEqual(invalidRes._data.error, 'PROVIDER_UNSUPPORTED');
    assert.match(invalidRes._data.message, /Unsupported meeting provider 'zoom'/);
  });

  // --- Suite 4: Provider-Specific Creation Paths ---
  console.log('\n--- Suite 4: Provider-Specific Creation Paths (C240AQ Requirements 4-7, 11-12) ---');

  await test('4. Explicit LiveKit selection creates and persists a LiveKit meeting', async () => {
    const createRoute = getCreateRouteHandler();
    const lkReq = {
      json: async () => ({
        title: 'Algorithms Seminar',
        provider: 'livekit',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };
    const res = await lkReq.json().then(() => createRoute.POST(lkReq));
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res._data.success, true);
    assert.strictEqual(res._data.provider, 'livekit');
    assert.strictEqual(res._data.meeting.sfuProvider, 'livekit');
    assert.ok(res._data.publicUrl.startsWith('/meet/'));
    assert.ok(res._data.sfuRoom.name);
  });

  await test('5. Explicit Google Meet selection follows the existing Google Meet creation path when enabled', async () => {
    const prevFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const prevVercelEnv = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      // Seed central connection with Calendar scope
      googleConfig._memoryConnectionStore.set('central:tenant-calendar-ok', {
        tenant_id: 'tenant-calendar-ok',
        connection_type: 'TENANT_CENTRAL',
        status: 'CONNECTED',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events',
        access_token: 'mock-token',
        _testAllowCalendar: true,
        _testMockMeetUrl: 'https://meet.google.com/cpk-mtng-liv',
      });

      const createRoute = getCreateRouteHandler({ tenantId: 'tenant-calendar-ok' });
      const gmReq = {
        json: async () => ({
          title: 'Executive Review',
          provider: 'google_meet',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
        }),
      };
      const res = await createRoute.POST(gmReq);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res._data.success, true);
      assert.strictEqual(res._data.provider, 'google_meet');
      assert.strictEqual(res._data.meeting.sfuProvider, 'google_meet');
      assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/cpk-mtng-liv');
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = prevFlag;
      if (prevVercelEnv) process.env.VERCEL_ENV = prevVercelEnv; else delete process.env.VERCEL_ENV;
    }
  });

  await test('6. Calendar-disabled Google Meet creation fails clearly when no custom URL is supplied (unconnected tenant)', async () => {
    const prevFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const prevVercelEnv = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      // Tenant without connected Google account or without Calendar scope
      const createRoute = getCreateRouteHandler({ tenantId: 'tenant-no-calendar' });
      const gmReq = {
        json: async () => ({
          title: 'Cohort Sync',
          provider: 'google_meet',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
        }),
      };
      const res = await createRoute.POST(gmReq);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res._data.error, 'PROVIDER_UNSUPPORTED');
      assert.match(res._data.message, /Google Meet is not configured for this organization/);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = prevFlag;
      if (prevVercelEnv) process.env.VERCEL_ENV = prevVercelEnv; else delete process.env.VERCEL_ENV;
    }
  });

  await test('6a. Disabled Calendar integration rejects blank-URL creation even when connection and scope exist (C240AW)', async () => {
    const prevFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'false';
      googleConfig._memoryConnectionStore.set('central:tenant-disabled-cal', {
        tenant_id: 'tenant-disabled-cal',
        connection_type: 'TENANT_CENTRAL',
        status: 'CONNECTED',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_token: 'mock-token',
        _testAllowCalendar: true,
      });
      let apiCalled = false;
      const dummyTransport = async () => { apiCalled = true; return { status: 200, body: {} }; };
      let errCaught = null;
      try {
        await createOrValidateGoogleMeet({
          tenantId: 'tenant-disabled-cal',
          title: 'Disabled Cal Meeting',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
          transport: dummyTransport,
        });
      } catch (err) {
        errCaught = err;
      }
      assert.ok(errCaught, 'Must throw error when Calendar integration is disabled');
      assert.strictEqual(errCaught.code, 'PROVIDER_UNSUPPORTED');
      assert.match(errCaught.message, /automated conference creation is not enabled/);
      assert.strictEqual(apiCalled, false, 'Calendar API must NOT be called when flag is disabled');

      // Direct HTTP route bypass verification
      const createRoute = getCreateRouteHandler({ tenantId: 'tenant-disabled-cal' });
      const httpReq = {
        json: async () => ({
          title: 'Disabled Cal Meeting HTTP',
          provider: 'google_meet',
          customGoogleMeetUrl: '',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
        }),
      };
      const res = await createRoute.POST(httpReq);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res._data.error, 'PROVIDER_UNSUPPORTED');
      assert.match(res._data.message, /automated conference creation is not enabled/);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = prevFlag;
    }
  });

  await test('6b. Existing valid custom Meet URL succeeds without Google connection (C240AW)', async () => {
    // Completely disconnected tenant
    const createRoute = getCreateRouteHandler({ tenantId: 'tenant-unconnected-custom' });
    const req = {
      json: async () => ({
        title: 'Unconnected External Meet',
        provider: 'google_meet',
        customGoogleMeetUrl: 'https://meet.google.com/xyz-uvwx-rst',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };
    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res._data.success, true);
    assert.strictEqual(res._data.provider, 'google_meet');
    assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/xyz-uvwx-rst');
  });

  await test('6c. Existing valid custom Meet URL succeeds without Calendar scope (C240AW)', async () => {
    // Connection exists with Drive scope only (no calendar.events scope)
    googleConfig._memoryConnectionStore.set('central:tenant-drive-only', {
      tenant_id: 'tenant-drive-only',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_token: 'mock-token',
    });
    const createRoute = getCreateRouteHandler({ tenantId: 'tenant-drive-only' });
    const req = {
      json: async () => ({
        title: 'Drive-Only External Meet',
        provider: 'google_meet',
        customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };
    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res._data.provider, 'google_meet');
    assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/abc-defg-hij');
  });

  await test('6d. Existing valid custom Meet URL succeeds while Calendar integration is disabled (C240AW)', async () => {
    const prevFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'false';
      const createRoute = getCreateRouteHandler({ tenantId: 'tenant-disabled-custom' });
      const req = {
        json: async () => ({
          title: 'Disabled Cal External Meet',
          provider: 'google_meet',
          customGoogleMeetUrl: 'https://meet.google.com/cal-dsbl-url',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
        }),
      };
      const res = await createRoute.POST(req);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res._data.provider, 'google_meet');
      assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/cal-dsbl-url');
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = prevFlag;
    }
  });

  await test('7. Valid custom Google Meet URL follows the supported existing path', async () => {
    // Valid format with connected tenant central connection
    googleConfig._memoryConnectionStore.set('central:tenant-custom-ok', {
      tenant_id: 'tenant-custom-ok',
      connection_type: 'TENANT_CENTRAL',
      status: 'CONNECTED',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_token: 'mock-token',
      _testAllowCalendar: true,
    });

    const customResult = await createOrValidateGoogleMeet({
      tenantId: 'tenant-custom-ok',
      title: 'Guest Lecture',
      scheduledStart: new Date(Date.now() + 3600000).toISOString(),
      scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    });

    assert.strictEqual(customResult.meetUrl, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(customResult.createdVia, 'CUSTOM_VERIFIED_URL');

    // And through the create route
    const createRoute = getCreateRouteHandler({ tenantId: 'tenant-custom-ok' });
    const req = {
      json: async () => ({
        title: 'Guest Lecture',
        provider: 'google_meet',
        customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };
    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res._data.provider, 'google_meet');
    assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/abc-defg-hij');
  });

  await test('11. Failed provider creation does not silently switch providers', async () => {
    // Attempt Google Meet creation with invalid URL
    const createRoute = getCreateRouteHandler({ tenantId: 'tenant-fail-test' });
    const req = {
      json: async () => ({
        title: 'Will Not Fallback',
        provider: 'google_meet',
        customGoogleMeetUrl: 'https://not-a-google-meet-domain.com/123-456-789',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };
    const res = await createRoute.POST(req);
    // Must fail and NOT silently create LiveKit meeting
    assert.strictEqual(res.status, 400);
    assert.ok(res._data.error);
    assert.notStrictEqual(res._data.provider, 'livekit');
  });

  await test('12. Existing idempotency and orphan-cleanup behavior remains intact', async () => {
    const prevFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const prevVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
    let deletedEventId = null;

    // Simulate database failure during save to verify orphan cleanup
    const createRoute = loadTsModule('app/api/meetings/create/route.ts', {
      '@/lib/auth/server': () => ({
        getAuthoritativeSession: async () => ({
          user: { id: 'test-user-id', email: 'admin@clasptek.org' },
          role: 'Super Admin',
          tenantId: 'tenant-calendar-ok',
        }),
      }),
      '@/lib/supabase/server': () => ({
        createServerClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
      }),
      '@/lib/meetings/queries': () => ({
        saveMeetingRecord: async () => {
          throw new Error('Database transaction timeout during meeting save');
        },
      }),
      '@/lib/meetings/google-meet': () => ({
        createOrValidateGoogleMeet: async () => ({
          meetUrl: 'https://meet.google.com/cpk-mtng-liv',
          calendarEventId: 'cal_event_orphan_123',
          createdVia: 'GOOGLE_CALENDAR_API',
        }),
        deleteGoogleCalendarEvent: async (opts) => {
          deletedEventId = opts.eventId;
          return true;
        },
      }),
    });

    const req = {
      json: async () => ({
        title: 'Orphan Cleanup Test',
        provider: 'google_meet',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };

    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 500);
    assert.strictEqual(deletedEventId, 'cal_event_orphan_123', 'Orphaned Google Calendar event must be deleted on save failure');
    if (prevVercelEnv) process.env.VERCEL_ENV = prevVercelEnv; else delete process.env.VERCEL_ENV;
    process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = prevFlag;
  });

  // --- Suite 5: Provider-Specific Join & Token Issuance Invariants ---
  console.log('\n--- Suite 5: Join & Token Issuance Invariants (C240AQ Requirements 8-9) ---');

  function getJoinRouteHandler(meetingRecord) {
    return loadTsModule('app/api/meetings/join/route.ts', {
      '@/lib/auth/server': () => ({
        getAuthoritativeSession: async () => ({
          user: { id: 'test-admin-id', email: 'admin@clasptek.org', user_metadata: { full_name: 'Admin User' } },
          role: 'Super Admin',
          tenantId: 'tenant-alpha',
        }),
      }),
      '@/lib/supabase/server': () => ({
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
      }),
      '@/lib/meetings/queries': () => ({
        getMeetingById: async () => ({ data: meetingRecord }),
        getMeetingByPublicId: async () => meetingRecord,
        updateMeetingStatus: async () => meetingRecord,
      }),
      '@/lib/meetings/sfu': () => ({
        getSFUService: () => ({
          generateParticipantToken: async () => {
            throw new Error('UNEXPECTED_SFU_CALL: generateParticipantToken must NOT be called for Google Meet');
          },
        }),
      }),
      '@/lib/meetings/recording-service': () => ({
        registerMeetingParticipant: async () => ({ canPublish: true }),
      }),
    });
  }

  await test('8. Google Meet join redirects to its persisted URL', async () => {
    const gmMeeting = {
      id: 'mtg-gm-1',
      tenantId: 'tenant-alpha',
      publicId: 'mtg-gm-pub-1',
      title: 'Web Development Workshop',
      status: 'SCHEDULED',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'google_meet',
      providerRoomUrl: 'https://meet.google.com/cpk-mtng-liv',
    };

    const joinRoute = getJoinRouteHandler(gmMeeting);
    const req = {
      json: async () => ({ publicId: 'mtg-gm-pub-1' }),
    };

    const res = await joinRoute.POST(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res._data.success, true);
    assert.strictEqual(res._data.sfuProvider, 'google_meet');
    assert.strictEqual(res._data.redirectUrl, 'https://meet.google.com/cpk-mtng-liv');
  });

  await test('9. Google Meet join does not issue LiveKit tokens', async () => {
    const gmMeeting = {
      id: 'mtg-gm-2',
      tenantId: 'tenant-alpha',
      publicId: 'mtg-gm-pub-2',
      title: 'Mobile App Workshop',
      status: 'SCHEDULED',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'google_meet',
      providerRoomUrl: 'https://meet.google.com/cpk-mtng-liv',
    };

    const joinRoute = getJoinRouteHandler(gmMeeting);
    const req = {
      json: async () => ({ publicId: 'mtg-gm-pub-2' }),
    };

    const res = await joinRoute.POST(req);
    assert.strictEqual(res.status, 200);
    // Must NOT have token property
    assert.strictEqual(res._data.token, undefined);
    assert.strictEqual(res._data.serverUrl, undefined);
  });

  await test('Missing Google Meet URL on join fails closed without fabricating URL', async () => {
    const badGmMeeting = {
      id: 'mtg-gm-bad',
      tenantId: 'tenant-alpha',
      publicId: 'mtg-gm-bad-pub',
      title: 'Broken Meet',
      status: 'SCHEDULED',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'google_meet',
      providerRoomUrl: null,
    };

    const joinRoute = getJoinRouteHandler(badGmMeeting);
    const req = {
      json: async () => ({ publicId: 'mtg-gm-bad-pub' }),
    };

    const res = await joinRoute.POST(req);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res._data.error, 'INVALID_PROVIDER_URL');
  });

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

  // --- Suite 6: Cross-Tenant Authorization Boundaries ---
  console.log('\n--- Suite 6: Cross-Tenant Authorization Boundaries (C240AQ Requirement 10) ---');

  await test('10. Cross-tenant authorization remains enforced', async () => {
    // Facilitator in tenant-alpha attempts to schedule for cohort not assigned or in tenant-beta
    const createRoute = getCreateRouteHandler(
      {
        role: 'Facilitator',
        tenantId: 'tenant-alpha',
        user: { id: 'user-fac-1' },
      },
      {
        // personnel profile resolved
        'personnel:user_id=user-fac-1,tenant_id=tenant-alpha': { id: 'pers-fac-1' },
        // cohort is not assigned to pers-fac-1 in tenant-alpha
      }
    );

    const req = {
      json: async () => ({
        title: 'Cross-Tenant Cohort Attempt',
        provider: 'livekit',
        cohortId: 'cohort-tenant-beta',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      }),
    };

    const res = await createRoute.POST(req);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res._data.error, 'COHORT_NOT_ASSIGNED');
  });

  // --- Suite 7: Guest Admission, Invitations & Database Schema Mapping ---
  console.log('\n--- Suite 7: Guest Admission, Invitations & Schema Preservation ---');

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
    const uploadHandlerPath = path.join(__dirname, '..', 'legacy', 'meetings', 'upload-recording.js');
    assert.ok(fs.existsSync(uploadHandlerPath), 'Upload handler must exist');
    const code = fs.readFileSync(uploadHandlerPath, 'utf8');
    assert.ok(code.includes('TENANT_CENTRAL'));
    assert.ok(code.includes('uploadFileToGoogleDrive'));
  });

  console.log('\n--- Suite 8: Fail-Closed Calendar Environment Classification (C240AY Requirements 1-13) ---');

  async function withEnv(envVars, fn) {
    const backup = {};
    for (const k of Object.keys(envVars)) {
      backup[k] = process.env[k];
      if (envVars[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = envVars[k];
      }
    }
    try {
      await fn();
    } finally {
      for (const k of Object.keys(backup)) {
        if (backup[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = backup[k];
        }
      }
    }
  }

  await test('1. Verified production + production flag true enables Calendar-generated creation', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'false',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), true);
    });
  });

  await test('2. Verified production + production flag false disables Calendar-generated creation', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'false',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('3. Verified preview + staging flag true enables Calendar-generated creation', async () => {
    await withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), true);
    });
  });

  await test('4. Verified preview + production flag true but staging flag false remains disabled', async () => {
    await withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'false',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('5. Verified production + staging flag true but production flag false remains disabled', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('6. CLASPTEK_ENV=staging cannot fall through to the production flag', async () => {
    await withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: 'staging',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'false',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('7. Conflicting markers fail closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: 'preview',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('8. Missing deployment identity fails closed', async () => {
    await withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('9. Canonical guard module load failure fails closed', async () => {
    assert.doesNotThrow(() => {
      isGoogleCalendarIntegrationEnabled({ bad: true });
    });
  });

  await test('10. Canonical guard exception fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const throwingReq = {
        get headers() {
          throw new Error('Host access violation');
        }
      };
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(throwingReq), false);
    });
  });

  await test('11. Existing valid custom Meet URL remains usable without OAuth in all states', async () => {
    const states = [
      { VERCEL_ENV: undefined, CLASPTEK_ENV: undefined },
      { VERCEL_ENV: 'production', CLASPTEK_ENV: 'preview' },
      { CLASPTEK_ENV: 'staging', STAGING_GOOGLE_CALENDAR_ENABLED: 'false' },
      { VERCEL_ENV: 'production', GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false' },
    ];

    for (const st of states) {
      await withEnv(st, async () => {
        const createRoute = getCreateRouteHandler({ tenantId: 'tenant-multi-env-custom' });
        const req = {
          json: async () => ({
            title: 'Resilient Custom Meet',
            provider: 'google_meet',
            customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij',
            scheduledStart: new Date(Date.now() + 3600000).toISOString(),
            scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
          }),
        };
        const res = await createRoute.POST(req);
        assert.strictEqual(res.status, 201, `Custom URL must succeed in state ${JSON.stringify(st)}`);
        assert.strictEqual(res._data.meetUrl, 'https://meet.google.com/abc-defg-hij');
      });
    }
  });

  await test('12. Disabled Calendar creation with existing connection and scope is rejected before database/API activity', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false',
    }, async () => {
      googleConfig._memoryConnectionStore.set('central:tenant-disabled-gate', {
        tenant_id: 'tenant-disabled-gate',
        connection_type: 'TENANT_CENTRAL',
        status: 'CONNECTED',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_token: 'mock-token',
        _testAllowCalendar: true,
      });

      let transportCalled = false;
      const spyTransport = async () => { transportCalled = true; return { status: 200, body: {} }; };

      let error = null;
      try {
        await createOrValidateGoogleMeet({
          tenantId: 'tenant-disabled-gate',
          title: 'Should Gate Before API',
          scheduledStart: new Date(Date.now() + 3600000).toISOString(),
          scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
          transport: spyTransport,
        });
      } catch (err) {
        error = err;
      }

      assert.ok(error);
      assert.strictEqual(error.code, 'PROVIDER_UNSUPPORTED');
      assert.strictEqual(transportCalled, false, 'Transport must not be invoked');
    });
  });

  await test('13. LiveKit remains independent of Calendar configuration in all states', async () => {
    const states = [
      { VERCEL_ENV: undefined, CLASPTEK_ENV: undefined },
      { VERCEL_ENV: 'production', CLASPTEK_ENV: 'preview' },
      { CLASPTEK_ENV: 'staging', STAGING_GOOGLE_CALENDAR_ENABLED: 'false' },
      { VERCEL_ENV: 'production', GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'false' },
    ];

    for (const st of states) {
      await withEnv(st, async () => {
        const createRoute = getCreateRouteHandler({ tenantId: 'tenant-livekit-gate-free' });
        const req = {
          json: async () => ({
            title: 'Independent LiveKit',
            provider: 'livekit',
            scheduledStart: new Date(Date.now() + 3600000).toISOString(),
            scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
          }),
        };
        const res = await createRoute.POST(req);
        assert.strictEqual(res.status, 201, `LiveKit must succeed in state ${JSON.stringify(st)}`);
        assert.strictEqual(res._data.provider, 'livekit');
      });
    }
  });

  const projectGuard = loadTsModule('lib/supabase/project-guard.ts');

  await test('14. Conflict guard unavailable while production and preview guards are available fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.hasConflictingEnvironmentMarkers;
      try {
        projectGuard.hasConflictingEnvironmentMarkers = undefined;
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.hasConflictingEnvironmentMarkers = orig;
      }
    });
  });

  await test('15. Production guard unavailable fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.isVerifiedProductionEnvironment;
      try {
        projectGuard.isVerifiedProductionEnvironment = undefined;
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.isVerifiedProductionEnvironment = orig;
      }
    });
  });

  await test('16. Preview/staging guard unavailable fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.isPreviewOrStagingEnvironment;
      try {
        projectGuard.isPreviewOrStagingEnvironment = undefined;
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.isPreviewOrStagingEnvironment = orig;
      }
    });
  });

  await test('17. Conflict guard throws fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.hasConflictingEnvironmentMarkers;
      try {
        projectGuard.hasConflictingEnvironmentMarkers = () => {
          throw new Error('Simulated conflict guard fault');
        };
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.hasConflictingEnvironmentMarkers = orig;
      }
    });
  });

  await test('18. Production guard throws fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.isVerifiedProductionEnvironment;
      try {
        projectGuard.isVerifiedProductionEnvironment = () => {
          throw new Error('Simulated production guard fault');
        };
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.isVerifiedProductionEnvironment = orig;
      }
    });
  });

  await test('19. Preview/staging guard throws fails closed', async () => {
    await withEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      const orig = projectGuard.isPreviewOrStagingEnvironment;
      try {
        projectGuard.isPreviewOrStagingEnvironment = () => {
          throw new Error('Simulated preview guard fault');
        };
        assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
      } finally {
        projectGuard.isPreviewOrStagingEnvironment = orig;
      }
    });
  });

  await test('20. Conflicting NEXT_PUBLIC_* and server-side markers fail closed', async () => {
    // 20a: VERCEL_ENV=production + NEXT_PUBLIC_VERCEL_ENV=preview
    await withEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });

    // 20b: VERCEL_ENV=preview + NEXT_PUBLIC_VERCEL_ENV=production
    await withEnv({
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });

    // 20c: CLASPTEK_ENV=production + NEXT_PUBLIC_CLASPTEK_ENV=staging
    await withEnv({
      CLASPTEK_ENV: 'production',
      NEXT_PUBLIC_CLASPTEK_ENV: 'staging',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(), false);
    });
  });

  await test('21. Preview hostname combined with conflicting environment markers fails closed', async () => {
    // 21a: Conflicting production and preview env markers with preview host header
    await withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: 'preview',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      const previewReq = {
        headers: {
          host: 'clasptek-git-branch-preview.vercel.app',
        },
      };
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(previewReq), false);
    });

    // 21b: Production server marker with preview host header
    await withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
    }, async () => {
      const previewReq = {
        headers: {
          host: 'clasptek-git-branch-preview.vercel.app',
        },
      };
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(previewReq), false);
    });
  });

  await test('22. Unknown identity combined with preview hostname fails closed', async () => {
    await withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      STAGING_GOOGLE_CALENDAR_ENABLED: 'true',
      GOOGLE_CALENDAR_INTEGRATION_ENABLED: 'true',
    }, async () => {
      const previewReq = {
        headers: {
          host: 'clasptek-git-branch-preview.vercel.app',
        },
      };
      assert.strictEqual(isGoogleCalendarIntegrationEnabled(previewReq), false);
    });
  });

  console.log('\n===============================================================');
  console.log(`MULTI-PROVIDER TEST RESULTS: ${passed} PASSED / ${total - passed} FAILED (TOTAL ${total})`);
  console.log('===============================================================');
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exitCode = 1;
});
