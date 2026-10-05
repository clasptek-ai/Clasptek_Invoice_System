/**
 * scratch/test_phase1_security_containment.js
 * Comprehensive automated security containment and authorization test suite.
 * Validates role-based route guards, API guards, facilitator scoping, and navigation registry.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Test runner state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
  }
}

function describe(suiteName, fn) {
  console.log(`\n=== ${suiteName} ===`);
  fn();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PAGE ROUTE GUARDS VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Page Route Guards Authorization Matrix', () => {
  const root = path.resolve(__dirname, '..');

  const pageGuards = [
    {
      file: 'app/payroll/page.tsx',
      route: '/payroll',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/payroll',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/invoices/page.tsx',
      route: '/invoices',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/invoices',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/payments/page.tsx',
      route: '/payments',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/payments',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/intelligence/page.tsx',
      route: '/intelligence',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/intelligence',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/reports/page.tsx',
      route: '/reports',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/reports',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/students/page.tsx',
      route: '/students',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
      blockedRoles: ['Facilitator', 'Student'],
      redirectUnauth: '/login?next=/students',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/enquiries/page.tsx',
      route: '/enquiries',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
      blockedRoles: ['Facilitator', 'Student'],
      redirectUnauth: '/login?next=/enquiries',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/enrolments/page.tsx',
      route: '/enrolments',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
      blockedRoles: ['Facilitator', 'Student'],
      redirectUnauth: '/login?next=/enrolments',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/cohorts/page.tsx',
      route: '/cohorts',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/cohorts',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/programmes/page.tsx',
      route: '/programmes',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/programmes',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/attendance/page.tsx',
      route: '/attendance',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Facilitator'],
      blockedRoles: ['Staff', 'Student'],
      redirectUnauth: '/login?next=/attendance',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/meetings/page.tsx',
      route: '/meetings',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Facilitator'],
      blockedRoles: ['Staff', 'Student'],
      redirectUnauth: '/login?next=/meetings',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/facilitator-reports/page.tsx',
      route: '/facilitator-reports',
      allowedRoles: ['Super Admin', 'Finance Manager', 'Facilitator'],
      blockedRoles: ['Staff', 'Student'],
      redirectUnauth: '/login?next=/facilitator-reports',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/certificate-eligibility/page.tsx',
      route: '/certificate-eligibility',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/certificate-eligibility',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/certificates/page.tsx',
      route: '/certificates',
      allowedRoles: ['Super Admin', 'Finance Manager'],
      blockedRoles: ['Staff', 'Facilitator', 'Student'],
      redirectUnauth: '/login?next=/certificates',
      redirectUnauthRole: '/dashboard',
    },
    {
      file: 'app/my-sessions/page.tsx',
      route: '/my-sessions',
      allowedRoles: ['Super Admin', 'Facilitator'],
      blockedRoles: ['Staff', 'Student'],
      redirectUnauth: '/login?next=/my-sessions',
      redirectUnauthRole: '/dashboard',
    },
  ];

  for (const item of pageGuards) {
    const fullPath = path.join(root, item.file);
    const content = fs.readFileSync(fullPath, 'utf8');

    it(`[${item.route}] uses getAuthoritativeSession() and redirects unauthenticated to ${item.redirectUnauth}`, () => {
      assert(content.includes('getAuthoritativeSession'), `Missing getAuthoritativeSession in ${item.file}`);
      assert(content.includes(`redirect('${item.redirectUnauth}')`), `Missing redirect to ${item.redirectUnauth} in ${item.file}`);
    });

    it(`[${item.route}] redirects unauthorized roles to ${item.redirectUnauthRole}`, () => {
      assert(content.includes(`redirect('${item.redirectUnauthRole}')`), `Missing redirect to ${item.redirectUnauthRole} in ${item.file}`);
    });

    it(`[${item.route}] restricts access strictly to allowed roles`, () => {
      for (const role of item.allowedRoles) {
        assert(content.includes(`'${role}'`) || content.includes(`"${role}"`), `Expected allowed role '${role}' in ${item.file}`);
      }
      for (const role of item.blockedRoles) {
        // Ensure blocked role is not in allowedRoles array in that file
        const roleArrMatch = content.match(/allowedRoles\s*=\s*\[([^\]]+)\]/);
        if (roleArrMatch) {
          const arrStr = roleArrMatch[1];
          assert(!arrStr.includes(`'${role}'`) && !arrStr.includes(`"${role}"`), `Blocked role '${role}' found in allowedRoles array in ${item.file}`);
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. API ENDPOINTS AUTHORIZATION HARDENING
// ─────────────────────────────────────────────────────────────────────────────
describe('API Endpoints Role & Operation Guards', () => {
  const root = path.resolve(__dirname, '..');

  it('POST /api/admissions/cohorts restricts cohort creation strictly to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/admissions/cohorts/route.ts'), 'utf8');
    assert(content.includes("allowedRoles = ['Super Admin', 'Finance Manager']"), 'Staff should NOT be allowed to create cohorts');
  });

  it('POST /api/admissions/cohorts/bulk restricts bulk creation strictly to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/admissions/cohorts/bulk/route.ts'), 'utf8');
    assert(content.includes("allowedRoles = ['Super Admin', 'Finance Manager']"), 'Staff should NOT be allowed bulk cohort creation');
  });

  it('GET /api/students rejects Facilitators and Students with 403 Forbidden', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/students/route.ts'), 'utf8');
    assert(content.includes("session.role === 'Facilitator' || session.role === 'Student'"), 'Facilitators and Students must be blocked from organization-wide directory');
    assert(content.includes('status: 403'), 'Expected 403 Forbidden status code');
  });

  it('POST /api/meetings/create restricts meeting creation strictly to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/meetings/create/route.ts'), 'utf8');
    assert(content.includes("allowedRoles = ['Super Admin', 'Finance Manager']"), 'Facilitators and Staff must not create meetings');
    assert(content.includes('tenantId = session.tenantId'), 'Must use dynamic authoritative session tenant ID');
  });

  it('POST /api/meetings/action DELETE_MEETING restricts deletion strictly to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/meetings/action/route.ts'), 'utf8');
    assert(content.includes("!['Super Admin', 'Finance Manager'].includes(session.role)"), 'General staff and facilitators must not delete meetings');
  });

  it('POST /api/meetings/action END_MEETING verifies facilitator assignment', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/meetings/action/route.ts'), 'utf8');
    assert(content.includes("session.role === 'Facilitator'"), 'Must verify facilitator role on END_MEETING');
    assert(content.includes('mtgRes.data.facilitatorId !== persId'), 'Facilitator cannot end unrelated meetings');
  });

  it('POST /api/meetings/join resolves authoritative personnel ID and validates facilitator and student cohort assignment', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/meetings/join/route.ts'), 'utf8');
    assert(content.includes('getAuthoritativePersonnel'), 'Must resolve authoritative personnel before checking assignment');
    assert(content.includes('meeting.facilitatorId === persId'), 'Must compare meeting.facilitatorId with personnel.id');
    assert(content.includes('UNAUTHORIZED_MEETING_ACCESS'), 'Must reject unauthorized participants');
  });

  it('PATCH /api/training/attendance restricts historical attendance correction to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/training/attendance/route.ts'), 'utf8');
    assert(content.includes("allowedRoles = ['Super Admin', 'Finance Manager']"), 'Only administrators may correct historical attendance');
  });

  it('PATCH /api/training/facilitator-reports restricts report review to Super Admin and Finance Manager', () => {
    const content = fs.readFileSync(path.join(root, 'app/api/training/facilitator-reports/route.ts'), 'utf8');
    assert(content.includes("allowedRoles = ['Super Admin', 'Finance Manager']"), 'Only administrators may review and sign off facilitator reports');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FACILITATOR QUERY & DATA SCOPING
// ─────────────────────────────────────────────────────────────────────────────
describe('Facilitator Data Scoping & Query Invariants', () => {
  const root = path.resolve(__dirname, '..');
  const trainingQueries = fs.readFileSync(path.join(root, 'lib/training/queries.ts'), 'utf8');
  const meetingQueries = fs.readFileSync(path.join(root, 'lib/meetings/queries.ts'), 'utf8');

  it('getTrainingCohorts() scopes queries by lead_facilitator_id for Facilitators', () => {
    assert(trainingQueries.includes("session.role === 'Facilitator'"), 'Missing Facilitator check in getTrainingCohorts');
    assert(trainingQueries.includes(".eq('lead_facilitator_id', persId)"), 'Must scope cohorts to lead_facilitator_id');
  });

  it('getCohortEnrolmentsWithStudents() verifies facilitator is assigned to cohort', () => {
    assert(trainingQueries.includes(".eq('lead_facilitator_id', persId)"), 'Must verify facilitator is assigned before returning learners');
    assert(trainingQueries.includes('FORBIDDEN: You are not assigned to this cohort'), 'Must deny unassigned cohort access');
  });

  it('saveAttendance() verifies facilitator assignment to session or cohort', () => {
    assert(trainingQueries.includes('trainingSession.facilitator_id !== persId'), 'Must check facilitator session assignment');
    assert(trainingQueries.includes('cohortRow?.lead_facilitator_id !== persId'), 'Must check cohort lead assignment');
  });

  it('correctAttendance() denies non-admin execution', () => {
    assert(trainingQueries.includes("const allowedCorrectionRoles = ['Super Admin', 'Finance Manager']"), 'Must restrict attendance corrections to Admins');
  });

  it('getFacilitatorReports() scopes to facilitator_id = persId for Facilitators', () => {
    assert(trainingQueries.includes(".eq('facilitator_id', persId)"), 'Must scope facilitator reports to author only');
  });

  it('saveFacilitatorReport() blocks Facilitators from reviewing their own reports', () => {
    assert(trainingQueries.includes("data.status === 'REVIEWED'"), 'Must intercept REVIEWED status on facilitator save');
    assert(trainingQueries.includes('FORBIDDEN: Facilitators cannot approve or review reports'), 'Must disallow self-review');
  });

  it('getMeetings() scopes to assigned facilitatorId and assigned cohortIds for Facilitators', () => {
    assert(meetingQueries.includes('m.facilitatorId === persId'), 'Must check meeting facilitator assignment');
    assert(meetingQueries.includes('assignedCohortIds.includes(m.cohortId)'), 'Must check meeting cohort assignment');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. NAVIGATION REGISTRY VISIBILITY BY ROLE
// ─────────────────────────────────────────────────────────────────────────────
describe('Navigation Registry Visibility by Role', () => {
  const root = path.resolve(__dirname, '..');
  const navContent = fs.readFileSync(path.join(root, 'lib/config/navigation.ts'), 'utf8');

  it('defines ADMISSIONS_AND_ADMIN, TRAINING_DELIVERY, and FACILITATOR_SESSIONS', () => {
    assert(navContent.includes('ADMISSIONS_AND_ADMIN'), 'Missing ADMISSIONS_AND_ADMIN group');
    assert(navContent.includes('TRAINING_DELIVERY'), 'Missing TRAINING_DELIVERY group');
    assert(navContent.includes('FACILITATOR_SESSIONS'), 'Missing FACILITATOR_SESSIONS group');
  });

  it('removes Enquiries, Students, and Enrolments from Facilitator', () => {
    const enquiriesMatch = navContent.match(/id:\s*'enquiries'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    const studentsMatch = navContent.match(/id:\s*'students'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    const enrolmentsMatch = navContent.match(/id:\s*'enrolments'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);

    assert.strictEqual(enquiriesMatch[1], 'ADMISSIONS_AND_ADMIN');
    assert.strictEqual(studentsMatch[1], 'ADMISSIONS_AND_ADMIN');
    assert.strictEqual(enrolmentsMatch[1], 'ADMISSIONS_AND_ADMIN');
  });

  it('removes Attendance, Meetings, and Facilitator Reports from General Staff', () => {
    const attendanceMatch = navContent.match(/id:\s*'attendance'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    const meetingsMatch = navContent.match(/id:\s*'meetings'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    const reportsMatch = navContent.match(/id:\s*'facilitatorReports'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);

    assert.strictEqual(attendanceMatch[1], 'TRAINING_DELIVERY');
    assert.strictEqual(meetingsMatch[1], 'TRAINING_DELIVERY');
    assert.strictEqual(reportsMatch[1], 'TRAINING_DELIVERY');
  });

  it('removes Certificate Eligibility and Certificates from Staff and Facilitators', () => {
    const completionsMatch = navContent.match(/id:\s*'completions'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    const certsMatch = navContent.match(/id:\s*'certificates'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);

    assert.strictEqual(completionsMatch[1], 'ADMIN');
    assert.strictEqual(certsMatch[1], 'ADMIN');
  });

  it('restricts My Training Sessions strictly to Facilitator (and Super Admin)', () => {
    const sessionsMatch = navContent.match(/id:\s*'mySessions'[\s\S]*?rolesAllowed:\s*([A-Za-z0-9_]+)/);
    assert.strictEqual(sessionsMatch[1], 'FACILITATOR_SESSIONS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RLS MIGRATION FILE VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
describe('RLS Migration File Verification', () => {
  const root = path.resolve(__dirname, '..');
  const migrationPath = path.join(root, 'migrations/20261005_phase1_security_containment.sql');

  it('migration file exists and contains all required table security policies', () => {
    assert(fs.existsSync(migrationPath), 'Migration file must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert(sql.includes('public.students'), 'Missing students table policies');
    assert(sql.includes('public.cohorts'), 'Missing cohorts table policies');
    assert(sql.includes('public.enrolments'), 'Missing enrolments table policies');
    assert(sql.includes('public.attendance'), 'Missing attendance table policies');
    assert(sql.includes('public.facilitator_reports'), 'Missing facilitator_reports table policies');
    assert(sql.includes('public.meetings'), 'Missing meetings table policies');

    assert(sql.includes('attendance_admin_correction_update'), 'Missing attendance admin correction update policy');
    assert(sql.includes('facilitator_reports_scoped_update'), 'Missing facilitator reports scoped update policy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n============================================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
console.log(`============================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
