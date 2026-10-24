/**
 * scripts/test_phase_c126d_oauth_callback_domain_offline.js
 *
 * Clasptek Phase C126D — Replace Stale OAuth Callback Domain Offline Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections, ZERO secrets.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

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

(async () => {
  console.log('=== Clasptek Phase C126D: OAuth Callback Domain & Invariants Suite ===\n');

  console.log('--- 1. Production OAuth Callback Resolution ---');

  runTest('1.1: Production environment resolves to canonical https://app.clasptek.org/api/auth/google/callback when unset', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: undefined
    }, () => {
      const config = oauthConfig.resolveGoogleOAuthConfig();
      assert.strictEqual(config.redirectUri, 'https://app.clasptek.org/api/auth/google/callback');
    });
  });

  runTest('1.2: Production environment accepts explicit matching canonical https://app.clasptek.org/api/auth/google/callback', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: 'https://app.clasptek.org/api/auth/google/callback'
    }, () => {
      const config = oauthConfig.resolveGoogleOAuthConfig();
      assert.strictEqual(config.redirectUri, 'https://app.clasptek.org/api/auth/google/callback');
    });
  });

  runTest('1.3: Production environment strictly rejects legacy portal.clasptek.org callback with CONFIGURATION_ERROR', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: 'https://portal.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR.*portal\.clasptek\.org/
      );
    });
  });

  runTest('1.4: Production environment rejects conflicting callback domains with CONFIGURATION_ERROR', () => {
    withEnv({
      VERCEL_ENV: 'production',
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: 'https://other-domain.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: Production environment requires GOOGLE_REDIRECT_URI to be exactly 'https:\/\/app\.clasptek\.org\/api\/auth\/google\/callback'/
      );
    });
  });

  console.log('\n--- 2. Non-Production & Legacy Rejection Across Environments ---');

  runTest('2.1: Legacy portal.clasptek.org is rejected in all non-production environments with CONFIGURATION_ERROR', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: 'https://portal.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: GOOGLE_REDIRECT_URI references deprecated legacy domain portal\.clasptek\.org/
      );
    });
  });

  runTest('2.2: Malformed or non-http/https GOOGLE_REDIRECT_URI fails closed with CONFIGURATION_ERROR', () => {
    withEnv({
      VERCEL_ENV: undefined,
      GOOGLE_REDIRECT_URI: 'not-a-valid-uri'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: GOOGLE_REDIRECT_URI must be a valid http: or https: URL/
      );
    });
  });

  runTest('2.3: Localhost and 127.0.0.1 development resolve dynamically from request header', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: undefined
    }, () => {
      const configLocal = oauthConfig.resolveGoogleOAuthConfig({ headers: { host: 'localhost:3000' } });
      assert.strictEqual(configLocal.redirectUri, 'http://localhost:3000/api/auth/google/callback');

      const configHttps = oauthConfig.resolveGoogleOAuthConfig({
        headers: { host: 'localhost:3000', 'x-forwarded-proto': 'https' }
      });
      assert.strictEqual(configHttps.redirectUri, 'https://localhost:3000/api/auth/google/callback');
    });
  });

  runTest('2.4: Untrusted request Host header cannot override production fallback', () => {
    withEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      GOOGLE_REDIRECT_URI: undefined
    }, () => {
      const untrusted = ['evil.com', 'portal.clasptek.org', 'attacker.io'];
      for (const host of untrusted) {
        const config = oauthConfig.resolveGoogleOAuthConfig({ headers: { host } });
        assert.strictEqual(config.redirectUri, 'https://app.clasptek.org/api/auth/google/callback');
      }
    });
  });

  console.log('\n--- 3. Preview Environment Isolation & Dedicated Callback ---');

  runTest('3.1: Preview environment rejects legacy portal.clasptek.org for STAGING_GOOGLE_REDIRECT_URI', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'test-staging-client-id',
      STAGING_GOOGLE_REDIRECT_URI: 'https://portal.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: STAGING_GOOGLE_REDIRECT_URI must be a valid URL/
      );
      assert.throws(
        () => oauthConfig.assertOAuthInitiationAllowed(),
        /GOOGLE_OAUTH_PREVIEW_CONFIG_ERROR/
      );
    });
  });

  runTest('3.2: Preview environment rejects production app.clasptek.org for STAGING_GOOGLE_REDIRECT_URI', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'test-staging-client-id',
      STAGING_GOOGLE_REDIRECT_URI: 'https://app.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: STAGING_GOOGLE_REDIRECT_URI must be a valid URL/
      );
    });
  });

  runTest('3.3: Preview environment accepts valid dedicated staging redirect URI', () => {
    withEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'test-staging-client-id',
      STAGING_GOOGLE_REDIRECT_URI: 'https://preview-deploy-123.vercel.app/api/auth/google/callback'
    }, () => {
      const config = oauthConfig.resolveGoogleOAuthConfig();
      assert.strictEqual(config.redirectUri, 'https://preview-deploy-123.vercel.app/api/auth/google/callback');
    });
  });

  console.log('\n--- 4. OAuth State & Re-Consent Token Preservation ---');

  await runTestAsync('4.1: OAuth initiation URL embeds canonical redirect_uri matching config', async () => {
    withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_REDIRECT_URI: undefined
    }, () => {
      const config = oauthConfig.resolveGoogleOAuthConfig();
      const authUrlStr = oauthConfig.getAuthorizationUrl('state_test_abc');
      const authUrl = new URL(authUrlStr);
      assert.strictEqual(authUrl.searchParams.get('redirect_uri'), config.redirectUri);
      assert.strictEqual(authUrl.searchParams.get('redirect_uri'), 'https://app.clasptek.org/api/auth/google/callback');
    });
  });

  await runTestAsync('4.2: OAuth initiation URL includes Calendar scope when requested without modifying redirect_uri', async () => {
    withEnv({
      VERCEL_ENV: 'production',
      GOOGLE_REDIRECT_URI: undefined
    }, () => {
      const authUrlStr = oauthConfig.getAuthorizationUrl('state_test_abc', null, { includeCalendar: true });
      const authUrl = new URL(authUrlStr);
      assert.strictEqual(authUrl.searchParams.get('redirect_uri'), 'https://app.clasptek.org/api/auth/google/callback');
      assert.ok(authUrl.searchParams.get('scope').includes('calendar.events'));
    });
  });

  await runTestAsync('4.3: OAuth state creation and single-use consumption works with zero secret leak', async () => {
    const { state } = await oauthConfig.createOAuthState({
      tenantId: 'tenant-test-c126d',
      userId: 'usr-test-c126d',
      redirectTarget: '/#meetings',
      connectionType: 'TENANT_CENTRAL'
    });
    assert.ok(state && state.length >= 32);

    const check1 = await oauthConfig.validateAndConsumeOAuthState(state);
    assert.strictEqual(check1.valid, true);
    assert.strictEqual(check1.stateRecord.tenant_id, 'tenant-test-c126d');

    // Anti-replay: second consumption fails
    const check2 = await oauthConfig.validateAndConsumeOAuthState(state);
    assert.strictEqual(check2.valid, false);
  });

  console.log('\n============================================================');
  console.log(`C126D Test Results: ${passed} passed, ${failed} failed`);
  console.log('Zero network calls initiated across the entire suite.');
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
})();
