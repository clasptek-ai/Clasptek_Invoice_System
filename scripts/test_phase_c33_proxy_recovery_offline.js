/**
 * scripts/test_phase_c33_proxy_recovery_offline.js
 *
 * Clasptek Phase C33 — Minimal Proxy Recovery & Quarantine Boundary Regression Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Covers:
 * 1. Anonymous /login renders without unnecessary Supabase session initialization.
 * 2. Anonymous public landing pages (/apply, /verify-certificate, /applicant-portal) pass through safely.
 * 3. Anonymous protected requests (/dashboard, /payments) redirect to /login with next param.
 * 4. Forged or stale auth cookie never grants protected access without session validation.
 * 5. Valid authenticated session preserves response and cookie-refresh behavior.
 * 6. Production Supabase access permitted ONLY in verified production context.
 * 7. Local, Preview, and Staging contexts strictly denied production project access.
 * 8. Conflicting environment markers fail closed.
 * 9. Missing or invalid configuration never bypasses the guard.
 * 10. Server-only markers and credentials are not leaked into browser bundles.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

const guard = require('../lib/supabase/project-guard.ts');

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

// Helper to transpile and instantiate proxy with custom updateSupabaseSession mock
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

async function runAll() {
  console.log('================================================================');
  console.log('CLASPTEK PHASE C33: PROXY RECOVERY & QUARANTINE REGRESSION SUITE');
  console.log('================================================================\n');

  // ─── Test 1: Anonymous /login does not initialize session ───────────────────
  await runAsyncTest('1. Anonymous /login renders without unnecessary Supabase session initialization', async () => {
    let sessionInitialized = false;
    const mockUpdateSession = async () => {
      sessionInitialized = true;
      throw new Error('UNEXPECTED_SESSION_CALL: /login should not initialize Supabase session for anonymous visitor');
    };

    const proxy = createProxyRunner(mockUpdateSession);
    const req = new NextRequest('https://app.clasptek.org/login');
    const res = await proxy(req);

    assert.strictEqual(sessionInitialized, false, 'updateSupabaseSession must NOT be called on anonymous /login');
    assert.strictEqual(res.status, 200, 'Anonymous /login must return 200 (pass-through next)');
    assert.strictEqual(res.headers.get('location'), null, 'Anonymous /login must not redirect');
  });

  // ─── Test 2: Anonymous public pages pass through ───────────────────────────
  await runAsyncTest('2. Anonymous public landing pages (/apply, /verify-certificate, /applicant-portal) pass through safely', async () => {
    let sessionCalls = 0;
    const mockUpdateSession = async () => {
      sessionCalls++;
      return { supabaseResponse: NextResponse.next(), user: null };
    };

    const proxy = createProxyRunner(mockUpdateSession);
    const publicPaths = ['/apply', '/apply/cohort-1', '/verify-certificate', '/applicant-portal'];

    for (const p of publicPaths) {
      const req = new NextRequest(`https://app.clasptek.org${p}`);
      const res = await proxy(req);
      assert.strictEqual(res.status, 200, `Public path ${p} must pass through with 200`);
      assert.strictEqual(res.headers.get('location'), null, `Public path ${p} must not redirect`);
    }
    assert.strictEqual(sessionCalls, 0, 'Public intake and verification forms must not trigger session refresh');
  });

  // ─── Test 3: Anonymous protected requests redirect to login ─────────────────
  await runAsyncTest('3. Anonymous protected requests redirect to /login with next parameter as intended', async () => {
    const mockUpdateSession = async (req) => {
      // Normal unauthenticated session response
      return { supabaseResponse: NextResponse.next({ request: req }), user: null };
    };

    const proxy = createProxyRunner(mockUpdateSession);
    const protectedPaths = ['/dashboard', '/payments', '/students'];

    for (const p of protectedPaths) {
      const req = new NextRequest(`https://app.clasptek.org${p}`);
      const res = await proxy(req);
      assert.strictEqual(res.status, 307, `Protected route ${p} must redirect unauthenticated request (status 307)`);
      const location = res.headers.get('location');
      assert(location, `Location header must be present for ${p}`);
      assert(location.includes('/login'), `Redirect must target /login for ${p}`);
      assert(location.includes(`next=${encodeURIComponent(p)}`), `Redirect must include next param for ${p}`);
    }
  });

  // ─── Test 4: Forged or stale auth cookie never grants protected access ──────
  await runAsyncTest('4. Forged or stale auth cookie never grants protected access without session validation', async () => {
    let validationExecuted = false;
    const mockUpdateSession = async () => {
      validationExecuted = true;
      // Stale or forged cookie rejected by auth server: user is null
      return { supabaseResponse: NextResponse.next(), user: null };
    };

    const proxy = createProxyRunner(mockUpdateSession);
    const req = new NextRequest('https://app.clasptek.org/dashboard', {
      headers: { cookie: 'sb-logaawoigfxnisimfatf-auth-token=forged.garbage.token' }
    });

    const res = await proxy(req);
    assert.strictEqual(validationExecuted, true, 'Server session validation must execute when auth cookie is provided');
    assert.strictEqual(res.status, 307, 'Invalid or forged cookie must be denied access and redirected');
    assert(res.headers.get('location').includes('/login'), 'Redirect must target /login');
  });

  // ─── Test 5: Valid authenticated session preserves access & cookie refresh ──
  await runAsyncTest('5. Valid authenticated session preserves response and cookie-refresh behavior', async () => {
    const mockUpdateSession = async () => {
      const resp = NextResponse.next();
      resp.cookies.set('sb-logaawoigfxnisimfatf-auth-token', 'refreshed.valid.jwt');
      return {
        supabaseResponse: resp,
        user: { id: 'usr_valid_facilitator_123', email: 'facilitator@clasptek.org' }
      };
    };

    const proxy = createProxyRunner(mockUpdateSession);

    // 5a: Accessing protected /dashboard with valid user -> allowed
    const reqDashboard = new NextRequest('https://app.clasptek.org/dashboard', {
      headers: { cookie: 'sb-logaawoigfxnisimfatf-auth-token=current.valid.jwt' }
    });
    const resDashboard = await proxy(reqDashboard);
    assert.strictEqual(resDashboard.status, 200, 'Authenticated user must be granted access to /dashboard');
    assert.strictEqual(resDashboard.headers.get('location'), null, 'Authenticated user must not be redirected from /dashboard');

    // 5b: Accessing /login while already authenticated -> redirected to /dashboard
    const reqLogin = new NextRequest('https://app.clasptek.org/login', {
      headers: { cookie: 'sb-logaawoigfxnisimfatf-auth-token=current.valid.jwt' }
    });
    const resLogin = await proxy(reqLogin);
    assert.strictEqual(resLogin.status, 307, 'Authenticated user accessing /login must be redirected');
    assert(resLogin.headers.get('location').includes('/dashboard'), 'Authenticated user must be redirected to /dashboard');
  });

  // ─── Test 6: Production Supabase access permitted ONLY in verified context ──
  runTest('6. Production Supabase access permitted ONLY in verified production context', () => {
    // Verified production via CLASPTEK_ENV
    delete process.env.VERCEL_ENV;
    delete process.env.CLASPTEK_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_CLASPTEK_ENV;

    process.env.CLASPTEK_ENV = 'production';
    const validatedUrl = guard.validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co');
    assert.strictEqual(validatedUrl, 'https://logaawoigfxnisimfatf.supabase.co');

    // Verified production via VERCEL_ENV
    delete process.env.CLASPTEK_ENV;
    process.env.VERCEL_ENV = 'production';
    const validatedUrl2 = guard.validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co');
    assert.strictEqual(validatedUrl2, 'https://logaawoigfxnisimfatf.supabase.co');
  });

  // ─── Test 7: Local, Preview, and Staging strictly denied production access ───
  runTest('7. Local, Preview, and Staging contexts strictly denied production project access', () => {
    const unverifiedContexts = [
      { name: 'Local Dev (no markers)', env: {} },
      { name: 'Vercel Preview', env: { VERCEL_ENV: 'preview' } },
      { name: 'Clasptek Preview', env: { CLASPTEK_ENV: 'preview' } },
      { name: 'Clasptek Staging', env: { CLASPTEK_ENV: 'staging' } },
      { name: 'NODE_ENV=production alone', env: { NODE_ENV: 'production' } }
    ];

    for (const ctx of unverifiedContexts) {
      delete process.env.VERCEL_ENV;
      delete process.env.CLASPTEK_ENV;
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      delete process.env.NEXT_PUBLIC_CLASPTEK_ENV;
      delete process.env.NODE_ENV;
      Object.assign(process.env, ctx.env);

      assert.throws(
        () => guard.validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co'),
        /SUPABASE_QUARANTINE_VIOLATION/,
        `${ctx.name} must throw SUPABASE_QUARANTINE_VIOLATION`
      );
    }
  });

  // ─── Test 8: Conflicting environment markers fail closed ───────────────────
  runTest('8. Conflicting environment markers fail closed with SUPABASE_CONFIG_CONFLICT', () => {
    delete process.env.VERCEL_ENV;
    delete process.env.CLASPTEK_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_CLASPTEK_ENV;

    process.env.CLASPTEK_ENV = 'production';
    process.env.VERCEL_ENV = 'preview';

    assert.throws(
      () => guard.validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co'),
      /SUPABASE_CONFIG_CONFLICT/,
      'Coexisting production and preview markers must fail closed with SUPABASE_CONFIG_CONFLICT'
    );
  });

  // ─── Test 9: Missing or invalid configuration never bypasses the guard ──────
  runTest('9. Missing or invalid configuration never bypasses the guard', () => {
    const invalidUrls = [
      { url: '', error: /SUPABASE_CONFIG_ERROR/ },
      { url: '   ', error: /SUPABASE_CONFIG_ERROR/ },
      { url: 'http://logaawoigfxnisimfatf.supabase.co', error: /SUPABASE_CONFIG_ERROR/ },
      { url: 'https://user:pass@logaawoigfxnisimfatf.supabase.co', error: /SUPABASE_CONFIG_ERROR/ },
      { url: 'https://logaawoigfxnisimfatf.supabase.co:8443', error: /SUPABASE_CONFIG_ERROR/ },
      { url: 'https://unauthorized-evil-ref.supabase.co', error: /SUPABASE_CONFIG_ERROR/ }
    ];

    process.env.CLASPTEK_ENV = 'production';
    for (const inv of invalidUrls) {
      assert.throws(
        () => guard.validateSupabaseProjectRef(inv.url),
        inv.error,
        `Invalid URL '${inv.url}' must be rejected`
      );
    }
  });

  // ─── Test 10: Server-only markers not leaked in next.config.mjs env ─────────
  runTest('10. Server-only markers and credentials are not leaked into browser bundles via next.config.mjs', () => {
    const nextConfigContent = fs.readFileSync(path.join(__dirname, '..', 'next.config.mjs'), 'utf8');

    // next.config.mjs env object must NOT declare CLASPTEK_ENV or service role keys
    assert(!nextConfigContent.includes('CLASPTEK_ENV:'), 'next.config.mjs must NOT inline CLASPTEK_ENV');
    assert(!nextConfigContent.includes('SUPABASE_SERVICE_ROLE_KEY'), 'next.config.mjs must NOT inline service key');
    assert(!nextConfigContent.includes('SUPABASE_SECRET_KEY'), 'next.config.mjs must NOT inline secret key');
  });

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
