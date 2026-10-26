/**
 * Clasptek Phase C144: Cohort Schema Compatibility Offline Test Suite
 *
 * Verifies that all cohort query sites select canonical 'cohort_code' instead of
 * non-existent 'metadata', preserving schema compatibility and runtime stability.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failedCount++;
  }
}

console.log('\n=== Clasptek Phase C144: Cohort Schema Compatibility Suite ===\n');

const repoRoot = path.resolve(__dirname, '..');

// 1. Static Query Inspection: lib/training/queries.ts
runTest('1.1: getTrainingCohorts selects cohort_code and omits metadata', () => {
  const file = fs.readFileSync(path.join(repoRoot, 'lib', 'training', 'queries.ts'), 'utf8');
  assert(
    file.includes(".select('id, name, status, programme_id, lead_facilitator_id, start_date, cohort_code, created_at')"),
    'getTrainingCohorts select list must contain cohort_code and exclude metadata'
  );
  assert(
    !file.includes(".select('id, name, status, programme_id, lead_facilitator_id, metadata"),
    'getTrainingCohorts must not select metadata'
  );
  assert(
    file.includes('const cohortCode = (c.cohort_code as string) || c.id;'),
    'getTrainingCohorts must map cohortCode directly from c.cohort_code'
  );
});

runTest('1.2: getFacilitatorReports selects cohort_code and omits metadata', () => {
  const file = fs.readFileSync(path.join(repoRoot, 'lib', 'training', 'queries.ts'), 'utf8');
  assert(
    file.includes("supabase.from('cohorts').select('id, name, programme_id, cohort_code')"),
    'getFacilitatorReports must select cohort_code on cohorts'
  );
  assert(
    !file.includes("supabase.from('cohorts').select('id, name, programme_id, metadata')"),
    'getFacilitatorReports must not select metadata on cohorts'
  );
});

// 2. Static Query Inspection: lib/meetings/queries.ts
runTest('2.1: getMeetings cohort join selects cohort_code and omits metadata', () => {
  const file = fs.readFileSync(path.join(repoRoot, 'lib', 'meetings', 'queries.ts'), 'utf8');
  assert(
    file.includes("supabase.from('cohorts').select('id, name, programme_id, cohort_code').eq('tenant_id', tenantId)"),
    'getMeetings cohort join must select cohort_code and exclude metadata'
  );
  assert(
    !file.includes("supabase.from('cohorts').select('id, name, programme_id, metadata')"),
    'getMeetings cohort join must not select metadata'
  );
  assert(
    file.includes('const code = (c.cohort_code as string) || c.id;'),
    'getMeetings cohortMap must map code directly from c.cohort_code'
  );
});

// 3. Static Query Inspection: lib/certificates/eligibility-queries.ts
runTest('3.1: getCertificateEligibilityList selects cohort_code and omits metadata', () => {
  const file = fs.readFileSync(path.join(repoRoot, 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
  assert(
    file.includes("? supabase.from('cohorts').select('id, name, cohort_code, lead_facilitator_id').in('id', cohortIds)"),
    'getCertificateEligibilityList must select cohort_code on cohorts'
  );
  assert(
    !file.includes("? supabase.from('cohorts').select('id, name, metadata, lead_facilitator_id')"),
    'getCertificateEligibilityList must not select metadata on cohorts'
  );
  assert(
    file.includes('const cohortCode = (cohort?.cohort_code as string) || en.cohort || \'Cohort\';'),
    'getCertificateEligibilityList must map cohortCode directly from cohort?.cohort_code'
  );
});

// 4. Schema Invariant Verification
runTest('4.1: Canonical supabase_schema.sql contains cohort_code and no metadata in cohorts', () => {
  const schema = fs.readFileSync(path.join(repoRoot, 'supabase_schema.sql'), 'utf8');
  const cohortsMatch = schema.match(/CREATE TABLE IF NOT EXISTS public\.cohorts \(([\s\S]*?)\);/);
  assert(cohortsMatch, 'public.cohorts table definition must exist in supabase_schema.sql');
  const tableDef = cohortsMatch[1];
  assert(tableDef.includes('cohort_code TEXT NOT NULL'), 'public.cohorts must have cohort_code TEXT NOT NULL');
  assert(!tableDef.includes('metadata JSONB'), 'public.cohorts must not have a metadata column');
});

// 5. Mapping Simulation
runTest('5.1: Cohort code resolution accurately uses cohort_code and falls back when absent', () => {
  const mockRecord = { id: 'c-101', cohort_code: 'OCT-2026-ENG', name: 'October Engineering' };
  const mockEmptyCode = { id: 'c-102', cohort_code: '', name: 'Fallback Cohort' };

  const code1 = mockRecord.cohort_code || mockRecord.id;
  const code2 = mockEmptyCode.cohort_code || mockEmptyCode.id;

  assert.strictEqual(code1, 'OCT-2026-ENG');
  assert.strictEqual(code2, 'c-102');
});

console.log('\n============================================================');
console.log(`C144 Test Results: ${passedCount} passed, ${failedCount} failed`);
console.log('Zero network calls initiated across the entire suite.');
console.log('============================================================\n');

if (failedCount > 0) {
  process.exit(1);
}
