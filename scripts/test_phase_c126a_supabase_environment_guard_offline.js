/**
 * scripts/test_phase_c126a_supabase_environment_guard_offline.js
 *
 * Clasptek Phase C126A — Supabase Environment Guard and Google Drive/Calendar Recovery Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections, ZERO secrets.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function withEnv(vars, fn) {
  const orig = {};
  for (const k of Object.keys(vars)) {
    orig[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(orig)) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
  }
}

const oauthConfig = require('../api/_lib/google-oauth-config');

// Transpile and load TypeScript module helper
function loadTs(relPath) {
  const fullPath = path.resolve(__dirname, '..', relPath);
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
        requireAuth: async () => ({
          session: {
            user: { id: 'usr-123', email: 'admin@clasptek.org' },
            role: 'Super Admin',
            tenantId: 'tenant-test-123',
          },
          errorResponse: null,
        }),
      };
    }
    if (id.includes('next/server')) {
      return {
        NextResponse: {
          json: (body, opts = {}) => ({ status: opts.status || 200, json: () => Promise.resolve(body), body }),
        },
      };
    }
    if (id.startsWith('@/')) {
      const candidate = path.join(__dirname, '..', id.slice(2));
      return loadTs(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', 'globalThis', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath), globalThis);
  return mod.exports;
}

const projectGuard = loadTs('lib/supabase/project-guard.ts');
const googleMeet = loadTs('lib/meetings/google-meet.ts');
const calendarStatusRoute = loadTs('app/api/meetings/calendar-status/route.ts');

(async () => {
  console.log('=== Clasptek Phase C126A: Supabase Environment Guard & Recovery Suite ===\n');

  // 1. Environment Decision Matrix for google-oauth-config.js
  console.log('--- 1. Deployment-Aware Project Selection (google-oauth-config.js) ---');

  const PROD_URL = 'https://logaawoigfxnisimfatf.supabase.co';
  const STAGING_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.co';
  const ARBITRARY_URL = 'https://someotherproject123.supabase.co';

  runTest('1.1: Production environment (VERCEL_ENV=production) allows canonical production project', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      const config = oauthConfig.resolveSupabaseConfig();
      assert.strictEqual(config.supabaseUrl, PROD_URL);
    });
  });

  runTest('1.2: Production environment rejects staging project with SUPABASE_CONFIG_CONFLICT', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      SUPABASE_URL: STAGING_URL,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), /SUPABASE_CONFIG_CONFLICT/);
    });
  });

  runTest('1.3: Preview environment (VERCEL_ENV=preview) strictly rejects production project with SUPABASE_QUARANTINE_VIOLATION', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveSupabaseConfig(),
        /SUPABASE_QUARANTINE_VIOLATION.*Preview or Staging/
      );
    });
  });

  runTest('1.4: Preview environment (VERCEL_ENV=preview) allows designated staging project', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      CLASPTEK_ENV: undefined,
      SUPABASE_URL: STAGING_URL,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      const config = oauthConfig.resolveSupabaseConfig();
      assert.strictEqual(config.supabaseUrl, STAGING_URL);
    });
  });

  runTest('1.5: Local / unverified environment fails closed against production project with SUPABASE_QUARANTINE_VIOLATION', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveSupabaseConfig(),
        /SUPABASE_QUARANTINE_VIOLATION.*unverified or non-production/
      );
    });
  });

  runTest('1.6: Local / test environment allows staging project fallback', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
      SUPABASE_URL: STAGING_URL,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key'
    }, () => {
      const config = oauthConfig.resolveSupabaseConfig();
      assert.strictEqual(config.supabaseUrl, STAGING_URL);
    });
  });

  runTest('1.7: Unknown project reference is rejected in all environments with SUPABASE_CONFIG_ERROR', () => {
    withEnv({
      VERCEL_ENV: 'production',
      SUPABASE_URL: ARBITRARY_URL,
      NEXT_PUBLIC_SUPABASE_URL: ARBITRARY_URL,
    }, () => {
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), /SUPABASE_CONFIG_ERROR.*unauthorized project/);
    });
  });

  runTest('1.8: Conflicting environment markers fail closed with SUPABASE_CONFIG_CONFLICT', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: 'preview',
      SUPABASE_URL: PROD_URL,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    }, () => {
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), /SUPABASE_CONFIG_CONFLICT/);
    });
  });

  // 2. Parity between project-guard.ts and google-oauth-config.js
  console.log('\n--- 2. Project Guard Parity & Isolation Invariants ---');

  runTest('2.1: Canonical references match across project-guard and google-oauth-config', () => {
    assert.strictEqual(projectGuard.PRODUCTION_PROJECT_REF, oauthConfig.PRODUCTION_PROJECT_REF);
    assert.strictEqual(projectGuard.STAGING_PROJECT_REF, oauthConfig.STAGING_PROJECT_REF);
    assert.strictEqual(oauthConfig.PRODUCTION_PROJECT_REF, 'logaawoigfxnisimfatf');
    assert.strictEqual(oauthConfig.STAGING_PROJECT_REF, 'dwhjoiebzwnjdpcvcwvs');
  });

  runTest('2.2: Zero secret disclosure in guard exception messages', () => {
    const secret = 'SUPER_SECRET_TOKEN_DO_NOT_LEAK_12345';
    withEnv({
      VERCEL_ENV: 'preview',
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: secret
    }, () => {
      try {
        oauthConfig.resolveSupabaseConfig();
        assert.fail('Should have thrown');
      } catch (err) {
        assert(!err.message.includes(secret), 'Secret key must not appear in error message');
        assert(err.message.includes('SUPABASE_QUARANTINE_VIOLATION'));
      }
    });
  });

  // 3. Calendar Status & Google Meet Error Handling
  console.log('\n--- 3. Error Diagnosis & Guard Error Translation ---');

  await runTestAsync('3.1: calendar-status endpoint distinguishes guard violation from "not connected"', async () => {
    const origFn = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => {
        throw new Error('SUPABASE_QUARANTINE_VIOLATION: SUPABASE_URL points to the production project in a Preview environment.');
      };

      const dummyReq = {};
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 500);
      const body = res.body;
      assert.strictEqual(body.status, 'DATABASE_GUARD_ERROR');
      assert.strictEqual(body.connected, false);
      assert(body.message.includes('Database connection blocked by security guard'));
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origFn;
    }
  });

  await runTestAsync('3.2: calendar-status endpoint correctly reports genuine NOT_CONNECTED when no connection exists', async () => {
    const origFn = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => null;

      const dummyReq = {};
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'NOT_CONNECTED');
      assert.strictEqual(body.connected, false);
      assert.strictEqual(body.hasCalendarScope, false);
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origFn;
    }
  });

  await runTestAsync('3.3: calendar-status endpoint distinguishes PERMISSION_REQUIRED from NOT_CONNECTED', async () => {
    const origFn = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => ({
        status: 'CONNECTED',
        google_email: 'tenant@clasptek.org',
        scope: 'https://www.googleapis.com/auth/drive.file',
      });

      const dummyReq = {};
      const res = await calendarStatusRoute.GET(dummyReq);
      assert.strictEqual(res.status, 200);
      const body = res.body;
      assert.strictEqual(body.status, 'PERMISSION_REQUIRED');
      assert.strictEqual(body.connected, true);
      assert.strictEqual(body.hasCalendarScope, false);
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origFn;
    }
  });

  await runTestAsync('3.4: createOrValidateGoogleMeet translates guard error into DATABASE_CONFIGURATION_ERROR (500), not PROVIDER_UNSUPPORTED (400)', async () => {
    const origFn = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => {
        throw new Error('SUPABASE_QUARANTINE_VIOLATION: SUPABASE_URL points to the production project in a Preview environment.');
      };

      await googleMeet.createOrValidateGoogleMeet({
        tenantId: 'tenant-123',
        title: 'DevOps Session',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      });
      assert.fail('Should have thrown GoogleMeetError');
    } catch (err) {
      assert.strictEqual(err.name, 'GoogleMeetError');
      assert.strictEqual(err.code, 'DATABASE_CONFIGURATION_ERROR');
      assert.strictEqual(err.statusCode, 500);
      assert(err.message.includes('Database connection blocked by security guard'));
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origFn;
    }
  });

  await runTestAsync('3.5: createOrValidateGoogleMeet reports genuine PROVIDER_UNSUPPORTED (400) when connection is genuinely absent', async () => {
    const origFn = oauthConfig.getTenantCentralDriveConnection;
    try {
      oauthConfig.getTenantCentralDriveConnection = async () => null;

      await googleMeet.createOrValidateGoogleMeet({
        tenantId: 'tenant-123',
        title: 'DevOps Session',
        scheduledStart: new Date(Date.now() + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 7200000).toISOString(),
      });
      assert.fail('Should have thrown GoogleMeetError');
    } catch (err) {
      assert.strictEqual(err.name, 'GoogleMeetError');
      assert.strictEqual(err.code, 'PROVIDER_UNSUPPORTED');
      assert.strictEqual(err.statusCode, 400);
    } finally {
      oauthConfig.getTenantCentralDriveConnection = origFn;
    }
  });

  console.log('\n============================================================');
  console.log(`C126A Test Results: ${passed} passed, ${failed} failed`);
  console.log('Zero network calls initiated across the entire suite.');
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
})();
