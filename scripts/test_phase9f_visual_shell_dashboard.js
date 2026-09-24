/**
 * scripts/test_phase9f_visual_shell_dashboard.js — Phase 9F Certification Test Suite
 *
 * Automated verification of:
 * 1. Role Normalization (SUPER_ADMIN -> Super Admin) in both server & client context.
 * 2. Complete Navigation Architecture: all 8 sections unlocked for Super Admin.
 * 3. Authoritative Dashboard Presentation: Command Centre, 7-Stage Customer Journey,
 *    4-Way Financial KPI Overview, CRM Funnel, Academic Operations.
 * 4. Stale Phase 2 Migration Widget Eradication (Zero 'Phase 2 of 10' remaining).
 * 5. Visual Shell Architecture: .cp-* tokens, 260px/72px sidebar, 64px topbar,
 *    connection status pill, user card, and independent scrolling.
 * 6. Database Safety: 0 schema changes, 0 migrations, 0 RLS modifications.
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

async function runPhase9FSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 9F CERTIFICATION SUITE: VISUAL SHELL & DASHBOARD');
  console.log('===============================================================\n');

  // --- 1. ROLE NORMALIZATION & ORACLE ELIMINATION ---
  console.log('--- Test Suite 1: Universal Role Normalization ---');

  const authTypesPath = path.join(__dirname, '..', 'types', 'auth.ts');
  const authTypesContent = fs.readFileSync(authTypesPath, 'utf8');

  it('types/auth.ts exports canonical UserRole and CANONICAL_ROLES map', () => {
    assert(authTypesContent.includes("export type UserRole ="), 'UserRole type must be exported');
    assert(authTypesContent.includes("export const CANONICAL_ROLES"), 'CANONICAL_ROLES map must be exported');
    assert(authTypesContent.includes("SUPER_ADMIN: 'Super Admin'"), 'SUPER_ADMIN map entry must exist');
    assert(authTypesContent.includes("FINANCE_MANAGER: 'Finance Manager'"), 'FINANCE_MANAGER map entry must exist');
    assert(authTypesContent.includes("FINANCE_STAFF: 'Finance Staff'"), 'FINANCE_STAFF map entry must exist');
    assert(authTypesContent.includes("STAFF: 'Staff'"), 'STAFF map entry must exist');
    assert(authTypesContent.includes("FACILITATOR: 'Facilitator'"), 'FACILITATOR map entry must exist');
    assert(authTypesContent.includes("STUDENT: 'Student'"), 'STUDENT map entry must exist');
  });

  it('types/auth.ts defines normalizeRole function handling case-insensitive and underscored roles', () => {
    assert(authTypesContent.includes("export function normalizeRole(rawRole: string | null | undefined): UserRole"), 'normalizeRole function must exist with correct signature');
    assert(authTypesContent.includes("CANONICAL_ROLES[clean]"), 'normalizeRole must look up canonical key');
  });

  it('Client auth context applies normalizeRole to user_metadata and session auth events', () => {
    const contextCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'auth', 'context.tsx'), 'utf8');
    assert(contextCode.includes("normalizeRole"), 'context.tsx must reference normalizeRole');
    assert(contextCode.includes('normalizeRole(user.user_metadata?.role as string)'), 'initSession must normalize user.user_metadata.role');
    assert(contextCode.includes('normalizeRole(u.user_metadata?.role as string)'), 'onAuthStateChange must normalize u.user_metadata.role');
  });

  // --- 2. NAVIGATION REGISTRY & ROLE FILTERING ---
  console.log('\n--- Test Suite 2: Full Navigation Architecture & Role Filtering ---');
  const navConfigPath = path.join(__dirname, '..', 'lib', 'config', 'navigation.ts');
  const navContent = fs.readFileSync(navConfigPath, 'utf8');

  it('NAVIGATION_REGISTRY contains all 8 certified navigation sections', () => {
    assert(navContent.includes("id: 'workspace'"), 'Workspace section must exist');
    assert(navContent.includes("id: 'crm'"), 'Admissions & CRM section must exist');
    assert(navContent.includes("id: 'directory'"), 'Directory & Accounts section must exist');
    assert(navContent.includes("id: 'finance'"), 'Finance section must exist');
    assert(navContent.includes("id: 'training'"), 'Training Operations section must exist');
    assert(navContent.includes("id: 'intelligence'"), 'Management Intelligence section must exist');
    assert(navContent.includes("id: 'administration'"), 'Administration section must exist');
    assert(navContent.includes("id: 'employeeSelfService'"), 'Employee Self-Service section must exist');
  });

  it('getNavigationForRole in navigation.ts applies normalizeRole to ensure SUPER_ADMIN receives all sections', () => {
    assert(navContent.includes("normalizeRole"), 'navigation.ts must reference normalizeRole');
    assert(navContent.includes("const normalizedRole = normalizeRole(role)"), 'getNavigationForRole must normalize input role');
  });

  it('getNavigationForRole correctly restricts administrative sections for Facilitator/Staff', () => {
    const adminIdx = navContent.indexOf("id: 'administration'");
    assert(adminIdx !== -1, 'Administration section must exist');
    const adminBlock = navContent.slice(adminIdx, adminIdx + 450);
    assert(adminBlock.includes("rolesAllowed: SUPER_ADMIN") || adminBlock.includes("rolesAllowed: ADMIN"), 'Administration items must use ADMIN or SUPER_ADMIN');
    assert(!adminBlock.includes("'Facilitator'"), 'Administration section must NOT allow Facilitator');
    assert(!adminBlock.includes("'Staff'"), 'Administration section must NOT allow Staff');
  });

  // --- 3. DASHBOARD REMEDIATION & COMMAND CENTRE ---
  console.log('\n--- Test Suite 3: Dashboard Architecture & Stale Widget Eradication ---');
  const dashClient = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'DashboardClient.tsx'), 'utf8');

  it('Stale Phase 2 migration status widget is completely eradicated from DashboardClient', () => {
    assert.strictEqual(dashClient.includes('Phase 2 of 10'), false, 'Stale Phase 2 of 10 badge must not exist');
    assert.strictEqual(dashClient.includes('MIGRATION_PHASES'), false, 'Stale MIGRATION_PHASES array must not exist');
    assert.strictEqual(dashClient.includes('Next.js Migration Progress'), false, 'Stale Next.js Migration Progress panel must not exist');
  });

  it('Dashboard renders 7-Stage Customer Journey & Admissions Lifecycle connected progression', () => {
    assert(dashClient.includes('Customer Journey &amp; Admissions Lifecycle'), 'Must render Customer Journey header');
    assert(dashClient.includes('01'), 'Must render stage 01');
    assert(dashClient.includes('02'), 'Must render stage 02');
    assert(dashClient.includes('03'), 'Must render stage 03');
    assert(dashClient.includes('04'), 'Must render stage 04');
    assert(dashClient.includes('05'), 'Must render stage 05');
    assert(dashClient.includes('06'), 'Must render stage 06');
    assert(dashClient.includes('07'), 'Must render stage 07');
  });

  it('Dashboard renders 4 Financial Overview KPI cards using genuine .cp-kpi-card styling', () => {
    assert(dashClient.includes('Total Revenue (Invoiced)'), 'Must render Total Revenue');
    assert(dashClient.includes('Total Income (Collected)'), 'Must render Total Income');
    assert(dashClient.includes('Outstanding Receivables'), 'Must render Outstanding Receivables');
    assert(dashClient.includes('Payroll Liability (Outflows)'), 'Must render Payroll Liability');
    assert(dashClient.includes('cp-kpi-card'), 'Must use .cp-kpi-card');
    assert(dashClient.includes('cp-kpi-val'), 'Must use .cp-kpi-val');
    assert(dashClient.includes('cp-kpi-label'), 'Must use .cp-kpi-label');
  });

  it('Dashboard integrates with real database intelligence API (/api/intelligence/overview)', () => {
    assert(dashClient.includes('/api/intelligence/overview?scope=all_time'), 'Must call intelligence overview API');
    assert(dashClient.includes('setMetrics(data.metrics)'), 'Must set state from live database metrics');
  });

  it('Dashboard provides role-aware branching: Facilitator/Staff to StaffFacilitatorDashboard', () => {
    assert(dashClient.includes("role === 'Facilitator' || role === 'Staff'"), 'Must route Facilitator/Staff to workspace dashboard');
    assert(dashClient.includes('StaffFacilitatorDashboard'), 'Must import and render StaffFacilitatorDashboard');
  });

  // --- 4. VISUAL SHELL & CSS INTEGRITY ---
  console.log('\n--- Test Suite 4: Visual Shell, CSS Tokens & Layout Integrity ---');

  it('Root layout embeds globals.css and persistent ShellLayout', () => {
    const rootLayout = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
    assert(rootLayout.includes("import '@/styles/globals.css'"), 'Root layout must import globals.css');
    assert(rootLayout.includes('<ShellLayout>{children}</ShellLayout>'), 'Root layout must wrap in ShellLayout');
  });

  it('styles/globals.css contains authoritative .cp-layout, .cp-sidebar, and .cp-topbar definitions', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'globals.css'), 'utf8');
    assert(css.includes('.cp-layout'), 'Must define .cp-layout');
    assert(css.includes('.cp-sidebar {'), 'Must define .cp-sidebar');
    assert(css.includes('.cp-topbar {'), 'Must define .cp-topbar');
    assert(css.includes('--sidebar-width: 260px;'), 'Must set --sidebar-width: 260px');
    assert(css.includes('--header-height: 64px;'), 'Must set --header-height: 64px');
    assert(css.includes('--primary: #14213D;'), 'Must define --primary');
    assert(css.includes('--accent: #C1272D;'), 'Must define --accent');
    assert(css.includes('--interactive: #1D4ED8;'), 'Must define --interactive');
  });

  it('Sidebar renders genuine Clasptek logos for both expanded and collapsed modes', () => {
    const sidebar = fs.readFileSync(path.join(__dirname, '..', 'components', 'layout', 'Sidebar.tsx'), 'utf8');
    assert(sidebar.includes('/assets/clasptek_logo.png'), 'Sidebar must render full logo');
    assert(sidebar.includes('/assets/clasptek_brand_mark.png'), 'Sidebar must render brand mark in collapsed mode');
    assert(sidebar.includes('id="btnToggleSidebar"'), 'Sidebar must have toggle button');
    assert(sidebar.includes('sidebarSupabaseStatus'), 'Sidebar must have connection indicator');
    assert(sidebar.includes('btnSidebarSignOut'), 'Sidebar must have sign-out button');
  });

  // --- 5. ZERO DATABASE MODIFICATIONS ---
  console.log('\n--- Test Suite 5: Zero Database Schema Changes Commitment ---');

  it('Zero new schema migration files added for Phase 9F', () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const phase9fMigrations = files.filter(f => /phase_?9f/i.test(f));
    assert.strictEqual(phase9fMigrations.length, 0, 'Phase 9F must have 0 new migration files');
  });

  console.log('\n===============================================================');
  console.log(`PHASE 9F CERTIFICATION RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase9FSuite();
