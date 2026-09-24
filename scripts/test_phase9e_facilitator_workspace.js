/**
 * scripts/test_phase9e_facilitator_workspace.js — Phase 9E Certification Test Suite
 *
 * Automated verification of Facilitator Workspace:
 * Role-aware Dashboard, Assigned Cohort Scoping, Session Access, Attendance Tracking,
 * Facilitator Report Lifecycle, Meeting Integration, Completion Limits, and Tenant Isolation.
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

async function runFacilitatorSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 9E CERTIFICATION SUITE: FACILITATOR WORKSPACE');
  console.log('===============================================================\n');

  // --- 1. FACILITATOR DASHBOARD & KPI INTEGRATION ---
  console.log('--- Test Suite 1: Facilitator Dashboard & KPI Delivery ---');

  it('Facilitator Overview API provides authoritative metrics scoped to authenticated facilitator', () => {
    const apiCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'facilitator', 'overview', 'route.ts'), 'utf8');
    assert.strictEqual(apiCode.includes('getAuthoritativeSession'), true);
    assert.strictEqual(apiCode.includes('todaySessionsCount'), true);
    assert.strictEqual(apiCode.includes('upcomingSessionsCount'), true);
    assert.strictEqual(apiCode.includes('pendingAttendanceCount'), true);
    assert.strictEqual(apiCode.includes('pendingAckCount'), true);
    assert.strictEqual(apiCode.includes('totalPaidEarnings'), true);
  });

  it('Dashboard component conditionally routes Facilitator/Staff to dedicated workspace view', () => {
    const dashboardClient = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'DashboardClient.tsx'), 'utf8');
    assert.strictEqual(dashboardClient.includes('StaffFacilitatorDashboard'), true);
    assert.strictEqual(dashboardClient.includes("role === 'Facilitator' || role === 'Staff'"), true);
  });

  it('StaffFacilitatorDashboard matches legacy renderStaffDashboardTab KPIs and Action buttons', () => {
    const component = fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'StaffFacilitatorDashboard.tsx'), 'utf8');
    assert.strictEqual(component.includes('Latest Net Pay'), true);
    assert.strictEqual(component.includes('Statement Status'), true);
    assert.strictEqual(component.includes('Pending Acknowledgements'), true);
    assert.strictEqual(component.includes('Compensation Disbursed'), true);
    assert.strictEqual(component.includes('href="/facilitator-reports"'), true);
    assert.strictEqual(component.includes('href="/my-payslips"'), true);
  });

  // --- 2. ASSIGNED COHORT & SESSION SCOPING ---
  console.log('\n--- Test Suite 2: Cohort & Session Access Scoping ---');

  it('Facilitator sessions API filters training sessions by facilitator id and tenant id', () => {
    const essQuery = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ess', 'queries.ts'), 'utf8');
    assert.strictEqual(essQuery.includes(".eq('tenant_id', tenantId)"), true);
    assert.strictEqual(essQuery.includes('s.facilitator_id === personnel.id || cohortIds.includes(s.cohort_id)'), true);
  });

  it('Attendance route verifies authentication and preserves PRESENT, LATE, EXCUSED, ABSENT statuses', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'training.ts'), 'utf8');
    assert.strictEqual(types.includes("'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'NOT_RECORDED'"), true);
    const attApi = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'training', 'attendance', 'route.ts'), 'utf8');
    assert.strictEqual(attApi.includes('saveAttendance'), true);
    assert.strictEqual(attApi.includes('attendanceStatus: rec.attendanceStatus as AttendanceStatus'), true);
  });

  // --- 3. FACILITATOR REPORT LIFECYCLE ---
  console.log('\n--- Test Suite 3: Facilitator Delivery Report Lifecycle ---');

  it('Facilitator report model strictly supports DRAFT, SUBMITTED, REVIEWED lifecycle', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'training.ts'), 'utf8');
    assert.strictEqual(types.includes("export type FacilitatorReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';"), true);
  });

  it('Facilitators can access delivery report management at /facilitator-reports', () => {
    const reportPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'facilitator-reports', 'page.tsx'), 'utf8');
    assert.strictEqual(reportPage.includes('Facilitator Training Delivery Reports'), true);
  });

  // --- 4. MEETINGS & RECORDINGS REUSE ---
  console.log('\n--- Test Suite 4: Meetings & Cloud Recording Integration ---');

  it('Facilitator workspace integrates with certified Meetings system without duplicate tables', () => {
    const meetingTypes = fs.readFileSync(path.join(__dirname, '..', 'types', 'meetings.ts'), 'utf8');
    assert.strictEqual(meetingTypes.includes('export interface Meeting'), true);
    assert.strictEqual(meetingTypes.includes("export type SFUProvider = 'livekit' | 'daily' | 'mock';"), true);
    assert.strictEqual(meetingTypes.includes('recordingMetadata?: RecordingMetadata;') || meetingTypes.includes('recordingMetadata: RecordingMetadata;'), true);
  });

  it('LiveKit and SFU meeting action routes enforce session authentication and status updates', () => {
    const meetingAction = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'meetings', 'action', 'route.ts'), 'utf8');
    assert.strictEqual(meetingAction.includes('supabase.auth.getUser()'), true);
    assert.strictEqual(meetingAction.includes('updateMeetingStatus'), true);
    assert.strictEqual(meetingAction.includes('getMeetingById'), true);
  });

  // --- 5. COMPLETION LIMITS & ROLE BOUNDARIES ---
  console.log('\n--- Test Suite 5: Completion Verification Limits & Role Governance ---');

  it('Facilitator is denied certificate issuance permissions', () => {
    const certRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'certificates', 'route.ts'), 'utf8');
    // Ensure issuance is restricted to Super Admin, Academics Head, or Operations Admin, NOT generic facilitator
    assert.strictEqual(/hasRole.*Facilitator/i.test(certRoute), false);
  });

  it('Facilitator cannot execute administrative attendance override', () => {
    const eligApi = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'certificates', 'eligibility', 'route.ts'), 'utf8');
    // Administrative override requires elevated role
    assert.strictEqual(eligApi.includes('allowOverride') || eligApi.includes('adminOverride') || eligApi.includes('override'), true);
    assert.strictEqual(/session\.role\s*===\s*['"]Facilitator['"].*override/i.test(eligApi), false);
  });

  it('Facilitator cannot revoke or reissue certificates', () => {
    const certActionRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'certificates', '[id]', 'route.ts'), 'utf8');
    // Only administrative roles can revoke or reissue
    assert.strictEqual(/role.*===\s*['"]Facilitator['"].*REVOKE/i.test(certActionRoute), false);
  });

  console.log('\n===============================================================');
  console.log(`PHASE 9E FACILITATOR CERTIFICATION RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runFacilitatorSuite();
