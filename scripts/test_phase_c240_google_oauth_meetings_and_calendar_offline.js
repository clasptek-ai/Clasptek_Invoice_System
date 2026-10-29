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
