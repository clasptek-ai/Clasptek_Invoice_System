/**
 * scripts/run_staging_reconciliation_bundle.js
 * 
 * CLASPTEK PLATFORM SECURITY — STAGING RECONCILIATION BUNDLE RUNNER
 * 
 * Dedicated runner for scripts/staging_reconciliation_bundle.sql.
 * 
 * STRICT PHASE 2AI-C56 CONSTRAINTS:
 * 1. Default mode is strictly offline dry-run (zero client creations, zero network calls, zero SQL execution).
 * 2. Execution mode is STRICTLY DISABLED in this phase. Any attempt to execute fails closed immediately
 *    before any database client creation or network transport can occur.
 * 3. Enforces artifact integrity verification (exact byte size: 217,373 bytes, SHA-256 hash).
 * 4. Resolves artifact path from repository root, invariant to current working directory.
 * 5. Uses existing scripts/staging_connection_guard.js for target validation (quarantine of logaawoigfxnisimfatf).
 * 6. Never falls back to generic DATABASE_URL, production credentials, or implicit connection profiles.
 * 7. Never echoes or prints secrets, passwords, or connection strings.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  PROD_REF,
  EXPECTED_STAGING_REF,
  validateStagingDatabaseUrl,
  createStagingClient,
  redactCredentials,
  sanitizeError,
} = require('./staging_connection_guard');

// Certified artifact invariants established in Phase 2AI-C63
const EXPECTED_BUNDLE_SIZE = 224021;
const EXPECTED_BUNDLE_SHA256 = '4b742665432a75b03354622e1926d20e9cd2d8b6e4ae662fd2f4bad231ee3b23';
const DEFAULT_BUNDLE_PATH = path.resolve(__dirname, 'staging_reconciliation_bundle.sql');

// Migration timeout bounds for future execution planning
const MIN_MIGRATION_TIMEOUT_MS = 120000; // 120 seconds
const MAX_MIGRATION_TIMEOUT_MS = 600000; // 600 seconds (10 minutes)

/**
 * Resolves the absolute path to the reconciliation bundle.
 * Defaults to scripts/staging_reconciliation_bundle.sql relative to this script.
 */
function resolveBundlePath(customPath) {
  if (customPath && typeof customPath === 'string' && customPath.trim()) {
    return path.resolve(process.cwd(), customPath.trim());
  }
  return DEFAULT_BUNDLE_PATH;
}

/**
 * Verifies that the reconciliation bundle exists, has the exact expected byte size,
 * and matches the certified SHA-256 cryptographic hash.
 */
function verifyBundleIntegrity(bundlePath = DEFAULT_BUNDLE_PATH) {
  const resolvedPath = path.resolve(bundlePath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`BUNDLE_ERROR: Bundle file not found at '${resolvedPath}'.`);
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.size !== EXPECTED_BUNDLE_SIZE) {
    throw new Error(
      `BUNDLE_INTEGRITY_ERROR: Expected bundle size ${EXPECTED_BUNDLE_SIZE} bytes, but found ${stat.size} bytes.`
    );
  }

  const content = fs.readFileSync(resolvedPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  
  if (hash !== EXPECTED_BUNDLE_SHA256) {
    throw new Error(
      `BUNDLE_INTEGRITY_ERROR: Bundle SHA-256 mismatch!\nExpected: ${EXPECTED_BUNDLE_SHA256}\nActual:   ${hash}`
    );
  }

  return {
    path: resolvedPath,
    size: stat.size,
    sha256: hash,
    verified: true,
  };
}

/**
 * Validates a prospective migration timeout value in milliseconds.
 * In Phase 2AI-C56, this validates proposed execution timeout boundaries (120s to 600s).
 */
function validateTimeout(timeoutMs) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('CONFIG_ERROR: Timeout must be a positive integer in milliseconds.');
  }

  if (timeoutMs < MIN_MIGRATION_TIMEOUT_MS) {
    throw new Error(
      `CONFIG_ERROR: Timeout ${timeoutMs}ms is below the minimum required migration threshold of ${MIN_MIGRATION_TIMEOUT_MS}ms (120s).`
    );
  }

  if (timeoutMs > MAX_MIGRATION_TIMEOUT_MS) {
    throw new Error(
      `CONFIG_ERROR: Timeout ${timeoutMs}ms exceeds the maximum allowed migration threshold of ${MAX_MIGRATION_TIMEOUT_MS}ms (600s).`
    );
  }

  return timeoutMs;
}

