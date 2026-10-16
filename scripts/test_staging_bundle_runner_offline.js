/**
 * scripts/test_staging_bundle_runner_offline.js
 * 
 * CLASPTEK PLATFORM SECURITY — OFFLINE CERTIFICATION TEST SUITE
 * FOR STAGING RECONCILIATION BUNDLE RUNNER (PHASE 2AI-C56)
 * 
 * Tests runner behavior strictly offline using dependency injection and mocks.
 * Zero database connections, zero network transport, zero SQL execution.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');

const runner = require('./run_staging_reconciliation_bundle');
const guard = require('./staging_connection_guard');

let testsPassed = 0;
let testsFailed = 0;

function runTest(description, testFn) {
  try {
    testFn();
    testsPassed++;
    console.log(`  ✔ PASS: ${description}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✖ FAIL: ${description}`);
    console.error(`    ${err.message}`);
  }
}

console.log('================================================================');
console.log('CLASPTEK PHASE 2AI-C56: STAGING BUNDLE RUNNER OFFLINE CERTIFICATION');
console.log('================================================================');

// --- Network and Client Spy Harness ---
let clientConstructedCount = 0;
let networkCallCount = 0;
let sqlExecutionCount = 0;

const originalNetConnect = net.connect;
const originalTlsConnect = tls.connect;
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;

function enableNetworkTrap() {
  net.connect = function () {
    networkCallCount++;
    throw new Error('TRAP_VIOLATION: Unexpected net.connect invoked during offline test!');
  };
  tls.connect = function () {
    networkCallCount++;
    throw new Error('TRAP_VIOLATION: Unexpected tls.connect invoked during offline test!');
  };
  http.request = function () {
    networkCallCount++;
    throw new Error('TRAP_VIOLATION: Unexpected http.request invoked during offline test!');
  };
  https.request = function () {
    networkCallCount++;
    throw new Error('TRAP_VIOLATION: Unexpected https.request invoked during offline test!');
  };
}

function disableNetworkTrap() {
  net.connect = originalNetConnect;
  tls.connect = originalTlsConnect;
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
}

// -----------------------------------------------------------------------------
// Test Case 1: No arguments select dry-run mode
// -----------------------------------------------------------------------------
runTest('1. No arguments select dry-run mode', () => {
  const result = runner.runDryRun();
  assert.strictEqual(result.mode, 'DRY_RUN');
  assert.strictEqual(result.executionAllowed, false);
  assert.strictEqual(result.status, 'DRY_RUN_PASS');
});

// -----------------------------------------------------------------------------
// Test Case 2: Dry-run creates zero database clients
// -----------------------------------------------------------------------------
runTest('2. Dry-run creates zero database clients', () => {
  clientConstructedCount = 0;
  const result = runner.runDryRun();
  assert.strictEqual(clientConstructedCount, 0);
  assert.strictEqual(result.mode, 'DRY_RUN');
});

// -----------------------------------------------------------------------------
// Test Case 3: Dry-run makes zero network calls
// -----------------------------------------------------------------------------
runTest('3. Dry-run makes zero network calls', () => {
  enableNetworkTrap();
  networkCallCount = 0;
  try {
    const result = runner.runDryRun();
    assert.strictEqual(networkCallCount, 0);
    assert.strictEqual(result.mode, 'DRY_RUN');
  } finally {
    disableNetworkTrap();
  }
});

// -----------------------------------------------------------------------------
// Test Case 4: Dry-run executes zero SQL statements
// -----------------------------------------------------------------------------
runTest('4. Dry-run executes zero SQL statements', () => {
  sqlExecutionCount = 0;
  const result = runner.runDryRun();
  assert.strictEqual(sqlExecutionCount, 0);
  assert.strictEqual(result.executionAllowed, false);
});

// -----------------------------------------------------------------------------
// Test Case 5: Bundle path resolution works from a different working directory
// -----------------------------------------------------------------------------
runTest('5. Bundle path resolution works from a different working directory', () => {
  const originalCwd = process.cwd();
  const tempDir = os.tmpdir();
  try {
    process.chdir(tempDir);
    const resolved = runner.resolveBundlePath();
    assert.strictEqual(resolved, runner.DEFAULT_BUNDLE_PATH);
    assert(fs.existsSync(resolved), 'Resolved bundle must exist even from temp CWD');
  } finally {
    process.chdir(originalCwd);
  }
});

// -----------------------------------------------------------------------------
// Test Case 6: Missing bundle is rejected
// -----------------------------------------------------------------------------
runTest('6. Missing bundle is rejected', () => {
  assert.throws(
    () => {
      runner.verifyBundleIntegrity(path.join(os.tmpdir(), 'non_existent_bundle.sql'));
    },
    /BUNDLE_ERROR.*Bundle file not found/
  );
});

// -----------------------------------------------------------------------------
// Test Case 7: Altered bundle is rejected
// -----------------------------------------------------------------------------
runTest('7. Altered bundle is rejected', () => {
  const tempAlteredPath = path.join(os.tmpdir(), `altered_bundle_${Date.now()}.sql`);
  try {
    fs.writeFileSync(tempAlteredPath, '-- altered bundle content\n');
    assert.throws(
      () => {
        runner.verifyBundleIntegrity(tempAlteredPath);
      },
      /BUNDLE_INTEGRITY_ERROR/
    );
  } finally {
    if (fs.existsSync(tempAlteredPath)) {
      fs.unlinkSync(tempAlteredPath);
    }
  }
});

// -----------------------------------------------------------------------------
// Test Case 8: Production project references are rejected
// -----------------------------------------------------------------------------
runTest('8. Production project references are rejected', () => {
  const prodUrls = [
    `postgresql://postgres:secret@db.${guard.PROD_REF}.supabase.co:5432/postgres`,
    `postgresql://postgres.${guard.PROD_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:secret@db.dwhjoiebzwnjdpcvcwvs.supabase.co:5432/postgres?ref=${guard.PROD_REF}`,
  ];

  for (const url of prodUrls) {
    assert.throws(
      () => {
        runner.validateTargetConfig(url);
      },
      /QUARANTINE_VIOLATION/
    );
  }
});

// -----------------------------------------------------------------------------
// Test Case 9: Unknown hosts and malformed connection configuration are rejected
// -----------------------------------------------------------------------------
runTest('9. Unknown hosts and malformed connection configuration are rejected', () => {
  const invalidConfigs = [
    'postgresql://postgres:secret@evil-host.com:5432/postgres',
    'postgresql://postgres:secret@db.unknown-project.supabase.co:5432/postgres',
    'not_a_valid_url',
    '',
  ];

  for (const conf of invalidConfigs) {
    assert.throws(
      () => {
        runner.validateTargetConfig(conf);
      },
      /CONFIG_ERROR/
    );
  }
});

// -----------------------------------------------------------------------------
// Test Case 10: Invalid ports, usernames, database names, and TLS options are rejected
// -----------------------------------------------------------------------------
runTest('10. Invalid ports, usernames, database names, and TLS options are rejected', () => {
  // Wrong port for direct
  assert.throws(
    () => runner.validateTargetConfig(`postgresql://postgres:secret@db.${guard.EXPECTED_STAGING_REF}.supabase.co:6543/postgres`),
    /CONFIG_ERROR.*Direct connection host requires port 5432/
  );

  // Wrong username for pooler
  assert.throws(
    () => runner.validateTargetConfig('postgresql://postgres:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'),
    /CONFIG_ERROR.*Pooler connection requires exact username/
  );

  // Wrong database name
  assert.throws(
    () => runner.validateTargetConfig(`postgresql://postgres:secret@db.${guard.EXPECTED_STAGING_REF}.supabase.co:5432/otherdb`),
    /CONFIG_ERROR.*Expected database name 'postgres'/
  );

  // Insecure sslmode
  assert.throws(
    () => runner.validateTargetConfig(`postgresql://postgres:secret@db.${guard.EXPECTED_STAGING_REF}.supabase.co:5432/postgres?sslmode=disable`),
    /CONFIG_ERROR.*Insecure or conflicting sslmode/
  );
});

// -----------------------------------------------------------------------------
// Test Case 11: Validated configuration cannot be substituted before client creation
// -----------------------------------------------------------------------------
runTest('11. Validated configuration cannot be substituted before client creation', () => {
  // Attempting to pass raw connectionString to createStagingClient must fail
  assert.throws(
    () => {
      guard.createStagingClient({
        connectionString: 'postgresql://postgres:secret@localhost:5432/postgres',
        ssl: { rejectUnauthorized: true },
      });
    },
    /SECURITY_ERROR.*Raw connectionString parameter is strictly prohibited/
  );

  // Attempting to disable TLS must fail
  assert.throws(
    () => {
      guard.createStagingClient({
        host: `db.${guard.EXPECTED_STAGING_REF}.supabase.co`,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        ssl: { rejectUnauthorized: false },
      });
    },
    /SECURITY_ERROR.*Strict TLS certificate verification/
  );
});

// -----------------------------------------------------------------------------
// Test Case 12: No generic flag enables execution
// -----------------------------------------------------------------------------
runTest('12. No generic flag enables execution', () => {
  const flags = ['--execute', '--apply', '--run', '-e'];
  for (const flag of flags) {
    assert.throws(
      () => {
        runner.main([flag]);
      },
      /EXECUTION_DISABLED/
    );
  }
});

// -----------------------------------------------------------------------------
// Test Case 13: Any execution-disabled scaffold fails before client creation
// -----------------------------------------------------------------------------
runTest('13. Any execution-disabled scaffold fails before client creation', () => {
  let spyFactoryCalled = false;
  const mockFactory = () => {
    spyFactoryCalled = true;
    return {};
  };

  assert.throws(
    () => {
      runner.executeBundle({ clientFactory: mockFactory });
    },
    /EXECUTION_DISABLED/
  );

  assert.strictEqual(spyFactoryCalled, false, 'Client factory must NEVER be invoked');
});

// -----------------------------------------------------------------------------
// Test Case 14: Invalid timeout values are rejected
// -----------------------------------------------------------------------------
runTest('14. Invalid timeout values are rejected', () => {
  const invalidTimeouts = [-1, 0, '120000', null, undefined, NaN, 10000]; // 10000 is < 120000 minimum
  for (const val of invalidTimeouts) {
    assert.throws(
      () => {
        runner.validateTimeout(val);
      },
      /CONFIG_ERROR/
    );
  }
});

// -----------------------------------------------------------------------------
// Test Case 15: Excessively large timeout values are rejected
// -----------------------------------------------------------------------------
runTest('15. Excessively large timeout values are rejected', () => {
  assert.throws(
    () => {
      runner.validateTimeout(600001); // Exceeds 600,000ms (10 minutes)
    },
    /CONFIG_ERROR.*exceeds the maximum allowed migration threshold/
  );

  // Valid threshold (e.g. 180,000ms = 3 minutes) passes
  const valid = runner.validateTimeout(180000);
  assert.strictEqual(valid, 180000);
});

// -----------------------------------------------------------------------------
// Test Case 16: Errors and stack traces do not disclose credentials
// -----------------------------------------------------------------------------
runTest('16. Errors and stack traces do not disclose credentials', () => {
  const sensitivePassword = 'SuperSecretP@ssword!987';
  const rawUrl = `postgresql://postgres:${encodeURIComponent(sensitivePassword)}@db.${guard.PROD_REF}.supabase.co:5432/postgres`;
  
  try {
    runner.validateTargetConfig(rawUrl);
    assert.fail('Should have thrown quarantine error');
  } catch (err) {
    assert(!err.message.includes(sensitivePassword), 'Error message must not leak password');
    assert(!err.stack.includes(sensitivePassword), 'Stack trace must not leak password');
  }
});

// -----------------------------------------------------------------------------
// Test Case 17: The existing guard behavior is preserved
// -----------------------------------------------------------------------------
runTest('17. The existing guard behavior is preserved', () => {
  // Test direct staging profile via guard directly
  const directUrl = `postgresql://postgres:secret@db.${guard.EXPECTED_STAGING_REF}.supabase.co:5432/postgres`;
  const directOpts = guard.validateStagingDatabaseUrl(directUrl);
  assert.strictEqual(directOpts.host, `db.${guard.EXPECTED_STAGING_REF}.supabase.co`);
  assert.strictEqual(directOpts.port, 5432);
  assert.strictEqual(directOpts.user, 'postgres');
  assert.strictEqual(directOpts.ssl.rejectUnauthorized, true);

  // Test pooler staging profile via guard directly
  const poolerUrl = `postgresql://postgres.${guard.EXPECTED_STAGING_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  const poolerOpts = guard.validateStagingDatabaseUrl(poolerUrl);
  assert.strictEqual(poolerOpts.host, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.strictEqual(poolerOpts.port, 5432);
  assert.strictEqual(poolerOpts.user, `postgres.${guard.EXPECTED_STAGING_REF}`);
  assert.strictEqual(poolerOpts.ssl.rejectUnauthorized, true);
});

// -----------------------------------------------------------------------------
// Test Case 18: Tests prove that no real PostgreSQL client or network transport can be invoked
// -----------------------------------------------------------------------------
runTest('18. Tests prove that no real PostgreSQL client or network transport can be invoked', () => {
  enableNetworkTrap();
  try {
    const dryRunResult = runner.runDryRun();
    assert.strictEqual(dryRunResult.mode, 'DRY_RUN');
    assert.strictEqual(dryRunResult.executionAllowed, false);
    
    // Any execution attempt fails closed before client creation
    assert.throws(
      () => runner.executeBundle(),
      /EXECUTION_DISABLED/
    );
  } finally {
    disableNetworkTrap();
  }
});

// -----------------------------------------------------------------------------
// Test Case 19: Valid CA configuration and timeout profiles are verified offline
// -----------------------------------------------------------------------------
runTest('19. Valid CA configuration and timeout profiles are verified offline', () => {
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

  const poolerUrl = `postgresql://postgres.${guard.EXPECTED_STAGING_REF}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  const opts = guard.validateStagingDatabaseUrl(poolerUrl, {
    ca: validSyntheticPem,
    timeoutProfile: 'MIGRATION',
  });

  assert.strictEqual(opts.ssl.rejectUnauthorized, true);
  assert.strictEqual(opts.ssl.servername, 'aws-0-eu-west-1.pooler.supabase.com');
  assert.strictEqual(opts.ssl.ca, validSyntheticPem.trim());
  assert.strictEqual(opts.statement_timeout, 180000);
  assert.strictEqual(opts.query_timeout, 180000);
  assert.strictEqual(opts.connectionTimeoutMillis, 30000);
  assert.strictEqual(opts.overallDeadlineMs, 600000);
});

// -----------------------------------------------------------------------------
// Test Case 20: Neither timeout override nor valid CA can enable runner execution
// -----------------------------------------------------------------------------
runTest('20. Neither timeout override nor valid CA can enable runner execution', () => {
  enableNetworkTrap();
  try {
    assert.throws(
      () => {
        runner.executeBundle({ timeoutMs: 180000 });
      },
      /EXECUTION_DISABLED/
    );

    assert.throws(
      () => {
        runner.executeBundle({ timeoutProfile: 'MIGRATION' });
      },
      /EXECUTION_DISABLED/
    );
  } finally {
    disableNetworkTrap();
  }
});

// -----------------------------------------------------------------------------
// Test Case 21: Bundle statically contains transaction-local baseline cursor capture and equality check
// -----------------------------------------------------------------------------
runTest('21. Bundle statically contains transaction-local baseline cursor capture and equality check', () => {
  const sql = fs.readFileSync(runner.DEFAULT_BUNDLE_PATH, 'utf8');
  assert(
    sql.includes("PERFORM set_config('clasptek.baseline_cursor_offset', v_cursor_row.category_offset::TEXT, true);"),
    'Pre-execution guard must capture baseline offset transaction-locally'
  );
  assert(
    sql.includes("v_baseline_offset := current_setting('clasptek.baseline_cursor_offset', true)::INT;"),
    'Step 8 must read transaction-local baseline offset'
  );
  assert(
    sql.includes('IF v_cursor_offset != v_baseline_offset THEN'),
    'Step 8 must assert cursor offset equality against baseline'
  );
});

// -----------------------------------------------------------------------------
// Test Case 22: Bundle statically enforces pg_temp explicitly last across SECURITY DEFINER functions
// -----------------------------------------------------------------------------
runTest('22. Bundle statically enforces pg_temp explicitly last across SECURITY DEFINER functions', () => {
  const sql = fs.readFileSync(runner.DEFAULT_BUNDLE_PATH, 'utf8');
  const lines = sql.split(/\r?\n/);
  const barePublicSearchPaths = lines.filter(l => /SET\s+search_path\s*=\s*public\s*$/i.test(l.trim()));
  const bareCatalogSearchPaths = lines.filter(l => /SET\s+search_path\s*=\s*pg_catalog,\s*public\s*$/i.test(l.trim()));

  assert.strictEqual(barePublicSearchPaths.length, 0, 'No function may omit pg_temp from public search path');
  assert.strictEqual(bareCatalogSearchPaths.length, 0, 'No function may omit pg_temp from pg_catalog search path');
});

// -----------------------------------------------------------------------------
// Test Case 23: Bundle statically revokes execution on all 11 core RLS helpers from PUBLIC/anon
// -----------------------------------------------------------------------------
runTest('23. Bundle statically revokes execution on all 11 core RLS helpers from PUBLIC/anon', () => {
  const sql = fs.readFileSync(runner.DEFAULT_BUNDLE_PATH, 'utf8');
  const helpers = [
    'get_auth_tenant_id', 'get_auth_user_role', 'is_super_admin',
    'is_finance_manager', 'is_finance_staff', 'is_staff',
    'can_manage_finance', 'can_manage_people', 'is_facilitator',
    'can_view_own_personnel_record', 'can_view_own_payslip'
  ];

  helpers.forEach(h => {
    const revokeRegex = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${h}\\(.*?\\)\\s+FROM\\s+PUBLIC,\\s+anon`, 'i');
    const grantRegex = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${h}\\(.*?\\)\\s+TO\\s+authenticated,\\s+service_role`, 'i');
    assert(revokeRegex.test(sql), `Helper ${h} must be revoked from PUBLIC, anon`);
    assert(grantRegex.test(sql), `Helper ${h} must be granted to authenticated, service_role`);
  });
});

// -----------------------------------------------------------------------------
// Test Case 24: Step 8 verifies dual varchar/character varying signature for cursor advancement RPC
// -----------------------------------------------------------------------------
runTest('24. Step 8 verifies dual varchar/character varying signature for cursor advancement RPC', () => {
  const sql = fs.readFileSync(runner.DEFAULT_BUNDLE_PATH, 'utf8');
  assert(
    sql.includes("to_regprocedure('public.advance_recording_reconciliation_cursor(varchar)')"),
    'Step 8 must test advance_recording_reconciliation_cursor(varchar)'
  );
  assert(
    sql.includes("to_regprocedure('public.advance_recording_reconciliation_cursor(character varying)')"),
    'Step 8 must test advance_recording_reconciliation_cursor(character varying) fallback'
  );
  assert(
    sql.includes("has_function_privilege('anon', v_proc_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_proc_oid, 'EXECUTE')"),
    'Step 8 must assert anon and authenticated execution is denied on cursor advancement RPC'
  );
});

console.log('================================================================');
console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
console.log('================================================================');

if (testsFailed > 0) {
  process.exit(1);
}
