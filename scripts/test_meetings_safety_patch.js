/**
 * CLASPTEK MEETINGS — SAFETY PATCH REGRESSION TEST SUITE
 * Test: scripts/test_meetings_safety_patch.js
 * 
 * Verifies all 7 safety invariants from the approved code-only safety patch:
 * 1. Missing LiveKit configuration fails safely rather than selecting an implicit production endpoint.
 * 2. Explicit valid LiveKit configuration still works.
 * 3. SFU_PROVIDER='none' remains supported and fails safely.
 * 4. SFU_PROVIDER='mock' remains supported in test mode and rejected in production.
 * 5. Missing Supabase configuration does not silently select the production project in affected API paths.
 * 6. Explicitly configured Supabase URLs continue to be respected.
 * 7. The permissions-policy configuration in vercel.json allows same-origin camera/microphone/display-capture
 *    and keeps geolocation disabled.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const {
  LiveKitAdapter,
  MockSFUAdapter,
  getSFUAdapter
} = require('../api/_lib/sfu-adapter');

const googleOAuthConfig = require('../api/_lib/google-oauth-config');

// Helper to transpile and load lib/meetings/sfu.ts in CommonJS
function loadLiveKitServiceModule() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'meetings', 'sfu.ts'), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', 'process', js);
  fn(require, mod, mod.exports, process);
  return mod.exports;
}

let totalPassed = 0;
let totalFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✘ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    totalFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✘ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    totalFailed++;
  }
}

async function run() {
  console.log('===============================================================');
  console.log('CLASPTEK MEETINGS — APPROVED CODE-ONLY SAFETY PATCH VERIFICATION');
  console.log('===============================================================\n');

  // Preserve process.env
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Missing LiveKit configuration fails safely
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: LiveKit Fallback Safety ---');

    it('LiveKitService fails safely when LiveKit configuration is missing (no production fallback)', () => {
      const origUrl = process.env.LIVEKIT_URL;
      const origKey = process.env.LIVEKIT_API_KEY;
      const origSecret = process.env.LIVEKIT_API_SECRET;

      try {
        delete process.env.LIVEKIT_URL;
        delete process.env.LIVEKIT_API_KEY;
        delete process.env.LIVEKIT_API_SECRET;

        const { LiveKitService } = loadLiveKitServiceModule();

        assert.throws(() => {
          new LiveKitService();
        }, /CONFIGURATION_ERROR/);
      } finally {
        if (origUrl !== undefined) process.env.LIVEKIT_URL = origUrl; else delete process.env.LIVEKIT_URL;
        if (origKey !== undefined) process.env.LIVEKIT_API_KEY = origKey; else delete process.env.LIVEKIT_API_KEY;
        if (origSecret !== undefined) process.env.LIVEKIT_API_SECRET = origSecret; else delete process.env.LIVEKIT_API_SECRET;
      }
    });

    it('LiveKitAdapter fails safely when LiveKit configuration is missing', () => {
      const origUrl = process.env.LIVEKIT_URL;
      const origKey = process.env.LIVEKIT_API_KEY;
      const origSecret = process.env.LIVEKIT_API_SECRET;

      try {
        process.env.LIVEKIT_URL = '';
        process.env.LIVEKIT_API_KEY = '';
        process.env.LIVEKIT_API_SECRET = '';

        assert.throws(() => {
          new LiveKitAdapter();
        }, /CONFIGURATION_ERROR/);
      } finally {
        if (origUrl !== undefined) process.env.LIVEKIT_URL = origUrl; else delete process.env.LIVEKIT_URL;
        if (origKey !== undefined) process.env.LIVEKIT_API_KEY = origKey; else delete process.env.LIVEKIT_API_KEY;
        if (origSecret !== undefined) process.env.LIVEKIT_API_SECRET = origSecret; else delete process.env.LIVEKIT_API_SECRET;
      }
    });

    // -------------------------------------------------------------------------
    // TEST 2: Explicit valid LiveKit configuration still works
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Explicit LiveKit Configuration Preservation ---');

    await itAsync('LiveKitService generates valid tokens with explicit configuration', async () => {
      const { LiveKitService } = loadLiveKitServiceModule();
      const service = new LiveKitService({
        url: 'wss://staging-isolated.livekit.cloud',
        apiKey: 'staging_api_key_123',
        apiSecret: 'staging_super_secret_signing_key_len_32_bytes'
      });

      assert.strictEqual(service.serverUrl, 'wss://staging-isolated.livekit.cloud');
      assert.strictEqual(service.provider, 'livekit');

      const tokenRes = await service.generateParticipantToken({
        roomId: 'stg-mtg-test-room',
        participantId: 'usr_fac_01',
        participantName: 'Dr. Amina Bello',
        isHost: true,
        role: 'HOST'
      });

      assert(tokenRes.token, 'Token must be issued');
      assert.strictEqual(tokenRes.serverUrl, 'wss://staging-isolated.livekit.cloud');
      assert.strictEqual(tokenRes.roomId, 'stg-mtg-test-room');
      assert.strictEqual(tokenRes.isHost, true);

      // Verify token structure
      const parts = tokenRes.token.split('.');
      assert.strictEqual(parts.length, 3, 'JWT must have 3 segments');
    });

    it('LiveKitAdapter instantiates and functions with explicit configuration', () => {
      const adapter = new LiveKitAdapter({
        url: 'wss://staging-isolated.livekit.cloud',
        apiKey: 'staging_api_key_123',
        apiSecret: 'staging_super_secret_signing_key_len_32_bytes'
      });

      assert.strictEqual(adapter.name, 'livekit');
      assert.strictEqual(adapter.url, 'wss://staging-isolated.livekit.cloud');
    });

    // -------------------------------------------------------------------------
    // TEST 3 & 4: SFU_PROVIDER='none' and SFU_PROVIDER='mock'
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: SFU Provider Selection Safety ---');

    it("SFU_PROVIDER='none' fails safely with CONFIGURATION_ERROR", () => {
      const origEnv = process.env.NODE_ENV;
      const origTestMode = process.env.CLASPTEK_TEST_MODE;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.CLASPTEK_TEST_MODE;

        assert.throws(() => {
          getSFUAdapter('none');
        }, /CONFIGURATION_ERROR/);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origTestMode !== undefined) process.env.CLASPTEK_TEST_MODE = origTestMode; else delete process.env.CLASPTEK_TEST_MODE;
      }
    });

    it("SFU_PROVIDER='mock' works in test mode and is rejected in production", () => {
      const origEnv = process.env.NODE_ENV;
      const origTestMode = process.env.CLASPTEK_TEST_MODE;

      try {
        // In test mode: allowed
        process.env.CLASPTEK_TEST_MODE = 'true';
        const mockAdapter = getSFUAdapter('mock');
        assert(mockAdapter instanceof MockSFUAdapter);

        // Outside test mode in production: rejected
        delete process.env.CLASPTEK_TEST_MODE;
        process.env.NODE_ENV = 'production';
        assert.throws(() => {
          getSFUAdapter('mock');
        }, /SECURITY_ERROR/);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origTestMode !== undefined) process.env.CLASPTEK_TEST_MODE = origTestMode; else delete process.env.CLASPTEK_TEST_MODE;
      }
    });

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Supabase Fallback Safety & Explicit Configuration
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: Supabase Fallback Safety ---');

    const adminHandler = require('../api/admin');
    const resolveAdminCredentials = adminHandler.resolveCredentials;

    it('Missing Supabase configuration does NOT select production project in google-oauth-config', () => {
      const origUrl = process.env.SUPABASE_URL;
      const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      try {
        process.env.SUPABASE_URL = '';
        process.env.NEXT_PUBLIC_SUPABASE_URL = '';

        const cfg = googleOAuthConfig.resolveSupabaseConfig();
        assert.notStrictEqual(cfg.supabaseUrl, 'https://logaawoigfxnisimfatf.supabase.co', 'Must NOT fall back to production Supabase project');
        assert.strictEqual(cfg.supabaseUrl, '', 'Should be empty when unconfigured');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      }
    });

    it('google-oauth-config respects explicitly blank primary SUPABASE_URL without falling back to secondary alias or .env.local', () => {
      const origUrl = process.env.SUPABASE_URL;
      const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      try {
        process.env.SUPABASE_URL = '';
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;

        const cfg = googleOAuthConfig.resolveSupabaseConfig();
        assert.strictEqual(cfg.supabaseUrl, '', 'Must not fall back to .env.local via secondary alias when primary URL is blank');
        assert.notStrictEqual(cfg.supabaseUrl, 'https://logaawoigfxnisimfatf.supabase.co');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      }
    });

    it('Explicit Supabase URL is respected in google-oauth-config', () => {
      const origUrl = process.env.SUPABASE_URL;

      try {
        process.env.SUPABASE_URL = 'https://staging-custom-ref.supabase.co';
        const cfg = googleOAuthConfig.resolveSupabaseConfig();
        assert.strictEqual(cfg.supabaseUrl, 'https://staging-custom-ref.supabase.co');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      }
    });

    it('Explicitly blank Supabase URL configuration cannot silently reload production URL from .env.local in api/admin.js', () => {
      const origUrl = process.env.SUPABASE_URL;
      const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      try {
        // Test primary variable explicitly blank
        process.env.SUPABASE_URL = '';
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        let res = resolveAdminCredentials();
        assert.strictEqual(res.supabaseUrl, '', 'Primary blank SUPABASE_URL must remain empty');
        assert.notStrictEqual(res.supabaseUrl, 'https://logaawoigfxnisimfatf.supabase.co');

        // Test secondary variable explicitly blank
        delete process.env.SUPABASE_URL;
        process.env.NEXT_PUBLIC_SUPABASE_URL = '';
        res = resolveAdminCredentials();
        assert.strictEqual(res.supabaseUrl, '', 'Secondary blank NEXT_PUBLIC_SUPABASE_URL must remain empty');
        assert.notStrictEqual(res.supabaseUrl, 'https://logaawoigfxnisimfatf.supabase.co');

        // Test both explicitly blank
        process.env.SUPABASE_URL = '';
        process.env.NEXT_PUBLIC_SUPABASE_URL = '';
        res = resolveAdminCredentials();
        assert.strictEqual(res.supabaseUrl, '', 'Both blank variables must remain empty');
        assert.notStrictEqual(res.supabaseUrl, 'https://logaawoigfxnisimfatf.supabase.co');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      }
    });

    it('Explicitly blank Supabase key configuration cannot silently reload a key from .env.local in api/admin.js', () => {
      const origSecret = process.env.SUPABASE_SECRET_KEY;
      const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        // Test primary secret key blank
        process.env.SUPABASE_SECRET_KEY = '';
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        let res = resolveAdminCredentials();
        assert.strictEqual(res.secretKey, '', 'Primary blank SUPABASE_SECRET_KEY must remain empty');

        // Test secondary service role key blank
        delete process.env.SUPABASE_SECRET_KEY;
        process.env.SUPABASE_SERVICE_ROLE_KEY = '';
        res = resolveAdminCredentials();
        assert.strictEqual(res.secretKey, '', 'Secondary blank SUPABASE_SERVICE_ROLE_KEY must remain empty');

        // Test both blank
        process.env.SUPABASE_SECRET_KEY = '';
        process.env.SUPABASE_SERVICE_ROLE_KEY = '';
        res = resolveAdminCredentials();
        assert.strictEqual(res.secretKey, '', 'Both blank keys must remain empty');
      } finally {
        if (origSecret !== undefined) process.env.SUPABASE_SECRET_KEY = origSecret; else delete process.env.SUPABASE_SECRET_KEY;
        if (origService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origService; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    it('Genuinely absent variables in api/admin.js load development configuration from .env.local if present', () => {
      const origUrl = process.env.SUPABASE_URL;
      const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const origSecret = process.env.SUPABASE_SECRET_KEY;
      const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        delete process.env.SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.SUPABASE_SECRET_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        const res = resolveAdminCredentials();
        const envPath = path.join(__dirname, '..', '.env.local');
        if (fs.existsSync(envPath)) {
          assert(res.supabaseUrl.length > 0, 'Should load URL from .env.local when genuinely absent');
          assert(res.secretKey.length > 0, 'Should load key from .env.local when genuinely absent');
        }
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (origSecret !== undefined) process.env.SUPABASE_SECRET_KEY = origSecret; else delete process.env.SUPABASE_SECRET_KEY;
        if (origService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origService; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    it('Valid explicit configuration is respected in api/admin.js', () => {
      const origUrl = process.env.SUPABASE_URL;
      const origSecret = process.env.SUPABASE_SECRET_KEY;

      try {
        process.env.SUPABASE_URL = 'https://custom-admin-staging.supabase.co';
        process.env.SUPABASE_SECRET_KEY = 'custom-admin-secret-key-xyz';

        const res = resolveAdminCredentials();
        assert.strictEqual(res.supabaseUrl, 'https://custom-admin-staging.supabase.co');
        assert.strictEqual(res.secretKey, 'custom-admin-secret-key-xyz');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origSecret !== undefined) process.env.SUPABASE_SECRET_KEY = origSecret; else delete process.env.SUPABASE_SECRET_KEY;
      }
    });

    await itAsync('api/admin.js handler fails closed with 500 when Supabase URL or credentials are blank without making network requests', async () => {
      const origUrl = process.env.SUPABASE_URL;
      const origSecret = process.env.SUPABASE_SECRET_KEY;

      try {
        process.env.SUPABASE_URL = '';
        process.env.SUPABASE_SECRET_KEY = '';

        const mockReq = {
          method: 'POST',
          url: '/api/admin?action=provision-user',
          headers: { authorization: 'Bearer test.dummy.token' },
          body: {}
        };
        const mockRes = {
          statusCode: null,
          headers: {},
          setHeader(k, v) { this.headers[k] = v; },
          end(payload) { this.payload = payload; }
        };

        await adminHandler(mockReq, mockRes);
        assert.strictEqual(mockRes.statusCode, 500, 'Must return 500 when credentials unavailable');
        const parsed = JSON.parse(mockRes.payload);
        assert.strictEqual(parsed.error, 'Server configuration error: administrative credentials or Supabase URL unavailable.');
      } finally {
        if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
        if (origSecret !== undefined) process.env.SUPABASE_SECRET_KEY = origSecret; else delete process.env.SUPABASE_SECRET_KEY;
      }
    });

    it('Missing Supabase configuration does NOT select production project in api/admin.js static inspection', () => {
      const adminCode = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
      assert(!adminCode.includes('https://logaawoigfxnisimfatf.supabase.co'), 'api/admin.js must NOT contain hardcoded production Supabase fallback');
    });

    it('google-oauth-config.js does NOT contain hardcoded production Supabase fallback', () => {
      const oauthCode = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'google-oauth-config.js'), 'utf8');
      assert(!oauthCode.includes('https://logaawoigfxnisimfatf.supabase.co'), 'google-oauth-config.js must NOT contain hardcoded production Supabase fallback');
    });

    // -------------------------------------------------------------------------
    // TEST 7: Permissions-Policy in vercel.json
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Vercel Permissions-Policy Security ---');

    it('vercel.json allows same-origin camera, microphone, display-capture and disables geolocation', () => {
      const vercelJsonPath = path.join(__dirname, '..', 'vercel.json');
      const vercelContent = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

      const globalHeaderConfig = vercelContent.headers.find(h => h.source === '/(.*)');
      assert(globalHeaderConfig, 'Must have global header configuration for /(.*)');

      const permPolicy = globalHeaderConfig.headers.find(h => h.key === 'Permissions-Policy');
      assert(permPolicy, 'Must configure Permissions-Policy');

      const value = permPolicy.value;
      assert(value.includes('camera=(self)'), 'Must allow same-origin camera');
      assert(value.includes('microphone=(self)'), 'Must allow same-origin microphone');
      assert(value.includes('display-capture=(self)'), 'Must allow same-origin display-capture for screen sharing');
      assert(value.includes('geolocation=()'), 'Must keep geolocation disabled ()');

      // Verify other security headers are intact
      assert(globalHeaderConfig.headers.some(h => h.key === 'X-Content-Type-Options' && h.value === 'nosniff'));
      assert(globalHeaderConfig.headers.some(h => h.key === 'X-Frame-Options' && h.value === 'DENY'));
      assert(globalHeaderConfig.headers.some(h => h.key === 'X-XSS-Protection' && h.value === '1; mode=block'));
      assert(globalHeaderConfig.headers.some(h => h.key === 'Referrer-Policy' && h.value === 'strict-origin-when-cross-origin'));
    });

  } finally {
    // Restore all process.env values
    Object.keys(process.env).forEach(k => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  }

  console.log('\n===============================================================');
  console.log(`SAFETY PATCH RESULTS: ${totalPassed} PASSED / ${totalFailed} FAILED (TOTAL ${totalPassed + totalFailed} ASSERTIONS)`);
  console.log('===============================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal safety test execution error:', err);
  process.exit(1);
});
