/**
 * scripts/test_phase1_security_remediation_offline.js
 *
 * PHASE 1 / 1A OFFLINE TEST SUITE: Supabase Isolation & Configuration Security Remediation
 *
 * Verifies:
 * 1. Supabase Quarantine Guard (lib/supabase/project-guard.ts)
 *    - Rejects quarantined production project (logaawoigfxnisimfatf) in all formats
 *    - Accepts approved staging project (dwhjoiebzwnjdpcvcwvs)
 *    - Fails closed on missing, malformed, or unexpected hostnames
 *    - Rejects non-HTTPS schemes (http:, ftp:, etc.)
 *    - Rejects embedded credentials in URL
 *    - Rejects custom ports
 *    - Rejects .supabase.in (only *.supabase.co permitted)
 *    - Error messages do not disclose credentials or secrets
 * 2. Configuration Precedence & Conflict Detection (project-guard.ts)
 *    - Divergent URL aliases throw SUPABASE_CONFIG_CONFLICT
 *    - Divergent service key aliases throw SUPABASE_CONFIG_CONFLICT
 *    - Divergent anon key aliases throw SUPABASE_CONFIG_CONFLICT
 * 3. Supabase Isolation in api/_lib/google-oauth-config.js
 *    - Exact parity with project-guard.ts rules
 *    - Rejects quarantine, malformed URLs, and conflicting aliases
 * 4. Edge Middleware Protection (lib/supabase/middleware.ts)
 *    - Quarantined URL throws before createServerClient
 *    - Malformed or conflicting URLs fail closed
 *    - Safe unconfigured fallback when no credentials provided
 * 5. SFU Adapter HMAC Security (api/_lib/sfu-adapter.js)
 *    - dev_secret_fallback eliminated
 *    - Fails closed if secret missing
 * 6. Configuration Contract Specification (.env.example)
 *    - Zero active quarantine references
 *    - Explicit Staging vs Production distinction
 *
 * Mode: STRICT OFFLINE — Zero network calls, zero external database connections.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
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
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log(' CLASPTEK PHASE 1A: SUPABASE ISOLATION & CONFIG SECURITY TEST SUITE');
console.log(' Mode: OFFLINE VERIFICATION');
console.log('========================================================================\n');

(async () => {
  // Load lib/supabase/project-guard.ts directly
  const projectGuardPath = path.join(__dirname, '..', 'lib', 'supabase', 'project-guard.ts');
  assert(fs.existsSync(projectGuardPath), 'project-guard.ts must exist');

  // Load project-guard functions
  // In Node 24+, --experimental-strip-types or direct strip allows loading .ts
  let guard;
  try {
    guard = require(projectGuardPath);
  } catch (_) {
    // Fallback: strip type annotations on the fly for environments without strip-types flag
    const tsCode = fs.readFileSync(projectGuardPath, 'utf8');
    const stripped = tsCode
      .replace(/:\s*(string(\s*\|\s*null)?|boolean|void)/g, '')
      .replace(/export\s+/g, '')
      .replace(/import\s+.*?;/g, '');
    const m = { exports: {} };
    const fn = new Function('module', 'exports', 'URL', stripped);
    fn(m, m.exports, URL);
    guard = m.exports;
  }

  const {
    extractProjectRef,
    validateSupabaseProjectRef,
    resolveValidatedSupabaseUrl,
    resolveValidatedServiceKey,
    resolveValidatedAnonKey,
    getQuarantinedProjectRef
  } = guard;

  // -----------------------------------------------------------------------------
  // Suite 1: Direct Execution of lib/supabase/project-guard.ts
  // -----------------------------------------------------------------------------
  console.log('--- Suite 1: lib/supabase/project-guard.ts Strict URL Policy ---');

  runTest('project-guard defines QUARANTINED_PROJECT_REF as logaawoigfxnisimfatf', () => {
    assert.strictEqual(getQuarantinedProjectRef(), 'logaawoigfxnisimfatf');
  });

  runTest('extractProjectRef correctly extracts staging project ref', () => {
    assert.strictEqual(extractProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co'), 'dwhjoiebzwnjdpcvcwvs');
    assert.strictEqual(extractProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co/rest/v1/'), 'dwhjoiebzwnjdpcvcwvs');
    assert.strictEqual(extractProjectRef('https://DWHJOIEBZWNJDPCVCWVS.SUPABASE.CO'), 'dwhjoiebzwnjdpcvcwvs');
  });

  runTest('validateSupabaseProjectRef accepts staging project URL', () => {
    const res = validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST');
    assert.strictEqual(res, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });

  runTest('validateSupabaseProjectRef rejects quarantined production URL with SUPABASE_QUARANTINE_VIOLATION', () => {
    const quarantined = [
      'https://logaawoigfxnisimfatf.supabase.co',
      'https://logaawoigfxnisimfatf.supabase.co/',
      'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
      'https://LOGAAWOIGFXNISIMFATF.SUPABASE.CO'
    ];
    for (const url of quarantined) {
      assert.throws(
        () => validateSupabaseProjectRef(url, 'TEST'),
        (err) => err.message.includes('SUPABASE_QUARANTINE_VIOLATION')
      );
    }
  });

  runTest('validateSupabaseProjectRef rejects missing, empty, or whitespace-only URLs', () => {
    assert.throws(() => validateSupabaseProjectRef('', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('   ', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef(null, 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
  });

  runTest('validateSupabaseProjectRef rejects non-HTTPS schemes (http, ftp, javascript)', () => {
    assert.throws(() => validateSupabaseProjectRef('http://dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('ftp://dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('javascript:alert(1)', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
  });

  runTest('validateSupabaseProjectRef rejects embedded credentials in URL', () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://admin:secret@dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'),
      (e) => e.message.includes('SUPABASE_CONFIG_ERROR') && e.message.includes('embedded credentials')
    );
  });

  runTest('validateSupabaseProjectRef rejects custom ports in URL', () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co:5432', 'TEST'),
      (e) => e.message.includes('SUPABASE_CONFIG_ERROR') && e.message.includes('custom port')
    );
  });

  runTest('validateSupabaseProjectRef rejects unauthorized hostnames and .supabase.in', () => {
    assert.throws(() => validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.in', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('https://evil.dwhjoiebzwnjdpcvcwvs.supabase.co.attacker.com', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('https://supabase.co', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    assert.throws(() => validateSupabaseProjectRef('https://127.0.0.1', 'TEST'), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
  });

  runTest('error messages do NOT disclose credentials or query tokens', () => {
    try {
      validateSupabaseProjectRef('https://bad-user:super-secret-password@evil.com/token?apiKey=super_secret_token', 'SECRET_VAR');
      assert.fail('Should have thrown');
    } catch (e) {
      assert(!e.message.includes('super-secret-password'), 'Must not echo password');
      assert(!e.message.includes('super_secret_token'), 'Must not echo token');
    }
  });

  // -----------------------------------------------------------------------------
  // Suite 2: Precedence & Conflict Detection
  // -----------------------------------------------------------------------------
  console.log('\n--- Suite 2: Configuration Precedence & Conflict Detection ---');

  runTest('resolveValidatedSupabaseUrl resolves when both aliases match', () => {
    const url = resolveValidatedSupabaseUrl(
      'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
      'https://dwhjoiebzwnjdpcvcwvs.supabase.co'
    );
    assert.strictEqual(url, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });

  runTest('resolveValidatedSupabaseUrl resolves when only primary alias is set', () => {
    const url = resolveValidatedSupabaseUrl('https://dwhjoiebzwnjdpcvcwvs.supabase.co', '');
    assert.strictEqual(url, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });

  runTest('resolveValidatedSupabaseUrl resolves when only secondary alias is set', () => {
    const url = resolveValidatedSupabaseUrl('', 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
    assert.strictEqual(url, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });

  runTest('resolveValidatedSupabaseUrl throws SUPABASE_CONFIG_CONFLICT when aliases diverge', () => {
    assert.throws(
      () => resolveValidatedSupabaseUrl(
        'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
        'https://otherproject99999.supabase.co'
      ),
      (err) => err.message.includes('SUPABASE_CONFIG_CONFLICT')
    );
  });

  runTest('resolveValidatedServiceKey throws SUPABASE_CONFIG_CONFLICT when service keys diverge', () => {
    assert.throws(
      () => resolveValidatedServiceKey('key_alpha_123', 'key_beta_456'),
      (err) => err.message.includes('SUPABASE_CONFIG_CONFLICT')
    );
  });

  runTest('resolveValidatedServiceKey resolves matching or single service keys', () => {
    assert.strictEqual(resolveValidatedServiceKey('key_alpha', 'key_alpha'), 'key_alpha');
    assert.strictEqual(resolveValidatedServiceKey('key_alpha', ''), 'key_alpha');
    assert.strictEqual(resolveValidatedServiceKey('', 'key_beta'), 'key_beta');
  });

  runTest('resolveValidatedAnonKey throws SUPABASE_CONFIG_CONFLICT when anon keys diverge', () => {
    assert.throws(
      () => resolveValidatedAnonKey('anon_111', 'anon_222'),
      (err) => err.message.includes('SUPABASE_CONFIG_CONFLICT')
    );
  });

  // -----------------------------------------------------------------------------
  // Suite 3: api/_lib/google-oauth-config.js Strict Guard & Conflict Detection
  // -----------------------------------------------------------------------------
  console.log('\n--- Suite 3: api/_lib/google-oauth-config.js Parity ---');

  const oauthConfigPath = path.join(__dirname, '..', 'api', '_lib', 'google-oauth-config.js');
  const oauthConfig = require(oauthConfigPath);

  runTest('google-oauth-config resolveSupabaseConfig rejects quarantined production URL', () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
      process.env.SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      assert.throws(
        () => oauthConfig.resolveSupabaseConfig(),
        (err) => err.message.includes('SUPABASE_QUARANTINE_VIOLATION')
      );
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  });

  runTest('google-oauth-config resolveSupabaseConfig rejects malformed URLs and unexpected hostnames', () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      process.env.SUPABASE_URL = 'http://dwhjoiebzwnjdpcvcwvs.supabase.co';
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));

      process.env.SUPABASE_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.in';
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));

      process.env.SUPABASE_URL = 'https://evil.supabase.co.attacker.com';
      assert.throws(() => oauthConfig.resolveSupabaseConfig(), (e) => e.message.includes('SUPABASE_CONFIG_ERROR'));
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  });

  runTest('google-oauth-config resolveSupabaseConfig throws on conflicting aliases', () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
      process.env.SUPABASE_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://otherproject12345.supabase.co';

      assert.throws(
        () => oauthConfig.resolveSupabaseConfig(),
        (err) => err.message.includes('SUPABASE_CONFIG_CONFLICT')
      );
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  });

  // -----------------------------------------------------------------------------
  // Suite 4: Edge Middleware Protection (lib/supabase/middleware.ts)
  // -----------------------------------------------------------------------------
  console.log('\n--- Suite 4: Edge Middleware Isolation & Protection ---');

  const middlewarePath = path.join(__dirname, '..', 'lib', 'supabase', 'middleware.ts');
  assert(fs.existsSync(middlewarePath), 'middleware.ts must exist');

  // Strip types to load middleware.ts in Node
  let middleware;
  try {
    middleware = require(middlewarePath);
  } catch (_) {
    const tsCode = fs.readFileSync(middlewarePath, 'utf8');
    const stripped = tsCode
      .replace(/:\s*(NextRequest|NextResponse|string|boolean|void)/g, '')
      .replace(/import\s+type\s+.*?;/g, '')
      .replace(/import\s+.*?;/g, '')
      .replace(/export\s+/g, '');
    const m = { exports: {} };
    const fn = new Function(
      'module',
      'exports',
      'resolveValidatedSupabaseUrl',
      'resolveValidatedAnonKey',
      'createServerClient',
      'NextResponse',
      stripped + '\nexports.updateSupabaseSession = updateSupabaseSession;\nmodule.exports.updateSupabaseSession = updateSupabaseSession;'
    );
    fn(m, m.exports, resolveValidatedSupabaseUrl, resolveValidatedAnonKey, () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }), { next: () => ({ cookies: { set: () => {} } }) });
    middleware = m.exports;
  }

  await runAsyncTest('middleware updateSupabaseSession rejects quarantined project before client creation', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';
      delete process.env.SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test_anon_key';

      const mockRequest = { cookies: { getAll: () => [] } };

      await assert.rejects(
        async () => {
          await middleware.updateSupabaseSession(mockRequest);
        },
        (err) => {
          assert(err.message.includes('SUPABASE_QUARANTINE_VIOLATION'), `Expected quarantine violation, got: ${err.message}`);
          return true;
        }
      );
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (origKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey; else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  await runAsyncTest('middleware updateSupabaseSession rejects malformed URLs', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://insecure-domain.com';
      delete process.env.SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test_anon_key';

      const mockRequest = { cookies: { getAll: () => [] } };

      await assert.rejects(
        async () => {
          await middleware.updateSupabaseSession(mockRequest);
        },
        (err) => err.message.includes('SUPABASE_CONFIG_ERROR')
      );
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (origKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey; else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  await runAsyncTest('middleware updateSupabaseSession rejects conflicting aliases', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      process.env.SUPABASE_URL = 'https://dwhjoiebzwnjdpcvcwvs.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://otherproject12345.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test_anon_key';

      const mockRequest = { cookies: { getAll: () => [] } };

      await assert.rejects(
        async () => {
          await middleware.updateSupabaseSession(mockRequest);
        },
        (err) => err.message.includes('SUPABASE_CONFIG_CONFLICT')
      );
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (origKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey; else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  await runAsyncTest('middleware returns null user safely when unconfigured without throwing', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const mockRequest = { cookies: { getAll: () => [] } };
      const res = await middleware.updateSupabaseSession(mockRequest);
      assert.strictEqual(res.user, null);
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origNextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origNextUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (origKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey; else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  // -----------------------------------------------------------------------------
  // Suite 5: SFU Adapter HMAC Security (api/_lib/sfu-adapter.js)
  // -----------------------------------------------------------------------------
  console.log('\n--- Suite 5: SFU Adapter Signing Key Security ---');

  const sfuAdapterPath = path.join(__dirname, '..', 'api', '_lib', 'sfu-adapter.js');
  const sfuAdapterSource = fs.readFileSync(sfuAdapterPath, 'utf8');

  runTest('dev_secret_fallback is completely absent from sfu-adapter.js', () => {
    assert(
      !sfuAdapterSource.includes('dev_secret_fallback'),
      'dev_secret_fallback must not appear anywhere in sfu-adapter.js'
    );
  });

  const { LiveKitAdapter } = require(sfuAdapterPath);

  runTest('LiveKitAdapter constructor throws if required credentials are missing', () => {
    const origUrl = process.env.LIVEKIT_URL;
    const origKey = process.env.LIVEKIT_API_KEY;
    const origSecret = process.env.LIVEKIT_API_SECRET;

    try {
      process.env.LIVEKIT_URL = '';
      process.env.LIVEKIT_API_KEY = '';
      process.env.LIVEKIT_API_SECRET = '';

      assert.throws(
        () => new LiveKitAdapter({}),
        (err) => err.message.includes('CONFIGURATION_ERROR')
      );
    } finally {
      if (origUrl !== undefined) process.env.LIVEKIT_URL = origUrl; else delete process.env.LIVEKIT_URL;
      if (origKey !== undefined) process.env.LIVEKIT_API_KEY = origKey; else delete process.env.LIVEKIT_API_KEY;
      if (origSecret !== undefined) process.env.LIVEKIT_API_SECRET = origSecret; else delete process.env.LIVEKIT_API_SECRET;
    }
  });

  await runAsyncTest('LiveKitAdapter generateParticipantToken throws if apiSecret is unset', async () => {
    const adapter = new LiveKitAdapter({
      url: 'wss://test.livekit.cloud',
      apiKey: 'test-api-key',
      apiSecret: 'test-valid-secret'
    });

    adapter.apiSecret = '';

    await assert.rejects(
      async () => {
        await adapter.generateParticipantToken({
          roomId: 'room_123',
          participantId: 'part_456',
          participantName: 'Alice'
        });
      },
      (err) => err.message.includes('CONFIGURATION_ERROR')
    );
  });

  await runAsyncTest('LiveKitAdapter generateParticipantToken produces valid token with configured secret', async () => {
    const adapter = new LiveKitAdapter({
      url: 'wss://test.livekit.cloud',
      apiKey: 'test-api-key',
      apiSecret: 'test-secret-12345'
    });

    const res = await adapter.generateParticipantToken({
      roomId: 'room_123',
      participantId: 'part_456',
      participantName: 'Alice',
      isHost: true,
      role: 'INSTRUCTOR'
    });

    assert(res.token, 'Token must be generated');
    const parts = res.token.split('.');
    assert.strictEqual(parts.length, 3, 'Token must be a valid 3-part JWT');
    assert.strictEqual(res.roomId, 'room_123');
    assert.strictEqual(res.isHost, true);
  });

  // -----------------------------------------------------------------------------
  // Suite 6: Configuration Contract Specification (.env.example)
  // -----------------------------------------------------------------------------
  console.log('\n--- Suite 6: Configuration Contract Specification (.env.example) ---');

  const envExamplePath = path.join(__dirname, '..', '.env.example');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

  runTest('.env.example contains zero occurrences of quarantined project ref in active configs', () => {
    const lines = envExampleContent.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes('=') && !line.startsWith('#')) {
        assert(
          !line.includes('logaawoigfxnisimfatf'),
          `Active config line must not contain quarantined project ref: ${line}`
        );
      }
    }
  });

  runTest('.env.example explicitly distinguishes Staging from Production environment placeholders', () => {
    assert(
      envExampleContent.includes('Staging / Preview Environments: Configured by default with staging project ref \'dwhjoiebzwnjdpcvcwvs\''),
      'Must document Staging default'
    );
    assert(
      envExampleContent.includes('<your-production-ref>'),
      'Must contain production placeholder <your-production-ref>'
    );
  });

  runTest('.env.example documents that example file does NOT configure hosting environment', () => {
    assert(
      envExampleContent.includes('This template file is documentation only'),
      'Must clarify template file is documentation only'
    );
  });

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` PHASE 1A TEST SUMMARY: ${passedTests} PASSED / ${totalTests - passedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('========================================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
})();
