/**
 * scripts/test_phase9b_administration_governance.js
 * Phase 9B: Administration & Governance Certification Suite
 *
 * Validates:
 * 1. People & Access Module Governance (Personnel & User Management, Destructive-action Protection, EMP/FAC Standards)
 * 2. Financial Controls Module Governance (Period Locking, Super Admin Restrictions, Audit Logging)
 * 3. Immutable Audit Log Module Governance (Super Admin Isolation, RFC-4180 CSV Export, No Client Mutability)
 * 4. Settings Module Governance (Super Admin Protection, Secret Safeguards, Payment Accounts)
 * 5. Production Control Module Governance (Safe Diagnostics, Gate Evaluations, No Unrestricted Destruction)
 * 6. Navigation Registry Active State Verification
 * 7. Negative Authorization Role Gating
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let totalPassed = 0;
let totalFailed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    totalFailed++;
  }
}

async function runPhase9bAdministrationGovernanceSuite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 9B GOVERNANCE & CERTIFICATION');
  console.log('======================================================================\n');

  // ─── 1. MODULE 1: PEOPLE & ACCESS ───────────────────────────────────────────
  console.log('[1/7] People & Access Module Governance:');
  const peoplePagePath = path.join(process.cwd(), 'app', 'people-access', 'page.tsx');
  const peopleClientPath = path.join(process.cwd(), 'app', 'people-access', 'PeopleAccessPageClient.tsx');
  const personnelApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'personnel', 'route.ts');
  const usersApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'users', 'route.ts');
  const personnelQueriesPath = path.join(process.cwd(), 'lib', 'admin', 'personnel-queries.ts');

  it('People & Access server route enforces authoritative role gate (Super Admin, Finance Manager)', () => {
    assert(fs.existsSync(peoplePagePath), 'app/people-access/page.tsx must exist');
    const content = fs.readFileSync(peoplePagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve authoritative session');
    assert(content.includes("'Super Admin'") && content.includes("'Finance Manager'"), 'Must guard to Super Admin or Finance Manager');
    assert(content.includes("redirect('/dashboard')") || content.includes("redirect('/login"), 'Must redirect unauthorized actors');
  });

  it('PeopleAccessPageClient consumes downloadSafeCsv for both Users and Personnel exports', () => {
    assert(fs.existsSync(peopleClientPath), 'app/people-access/PeopleAccessPageClient.tsx must exist');
    const content = fs.readFileSync(peopleClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must import and use downloadSafeCsv');
    assert(content.includes('handleExportUsers'), 'Must export users CSV');
    assert(content.includes('handleExportPersonnel'), 'Must export personnel CSV');
  });

  it('Personnel identifier generation enforces canonical EMP-#### and FAC-#### standards', () => {
    assert(fs.existsSync(personnelQueriesPath), 'lib/admin/personnel-queries.ts must exist');
    const content = fs.readFileSync(personnelQueriesPath, 'utf8');
    assert(content.includes("type === 'facilitator' ? 'FAC-' : 'EMP-'"), 'Must use FAC- and EMP- prefixes');
    assert(content.includes('padStart(4, \'0\')'), 'Must enforce 4-digit zero-padded numbers (EMP-####)');
  });

  it('Personnel API enforces server-side requireAuth across GET, POST, PUT, DELETE', () => {
    assert(fs.existsSync(personnelApiPath), 'app/api/admin/personnel/route.ts must exist');
    const content = fs.readFileSync(personnelApiPath, 'utf8');
    assert(content.includes('requireAuth'), 'Must call requireAuth');
    assert(content.includes('allowedRoles'), 'Must declare allowedRoles');
    assert(content.includes('export async function GET'), 'Must export GET handler');
    assert(content.includes('export async function POST'), 'Must export POST handler');
    assert(content.includes('export async function PUT'), 'Must export PUT handler');
    assert(content.includes('export async function DELETE'), 'Must export DELETE handler');
  });

  it('Personnel deletion enforces destructive safeguards: blocks self-deletion & checks payslip/session dependencies', () => {
    const content = fs.readFileSync(personnelApiPath, 'utf8');
    assert(content.includes('Self-deletion prohibited'), 'Must block self-deletion');
    assert(content.includes('payslipCount'), 'Must inspect payslips dependency before deletion');
    assert(content.includes('reportCount') || content.includes('facilitator_reports'), 'Must inspect facilitator reports dependency');
    assert(content.includes('recordFinanceAuditLog'), 'Must record audit log on deletion');
  });

  it('User governance API restricts role changes and account suspensions strictly to Super Admin', () => {
    assert(fs.existsSync(usersApiPath), 'app/api/admin/users/route.ts must exist');
    const content = fs.readFileSync(usersApiPath, 'utf8');
    assert(content.includes("allowedRoles: ['Super Admin']"), 'Must strictly restrict user mutations to Super Admin');
    assert(content.includes('change-role'), 'Must support change-role action');
    assert(content.includes('toggle-status'), 'Must support toggle-status action');
    assert(content.includes('recordFinanceAuditLog'), 'Must log audit event for user mutations');
  });

  // ─── 2. MODULE 2: FINANCIAL CONTROLS ────────────────────────────────────────
  console.log('\n[2/7] Financial Controls Module Governance:');
  const controlsPagePath = path.join(process.cwd(), 'app', 'controls', 'page.tsx');
  const controlsClientPath = path.join(process.cwd(), 'app', 'controls', 'FinancialControlsPageClient.tsx');
  const periodLockApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'controls', 'period-lock', 'route.ts');
  const controlsQueriesPath = path.join(process.cwd(), 'lib', 'controls', 'queries.ts');

  it('Financial Controls server route guards access to Admin roles', () => {
    assert(fs.existsSync(controlsPagePath), 'app/controls/page.tsx must exist');
    const content = fs.readFileSync(controlsPagePath, 'utf8');
    assert(content.includes('getAuthoritativeSession'), 'Must resolve session');
    assert(content.includes("'Super Admin'") && content.includes("'Finance Manager'"), 'Must guard to Super Admin or Finance Manager');
  });

  it('Period lock mutation endpoint strictly requires Super Admin and logs audit trail', () => {
    assert(fs.existsSync(periodLockApiPath), 'app/api/admin/controls/period-lock/route.ts must exist');
    const content = fs.readFileSync(periodLockApiPath, 'utf8');
    assert(content.includes("allowedRoles: ['Super Admin']"), 'Only Super Admin can lock/unlock periods');
    assert(fs.existsSync(controlsQueriesPath), 'lib/controls/queries.ts must exist');
    const qContent = fs.readFileSync(controlsQueriesPath, 'utf8');
    assert(qContent.includes('PERIOD_LOCK_TOGGLE'), 'Must log PERIOD_LOCK_TOGGLE audit event');
  });

  it('Financial Controls UI enforces original visual layout and displays 3-tier approval thresholds', () => {
    assert(fs.existsSync(controlsClientPath), 'app/controls/FinancialControlsPageClient.tsx must exist');
    const content = fs.readFileSync(controlsClientPath, 'utf8');
    assert(content.includes('Approval Tiers'), 'Must display approval tiers card');
    assert(content.includes('Tier 1') && content.includes('Tier 2') && content.includes('Tier 3'), 'Must contain 3 approval tiers');
    assert(content.includes('Accounting Period Status'), 'Must display accounting period status');
  });

  // ─── 3. MODULE 3: AUDIT LOG ─────────────────────────────────────────────────
  console.log('\n[3/7] Immutable Audit Log Module Governance:');
  const auditPagePath = path.join(process.cwd(), 'app', 'audit-log', 'page.tsx');
  const auditClientPath = path.join(process.cwd(), 'app', 'audit-log', 'AuditLogPageClient.tsx');
  const auditApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'audit-log', 'route.ts');

  it('Audit Log server route and API strictly require Super Admin', () => {
    assert(fs.existsSync(auditPagePath), 'app/audit-log/page.tsx must exist');
    const pageContent = fs.readFileSync(auditPagePath, 'utf8');
    assert(pageContent.includes("session.role !== 'Super Admin'"), 'Must enforce Super Admin only for viewing audit logs');

    assert(fs.existsSync(auditApiPath), 'app/api/admin/audit-log/route.ts must exist');
    const apiContent = fs.readFileSync(auditApiPath, 'utf8');
    assert(apiContent.includes("allowedRoles: ['Super Admin']"), 'API must require Super Admin');
  });

  it('Audit Log client component implements safe RFC-4180 CSV export', () => {
    assert(fs.existsSync(auditClientPath), 'app/audit-log/AuditLogPageClient.tsx must exist');
    const content = fs.readFileSync(auditClientPath, 'utf8');
    assert(content.includes('downloadSafeCsv'), 'Must consume downloadSafeCsv');
    assert(content.includes('Audit_Log'), 'Must export Audit_Log filename');
  });

  it('Audit Log maintains immutability: zero mutation or deletion endpoints exist for audit log', () => {
    const apiContent = fs.readFileSync(auditApiPath, 'utf8');
    assert(!apiContent.includes('export async function POST'), 'Audit log API must not expose POST');
    assert(!apiContent.includes('export async function PUT'), 'Audit log API must not expose PUT');
    assert(!apiContent.includes('export async function DELETE'), 'Audit log API must not expose DELETE');
  });

  // ─── 4. MODULE 4: SETTINGS ──────────────────────────────────────────────────
  console.log('\n[4/7] Settings Module Governance:');
  const settingsPagePath = path.join(process.cwd(), 'app', 'settings', 'page.tsx');
  const settingsClientPath = path.join(process.cwd(), 'app', 'settings', 'SettingsPageClient.tsx');
  const settingsApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'settings', 'route.ts');
  const paymentAccountsApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'payment-accounts', 'route.ts');

  it('Settings server route restricts access strictly to Super Admin', () => {
    assert(fs.existsSync(settingsPagePath), 'app/settings/page.tsx must exist');
    const pageContent = fs.readFileSync(settingsPagePath, 'utf8');
    assert(pageContent.includes("session.role !== 'Super Admin'"), 'Must require Super Admin');
  });

  it('Settings client component incorporates all 6 original subtabs', () => {
    assert(fs.existsSync(settingsClientPath), 'app/settings/SettingsPageClient.tsx must exist');
    const content = fs.readFileSync(settingsClientPath, 'utf8');
    assert(content.includes("'company'"), 'Must support company subtab');
    assert(content.includes("'accounts'"), 'Must support accounts subtab');
    assert(content.includes("'invoice'"), 'Must support invoice defaults subtab');
    assert(content.includes("'personnel'"), 'Must support personnel subtab');
    assert(content.includes("'storage'"), 'Must support storage subtab');
    assert(content.includes("'backups'"), 'Must support backups subtab');
  });

  it('Settings and Payment Accounts APIs enforce server-side Super Admin authorization', () => {
    assert(fs.existsSync(settingsApiPath), 'app/api/admin/settings/route.ts must exist');
    const setContent = fs.readFileSync(settingsApiPath, 'utf8');
    assert(setContent.includes("allowedRoles: ['Super Admin']"), 'Settings mutation requires Super Admin');

    assert(fs.existsSync(paymentAccountsApiPath), 'app/api/admin/payment-accounts/route.ts must exist');
    const accContent = fs.readFileSync(paymentAccountsApiPath, 'utf8');
    assert(accContent.includes("allowedRoles: ['Super Admin']"), 'Payment accounts mutation requires Super Admin');
  });

  // ─── 5. MODULE 5: PRODUCTION CONTROL ────────────────────────────────────────
  console.log('\n[5/7] Production Control Module Governance:');
  const prodControlPagePath = path.join(process.cwd(), 'app', 'production-control', 'page.tsx');
  const prodControlClientPath = path.join(process.cwd(), 'app', 'production-control', 'ProductionControlPageClient.tsx');
  const prodDiagnosticsApiPath = path.join(process.cwd(), 'app', 'api', 'admin', 'production-control', 'diagnostics', 'route.ts');
  const prodQueriesPath = path.join(process.cwd(), 'lib', 'production', 'queries.ts');

  it('Production Control server route and API strictly require Super Admin', () => {
    assert(fs.existsSync(prodControlPagePath), 'app/production-control/page.tsx must exist');
    const pageContent = fs.readFileSync(prodControlPagePath, 'utf8');
    assert(pageContent.includes("session.role !== 'Super Admin'"), 'Production control requires Super Admin');

    assert(fs.existsSync(prodDiagnosticsApiPath), 'app/api/admin/production-control/diagnostics/route.ts must exist');
    const apiContent = fs.readFileSync(prodDiagnosticsApiPath, 'utf8');
    assert(apiContent.includes("allowedRoles: ['Super Admin']"), 'Diagnostics API requires Super Admin');
  });

  it('Production Control diagnostic queries evaluate 15-point deployment gate and ledger equations', () => {
    assert(fs.existsSync(prodQueriesPath), 'lib/production/queries.ts must exist');
    const content = fs.readFileSync(prodQueriesPath, 'utf8');
    assert(content.includes('evaluateProductionGate'), 'Must evaluate 15-point gate');
    assert(content.includes('evaluateContinuousReconciliation'), 'Must evaluate continuous reconciliation');
    assert(content.includes('evaluateFinancialLedger'), 'Must evaluate financial ledger equations');
  });

  it('Production Control client preserves Phase 15 authority verification and disaster recovery queue', () => {
    assert(fs.existsSync(prodControlClientPath), 'app/production-control/ProductionControlPageClient.tsx must exist');
    const content = fs.readFileSync(prodControlClientPath, 'utf8');
    assert(content.includes('PHASE 15: REAL SUPABASE SCHEMA DEPLOYMENT'), 'Must display Phase 15 banner');
    assert(content.includes('Transaction Recovery Queue'), 'Must display recovery queue');
    assert(content.includes('Adjusted Bank Balance Reconciliation'), 'Must display bank reconciliation tool');
  });

  // ─── 6. NAVIGATION REGISTRY INTEGRATION ────────────────────────────────────
  console.log('\n[6/7] Navigation Registry Active Verification:');
  const navConfigPath = path.join(process.cwd(), 'lib', 'config', 'navigation.ts');

  it('All 5 Administration modules are registered and ACTIVE with zero isDisabled flags', () => {
    assert(fs.existsSync(navConfigPath), 'lib/config/navigation.ts must exist');
    const content = fs.readFileSync(navConfigPath, 'utf8');

    const adminSectionStart = content.indexOf("id: 'administration'");
    assert(adminSectionStart !== -1, 'Administration section must exist');
    const adminSection = content.slice(adminSectionStart);

    assert(adminSection.includes("href: '/production-control'"), 'Production control must route to /production-control');
    assert(adminSection.includes("href: '/people-access'"), 'People & Access must route to /people-access');
    assert(adminSection.includes("href: '/controls'"), 'Financial controls must route to /controls');
    assert(adminSection.includes("href: '/audit-log'"), 'Audit log must route to /audit-log');
    assert(adminSection.includes("href: '/settings'"), 'Settings must route to /settings');

    assert(!adminSection.includes("id: 'productionControl',\n        label: 'Production Control',\n        href: '#'"), 'Production control must not be disabled');
    assert(!adminSection.includes("id: 'usersRoles',\n        label: 'People & Access',\n        href: '#'"), 'People & access must not be disabled');
    assert(!adminSection.includes("id: 'financialControls',\n        label: 'Financial Controls',\n        href: '#'"), 'Financial controls must not be disabled');
    assert(!adminSection.includes("id: 'auditLog',\n        label: 'Audit Log',\n        href: '#'"), 'Audit log must not be disabled');
    assert(!adminSection.includes("id: 'settings',\n        label: 'Settings',\n        href: '#'"), 'Settings must not be disabled');
  });

  // ─── 7. NEGATIVE AUTHORIZATION ROLE GATING ─────────────────────────────────
  console.log('\n[7/7] Negative Authorization & Cross-Role Security Gating:');

  it('Non-admin roles (Student, Staff, Facilitator, Finance Viewer) are barred from administrative routes', () => {
    const rolesPath = path.join(process.cwd(), 'types', 'auth.ts');
    const authContent = fs.readFileSync(rolesPath, 'utf8');
    assert(authContent.includes("'Student'"), 'Student role must exist');
    assert(authContent.includes("'Staff'"), 'Staff role must exist');
    assert(authContent.includes("'Facilitator'"), 'Facilitator role must exist');
    assert(authContent.includes("'Finance Viewer'"), 'Finance Viewer role must exist');

    // Verify all 5 routes reject these roles
    const routes = [
      { file: peoplePagePath, allowed: ['Super Admin', 'Finance Manager'] },
      { file: controlsPagePath, allowed: ['Super Admin', 'Finance Manager'] },
      { file: auditPagePath, allowed: ['Super Admin'] },
      { file: settingsPagePath, allowed: ['Super Admin'] },
      { file: prodControlPagePath, allowed: ['Super Admin'] },
    ];

    routes.forEach(({ file, allowed }) => {
      const cnt = fs.readFileSync(file, 'utf8');
      ['Student', 'Staff', 'Facilitator', 'Finance Viewer'].forEach((role) => {
        if (!allowed.includes(role)) {
          // Confirm code does not allow this role
          assert(!cnt.includes(`'${role}'`), `File ${path.basename(file)} must not include '${role}' in allowed roles`);
        }
      });
    });
  });

  console.log('\n======================================================================');
  console.log(` PHASE 9B CERTIFICATION RESULTS: ${totalPassed} PASSED / ${totalFailed} FAILED`);
  console.log('======================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhase9bAdministrationGovernanceSuite().catch((err) => {
  console.error('Fatal error during Phase 9B test execution:', err);
  process.exit(1);
});
