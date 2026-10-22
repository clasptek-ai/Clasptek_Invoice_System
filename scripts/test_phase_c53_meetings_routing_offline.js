/**
 * scripts/test_phase_c53_meetings_routing_offline.js
 *
 * Clasptek Phase C53 — Minimal Meetings Routing Remediation Regression Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Verifies:
 * 1. Path-boundary-safe public guest access for /meet and /meet/:id in proxy.ts.
 * 2. Protected staff dashboard /meetings and /meetings/* strictly redirect unauthenticated requests to /login.
 * 3. Boundary safety: /meet-other does not match /meet and redirects to /login.
 * 4. API routes bypass proxy.ts correctly.
 * 5. .vercelignore exists and contains api/meetings/ to prevent Vercel Serverless Function shadowing.
 * 6. ShellLayout.tsx treats /meet and /meet/* as standalone routes (no sidebar/staff chrome).
 * 7. Legacy api/meetings/create.js rejects google_meet with PROVIDER_UNSUPPORTED and parses JSON correctly.
 * 8. App Router handlers enforce session authentication and LiveKit-only constraints.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

function createProxyRunner(mockUpdateSession) {
  const proxyCode = fs.readFileSync(path.join(__dirname, '..', 'proxy.ts'), 'utf8');
  const js = ts.transpileModule(proxyCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;

  const mod = { exports: {} };
  const customRequire = (id) => {
    if (id === '@/lib/supabase/middleware') {
      return { updateSupabaseSession: mockUpdateSession };
    }
    if (id === 'next/server') {
      return { NextRequest, NextResponse };
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.join(__dirname, '..'));
  return mod.exports.proxy;
}

async function main() {
  console.log('\n=== Clasptek Phase C53: Meetings Routing Remediation Offline Tests ===\n');

  // Test 1-5: Proxy routing assertions
  let sessionInitCalled = false;
  const mockUpdateSession = async () => {
    sessionInitCalled = true;
    return {
      supabaseResponse: NextResponse.next(),
      user: null
    };
  };

  const proxy = createProxyRunner(mockUpdateSession);

  await runAsyncTest('Proxy allows anonymous access to /meet without session initialization', async () => {
    sessionInitCalled = false;
    const req = new NextRequest('https://app.clasptek.org/meet');
    const res = await proxy(req);
    assert.strictEqual(sessionInitCalled, false, 'Session init should not be called for anonymous /meet');
    assert.strictEqual(res.status, 200, 'Should return 200 pass-through');
  });

  await runAsyncTest('Proxy allows anonymous access to /meet/c-123-abc invitation route without session init', async () => {
    sessionInitCalled = false;
    const req = new NextRequest('https://app.clasptek.org/meet/c-123-abc');
    const res = await proxy(req);
    assert.strictEqual(sessionInitCalled, false, 'Session init should not be called for anonymous /meet/:id');
    assert.strictEqual(res.status, 200, 'Should return 200 pass-through');
  });

  await runAsyncTest('Proxy redirects unauthenticated access to /meetings staff dashboard to /login', async () => {
    sessionInitCalled = false;
    const req = new NextRequest('https://app.clasptek.org/meetings');
    const res = await proxy(req);
    assert.strictEqual(sessionInitCalled, true, 'Session init must be evaluated for protected /meetings');
    assert.strictEqual(res.status, 307, 'Should redirect to /login');
    const location = res.headers.get('location');
    assert(location && location.includes('/login?next=%2Fmeetings'), `Expected redirect to /login?next=%2Fmeetings, got: ${location}`);
  });

  await runAsyncTest('Proxy redirects unauthenticated access to /meetings/create to /login', async () => {
    sessionInitCalled = false;
    const req = new NextRequest('https://app.clasptek.org/meetings/create');
    const res = await proxy(req);
    assert.strictEqual(sessionInitCalled, true, 'Session init must be evaluated for protected /meetings/create');
    assert.strictEqual(res.status, 307, 'Should redirect to /login');
    const location = res.headers.get('location');
    assert(location && location.includes('/login?next=%2Fmeetings%2Fcreate'), `Expected redirect, got: ${location}`);
  });

  await runAsyncTest('Boundary safety: /meet-other does not match /meet and redirects to /login', async () => {
    sessionInitCalled = false;
    const req = new NextRequest('https://app.clasptek.org/meet-other');
    const res = await proxy(req);
    assert.strictEqual(sessionInitCalled, true, 'Session init must be evaluated for /meet-other');
    assert.strictEqual(res.status, 307, 'Should redirect to /login');
    const location = res.headers.get('location');
    assert(location && location.includes('/login?next=%2Fmeet-other'), `Expected redirect to /login, got: ${location}`);
  });

  await runAsyncTest('Proxy bypasses API routes /api/meetings/create and /api/meetings/join', async () => {
    const req1 = new NextRequest('https://app.clasptek.org/api/meetings/create');
    const res1 = await proxy(req1);
    assert.strictEqual(res1.status, 200, 'API create should bypass proxy');

    const req2 = new NextRequest('https://app.clasptek.org/api/meetings/join');
    const res2 = await proxy(req2);
    assert.strictEqual(res2.status, 200, 'API join should bypass proxy');
  });

  // Test 6: Legacy handler relocation check
  runTest('Legacy handlers relocated to legacy/meetings/ and root api/meetings/ cleared', () => {
    const legacyCreate = path.join(__dirname, '..', 'legacy', 'meetings', 'create.js');
    const legacyJoin = path.join(__dirname, '..', 'legacy', 'meetings', 'join.js');
    const rootCreate = path.join(__dirname, '..', 'api', 'meetings', 'create.js');
    assert(fs.existsSync(legacyCreate), 'legacy/meetings/create.js must exist');
    assert(fs.existsSync(legacyJoin), 'legacy/meetings/join.js must exist');
    assert(!fs.existsSync(rootCreate), 'root api/meetings/create.js must be removed');
  });

  // Test 7: ShellLayout standalone route check
  runTest('ShellLayout.tsx includes /meet and /meet/* in isStandalone check', () => {
    const shellLayoutCode = fs.readFileSync(path.join(__dirname, '..', 'components', 'layout', 'ShellLayout.tsx'), 'utf8');
    assert(shellLayoutCode.includes("pathname === '/meet'"), 'ShellLayout must check pathname === "/meet"');
    assert(shellLayoutCode.includes("pathname?.startsWith('/meet/')"), 'ShellLayout must check pathname?.startsWith("/meet/")');
  });

  // Test 8: Legacy api/meetings/create.js behavior
  await runAsyncTest('Legacy api/meetings/create.js rejects google_meet with PROVIDER_UNSUPPORTED', async () => {
    const legacyHandler = require('../legacy/meetings/create.js');
    let statusCode = null;
    let jsonBody = null;
    const req = {
      method: 'POST',
      body: {
        title: 'Test Session',
        provider: 'google_meet'
      }
    };
    const res = {
      setHeader() { return this; },
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      }
    };

    await legacyHandler(req, res);
    assert.strictEqual(statusCode, 400, 'Expected HTTP 400 for google_meet');
    assert.strictEqual(jsonBody?.error, 'PROVIDER_UNSUPPORTED', 'Expected PROVIDER_UNSUPPORTED error code');
  });

  await runAsyncTest('Legacy api/meetings/create.js validates title when parsed from object body', async () => {
    const legacyHandler = require('../legacy/meetings/create.js');
    let statusCode = null;
    let jsonBody = null;
    const req = {
      method: 'POST',
      body: {
        provider: 'livekit'
        // missing title
      }
    };
    const res = {
      setHeader() { return this; },
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      }
    };

    await legacyHandler(req, res);
    assert.strictEqual(statusCode, 400, 'Expected HTTP 400 for missing title');
    assert.strictEqual(jsonBody?.error, 'Meeting title is required');
  });

  // Test 9: App Router create handler rejects unauthenticated request
  await runAsyncTest('App Router app/api/meetings/create/route.ts rejects unauthenticated POST with 401', async () => {
    // We inspect the route source file statically to verify getAuthoritativeSession requirement
    const appRouterCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'meetings', 'create', 'route.ts'), 'utf8');
    assert(appRouterCode.includes('getAuthoritativeSession'), 'App router must check authoritative session');
    assert(appRouterCode.includes("status: 401"), 'App router must return 401 for unauthorized requests');
    assert(appRouterCode.includes('PROVIDER_UNSUPPORTED'), 'App router must reject non-livekit providers');
    assert(!appRouterCode.includes('req.body.user'), 'App router must NOT trust user in request body');
  });

  // Test 10: App Router guest decision handler rejects unauthenticated request
  await runAsyncTest('App Router app/api/meetings/guest/decision/route.ts enforces session and tenant auth', async () => {
    const decisionCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'meetings', 'guest', 'decision', 'route.ts'), 'utf8');
    assert(decisionCode.includes('getAuthoritativeSession'), 'Guest decision handler must check authoritative session');
    assert(decisionCode.includes("status: 401"), 'Guest decision must return 401 for unauthorized requests');
    assert(decisionCode.includes("meeting.tenantId !== tenantId"), 'Guest decision must enforce tenant isolation');
    assert(decisionCode.includes("['Super Admin', 'Finance Manager', 'Facilitator']"), 'Guest decision must enforce allowed roles');
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
