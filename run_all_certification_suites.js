/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Automated Full-Spectrum Master Certification Runner (Phases 1 - 15)
 */

const { execSync } = require('child_process');

const suites = [
  { name: 'Authentication & Session Architecture', file: 'test_auth_suite.js' },
  { name: 'Phase 3: Payroll & HR Management', file: 'test_phase3_payroll_hr.js' },
  { name: 'Phase 9: Operational Integration & Facilitator Portal', file: 'test_phase9_operational_integration.js' },
  { name: 'Phase 10: Financial Governance & Operational Intelligence', file: 'test_phase10_operational_intelligence.js' },
  { name: 'Phase 11: Financial Intelligence & Decision Support', file: 'test_phase11_financial_intelligence.js' },
  { name: 'Phase 12: Financial Governance & Controls', file: 'test_phase12_financial_governance.js' },
  { name: 'Phase 13: Enterprise Production Security & RLS', file: 'test_phase13_production_certification.js' },
  { name: 'Supabase Database Persistence Probe', file: 'test_supabase_persistence.js' },
  { name: 'Production Persistence Verification Cycle', file: 'test_production_persistence_verification.js' },
  { name: 'Phase 14: Live Supabase Connectivity Repair', file: 'test_phase14_live_production_connectivity.js' },
  { name: 'Phase 14: Production Data Recovery & Safe Migration', file: 'test_phase14_production_data_migration.js' },
  { name: 'Phase 15: Production Cutover, Controls & Recovery', file: 'test_phase15_production_control.js' },
  { name: 'Phase 15: Supabase Connectivity, Validation & Authoritative Mode', file: 'test_phase15_supabase_connectivity.js' },
  { name: 'Phase 15: Production Supabase Activation, Auth Repair & Live Migration', file: 'test_phase15_supabase_activation.js' },
  { name: 'Phase 14.1: Supabase 401 Authentication Resolution & Connectivity Certification', file: 'test_phase14_1_supabase_401_resolution.js' },
  { name: 'Phase 14.2: Component 0 Environment / Deployment Credential Resolution', file: 'test_phase14_2_credential_resolution.js' }
];

let totalPassed = 0;
let totalFailed = 0;
let totalAssertions = 0;

console.log('========================================================================================');
console.log(' CLASPTEK ENTERPRISE PLATFORM — MASTER AUTOMATED TEST CERTIFICATION SUITE');
console.log('========================================================================================\n');

suites.forEach((suite, idx) => {
  try {
    const out = execSync(`node ${suite.file}`, { encoding: 'utf8' });
    const match = out.match(/(\d+)\s+PASSED\s*\/\s*(\d+)\s+FAILED/i);
    if (match) {
      const p = parseInt(match[1], 10);
      const f = parseInt(match[2], 10);
      totalPassed += p;
      totalFailed += f;
      totalAssertions += (p + f);
      console.log(`[${String(idx + 1).padStart(2, '0')}/${suites.length}] ✔ ${suite.file} — ${p} passed, ${f} failed (${suite.name})`);
    } else {
      console.log(`[${String(idx + 1).padStart(2, '0')}/${suites.length}] ✔ ${suite.file} — Completed (${suite.name})`);
    }
  } catch (err) {
    console.error(`[${String(idx + 1).padStart(2, '0')}/${suites.length}] ✖ ${suite.file} — FAILED: ${err.message}`);
    totalFailed++;
  }
});

console.log('\n========================================================================================');
console.log(` MASTER CERTIFICATION RESULT: ${totalPassed} PASSED / ${totalFailed} FAILED (TOTAL ${totalAssertions} ASSERTIONS)`);
console.log(` 100% REGRESSION PASS RATE: ${totalFailed === 0 ? 'CERTIFIED GREEN' : 'FAILED'}`);
console.log('========================================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
