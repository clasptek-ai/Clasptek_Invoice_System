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
const child_process = require('child_process');
const net = require('net');
const tls = require('tls');

// Import shared guard under test
const {
  PROD_REF,
  EXPECTED_STAGING_REF,
  APPROVED_PROFILES,
  APPROVED_TIMEOUT_PROFILES,
  TIMEOUT_BOUNDS,
  validateStagingDatabaseUrl,
  createStagingClient,
  validatePemCertificate,
  resolveTimeoutConfig,
  redactCredentials,
  safeDecode,
} = require('./staging_connection_guard');

// Import inspector under test
const {
  inspectStagingSchema,
  loadStagingDatabaseUrl,
  evaluateCertificationAssertions,
  normalizeSearchPath,
  isExactZeroDefault,
  isExactNowDefault,
  validateOffsetCheckSemantics,
} = require('./inspect_staging_reconciliation_cursor_schema');

console.log('========================================================================================');
console.log(' CLASPTEK GATE 2B.2 — AUTHORIZED RUNNER HARDENING & OFFLINE TEST HARNESS');
console.log(' Environment: STRICT OFFLINE (Zero Network Connections, Zero Database Access)');
console.log(' Target Staging Ref:', EXPECTED_STAGING_REF);
console.log(' Quarantined Prod Ref:', PROD_REF);
console.log('========================================================================================\n');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTestSuite() {
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

  for (const scriptName of QUARANTINED_SCRIPTS) {
    await runTest(`Script ${scriptName} throws fatal error immediately upon require`, () => {
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
  }

  // ============================================================================
  // PART 2: Shared Staging Database Guard Offline Verification
  // ============================================================================
  console.log('\n--- Part 2: Shared Staging Database Guard Unit & Spy Tests ---');

  // 1. Missing or invalid input
  await runTest('Guard rejects missing, empty, or non-string database URL', () => {
    assert.throws(() => validateStagingDatabaseUrl(''), /missing or empty/);
    assert.throws(() => validateStagingDatabaseUrl('   '), /missing or empty/);
    assert.throws(() => validateStagingDatabaseUrl(null), /missing or empty/);
    assert.throws(() => validateStagingDatabaseUrl(undefined), /missing or empty/);
    assert.throws(() => validateStagingDatabaseUrl(12345), /missing or empty/);
  });

  // 2. Protocol validation
  await runTest('Guard rejects invalid or non-PostgreSQL protocols', () => {
    assert.throws(() => validateStagingDatabaseUrl('http://postgres.dwhjoiebzwnjdpcvcwvs:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Invalid database protocol/);
    assert.throws(() => validateStagingDatabaseUrl('https://dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres'), /Invalid database protocol/);
    assert.throws(() => validateStagingDatabaseUrl('mysql://postgres.dwhjoiebzwnjdpcvcwvs:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Invalid database protocol/);
  });

  // 3. Raw Production Quarantine Enforcement
  await runTest('Guard rejects raw production reference in host, user, password, path, or query', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${PROD_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`), /QUARANTINE_VIOLATION/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${PROD_REF}.supabase.co:5432/postgres`), /QUARANTINE_VIOLATION/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:secret_${PROD_REF}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`), /QUARANTINE_VIOLATION/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/${PROD_REF}`), /QUARANTINE_VIOLATION/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres?project=${PROD_REF}`), /QUARANTINE_VIOLATION/);
  });

  // 4. Percent-Encoded Production Quarantine Enforcement
  await runTest('Guard rejects percent-encoded production reference in username', () => {
    const encodedUser = 'l%6fgaawoigfxnisimfatf';
    const url = `postgres://${encodedUser}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
  });

  await runTest('Guard rejects percent-encoded production reference in password', () => {
    const encodedPass = 'pass_%6c%6f%67%61%61%77%6f%69%67%66%78%6e%69%73%69%6d%66%61%74%66';
    const url = `postgres://postgres:${encodedPass}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
    assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
  });

  await runTest('Guard rejects percent-encoded production reference in database path', () => {
    const encodedPath = '%6cogaawoigfxnisimfatf';
    const url = `postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/${encodedPath}`;
    assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
  });

  await runTest('Guard rejects percent-encoded production reference in query search string', () => {
    const encodedQuery = 'tenant=l%6fgaawoigfxnisimfatf';
    const url = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?${encodedQuery}`;
    assert.throws(() => validateStagingDatabaseUrl(url), /QUARANTINE_VIOLATION/);
  });

  // 5. Malformed Percent-Encoding & Malformed URL Handling
  await runTest('Guard safely rejects malformed percent-encoding without echoing raw credentials', () => {
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

  await runTest('Guard safely rejects malformed URL syntax without echoing raw input', () => {
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
  await runTest('Guard error messages do not echo supplied invalid usernames or passwords', () => {
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
  await runTest('Guard accepts exact staging direct connection profile', () => {
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

  await runTest('Guard accepts exact staging direct connection with default port', () => {
    const directUrl = `postgres://postgres:CorrectPassword123@db.${EXPECTED_STAGING_REF}.supabase.co/postgres`;
    const config = validateStagingDatabaseUrl(directUrl);
    assert.strictEqual(config.port, 5432);
  });

  await runTest('Guard accepts exact staging pooler profile (Session mode port 5432)', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl);
    assert.strictEqual(config.host, 'aws-0-eu-central-1.pooler.supabase.com');
    assert.strictEqual(config.port, 5432);
    assert.strictEqual(config.user, `postgres.${EXPECTED_STAGING_REF}`);
    assert.strictEqual(config.database, 'postgres');
    assert.strictEqual(config.ssl.rejectUnauthorized, true);
    assert.strictEqual(config.ssl.servername, 'aws-0-eu-central-1.pooler.supabase.com');
  });

  await runTest('Guard accepts exact staging pooler profile (Transaction mode port 6543)', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:TxnPass123@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl);
    assert.strictEqual(config.host, 'aws-0-eu-west-1.pooler.supabase.com');
    assert.strictEqual(config.port, 6543);
    assert.strictEqual(config.user, `postgres.${EXPECTED_STAGING_REF}`);
  });

  // 8. Spoofed hosts and unapproved domains
  await runTest('Guard rejects spoofed hostname containing staging project ref', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@db.${EXPECTED_STAGING_REF}.attacker.com:5432/postgres`), /Unapproved host/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com.evil.org:5432/postgres`), /Unapproved host/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@evil-pooler.supabase.com:5432/postgres`), /Unapproved host/);
  });

  // 9. Unexpected ports
  await runTest('Guard rejects unexpected ports for direct and pooler profiles', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:6543/postgres`), /Direct connection host requires port 5432/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5433/postgres`), /Direct connection host requires port 5432/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5433/postgres`), /Pooler connection requires port 5432/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:3306/postgres`), /Pooler connection requires port 5432/);
  });

  // 10. Username validation & pooler semantics
  await runTest('Guard rejects generic postgres username on pooler host', () => {
    assert.throws(() => validateStagingDatabaseUrl('postgres://postgres:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'), /Pooler connection requires exact username/);
  });

  await runTest('Guard rejects service_role username on connection pooler', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://service_role.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`), /service_role' is an HTTP JWT role/);
  });

  // 11. Database name validation
  await runTest('Guard rejects database names other than postgres', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/custom_db`), /Expected database name 'postgres'/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres:pass@db.${EXPECTED_STAGING_REF}.supabase.co:5432/`), /Expected database name 'postgres'/);
  });

  // 12. URL encoded credentials & safe redaction
  await runTest('Guard decodes URL-encoded credentials and redacts passwords in errors', () => {
    const specialPassword = 'P%40ss%23%21%24%25%5E%26'; // P@ss#!$%^&
    const url = `postgres://postgres:${specialPassword}@db.${EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
    const config = validateStagingDatabaseUrl(url);
    assert.strictEqual(config.password, 'P@ss#!$%^&');

    const rawLeak = 'Connection failed: postgres://user:super_secret_password@evil.com:5432/db';
    const redacted = redactCredentials(rawLeak);
    assert(!redacted.includes('super_secret_password'), 'Password must be redacted');
    assert(redacted.includes('***'), 'Redaction placeholder must be present');
  });

  // 13. Disallowed SSL query parameters
  await runTest('Guard rejects SSL downgrade query parameters', () => {
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=disable`), /Insecure or conflicting sslmode/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify`), /Insecure or conflicting sslmode/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=prefer`), /Insecure or conflicting sslmode/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?ssl=false`), /Insecure ssl parameter/);
    assert.throws(() => validateStagingDatabaseUrl(`postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslrootcert=/etc/evil.crt`), /Disallowed SSL parameter/);
  });

  await runTest('Guard accepts valid sslmode query parameters (require and verify-full)', () => {
    const url1 = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;
    const url2 = `postgres://postgres.${EXPECTED_STAGING_REF}:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
    assert.doesNotThrow(() => validateStagingDatabaseUrl(url1));
    assert.doesNotThrow(() => validateStagingDatabaseUrl(url2));
  });

  // 14. Discrete client options & client factory spy tests
  await runTest('Client factory spy receives discrete options and strict TLS (never raw connectionString)', () => {
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

  await runTest('Client factory spy is NEVER invoked when URL validation fails', () => {
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

  await runTest('Client factory refuses configuration with disabled TLS or raw connectionString', () => {
    assert.throws(() => {
      createStagingClient({ host: 'localhost', ssl: { rejectUnauthorized: false } }, () => {});
    }, /SECURITY_ERROR/);

    assert.throws(() => {
      createStagingClient({ connectionString: 'postgres://localhost/db', ssl: { rejectUnauthorized: true } }, () => {});
    }, /SECURITY_ERROR/);
  });

  // ============================================================================
  // PART 2b: Strict TLS CA Configuration & Bounded Timeout Profiles (Phase 2AI-C58)
  // ============================================================================
  console.log('\n--- Part 2b: Strict TLS CA & Bounded Timeout Profile Verification (C58) ---');

  const validSyntheticPem = [
    '-----BEGIN CERTIFICATE-----',
    'MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQsFADBaMQswCQYDVQQGEwJV',
    'UzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzER',
    'MA8GA1UEChMIU3VwYWJhc2UxEDAOBgNVBAMTB1Jvb3RDQTAeFw0yMTAxMDEwMDAw',
    'MDBaFw0zMTAxMDEwMDAwMDBaMFoxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxp',
    'Zm9ybmlhMRYwFAYDVQQHEw1TYW4gRnJhbmNpc2NvMREwDwYDVQQKEwhTdXBhYmFz',
    'ZTEQMA4GA1UEAxMHUm9vdENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC',
    'AQEA0pT0z9g5f5o8a4s3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1',
    'f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9',
    'b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7',
    'd6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5',
    'f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3',
    'b2c1d0e9wIDAQABo0IwQDAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIB',
    'BjAdBgNVHQ4EFgQU0pT0z9g5f5o8a4s3b2c1d0e9f8AwDQYJKoZIhvcNAQELBQAD',
    'ggEBACd5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
    'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
    '-----END CERTIFICATE-----',
  ].join('\n');

  // 1. PEM certificate parsing and validation
  await runTest('CA Validator accepts valid PEM certificate string and Buffer', () => {
    const resStr = validatePemCertificate(validSyntheticPem);
    assert.strictEqual(resStr, validSyntheticPem.trim());

    const resBuf = validatePemCertificate(Buffer.from(validSyntheticPem));
    assert.strictEqual(resBuf, validSyntheticPem.trim());
  });

  await runTest('CA Validator returns null when CA is undefined or null', () => {
    assert.strictEqual(validatePemCertificate(undefined), null);
    assert.strictEqual(validatePemCertificate(null), null);
  });

  await runTest('CA Validator rejects malformed CA formats, empty strings, and non-PEM inputs', () => {
    assert.throws(() => validatePemCertificate(''), /CONFIG_ERROR.*empty/);
    assert.throws(() => validatePemCertificate('   '), /CONFIG_ERROR.*empty/);
    assert.throws(() => validatePemCertificate(12345), /CONFIG_ERROR.*string or Buffer/);
    assert.throws(() => validatePemCertificate({ cert: 'data' }), /CONFIG_ERROR.*string or Buffer/);
    assert.throws(() => validatePemCertificate('not_a_certificate'), /CONFIG_ERROR.*Malformed CA certificate format/);
    assert.throws(() => validatePemCertificate('-----BEGIN CERTIFICATE-----\ncorrupted'), /CONFIG_ERROR.*Malformed CA certificate format/);
    assert.throws(() => validatePemCertificate('corrupted\n-----END CERTIFICATE-----'), /CONFIG_ERROR.*Malformed CA certificate format/);
    assert.throws(() => validatePemCertificate('-----BEGIN RSA PRIVATE KEY-----\nMIICXAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'), /CONFIG_ERROR.*Malformed CA certificate format/);
  });

  await runTest('CA Validator rejects malformed Base64 body in PEM certificate', () => {
    const invalidBase64Pem = '-----BEGIN CERTIFICATE-----\n$$$!!!not-valid-base64???\n-----END CERTIFICATE-----';
    assert.throws(() => validatePemCertificate(invalidBase64Pem), /CONFIG_ERROR.*Malformed Base64 payload/);
  });

  await runTest('CA Validator strictly rejects CA certificate containing quarantined production reference', () => {
    const poisonedPem = `-----BEGIN CERTIFICATE-----\nMIID${PROD_REF}Al+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQsFADBaMQswCQYDVQQGEwJV\n-----END CERTIFICATE-----`;
    assert.throws(() => validatePemCertificate(poisonedPem), /QUARANTINE_VIOLATION/);
  });

  // 2. Integration of CA in validateStagingDatabaseUrl
  await runTest('Guard accepts valid CA option and preserves strict TLS and SNI', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl, { ca: validSyntheticPem });

    assert.strictEqual(config.ssl.rejectUnauthorized, true, 'Strict verification must remain enabled');
    assert.strictEqual(config.ssl.servername, 'aws-0-eu-west-1.pooler.supabase.com', 'SNI servername must match validated host');
    assert.strictEqual(config.ssl.ca, validSyntheticPem.trim(), 'ssl.ca must match provided valid PEM');
    assert(Object.isFrozen(config.ssl), 'ssl object must be frozen');
    assert(Object.isFrozen(config), 'discrete client options must be frozen');
  });

  await runTest('Guard rejects malformed CA option when passed to validateStagingDatabaseUrl', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { ca: 'invalid_ca_data' });
    }, /CONFIG_ERROR.*Malformed CA certificate format/);
  });

  await runTest('Guard rejects invalid options argument types', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => validateStagingDatabaseUrl(poolerUrl, 'invalid_options_string'), /CONFIG_ERROR.*Options must be an object/);
    assert.throws(() => validateStagingDatabaseUrl(poolerUrl, 12345), /CONFIG_ERROR.*Options must be an object/);
  });

  await runTest('Guard rejects wrong endpoint or production reference even when valid CA is provided', () => {
    const prodUrl = `postgres://postgres.${PROD_REF}:SecretPass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => validateStagingDatabaseUrl(prodUrl, { ca: validSyntheticPem }), /QUARANTINE_VIOLATION/);

    const wrongHostUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass@attacker-pooler.supabase.com:5432/postgres`;
    assert.throws(() => validateStagingDatabaseUrl(wrongHostUrl, { ca: validSyntheticPem }), /CONFIG_ERROR.*Unapproved host/);
  });

  // 3. Client factory verification with CA & Anti-tampering
  await runTest('Client factory spy receives valid discrete CA option and enforces SNI matching', () => {
    let spyOptions = null;
    const mockFactory = (opts) => {
      spyOptions = opts;
      return { connected: true };
    };

    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:SessionPass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const validated = validateStagingDatabaseUrl(poolerUrl, { ca: validSyntheticPem });
    const client = createStagingClient(validated, mockFactory);

    assert(client.connected);
    assert.strictEqual(spyOptions.ssl.rejectUnauthorized, true);
    assert.strictEqual(spyOptions.ssl.servername, 'aws-0-eu-west-1.pooler.supabase.com');
    assert.strictEqual(spyOptions.ssl.ca, validSyntheticPem.trim());
    assert.strictEqual(spyOptions.connectionString, undefined);
  });

  await runTest('Client factory refuses configuration with mismatched SNI servername', () => {
    assert.throws(() => {
      createStagingClient(
        {
          host: 'aws-0-eu-west-1.pooler.supabase.com',
          port: 5432,
          database: 'postgres',
          user: `postgres.${EXPECTED_STAGING_REF}`,
          ssl: { rejectUnauthorized: true, servername: 'attacker-spoofed-sni.com' },
        },
        () => {}
      );
    }, /SECURITY_ERROR.*SNI servername must match validated host/);
  });

  await runTest('Client factory refuses configuration with malformed CA in ssl.ca', () => {
    assert.throws(() => {
      createStagingClient(
        {
          host: 'aws-0-eu-west-1.pooler.supabase.com',
          port: 5432,
          database: 'postgres',
          user: `postgres.${EXPECTED_STAGING_REF}`,
          ssl: { rejectUnauthorized: true, servername: 'aws-0-eu-west-1.pooler.supabase.com', ca: 'not_a_cert' },
        },
        () => {}
      );
    }, /CONFIG_ERROR.*Malformed CA certificate format/);
  });

  await runTest('Client factory refuses configuration containing quarantined production host or user', () => {
    assert.throws(() => {
      createStagingClient(
        {
          host: `db.${PROD_REF}.supabase.co`,
          port: 5432,
          database: 'postgres',
          user: 'postgres',
          ssl: { rejectUnauthorized: true, servername: `db.${PROD_REF}.supabase.co` },
        },
        () => {}
      );
    }, /QUARANTINE_VIOLATION/);
  });

  // 4. Timeout Profiles and Bounded Configuration
  await runTest('Default behavior uses conservative PREFLIGHT timeout profile (10,000ms)', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl);

    assert.strictEqual(config.statement_timeout, 10000);
    assert.strictEqual(config.query_timeout, 10000);
    assert.strictEqual(config.connectionTimeoutMillis, 10000);
    assert.strictEqual(config.overallDeadlineMs, 30000);
  });

  await runTest('Explicit timeoutProfile: PREFLIGHT sets 10,000ms timeouts', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl, { timeoutProfile: 'PREFLIGHT' });

    assert.strictEqual(config.statement_timeout, APPROVED_TIMEOUT_PROFILES.PREFLIGHT.statement_timeout);
    assert.strictEqual(config.query_timeout, APPROVED_TIMEOUT_PROFILES.PREFLIGHT.query_timeout);
    assert.strictEqual(config.connectionTimeoutMillis, APPROVED_TIMEOUT_PROFILES.PREFLIGHT.connectionTimeoutMillis);
    assert.strictEqual(config.overallDeadlineMs, APPROVED_TIMEOUT_PROFILES.PREFLIGHT.overallDeadlineMs);
  });

  await runTest('Explicit timeoutProfile: MIGRATION sets 180,000ms statement/query timeout and bounded connection timeout', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl, { timeoutProfile: 'MIGRATION' });

    assert.strictEqual(config.statement_timeout, 180000);
    assert.strictEqual(config.query_timeout, 180000);
    assert.strictEqual(config.connectionTimeoutMillis, 30000);
    assert.strictEqual(config.overallDeadlineMs, 600000);
  });

  await runTest('Unknown timeout profile is strictly rejected', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { timeoutProfile: 'FAST' });
    }, /CONFIG_ERROR.*Unknown timeout profile 'FAST'/);

    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { timeoutProfile: 123 });
    }, /CONFIG_ERROR.*timeoutProfile must be a string/);
  });

  await runTest('Bounded custom statementTimeoutMs within 10,000ms to 600,000ms is accepted', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

    // Minimum boundary: 10,000ms
    const cMin = validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 10000 });
    assert.strictEqual(cMin.statement_timeout, 10000);
    assert.strictEqual(cMin.query_timeout, 10000);

    // Intermediate migration value: 120,000ms
    const c120 = validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 120000 });
    assert.strictEqual(c120.statement_timeout, 120000);
    assert.strictEqual(c120.query_timeout, 120000);
    assert.strictEqual(c120.connectionTimeoutMillis, 30000);

    // Proposed migration value: 180,000ms
    const c180 = validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 180000 });
    assert.strictEqual(c180.statement_timeout, 180000);
    assert.strictEqual(c180.query_timeout, 180000);
    assert.strictEqual(c180.connectionTimeoutMillis, 30000);

    // Maximum boundary: 600,000ms
    const cMax = validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 600000 });
    assert.strictEqual(cMax.statement_timeout, 600000);
    assert.strictEqual(cMax.query_timeout, 600000);
  });

  await runTest('Custom timeout below minimum threshold (< 10,000ms) is rejected', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 9999 });
    }, /CONFIG_ERROR.*below minimum permitted threshold/);

    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 5000 });
    }, /CONFIG_ERROR.*below minimum permitted threshold/);
  });

  await runTest('Custom timeout exceeding maximum threshold (> 600,000ms) is rejected', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => {
      validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: 600001 });
    }, /CONFIG_ERROR.*exceeds maximum permitted threshold/);
  });

  await runTest('Negative, zero, and non-numeric timeout values are rejected', () => {
    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const badTimeouts = [-1, -5000, 0, '120000', NaN, Infinity, null, false, true, {}, []];

    for (const badVal of badTimeouts) {
      assert.throws(() => {
        validateStagingDatabaseUrl(poolerUrl, { statementTimeoutMs: badVal });
      }, /CONFIG_ERROR/);
    }
  });

  await runTest('Timeout options cannot be used to bypass quarantine or weaken TLS', () => {
    const prodUrl = `postgres://postgres.${PROD_REF}:Pass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.throws(() => {
      validateStagingDatabaseUrl(prodUrl, { timeoutProfile: 'MIGRATION' });
    }, /QUARANTINE_VIOLATION/);

    const poolerUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:Pass123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    const config = validateStagingDatabaseUrl(poolerUrl, { timeoutProfile: 'MIGRATION' });
    assert.strictEqual(config.ssl.rejectUnauthorized, true);
  });

  // ============================================================================
  // PART 3: Verify Both Live Runners Integrate the Shared Validator
  // ============================================================================
  console.log('\n--- Part 3: Live Runner Integration & Import Safety Verification ---');

  await runTest('Runner inspect_staging_reconciliation_cursor_schema.js requires shared guard and no excluded modules', () => {
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

  await runTest('Importing reconciliation runner is completely side-effect-free (no execution, no DB access)', () => {
    const runner = require('./inspect_staging_reconciliation_cursor_schema');
    assert.strictEqual(typeof runner.inspectStagingSchema, 'function', 'Runner must export inspectStagingSchema as a function');
    assert.strictEqual(typeof runner.loadStagingDatabaseUrl, 'function', 'Runner must export loadStagingDatabaseUrl as a function');
  });

  await runTest('Reconciliation runner dynamically does NOT import test_staging_supabase_certification or any excluded file', () => {
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

  await runTest('Reconciliation runner local loadStagingDatabaseUrl respects environment variable precedence', () => {
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

  await runTest('Runner test_staging_supabase_certification.js requires shared guard', () => {
    const runnerPath = path.join(__dirname, 'test_staging_supabase_certification.js');
    const content = fs.readFileSync(runnerPath, 'utf8');
    assert(content.includes("require('./staging_connection_guard')"), 'Runner must require staging_connection_guard');
    assert(content.includes('validateStagingDatabaseUrl'), 'Runner must invoke validateStagingDatabaseUrl');
    assert(!content.includes('dbHost.includes(extractedRef) || dbUser.includes(extractedRef)'), 'Runner must NOT use loose substring check');
  });

  // ============================================================================
  // PART 4: Migration Pre-Validation & Inspector Assertion Mode Offline Tests
  // ============================================================================
  console.log('\n--- Part 4: Migration Pre-Validation & Inspector Assertion Mode Tests ---');

  // Helper for structured mock inspection reports
  function getValidMockReport() {
    return {
      tableExists: true,
      tableDetails: { schemaname: 'public', tablename: 'meeting_recording_reconciliation_cursor', tableowner: 'postgres' },
      columns: [
        { column_name: 'id', data_type: 'character varying', character_maximum_length: 32, is_nullable: 'NO', column_default: null },
        { column_name: 'category_offset', data_type: 'integer', character_maximum_length: null, is_nullable: 'NO', column_default: '0' },
        { column_name: 'last_advanced_at', data_type: 'timestamp with time zone', character_maximum_length: null, is_nullable: 'NO', column_default: 'now()' },
        { column_name: 'advanced_by', data_type: 'character varying', character_maximum_length: 128, is_nullable: 'NO', column_default: null },
        { column_name: 'created_at', data_type: 'timestamp with time zone', character_maximum_length: null, is_nullable: 'NO', column_default: 'now()' },
        { column_name: 'updated_at', data_type: 'timestamp with time zone', character_maximum_length: null, is_nullable: 'NO', column_default: 'now()' },
      ],
      constraints: [
        { conname: 'meeting_recording_reconciliation_cursor_pkey', contype: 'p', constraint_definition: 'PRIMARY KEY (id)', conkey_cols: ['id'] },
        { conname: 'chk_reconciliation_cursor_category_offset', contype: 'c', convalidated: true, constraint_definition: 'CHECK ((category_offset = ANY (ARRAY[0, 1, 2])))', conkey_cols: ['category_offset'] },
      ],
      conflictingConstraints: [],
      rls: { relname: 'meeting_recording_reconciliation_cursor', rls_enabled: true, rls_enforced: false, relacl: ['service_role=arwdDxt/postgres', 'postgres=arwdDxt/postgres'] },
      tableGrants: [
        { grantee: 'service_role', privilege_type: 'SELECT' },
        { grantee: 'service_role', privilege_type: 'INSERT' },
        { grantee: 'service_role', privilege_type: 'UPDATE' },
        { grantee: 'service_role', privilege_type: 'DELETE' },
        { grantee: 'postgres', privilege_type: 'ALL' },
      ],
      singletonRow: {
        id: 'global_cursor',
        category_offset: 0,
        last_advanced_at: '2026-10-14T10:00:00Z',
        advanced_by: 'migration_bootstrap',
        created_at: '2026-10-14T10:00:00Z',
        updated_at: '2026-10-14T10:00:00Z',
      },
      functionExists: true,
      functionsCount: 1,
      functionDetails: {
        proname: 'advance_recording_reconciliation_cursor',
        function_owner: 'postgres',
        is_security_definer: true,
        function_search_path: ['search_path=public, pg_temp'],
        argument_count: 1,
        argument_signature: 'p_worker_id character varying DEFAULT \'system_reconciliation_worker\'::character varying',
        identity_arguments: 'p_worker_id character varying',
        return_type: 'jsonb',
        proacl: ['service_role=X/postgres', 'postgres=X/postgres'],
      },
      functionGrants: [
        { grantee: 'service_role', privilege_type: 'EXECUTE' },
        { grantee: 'postgres', privilege_type: 'EXECUTE' },
      ],
    };
  }

  // 1. Static Analysis of Migration Pre-Validation & Check Semantics Block
  await runTest('Migration pre-validation enforces exact defaults, unexpected column rejection, catalog PK, and canonical check semantics', () => {
    const migrationPath = path.join(__dirname, '..', 'migrations', '20261011_meeting_recording_reconciliation_cursor.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Verify BEGIN and COMMIT transaction wrapper
    assert(sql.includes("BEGIN;"), 'Migration must be wrapped in BEGIN;');
    assert(sql.includes("COMMIT;"), 'Migration must terminate with COMMIT;');

    // Verify all 6 columns checked
    const requiredCols = ['id', 'category_offset', 'advanced_by', 'last_advanced_at', 'created_at', 'updated_at'];
    for (const col of requiredCols) {
      assert(sql.includes(`column_name = '${col}'`), `Migration must check column_name = '${col}'`);
    }

    // Verify exact types and lengths
    assert(sql.includes("character_maximum_length = 32"), 'Migration must check id length 32');
    assert(sql.includes("character_maximum_length = 128"), 'Migration must check advanced_by length 128');
    assert(sql.includes("data_type = 'integer'"), 'Migration must check integer type');
    assert(sql.includes("data_type = 'timestamp with time zone'"), 'Migration must check timestamp with time zone');
    assert(!sql.includes("timestamp without time zone"), 'Migration must not accept timestamp without time zone');

    // Verify exact default checks (not loose substring)
    assert(sql.includes("regexp_replace(column_default, '::(integer|int4|int)$', '', 'i')) = '0'"), 'Migration must strictly check 0 default');
    assert(sql.includes("regexp_replace(lower(trim(column_default)), '^[\\s\\(]*(now\\(\\)|current_timestamp)[\\s\\)]*(::\\s*(timestamp with time zone|timestamptz))?[\\s\\)]*$', '\\1') IN ('now()', 'current_timestamp')"), 'Migration must strictly check now() default');

    // Verify unexpected extra columns rejection (exact schema contract)
    assert(sql.includes("v_extra_cols"), 'Migration must track unexpected extra columns');
    assert(sql.includes("Exact schema contract required"), 'Migration must reject unexpected extra columns');

    // Verify catalog-backed relation-scoped primary key check
    assert(sql.includes("c.contype = 'p'"), 'Migration must verify primary key constraint type');
    assert(sql.includes("ARRAY['id']::name[]"), 'Migration must verify ordered column list is strictly ARRAY[\'id\']::name[]');

    // Verify data consistency check against invalid existing rows
    assert(sql.includes("category_offset NOT IN (0, 1, 2)"), 'Migration must check existing category_offset values');
    assert(sql.includes("v_invalid_rows > 0"), 'Migration must raise exception on invalid existing rows');

    // Verify pre-existing singleton invariant checks
    assert(sql.includes("v_row_count > 1"), 'Migration must enforce singleton at most one row');
    assert(sql.includes("id <> 'global_cursor'"), 'Migration must check singleton row ID');

    // Verify canonical check constraint semantics, validation status, and cross-relation collision check
    assert(sql.includes("chk_reconciliation_cursor_category_offset"), 'Migration must check constraint name');
    assert(sql.includes("t.relname <> 'meeting_recording_reconciliation_cursor'"), 'Migration must check relation name for collision');
    assert(sql.includes("v_norm_def IN ("), 'Migration must check canonical constraint definitions');
    assert(sql.includes("v_existing_validated IS NOT TRUE"), 'Migration must check convalidated');

    // Verify function missing-row, offset domain, and catalog overload guards
    assert(sql.includes("v_row.id IS NULL"), 'Function must guard against missing row');
    assert(sql.includes("v_current_offset NOT IN (0, 1, 2)"), 'Function must guard against invalid offset domain');
    assert(sql.includes("v_fn_record.proargtypes <> 'character varying'::regtype::oidvector"), 'Migration must guard against conflicting overloads via catalog oidvector');
    assert(sql.includes("v_fn_record.prorettype <> 'jsonb'::regtype"), 'Migration must guard against incompatible return types via catalog regtype');
  });

  // 2. Base assertion pass
  await runTest('Certification assertions pass cleanly on complete valid schema report', () => {
    const report = getValidMockReport();
    const failures = evaluateCertificationAssertions(report);
    assert.strictEqual(failures.length, 0, `Expected 0 failures, got: ${failures.join('; ')}`);
  });

  // 3. Gap A: Unit tests for exact default validators (valid vs deceptive)
  await runTest('Gap A: Unit tests for isExactZeroDefault validate 0 and reject deceptive expressions', () => {
    // Valid 0 defaults
    assert.strictEqual(isExactZeroDefault('0'), true);
    assert.strictEqual(isExactZeroDefault('0::integer'), true);
    assert.strictEqual(isExactZeroDefault('(0)'), true);
    assert.strictEqual(isExactZeroDefault('((0))::int4'), true);
    assert.strictEqual(isExactZeroDefault(0), true);

    // Deceptive expressions that contain '0' but are NOT default 0
    assert.strictEqual(isExactZeroDefault('10'), false);
    assert.strictEqual(isExactZeroDefault('100'), false);
    assert.strictEqual(isExactZeroDefault('0 + 1'), false);
    assert.strictEqual(isExactZeroDefault('case when true then 0 else 1 end'), false);
    assert.strictEqual(isExactZeroDefault('NULL'), false);
    assert.strictEqual(isExactZeroDefault('nextval(\'seq_0\')'), false);
    assert.strictEqual(isExactZeroDefault(null), false);
    assert.strictEqual(isExactZeroDefault(undefined), false);
  });

  await runTest('Gap A: Unit tests for isExactNowDefault validate now() and reject deceptive expressions', () => {
    // Valid now() defaults across standard PostgreSQL representations and casts
    assert.strictEqual(isExactNowDefault('now()'), true);
    assert.strictEqual(isExactNowDefault('(now())'), true);
    assert.strictEqual(isExactNowDefault('((now()))'), true);
    assert.strictEqual(isExactNowDefault('now()::timestamp with time zone'), true);
    assert.strictEqual(isExactNowDefault('now()::timestamptz'), true);
    assert.strictEqual(isExactNowDefault('(now()::timestamp with time zone)'), true);
    assert.strictEqual(isExactNowDefault('((now())::timestamp with time zone)'), true);
    assert.strictEqual(isExactNowDefault('CURRENT_TIMESTAMP'), true);
    assert.strictEqual(isExactNowDefault('(CURRENT_TIMESTAMP)'), true);
    assert.strictEqual(isExactNowDefault('(CURRENT_TIMESTAMP)::timestamptz'), true);
    assert.strictEqual(isExactNowDefault('current_timestamp::timestamp with time zone'), true);

    // Deceptive expressions that contain 'now()' or invalid functions
    assert.strictEqual(isExactNowDefault('now() + interval \'1 day\''), false);
    assert.strictEqual(isExactNowDefault('clock_timestamp()'), false);
    assert.strictEqual(isExactNowDefault('statement_timestamp()'), false);
    assert.strictEqual(isExactNowDefault('timeofday()'), false);
    assert.strictEqual(isExactNowDefault('\'2026-01-01\'::timestamp with time zone'), false);
    assert.strictEqual(isExactNowDefault('2026-01-01 00:00:00+00'), false);
    assert.strictEqual(isExactNowDefault('not_now()'), false);
    assert.strictEqual(isExactNowDefault('now'), false);
    assert.strictEqual(isExactNowDefault('\'now\''), false);
    assert.strictEqual(isExactNowDefault('NULL'), false);
    assert.strictEqual(isExactNowDefault(null), false);
    assert.strictEqual(isExactNowDefault(undefined), false);
  });

  await runTest('Gap A: Rejects deceptive column defaults in certification report', () => {
    // category_offset with deceptive '10' default
    const r1 = getValidMockReport();
    r1.columns.find(c => c.column_name === 'category_offset').column_default = '10';
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('category_offset default \'10\' does not match required exact 0 default')));

    // category_offset with deceptive '0 + 1' default
    const r2 = getValidMockReport();
    r2.columns.find(c => c.column_name === 'category_offset').column_default = '0 + 1';
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('category_offset default \'0 + 1\' does not match required exact 0 default')));

    // last_advanced_at with deceptive 'now() + interval \'1 day\'' default
    const r3 = getValidMockReport();
    r3.columns.find(c => c.column_name === 'last_advanced_at').column_default = 'now() + interval \'1 day\'';
    assert(evaluateCertificationAssertions(r3).some(f => f.includes('last_advanced_at default \'now() + interval \'1 day\'\' does not match required exact now() default')));

    // created_at with deceptive 'clock_timestamp()'
    const r4 = getValidMockReport();
    r4.columns.find(c => c.column_name === 'created_at').column_default = 'clock_timestamp()';
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('created_at default \'clock_timestamp()\' does not match required exact now() default')));

    // id has unexpected default
    const r5 = getValidMockReport();
    r5.columns.find(c => c.column_name === 'id').column_default = '\'unwanted_id_default\'';
    assert(evaluateCertificationAssertions(r5).some(f => f.includes('Column id has unexpected default')));

    // advanced_by has unexpected default
    const r6 = getValidMockReport();
    r6.columns.find(c => c.column_name === 'advanced_by').column_default = '\'unwanted_worker_default\'';
    assert(evaluateCertificationAssertions(r6).some(f => f.includes('Column advanced_by has unexpected default')));
  });

  // 4. Gap B: Unit tests and behavioral tests for offset check constraint semantics
  await runTest('Gap B: Unit tests for validateOffsetCheckSemantics accept invariant and reject permissive variants', () => {
    // Valid canonical forms
    assert.strictEqual(validateOffsetCheckSemantics('CHECK ((category_offset = ANY (ARRAY[0, 1, 2])))'), true);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset = ANY (ARRAY[0, 1, 2]))'), true);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset IN (0, 1, 2))'), true);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (((category_offset = 0) OR (category_offset = 1) OR (category_offset = 2)))'), true);

    // Permissive variants that contain 0, 1, 2 but allow invalid states
    assert.strictEqual(validateOffsetCheckSemantics('CHECK ((category_offset = ANY (ARRAY[0, 1, 2, 3])))'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset IN (0, 1, 2, 3))'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK ((category_offset = ANY (ARRAY[0, 1, 2])) OR category_offset = 99)'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK ((category_offset = ANY (ARRAY[0, 1, 2])) OR true)'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset IN (0, 1))'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset >= 0)'), false);
    assert.strictEqual(validateOffsetCheckSemantics('CHECK (category_offset BETWEEN 0 AND 3)'), false);
    assert.strictEqual(validateOffsetCheckSemantics(null), false);
    assert.strictEqual(validateOffsetCheckSemantics(''), false);
  });

  await runTest('Gap B: Rejects permissive check constraint in certification report', () => {
    // Extra value 3 allowed
    const r1 = getValidMockReport();
    r1.constraints.find(c => c.conname === 'chk_reconciliation_cursor_category_offset').constraint_definition = 'CHECK ((category_offset = ANY (ARRAY[0, 1, 2, 3])))';
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('has invalid semantics')));

    // Extra OR branch
    const r2 = getValidMockReport();
    r2.constraints.find(c => c.conname === 'chk_reconciliation_cursor_category_offset').constraint_definition = 'CHECK ((category_offset = ANY (ARRAY[0, 1, 2])) OR category_offset = 99)';
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('has invalid semantics')));

    // Missing value 2
    const r3 = getValidMockReport();
    r3.constraints.find(c => c.conname === 'chk_reconciliation_cursor_category_offset').constraint_definition = 'CHECK (category_offset IN (0, 1))';
    assert(evaluateCertificationAssertions(r3).some(f => f.includes('has invalid semantics')));
  });

  // 5. Gap C: Function signature and metadata
  await runTest('Gap C: Validates complete function catalog metadata and rejects discrepancies', () => {
    // Missing argument_count (when not 1)
    const r1 = getValidMockReport();
    r1.functionDetails.argument_count = 2;
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Function argument count is 2, expected exactly 1 argument')));

    // Wrong parameter name in signature
    const r2 = getValidMockReport();
    r2.functionDetails.argument_signature = 'p_worker_uuid character varying DEFAULT \'system_reconciliation_worker\'::character varying';
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('Function argument signature')));

    // Wrong default in signature
    const r3 = getValidMockReport();
    r3.functionDetails.argument_signature = 'p_worker_id character varying DEFAULT \'wrong_worker\'::character varying';
    assert(evaluateCertificationAssertions(r3).some(f => f.includes('Function argument signature')));

    // Extra parameter in signature
    const r4 = getValidMockReport();
    r4.functionDetails.argument_signature = 'p_worker_id character varying DEFAULT \'system_reconciliation_worker\'::character varying, extra_param int';
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('Function argument signature')));

    // Non-jsonb return type
    const r5 = getValidMockReport();
    r5.functionDetails.return_type = 'void';
    assert(evaluateCertificationAssertions(r5).some(f => f.includes("Function return type is 'void', expected exact type 'jsonb'")));

    // Not SECURITY DEFINER
    const r6 = getValidMockReport();
    r6.functionDetails.is_security_definer = false;
    assert(evaluateCertificationAssertions(r6).some(f => f.includes('Function is not SECURITY DEFINER')));

    // Reordered search path
    const r7 = getValidMockReport();
    r7.functionDetails.function_search_path = ['search_path=pg_temp, public'];
    assert(evaluateCertificationAssertions(r7).some(f => f.includes('Function search path normalized entries [pg_temp, public] do not strictly match ordered [\'public\', \'pg_temp\']')));
  });

  // 6. Gap D: Table privileges and prohibited access
  await runTest('Gap D: Validates individual service_role privileges and rejects prohibited roles', () => {
    // Missing DELETE privilege on table for service_role
    const r1 = getValidMockReport();
    r1.tableGrants = [
      { grantee: 'service_role', privilege_type: 'SELECT' },
      { grantee: 'service_role', privilege_type: 'INSERT' },
      { grantee: 'service_role', privilege_type: 'UPDATE' },
      // DELETE omitted
    ];
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('service_role is missing required table privileges: DELETE')));

    // Missing UPDATE privilege
    const r2 = getValidMockReport();
    r2.tableGrants = [
      { grantee: 'service_role', privilege_type: 'SELECT' },
      { grantee: 'service_role', privilege_type: 'INSERT' },
      { grantee: 'service_role', privilege_type: 'DELETE' },
    ];
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('service_role is missing required table privileges: UPDATE')));

    // Granted ALL satisfies required privileges
    const r3 = getValidMockReport();
    r3.tableGrants = [{ grantee: 'service_role', privilege_type: 'ALL' }];
    assert.strictEqual(evaluateCertificationAssertions(r3).length, 0);

    // Prohibited table grant to anon
    const r4 = getValidMockReport();
    r4.tableGrants.push({ grantee: 'anon', privilege_type: 'SELECT' });
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('Unintended table grants detected to: anon (SELECT)')));

    // Prohibited table grant to authenticated
    const r5 = getValidMockReport();
    r5.tableGrants.push({ grantee: 'authenticated', privilege_type: 'UPDATE' });
    assert(evaluateCertificationAssertions(r5).some(f => f.includes('Unintended table grants detected to: authenticated (UPDATE)')));

    // Prohibited table grant to PUBLIC
    const r6 = getValidMockReport();
    r6.tableGrants.push({ grantee: 'PUBLIC', privilege_type: 'SELECT' });
    assert(evaluateCertificationAssertions(r6).some(f => f.includes('Unintended table grants detected to: PUBLIC (SELECT)')));

    // Prohibited function grant to PUBLIC
    const r7 = getValidMockReport();
    r7.functionGrants.push({ grantee: 'PUBLIC', privilege_type: 'EXECUTE' });
    assert(evaluateCertificationAssertions(r7).some(f => f.includes('Unintended function grants detected to: PUBLIC (EXECUTE)')));

    // Missing service_role function EXECUTE grant
    const r8 = getValidMockReport();
    r8.functionGrants = r8.functionGrants.filter(g => g.grantee !== 'service_role');
    assert(evaluateCertificationAssertions(r8).some(f => f.includes('Missing required EXECUTE grant to service_role on function')));
  });

  // 7. Gap E: Extra columns and exact schema contract
  await runTest('Gap E: Rejects unexpected extra columns adhering to exact schema contract', () => {
    // Unexpected extra column tenant_id
    const r1 = getValidMockReport();
    r1.columns.push({
      column_name: 'tenant_id',
      data_type: 'uuid',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: null,
    });
    const failures = evaluateCertificationAssertions(r1);
    assert(failures.some(f => f.includes('contains unexpected extra columns: tenant_id. Schema contract requires exact 6 columns.')));

    // Unexpected extra column extra_cursor_state
    const r2 = getValidMockReport();
    r2.columns.push({
      column_name: 'extra_cursor_state',
      data_type: 'text',
      character_maximum_length: null,
      is_nullable: 'YES',
      column_default: null,
    });
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('contains unexpected extra columns: extra_cursor_state')));
  });

  // 8. Category 1: Incorrect character lengths and permissive substitute types
  await runTest('Rejects incorrect character lengths and permissive substitute types', () => {
    // id length too short
    const r1 = getValidMockReport();
    r1.columns.find(c => c.column_name === 'id').character_maximum_length = 16;
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Column id character length is 16, expected exact length 32')));

    // id length too long
    const r2 = getValidMockReport();
    r2.columns.find(c => c.column_name === 'id').character_maximum_length = 64;
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('Column id character length is 64, expected exact length 32')));

    // id substitute type 'text'
    const r3 = getValidMockReport();
    r3.columns.find(c => c.column_name === 'id').data_type = 'text';
    assert(evaluateCertificationAssertions(r3).some(f => f.includes("Column id has type 'text', expected exact type 'character varying'")));

    // advanced_by substitute type 'text'
    const r4 = getValidMockReport();
    r4.columns.find(c => c.column_name === 'advanced_by').data_type = 'text';
    assert(evaluateCertificationAssertions(r4).some(f => f.includes("Column advanced_by has type 'text'")));

    // advanced_by incorrect length
    const r5 = getValidMockReport();
    r5.columns.find(c => c.column_name === 'advanced_by').character_maximum_length = 64;
    assert(evaluateCertificationAssertions(r5).some(f => f.includes('Column advanced_by character length is 64, expected exact length 128')));

    // category_offset substitute type 'smallint'
    const r6 = getValidMockReport();
    r6.columns.find(c => c.column_name === 'category_offset').data_type = 'smallint';
    assert(evaluateCertificationAssertions(r6).some(f => f.includes("Column category_offset has type 'smallint', expected exact type 'integer'")));

    // category_offset substitute type 'bigint'
    const r7 = getValidMockReport();
    r7.columns.find(c => c.column_name === 'category_offset').data_type = 'bigint';
    assert(evaluateCertificationAssertions(r7).some(f => f.includes("Column category_offset has type 'bigint', expected exact type 'integer'")));

    // timestamps substitute type 'timestamp without time zone'
    const r8 = getValidMockReport();
    r8.columns.find(c => c.column_name === 'created_at').data_type = 'timestamp without time zone';
    assert(evaluateCertificationAssertions(r8).some(f => f.includes("Column created_at has type 'timestamp without time zone'")));
  });

  // 9. Category 2: Missing or nullable columns
  await runTest('Rejects missing or nullable required columns', () => {
    // Missing column
    const r1 = getValidMockReport();
    r1.columns = r1.columns.filter(c => c.column_name !== 'last_advanced_at');
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Missing required column: last_advanced_at')));

    // Nullable column
    const r2 = getValidMockReport();
    r2.columns.find(c => c.column_name === 'category_offset').is_nullable = 'YES';
    assert(evaluateCertificationAssertions(r2).some(f => f.includes("Column category_offset is_nullable is 'YES', expected 'NO'")));
  });

  // 10. Category 3: Wrong primary-key column identity or order
  await runTest('Rejects wrong primary-key column identity or order', () => {
    // Composite primary key (id, tenant_id)
    const r1 = getValidMockReport();
    r1.constraints.find(c => c.contype === 'p').conkey_cols = ['id', 'tenant_id'];
    assert(evaluateCertificationAssertions(r1).some(f => f.includes("PRIMARY KEY column list [id, tenant_id] must strictly consist of ['id'] in order")));

    // Reordered composite primary key (tenant_id, id)
    const r2 = getValidMockReport();
    r2.constraints.find(c => c.contype === 'p').conkey_cols = ['tenant_id', 'id'];
    assert(evaluateCertificationAssertions(r2).some(f => f.includes("PRIMARY KEY column list [tenant_id, id] must strictly consist of ['id'] in order")));

    // Wrong column primary key (category_offset)
    const r3 = getValidMockReport();
    r3.constraints.find(c => c.contype === 'p').conkey_cols = ['category_offset'];
    assert(evaluateCertificationAssertions(r3).some(f => f.includes("PRIMARY KEY column list [category_offset] must strictly consist of ['id'] in order")));

    // No primary key
    const r4 = getValidMockReport();
    r4.constraints = r4.constraints.filter(c => c.contype !== 'p');
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('Table must have exactly one PRIMARY KEY constraint (found 0)')));

    // Multiple primary keys
    const r5 = getValidMockReport();
    r5.constraints.push({ conname: 'extra_pk', contype: 'p', conkey_cols: ['category_offset'] });
    assert(evaluateCertificationAssertions(r5).some(f => f.includes('Table must have exactly one PRIMARY KEY constraint (found 2)')));
  });

  // 11. Category 8: Missing singleton and invalid offsets
  await runTest('Rejects missing singleton and invalid offsets', () => {
    // Missing singleton row
    const r1 = getValidMockReport();
    r1.singletonRow = null;
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Required singleton row id="global_cursor" is missing')));

    // Wrong id
    const r2 = getValidMockReport();
    r2.singletonRow.id = 'wrong_id';
    assert(evaluateCertificationAssertions(r2).some(f => f.includes("Singleton row id is 'wrong_id', expected 'global_cursor'")));

    // Negative offset
    const r3 = getValidMockReport();
    r3.singletonRow.category_offset = -1;
    assert(evaluateCertificationAssertions(r3).some(f => f.includes('Singleton row category_offset is invalid: -1')));

    // Out of range offset
    const r4 = getValidMockReport();
    r4.singletonRow.category_offset = 3;
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('Singleton row category_offset is invalid: 3')));

    // Non-integer offset
    const r5 = getValidMockReport();
    r5.singletonRow.category_offset = 'invalid_number';
    assert(evaluateCertificationAssertions(r5).some(f => f.includes('Singleton row category_offset is invalid: invalid_number')));
  });

  // 12. Fail closed on missing/insufficient metadata
  await runTest('Fails closed on missing or insufficient metadata', () => {
    const r1 = getValidMockReport();
    r1.columns = null;
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Insufficient column metadata in inspection report')));

    const r2 = getValidMockReport();
    r2.constraints = null;
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('Insufficient constraint metadata in inspection report')));

    const r3 = getValidMockReport();
    r3.rls = null;
    assert(evaluateCertificationAssertions(r3).some(f => f.includes('Insufficient RLS metadata in inspection report')));

    const r4 = getValidMockReport();
    r4.tableGrants = null;
    assert(evaluateCertificationAssertions(r4).some(f => f.includes('Insufficient table grants metadata in inspection report')));
  });

  // 12b. Hardened catalog and overload checks
  await runTest('Fails when check constraint is not validated (convalidated = false)', () => {
    const r = getValidMockReport();
    const chk = r.constraints.find(c => c.conname === 'chk_reconciliation_cursor_category_offset');
    chk.convalidated = false;
    const failures = evaluateCertificationAssertions(r);
    assert(failures.some(f => f.includes('convalidated = false')), 'Must fail if convalidated is false');
  });

  await runTest('Fails when multiple function overloads exist', () => {
    const r = getValidMockReport();
    r.functionsCount = 2;
    const failures = evaluateCertificationAssertions(r);
    assert(failures.some(f => f.includes('overloads of function')), 'Must fail if functionsCount > 1');
  });

  await runTest('Fails when catalog table or function ACL contains unintended grants', () => {
    const r1 = getValidMockReport();
    r1.rls.relacl = ['service_role=arwdDxt/postgres', 'anon=r/postgres'];
    assert(evaluateCertificationAssertions(r1).some(f => f.includes('Catalog table ACL (relacl) contains unintended grant')));

    const r2 = getValidMockReport();
    r2.functionDetails.proacl = ['service_role=X/postgres', 'authenticated=X/postgres'];
    assert(evaluateCertificationAssertions(r2).some(f => f.includes('Catalog function ACL (proacl) contains unintended grant')));
  });

  // 13. Category 9: CLI assertion failures return a non-zero status
  await runTest('CLI assertion failures return a non-zero exit status', () => {
    // Invoking the CLI with --assert-complete when inspection fails or throws returns non-zero exit code
    const child = child_process.spawnSync(
      process.execPath,
      [path.join(__dirname, 'inspect_staging_reconciliation_cursor_schema.js'), '--assert-complete'],
      {
        env: { ...process.env, STAGING_DATABASE_URL: '' },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(child.status, 1, `Expected exit status 1, got ${child.status}`);
    assert(child.stderr.includes('INSPECTION FAILED') || child.stderr.includes('SCHEMA CERTIFICATION ASSERTIONS FAILED'));
  });

  // 13. Category 10: Successful certification returns the expected status (exit code 0)
  await runTest('Successful certification returns the expected status code 0', () => {
    const validReportJson = JSON.stringify(getValidMockReport());
    const inlineScript = `
      const { evaluateCertificationAssertions } = require('./scripts/inspect_staging_reconciliation_cursor_schema');
      const report = ${validReportJson};
      const failures = evaluateCertificationAssertions(report);
      if (failures.length > 0) {
        process.exit(1);
      }
      process.exit(0);
    `;
    const child = child_process.spawnSync(
      process.execPath,
      ['-e', inlineScript],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
      }
    );
    assert.strictEqual(child.status, 0, `Expected exit status 0, got ${child.status}`);
  });

  // 14. Category 11: Cleanup completes before assertion failure is returned
  await runTest('Database client cleanup in finally block completes before assertion failure is returned', async () => {
    const eventSequence = [];
    const mockClient = {
      connect: async () => { eventSequence.push('client.connect'); },
      query: async (sql) => {
        eventSequence.push('client.query');
        if (sql.includes('pg_tables')) {
          // Table exists
          return { rows: [{ schemaname: 'public', tablename: 'meeting_recording_reconciliation_cursor', tableowner: 'postgres' }] };
        }
        if (sql.includes('information_schema.columns')) {
          // Incomplete columns
          return { rows: [{ column_name: 'id', data_type: 'character varying', character_maximum_length: 32, is_nullable: 'NO' }] };
        }
        return { rows: [] };
      },
      end: async () => {
        eventSequence.push('client.end');
      },
    };

    const mockFactory = () => mockClient;
    const testUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:MockPassword123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

    const report = await inspectStagingSchema({
      databaseUrl: testUrl,
      clientFactory: mockFactory,
    });

    // Verify client.end() was called during inspectStagingSchema finally block
    assert(eventSequence.includes('client.end'), 'client.end must be called');
    assert.strictEqual(eventSequence[eventSequence.length - 1], 'client.end', 'client.end must be executed before inspectStagingSchema returns');

    // Assertion evaluation occurs AFTER client is closed
    const failures = evaluateCertificationAssertions(report);
    assert(failures.length > 0, 'Incomplete schema must produce assertion failures');
  });

  // 15. Category 12: Importing the inspector does not initiate a database connection or network activity
  await runTest('Importing the inspector does not initiate a database connection or network activity', () => {
    let networkCallMade = false;

    // Spy on net.Socket.prototype.connect and tls.connect
    const origNetConnect = net.Socket.prototype.connect;
    const origTlsConnect = tls.connect;

    net.Socket.prototype.connect = function(...args) {
      networkCallMade = true;
      return origNetConnect.apply(this, args);
    };

    tls.connect = function(...args) {
      networkCallMade = true;
      return origTlsConnect.apply(this, args);
    };

    try {
      const inspectorPath = path.resolve(__dirname, 'inspect_staging_reconciliation_cursor_schema.js');
      delete require.cache[inspectorPath];
      const reloadedInspector = require('./inspect_staging_reconciliation_cursor_schema');
      assert.strictEqual(typeof reloadedInspector.inspectStagingSchema, 'function');
      assert.strictEqual(typeof reloadedInspector.evaluateCertificationAssertions, 'function');
      assert.strictEqual(networkCallMade, false, 'Importing inspector must NOT make any network or socket connections');
    } finally {
      net.Socket.prototype.connect = origNetConnect;
      tls.connect = origTlsConnect;
    }
  });

  // 16. Category 13: Default diagnostic mode remains backward-compatible
  await runTest('Default diagnostic mode remains backward-compatible without throwing on incomplete schema', async () => {
    const mockClient = {
      connect: async () => {},
      query: async () => ({ rows: [] }), // Non-existent table
      end: async () => {},
    };

    const testUrl = `postgres://postgres.${EXPECTED_STAGING_REF}:DiagnosticPass123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    const report = await inspectStagingSchema({
      databaseUrl: testUrl,
      clientFactory: () => mockClient,
    });

    assert.strictEqual(report.tableExists, false);
    assert.strictEqual(report.functionExists, false);
    // In default diagnostic mode, inspectStagingSchema returns the diagnostic report without throwing
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
}

runTestSuite().catch(err => {
  console.error('Fatal test harness execution error:', err);
  process.exit(1);
});
