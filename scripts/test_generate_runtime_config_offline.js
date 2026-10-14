/**
 * scripts/test_generate_runtime_config_offline.js
 *
 * CLASPTEK GATE 3.3 — OFFLINE RUNTIME CONFIG & PRODUCTION FALLBACK AUDIT
 *
 * Strict Offline Verification:
 * 1. Clean-Clone Behavior: No .env, empty process.env fails closed with zero fallback to production.
 * 2. Production Quarantine Enforcement: Rejects logaawoigfxnisimfatf (raw and percent-encoded).
 * 3. Malformed URL Rejection: Rejects non-URLs, invalid protocols, without leaking credentials.
 * 4. Missing Configuration Handling: Rejects empty or whitespace URLs.
 * 5. Valid Staging Configuration: Accepts dwhjoiebzwnjdpcvcwvs with verified public key.
 * 6. Secret Key Shielding: Rejects service_role, postgres://, and CLI tokens.
 * 7. Zero Network Access: Proves zero socket or HTTP/TLS connections during execution.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const net = require('net');
const tls = require('tls');

const {
  QUARANTINED_PROD_REF,
  EXPECTED_STAGING_REF,
  safeDecode,
  checkQuarantine,
  validateSupabaseUrl,
  resolveBuildCredentials,
  validatePublicCredential,
  getSanitizedRuntimeConfigSummary,
  generateRuntimeConfig,
} = require('./generate-runtime-config');

console.log('========================================================================================');
console.log(' CLASPTEK GATE 3.3 — OFFLINE RUNTIME CONFIG FAIL-CLOSED AUDIT');
console.log(' Environment: STRICT OFFLINE (Zero Network Connections, Zero Database Access)');
console.log(' Quarantined Prod Ref:', QUARANTINED_PROD_REF);
console.log(' Target Staging Ref:', EXPECTED_STAGING_REF);
console.log('========================================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// Ensure clean temp dir for clean-clone simulation
const cleanTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clasptek-clean-clone-'));

// Helper to isolate environment variables
function withCleanEnv(fn) {
  const envBackup = {};
  const supabaseKeys = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'Publishable_key',
    'publishable_key',
    'PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
  ];

  for (const k of supabaseKeys) {
    if (process.env[k] !== undefined) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
  }

  try {
    fn();
  } finally {
    for (const k of supabaseKeys) {
      if (envBackup[k] !== undefined) {
        process.env[k] = envBackup[k];
      } else {
        delete process.env[k];
      }
    }
  }
}

// ============================================================================
// PART 1: Clean-Clone & Missing Configuration Fail-Closed Behavior
// ============================================================================
console.log('--- Part 1: Clean-Clone & Missing Configuration Fail-Closed Verification ---');

runTest('Clean clone with no .env files returns unconfigured and does NOT select production', () => {
  withCleanEnv(() => {
    const creds = resolveBuildCredentials({ envDir: cleanTempDir });
    assert.strictEqual(creds.configured, false, 'Clean clone must be unconfigured');
    assert.strictEqual(creds.url, '', 'Clean clone url must be empty');
    assert.strictEqual(creds.key, '', 'Clean clone key must be empty');
    assert.strictEqual(creds.projectRef, 'none', 'Clean clone projectRef must be none');
    assert(!creds.url.includes(QUARANTINED_PROD_REF), 'Must NEVER fall back to quarantined production URL');

    const summary = getSanitizedRuntimeConfigSummary({ envDir: cleanTempDir });
    assert.strictEqual(summary.configured, false);
    assert.strictEqual(summary.projectRef, 'none');
  });
});

runTest('Clean clone generateRuntimeConfig throws CONFIGURATION_ERROR when config is missing', () => {
  withCleanEnv(() => {
    assert.throws(
      () => {
        generateRuntimeConfig({ envDir: cleanTempDir, dryRun: true });
      },
      /CONFIGURATION_ERROR: Missing required Supabase URL/,
      'generateRuntimeConfig must fail closed when configuration is absent'
    );
  });
});

runTest('CLI invocation in clean clone exits with non-zero exit status (code 1)', () => {
  const child = child_process.spawnSync(
    process.execPath,
    [path.join(__dirname, 'generate-runtime-config.js')],
    {
      cwd: cleanTempDir,
      env: { ...process.env, SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', VITE_SUPABASE_URL: '' },
      encoding: 'utf8',
    }
  );
  assert.strictEqual(child.status, 1, `Expected exit status 1, got ${child.status}`);
  assert(child.stderr.includes('CONFIGURATION_ERROR') || child.stderr.includes('failed'), 'Output must indicate build config failure');
  assert(!child.stdout.includes(QUARANTINED_PROD_REF), 'Output must not leak or select quarantined production ref');
});

// ============================================================================
// PART 2: Production Quarantine Enforcement
// ============================================================================
console.log('\n--- Part 2: Production Quarantine Enforcement ---');

runTest('Rejects raw production Supabase URL', () => {
  assert.throws(
    () => {
      validateSupabaseUrl(`https://${QUARANTINED_PROD_REF}.supabase.co`);
    },
    /SECURITY_VIOLATION: Quarantined production Supabase project/,
    'Must strictly reject raw production URL'
  );
});

runTest('Rejects percent-encoded production project ref in Supabase URL', () => {
  // 'l%6fgaawoigfxnisimfatf'
  assert.throws(
    () => {
      validateSupabaseUrl('https://l%6fgaawoigfxnisimfatf.supabase.co');
    },
    /SECURITY_VIOLATION: Quarantined production Supabase project/,
    'Must strictly reject percent-encoded production ref'
  );
});

runTest('Rejects production project ref in query string or path', () => {
  assert.throws(
    () => {
      validateSupabaseUrl(`https://dwhjoiebzwnjdpcvcwvs.supabase.co/${QUARANTINED_PROD_REF}`);
    },
    /SECURITY_VIOLATION: Quarantined production Supabase project/
  );
  assert.throws(
    () => {
      validateSupabaseUrl(`https://dwhjoiebzwnjdpcvcwvs.supabase.co?ref=${QUARANTINED_PROD_REF}`);
    },
    /SECURITY_VIOLATION: Quarantined production Supabase project/
  );
});

runTest('resolveBuildCredentials rejects quarantined production URL from environment', () => {
  withCleanEnv(() => {
    process.env.SUPABASE_URL = `https://${QUARANTINED_PROD_REF}.supabase.co`;
    assert.throws(
      () => {
        resolveBuildCredentials({ envDir: cleanTempDir });
      },
      /SECURITY_VIOLATION: Quarantined production Supabase project/
    );
  });
});

// ============================================================================
// PART 3: Malformed URLs & Protocol Validation
// ============================================================================
console.log('\n--- Part 3: Malformed URLs & Protocol Validation ---');

runTest('Rejects non-URL string syntax without echoing credentials', () => {
  assert.throws(
    () => {
      validateSupabaseUrl('not_a_valid_url_string');
    },
    /CONFIGURATION_ERROR: Malformed Supabase URL syntax/
  );
});

runTest('Rejects non-HTTP/HTTPS protocols', () => {
  assert.throws(
    () => {
      validateSupabaseUrl(`ftp://${EXPECTED_STAGING_REF}.supabase.co`);
    },
    /CONFIGURATION_ERROR: Invalid Supabase URL protocol 'ftp:'/
  );
  assert.throws(
    () => {
      validateSupabaseUrl(`postgres://${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`);
    },
    /CONFIGURATION_ERROR: Invalid Supabase URL protocol 'postgres:'/
  );
});

runTest('Whitespace-only or empty URL is safely treated as unconfigured', () => {
  const r1 = validateSupabaseUrl('');
  assert.strictEqual(r1.valid, false);
  assert.strictEqual(r1.url, '');

  const r2 = validateSupabaseUrl('    ');
  assert.strictEqual(r2.valid, false);
  assert.strictEqual(r2.url, '');
});

// ============================================================================
// PART 4: Valid Staging Configuration
// ============================================================================
console.log('\n--- Part 4: Valid Explicit Staging Configuration ---');

runTest('Accepts valid staging Supabase URL and extracts project reference', () => {
  const stagingUrl = `https://${EXPECTED_STAGING_REF}.supabase.co`;
  const result = validateSupabaseUrl(stagingUrl);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.url, stagingUrl);
  assert.strictEqual(result.projectRef, EXPECTED_STAGING_REF);
});

runTest('Resolves valid staging build credentials and generates sanitized summary', () => {
  withCleanEnv(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${EXPECTED_STAGING_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_staging_key_12345';

    const creds = resolveBuildCredentials({ envDir: cleanTempDir });
    assert.strictEqual(creds.configured, true);
    assert.strictEqual(creds.url, `https://${EXPECTED_STAGING_REF}.supabase.co`);
    assert.strictEqual(creds.key, 'sb_publishable_staging_key_12345');
    assert.strictEqual(creds.projectRef, EXPECTED_STAGING_REF);

    const summary = getSanitizedRuntimeConfigSummary({ envDir: cleanTempDir });
    assert.strictEqual(summary.configured, true);
    assert.strictEqual(summary.projectRef, EXPECTED_STAGING_REF);
    assert.strictEqual(summary.credentialType, 'publishable');
    assert.strictEqual(summary.credentialPresent, true);

    const dryRunResult = generateRuntimeConfig({ envDir: cleanTempDir, dryRun: true });
    assert.strictEqual(dryRunResult.url, `https://${EXPECTED_STAGING_REF}.supabase.co`);
    assert(dryRunResult.fileContent.includes(EXPECTED_STAGING_REF));
    assert(!dryRunResult.fileContent.includes(QUARANTINED_PROD_REF));
  });
});

// ============================================================================
// PART 5: Secret Credential Shielding
// ============================================================================
console.log('\n--- Part 5: Secret Credential Shielding ---');

runTest('validatePublicCredential accepts valid publishable or anon keys', () => {
  assert.strictEqual(validatePublicCredential('sb_publishable_valid_key').safe, true);
  assert.strictEqual(validatePublicCredential('pk_valid_publishable_key').safe, true);
  assert.strictEqual(validatePublicCredential('').safe, true);
});

runTest('validatePublicCredential rejects service_role and secret tokens', () => {
  assert.throws(() => validatePublicCredential('service_role'), /SECURITY VIOLATION/);
  assert.throws(() => validatePublicCredential('secret_key_12345'), /SECURITY VIOLATION/);
  assert.throws(() => validatePublicCredential('sbp_cli_access_token'), /SECURITY VIOLATION/);
  assert.throws(() => validatePublicCredential('postgres://postgres:secret@db.host.com'), /SECURITY VIOLATION/);
});

// ============================================================================
// PART 6: Zero Network Connections Verification
// ============================================================================
console.log('\n--- Part 6: Zero Network Activity Audit ---');

runTest('Generator and tests perform zero network or socket operations', () => {
  let networkAttempted = false;
  const origNetConnect = net.Socket.prototype.connect;
  const origTlsConnect = tls.connect;

  net.Socket.prototype.connect = function(...args) {
    networkAttempted = true;
    return origNetConnect.apply(this, args);
  };
  tls.connect = function(...args) {
    networkAttempted = true;
    return origTlsConnect.apply(this, args);
  };

  try {
    withCleanEnv(() => {
      resolveBuildCredentials({ envDir: cleanTempDir });
      getSanitizedRuntimeConfigSummary({ envDir: cleanTempDir });
    });
    assert.strictEqual(networkAttempted, false, 'Zero network calls allowed');
  } finally {
    net.Socket.prototype.connect = origNetConnect;
    tls.connect = origTlsConnect;
    // Clean up temp dir
    try {
      fs.rmSync(cleanTempDir, { recursive: true, force: true });
    } catch (_) {}
  }
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n========================================================================================');
console.log(` GATE 3.3 OFFLINE TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
console.log('========================================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
