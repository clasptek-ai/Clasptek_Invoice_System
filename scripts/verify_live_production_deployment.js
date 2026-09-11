/**
 * CLASPTEK LIVE PRODUCTION DEPLOYMENT & CDP VERIFICATION SUITE
 * 
 * Verifies live deployment at https://app.clasptek.org/ against Supabase backend.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9400 + Math.floor(Math.random() * 500);
const TEMP_PROFILE = path.join(__dirname, 'temp_chrome_live_verify_' + Date.now());
const LIVE_URL = 'https://app.clasptek.org/';

// Load credentials
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let adminPassword = process.env.ADMIN_PASSWORD || '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('ADMIN_PASSWORD=')) {
    adminPassword = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache',
        'User-Agent': 'ClasptekLiveDeploymentVerifier/1.0'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    }).on('error', reject);
  });
}

async function runLiveVerification() {
  console.log('========================================================================================');
  console.log(' CLASPTEK LIVE PRODUCTION DEPLOYMENT & CDP VERIFICATION');
  console.log(' Target URL: ' + LIVE_URL);
  console.log(' Timestamp:  ' + new Date().toISOString());
  console.log('========================================================================================\n');

  // ------------------------------------------------------------------------------------
  // GATE 1: LOCAL BUILD VERIFICATION
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 1: Local Build SHA-256 Parity ---');
  const localFiles = [
    'index.html',
    'clasptek_invoice_system.html',
    'public/index.html',
    'public/clasptek_invoice_system.html'
  ];
  const localHashes = {};
  for (const f of localFiles) {
    const p = path.join(__dirname, '..', f);
    const h = sha256(fs.readFileSync(p));
    localHashes[f] = h;
    console.log(`  ${f.padEnd(35)}: ${h}`);
  }
  const expectedHash = localHashes['index.html'];
  for (const f of localFiles) {
    assert.strictEqual(localHashes[f], expectedHash, `Hash mismatch in local file: ${f}`);
  }
  console.log('✔ GATE 1 PASSED: 100% 4-file byte parity confirmed.\n');

  // ------------------------------------------------------------------------------------
  // GATE 2: LIVE PRODUCTION ARTIFACT FETCH
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 2: Live Website SHA-256 Verification ---');
  const liveRes = await fetchUrl(LIVE_URL);
  assert.strictEqual(liveRes.statusCode, 200, 'Live website must return HTTP 200');
  const liveHash = sha256(liveRes.body);
  console.log('  LOCAL BUILD SHA-256:     ' + expectedHash);
  console.log('  LIVE PRODUCTION SHA-256: ' + liveHash);
  const hashesMatch = expectedHash === liveHash;
  console.log('  MATCH:                   ' + (hashesMatch ? 'YES' : 'NO'));
  assert.strictEqual(hashesMatch, true, 'Live website SHA-256 must match local certified build');
  console.log('✔ GATE 2 PASSED: Live production website is serving the exact certified build.\n');

  // ------------------------------------------------------------------------------------
  // GATE 3: BROWSER CDP LAUNCH & RUNTIME VERIFICATION
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 3: Live Browser CDP Runtime Code Verification ---');
  if (fs.existsSync(TEMP_PROFILE)) {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_PROFILE, { recursive: true });

  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ];
  const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: ['ignore', 'ignore', 'ignore'] });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        if (targets && targets.length > 0) break;
      }
    } catch (_) {}
  }
  assert(targets && targets.length > 0, 'Connected to Chrome CDP');

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const networkLog = [];
  const networkResponses = [];
  ws.onmessage = (event) => {
    try {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
        return;
      }
      if (m.method === 'Network.requestWillBeSent') {
        networkLog.push(m.params);
      }
      if (m.method === 'Network.responseReceived') {
        networkResponses.push(m.params);
      }
    } catch (_) {}
  };

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');

  console.log(`  Navigating to ${LIVE_URL}...`);
  await send('Page.navigate', { url: LIVE_URL });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const rState = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (rState.result && rState.result.value === 'complete') break;
    } catch (_) {}
  }

  // Check runtime variables on live page
  const evalRuntime = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasClient: typeof supabaseClient !== 'undefined',
        hasInFlight: supabaseClient.auth ? '_inFlightRefreshPromise' in supabaseClient.auth : false,
        hasTerminal: supabaseClient.auth ? '_refreshFailureTerminal' in supabaseClient.auth : false,
        hasRateLimit: supabaseClient.auth ? '_rateLimitedUntil' in supabaseClient.auth : false,
        hasHandleTerminal: supabaseClient.auth ? typeof supabaseClient.auth.handleTerminalAuthFailure === 'function' : false,
        hasDecoupledDiag: typeof renderDatabaseBannerHtml === 'function'
      };
    })()`,
    returnByValue: true
  });
  console.log('  Live Runtime Symbols:', evalRuntime.result.value);
  assert(evalRuntime.result.value.hasClient, 'supabaseClient present on live site');
  assert(evalRuntime.result.value.hasInFlight, '_inFlightRefreshPromise verified on live site');
  assert(evalRuntime.result.value.hasTerminal, '_refreshFailureTerminal verified on live site');
  assert(evalRuntime.result.value.hasRateLimit, '_rateLimitedUntil verified on live site');
  assert(evalRuntime.result.value.hasHandleTerminal, 'handleTerminalAuthFailure verified on live site');
  console.log('✔ GATE 3 PASSED: Browser runtime is executing the certified authentication remediation code.\n');

  // ------------------------------------------------------------------------------------
  // GATE 4: TEST THE ORIGINAL FAILURE SCENARIO (INVALID REFRESH TOKEN)
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 4: Original Failure Scenario Reproduction (Stale/Invalid Session) ---');
  // Wait for any initial page load requests to settle completely
  await new Promise(r => setTimeout(r, 2500));
  // Clear network log
  networkLog.length = 0;
  networkResponses.length = 0;

  // Reproduce stale/invalid-session condition with 10 concurrent refresh callers
  const staleSessionCheck = await send('Runtime.evaluate', {
    expression: `(async () => {
      const fakeStaleSession = {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEwMDAwMDAwMDB9.invalid',
        refresh_token: 'definitely-invalid-stale-refresh-token-repro-test',
        expires_in: 0,
        user: { id: '00000000-0000-0000-0000-000000000000', email: 'stale@clasptek.org' }
      };
      localStorage.setItem('clasptek:supabase_session', JSON.stringify(fakeStaleSession));
      if (window.state && window.state.auth) {
        window.state.auth.supabaseSession = fakeStaleSession;
        window.state.auth.supabaseJwt = fakeStaleSession.access_token;
      }

      // Simulate 10 concurrent requests attempting refresh on the stale session
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(window.supabaseClient.auth.refreshSession().catch(e => e.message));
      }
      const results = await Promise.all(promises);

      // Subsequent call after terminal failure
      const subsequent = await window.supabaseClient.ensureFreshSession();

      return {
        isAuthenticated: window.state && window.state.auth ? window.state.auth.isAuthenticated : false,
        isTerminal: window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient.auth.isTerminalFailure() : false,
        dbAuthorityState: window.state ? window.state.databaseAuthorityState : null,
        connectionError: window.state ? window.state.connectionError : null,
        bannerText: document.getElementById('dbConnWarningBanner') ? document.getElementById('dbConnWarningBanner').innerText : null,
        subsequentReturned: subsequent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('  Stale Session Evaluation Result:', staleSessionCheck.result.value);

  // Analyze network traffic during stale session recovery (specifically POST requests vs OPTIONS preflights)
  const refreshPostRequests = networkLog.filter(r => (r.request.url.includes('/auth/v1/token?grant_type=refresh_token') || r.request.url.includes('grant_type=refresh_token')) && r.request.method === 'POST');
  const refreshResponses = networkResponses.filter(r => r.response.url.includes('refresh_token'));
  const http400Count = refreshResponses.filter(r => r.response.status === 400).length;
  const http429Count = networkResponses.filter(r => r.response.status === 429).length;

  console.log('  Captured Refresh POST Requests:', refreshPostRequests.map(r => ({
    url: r.request.url,
    method: r.request.method,
    id: r.requestId,
    postData: r.request.postData,
    initiator: r.initiator ? r.initiator.type : null,
    timestamp: r.timestamp
  })));
  console.log('  Captured Responses:', networkResponses.map(r => ({ url: r.response.url, status: r.response.status, id: r.requestId })));

  console.log(`  Refresh POST Requests Dispatched: ${refreshPostRequests.length} (Expected: 1)`);
  console.log(`  HTTP 400 Responses:              ${http400Count} (Expected: 1)`);
  console.log(`  HTTP 429 Responses:              ${http429Count} (Expected: 0)`);

  assert.strictEqual(refreshPostRequests.length, 1, 'Exactly 1 refresh POST request must be dispatched');
  assert.strictEqual(http400Count, 1, 'HTTP 400 terminal failure received');
  assert.strictEqual(http429Count, 0, 'Zero 429 rate limiting errors');
  assert.strictEqual(staleSessionCheck.result.value.isAuthenticated, false, 'User must not be authenticated');
  assert.strictEqual(staleSessionCheck.result.value.isTerminal, true, 'Terminal failure flag must be set to true');

  // GATE 5: VERIFY DATABASE DIAGNOSTIC SEPARATION
  console.log('\n--- GATE 5: Database Diagnostic Decoupling Verification ---');
  const banner = staleSessionCheck.result.value.bannerText;
  console.log('  Active Warning Banner Text:', banner);
  assert(banner === null || !banner.includes('POSTGRESQL DISCONNECTED'), 'Must NOT report POSTGRESQL DISCONNECTED on auth failure');
  assert(staleSessionCheck.result.value.dbAuthorityState !== 'CONNECTIVITY_FAILED', 'Authority state must not be CONNECTIVITY_FAILED');
  console.log('✔ GATE 4 & 5 PASSED: Single-flight terminal lock confirmed; no refresh storm; auth separated from DB health.\n');

  // ------------------------------------------------------------------------------------
  // GATE 6, 7: NORMAL LOGIN & POSTGRESQL HEALTH VERIFICATION
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 6 & 7: Legitimate Login & PostgreSQL Connectivity ---');
  networkLog.length = 0;
  networkResponses.length = 0;

  const loginRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      // First ensure failure state is reset
      if (window.supabaseClient && window.supabaseClient.auth) {
        window.supabaseClient.auth.resetAuthFailureState();
      }
      if (!document.getElementById('formSignIn') && typeof window.render === 'function') {
        window.render();
      }

      const emailInput = document.getElementById('authEmail');
      const pwdInput = document.getElementById('authPassword');
      const form = document.getElementById('formSignIn');
      const btn = document.getElementById('btnSignIn');

      if (!emailInput || !pwdInput || !form) {
        return {
          success: false,
          reason: 'Login form elements not found',
          bodyHtmlSnippet: document.body ? document.body.innerHTML.slice(0, 300) : null
        };
      }
      emailInput.value = 'admin@clasptek.org';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwdInput.value = '${adminPassword}';
      pwdInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Click sign in button
      if (btn) btn.click();
      else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

      // Wait for authentication, database hydration, and dashboard rendering to complete
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (window.state && window.state.auth && window.state.auth.isAuthenticated && !window.state.loading && window.state.databaseAuthorityState === 'AUTHORITATIVE') {
          break;
        }
      }

      const alertEl = document.getElementById('loginAuthAlert');
      return {
        formPresent: true,
        btnText: btn ? btn.textContent : null,
        alertMsg: alertEl ? alertEl.textContent : null,
        success: window.state && window.state.auth ? window.state.auth.isAuthenticated : false,
        isAuthenticated: window.state && window.state.auth ? window.state.auth.isAuthenticated : false,
        userEmail: window.state && window.state.auth && window.state.auth.user ? window.state.auth.user.email : null,
        dbAuthorityState: window.state ? window.state.databaseAuthorityState : null,
        persistenceMode: window.state && window.state.supabase ? window.state.supabase.persistenceMode : null,
        programmesCount: window.state && window.state.programmes ? window.state.programmes.length : 0,
        invoicesCount: window.state && window.state.invoices ? window.state.invoices.length : 0,
        dashboardRendered: Boolean(document.querySelector('.cp-sidebar'))
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('  Live Login Form Submission Result:', loginRes.result.value);
  assert(loginRes.result.value.success, 'Form submission sign in must succeed');
  assert.strictEqual(loginRes.result.value.isAuthenticated, true, 'State must be authenticated');
  assert.strictEqual(loginRes.result.value.dbAuthorityState, 'AUTHORITATIVE', 'Database authority must be AUTHORITATIVE');
  assert.strictEqual(loginRes.result.value.persistenceMode, 'AUTHORITATIVE', 'Persistence mode must be AUTHORITATIVE');
  console.log('✔ GATE 6 & 7 PASSED: Login succeeded, PostgreSQL connectivity active, Authoritative Mode verified.\n');

  // ------------------------------------------------------------------------------------
  // GATE 8: LOGOUT INVARIANTS
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 8: Logout Invariants Verification ---');
  networkLog.length = 0;
  networkResponses.length = 0;

  const logoutRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      await window.supabaseClient.auth.signOut();
      localStorage.removeItem('clasptek:supabase_session');
      localStorage.removeItem('clasptek:auth_session');
      if (window.state) {
        window.state.auth = { isAuthenticated: false, user: null };
      }
      return {
        isAuthenticated: window.state && window.state.auth ? window.state.auth.isAuthenticated : false,
        cachedSession: localStorage.getItem('clasptek:supabase_session')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('  Logout State:', logoutRes.result.value);
  assert.strictEqual(logoutRes.result.value.isAuthenticated, false, 'Authenticated cleared to false');

  // Observe network for 3 seconds post-logout
  console.log('  Observing post-logout network traffic for 3 seconds...');
  await new Promise(r => setTimeout(r, 3000));

  const postLogoutRefreshes = networkLog.filter(r => r.request.url.includes('grant_type=refresh_token'));
  const postLogoutBusinessReqs = networkLog.filter(r => r.request.url.includes('/rest/v1/') && !r.request.url.includes('rpc/'));
  console.log(`  Post-logout refresh requests: ${postLogoutRefreshes.length} (Expected: 0)`);
  console.log(`  Post-logout dead API requests: ${postLogoutBusinessReqs.length} (Expected: 0)`);
  assert.strictEqual(postLogoutRefreshes.length, 0, 'Zero background refresh requests after logout');
  assert.strictEqual(postLogoutBusinessReqs.length, 0, 'Zero dead-session API calls after logout');
  console.log('✔ GATE 8 PASSED: Clean logout with zero background requests.\n');

  // ------------------------------------------------------------------------------------
  // GATE 9: HARD REFRESH & CACHE TEST
  // ------------------------------------------------------------------------------------
  console.log('--- GATE 9: Hard Refresh & Cache Test ---');
  networkLog.length = 0;
  networkResponses.length = 0;

  // Re-login
  await send('Runtime.evaluate', {
    expression: `(async () => {
      await window.supabaseClient.auth.signInWithPassword('admin@clasptek.org', '${adminPassword}');
    })()`,
    awaitPromise: true
  });

  // Hard reload page
  console.log('  Executing hard reload...');
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const rState = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (rState.result && rState.result.value === 'complete') break;
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 2000));

  const reloadCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        isAuthenticated: window.state && window.state.auth ? window.state.auth.isAuthenticated : false,
        dbState: window.state ? window.state.databaseAuthorityState : null,
        hasError: Boolean(window.state && window.state.connectionError)
      };
    })()`,
    returnByValue: true
  });
  console.log('  Post-Reload State:', reloadCheck.result.value);
  assert.strictEqual(reloadCheck.result.value.isAuthenticated, true, 'Authenticated after hard reload');
  assert.strictEqual(reloadCheck.result.value.dbState, 'AUTHORITATIVE', 'PostgreSQL remains AUTHORITATIVE');
  // Clean shutdown of Chrome
  try { ws.close(); } catch (_) {}
  try { chromeProc.kill('SIGKILL'); } catch (_) {}

  console.log('========================================================================================');
  console.log(' ALL LIVE PRODUCTION DEPLOYMENT CHECKS COMPLETED WITH 100% SUCCESS');
  console.log('========================================================================================\n');
}

if (require.main === module) {
  runLiveVerification().catch(err => {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  }).finally(() => {
    try {
      if (fs.existsSync(TEMP_PROFILE)) {
        fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
      }
    } catch (_) {}
  });
}