/**
 * Validates a target database connection URL using the certified staging connection guard.
 * Strictly rejects production project 'logaawoigfxnisimfatf', unapproved hosts, or invalid ports.
 */
function validateTargetConfig(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('CONFIG_ERROR: Staging database URL must be explicitly provided. Generic fallbacks are prohibited.');
  }

  // Delegate strictly to certified staging_connection_guard
  return validateStagingDatabaseUrl(rawUrl);
}

/**
 * Executes a strictly offline dry-run verification.
 * 
 * Safety guarantees:
 * - Creates ZERO database clients.
 * - Makes ZERO network transport calls.
 * - Executes ZERO SQL statements.
 * - Validates artifact integrity and reporting metrics.
 */
function runDryRun(options = {}) {
  const bundlePath = resolveBundlePath(options.bundlePath);
  const bundleInfo = verifyBundleIntegrity(bundlePath);

  let targetValidation = null;
  if (options.databaseUrl) {
    try {
      const validatedOpts = validateTargetConfig(options.databaseUrl);
      targetValidation = {
        host: validatedOpts.host,
        port: validatedOpts.port,
        database: validatedOpts.database,
        user: validatedOpts.user,
        tlsEnforced: validatedOpts.ssl.rejectUnauthorized,
        sniServername: validatedOpts.ssl.servername,
        quarantineVerified: true,
      };
    } catch (err) {
      throw sanitizeError(err);
    }
  }

  return {
    mode: 'DRY_RUN',
    executionAllowed: false,
    artifact: {
      path: bundleInfo.path,
      size: bundleInfo.size,
      sha256: bundleInfo.sha256,
      integrityVerified: true,
    },
    targetProject: EXPECTED_STAGING_REF,
    targetValidation: targetValidation,
    guardActive: true,
    status: 'DRY_RUN_PASS',
    message: 'Dry-run verification completed successfully. Database execution is strictly disabled in Phase 2AI-C56.',
  };
}

/**
 * Execution scaffold for future authorized phases.
 * 
 * In Phase 2AI-C56, execution is STRICTLY PROHIBITED.
 * This function unconditionally throws an error before any database client can be created,
 * regardless of flags or parameters passed.
 */
function executeBundle(options = {}) {
  throw new Error(
    'EXECUTION_DISABLED: Execution mode is strictly unauthorized and disabled in Phase 2AI-C56. Zero SQL statements can be sent to any database.'
  );
}

/**
 * Command-line entry point.
 */
function main(argv = process.argv.slice(2)) {
  const isExecFlag = argv.some(arg => ['--execute', '--apply', '--run', '-e'].includes(arg));

  if (isExecFlag) {
    executeBundle();
    return;
  }

  const customBundleArg = argv.find(arg => arg.startsWith('--bundle='));
  const customBundle = customBundleArg ? customBundleArg.split('=')[1] : null;

  try {
    const result = runDryRun({ bundlePath: customBundle });
    console.log('============================================================');
    console.log('CLASPTEK STAGING RECONCILIATION BUNDLE RUNNER (DRY-RUN)');
    console.log('============================================================');
    console.log(`Mode:              ${result.mode}`);
    console.log(`Artifact Path:     ${result.artifact.path}`);
    console.log(`Artifact Size:     ${result.artifact.size} bytes`);
    console.log(`SHA-256 Hash:      ${result.artifact.sha256}`);
    console.log(`Target Project:    ${result.targetProject}`);
    console.log(`Execution Allowed: ${result.executionAllowed ? 'YES' : 'NO (Disabled in Phase C56)'}`);
    console.log(`Status:            ${result.status}`);
    console.log('============================================================');
  } catch (err) {
    const cleanErr = sanitizeError(err);
    console.error(`ERROR: ${cleanErr.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_BUNDLE_SIZE,
  EXPECTED_BUNDLE_SHA256,
  DEFAULT_BUNDLE_PATH,
  MIN_MIGRATION_TIMEOUT_MS,
  MAX_MIGRATION_TIMEOUT_MS,
  resolveBundlePath,
  verifyBundleIntegrity,
  validateTimeout,
  validateTargetConfig,
  runDryRun,
  executeBundle,
  main,
};
