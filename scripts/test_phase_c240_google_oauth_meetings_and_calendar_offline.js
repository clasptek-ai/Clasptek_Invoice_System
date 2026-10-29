/**
 * CLASPTEK PHASE C240A — OFFLINE VERIFICATION TEST SUITE
 * Google OAuth Return-to-Meetings and Calendar Readiness Certification
 *
 * Tests the 11 Phase C240A requirements:
 *  1. Successful OAuth callback returns to Meetings (/meetings?...)
 *  2. Denial and callback errors return to Meetings with safe messages
 *  3. Unsafe external return URLs are rejected (open-redirect prevention)
 *  4. Invalid or mismatched OAuth state is rejected
 *  5. Connection persistence failure never produces a success state
 *  6. Calendar feature flag disabled is reported accurately (CALENDAR_DISABLED)
 *  7. Missing Calendar scope is reported accurately (PERMISSION_REQUIRED)
 *  8. Invalid or expired credentials and Calendar API failures produce recoverable status (RECONNECT_REQUIRED / VERIFICATION_FAILED)
 *  9. Successful read-only Calendar verification produces verified-ready state (CONNECTED + calendarReady: true)
 * 10. Calendar failure does not prevent valid LiveKit meeting operations
 * 11. Refreshing the Meetings page strips transient callback params via replaceState to prevent duplicate alerts
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

function runSyncTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

// Mock Response Helper
function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    },
    end(chunk) {
      if (chunk) this.body += chunk;
      return this;
    }
  };
}

const repoRoot = path.resolve(__dirname, '..');
process.env.CLASPTEK_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
const oauthConfig = require('../api/_lib/google-oauth-config');

// Transpile and load TypeScript module helper
let authMockSession = {
  user: { id: 'usr-123', email: 'admin@clasptek.org' },
  role: 'Super Admin',
  tenantId: 'tenant-test-123',
};
let authMockError = null;

function loadTs(relPath) {
  const fullPath = path.resolve(repoRoot, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const mod = { exports: {} };
  const customRequire = (id) => {
    if (id.includes('google-oauth-config')) {
      return oauthConfig;
    }
    if (id.includes('auth/server')) {
      return {
        requireAuth: async () => {
          if (authMockError) {
            return {
              session: null,
              errorResponse: {
                status: authMockError.status || 401,
                json: async () => authMockError.body,
                body: authMockError.body
              }
            };
          }
          return {
            session: authMockSession,
            errorResponse: null,
          };
        },
      };
    }
    if (id.includes('next/server')) {
      return {
        NextResponse: {
          json: (body, opts = {}) => ({
            status: opts.status || 200,
            json: async () => body,
            body
          }),
        },
      };
    }
    if (id.startsWith('@/')) {
      const candidate = path.join(repoRoot, id.slice(2));
      return loadTs(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', 'globalThis', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath), globalThis);
  return mod.exports;
}

async function runAllC240ATests() {
  console.log('================================================================================');
  console.log(' PHASE C240A: GOOGLE OAUTH RETURN-TO-MEETINGS & CALENDAR READINESS TEST SUITE');
  console.log('================================================================================\n');

  const {
    validateReturnUrl,
    appendQueryParams,
    resolveGoogleOAuthConfig
  } = oauthConfig;

  const callbackHandler = require('../api/auth/google/callback');
  const authHandler = require('../api/auth/google/auth');

  // --- REQUIREMENT 3: Open Redirect Prevention & validateReturnUrl ---
  console.log('--- SUITE 1: Return URL Validation & Open-Redirect Prevention ---');

  runSyncTest('1.1: Rejects absolute external URLs (https://evil.com)', () => {
    assert.strictEqual(validateReturnUrl('https://evil.com'), '/meetings');
    assert.strictEqual(validateReturnUrl('http://attacker.org/phish'), '/meetings');
  });

  runSyncTest('1.2: Rejects protocol-relative URLs (//evil.com, ///evil.com)', () => {
    assert.strictEqual(validateReturnUrl('//evil.com'), '/meetings');
    assert.strictEqual(validateReturnUrl('///evil.com'), '/meetings');
  });

  runSyncTest('1.3: Rejects backslash evasion attempts (/\\evil.com, \\\\evil.com)', () => {
    assert.strictEqual(validateReturnUrl('/\\evil.com'), '/meetings');
    assert.strictEqual(validateReturnUrl('\\evil.com'), '/meetings');
    assert.strictEqual(validateReturnUrl('\\\\evil.com'), '/meetings');
  });

  runSyncTest('1.4: Rejects CRLF and control characters', () => {
    assert.strictEqual(validateReturnUrl('/meetings\r\nSet-Cookie: evil'), '/meetings');
    assert.strictEqual(validateReturnUrl('/meetings\x00evil'), '/meetings');
  });

  runSyncTest('1.5: Normalizes legacy /#meetings to /meetings', () => {
    assert.strictEqual(validateReturnUrl('/#meetings'), '/meetings');
  });

  runSyncTest('1.6: Preserves valid /meetings with query params (e.g., ?tab=schedule)', () => {
    assert.strictEqual(validateReturnUrl('/meetings?tab=schedule'), '/meetings?tab=schedule');
    assert.strictEqual(validateReturnUrl('/meetings?action=new_meeting'), '/meetings?action=new_meeting');
  });

  runSyncTest('1.7: Rejects unknown / unauthorized path prefixes (e.g. /admin, /api/secret)', () => {
    assert.strictEqual(validateReturnUrl('/admin/secrets'), '/meetings');
    assert.strictEqual(validateReturnUrl('/unauthorized'), '/meetings');
  });

  // --- REQUIREMENT 1, 2, 4, 5: Callback Flow & State Validation ---
  console.log('\n--- SUITE 2: OAuth Callback Flow, Safe Errors & Persistence Protection ---');

  await runAsyncTest('2.1: Denial (error=access_denied) returns to /meetings without exposing secrets', async () => {
    const req = {
      method: 'GET',
      url: '/api/auth/google/callback?error=access_denied&error_description=User+denied'
    };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/meetings?google_connect=denied&google_drive=access_denied&reason=access_denied');
    assert(!res.body.includes('access_token'));
    assert(!res.body.includes('client_secret'));
  });

  await runAsyncTest('2.2: Invalid state or missing parameters returns /meetings with invalid_state', async () => {
    const req = {
      method: 'GET',
      url: '/api/auth/google/callback?code=mock_code&state=nonexistent_state'
    };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/meetings?google_connect=invalid_state&google_drive=invalid_state');
  });

  await runAsyncTest('2.3: Successful callback returns to /meetings and preserves ?tab=schedule context', async () => {
    const startReq = {
      method: 'POST',
      url: '/api/auth/google/start',
      headers: { authorization: 'Bearer test_valid_jwt' },
      body: JSON.stringify({ redirectTarget: '/meetings?tab=schedule', connectionType: 'USER_PERSONAL' })
    };
    const startRes = createMockResponse();
    await authHandler(startReq, startRes);
    assert.strictEqual(startRes.statusCode, 200);

    const startData = JSON.parse(startRes.body);
    assert(startData.authUrl);
    const parsedAuthUrl = new URL(startData.authUrl);
    const issuedState = parsedAuthUrl.searchParams.get('state');

    // Perform callback with the issued state
    const cbReq = {
      method: 'GET',
      url: `/api/auth/google/callback?code=valid_test_code&state=${issuedState}`
    };
    const cbRes = createMockResponse();
    await callbackHandler(cbReq, cbRes);

    assert.strictEqual(cbRes.statusCode, 302);
    const destUrl = new URL(cbRes.headers.location, 'https://app.clasptek.org');
    assert.strictEqual(destUrl.pathname, '/meetings');
    assert.strictEqual(destUrl.searchParams.get('tab'), 'schedule');
    assert.strictEqual(destUrl.searchParams.get('google_connect'), 'connected');
    assert.strictEqual(destUrl.searchParams.get('calendar_scope'), 'granted');
  });

  await runAsyncTest('2.4: Persistence failure never produces a success state (returns reason=persistence_failed)', async () => {
    const startReq = {
      method: 'POST',
      url: '/api/auth/google/start',
      headers: { authorization: 'Bearer test_valid_jwt' },
      body: JSON.stringify({ redirectTarget: '/meetings', connectionType: 'USER_PERSONAL' })
    };
    const startRes = createMockResponse();
    await authHandler(startReq, startRes);
    const issuedState = new URL(JSON.parse(startRes.body).authUrl).searchParams.get('state');

    // Mock upsertGoogleDriveConnection failure
    oauthConfig.setTestPersistFailure(true);

    try {
      const cbReq = {
        method: 'GET',
        url: `/api/auth/google/callback?code=valid_test_code&state=${issuedState}`
      };
      const cbRes = createMockResponse();
      await callbackHandler(cbReq, cbRes);

      assert.strictEqual(cbRes.statusCode, 302);
      const destUrl = new URL(cbRes.headers.location, 'https://app.clasptek.org');
      assert.strictEqual(destUrl.pathname, '/meetings');
      assert.strictEqual(destUrl.searchParams.get('reason'), 'persistence_failed');
      assert.notStrictEqual(destUrl.searchParams.get('google_connect'), 'connected');
      assert.notStrictEqual(destUrl.searchParams.get('google_drive'), 'connected');
    } finally {
      oauthConfig.setTestPersistFailure(false);
    }
  });

  // --- REQUIREMENT 6, 7, 8, 9: Calendar Readiness & Status Endpoint ---
  console.log('\n--- SUITE 3: Calendar Readiness States & Verification Endpoint ---');

  process.env.CLASPTEK_TEST_MODE = 'true';
  const calendarStatusRoute = loadTs('app/api/meetings/calendar-status/route.ts');

  await runAsyncTest('3.1: Calendar status returns 401 when unauthenticated', async () => {
    authMockError = { status: 401, body: { success: false, error: 'Unauthorized' } };
    try {
      const res = await calendarStatusRoute.GET({});
      assert.strictEqual(res.status, 401);
    } finally {
      authMockError = null;
    }
  });

  await runAsyncTest('3.2: Reports NOT_CONNECTED when no Google connection exists in DB', async () => {
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => null;
      const res = await calendarStatusRoute.GET({});
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'NOT_CONNECTED');
      assert.strictEqual(body.calendarReady, false);
      assert.strictEqual(body.connected, false);
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  await runAsyncTest('3.3: Reports CALENDAR_DISABLED when GOOGLE_CALENDAR_INTEGRATION_ENABLED is false', async () => {
    const oldFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'false';
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'admin@clasptek.org',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      });
      const res = await calendarStatusRoute.GET({});
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'CALENDAR_DISABLED');
      assert.strictEqual(body.calendarReady, false);
      assert.strictEqual(body.featureFlagEnabled, false);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = oldFlag;
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  await runAsyncTest('3.4: Reports PERMISSION_REQUIRED when Calendar scope was not granted', async () => {
    const oldFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'admin@clasptek.org',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      });
      const res = await calendarStatusRoute.GET({});
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'PERMISSION_REQUIRED');
      assert.strictEqual(body.calendarReady, false);
      assert.strictEqual(body.hasCalendarScope, false);
      assert.strictEqual(body.missingScope, 'https://www.googleapis.com/auth/calendar.events');
      assert.strictEqual(body.reconnectRequired, true);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = oldFlag;
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  await runAsyncTest('3.5: Reports RECONNECT_REQUIRED when credentials are invalid or refresh fails', async () => {
    const oldFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'admin@clasptek.org',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      });
      const dummyReq = {
        url: 'https://app.clasptek.org/api/meetings/calendar-status?_testMockFailToken=1',
        nextUrl: new URL('https://app.clasptek.org/api/meetings/calendar-status?_testMockFailToken=1')
      };
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'RECONNECT_REQUIRED');
      assert.strictEqual(body.calendarReady, false);
      assert.strictEqual(body.reconnectRequired, true);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = oldFlag;
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  await runAsyncTest('3.6: Reports VERIFICATION_FAILED when Calendar API read check fails', async () => {
    const oldFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'admin@clasptek.org',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      });
      const dummyReq = {
        url: 'https://app.clasptek.org/api/meetings/calendar-status?_testMockFailCalendar=1',
        nextUrl: new URL('https://app.clasptek.org/api/meetings/calendar-status?_testMockFailCalendar=1')
      };
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'VERIFICATION_FAILED');
      assert.strictEqual(body.calendarReady, false);
      assert.strictEqual(body.reconnectRequired, true);
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = oldFlag;
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  await runAsyncTest('3.7: Reports CONNECTED + calendarReady: true on successful read-only check', async () => {
    const oldFlag = process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED;
    const origGet = oauthConfig.getTenantCentralDriveConnection;
    try {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = 'true';
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'admin@clasptek.org',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      });
      const dummyReq = {
        url: 'https://app.clasptek.org/api/meetings/calendar-status',
        nextUrl: new URL('https://app.clasptek.org/api/meetings/calendar-status')
      };
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'CONNECTED');
      assert.strictEqual(body.calendarReady, true);
      assert.strictEqual(body.connected, true);
      assert.strictEqual(body.hasCalendarScope, true);
      assert.strictEqual(body.userEmail, 'admin@clasptek.org');
    } finally {
      process.env.GOOGLE_CALENDAR_INTEGRATION_ENABLED = oldFlag;
      oauthConfig.getTenantCentralDriveConnection = origGet;
    }
  });

  // --- REQUIREMENT 10, 11: Meetings Page Behavior & LiveKit Independence ---
  console.log('\n--- SUITE 4: Meetings Page UI Behavior & LiveKit Independence ---');

  const meetingsClientPath = path.join(repoRoot, 'app/meetings/MeetingsPageClient.tsx');
  const meetingsContent = fs.readFileSync(meetingsClientPath, 'utf8');

  runSyncTest('4.1: MeetingsPageClient cleans up transient query params via window.history.replaceState', () => {
    assert(meetingsContent.includes('window.history.replaceState({}, \'\', cleanUrl)'),
      'MeetingsPageClient must call window.history.replaceState to strip transient parameters');
    assert(meetingsContent.includes("cleanParams.delete('google_connect')"),
      'Must strip google_connect param');
    assert(meetingsContent.includes("cleanParams.delete('calendar_scope')"),
      'Must strip calendar_scope param');
    assert(meetingsContent.includes("cleanParams.delete('google_drive')"),
      'Must strip google_drive param');
  });

  runSyncTest('4.2: LiveKit meetings operate completely independently of Calendar connection', () => {
    // Assert that calendar connection guard is strictly scoped to provider === 'google_meet'
    assert(meetingsContent.includes("meetingForm.provider === 'google_meet' && !cleanCustomUrl"),
      'Calendar check must only apply when provider is google_meet without custom URL');
    assert(!meetingsContent.includes("meetingForm.provider === 'livekit' && !calendarStatus.calendarReady"),
      'LiveKit must never be blocked by calendar status');
  });

  runSyncTest('4.3: UI renders actionable reconnect and retry buttons for all recoverable states', () => {
    assert(meetingsContent.includes('Grant Calendar Permission'), 'UI should include Grant Calendar Permission action');
    assert(meetingsContent.includes('Reconnect Google Calendar'), 'UI should include Reconnect Google Calendar action');
    assert(meetingsContent.includes('Retry Check'), 'UI should include Retry Check action');
  });

  // --- REQUIREMENT C240F: OAuth State Schema Invariance, Serverless Persistence & Fail-Closed Protection ---
  console.log('\n--- SUITE 5: OAuth State Schema Invariance, Serverless Persistence & Fail-Closed Protection ---');

  const prevSupabaseUrl = process.env.SUPABASE_URL;
  const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_secret_key_123';

  try {
    await runAsyncTest('5.1: The OAuth state insertion payload contains only schema-supported columns from migrations/20260917_google_drive_oauth.sql', async () => {
      const migrationPath = path.join(repoRoot, 'migrations/20260917_google_drive_oauth.sql');
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      const canonicalColumns = ['state', 'tenant_id', 'user_id', 'provider', 'redirect_target', 'created_at', 'expires_at', 'used_at'];

      assert(!migrationSql.includes('connection_type TEXT'), 'canonical migration must not have connection_type column on oauth_states');

      let interceptedPayload = null;
      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (url.includes('/rest/v1/oauth_states') && options.method === 'POST') {
          interceptedPayload = payload;
          return { status: 201, headers: {}, body: [payload] };
        }
        return { status: 200, headers: {}, body: [] };
      });

      try {
        const { state } = await oauthConfig.createOAuthState({
          tenantId: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
          userId: 'usr-test-123',
          redirectTarget: '/meetings?tab=schedule',
          connectionType: 'TENANT_CENTRAL'
        });

        assert(interceptedPayload, 'POST to /rest/v1/oauth_states must have been dispatched');
        assert.strictEqual(interceptedPayload.state, state);
        assert.strictEqual(interceptedPayload.tenant_id, 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6');
        assert.strictEqual(interceptedPayload.user_id, 'usr-test-123');
        assert.strictEqual(interceptedPayload.provider, 'google');
        assert.strictEqual(interceptedPayload.used_at, null);
        assert(interceptedPayload.redirect_target.includes('__clasptek_ct=TENANT_CENTRAL'));

        // CRITICAL INVARIANT: Every key in interceptedPayload must be in canonicalColumns
        for (const key of Object.keys(interceptedPayload)) {
          assert(canonicalColumns.includes(key), `Key '${key}' in OAuth state payload is NOT in canonical oauth_states schema!`);
        }
        assert(!('connection_type' in interceptedPayload), 'connection_type must strictly NOT be sent in dbPayload');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('5.2: Simulated PostgREST 400, 404, and 500 responses cause controlled initiation failure with OAUTH_STATE_PERSISTENCE_FAILED', async () => {
      for (const statusCode of [400, 404, 500]) {
        oauthConfig.setTestHttpsInterceptor((url) => {
          if (url.includes('/rest/v1/oauth_states')) {
            return {
              status: statusCode,
              headers: {},
              body: { message: `Simulated PostgREST error ${statusCode}`, code: `PGRST_${statusCode}` }
            };
          }
          return { status: 200, headers: {}, body: [] };
        });

        try {
          const req = {
            method: 'POST',
            url: '/api/auth/google/start?action=start',
            headers: { authorization: 'Bearer test_valid_jwt' },
            body: JSON.stringify({
              connectionType: 'TENANT_CENTRAL',
              redirectTarget: '/meetings?tab=schedule',
              includeCalendar: true
            })
          };
          const res = createMockResponse();
          await authHandler(req, res);

          assert.strictEqual(res.statusCode, 500, `PostgREST ${statusCode} must result in HTTP 500 initiation failure`);
          const parsed = JSON.parse(res.body);
          assert.strictEqual(parsed.success, false);
          assert.strictEqual(parsed.error, 'OAUTH_STATE_PERSISTENCE_FAILED');
          assert.strictEqual(parsed.message, 'Unable to initialize secure authorization session. Please try again later.');
          assert(!parsed.authUrl, 'Must not return authUrl when persistence fails');
        } finally {
          oauthConfig.setTestHttpsInterceptor(null);
        }
      }
    });

    await runAsyncTest('5.3: Network-level persistence failure (rejection/timeout) also fails closed', async () => {
      oauthConfig.setTestHttpsInterceptor((url) => {
        if (url.includes('/rest/v1/oauth_states')) {
          return Promise.reject(new Error('ETIMEDOUT: Connection to database timed out'));
        }
        return { status: 200, headers: {}, body: [] };
      });

      try {
        const req = {
          method: 'POST',
          url: '/api/auth/google/start?action=start',
          headers: { authorization: 'Bearer test_valid_jwt' },
          body: JSON.stringify({ connectionType: 'TENANT_CENTRAL' })
        };
        const res = createMockResponse();
        await authHandler(req, res);

        assert.strictEqual(res.statusCode, 500);
        const parsed = JSON.parse(res.body);
        assert.strictEqual(parsed.success, false);
        assert.strictEqual(parsed.error, 'OAUTH_STATE_PERSISTENCE_FAILED');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('5.4: State creation and callback validation work across simulated independent serverless instances via mocked persistent store', async () => {
      const mockDb = new Map();

      oauthConfig.setTestHttpsInterceptor(async (url, options, payload) => {
        const u = new URL(url);
        if (u.pathname.includes('/rest/v1/oauth_states')) {
          if (options.method === 'POST') {
            mockDb.set(payload.state, { ...payload });
            return { status: 201, headers: {}, body: [payload] };
          }
          if (options.method === 'PATCH') {
            const matchState = u.searchParams.get('state')?.replace('eq.', '');
            const row = mockDb.get(matchState);
            if (row && !row.used_at && new Date(row.expires_at) > new Date()) {
              row.used_at = payload.used_at;
              mockDb.set(matchState, row);
              return { status: 200, headers: {}, body: [row] };
            }
            return { status: 200, headers: {}, body: [] };
          }
          if (options.method === 'GET') {
            const matchState = u.searchParams.get('state')?.replace('eq.', '');
            const row = mockDb.get(matchState);
            return { status: 200, headers: {}, body: row ? [row] : [] };
          }
        }
        if (u.pathname.includes('/rest/v1/google_drive_connections')) {
          return { status: 200, headers: {}, body: [{ id: 'mock_conn_1' }] };
        }
        return { status: 200, headers: {}, body: [] };
      });

      try {
        // 1. Instance A: Create OAuth State (e.g. Schedule tab Calendar connection)
        const { state } = await oauthConfig.createOAuthState({
          tenantId: 'tenant-test-123',
          userId: 'usr-123',
          redirectTarget: '/meetings?tab=schedule',
          connectionType: 'TENANT_CENTRAL'
        });

        // 2. Simulate Serverless Instance Isolation: Wipe in-memory state store completely!
        oauthConfig._memoryStateStore.clear();
        assert.strictEqual(oauthConfig._memoryStateStore.size, 0, 'Memory store must be completely empty in Instance B');

        // 3. Instance B: Receive Google OAuth callback with valid code and state
        const cbReq = { method: 'GET', url: `/api/auth/google/callback?code=4/valid_exchange_code&state=${state}` };
        const cbRes = createMockResponse();
        await callbackHandler(cbReq, cbRes);

        assert.strictEqual(cbRes.statusCode, 302, 'Instance B must succeed and redirect');
        const loc = cbRes.headers.location;
        assert(loc.startsWith('/meetings?'), 'Must redirect to /meetings');
        assert(loc.includes('tab=schedule'), 'Must preserve tab=schedule navigation context');
        assert(loc.includes('google_connect=connected'), 'Must report connected status');
        assert(loc.includes('type=central'), 'Must recover TENANT_CENTRAL connection type without DB column');
        assert(!loc.includes('__clasptek_ct'), '__clasptek_ct internal parameter must be cleanly purged from URL');

        // 4. Instance C: Immediate replay of the exact same callback in another instance with empty memory
        oauthConfig._memoryStateStore.clear();
        const replayReq = { method: 'GET', url: `/api/auth/google/callback?code=4/valid_exchange_code&state=${state}` };
        const replayRes = createMockResponse();
        await callbackHandler(replayReq, replayRes);

        assert.strictEqual(replayRes.statusCode, 302);
        assert(replayRes.headers.location.includes('google_connect=invalid_state'), 'Replayed state must fail with invalid_state');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
        oauthConfig._memoryStateStore.clear();
      }
    });

    await runAsyncTest('5.5: Missing, expired, and invalid state tokens remain rejected', async () => {
      // Missing state
      const reqNoState = { method: 'GET', url: '/api/auth/google/callback?code=4/valid_code' };
      const resNoState = createMockResponse();
      await callbackHandler(reqNoState, resNoState);
      assert(resNoState.headers.location.includes('google_connect=invalid_state'));

      // Tampered / nonexistent state
      const reqBad = { method: 'GET', url: '/api/auth/google/callback?code=4/valid_code&state=non_existent_token_123' };
      const resBad = createMockResponse();
      await callbackHandler(reqBad, resBad);
      assert(resBad.headers.location.includes('google_connect=invalid_state'));
    });

    await runAsyncTest('5.6: Concurrent callback attempts cannot consume the same state twice', async () => {
      const mockDb = new Map();
      const testState = 'concurrent_test_state_nonce_xyz';
      mockDb.set(testState, {
        state: testState,
        tenant_id: 'tenant-test-123',
        user_id: 'usr-123',
        redirect_target: oauthConfig.encodeRedirectTarget('/meetings', 'TENANT_CENTRAL'),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        used_at: null
      });

      oauthConfig.setTestHttpsInterceptor(async (url, options, payload) => {
        const u = new URL(url);
        if (u.pathname.includes('/rest/v1/oauth_states')) {
          if (options.method === 'PATCH') {
            const matchState = u.searchParams.get('state')?.replace('eq.', '');
            const row = mockDb.get(matchState);
            // Atomic update simulation: only succeeds if used_at is currently null
            if (row && !row.used_at) {
              row.used_at = payload.used_at;
              mockDb.set(matchState, row);
              return { status: 200, headers: {}, body: [row] };
            }
            return { status: 200, headers: {}, body: [] };
          }
          if (options.method === 'GET') {
            const matchState = u.searchParams.get('state')?.replace('eq.', '');
            const row = mockDb.get(matchState);
            return { status: 200, headers: {}, body: row ? [row] : [] };
          }
        }
        return { status: 200, headers: {}, body: [] };
      });

      try {
        oauthConfig._memoryStateStore.clear();
        // Execute two concurrent validations
        const [res1, res2] = await Promise.all([
          oauthConfig.validateAndConsumeOAuthState(testState),
          oauthConfig.validateAndConsumeOAuthState(testState)
        ]);

        const validCount = (res1.valid ? 1 : 0) + (res2.valid ? 1 : 0);
        assert.strictEqual(validCount, 1, 'Exactly one concurrent consumption attempt must succeed');
        const failedRes = res1.valid ? res2 : res1;
        assert.strictEqual(failedRes.valid, false);
        assert.strictEqual(failedRes.reason, 'STATE_ALREADY_USED');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
        oauthConfig._memoryStateStore.clear();
      }
    });

    await runSyncTest('5.7: Connection type and return target survive round-trip without confusion or open redirects', () => {
      // 1. Central connection with tab
      const enc1 = oauthConfig.encodeRedirectTarget('/meetings?tab=schedule', 'TENANT_CENTRAL');
      const dec1 = oauthConfig.decodeRedirectTarget(enc1);
      assert.strictEqual(dec1.connectionType, 'TENANT_CENTRAL');
      assert.strictEqual(dec1.redirectTarget, '/meetings?tab=schedule');
      assert(!dec1.redirectTarget.includes('__clasptek_ct'));

      // 2. Personal connection with query params
      const enc2 = oauthConfig.encodeRedirectTarget('/meetings?view=history', 'USER_PERSONAL');
      const dec2 = oauthConfig.decodeRedirectTarget(enc2);
      assert.strictEqual(dec2.connectionType, 'USER_PERSONAL');
      assert.strictEqual(dec2.redirectTarget, '/meetings?view=history');

      // 3. Open redirect attack payload normalized to /meetings
      const encMalicious = oauthConfig.encodeRedirectTarget('https://evil.com/phish', 'TENANT_CENTRAL');
      const decMalicious = oauthConfig.decodeRedirectTarget(encMalicious);
      assert.strictEqual(decMalicious.connectionType, 'TENANT_CENTRAL');
      assert.strictEqual(decMalicious.redirectTarget, '/meetings', 'Malicious open-redirect target must be normalized to /meetings');

      // 4. Tampered connection type normalizes to USER_PERSONAL
      const decTampered = oauthConfig.decodeRedirectTarget('/meetings?__clasptek_ct=ADMIN_HACK');
      assert.strictEqual(decTampered.connectionType, 'USER_PERSONAL');
      assert.strictEqual(decTampered.redirectTarget, '/meetings');
    });

    await runAsyncTest('5.8: Both Drive and Calendar initiation use the corrected shared state lifecycle', async () => {
      let capturedDrivePayload = null;
      let capturedCalPayload = null;

      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (url.includes('/rest/v1/oauth_states') && options.method === 'POST') {
          if (payload.redirect_target.includes('tab=schedule')) {
            capturedCalPayload = payload;
          } else {
            capturedDrivePayload = payload;
          }
          return { status: 201, headers: {}, body: [payload] };
        }
        return { status: 200, headers: {}, body: [] };
      });

      try {
        // 1. Initiate Drive connection
        const driveReq = {
          method: 'POST',
          url: '/api/auth/google/start?action=start',
          headers: { authorization: 'Bearer test_valid_jwt' },
          body: JSON.stringify({ connectionType: 'TENANT_CENTRAL', redirectTarget: '/meetings' })
        };
        const driveRes = createMockResponse();
        await authHandler(driveReq, driveRes);
        assert.strictEqual(driveRes.statusCode, 200);
        assert(capturedDrivePayload);
        assert(!('connection_type' in capturedDrivePayload));

        // 2. Initiate Calendar connection
        const calReq = {
          method: 'POST',
          url: '/api/auth/google/start?action=start',
          headers: { authorization: 'Bearer test_valid_jwt' },
          body: JSON.stringify({ connectionType: 'TENANT_CENTRAL', redirectTarget: '/meetings?tab=schedule', includeCalendar: true })
        };
        const calRes = createMockResponse();
        await authHandler(calReq, calRes);
        assert.strictEqual(calRes.statusCode, 200);
        assert(capturedCalPayload);
        assert(!('connection_type' in capturedCalPayload));
        assert(capturedCalPayload.redirect_target.includes('tab=schedule'));

        const calAuthUrl = new URL(JSON.parse(calRes.body).authUrl);
        assert(calAuthUrl.searchParams.get('scope').includes('calendar.events'), 'Calendar authUrl must contain calendar.events scope');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    // --- SUITE 6: Central and Personal Connection Persistence & Conflict-Target Handling ---
    console.log('\n--- SUITE 6: Central & Personal Connection Persistence & Conflict Handling ---');

    await runAsyncTest('6.1: Central connection insert when none exists (GET 200 empty -> POST 201)', async () => {
      let getCalled = false;
      let postCalled = false;
      let capturedPayload = null;

      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (options.method === 'GET' && url.includes('google_drive_connections?tenant_id=eq.tenant-c61&connection_type=eq.TENANT_CENTRAL')) {
          getCalled = true;
          return Promise.resolve({ status: 200, body: [] });
        }
        if (options.method === 'POST' && url.endsWith('/rest/v1/google_drive_connections')) {
          postCalled = true;
          capturedPayload = payload;
          assert(!url.includes('on_conflict'), 'Central POST insert must not use on_conflict parameter');
          return Promise.resolve({ status: 201, body: [{ id: 'conn-c61' }] });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      try {
        const res = await oauthConfig.upsertGoogleDriveConnection({
          tenantId: 'tenant-c61',
          userId: 'user-c61',
          connectionType: 'TENANT_CENTRAL',
          googleUserId: 'g-user-c61',
          googleEmail: 'central@tenant-c61.org',
          accessToken: 'mock_at_c61',
          refreshToken: 'mock_rt_c61',
          rootFolderId: 'root_c61',
          rootFolderName: 'Clasptek Meeting Recordings'
        });

        assert.strictEqual(res.success, true);
        assert(getCalled, 'Must query for existing central connection');
        assert(postCalled, 'Must execute POST insert when no existing row found');
        assert.strictEqual(capturedPayload.connection_type, 'TENANT_CENTRAL');
        assert.strictEqual(capturedPayload.tenant_id, 'tenant-c61');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.2: Central connection update when one exists (GET 200 with record -> PATCH 200)', async () => {
      let getCalled = false;
      let patchCalled = false;
      let capturedPatchPayload = null;

      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (options.method === 'GET' && url.includes('google_drive_connections?tenant_id=eq.tenant-c62&connection_type=eq.TENANT_CENTRAL')) {
          getCalled = true;
          return Promise.resolve({
            status: 200,
            body: [{
              id: 'conn-c62-existing',
              refresh_token: 'existing_rt_c62',
              root_folder_id: 'existing_folder_c62',
              root_folder_name: 'Existing Folder Name'
            }]
          });
        }
        if (options.method === 'PATCH' && url.includes('google_drive_connections?tenant_id=eq.tenant-c62&connection_type=eq.TENANT_CENTRAL')) {
          patchCalled = true;
          capturedPatchPayload = payload;
          return Promise.resolve({ status: 200, body: [{ id: 'conn-c62-existing' }] });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      try {
        // Authorize with null refresh token -> should preserve existing_rt_c62
        const res = await oauthConfig.upsertGoogleDriveConnection({
          tenantId: 'tenant-c62',
          userId: 'user-c62',
          connectionType: 'TENANT_CENTRAL',
          googleUserId: 'g-user-c62',
          googleEmail: 'central@tenant-c62.org',
          accessToken: 'new_access_token_c62',
          refreshToken: null
        });

        assert.strictEqual(res.success, true);
        assert(getCalled, 'Must query for existing central connection');
        assert(patchCalled, 'Must execute scoped PATCH update when existing row found');
        assert.strictEqual(capturedPatchPayload.refresh_token, 'existing_rt_c62', 'Must preserve existing refresh token');
        assert.strictEqual(capturedPatchPayload.root_folder_id, 'existing_folder_c62', 'Must preserve existing root folder ID');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.3: Concurrent central inserts and unique-conflict handling (GET empty -> POST 409 -> re-read GET -> PATCH 200)', async () => {
      let getCallCount = 0;
      let postAttempted = false;
      let patchAttempted = false;

      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (options.method === 'GET' && url.includes('tenant_id=eq.tenant-c63')) {
          getCallCount++;
          if (getCallCount === 1) {
            // First call before insert: no record exists
            return Promise.resolve({ status: 200, body: [] });
          }
          // Second call after 409 conflict: concurrent request successfully inserted record
          return Promise.resolve({
            status: 200,
            body: [{
              id: 'conn-c63-concurrent',
              refresh_token: 'concurrent_rt_c63',
              root_folder_id: 'concurrent_folder_c63',
              root_folder_name: 'Concurrent Folder'
            }]
          });
        }
        if (options.method === 'POST' && url.endsWith('/rest/v1/google_drive_connections')) {
          postAttempted = true;
          // Simulate concurrent winner race triggering unique constraint uq_tenant_central_gdrive
          return Promise.resolve({
            status: 409,
            body: { message: 'duplicate key value violates unique constraint "uq_tenant_central_gdrive"' }
          });
        }
        if (options.method === 'PATCH' && url.includes('tenant_id=eq.tenant-c63&connection_type=eq.TENANT_CENTRAL')) {
          patchAttempted = true;
          return Promise.resolve({ status: 200, body: [{ id: 'conn-c63-concurrent' }] });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      try {
        const res = await oauthConfig.upsertGoogleDriveConnection({
          tenantId: 'tenant-c63',
          userId: 'user-c63',
          connectionType: 'TENANT_CENTRAL',
          googleUserId: 'g-user-c63',
          googleEmail: 'central@tenant-c63.org',
          accessToken: 'at_c63',
          refreshToken: 'rt_c63'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(getCallCount, 2, 'Must query before insert, then re-read after 409 conflict');
        assert(postAttempted, 'Must attempt POST insert first');
        assert(patchAttempted, 'Must re-read and safely fall back to scoped PATCH');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.4: Non-2xx GET, POST, and PATCH responses surface controlled errors', async () => {
      // 1. GET non-2xx failure
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 500, body: { error: 'Database timeout' } });
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c64',
            userId: 'user-c64',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c64.org',
            accessToken: 'at_c64'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }

      // 2. POST non-2xx (and not 409) failure
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 200, body: [] });
        if (options.method === 'POST') return Promise.resolve({ status: 503, body: { error: 'Service Unavailable' } });
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c64',
            userId: 'user-c64',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c64.org',
            accessToken: 'at_c64'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }

      // 3. PATCH non-2xx failure
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 200, body: [{ id: 'conn-c64' }] });
        if (options.method === 'PATCH') return Promise.resolve({ status: 500, body: { error: 'Disk full' } });
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c64',
            userId: 'user-c64',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c64.org',
            accessToken: 'at_c64'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }

      // 4. PATCH 200 with 0 returned rows (e.g. concurrent disconnect/revocation race)
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 200, body: [{ id: 'conn-c64' }] });
        // PostgREST returns 200 with [] when no rows matched the PATCH filter
        if (options.method === 'PATCH') return Promise.resolve({ status: 200, body: [] });
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c64',
            userId: 'user-c64',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c64.org',
            accessToken: 'at_c64'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }

      // 5. POST 409 conflict but re-read GET returns empty (unrelated conflict or row deleted)
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 200, body: [] }); // Always empty
        if (options.method === 'POST') return Promise.resolve({ status: 409, body: { message: 'conflict' } });
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c64',
            userId: 'user-c64',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c64.org',
            accessToken: 'at_c64'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.5: Network failures in GET, POST, and PATCH surface controlled errors', async () => {
      // 1. GET network rejection
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.reject(new Error('ETIMEDOUT: Connection timed out'));
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c65',
            userId: 'user-c65',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c65.org',
            accessToken: 'at_c65'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }

      // 2. POST network rejection
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'GET') return Promise.resolve({ status: 200, body: [] });
        if (options.method === 'POST') return Promise.reject(new Error('ECONNRESET: Connection reset'));
        return Promise.resolve({ status: 200, body: [] });
      });
      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c65',
            userId: 'user-c65',
            connectionType: 'TENANT_CENTRAL',
            googleEmail: 'central@tenant-c65.org',
            accessToken: 'at_c65'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.6: Personal connection upsert remains on valid conflict target (on_conflict=tenant_id,user_id)', async () => {
      let personalPostCalled = false;
      let capturedPersonalUrl = null;
      let capturedPersonalPayload = null;

      oauthConfig.setTestHttpsInterceptor((url, options, payload) => {
        if (options.method === 'POST' && url.includes('google_drive_connections?on_conflict=tenant_id,user_id')) {
          personalPostCalled = true;
          capturedPersonalUrl = url;
          capturedPersonalPayload = payload;
          return Promise.resolve({ status: 200, body: [{ id: 'conn-personal-c66' }] });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      try {
        const res = await oauthConfig.upsertGoogleDriveConnection({
          tenantId: 'tenant-c66',
          userId: 'user-c66',
          connectionType: 'USER_PERSONAL',
          googleUserId: 'g-user-c66',
          googleEmail: 'user@tenant-c66.org',
          accessToken: 'at_personal_c66',
          refreshToken: 'rt_personal_c66'
        });

        assert.strictEqual(res.success, true);
        assert(personalPostCalled, 'Personal connection must use on_conflict=tenant_id,user_id');
        assert(capturedPersonalUrl.includes('on_conflict=tenant_id,user_id'));
        assert.strictEqual(capturedPersonalPayload.connection_type, 'USER_PERSONAL');
        assert.strictEqual(capturedPersonalPayload.user_id, 'user-c66');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.7: No false success or durable-state claims when persistence fails', async () => {
      // Simulate failure on personal connection
      oauthConfig.setTestHttpsInterceptor((url, options) => {
        if (options.method === 'POST') return Promise.resolve({ status: 500, body: { error: 'Database unavailable' } });
        return Promise.resolve({ status: 200, body: [] });
      });

      try {
        await assert.rejects(
          () => oauthConfig.upsertGoogleDriveConnection({
            tenantId: 'tenant-c67-fail',
            userId: 'user-c67-fail',
            connectionType: 'USER_PERSONAL',
            googleEmail: 'fail@tenant-c67.org',
            accessToken: 'at_fail'
          }),
          /GOOGLE_CONNECTION_PERSISTENCE_FAILED/
        );

        // Verify that memoryConnectionStore does NOT contain the failed connection
        const cached = oauthConfig._memoryConnectionStore.get('user:tenant-c67-fail:user-c67-fail');
        assert(!cached, 'memoryConnectionStore must NOT claim connection is active when DB persistence fails');
        const status = await oauthConfig.getGoogleDriveConnectionStatus('tenant-c67-fail', 'user-c67-fail', 'USER_PERSONAL');
        assert.strictEqual(status.connected, false, 'Status must report connected: false when DB persistence fails');
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });

    await runAsyncTest('6.8: Tenant isolation: central connection queries and updates are strictly partitioned by tenant_id', async () => {
      const interceptedUrls = [];

      oauthConfig.setTestHttpsInterceptor((url, options) => {
        interceptedUrls.push(url);
        if (options.method === 'GET') {
          assert(url.includes('tenant_id=eq.tenant-A'), 'Query must strictly filter by target tenant_id');
          return Promise.resolve({ status: 200, body: [{ id: 'conn-tenant-A' }] });
        }
        if (options.method === 'PATCH') {
          assert(url.includes('tenant_id=eq.tenant-A'), 'Patch must strictly filter by target tenant_id');
          assert(!url.includes('tenant-B'), 'Patch must never target a foreign tenant');
          return Promise.resolve({ status: 200, body: [{ id: 'conn-tenant-A' }] });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      try {
        const res = await oauthConfig.upsertGoogleDriveConnection({
          tenantId: 'tenant-A',
          userId: 'user-A',
          connectionType: 'TENANT_CENTRAL',
          googleEmail: 'central@tenant-A.org',
          accessToken: 'at_A'
        });

        assert.strictEqual(res.success, true);
        assert(interceptedUrls.length >= 2);
      } finally {
        oauthConfig.setTestHttpsInterceptor(null);
      }
    });
  } finally {
    if (prevSupabaseUrl) process.env.SUPABASE_URL = prevSupabaseUrl; else delete process.env.SUPABASE_URL;
    if (prevServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  console.log('\n================================================================================');
  console.log(` RESULTS: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL: ${totalTests} TESTS)`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllC240ATests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
