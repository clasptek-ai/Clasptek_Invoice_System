/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE OAUTH AUTOMATED CERTIFICATION SUITE
 * File: scripts/test_google_drive_oauth.js
 * 
 * Comprehensive Test Coverage:
 * 1. File & Route Verification (callback.js, start.js, status.js, disconnect.js)
 * 2. Vercel Configuration & Routing Verification (vercel.json API exclusion)
 * 3. Canonical Redirect URI Resolution (Production vs. Localhost Parity)
 * 4. OAuth Start Endpoint & Authorization URL Generation
 * 5. State Generation & Cryptographic Entropy
 * 6. State Replay Protection & Atomic Consumption (Anti-Replay Invariant)
 * 7. State Expiration Enforcement
 * 8. User Denial (error=access_denied) Handling
 * 9. Missing Code / Missing State Rejection
 * 10. Successful Authorization Code Exchange & Token Persistence
 * 11. Security Audit: Zero Token / Secret Leakage to Client
 * 12. Google Drive Disconnection & Status Endpoint Lifecycle
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

// Set test environment flags
process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// Mock HTTP response collector
function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, hdrs = {}) {
      this.statusCode = code;
      Object.entries(hdrs).forEach(([k, v]) => this.headers[k.toLowerCase()] = v);
    },
    end(data = '') { this.body = data; }
  };
}

