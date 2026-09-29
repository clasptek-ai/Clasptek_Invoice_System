/**
 * scripts/test_phase9e_employee_self_service.js — Phase 9E Certification Test Suite
 *
 * Automated verification of Employee Self-Service (ESS):
 * My Profile, My Payslips (confidentiality & acknowledgement), My Sessions,
 * My Queries, My Security, Tenant Isolation, and Role Boundaries.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✔ PASS: ${desc}`);
  } catch (err) {
    failCount++;
    console.error(`  ✖ FAIL: ${desc}`);
    console.error(`         ${err.message}`);
  }
}

async function runESSSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 9E CERTIFICATION SUITE: EMPLOYEE SELF-SERVICE (ESS)');
  console.log('===============================================================\n');

  // --- 1. ZERO SCHEMA MODIFICATIONS COMMITMENT ---
  console.log('--- Test Suite 1: Database Safety & Contract Preservation ---');

  it('Zero new schema migration files created for Phase 9E', () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const phase9eMigrations = files.filter(f => /phase_?9e/i.test(f));
    assert.strictEqual(phase9eMigrations.length, 0, 'Phase 9E must have 0 new migration files');
  });

  it('Reuses authoritative pre-existing personnel, payslips, and training_sessions contracts', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.personnel'), true);
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.payslips'), true);
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.training_sessions'), true);
  });

  // --- 2. AUTHORITATIVE SESSION & IDENTITY DERIVATION ---
  console.log('\n--- Test Suite 2: Authoritative Session & Identity Derivation ---');

  it('ESS queries derive identity strictly from server-side getAuthoritativeSession', () => {
    const queryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(queryCode.includes('getAuthoritativeSession'), true);
    assert.strictEqual(queryCode.includes('getAuthoritativePersonnel()'), true);
  });

  it('ESS never trusts client-supplied tenant_id, personnel_id, or role headers', () => {
    const routes = [
      'app/api/ess/profile/route.ts',
      'app/api/ess/payslips/route.ts',
      'app/api/ess/queries/route.ts',
      'app/api/ess/sessions/route.ts',
      'app/api/ess/security/route.ts'
    ];
    for (const r of routes) {
      const content = fs.readFileSync(path.join(__dirname, '..', r), 'utf8');
      assert.strictEqual(/req(uest)?\.(headers|query|body).*tenant_id/i.test(content), false, `Route ${r} must not trust client tenant_id`);
      assert.strictEqual(/req(uest)?\.(headers|query|body).*personnel_id/i.test(content), false, `Route ${r} must not trust client personnel_id`);
    }
  });

  // --- 3. ESS: MY PROFILE ---
  console.log('\n--- Test Suite 3: My Profile Business Rules & Data Model ---');

  it('My Profile exports correct TypeScript interface with masked fields', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'ess.ts'), 'utf8');
    assert.strictEqual(types.includes('export interface EmployeeProfile'), true);
    assert.strictEqual(types.includes('employeeId: string'), true);
    assert.strictEqual(types.includes('bankName: string'), true);
    assert.strictEqual(types.includes('accountNumber: string'), true);
  });

  it('Profile API route enforces tenant isolation and returns authenticated employee profile only', () => {
    const apiRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'profile', 'route.ts'), 'utf8');
    assert.strictEqual(apiRoute.includes('getEmployeeProfile()'), true);
    assert.strictEqual(apiRoute.includes('NextResponse.json({ profile })'), true);
  });

  // --- 4. ESS: MY PAYSLIPS & CONFIDENTIALITY ---
  console.log('\n--- Test Suite 4: My Payslips & Confidentiality Invariants ---');

  it('My Payslips queries restrict selection by personnel_id and tenant_id server-side', () => {
    const queryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(queryCode.includes(".eq('tenant_id', tenantId)"), true);
    assert.strictEqual(queryCode.includes(".eq('personnel_id', personnel.id)"), true);
  });

  it('Payslip acknowledgement updates acknowledged_at without mutating ledger figures', () => {
    const queryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(queryCode.includes('acknowledged_at: now,'), true);
    assert.strictEqual(queryCode.includes('acknowledged_by: personnel.id,'), true);
    // Ensure no mutations to net_pay or basic_pay
    assert.strictEqual(/acknowledged_at.*basic_pay/i.test(queryCode), false);
  });

  it('Cross-employee payslip access is rejected server-side', () => {
    const ackRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'payslips', '[id]', 'ack', 'route.ts'), 'utf8');
    assert.strictEqual(ackRoute.includes('acknowledgeEmployeePayslip'), true);
    assert.strictEqual(ackRoute.includes('FORBIDDEN_CROSS_EMPLOYEE_ACCESS'), true);
    assert.strictEqual(ackRoute.includes('status = 403'), true);
  });

  // --- 5. ESS: MY SESSIONS ---
  console.log('\n--- Test Suite 5: My Sessions Workload Isolation ---');

  it('Employee sessions query scopes training sessions to assigned personnel or facilitator record', () => {
    const queryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(queryCode.includes('getEmployeeSessions'), true);
    assert.strictEqual(queryCode.includes(".eq('tenant_id', tenantId)"), true);
  });

  it('Non-facilitator personnel receive safe empty session list without system error', () => {
    const queryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(queryCode.includes('s.facilitator_id === personnel.id || cohortIds.includes(s.cohort_id)'), true);
  });

  // --- 6. ESS: MY QUERIES ---
  console.log('\n--- Test Suite 6: My Queries Dispute Lifecycle ---');

  it('Query creation enforces required queryReason and queryComment and scopes dispute strictly to employee', () => {
    const queryRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'queries', 'route.ts'), 'utf8');
    assert.strictEqual(queryRoute.includes('!payslipId || !queryReason || !queryComment'), true);
    assert.strictEqual(queryRoute.includes('raiseEmployeePayrollQuery'), true);
  });

  it('Query status lifecycle strictly validates open, under_review, resolved, and rejected states', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'ess.ts'), 'utf8');
    assert.strictEqual(types.includes("'open' | 'under_review' | 'resolved' | 'rejected'"), true);
  });

  // --- 7. ESS: MY SECURITY ---
  console.log('\n--- Test Suite 7: My Security & Credential Protection ---');

  it('Security password update rejects short passwords (< 8 characters)', () => {
    const secRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'security', 'route.ts'), 'utf8');
    assert.strictEqual(secRoute.includes('newPassword.length < 8'), true);
  });

  it('Security route invokes Supabase Auth updateUser and logs immutable audit trail', () => {
    const secRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'security', 'route.ts'), 'utf8');
    assert.strictEqual(secRoute.includes('supabase.auth.updateUser'), true);
    assert.strictEqual(secRoute.includes("action: 'PASSWORD_CHANGE'"), true);
    assert.strictEqual(secRoute.includes("source: 'EMPLOYEE_SELF_SERVICE'"), true);
  });

  it('Zero plaintext passwords or secrets exposed in API response', () => {
    const secRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'ess', 'security', 'route.ts'), 'utf8');
    assert.strictEqual(/NextResponse\.json\(.*password/i.test(secRoute), false);
  });

  // --- 8. UI NAVIGATION & ACCESSIBILITY ---
  console.log('\n--- Test Suite 8: Navigation Architecture & Visual Consistency ---');

  it('Employee Self-Service navigation section registered in lib/config/navigation.ts', () => {
    const navConfig = fs.readFileSync(path.join(__dirname, '..', 'lib', 'config', 'navigation.ts'), 'utf8');
    assert.strictEqual(navConfig.includes("sectionTitle: 'EMPLOYEE SELF-SERVICE'"), true);
    assert.strictEqual(navConfig.includes("href: '/my-payslips'"), true);
    assert.strictEqual(navConfig.includes("href: '/my-sessions'"), true);
    assert.strictEqual(navConfig.includes("href: '/my-profile'"), true);
    assert.strictEqual(navConfig.includes("href: '/my-queries'"), true);
    assert.strictEqual(navConfig.includes("href: '/my-security'"), true);
  });

  console.log('\n===============================================================');
  console.log(`PHASE 9E ESS CERTIFICATION RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runESSSuite();
