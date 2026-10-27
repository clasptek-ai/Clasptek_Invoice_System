/**
 * scripts/test_phase_c196_meetings_remediation_offline.js
 *
 * Phase C196 Certification Test Suite:
 * - M01: Resolve legacy meeting API routing collisions and verify Vercel ignore configuration.
 * - M02: Correct Google Drive production guard drift across all 7 environment cases.
 * - M03: LiveKit initialization error handling (503 on unconfigured, 502 on upstream failure).
 *
 * Invariants:
 * - 100% offline, zero database connections, zero network requests.
 * - Non-mutating and zero secret leakage.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runSyncTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

function withEnv(vars, fn) {
  const original = {};
  for (const k of Object.keys(vars)) {
    original[k] = process.env[k];
    if (vars[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = vars[k];
    }
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (original[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = original[k];
      }
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log(' CLASPTEK PHASE C196: MEETINGS REMEDIATION OFFLINE CERTIFICATION');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: M01 — Vercel Routing Invariants & Legacy Relocation
  // ==========================================================================
  console.log('--- SECTION 1: M01 Routing Collision Resolution ---');

  runSyncTest('1.1: Root api/meetings directory does NOT exist', () => {
    const rootApiMeetings = path.join(ROOT_DIR, 'api', 'meetings');
    assert.strictEqual(fs.existsSync(rootApiMeetings), false, 'api/meetings must be completely removed');
  });

  runSyncTest('1.2: All legacy meeting handlers exist under legacy/meetings/', () => {
    const legacyFiles = ['action.js', 'create.js', 'join.js', 'upload-recording.js'];
    for (const f of legacyFiles) {
      const p = path.join(ROOT_DIR, 'legacy', 'meetings', f);
      assert.strictEqual(fs.existsSync(p), true, `legacy/meetings/${f} must exist`);
    }
  });

  runSyncTest('1.3: .vercelignore exists and contains api/meetings/ and legacy/', () => {
    const vercelignorePath = path.join(ROOT_DIR, '.vercelignore');
    assert.strictEqual(fs.existsSync(vercelignorePath), true, '.vercelignore must exist');
    const content = fs.readFileSync(vercelignorePath, 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    assert.ok(lines.includes('api/meetings/'), '.vercelignore must contain api/meetings/');
    assert.ok(lines.includes('legacy/'), '.vercelignore must contain legacy/');
  });

  runSyncTest('1.4: vercel.json does not contain obsolete rewrites to api/meetings/action', () => {
    const vercelJsonPath = path.join(ROOT_DIR, 'vercel.json');
    const content = fs.readFileSync(vercelJsonPath, 'utf8');
    const config = JSON.parse(content);
    const rewrites = config.rewrites || [];
    for (const r of rewrites) {
      assert.ok(!r.destination.includes('/api/meetings/action'), `Obsolete rewrite found: ${r.destination}`);
    }
  });

  runSyncTest('1.5: Modern App Router handlers remain present under app/api/meetings/', () => {
    const modernRoutes = [
      'action/route.ts',
      'create/route.ts',
      'join/route.ts',
      'guest/request/route.ts',
      'guest/decision/route.ts',
      'recording/start/route.ts',
      'recording/stop/route.ts',
      'recording/status/route.ts',
      'recording/consent/route.ts',
      'drive-status/route.ts',
      'route.ts'
    ];
    for (const r of modernRoutes) {
      const p = path.join(ROOT_DIR, 'app', 'api', 'meetings', r);
      assert.strictEqual(fs.existsSync(p), true, `app/api/meetings/${r} must exist`);
    }
  });

  // ==========================================================================
  // SECTION 2: M02 — Google Drive OAuth Guard Drift Correction
  // ==========================================================================
  console.log('\n--- SECTION 2: M02 Google Drive Project Guard Drift Invariants ---');

  const oauthConfig = require('../api/_lib/google-oauth-config');
  const PROD_URL = 'https://logaawoigfxnisimfatf.supabase.co';
  const STAGING_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.co';
  const UNKNOWN_URL = 'https://abcdefghijklmnop1234.supabase.co';

  runSyncTest('2.1: Case 1 — Verified production environment allows legitimate production reference', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      const validated = oauthConfig.validateSupabaseUrlGuard(PROD_URL);
      assert.strictEqual(validated, PROD_URL);
    });
  });

  runSyncTest('2.2: Case 2 — Preview environment pointing to production project fails closed with QUARANTINE', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(PROD_URL),
        /SUPABASE_QUARANTINE_VIOLATION.*Preview or Staging/
      );
    });
  });

  runSyncTest('2.3: Case 3 — Staging environment pointing to production project fails closed with QUARANTINE', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: 'staging',
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(PROD_URL),
        /SUPABASE_QUARANTINE_VIOLATION.*Preview or Staging/
      );
    });
  });

  runSyncTest('2.4: Case 4 — Missing production-verification markers fails closed against production reference', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(PROD_URL),
        /SUPABASE_QUARANTINE_VIOLATION.*unverified or non-production/
      );
    });
  });

  runSyncTest('2.5: Case 5 — Conflicting environment markers fail closed immediately with SUPABASE_CONFIG_CONFLICT', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: 'preview',
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(PROD_URL),
        /SUPABASE_CONFIG_CONFLICT/
      );
    });
  });

  runSyncTest('2.6: Case 6 — Legitimate non-production staging project allowed under Preview and local dev', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      const validated = oauthConfig.validateSupabaseUrlGuard(STAGING_URL);
      assert.strictEqual(validated, STAGING_URL);
    });

    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      const validated = oauthConfig.validateSupabaseUrlGuard(STAGING_URL);
      assert.strictEqual(validated, STAGING_URL);
    });
  });

  runSyncTest('2.7: Case 7 — Malformed Supabase URLs rejected, zero secret leakage in error messages', () => {
    const secret = 'SUPER_SECRET_TOKEN_DO_NOT_LEAK_xyz123';
    withEnv({
      VERCEL_ENV: 'preview',
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: secret
    }, () => {
      // 1. Unknown project reference
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(UNKNOWN_URL),
        /SUPABASE_CONFIG_ERROR.*unauthorized project/
      );

      // 2. Insecure protocol (http)
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard('http://logaawoigfxnisimfatf.supabase.co'),
        /SUPABASE_CONFIG_ERROR.*https: scheme/
      );

      // 3. Embedded credentials in URL
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard(`https://admin:${secret}@logaawoigfxnisimfatf.supabase.co`),
        (err) => {
          assert(!err.message.includes(secret), 'Secret key must never appear in exception message');
          assert(err.message.includes('embedded credentials'));
          return true;
        }
      );

      // 4. Custom port
      assert.throws(
        () => oauthConfig.validateSupabaseUrlGuard('https://logaawoigfxnisimfatf.supabase.co:8443'),
        /SUPABASE_CONFIG_ERROR.*custom port/
      );
    });
  });

  // ==========================================================================
  // SECTION 3: M03 — LiveKit Initialization & Upstream Error Handling
  // ==========================================================================
  console.log('\n--- SECTION 3: M03 LiveKit Error Handling & Resilience ---');

  const createRouteSource = fs.readFileSync(path.join(ROOT_DIR, 'app', 'api', 'meetings', 'create', 'route.ts'), 'utf8');

  runSyncTest('3.1: getSFUService() is wrapped in controlled try/catch in create route', () => {
    assert.ok(createRouteSource.includes('let sfu;'), 'sfu variable must be declared before try block');
    assert.ok(createRouteSource.includes('sfu = getSFUService();'), 'getSFUService must be called inside try block');
  });

  runSyncTest('3.2: Missing LiveKit configuration returns HTTP 503 SERVICE_UNCONFIGURED without leaking secrets', () => {
    assert.ok(createRouteSource.includes('error: isMissingConfig ? \'SERVICE_UNCONFIGURED\' : \'SERVICE_UNAVAILABLE\''), 'Must return SERVICE_UNCONFIGURED for missing config');
    assert.ok(createRouteSource.includes('status: 503'), 'Must return HTTP 503 for configuration errors');
    assert.ok(!createRouteSource.includes('detail: configErr'), 'Must not leak raw internal exception details');
  });

  runSyncTest('3.3: Upstream SFU room creation failure maps to HTTP 502 SERVICE_UNAVAILABLE', () => {
    assert.ok(createRouteSource.includes('error: \'SERVICE_UNAVAILABLE\''), 'Must map upstream SFU room failure to SERVICE_UNAVAILABLE');
    assert.ok(createRouteSource.includes('status: 502'), 'Must return HTTP 502 for upstream failures');
    assert.ok(!createRouteSource.includes('detail: sfuErr'), 'Must not echo raw upstream SFU error details to client');
  });

  runSyncTest('3.4: Authorization and validation checks remain ahead of SFU initialization', () => {
    const authCheckIdx = createRouteSource.indexOf('getAuthoritativeSession');
    const roleCheckIdx = createRouteSource.indexOf('[\'Super Admin\', \'Finance Manager\', \'Facilitator\']');
    const providerCheckIdx = createRouteSource.indexOf('PROVIDER_UNSUPPORTED');
    const sfuInitIdx = createRouteSource.indexOf('sfu = getSFUService();');

    assert.ok(authCheckIdx !== -1 && authCheckIdx < sfuInitIdx, 'Auth check must precede SFU initialization');
    assert.ok(roleCheckIdx !== -1 && roleCheckIdx < sfuInitIdx, 'Role check must precede SFU initialization');
    assert.ok(providerCheckIdx !== -1 && providerCheckIdx < sfuInitIdx, 'Provider check must precede SFU initialization');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
