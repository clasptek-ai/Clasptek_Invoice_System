/**
 * scripts/test_phase_c328_staff_facilitator_portal_separation.js
 * Comprehensive Verification Suite for Phase C328:
 * Consolidated Staff Portal Restriction, Facilitator Workspace Restoration & Role-Based Access Control
 *
 * Verifies:
 *  1. Staff Navigation: omits Students, Enquiries, Courses, Cohorts, Attendance, Meetings, Reports.
 *  2. Staff Navigation: retains ESS (My Payslips, My Profile & Bank, My Queries, Account Security).
 *  3. Facilitator Navigation: displays Cohort Assigned, Attendance, Meetings, Reports, and ESS.
 *  4. Admin Navigation: retains all modules.
 *  5. Page Route Guards: deny Staff from CRM, Directory, Enrolments, Programmes, Cohorts.
 *  6. Page Route Guards: allow Facilitator on Cohorts with assigned scoping.
 *  7. API Endpoints: deny Staff from Students, Enquiries, Programmes, Enrolments, Cohorts, and Rosters.
 *  8. Facilitator Overview API: isolates data (Staff gets zero training delivery; Facilitator gets full 5-core areas).
 *  9. Facilitator self-approval restriction in training reports queries.
 * 10. Invariance of 5 C320 Security Files.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passedTests++;
    console.log(`  PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

console.log('\n============================================================');
console.log('PHASE C328: STAFF RESTRICTION & FACILITATOR WORKSPACE RESTORATION TEST');
console.log('============================================================\n');

const repoRoot = path.resolve(__dirname, '..');

// Helper to read file from repoRoot
function readFile(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

// ─── 1. NAVIGATION REGISTRY AUDIT ───────────────────────────────────────────
console.log('--- 1. Navigation Registry & Role-Based Filtering Audit ---');
const navFile = readFile('lib/config/navigation.ts');

assert(
  !navFile.includes("const ADMISSIONS_AND_ADMIN: UserRole[] = ['Super Admin', 'Finance Manager', 'Staff']"),
  'ADMISSIONS_AND_ADMIN does NOT include Staff',
  'Staff should be removed from ADMISSIONS_AND_ADMIN'
);

assert(
  navFile.includes("const ADMISSIONS_AND_ADMIN: UserRole[] = ['Super Admin', 'Finance Manager']"),
  'ADMISSIONS_AND_ADMIN is strictly Super Admin and Finance Manager'
);

assert(
  navFile.includes("const COHORTS_ACCESS: UserRole[] = ['Super Admin', 'Finance Manager', 'Facilitator']"),
  'COHORTS_ACCESS includes Super Admin, Finance Manager, and Facilitator'
);

assert(
  navFile.includes("if (normalizedRole === 'Facilitator' && item.id === 'cohorts')") &&
    navFile.includes("label: 'Cohort Assigned'"),
  'Facilitator sees Cohorts relabeled as "Cohort Assigned"'
);

// ─── 2. PAGE ROUTE GUARDS AUDIT ─────────────────────────────────────────────
console.log('\n--- 2. Page Route Guards Role-Based Access Control ---');

// Students Page
const studentsPage = readFile('app/students/page.tsx');
assert(
  !studentsPage.includes("['Super Admin', 'Finance Manager', 'Staff']") &&
    studentsPage.includes("const allowedRoles = ['Super Admin', 'Finance Manager']"),
  'app/students/page.tsx excludes Staff from allowedRoles'
);

// Enquiries Page
const enquiriesPage = readFile('app/enquiries/page.tsx');
assert(
  !enquiriesPage.includes("['Super Admin', 'Finance Manager', 'Staff']") &&
    enquiriesPage.includes("const allowedRoles = ['Super Admin', 'Finance Manager']"),
  'app/enquiries/page.tsx excludes Staff from allowedRoles'
);

// Enrolments Page
const enrolmentsPage = readFile('app/enrolments/page.tsx');
assert(
  !enrolmentsPage.includes("['Super Admin', 'Finance Manager', 'Staff']") &&
    enrolmentsPage.includes("const allowedRoles = ['Super Admin', 'Finance Manager']"),
  'app/enrolments/page.tsx excludes Staff from allowedRoles'
);

// Programmes Page
const programmesPage = readFile('app/programmes/page.tsx');
assert(
  programmesPage.includes("const allowedRoles = ['Super Admin', 'Finance Manager']"),
  'app/programmes/page.tsx excludes Staff from allowedRoles'
);

// Cohorts Page
const cohortsPage = readFile('app/cohorts/page.tsx');
assert(
  cohortsPage.includes("const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator']") &&
    !cohortsPage.includes("allowedRoles = ['Super Admin', 'Finance Manager', 'Staff']"),
  'app/cohorts/page.tsx excludes Staff and authorizes Facilitator'
);
assert(
  cohortsPage.includes("const isFacilitator = session.role === 'Facilitator'") &&
    cohortsPage.includes("facilitatorId = personnelRes?.personnel?.id"),
  'app/cohorts/page.tsx dynamically scopes cohorts to assigned lead facilitator'
);

// ─── 3. COHORTS CLIENT & CLASS ROSTER MODAL AUDIT ───────────────────────────
console.log('\n--- 3. Cohorts Client & Class Roster Component Audit ---');

const cohortsClient = readFile('app/cohorts/CohortsPageClient.tsx');
assert(
  cohortsClient.includes("isFacilitator ? 'Cohort Assigned' : 'Cohorts & Schedules'"),
  'CohortsPageClient displays "Cohort Assigned" heading for Facilitators'
);
assert(
  cohortsClient.includes('!isFacilitator && (') && cohortsClient.includes('TableSelectionBar'),
  'CohortsPageClient hides TableSelectionBar bulk actions for Facilitators'
);
assert(
  cohortsClient.includes('ClassRosterModal'),
  'CohortsPageClient integrates ClassRosterModal component'
);

const rosterModal = readFile('components/cohorts/ClassRosterModal.tsx');
assert(
  rosterModal.includes('/api/training/cohorts/${cohortId}/roster'),
  'ClassRosterModal fetches authoritative cohort roster endpoint'
);

const rosterRoute = readFile('app/api/training/cohorts/[id]/roster/route.ts');
assert(
  rosterRoute.includes("if (session.role === 'Staff' || session.role === 'Student')") &&
    rosterRoute.includes('status: 403'),
  'app/api/training/cohorts/[id]/roster/route.ts denies Staff and Students (403)'
);

// ─── 4. API ROUTE HANDLERS AUTHORIZATION AUDIT ──────────────────────────────
console.log('\n--- 4. API Route Handlers Role-Based Access Control ---');

// Students API
const studentsRoute = readFile('app/api/students/route.ts');
assert(
  studentsRoute.includes("const allowedRoles = ['Super Admin', 'Finance Manager']") &&
    !studentsRoute.includes("'Staff'"),
  'app/api/students/route.ts GET excludes Staff from allowedRoles'
);
assert(
  studentsRoute.includes("const authorizedRoles = ['Super Admin', 'Finance Manager']") &&
    !studentsRoute.includes("const authorizedRoles = ['Super Admin', 'Staff']"),
  'app/api/students/route.ts POST excludes Staff from authorizedRoles'
);

// Students [id] API
const studentIdRoute = readFile('app/api/students/[id]/route.ts');
assert(
  !studentIdRoute.includes("const authorizedRoles = ['Super Admin', 'Staff']"),
  'app/api/students/[id]/route.ts excludes Staff from authorizedRoles'
);

// Students Enrol API
const studentEnrolRoute = readFile('app/api/students/[id]/enrol/route.ts');
assert(
  !studentEnrolRoute.includes("const authorizedRoles = ['Super Admin', 'Staff']") &&
    studentEnrolRoute.includes("const authorizedRoles = ['Super Admin', 'Finance Manager']"),
  'app/api/students/[id]/enrol/route.ts excludes Staff'
);

// Students Dossier API
const studentDossierRoute = readFile('app/api/students/[id]/dossier/route.ts');
assert(
  studentDossierRoute.includes("const allowedRoles = ['Super Admin', 'Finance Manager']") &&
    studentDossierRoute.includes('getAuthoritativeSession'),
  'app/api/students/[id]/dossier/route.ts uses authoritative session and denies unauthorized roles'
);

// Admissions Enquiries API
const enquiriesRoute = readFile('app/api/admissions/enquiries/route.ts');
assert(
  !enquiriesRoute.includes("['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff']") &&
    enquiriesRoute.includes("const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff']"),
  'app/api/admissions/enquiries/route.ts excludes Staff'
);

// Admissions Enquiries Bulk API
const enquiriesBulkRoute = readFile('app/api/admissions/enquiries/bulk/route.ts');
assert(
  !enquiriesBulkRoute.includes("['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff']") &&
    !enquiriesBulkRoute.includes("['Super Admin', 'Staff']"),
  'app/api/admissions/enquiries/bulk/route.ts excludes Staff from bulk actions and deletion'
);

// Admissions Programmes API
const programmesRoute = readFile('app/api/admissions/programmes/route.ts');
assert(
  programmesRoute.includes("if (session.role === 'Staff')") &&
    programmesRoute.includes('status: 403'),
  'app/api/admissions/programmes/route.ts denies Staff (403)'
);

// Admissions Programmes Bulk API
const programmesBulkRoute = readFile('app/api/admissions/programmes/bulk/route.ts');
assert(
  !programmesBulkRoute.includes("const allowedRoles = ['Super Admin', 'Staff']"),
  'app/api/admissions/programmes/bulk/route.ts excludes Staff'
);

// Enrolments Bulk API
const enrolmentsBulkRoute = readFile('app/api/enrolments/bulk/route.ts');
assert(
  !enrolmentsBulkRoute.includes("const allowedRoles = ['Super Admin', 'Staff']"),
  'app/api/enrolments/bulk/route.ts excludes Staff'
);

// Admissions Cohorts API
const cohortsRoute = readFile('app/api/admissions/cohorts/route.ts');
assert(
  cohortsRoute.includes("if (session.role === 'Staff')") &&
    cohortsRoute.includes('status: 403'),
  'app/api/admissions/cohorts/route.ts denies Staff (403)'
);

// ─── 5. FACILITATOR OVERVIEW & WORKSPACE AUDIT ──────────────────────────────
console.log('\n--- 5. Facilitator Overview API & Dashboard Component Audit ---');

const facOverviewRoute = readFile('app/api/facilitator/overview/route.ts');
assert(
  facOverviewRoute.includes("if (session.role === 'Staff')") &&
    facOverviewRoute.includes('assignedCohorts: []') &&
    facOverviewRoute.includes('todaySessionsCount: 0'),
  'app/api/facilitator/overview/route.ts returns zero training delivery data for Staff'
);
assert(
  facOverviewRoute.includes('getTrainingCohorts') &&
    facOverviewRoute.includes('getMeetings') &&
    facOverviewRoute.includes('getFacilitatorReports'),
  'app/api/facilitator/overview/route.ts fetches training delivery modules for Facilitator'
);

const staffFacDashboard = readFile('components/dashboard/StaffFacilitatorDashboard.tsx');
assert(
  staffFacDashboard.includes('ClassRosterModal'),
  'StaffFacilitatorDashboard integrates ClassRosterModal'
);
assert(
  staffFacDashboard.includes('Cohort Assigned') &&
    staffFacDashboard.includes('Attendance &middot; Sessions') &&
    staffFacDashboard.includes('Scheduled Meetings &middot; Live Video') &&
    staffFacDashboard.includes('Facilitator Delivery Reports'),
  'StaffFacilitatorDashboard renders the 5 core Facilitator workspace areas'
);
assert(
  staffFacDashboard.includes('!isFacilitator && (') &&
    staffFacDashboard.includes('STAFF PORTAL · EMPLOYEE SELF SERVICE'),
  'StaffFacilitatorDashboard renders dedicated ESS portal for Staff'
);

// ─── 6. TRAINING WORKFLOW RULES (NO SELF-APPROVAL) ───────────────────────────
console.log('\n--- 6. Training Queries Workflow & Self-Approval Prevention Audit ---');

const trainingQueries = readFile('lib/training/queries.ts');
assert(
  trainingQueries.includes('FORBIDDEN: Facilitators cannot approve or review reports'),
  'lib/training/queries.ts prohibits Facilitator self-approval on reports'
);
assert(
  trainingQueries.includes("session.role === 'Staff' || session.role === 'Student'") &&
    trainingQueries.includes('FORBIDDEN: Staff and Students cannot access cohort enrolment registers'),
  'lib/training/queries.ts forbids Staff and Students from cohort enrolment registers'
);

// ─── 7. INVARIANCE OF 5 PROTECTED C320 SECURITY FILES ────────────────────────
console.log('\n--- 7. C320 Security Files Invariance Audit ---');

const protectedFiles = [
  'app/reset-password/page.tsx',
  'lib/auth/context.tsx',
  'app/dashboard/DashboardClient.tsx',
  'proxy.ts',
  'app/api/intelligence/overview/route.ts',
];

const c320BaseCommit = '47e9e5857736a94c705ad80dbcd217ee4687d117';

for (const file of protectedFiles) {
  try {
    const diff = execSync(`git diff ${c320BaseCommit} -- "${file}"`, { cwd: repoRoot, encoding: 'utf8' }).trim();
    assert(diff === '', `Security file "${file}" is 100% byte-identical to base commit`, `Diff detected: ${diff.slice(0, 80)}`);
  } catch (err) {
    failedTests++;
    console.error(`  FAIL: Git diff error for ${file}:`, err.message);
  }
}

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