async function runAllOAuthTests() {
  console.log('================================================================================');
  console.log(' CLASPTEK GOOGLE DRIVE OAUTH 2.0 CERTIFICATION SUITE');
  console.log('================================================================================\n');

  // --- SECTION 1: Architectural File & Route Existence ---
  console.log('--- SECTION 1: File & Vercel Routing Verification ---');

  runTest('1.1: api/auth/google/callback.js exists', () => {
    const p = path.join(process.cwd(), 'api', 'auth', 'google', 'callback.js');
    assert(fs.existsSync(p), 'api/auth/google/callback.js must exist on disk');
  });

  runTest('1.2: Consolidated api/auth/google/auth.js exists', () => {
    const p = path.join(process.cwd(), 'api', 'auth', 'google', 'auth.js');
    assert(fs.existsSync(p), 'api/auth/google/auth.js must exist on disk');
  });

  runTest('1.3: api/_lib/google-oauth-config.js exists', () => {
    const p = path.join(process.cwd(), 'api', '_lib', 'google-oauth-config.js');
    assert(fs.existsSync(p), 'api/_lib/google-oauth-config.js must exist on disk');
  });

  runTest('1.4: vercel.json routes start, status, disconnect to auth.js', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    assert(vercel.rewrites.find(r => r.source === '/api/auth/google/start'), 'start rewrite missing');
    assert(vercel.rewrites.find(r => r.source === '/api/auth/google/status'), 'status rewrite missing');
    assert(vercel.rewrites.find(r => r.source === '/api/auth/google/disconnect'), 'disconnect rewrite missing');
  });

  runTest('1.5: migrations/20260917_google_drive_oauth.sql exists', () => {
    const p = path.join(process.cwd(), 'migrations', '20260917_google_drive_oauth.sql');
    assert(fs.existsSync(p), 'migrations/20260917_google_drive_oauth.sql must exist on disk');
  });

  runTest('1.6: vercel.json rewrites allow /api/auth/google/callback without SPA override', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const rewrite = vercel.rewrites.find(r => r.source.includes('?!api/'));
    assert(rewrite, 'vercel.json must have negative lookahead excluding /api/');
    // Regex test matching
    const apiRegex = new RegExp('^/((?!api/|runtime-config\\.js).*)$');
    assert(!apiRegex.test('/api/auth/google/callback'), 'Callback route /api/auth/google/callback must NOT be rewritten to index.html');
  });

  // --- SECTION 2: Redirect URI & Scope Resolution ---
  console.log('\n--- SECTION 2: Canonical Redirect URI & Scope Consistency ---');

  const {
    resolveGoogleOAuthConfig,
    createOAuthState,
    validateAndConsumeOAuthState,
    upsertGoogleDriveConnection,
    getGoogleDriveConnectionStatus,
    disconnectGoogleDriveConnection,
    _memoryStateStore,
    _memoryConnectionStore
  } = require('../api/_lib/google-oauth-config');

  const callbackHandler = require('../api/auth/google/callback');
  const authHandler = require('../api/auth/google/auth');
  const startHandler = (req, res) => {
    req.url = (req.url || '/api/auth/google/start') + (req.url && req.url.includes('?') ? '&' : '?') + 'action=start';
    return authHandler(req, res);
  };
  const statusHandler = (req, res) => {
    req.url = (req.url || '/api/auth/google/status') + (req.url && req.url.includes('?') ? '&' : '?') + 'action=status';
    return authHandler(req, res);
  };
  const disconnectHandler = (req, res) => {
    req.url = (req.url || '/api/auth/google/disconnect') + (req.url && req.url.includes('?') ? '&' : '?') + 'action=disconnect';
    return authHandler(req, res);
  };

  runTest('2.1: Production fallback redirect URI is exactly https://portal.clasptek.org/api/auth/google/callback', () => {
    delete process.env.GOOGLE_REDIRECT_URI;
    const config = resolveGoogleOAuthConfig();
    assert.strictEqual(
      config.redirectUri,
      'https://portal.clasptek.org/api/auth/google/callback',
      'Production redirect URI must be exact without trailing slashes or param suffixes'
    );
  });

  runTest('2.2: Local development on localhost resolves http://localhost:3000/api/auth/google/callback', () => {
    delete process.env.GOOGLE_REDIRECT_URI;
    const req = { headers: { host: 'localhost:3000' } };
    const config = resolveGoogleOAuthConfig(req);
    assert.strictEqual(
      config.redirectUri,
      'http://localhost:3000/api/auth/google/callback',
      'Local dev on localhost:3000 must resolve correctly'
    );
  });

  runTest('2.3: Least-privileged Drive scope requested (drive.file + userinfo.email)', () => {
    const config = resolveGoogleOAuthConfig();
    assert(config.scopes.includes('https://www.googleapis.com/auth/drive.file'), 'Must request drive.file');
    assert(config.scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'Must request userinfo.email');
    assert(!config.scopes.includes('https://www.googleapis.com/auth/drive '), 'Must NOT request full unrestricted drive access');
  });

  // --- SECTION 3: Start Endpoint & State Generation ---
  console.log('\n--- SECTION 3: Start Endpoint & State Generation ---');

  let generatedState = null;

  await runAsyncTest('3.1: Start endpoint returns 401 if unauthenticated', async () => {
    const req = { method: 'POST', headers: {} };
    const res = createMockResponse();
    // Temporarily turn off test mode to test auth gate
    const prevTestMode = process.env.CLASPTEK_TEST_MODE;
    delete process.env.CLASPTEK_TEST_MODE;
    process.env.NODE_ENV = 'production';

    await startHandler(req, res);

    process.env.NODE_ENV = 'test';
    process.env.CLASPTEK_TEST_MODE = prevTestMode;

    assert.strictEqual(res.statusCode, 401, 'Unauthenticated request must be rejected with 401');
    const json = JSON.parse(res.body);
    assert.strictEqual(json.error, 'UNAUTHORIZED');
  });

  await runAsyncTest('3.2: Start endpoint generates 32-byte state and Google OAuth URL', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer test_valid_jwt' },
      body: JSON.stringify({ redirectTarget: '/#meetings' })
    };
    const res = createMockResponse();
    await startHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
    assert(json.authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert(json.state && json.state.length === 64, 'State must be 32-byte hex string (64 chars)');
    generatedState = json.state;

    // Verify URL parameters
    const parsedUrl = new URL(json.authUrl);
    assert.strictEqual(parsedUrl.searchParams.get('state'), json.state);
    assert.strictEqual(parsedUrl.searchParams.get('access_type'), 'offline');
    assert.strictEqual(parsedUrl.searchParams.get('prompt'), 'consent');
    assert.strictEqual(parsedUrl.searchParams.get('response_type'), 'code');
  });

  // --- SECTION 4: Callback Security, Anti-Replay & Error Handling ---
  console.log('\n--- SECTION 4: Callback State Validation & Anti-Replay ---');

  await runAsyncTest('4.1: Callback handles error=access_denied gracefully', async () => {
    const req = { method: 'GET', url: '/api/auth/google/callback?error=access_denied' };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/?google_drive=access_denied#meetings');
  });

  await runAsyncTest('4.2: Callback rejects missing state or code parameters', async () => {
    const req = { method: 'GET', url: '/api/auth/google/callback' };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/?google_drive=invalid_state#meetings');
  });

  await runAsyncTest('4.3: Callback rejects untracked/tampered state token', async () => {
    const req = { method: 'GET', url: '/api/auth/google/callback?code=4/sample_code&state=forged_state_nonce_123' };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/?google_drive=invalid_state#meetings');
  });

  await runAsyncTest('4.4: Callback rejects expired state token', async () => {
    // Create an expired state (expired 1 second ago)
    const { state: expiredState } = await createOAuthState({
      tenantId: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      userId: 'usr_test_user',
      ttlSeconds: -1
    });

    const req = { method: 'GET', url: `/api/auth/google/callback?code=4/sample_code&state=${expiredState}` };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/?google_drive=invalid_state#meetings');
  });

  await runAsyncTest('4.5: Successful callback exchange redirects to /?google_drive=connected#meetings', async () => {
    // Use the valid state generated in 3.2
    assert(generatedState, 'Generated state must exist');

    const req = { method: 'GET', url: `/api/auth/google/callback?code=4/valid_exchange_code&state=${generatedState}` };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/?google_drive=connected#meetings');
  });

  await runAsyncTest('4.6: Anti-Replay: Repeating the exact same callback request fails', async () => {
    // Attempt replay of generatedState
    const req = { method: 'GET', url: `/api/auth/google/callback?code=4/valid_exchange_code&state=${generatedState}` };
    const res = createMockResponse();
    await callbackHandler(req, res);

    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(
      res.headers.location,
      '/?google_drive=invalid_state#meetings',
      'Replayed callback must be rejected with invalid_state'
    );
  });

  // --- SECTION 5: Status, Security Confidentiality & Disconnect ---
  console.log('\n--- SECTION 5: Security Confidentiality & Status Lifecycle ---');

  await runAsyncTest('5.1: Status endpoint reports connected state with Google email', async () => {
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer test_valid_jwt' }
    };
    const res = createMockResponse();
    await statusHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.connected, true);
    assert(json.googleEmail, 'Google email must be populated');
    assert.strictEqual(json.canRefresh, true);
  });

  await runAsyncTest('5.2: CRITICAL SECURITY: Status endpoint NEVER returns access_token or refresh_token', async () => {
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer test_valid_jwt' }
    };
    const res = createMockResponse();
    await statusHandler(req, res);

    const json = JSON.parse(res.body);
    assert.strictEqual(json.access_token, undefined, 'access_token must never be exposed');
    assert.strictEqual(json.refresh_token, undefined, 'refresh_token must never be exposed');
    assert.strictEqual(json.client_secret, undefined, 'client_secret must never be exposed');
    assert.strictEqual(json.tokens, undefined, 'tokens object must never be exposed');
  });

  await runAsyncTest('5.3: Disconnect endpoint revokes Google Drive connection', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer test_valid_jwt' }
    };
    const res = createMockResponse();
    await disconnectHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);

    // Verify status endpoint now returns connected: false
    const checkReq = {
      method: 'GET',
      headers: { authorization: 'Bearer test_valid_jwt' }
    };
    const checkRes = createMockResponse();
    await statusHandler(checkReq, checkRes);
    const checkJson = JSON.parse(checkRes.body);
    assert.strictEqual(checkJson.connected, false, 'Connection must be reported as disconnected');
    assert.strictEqual(checkJson.status, 'REVOKED');
  });

  // --- SECTION 6: HTTP Server Real Endpoint Test on Port 3000 ---
  console.log('\n--- SECTION 6: Local Server HTTP Endpoint Verification (Port 3000) ---');

  await runAsyncTest('6.1: Real HTTP GET to localhost:3000/api/auth/google/callback?error=access_denied', async () => {
    return new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/auth/google/callback?error=access_denied', res => {
        try {
          assert.strictEqual(res.statusCode, 302);
          assert.strictEqual(res.headers.location, '/?google_drive=access_denied#meetings');
          res.on('data', () => {});
          res.on('end', resolve);
        } catch (e) { reject(e); }
      }).on('error', reject);
    });
  });

  await runAsyncTest('6.2: Real HTTP GET to localhost:3000/api/auth/google/callback?code=bad&state=bad', async () => {
    return new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/auth/google/callback?code=bad&state=bad', res => {
        try {
          assert.strictEqual(res.statusCode, 302);
          assert.strictEqual(res.headers.location, '/?google_drive=invalid_state#meetings');
          res.on('data', () => {});
          res.on('end', resolve);
        } catch (e) { reject(e); }
      }).on('error', reject);
    });
  });

  console.log('\n================================================================================');
  console.log(` RESULTS: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL: ${totalTests} TESTS)`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllOAuthTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
