/**
 * scripts/test_gate2_quarantine_and_runner_offline.js
 * 
 * CLASPTEK GATE 2B.2 — OFFLINE QUARANTINE & RUNNER HARDENING VERIFICATION SUITE
 * 
 * Strict Offline Execution:
 * 1. Proves all 6 quarantined production scripts immediately throw fatal safety halt on require.
 * 2. Directly imports and tests the shared staging connection guard (scripts/staging_connection_guard.js).
 * 3. Proves raw and percent-encoded production-reference quarantine enforcement.
 * 4. Proves malformed percent-encoding and malformed URL handling with error sanitization.
 * 5. Proves that importing the reconciliation runner is completely side-effect-free.
 * 6. Zero database connections, zero network requests, zero credential leaks.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Import shared guard under test
const {
  PROD_REF,
  EXPECTED_STAGING_REF,
  APPROVED_PROFILES,
  validateStagingDatabaseUrl,
  createStagingClient,
  redactCredentials,
  safeDecode,
} = require('./staging_connection_guard');

console.log('========================================================================================');
console.log(' CLASPTEK GATE 2B.2 — AUTHORIZED RUNNER HARDENING & OFFLINE TEST HARNESS');
console.log(' Environment: STRICT OFFLINE (Zero Network Connections, Zero Database Access)');
console.log(' Target Staging Ref:', EXPECTED_STAGING_REF);
console.log(' Quarantined Prod Ref:', PROD_REF);
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

// ============================================================================
// PART 1: Quarantined Production Scripts Offline Verification
// ============================================================================
console.log('--- Part 1: Production Script Quarantine Verification ---');

const QUARANTINED_SCRIPTS = [
  'execute_controlled_migration.js',
  'pre_migration_database_health.js',
  'query_tenants_and_memberships.js',
  'verify_phase5_1_production_cutover.js',
  'run_final_production_certification_gate.js',
  'test_live_app_crud_path.js',
];

QUARANTINED_SCRIPTS.forEach((scriptName) => {
  runTest(`Script ${scriptName} throws fatal error immediately upon require`, () => {
    const fullPath = path.join(__dirname, scriptName);
    assert.throws(
      () => {
        require(fullPath);
      },
      (err) => {
        return (
          err instanceof Error &&
          err.message.includes('FATAL SAFETY HALT') &&
          err.message.includes('quarantined production script')
        );
      },
      `Expected ${scriptName} to throw FATAL SAFETY HALT before execution`
    );
  });
});

// ============================================================================
// PART 2: Shared Staging Database Guard Offline Verification
// ============================================================================
console.log('\n--- Part 2: Shared Staging Database Guard Unit & Spy Tests ---');

// 1. Missing or invalid input
runTest('Guard rejects missing, empty, or non-string database URL', () => {
  assert.throws(() => validateStagingDatabaseUrl(''), /missing or empty/);
  assert.throws(() => validateStagingDatabaseUrl('   '), /missing or empty/);
  assert.throws(() => validateStagingDatabaseUrl(null), /missing or empty/);
  assert.throws(() => validateStagingDatabaseUrl(undefined), /missing or empty/);
  assert.throws(() => validateStagingDatabaseUrl(12345), /missing or empty/);
});

// 2. Protocol validation
runTest('Guard rejects invalid or non-PostgreSQL protocols', () => {
  assert.throws(() => validateStagingDatabaseUrl('http://postgres.dwhjoiebzwnjdpcvcwvs:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Invalid database protocol/);
  assert.throws(() => validateStagingDatabaseUrl('https://dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres'), /Invalid database protocol/);
  assert.throws(() => validateStagingDatabaseUrl('mysql://postgres.dwhjoiebzwnjdpcvcwvs:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Invalid database protocol/);
});

// 3. Raw Production Quarantine Enforcement
runTest('Guard rejects raw production reference in host, user, password, path, or query', () => {
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${PROD_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`), /QUARANTINE_VIOLATION/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${PROD_REF}.supabase.co:5432/postgres`), /QUARANTINE_VIOLATION/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:secret_${PROD_REF}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`), /QUARANTINE_VIOLATION/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/${PROD_REF}`), /QUARANTINE_VIOLATION/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres?project=${PROD_REF}`), /QUARANTINE_VIOLATION/);
});

// 4. Percent-Encoded Production Quarantine Enforcement
runTest('Guard rejects percent-encoded production reference in username', () => {
  // 'logaawoigfxnisimfatf' with 'o' encoded as '%6f'
  const encodedUser = 'l%6fgaawoigfxnisimfatf';
  const url = `postgres://${encodedUser}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
});

runTest('Guard rejects percent-encoded production reference in password', () => {
  // 'logaawoigfxnisimfatf' fully or partially encoded in password
  const encodedPass = 'pass_%6c%6f%67%61%61%77%6f%69%67%66%78%6e%69%73%69%6d%66%61%74%66';
  const url = `postgres://postgres:${encodedPass}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
  assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
});

runTest('Guard rejects percent-encoded production reference in database path', () => {
  const encodedPath = '%6cogaawoigfxnisimfatf';
  const url = `postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/${encodedPath}`;
  assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
});

runTest('Guard rejects percent-encoded production reference in query search string', () => {
  const encodedQuery = 'tenant=l%6fgaawoigfxnisimfatf';
  const url = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?${encodedQuery}`;
  assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
});

// 5. Malformed Percent-Encoding & Malformed URL Handling
runTest('Guard safely rejects malformed percent-encoding without echoing raw credentials', () => {
  const badEncodingUser = 'postgres://user%ZZ:pass@db.dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres';
  try {
    validateStagingDatabaseUrl(badEncodingUser);
    assert.fail('Expected validation error for malformed percent-encoding');
  } catch (err) {
    assert(err.message.includes('Malformed percent-encoding'), `Unexpected message: ${err.message}`);
    assert(!err.message.includes('user%ZZ'), 'Error must not echo malformed input');
  }

  const badEncodingPass = 'postgres://postgres:pass%E0%A4@db.dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres';
  try {
    validateStagingDatabaseUrl(badEncodingPass);
    assert.fail('Expected validation error for malformed percent-encoding');
  } catch (err) {
    assert(err.message.includes('Malformed percent-encoding'), `Unexpected message: ${err.message}`);
    assert(!err.message.includes('pass%E0%A4'), 'Error must not echo password');
  }
});

runTest('Guard safely rejects malformed URL syntax without echoing raw input', () => {
  const syntheticPass = 'SyntheticUltraSecretPassword987';
  const malformedUrl = `not_a_valid_url://${syntheticPass}@something`;
  try {
    validateStagingDatabaseUrl(malformedUrl);
    assert.fail('Expected validation error for malformed URL');
  } catch (err) {
    assert(err.message.includes('Malformed STAGING_DATABASE_URL syntax'), `Unexpected message: ${err.message}`);
    assert(!err.message.includes(syntheticPass), 'Error must not leak synthetic password');
    assert(!err.message.includes(malformedUrl), 'Error must not leak full raw URL');
  }
});

// 6. Sanitized Error Messages That Do Not Echo Usernames or Passwords
runTest('Guard error messages do not echo supplied invalid usernames or passwords', () => {
  const syntheticUser = 'SyntheticSensitiveUser456';
  const syntheticPass = 'SyntheticSensitivePass789';
  const invalidPoolerUrl = `postgres://${syntheticUser}:${syntheticPass}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  try {
    validateStagingDatabaseUrl(invalidPoolerUrl);
    assert.fail('Expected validation error for invalid pooler username');
  } catch (err) {
    assert(!err.message.includes(syntheticUser), 'Error message must NOT echo supplied username');
    assert(!err.message.includes(syntheticPass), 'Error message must NOT echo supplied password');
    assert(!err.message.includes(invalidPoolerUrl), 'Error message must NOT echo raw URL');
  }
});

// 7. Exact accepted staging host/profile combinations
runTest('Guard accepts exact staging direct connection profile', () => {
  const directUrl = `postgres://postgres:CorrectPassword123@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
  const config = validateStagingDatabaseUrl(directUrl);
  assert.strictEqual(config.host, `db.${EXPECTED_STAGING_REF}.supabase.co`);
  assert.strictEqual(config.port, 5432);
  assert.strictEqual(config.user, 'postgres');
  assert.strictEqual(config.database, 'postgres');
  assert.strictEqual(config.password, 'CorrectPassword123');
  assert.strictEqual(config.ssl.rejectUnauthorized, true);
  assert.strictEqual(config.ssl.servername, `db.${EXPECTED_STAGING_REF}.supabase.co`);
  assert.strictEqual(config.connectionTimeoutMillis, 10000);
});

runTest('Guard accepts exact staging direct connection with default port', () => {
  const directUrl = `postgres://postgres:CorrectPassword123@db.${EXPECTED_STAGING_REF}.supabase.co/postgres`;
  const config = validateStagingDatabaseUrl(directUrl);
  assert.strictEqual(config.port, 5432);
});

runTest('Guard accepts exact staging pooler profile (Session mode port 5432)', () => {
  const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  const config = validateStagingDatabaseUrl(poolerUrl);
  assert.strictEqual(config.host, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.strictEqual(config.port, 5432);
  assert.strictEqual(config.user, `postgres.${EXPECTED_STAGING_REF}`);
  assert.strictEqual(config.database, 'postgres');
  assert.strictEqual(config.ssl.rejectUnauthorized, true);
  assert.strictEqual(config.ssl.servername, 'aws-0-eu-central-1.pooler.supabase.com');
});

runTest('Guard accepts exact staging pooler profile (Transaction mode port 6543)', () => {
  const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:TxnPass123@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const config = validateStagingDatabaseUrl(poolerUrl);
  assert.strictEqual(config.host, 'aws-0-eu-west-1.pooler.supabase.com');
  assert.strictEqual(config.port, 6543);
  assert.strictEqual(config.user, `postgres.${EXPECTED_STAGING_REF}`);
});

// 8. Spoofed hosts and unapproved domains
runTest('Guard rejects spoofed hostname containing staging project ref', () => {
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@db.${EXPECTED_STAGING_REF}.attacker.com:5432/postgres`), /Unapproved host/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com.evil.org:5432/postgres`), /Unapproved host/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@evil-pooler.supabase.com:5432/postgres`), /Unapproved host/);
});

// 9. Unexpected ports
runTest('Guard rejects unexpected ports for direct and pooler profiles', () => {
  // Direct requires 5432
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:6543/postgres`), /Direct connection host requires port 5432/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5433/postgres`), /Direct connection host requires port 5432/);
  // Pooler requires 5432 or 6543
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5433/postgres`), /Pooler connection requires port 5432/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:3306/postgres`), /Pooler connection requires port 5432/);
});

// 10. Username validation & pooler semantics
runTest('Guard rejects generic postgres username on pooler host', () => {
  assert.throws(() => validateStagingDatabaseUrl('postgres://postgres:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Pooler connection requires exact username/);
});

runTest('Guard rejects service_role username on connection pooler', () => {
  assert.throws(() => validateStagingDatabaseUrl(`postgres://service_role.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`), /service_role' is an HTTP JWT role/);
});

// 11. Database name validation
runTest('Guard rejects database names other than postgres', () => {
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/custom_db`), /Expected database name 'postgres'/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/`), /Expected database name 'postgres'/);
});

// 12. URL encoded credentials & safe redaction
runTest('Guard decodes URL-encoded credentials and redacts passwords in errors', () => {
  const specialPassword = 'P%40ss%23%21%24%25%5E%26'; // P@ss#!$%^&
  const url = `postgres://postgres:${specialPassword}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
  const config = validateStagingDatabaseUrl(url);
  assert.strictEqual(config.password, 'P@ss#!$%^&');

  // Verify redaction helper
  const rawLeak = 'Connection failed: postgres://user:super_secret_password@evil.com:5432/db';
  const redacted = redactCredentials(rawLeak);
  assert(!redacted.includes('super_secret_password'), 'Password must be redacted');
  assert(redacted.includes('***'), 'Redaction placeholder must be present');
});

// 13. Disallowed SSL query parameters
runTest('Guard rejects SSL downgrade query parameters', () => {
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=disable`), /Insecure or conflicting sslmode/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify`), /Insecure or conflicting sslmode/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=prefer`), /Insecure or conflicting sslmode/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?ssl=false`), /Insecure ssl parameter/);
  assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslrootcert=/etc/evil.crt`), /Disallowed SSL parameter/);
});

runTest('Guard accepts valid sslmode query parameters (require and verify-full)', () => {
  const url1 = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;
  const url2 = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  assert.doesNotThrow(() => validateStagingDatabaseUrl(url1));
  assert.doesNotThrow(() => validateStagingDatabaseUrl(url2));
});

// 14. Discrete client options & client factory spy tests
runTest('Client factory spy receives discrete options and strict TLS (never raw connectionString)', () => {
  let spyReceivedOptions = null;
  const spyFactory = (options) => {
    spyReceivedOptions = options;
    return { mockClient: true };
  };

  const validUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:TestPassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  const validatedConfig = validateStagingDatabaseUrl(validUrl);
  const client = createStagingClient(validatedConfig, spyFactory);

  assert.strictEqual(client.mockClient, true);
  assert.strictEqual(spyReceivedOptions.connectionString, undefined, 'raw connectionString must NOT be present in discrete options');
  assert.strictEqual(spyReceivedOptions.host, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.strictEqual(spyReceivedOptions.port, 5432);
  assert.strictEqual(spyReceivedOptions.user, `postgres.${EXPECTED_STAGING_REF}`);
  assert.strictEqual(spyReceivedOptions.database, 'postgres');
  assert.strictEqual(spyReceivedOptions.password, 'TestPassword');
  assert.strictEqual(spyReceivedOptions.ssl.rejectUnauthorized, true);
  assert.strictEqual(spyReceivedOptions.ssl.servername, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.strictEqual(spyReceivedOptions.connectionTimeoutMillis, 10000);
  assert.strictEqual(spyReceivedOptions.statement_timeout, 10000);
  assert.strictEqual(spyReceivedOptions.query_timeout, 10000);
});

runTest('Client factory spy is NEVER invoked when URL validation fails', () => {
  let spyCalled = false;
  const spyFactory = () => { spyCalled = true; };

  try {
    const invalidConfig = validateStagingDatabaseUrl('postgres://attacker:pass@evil.attacker.com:5432/postgres');
    createStagingClient(invalidConfig, spyFactory);
  } catch (_) {
    // Expected validation error
  }

  assert.strictEqual(spyCalled, false, 'Client factory spy must not be called when validation fails');
});

runTest('Client factory refuses configuration with disabled TLS or raw connectionString', () => {
  assert.throws(() => {
    createStagingClient({ host: 'localhost', ssl: { rejectUnauthorized: false } }, () => {});
  }, /SECURITY_ERROR/);

  assert.throws(() => {
    createStagingClient({ connectionString: 'postgres://localhost/db', ssl: { rejectUnauthorized: true } }, () => {});
  }, /SECURITY_ERROR/);
});

// ============================================================================
// PART 3: Verify Both Live Runners Integrate the Shared Validator
// ============================================================================
console.log('\n--- Part 3: Live Runner Integration & Import Safety Verification ---');

runTest('Runner inspect_staging_reconciliation_cursor_schema.js requires shared guard and no excluded modules', () => {
  const runnerPath = path.join(__dirname, 'inspect_staging_reconciliation_cursor_schema.js');
  const content = fs.readFileSync(runnerPath, 'utf8');
  assert(content.includes("require('./staging_connection_guard')"), 'Runner must require staging_connection_guard');
  assert(content.includes('validateStagingDatabaseUrl'), 'Runner must invoke validateStagingDatabaseUrl');
  assert(content.includes('createStagingClient'), 'Runner must invoke createStagingClient');
  assert(content.includes('redactCredentials'), 'Runner must import redactCredentials');
  assert(content.includes('require.main === module'), 'Runner must guard top-level execution with require.main === module');
  assert(!content.includes('test_staging_supabase_certification'), 'Runner must NOT reference test_staging_supabase_certification');
  assert(!content.includes('rejectUnauthorized: false'), 'Runner must NOT contain rejectUnauthorized: false');
});

runTest('Importing reconciliation runner is completely side-effect-free (no execution, no DB access)', () => {
  // Dynamically require the runner module in this test process.
  // Because it is guarded by `if (require.main === module)`, requiring it must NOT execute
  // inspectStagingSchema(), must NOT connect to any database, and must export inspectStagingSchema.
  const runner = require('./inspect_staging_reconciliation_cursor_schema');
  assert.strictEqual(typeof runner.inspectStagingSchema, 'function', 'Runner must export inspectStagingSchema as a function');
  assert.strictEqual(typeof runner.loadStagingDatabaseUrl, 'function', 'Runner must export loadStagingDatabaseUrl as a function');
});

runTest('Reconciliation runner dynamically does NOT import test_staging_supabase_certification or any excluded file', () => {
  const excludedModulePath = path.resolve(__dirname, 'test_staging_supabase_certification.js');
  const runnerModulePath = path.resolve(__dirname, 'inspect_staging_reconciliation_cursor_schema.js');

  delete require.cache[runnerModulePath];
  const originalCacheEntry = require.cache[excludedModulePath];
  let interceptedExcludedRequire = false;

  require.cache[excludedModulePath] = {
    id: excludedModulePath,
    filename: excludedModulePath,
    loaded: true,
    exports: new Proxy({}, {
      get: (_target, prop) => {
        interceptedExcludedRequire = true;
        throw new Error(`ILLEGAL_EXCLUDED_IMPORT: Attempted to access property '${String(prop)}' on excluded module test_staging_supabase_certification`);
      }
    })
  };

  try {
    const runner = require('./inspect_staging_reconciliation_cursor_schema');
    assert.strictEqual(typeof runner.inspectStagingSchema, 'function');
    assert.strictEqual(typeof runner.loadStagingDatabaseUrl, 'function');
    assert.strictEqual(interceptedExcludedRequire, false, 'Reconciliation runner must not import test_staging_supabase_certification');
  } finally {
    if (originalCacheEntry) {
      require.cache[excludedModulePath] = originalCacheEntry;
    } else {
      delete require.cache[excludedModulePath];
    }
  }
});

runTest('Reconciliation runner local loadStagingDatabaseUrl respects environment variable precedence', () => {
  const runner = require('./inspect_staging_reconciliation_cursor_schema');
  const originalEnv = process.env.STAGING_DATABASE_URL;
  try {
    process.env.STAGING_DATABASE_URL = 'postgres://postgres:CustomEnvPassword@db.dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres';
    const loaded = runner.loadStagingDatabaseUrl();
    assert.strictEqual(loaded, 'postgres://postgres:CustomEnvPassword@db.dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres');
  } finally {
    if (originalEnv !== undefined) {
      process.env.STAGING_DATABASE_URL = originalEnv;
    } else {
      delete process.env.STAGING_DATABASE_URL;
    }
  }
});

runTest('Runner test_staging_supabase_certification.js requires shared guard', () => {
  const runnerPath = path.join(__dirname, 'test_staging_supabase_certification.js');
  const content = fs.readFileSync(runnerPath, 'utf8');
  assert(content.includes("require('./staging_connection_guard')"), 'Runner must require staging_connection_guard');
  assert(content.includes('validateStagingDatabaseUrl'), 'Runner must invoke validateStagingDatabaseUrl');
  assert(!content.includes('dbHost.includes(extractedRef) || dbUser.includes(extractedRef)'), 'Runner must NOT use loose substring check');
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n========================================================================================');
console.log(` GATE 2B.2 OFFLINE TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
console.log('========================================================================================\n');

if (failed > 0) {
  process.exit(1);
}
