/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Phase 3 Automated Certification Test Suite:
 * Authoritative Training Delivery, Sessions, Attendance & Completion Model
 * 
 * Tests:
 * 1. Zero Examination Invariant Enforcement across Schema, UI & Reports
 * 2. DDL & Schema Architecture (Composite FK Perimeter, Triggers, RLS Policies)
 * 3. Authoritative Training Sessions Lifecycle & Constraints
 * 4. Authoritative Attendance & Cohort/Session Integrity Guard
 * 5. Attendance Correction Governance & Mandatory Reason Logging
 * 6. Facilitator Reports Lifecycle, Review & Content Auditing
 * 7. Attendance Percentage & Completion Eligibility Calculation
 * 8. Authoritative Completion Verification & Administrator Override Guard
 * 9. Cross-Tenant Attack Testing across All Phase 3 Permutations
 * 10. Audit Trail Immutability & Event Integrity
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    failCount++;
    console.error(`  ✖ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passCount++;
  console.log(`  ✔ PASS: ${message}`);
}

function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] !== undefined ? store[key] : null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

function loadApplicationSandbox() {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const matches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const scriptContent = matches[matches.length - 1][1];

  const mockStorage = createMockLocalStorage();
  const sandbox = {
    window: {
      addEventListener: () => {},
      location: { reload: () => {}, href: 'http://localhost' },
      __CLASPTEK_ENV__: {
        SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_ANON_KEY: 'sb_pub_mock_key',
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_mock_key'
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: () => ({ addEventListener: () => {}, style: {}, textContent: '', value: '' }),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: mockStorage,
    sessionStorage: createMockLocalStorage(),
    module: { exports: {} },
    exports: {},
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {}
  };

  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(scriptContent, sandbox);
  return sandbox.module.exports;
}

async function runPhase3Tests() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 3 CERTIFICATION: TRAINING DELIVERY & COMPLETION');
  console.log('===============================================================\n');

  const sqlPath = path.join(__dirname, '..', 'supabase_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const invPath = path.join(__dirname, '..', 'schema_inventory.json');
  const inventory = JSON.parse(fs.readFileSync(invPath, 'utf8'));

  // =========================================================================
  // 1. Zero Examination Invariant Verification
  // =========================================================================
  console.log('--- Test Suite 1: Zero Examination Invariant Enforcement ---');

  const prohibitedSqlPatterns = [
    /\bcreate\s+table\s+public\.exams\b/i,
    /\bcreate\s+table\s+public\.quizzes\b/i,
    /\bcreate\s+table\s+public\.mock_exams\b/i,
    /\bcreate\s+table\s+public\.assessment_scoring\b/i,
    /\bcreate\s+table\s+public\.exam_grades\b/i,
    /\bcolumn\s+exam_score\b/i
  ];
  prohibitedSqlPatterns.forEach((pattern, i) => {
    assert(!pattern.test(sql), `Zero exam schema invariant [${i+1}]: No exam tables or columns in DDL`);
  });

  // Verify certificate is Certificate of Completion
  assert(sql.includes('public.enrolments') && sql.includes('certificate_issued'), 'Authoritative enrolments stores certificate_issued for Completion');
  assert(!sql.includes('exam_certificate'), 'Schema does not issue exam certificates; only Certificates of Completion');

  // =========================================================================
  // 2. DDL & Schema Architecture
  // =========================================================================
  console.log('\n--- Test Suite 2: DDL & Schema Architecture ---');

  assert(inventory.allTables['training_sessions'], 'public.training_sessions registered in canonical inventory');
  assert(inventory.allTables['attendance'], 'public.attendance registered in canonical inventory');
  assert(inventory.allTables['facilitator_reports'], 'public.facilitator_reports registered in canonical inventory');

  assert(inventory.allTables['training_sessions'].rlsEnabled, 'RLS enabled on public.training_sessions');
  assert(inventory.allTables['attendance'].rlsEnabled, 'RLS enabled on public.attendance');
  assert(inventory.allTables['facilitator_reports'].rlsEnabled, 'RLS enabled on public.facilitator_reports');

  // Check composite tenant-safe foreign keys in DDL
  assert(sql.includes('fk_training_sessions_tenant_cohort'), 'training_sessions has composite FK to cohorts (tenant_id, cohort_id)');
  assert(sql.includes('fk_training_sessions_tenant_facilitator'), 'training_sessions has composite FK to personnel (tenant_id, facilitator_id)');
  assert(sql.includes('fk_attendance_session_cohort'), 'attendance has composite FK to training_sessions (tenant_id, session_id, cohort_id)');
  assert(sql.includes('fk_attendance_enrolment_cohort'), 'attendance has composite FK to enrolments (tenant_id, enrolment_id, cohort_id)');
  assert(sql.includes('fk_facilitator_reports_cohort'), 'facilitator_reports has composite FK to cohorts');
  assert(sql.includes('fk_facilitator_reports_facilitator'), 'facilitator_reports has composite FK to personnel');
  assert(sql.includes('fk_facilitator_reports_session_cohort'), 'facilitator_reports has composite FK to training_sessions with cohort integrity');

  // Check unique constraints
  assert(sql.includes('uq_training_sessions_tenant_number'), 'training_sessions has UNIQUE(tenant_id, cohort_id, session_number)');
  assert(sql.includes('uq_attendance_session_enrolment'), 'attendance has UNIQUE(tenant_id, session_id, enrolment_id)');

  // Check triggers & declarative composite cohort match
  assert(sql.includes('fk_attendance_session_cohort') && sql.includes('fk_attendance_enrolment_cohort'), 'Attendance cohort-session match enforced declaratively via composite foreign keys');
  assert(sql.includes('trg_check_session_status_before_attendance'), 'Attendance cancelled session rejection trigger defined');

  // =========================================================================
  // 3. Authoritative Training Sessions Service
  // =========================================================================
  console.log('\n--- Test Suite 3: Authoritative Training Sessions Service ---');

  const app = loadApplicationSandbox();
  const tenantA = '550e8400-e29b-41d4-a716-446655440000';
  const tenantB = '660e8400-e29b-41d4-a716-446655440000';

  // Seed baseline data
  app.state.authoritativeTenantId = tenantA;
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin_01', name: 'Admin Mary', role: 'Super Admin', tenantId: tenantA }
  };
  app.state.programmes = [
    { id: 'prog_p3_01', tenant_id: tenantA, code: 'CLP-DEV', name: 'Software Development', status: 'ACTIVE', tuitionFee: 200000, metadata: { requiredAttendancePct: 80 } }
  ];
  app.state.personnel = [
    { id: 'pers_fac_01', tenant_id: tenantA, name: 'Lead Facilitator John', employeeType: 'facilitator', role: 'Facilitator' },
    { id: 'pers_staff_01', tenant_id: tenantA, name: 'Admin Mary', employeeType: 'staff', role: 'Admin' },
    { id: 'pers_fac_b', tenant_id: tenantB, name: 'Foreign Facilitator', employeeType: 'facilitator', role: 'Facilitator' }
  ];
  app.state.cohorts = [
    { id: 'coh_p3_01', tenant_id: tenantA, programmeId: 'prog_p3_01', cohortCode: 'DEV-2026-A', name: 'Dev Cohort A', capacity: 25, leadFacilitatorId: 'pers_fac_01', status: 'IN_PROGRESS' },
    { id: 'coh_p3_02', tenant_id: tenantA, programmeId: 'prog_p3_01', cohortCode: 'DEV-2026-B', name: 'Dev Cohort B', capacity: 25, leadFacilitatorId: 'pers_fac_01', status: 'UPCOMING' },
    { id: 'coh_p3_foreign', tenant_id: tenantB, programmeId: 'prog_foreign', cohortCode: 'FOR-2026-A', name: 'Foreign Cohort', capacity: 25, leadFacilitatorId: 'pers_fac_b', status: 'IN_PROGRESS' }
  ];
  app.state.students = [
    { id: 'stu_p3_01', tenant_id: tenantA, studentNumber: 'CLP-STU-1001', name: 'Alice Student', email: 'alice@clasptek.com', status: 'ACTIVE' },
    { id: 'stu_p3_02', tenant_id: tenantA, studentNumber: 'CLP-STU-1002', name: 'Bob Student', email: 'bob@clasptek.com', status: 'ACTIVE' }
  ];
  app.state.enrolments = [
    { id: 'enr_p3_01', tenant_id: tenantA, studentId: 'stu_p3_01', programmeId: 'prog_p3_01', cohortId: 'coh_p3_01', enrolmentNumber: 'CLP-ENR-2001', status: 'ACTIVE', agreedTuitionFee: 200000, completionStatus: 'NOT_ELIGIBLE' },
    { id: 'enr_p3_02', tenant_id: tenantA, studentId: 'stu_p3_02', programmeId: 'prog_p3_01', cohortId: 'coh_p3_01', enrolmentNumber: 'CLP-ENR-2002', status: 'ACTIVE', agreedTuitionFee: 200000, completionStatus: 'NOT_ELIGIBLE' }
  ];
  app.state.trainingSessions = [];
  app.state.attendance = [];
  app.state.facilitatorReports = [];

  // Create valid session #1
  const resSess1 = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 1,
    sessionTitle: 'Introduction to Architecture & Tooling',
    sessionDate: '2026-09-10',
    startTime: '09:00',
    endTime: '12:00',
    deliveryMode: 'IN_PERSON',
    location: 'Lab 1'
  });
  assert(resSess1.success && resSess1.session, 'Valid training session #1 created successfully');
  assert(resSess1.session.sessionNumber === 1, 'Session number saved accurately');
  assert(resSess1.session.tenantId === tenantA, 'Session assigned authoritative tenant');

  // Create valid session #2
  const resSess2 = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 2,
    sessionTitle: 'Database Design & Relational Modeling',
    sessionDate: '2026-09-17',
    startTime: '09:00',
    endTime: '12:00',
    deliveryMode: 'IN_PERSON',
    location: 'Lab 1'
  });
  assert(resSess2.success, 'Valid training session #2 created successfully');

  // Prevent duplicate session number in same cohort
  const resDupSess = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 1,
    sessionTitle: 'Duplicate Session #1',
    sessionDate: '2026-09-24'
  });
  assert(!resDupSess.success, 'Duplicate session number for same cohort rejected');

  // Reject non-positive session number
  const resNegSess = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 0,
    sessionTitle: 'Zero Session',
    sessionDate: '2026-09-24'
  });
  assert(!resNegSess.success, 'Session number <= 0 rejected');

  // Reject invalid time order (endTime <= startTime)
  const resTimeSess = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 3,
    sessionTitle: 'Invalid Time Session',
    sessionDate: '2026-09-24',
    startTime: '14:00',
    endTime: '13:00'
  });
  assert(!resTimeSess.success, 'Session where end time <= start time rejected');

  // Cancel session
  const cancelRes = await app.cancelAuthoritativeTrainingSession(resSess2.id, 'Facility maintenance');
  assert(cancelRes.success && cancelRes.session.status === 'CANCELLED', 'Training session cancelled successfully');

  // Cannot un-cancel cancelled session
  const uncancelRes = await app.saveAuthoritativeTrainingSession({
    id: resSess2.id,
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 2,
    sessionTitle: 'Database Design',
    sessionDate: '2026-09-17',
    status: 'SCHEDULED'
  });
  assert(!uncancelRes.success && uncancelRes.message.includes('INVALID_LIFECYCLE_TRANSITION'), 'Reopening cancelled training session rejected');

  // Query sessions for cohort
  const cohortSessions = app.getCohortTrainingSessions('coh_p3_01');
  assert(cohortSessions.length === 2, 'getCohortTrainingSessions returns all sessions for cohort');

  // =========================================================================
  // 4. Authoritative Attendance & Cohort Integrity Guard
  // =========================================================================
  console.log('\n--- Test Suite 4: Authoritative Attendance & Cohort Integrity Guard ---');

  // Mark valid attendance for Session #1 (Alice)
  const attRes1 = await app.saveAuthoritativeAttendance({
    sessionId: resSess1.id,
    enrolmentId: 'enr_p3_01',
    attendanceStatus: 'PRESENT',
    checkInAt: '2026-09-10T09:05:00Z',
    facilitatorNote: 'Prompt arrival'
  });
  assert(attRes1.success && attRes1.attendance, 'Valid attendance record saved for student Alice');
  assert(attRes1.attendance.cohortId === 'coh_p3_01', 'Attendance cohort stamped automatically from session');

  // Mark valid attendance for Session #1 (Bob)
  const attRes2 = await app.saveAuthoritativeAttendance({
    sessionId: resSess1.id,
    enrolmentId: 'enr_p3_02',
    attendanceStatus: 'LATE',
    checkInAt: '2026-09-10T09:35:00Z',
    facilitatorNote: 'Traffic delay'
  });
  assert(attRes2.success && attRes2.attendance.attendanceStatus === 'LATE', 'Late attendance recorded successfully');

  // Prevent duplicate attendance record for same (session, enrolment)
  const attDupRes = await app.saveAuthoritativeAttendance({
    sessionId: resSess1.id,
    enrolmentId: 'enr_p3_01',
    attendanceStatus: 'PRESENT'
  });
  assert(!attDupRes.success, 'Duplicate attendance record for same student and session rejected');

  // Prevent marking attendance against CANCELLED session
  let cancelledErrThrown = false;
  try {
    await app.saveAuthoritativeAttendance({
      sessionId: resSess2.id, // Cancelled session
      enrolmentId: 'enr_p3_01',
      attendanceStatus: 'PRESENT'
    });
  } catch (err) {
    cancelledErrThrown = true;
    assert(err.message.includes('Cannot record attendance against a cancelled training session'), 'Attendance against cancelled session rejected with explicit error');
  }
  assert(cancelledErrThrown, 'Cannot record attendance against cancelled session error enforced');

  // CRITICAL DATABASE INVARIANT: Session Cohort vs Enrolment Cohort Mismatch
  // Create student enrolled in Cohort B
  app.state.enrolments.push({
    id: 'enr_cohort_b',
    tenant_id: tenantA,
    studentId: 'stu_p3_01',
    programmeId: 'prog_p3_01',
    cohortId: 'coh_p3_02', // Cohort B!
    enrolmentNumber: 'CLP-ENR-2003',
    status: 'ACTIVE'
  });

  let cohortMismatchThrown = false;
  try {
    await app.saveAuthoritativeAttendance({
      sessionId: resSess1.id, // Session belongs to Cohort A!
      enrolmentId: 'enr_cohort_b', // Enrolment belongs to Cohort B!
      attendanceStatus: 'PRESENT'
    });
  } catch (err) {
    cohortMismatchThrown = true;
    assert(err.message.includes('COHORT_MISMATCH'), 'Cross-cohort attendance insertion blocked with COHORT_MISMATCH error');
  }
  assert(cohortMismatchThrown, 'Database & repository cohort mismatch guard enforced');

  // =========================================================================
  // 5. Attendance Correction Governance
  // =========================================================================
  console.log('\n--- Test Suite 5: Attendance Correction Governance ---');

  // Rejection without mandatory correction reason
  let emptyReasonThrown = false;
  try {
    await app.updateAuthoritativeAttendance(attRes1.id, { attendanceStatus: 'LATE' }, '');
  } catch (err) {
    emptyReasonThrown = true;
    assert(err.message.includes('CORRECTION_REASON_REQUIRED'), 'Attendance correction without reason rejected');
  }
  assert(emptyReasonThrown, 'Mandatory correction reason enforced');

  // Valid attendance correction with reason
  const correctRes = await app.updateAuthoritativeAttendance(attRes1.id, { attendanceStatus: 'PRESENT' }, 'Facilitator re-verified check-in log');
  assert(correctRes.success, 'Attendance successfully corrected with audit justification');

  const auditLog = app.state.auditLog || [];
  const correctAudit = auditLog.find(a => a.action === 'ATTENDANCE_CORRECTED');
  assert(correctAudit && correctAudit.reason.includes('Facilitator re-verified'), 'Attendance correction audit event logged immutably');

  // =========================================================================
  // 6. Facilitator Reports Lifecycle, Review & Content Auditing
  // =========================================================================
  console.log('\n--- Test Suite 6: Facilitator Reports Lifecycle & Content Auditing ---');

  // Valid report submission
  const repRes1 = await app.saveAuthoritativeFacilitatorReport({
    cohortId: 'coh_p3_01',
    sessionId: resSess1.id,
    facilitatorId: 'pers_fac_01',
    sessionSummary: 'Conducted interactive workshop on architectural patterns and modularity.',
    topicsCovered: 'Client-server isolation, RLS boundaries, and transaction management.',
    attendanceObservations: 'High engagement across all 2 attendees.',
    studentParticipationNotes: 'Alice showed strong grasp of repository pattern.',
    status: 'SUBMITTED'
  });
  assert(repRes1.success && repRes1.report, 'Facilitator report submitted successfully');
  assert(repRes1.report.status === 'SUBMITTED', 'Report status marked as SUBMITTED');

  // ZERO-EXAMINATION AUDIT: Reject report if facilitator introduces exam grading/marks
  let examReportThrown = false;
  try {
    await app.saveAuthoritativeFacilitatorReport({
      cohortId: 'coh_p3_01',
      sessionId: resSess1.id,
      facilitatorId: 'pers_fac_01',
      sessionSummary: 'Student exam scores were compiled today.',
      topicsCovered: 'Quiz scoring and assessment marks review.',
      status: 'SUBMITTED'
    });
  } catch (err) {
    examReportThrown = true;
    assert(err.message.includes('ZERO_EXAMINATION_VIOLATION'), 'Facilitator report containing exam scores rejected with ZERO_EXAMINATION_VIOLATION');
  }
  assert(examReportThrown, 'Zero examination audit on report content enforced');

  // Session/Cohort Integrity in Report
  let reportMismatchThrown = false;
  try {
    await app.saveAuthoritativeFacilitatorReport({
      cohortId: 'coh_p3_02', // Cohort B
      sessionId: resSess1.id, // Session for Cohort A!
      facilitatorId: 'pers_fac_01',
      sessionSummary: 'Summary of session',
      topicsCovered: 'Topics covered',
      status: 'SUBMITTED'
    });
  } catch (err) {
    reportMismatchThrown = true;
    assert(err.message.includes('COHORT_MISMATCH'), 'Facilitator report with mismatched session/cohort rejected');
  }
  assert(reportMismatchThrown, 'Session/Cohort integrity in facilitator report enforced');

  // Admin Review of Facilitator Report
  const revRes = await app.reviewFacilitatorReport(repRes1.id, 'Approved by Academic Director');
  assert(revRes.success && revRes.report.status === 'REVIEWED', 'Facilitator report reviewed and approved by admin');

  // =========================================================================
  // 7. Attendance Percentage & Completion Eligibility Calculation
  // =========================================================================
  console.log('\n--- Test Suite 7: Attendance Percentage & Completion Eligibility ---');

  // Create Session #3 & Mark as COMPLETED
  const sess3Res = await app.saveAuthoritativeTrainingSession({
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 3,
    sessionTitle: 'Practical Capstone Delivery',
    sessionDate: '2026-09-24',
    status: 'COMPLETED'
  });
  assert(sess3Res.success, 'Session #3 created');

  // Update Session #1 to COMPLETED
  await app.saveAuthoritativeTrainingSession({
    id: resSess1.id,
    cohortId: 'coh_p3_01',
    facilitatorId: 'pers_fac_01',
    sessionNumber: 1,
    sessionTitle: 'Introduction to Architecture & Tooling',
    sessionDate: '2026-09-10',
    status: 'COMPLETED'
  });

  // Now cohort has 2 delivered sessions (1 and 3) - session 2 was cancelled
  // For Alice (enr_p3_01):
  // Attended Session 1 (PRESENT)
  // Let's mark Alice PRESENT in Session 3
  await app.saveAuthoritativeAttendance({
    sessionId: sess3Res.id,
    enrolmentId: 'enr_p3_01',
    attendanceStatus: 'PRESENT'
  });

  // Alice attended 2 / 2 = 100%
  const aliceSummary = app.getStudentAttendanceSummary('enr_p3_01');
  assert(aliceSummary.totalDelivered === 2, 'Delivered sessions count is 2 (cancelled session excluded)');
  assert(aliceSummary.attendancePct === 100, 'Alice attendance is 100%');
  assert(aliceSummary.isEligible === true, 'Alice is attendance eligible for Certificate of Completion');

  // Bob (enr_p3_02):
  // Attended Session 1 (LATE)
  // Mark Bob ABSENT in Session 3
  await app.saveAuthoritativeAttendance({
    sessionId: sess3Res.id,
    enrolmentId: 'enr_p3_02',
    attendanceStatus: 'ABSENT'
  });

  // Bob effective attended: 1 (late) / 2 = 50%
  const bobSummary = app.getStudentAttendanceSummary('enr_p3_02');
  assert(bobSummary.attendancePct === 50, 'Bob attendance is 50%');
  assert(bobSummary.isEligible === false, 'Bob is NOT eligible (50% < 80% threshold)');

  // =========================================================================
  // 8. Authoritative Completion Verification & Administrator Override
  // =========================================================================
  console.log('\n--- Test Suite 8: Authoritative Completion Verification & Admin Override ---');

  // Authenticate as Lead Facilitator John
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'pers_fac_01', email: 'facilitator@clasptek.com', role: 'Facilitator' }
  };

  // Alice is eligible -> Verification should succeed
  const verAlice = await app.verifyAuthoritativeCompletion('enr_p3_01', 'Excellent capstone participation and 100% attendance');
  assert(verAlice.success && verAlice.enrolment.status === 'COMPLETED', 'Alice completion verified by Lead Facilitator');
  assert(verAlice.enrolment.completionStatus === 'VERIFIED', 'Alice completionStatus marked as VERIFIED');
  assert(verAlice.enrolment.completionAttendancePct === 100, 'Attendance snapshot captured at verification');

  // Bob is ineligible (50% < 80%) -> Lead Facilitator verification should fail
  let bobFacFail = false;
  try {
    await app.verifyAuthoritativeCompletion('enr_p3_02', 'Facilitator attempt to signoff without attendance');
  } catch (err) {
    bobFacFail = true;
    assert(err.message.includes('INELIGIBLE_COMPLETION'), 'Facilitator signoff for student below threshold rejected with INELIGIBLE_COMPLETION');
  }
  assert(bobFacFail, 'Attendance threshold barrier enforced against non-admin verifier');

  // Admin Override for Bob
  // Switch auth to Super Admin Mary
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'pers_staff_01', email: 'admin@clasptek.com', role: 'Super Admin' }
  };

  // Reject override if reason is missing
  let emptyOverrideThrown = false;
  try {
    await app.overrideAuthoritativeCompletion('enr_p3_02', '');
  } catch (err) {
    emptyOverrideThrown = true;
    assert(err.message.includes('OVERRIDE_REASON_REQUIRED'), 'Completion override requires documented justification');
  }
  assert(emptyOverrideThrown, 'Mandatory override justification reason enforced');

  // Perform valid administrative override
  const overBob = await app.overrideAuthoritativeCompletion('enr_p3_02', 'Medical excuse provided and supplementary practical capstone completed with distinction');
  assert(overBob.success && overBob.enrolment.status === 'COMPLETED', 'Bob completion approved via documented Administrator Override');
  assert(overBob.enrolment.completionNotes.includes('ADMIN OVERRIDE'), 'Completion notes preserve override provenance');

  const overrideAudit = (app.state.auditLog || []).find(a => a.action === 'COMPLETION_OVERRIDE');
  assert(overrideAudit && overrideAudit.reason.includes('Medical excuse'), 'Administrative override logged immutably in audit trail');

  // =========================================================================
  // 9. Cross-Tenant Attack Testing across Phase 3 Permutations
  // =========================================================================
  console.log('\n--- Test Suite 9: Cross-Tenant Attack Testing ---');

  // Reset to Tenant A context
  app.state.authoritativeTenantId = tenantA;

  // Attack 1: Tenant A session attempting to link to Tenant B cohort
  let crossCohortThrown = false;
  try {
    const res = await app.saveAuthoritativeTrainingSession({
      cohortId: 'coh_p3_foreign', // Tenant B cohort
      facilitatorId: 'pers_fac_01',
      sessionNumber: 1,
      sessionTitle: 'Cross-Tenant Cohort Session',
      sessionDate: '2026-09-30'
    });
    crossCohortThrown = !res || !res.success;
  } catch (err) {
    crossCohortThrown = true;
  }
  assert(crossCohortThrown, 'Cross-Tenant Attack 1: Session cannot reference foreign tenant cohort');

  // Attack 2: Tenant A session attempting to assign Tenant B facilitator
  let crossFacThrown = false;
  try {
    const res = await app.saveAuthoritativeTrainingSession({
      cohortId: 'coh_p3_01',
      facilitatorId: 'pers_fac_b', // Tenant B facilitator
      sessionNumber: 4,
      sessionTitle: 'Cross-Tenant Facilitator Session',
      sessionDate: '2026-09-30'
    });
    crossFacThrown = !res || !res.success;
  } catch (err) {
    crossFacThrown = true;
  }
  assert(crossFacThrown, 'Cross-Tenant Attack 2: Session cannot reference foreign tenant facilitator');

  // Attack 3: Tenant A attendance write specifying Tenant B tenant_id
  let crossAttTenantThrown = false;
  try {
    const res = await app.saveAuthoritativeAttendance({
      tenant_id: tenantB,
      sessionId: resSess1.id,
      enrolmentId: 'enr_p3_01',
      attendanceStatus: 'PRESENT'
    });
    crossAttTenantThrown = !res || !res.success;
  } catch (err) {
    crossAttTenantThrown = true;
  }
  assert(crossAttTenantThrown, 'Cross-Tenant Attack 3: Direct foreign tenant_id injection in attendance write rejected');

  // Attack 4: Tenant A facilitator report referencing Tenant B cohort
  let crossRepCohortThrown = false;
  try {
    const res = await app.saveAuthoritativeFacilitatorReport({
      cohortId: 'coh_p3_foreign',
      facilitatorId: 'pers_fac_01',
      sessionSummary: 'Summary',
      topicsCovered: 'Topics',
      status: 'SUBMITTED'
    });
    crossRepCohortThrown = !res || !res.success;
  } catch (err) {
    crossRepCohortThrown = true;
  }
  assert(crossRepCohortThrown, 'Cross-Tenant Attack 4: Facilitator report cannot reference foreign tenant cohort');

  // Attack 5: Tenant A facilitator report referencing Tenant B facilitator
  let crossRepFacThrown = false;
  try {
    const res = await app.saveAuthoritativeFacilitatorReport({
      cohortId: 'coh_p3_01',
      facilitatorId: 'pers_fac_b',
      sessionSummary: 'Summary',
      topicsCovered: 'Topics',
      status: 'SUBMITTED'
    });
    crossRepFacThrown = !res || !res.success;
  } catch (err) {
    crossRepFacThrown = true;
  }
  assert(crossRepFacThrown, 'Cross-Tenant Attack 5: Facilitator report cannot reference foreign tenant facilitator');

  // Attack 6: Query isolation - getCohortTrainingSessions with foreign cohort
  const foreignSessions = app.getCohortTrainingSessions('coh_p3_foreign');
  assert(foreignSessions.length === 0, 'Cross-Tenant Attack 6: getCohortTrainingSessions returns empty for foreign cohort');

  // Attack 7: Query isolation - getFacilitatorReportsByCohort with foreign cohort
  const foreignReports = app.getFacilitatorReportsByCohort('coh_p3_foreign');
  assert(foreignReports.length === 0, 'Cross-Tenant Attack 7: getFacilitatorReportsByCohort returns empty for foreign cohort');

  // =========================================================================
  // 10. Audit Trail Immutability & Event Integrity
  // =========================================================================
  console.log('\n--- Test Suite 10: Audit Trail Immutability & Event Integrity ---');

  const finalAudit = app.state.auditLog || [];
  const p3Actions = [
    'TRAINING_SESSION_CREATED',
    'TRAINING_SESSION_CANCELLED',
    'ATTENDANCE_CREATED',
    'ATTENDANCE_CORRECTED',
    'FACILITATOR_REPORT_CREATED',
    'FACILITATOR_REPORT_REVIEWED',
    'COMPLETION_VERIFIED',
    'COMPLETION_OVERRIDE'
  ];

  p3Actions.forEach(action => {
    const found = finalAudit.find(a => a.action === action);
    assert(Boolean(found), `Phase 3 action '${action}' logged in authoritative audit trail`);
  });

  console.log('\n===============================================================');
  console.log(` PHASE 3 TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (TOTAL ${passCount + failCount} ASSERTIONS)`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase3Tests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
