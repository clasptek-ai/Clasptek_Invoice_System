/**
 * Clasptek Phase C264: Staging Target Guard Adversarial Test Suite
 *
 * Verifies that validateStagingTarget enforces:
 * 1. Correct staging direct hostname -> PASS
 * 2. Correct approved staging pooler hostname -> PASS
 * 3. Production direct hostname -> REJECT
 * 4. Production pooler username -> REJECT
 * 5. Unknown project -> REJECT
 * 6. Hostname containing a staging reference as an untrusted substring -> REJECT
 * 7. Missing project reference -> REJECT
 * 8. Malformed URL -> REJECT
 * 9. Missing username -> REJECT
 * 10. Mismatched host and username -> REJECT
 * 11. URL containing misleading query parameters -> REJECT
 * 12. Empty environment variable -> REJECT
 * 13. Production fallback attempt -> REJECT
 * 14. Zero secret leakage in sanitized output -> PASS
 */

const assert = require('assert');
const path = require('path');
const {
  DESIGNATED_STAGING_PROJECT_REF,
  PROTECTED_PRODUCTION_PROJECT_REF,
  validateStagingTarget,
  sanitizeConnectionString,
} = require('./staging-target-guard.js');

console.log('======================================================================');
console.log(' CLASPTEK PHASE C264 — STAGING TARGET GUARD ADVERSARIAL SUITE');
console.log('======================================================================\n');

let passCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] Scenario ${String(totalCount).padStart(2, '0')}: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] Scenario ${String(totalCount).padStart(2, '0')}: ${name} -> ${err.message}`);
  }
}

// 1. Correct staging direct hostname
runTest('Scenario 01: Correct staging direct hostname is approved', () => {
  const url = `postgres://postgres:SuperSecret123@db.${DESIGNATED_STAGING_PROJECT_REF}.supabase.co:5432/postgres`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.projectRef, DESIGNATED_STAGING_PROJECT_REF);
  assert.strictEqual(res.connectionType, 'direct');
  assert.strictEqual(res.sanitizedHost, `db.${DESIGNATED_STAGING_PROJECT_REF}.supabase.co`);
  assert.strictEqual(res.port, 5432);
});

// 2. Correct approved staging pooler hostname
runTest('Scenario 02: Correct approved staging pooler hostname with project-scoped username is approved', () => {
  const url = `postgres://postgres.${DESIGNATED_STAGING_PROJECT_REF}:SuperSecret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.projectRef, DESIGNATED_STAGING_PROJECT_REF);
  assert.strictEqual(res.connectionType, 'pooler');
  assert.strictEqual(res.sanitizedHost, 'aws-0-us-east-1.pooler.supabase.com');
  assert.strictEqual(res.port, 6543);
});

// 3. Production direct hostname
runTest('Scenario 03: Production direct hostname is hard-rejected', () => {
  const url = `postgres://postgres:SuperSecret123@db.${PROTECTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'PRODUCTION_TARGET_DETECTED');
  assert(res.error.includes('Production project reference'));
});

// 4. Production pooler username
runTest('Scenario 04: Production pooler username is hard-rejected', () => {
  const url = `postgres://postgres.${PROTECTED_PRODUCTION_PROJECT_REF}:SuperSecret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'PRODUCTION_TARGET_DETECTED');
  assert(res.error.includes('Production project reference'));
});

// 5. Unknown project direct hostname
runTest('Scenario 05: Unknown project direct hostname is rejected', () => {
  const url = 'postgres://postgres:SuperSecret123@db.unknownprojectxyz987.supabase.co:5432/postgres';
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'UNKNOWN_PROJECT_REF');
});

// 6. Hostname containing staging reference as an untrusted substring
runTest('Scenario 06: Hostname containing staging reference as untrusted substring is rejected', () => {
  const url = `postgres://postgres:SuperSecret123@db.${DESIGNATED_STAGING_PROJECT_REF}.attacker-controlled.net:5432/postgres`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'UNTRUSTED_SUBSTRING');
});

// 7. Missing project reference
runTest('Scenario 07: Connection to generic host without project reference is rejected', () => {
  const url = 'postgres://postgres:SuperSecret123@localhost:5432/postgres';
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'UNAPPROVED_HOST');
});

// 8. Malformed URL
runTest('Scenario 08: Malformed connection URL is safely rejected', () => {
  const url = 'not-a-valid-connection-string';
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'MALFORMED_URL');
});

// 9. Missing username on pooler connection
runTest('Scenario 09: Missing username on pooler connection is rejected', () => {
  const url = 'postgres://:SuperSecret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'INVALID_POOLER_USER');
});

// 10. Mismatched host and username
runTest('Scenario 10: Pooler username targeting different project is rejected', () => {
  const url = 'postgres://postgres.anotherprojectref:SuperSecret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'UNKNOWN_PROJECT_REF');
});

// 11. URL containing misleading query parameters
runTest('Scenario 11: Host spoofing via misleading query parameter is rejected', () => {
  const url = `postgres://postgres:SuperSecret123@db.unknownproject.supabase.co:5432/postgres?project=${DESIGNATED_STAGING_PROJECT_REF}`;
  const res = validateStagingTarget(url);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'UNKNOWN_PROJECT_REF');
});

// 12. Empty environment variable
runTest('Scenario 12: Empty or null connection string is rejected', () => {
  const res1 = validateStagingTarget('');
  assert.strictEqual(res1.valid, false);
  assert.strictEqual(res1.code, 'MISSING_METADATA');

  const res2 = validateStagingTarget(null);
  assert.strictEqual(res2.valid, false);
  assert.strictEqual(res2.code, 'MISSING_METADATA');

  const res3 = validateStagingTarget('   ');
  assert.strictEqual(res3.valid, false);
  assert.strictEqual(res3.code, 'MISSING_METADATA');
});

// 13. Production fallback attempt
runTest('Scenario 13: Attempt to resolve fallback containing production reference is blocked', () => {
  const simulatedEnv = {
    STAGING_DATABASE_URL: '',
    DATABASE_URL: `postgres://postgres:Secret@db.${PROTECTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
  };

  const candidateUrl = simulatedEnv.STAGING_DATABASE_URL || simulatedEnv.DATABASE_URL;
  const res = validateStagingTarget(candidateUrl);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.code, 'PRODUCTION_TARGET_DETECTED');
});

// 14. Zero secret leakage in sanitized output
runTest('Scenario 14: Sanitize connection string strips password completely', () => {
  const rawUrl = `postgres://postgres.${DESIGNATED_STAGING_PROJECT_REF}:MyUltraSecretPassword999@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  const sanitized = sanitizeConnectionString(rawUrl);
  assert(!sanitized.includes('MyUltraSecretPassword999'), 'Password must never appear in sanitized output');
  assert(sanitized.includes('[REDACTED]'), 'Password must be replaced by [REDACTED]');
  assert(sanitized.includes('aws-0-us-east-1.pooler.supabase.com'));
});

console.log(`\n======================================================================`);
console.log(` PHASE C264 STAGING TARGET GUARD RESULTS: ${passCount} PASSED / ${totalCount - passCount} FAILED`);
console.log(`======================================================================`);

if (passCount !== totalCount) {
  process.exit(1);
}

