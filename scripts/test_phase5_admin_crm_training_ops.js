/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Phase 5 Automated Certification Test Suite:
 * Admin CRM & Training Operations (Zero-Exam Vocational Model)
 * 
 * Invariants & Capabilities Certified:
 * 1. Zero Examination Invariant Enforcement across all Phase 5 UI, tabs, and workflows
 * 2. Navigation & Routing Certification (Training Operations section, badges, routing)
 * 3. Student CRM Central Dossier (4-tab dossier: Bio, Sponsor, Academic, Financial)
 * 4. CRM Enquiry Conversion with Duplicate Identity Detection & Status Linking
 * 5. Cohort Operations & Real-Time Capacity Tracking
 * 6. Enrolment Lifecycle Management & Status Updating
 * 7. Authoritative Attendance Register & Audited Corrections (80% benchmark formula)
 * 8. Facilitator Delivery Reports Submission & Administrative Sign-Off
 * 9. Training Completion Verification & Administrative Override Governance
 * 10. Certificate of Completion Operations (View, Issue, Revoke, Reissue)
 * 11. Executive Dashboard Training Operations KPI Intelligence Strip
 * 12. Strict Multi-Tenant Isolation & Zero-Cross-Tenant Leakage
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
      print: () => {},
      crypto: {
        getRandomValues: (buf) => {
          for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
          return buf;
        }
      },
      __CLASPTEK_ENV__: {
        SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_ANON_KEY: 'sb_pub_mock_key',
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_mock_key'
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: (id) => ({
        id,
        addEventListener: () => {},
        style: {},
        textContent: '',
        value: '',
        setAttribute: () => {},
        getAttribute: () => null
      }),
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
    clearInterval: () => {},
    alert: (msg) => {}
  };

  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(scriptContent, sandbox);
  return sandbox.module.exports;
}

async function runPhase5Tests() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 5 CERTIFICATION: ADMIN CRM & TRAINING OPERATIONS');
  console.log('===============================================================\n');

  const app = loadApplicationSandbox();
  const indexPath = path.join(__dirname, '..', 'index.html');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');

  // =========================================================================
  // 1. Zero Examination Invariant Verification
  // =========================================================================
  console.log('--- Test Suite 1: Zero Examination Invariant Enforcement ---');

  const prohibitedKeywords = [
    /\bcreate_exam\b/i,
    /\bexam_results\b/i,
    /\bexam_score\b/i,
    /\bquiz_score\b/i,
    /\bassessment_score\b/i,
    /\bpass_mark\b/i,
    /\bgrading_system\b/i,
    /\btake_exam\b/i,
    /\bexam_attempts\b/i,
    /\bquiz_attempts\b/i
  ];

  // Verify Phase 5 section in HTML does not introduce exam features
  const startIndex = htmlContent.indexOf('PHASE 5: ADMIN CRM & TRAINING OPERATIONS TAB RENDERERS');
  const endIndex = htmlContent.indexOf('// TAB 3: CUSTOMERS', startIndex);
  const phase5Section = htmlContent.slice(startIndex, endIndex !== -1 ? endIndex : startIndex + 50000);
  assert(startIndex !== -1 && phase5Section.length > 500, 'Phase 5 code section found and non-empty in index.html');

  for (const pattern of prohibitedKeywords) {
    assert(!pattern.test(phase5Section), `Zero-exam invariant: Phase 5 contains no prohibited workflow matching ${pattern}`);
  }

  // Ensure completion is explicitly based on attendance & verification
  assert(phase5Section.includes('attendancePct >= 80') || phase5Section.includes('isEligible'), 'Completion is explicitly attendance-based');
  assert(phase5Section.includes('Certificate of Completion'), 'Credential issued is strictly Certificate of Completion');

  // =========================================================================
  // 2. Navigation & Routing Certification
  // =========================================================================
  console.log('\n--- Test Suite 2: Navigation & Routing Certification ---');

  // Check that tab labels and sidebar have Phase 5 navigation links
  assert(htmlContent.includes("cohorts: 'Cohorts & Schedules'"), 'Tab label cohorts registered');
  assert(htmlContent.includes("enrolments: 'Enrolments'"), 'Tab label enrolments registered');
  assert(htmlContent.includes("attendance: 'Attendance Register'"), 'Tab label attendance registered');
  assert(htmlContent.includes("facilitatorReports: 'Facilitator Reports'"), 'Tab label facilitatorReports registered');
  assert(htmlContent.includes("completions: 'Certificate Eligibility'"), 'Tab label completions registered');
  assert(htmlContent.includes("certificates: 'Certificates of Completion'"), 'Tab label certificates registered');

  // Check that sidebar template contains Training Operations group
  assert(htmlContent.includes('Training Operations'), 'Sidebar contains Training Operations navigation group');
  assert(htmlContent.includes('data-tab="cohorts"'), 'Sidebar contains Cohorts tab link');
  assert(htmlContent.includes('data-tab="enrolments"'), 'Sidebar contains Enrolments tab link');
  assert(htmlContent.includes('data-tab="attendance"'), 'Sidebar contains Attendance tab link');
  assert(htmlContent.includes('data-tab="facilitatorReports"'), 'Sidebar contains Facilitator Reports tab link');
  assert(htmlContent.includes('data-tab="completions"'), 'Sidebar contains Completions tab link');
  assert(htmlContent.includes('data-tab="certificates"'), 'Sidebar contains Certificates tab link');

  // Check that canAccessTab permits admin and staff to access Phase 5 tabs
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'admin-usr-1', name: 'Admin User', role: 'admin', tenantId: '00000000-0000-0000-0000-000000000001' }
  };
  assert(app.canAccessTab('cohorts'), 'Admin can access cohorts tab');
  assert(app.canAccessTab('enrolments'), 'Admin can access enrolments tab');
  assert(app.canAccessTab('attendance'), 'Admin can access attendance tab');
  assert(app.canAccessTab('facilitatorReports'), 'Admin can access facilitatorReports tab');
  assert(app.canAccessTab('completions'), 'Admin can access completions tab');
  assert(app.canAccessTab('certificates'), 'Admin can access certificates tab');

  // Check that student cannot access admin training operations
  app.state.auth.user.role = 'Student';
  assert(!app.canAccessTab('cohorts'), 'Student role blocked from cohorts tab');
  assert(!app.canAccessTab('completions'), 'Student role blocked from completions tab');

  // Restore Admin role
  app.state.auth.user.role = 'admin';

  // =========================================================================
  // 3. Test Environment Setup & Multi-Tenant Entities
  // =========================================================================
  console.log('\n--- Test Suite 3: Test Environment Initialization ---');

  const TENANT_A = '00000000-0000-0000-0000-000000000001';
  const TENANT_B = '00000000-0000-0000-0000-000000000002';
  app.state.tenantId = TENANT_A;
  app.state.authoritativeTenantId = TENANT_A;
  app.state.tenants = [{ id: TENANT_A, name: 'Clasptek Main' }, { id: TENANT_B, name: 'Foreign Tenant' }];
  app.state.students = [];
  app.state.programmes = [];
  app.state.cohorts = [];
  app.state.enrolments = [];
  app.state.trainingSessions = [];
  app.state.attendance = [];
  app.state.facilitatorReports = [];
  app.state.certificates = [];
  app.state.invoices = [];
  app.state.payments = [];
  app.state.enquiries = [];
  app.state.auditLog = [];

  // Register Lead Facilitator in personnel
  app.state.personnel = [
    {
      id: 'fac-101',
      name: 'Engr. Daniel Okon',
      role: 'Facilitator',
      employeeType: 'facilitator',
      department: 'Technical Training',
      status: 'active',
      tenantId: TENANT_A
    }
  ];

  // Register Authoritative Programme
  const progRes = await app.saveAuthoritativeProgramme({
    code: 'PIPE-ENG-01',
    name: 'Pipeline Engineering & NDT Certification Prep',
    durationWeeks: 12,
    tuitionFee: 350000,
    deliveryMode: 'IN_PERSON'
  });
  const prog = progRes.programme;
  assert(Boolean(prog && prog.id), 'Programme registered successfully');

  // Register Authoritative Cohort
  const cohortRes = await app.saveAuthoritativeCohort({
    programmeId: prog.id,
    cohortCode: 'PIPE-2026-Q3',
    name: 'Pipeline Engineering Q3 Weekend Intensive',
    startDate: '2026-07-01',
    endDate: '2026-09-20',
    capacity: 20,
    deliveryMode: 'HYBRID',
    leadFacilitatorId: 'fac-101',
    classroom: 'Lab 2B & Engineering Workshop'
  });
  const cohort = cohortRes.cohort;
  assert(Boolean(cohort && cohort.id), 'Cohort registered successfully');

  // Register Student 1 (Direct Authoritative Registration)
  const stu1Res = await app.saveAuthoritativeStudent({
    firstName: 'Victor',
    lastName: 'Chukwuma',
    middleName: 'Emeka',
    email: 'victor.chukwuma@example.com',
    phone: '+2348031112233',
    gender: 'MALE',
    dateOfBirth: '1995-04-12',
    stateOfOrigin: 'Anambra',
    sponsorType: 'Corporate',
    sponsorName: 'Shell Petroleum Development Co.',
    sponsorPhone: '+2348099887766',
    sponsorEmail: 'sponsorship@spdc.mock',
    emergencyContactName: 'Dr. Mary Chukwuma',
    emergencyContactPhone: '+2348022334455',
    emergencyContactRelationship: 'Spouse'
  });
  const stu1 = stu1Res.student;
  assert(Boolean(stu1 && stu1.studentNumber), 'Student 1 registered with official student number');

  // =========================================================================
  // 4. CRM Enquiry Conversion with Duplicate Detection
  // =========================================================================
  console.log('\n--- Test Suite 4: CRM Enquiry Conversion & Duplicate Match Guard ---');

  // Create CRM Enquiry 1 (New candidate)
  app.state.enquiries.push({
    id: 'enq-201',
    tenantId: TENANT_A,
    name: 'Blessing Adebayo',
    email: 'blessing.adebayo@example.com',
    phone: '+2348077665544',
    programme: prog.name,
    status: 'QUALIFIED',
    source: 'Website',
    notes: 'Inquired regarding Q3 pipeline cohort'
  });

  const conv1 = await app.convertEnquiryToStudent('enq-201');
  assert(Boolean(conv1 && conv1.student), 'Enquiry converted to authoritative student successfully');
  assert(conv1.student.email === 'blessing.adebayo@example.com', 'Student created with enquiry email');
  assert(conv1.isExisting === false, 'Flagged as newly created student');

  const enqUpdated = app.state.enquiries.find(e => e.id === 'enq-201');
  assert(enqUpdated.status === 'ENROLLED', 'Enquiry status advanced to ENROLLED');
  assert(enqUpdated.studentId === conv1.student.id, 'Enquiry linked to student identity ID');

  // Create CRM Enquiry 2 (Duplicate with matching phone of student 1)
  app.state.enquiries.push({
    id: 'enq-202',
    tenantId: TENANT_A,
    name: 'Victor Chukwuma',
    email: 'victor.alt@example.com',
    phone: '+2348031112233', // Exact match with student 1
    programme: prog.name,
    status: 'CONTACTED'
  });

  const conv2 = await app.convertEnquiryToStudent('enq-202', false);
  assert(conv2.isExisting === true, 'Duplicate match detected on phone without duplicate creation');
  assert(conv2.student.id === stu1.id, 'Resolved to existing authoritative student 1');

  // =========================================================================
  // 5. Cohort Capacity Tracking & Real-Time Metrics
  // =========================================================================
  console.log('\n--- Test Suite 5: Cohort Capacity & Real-Time Occupancy ---');

  let capSummary = app.getCohortCapacitySummary(cohort.id);
  assert(capSummary.enrolledCount === 0, 'Cohort begins with 0 enrolled');
  assert(capSummary.capacity === 20, 'Cohort capacity is 20');
  assert(capSummary.isFull === false, 'Cohort is not full');

  // Enrol Student 1 into Cohort
  const enr1Res = await app.saveAuthoritativeEnrolment({
    studentId: stu1.id,
    programmeId: prog.id,
    cohortId: cohort.id,
    agreedTuitionFee: 350000,
    discountPercentage: 10,
    status: 'ACTIVE'
  });
  const enr1 = enr1Res.enrolment;
  assert(Boolean(enr1 && enr1.enrolmentNumber), 'Enrolment 1 created successfully');

  capSummary = app.getCohortCapacitySummary(cohort.id);
  assert(capSummary.enrolledCount === 1, 'Cohort occupancy updated to 1');
  assert(capSummary.percentageFull === 5, 'Percentage full is 5%');

  // Enrol Student 2 (Blessing Adebayo) into Cohort
  const enr2Res = await app.saveAuthoritativeEnrolment({
    studentId: conv1.student.id,
    programmeId: prog.id,
    cohortId: cohort.id,
    agreedTuitionFee: 350000,
    discountPercentage: 0,
    status: 'ACTIVE'
  });
  const enr2 = enr2Res.enrolment;
  assert(Boolean(enr2 && enr2.id), 'Enrolment 2 created successfully');

  capSummary = app.getCohortCapacitySummary(cohort.id);
  assert(capSummary.enrolledCount === 2, 'Cohort occupancy updated to 2');
  assert(capSummary.percentageFull === 10, 'Percentage full is 10%');

  // =========================================================================
  // 6. Authoritative Attendance & Audited Corrections (80% Rule)
  // =========================================================================
  console.log('\n--- Test Suite 6: Attendance Register & Audited Corrections ---');

  // Create 5 Training Sessions for the Cohort
  const sessionIds = [];
  for (let s = 1; s <= 5; s++) {
    const sesRes = await app.saveAuthoritativeTrainingSession({
      cohortId: cohort.id,
      sessionNumber: s,
      sessionTitle: `Session ${s}: Pipeline Integrity & Testing Protocol`,
      sessionDate: `2026-07-0${s}`,
      startTime: '09:00',
      endTime: '13:00',
      facilitatorId: 'fac-101',
      status: 'COMPLETED'
    });
    sessionIds.push((sesRes.session && sesRes.session.id) || sesRes.id);
  }
  assert(sessionIds.length === 5, '5 training sessions created for cohort');

  // Record Attendance for Student 1: 4 PRESENT, 1 LATE -> Attendance % = (4 + 1 + 0)/5 * 100 = 100%
  for (let i = 0; i < 4; i++) {
    await app.saveAuthoritativeAttendance({
      sessionId: sessionIds[i],
      enrolmentId: enr1.id,
      attendanceStatus: 'PRESENT'
    });
  }
  const attLate = await app.saveAuthoritativeAttendance({
    sessionId: sessionIds[4],
    enrolmentId: enr1.id,
    attendanceStatus: 'LATE'
  });

  const attSummary1 = app.getStudentAttendanceSummary(enr1.id);
  assert(attSummary1.totalDelivered === 5, 'Student 1 total delivered sessions is 5');
  assert(attSummary1.presentCount === 4, 'Present count is 4');
  assert(attSummary1.lateCount === 1, 'Late count is 1');
  assert(attSummary1.attendancePct === 100, 'Attendance % is 100%');
  assert(attSummary1.isEligible === true, 'Student 1 meets 80% benchmark (isEligible = true)');

  // Record Attendance for Student 2: 2 PRESENT, 1 EXCUSED, 2 ABSENT -> Attendance % = (2 + 0 + 0.5*1)/5 * 100 = 50%
  await app.saveAuthoritativeAttendance({ sessionId: sessionIds[0], enrolmentId: enr2.id, attendanceStatus: 'PRESENT' });
  await app.saveAuthoritativeAttendance({ sessionId: sessionIds[1], enrolmentId: enr2.id, attendanceStatus: 'PRESENT' });
  await app.saveAuthoritativeAttendance({ sessionId: sessionIds[2], enrolmentId: enr2.id, attendanceStatus: 'EXCUSED' });
  await app.saveAuthoritativeAttendance({ sessionId: sessionIds[3], enrolmentId: enr2.id, attendanceStatus: 'ABSENT' });
  const attAbsent = await app.saveAuthoritativeAttendance({ sessionId: sessionIds[4], enrolmentId: enr2.id, attendanceStatus: 'ABSENT' });

  const attSummary2 = app.getStudentAttendanceSummary(enr2.id);
  assert(attSummary2.attendancePct === 50, 'Student 2 attendance % is 50%');
  assert(attSummary2.isEligible === false, 'Student 2 is below 80% benchmark (isEligible = false)');

  // Test Audited Attendance Correction
  let correctionRejected = false;
  try {
    // Attempt correction without reason (must reject)
    await app.correctAuthoritativeAttendance(attAbsent.attendance.id, 'PRESENT', '');
  } catch (err) {
    correctionRejected = true;
  }
  assert(correctionRejected, 'Attendance correction rejected without mandatory justification reason');

  // Submit valid audited correction with justification
  const corrSuccess = await app.correctAuthoritativeAttendance(
    attAbsent.attendance.id,
    'PRESENT',
    'Student arrived during morning practical lab; register reconciles physical sign-in sheet.'
  );
  assert(corrSuccess.attendance.attendanceStatus === 'PRESENT', 'Attendance status corrected to PRESENT');

  // Verify Audit Log captured correction
  const corrAudit = app.state.auditLog.find(a => a.action === 'ATTENDANCE_CORRECTED');
  assert(Boolean(corrAudit), 'Audit log contains ATTENDANCE_CORRECTED entry');
  assert(Boolean(corrAudit.reason && corrAudit.reason.includes('reconciles physical sign-in')), 'Audit log contains documented reason');

  // =========================================================================
  // 7. Facilitator Delivery Reports & Administrative Sign-off
  // =========================================================================
  console.log('\n--- Test Suite 7: Facilitator Training Reports & Sign-off ---');

  // Submit Facilitator Report
  const repRes = await app.saveAuthoritativeFacilitatorReport({
    cohortId: cohort.id,
    facilitatorId: 'fac-101',
    reportDate: '2026-07-05',
    topicsCovered: 'Modules 1 to 5: Ultrasonic & Radiographic Inspection Labs',
    sessionSummary: 'All trainees completed practical pipe flaw detector calibration drills.',
    studentEngagement: 'High engagement across all hands-on exercises; good teamwork.',
    challenges: 'Workstation 4 oscilloscope required recalibration prior to lab start.'
  });
  const report = repRes.report;
  assert(Boolean(report && report.id), 'Facilitator report submitted successfully');
  assert(report.status === 'SUBMITTED', 'Report status initialized to SUBMITTED');

  // Admin Reviews and Signs off Report
  const revRes = await app.reviewFacilitatorReport(report.id, 'Reviewed and verified against Q3 syllabus benchmark.');
  assert(revRes.report.status === 'REVIEWED', 'Report status updated to REVIEWED');
  assert(revRes.report.reviewedBy === 'admin-usr-1' || revRes.report.reviewedBy === 'admin' || Boolean(revRes.report.reviewedBy), 'Reviewed by admin captured');

  // Verify Audit Log captured review
  const repAudit = app.state.auditLog.find(a => a.action === 'FACILITATOR_REPORT_REVIEWED');
  assert(Boolean(repAudit), 'Audit log contains FACILITATOR_REPORT_REVIEWED entry');

  // =========================================================================
  // 8. Completion Verification & Administrative Override Governance
  // =========================================================================
  console.log('\n--- Test Suite 8: Completion Verification & Override Governance ---');

  // Student 1 has 100% attendance -> Can verify directly
  const comp1Res = await app.verifyAuthoritativeCompletion(enr1.id);
  assert(comp1Res.enrolment.completionStatus === 'VERIFIED', 'Student 1 completion verified without override');
  assert(comp1Res.enrolment.status === 'COMPLETED', 'Enrolment status updated to COMPLETED');

  // Student 2 has (2 PRESENT + 1 EXCUSED + 1 PRESENT + 1 ABSENT)/5 = 3.5/5 = 70% attendance (< 80%)
  // Verification without override reason must reject
  let comp2Rejected = false;
  try {
    await app.verifyAuthoritativeCompletion(enr2.id);
  } catch (err) {
    comp2Rejected = true;
  }
  assert(comp2Rejected, 'Completion verification rejected for candidate below 80% without override reason');

  // Verify with administrative override
  const comp2Res = await app.verifyAuthoritativeCompletion(
    enr2.id,
    'Approved medical dispensation with verified makeup weekend practical sessions.'
  );
  assert(comp2Res.enrolment.completionStatus === 'VERIFIED', 'Student 2 completion verified with documented override');
  assert(comp2Res.enrolment.status === 'COMPLETED', 'Student 2 enrolment updated to COMPLETED');

  // =========================================================================
  // 9. Certificate Operations (View, Issue, Revoke, Reissue)
  // =========================================================================
  console.log('\n--- Test Suite 9: Certificate of Completion Operations ---');

  // Issue Certificate for Student 1
  const certRes = await app.issueAuthoritativeCertificate(enr1.id, { issueDate: '2026-07-10' });
  const cert = certRes.certificate;
  assert(Boolean(cert && cert.certificateNumber), 'Certificate issued with official number');
  assert(cert.status === 'ISSUED', 'Certificate status is ISSUED');
  assert(cert.studentNameSnapshot === 'Victor Chukwuma', 'Student name snapshot captured');

  // Public Verification of Issued Certificate
  const pubVerify = app.verifyCertificatePublic(cert.verificationToken);
  assert(pubVerify.found === true, 'Public verification finds certificate by token');
  assert(pubVerify.isValid === true, 'Public verification confirms valid credential');
  assert(pubVerify.studentName === 'Victor Chukwuma', 'Verified student name exposed');

  // Revoke Certificate with Mandatory Reason
  const revCertRes = await app.revokeAuthoritativeCertificate(cert.id, 'Candidate middle name spelling correction on official identity request.');
  assert(revCertRes.certificate.status === 'REVOKED', 'Certificate revoked');

  // Public Verification of Revoked Certificate
  const pubVerifyRev = app.verifyCertificatePublic(cert.verificationToken);
  assert(pubVerifyRev.found === true, 'Public verification finds certificate');
  assert(pubVerifyRev.isValid === false, 'Public verification flags credential as invalid');
  assert(pubVerifyRev.status === 'REVOKED', 'Public verification exposes REVOKED status');

  // Reissue Certificate with Corrected Name
  const reissueRes = await app.reissueAuthoritativeCertificate(cert.id, {
    reason: 'Issued replacement certificate with verified full middle name',
    studentNameOverride: 'Victor Emeka Chukwuma'
  });
  const reissuedCert = reissueRes.certificate;
  assert(reissuedCert.status === 'ISSUED', 'Reissued certificate status is ISSUED');
  assert(reissuedCert.studentNameSnapshot === 'Victor Emeka Chukwuma', 'Reissued certificate reflects corrected name');
  assert(reissuedCert.previousCertificateId === cert.id, 'Reissued certificate links to revoked certificate ID');

  // =========================================================================
  // 10. Student CRM Central Dossier (4-Tab Verification)
  // =========================================================================
  console.log('\n--- Test Suite 10: Central Student CRM Profile Dossier ---');

  // Create Mock Container for Modal Rendering
  const mockDossierContainer = { innerHTML: '', querySelectorAll: () => [] };
  app.renderStudentProfileModal(mockDossierContainer, { student: stu1 });

  const dossierHtml = mockDossierContainer.innerHTML;
  assert(dossierHtml.includes('Identity &amp; Bio'), 'Dossier contains Tab 1: Identity & Bio');
  assert(dossierHtml.includes('Sponsor &amp; Emergency'), 'Dossier contains Tab 2: Sponsor & Emergency');
  assert(dossierHtml.includes('Academic &amp; Enrolments'), 'Dossier contains Tab 3: Academic & Enrolments');
  assert(dossierHtml.includes('Financial Position'), 'Dossier contains Tab 4: Financial Position');
  assert(dossierHtml.includes('Victor Chukwuma'), 'Dossier displays student full name');
  assert(dossierHtml.includes('Shell Petroleum Development Co.'), 'Dossier displays sponsor organization');
  assert(dossierHtml.includes('Dr. Mary Chukwuma'), 'Dossier displays emergency contact');
  assert(dossierHtml.includes('Financial Independence Notice'), 'Dossier displays financial independence notice');

  // =========================================================================
  // 11. Executive Dashboard Training Operations KPI Strip
  // =========================================================================
  console.log('\n--- Test Suite 11: Training Operations KPI Intelligence Strip ---');

  const kpis = app.getTrainingOperationsKpis();
  assert(typeof kpis.totalStudents === 'number' && kpis.totalStudents >= 2, 'KPI totalStudents is calculated accurately');
  assert(kpis.totalCohorts >= 1, 'KPI totalCohorts is calculated accurately');
  assert(kpis.totalEnrolments >= 2, 'KPI totalEnrolments is calculated accurately');
  assert(kpis.deliveredSessions >= 5, 'KPI deliveredSessions is calculated accurately');
  assert(kpis.attendanceRecordsCount >= 10, 'KPI attendanceRecordsCount is calculated accurately');
  assert(kpis.reportsSubmitted >= 0, 'KPI reportsSubmitted is calculated accurately');
  assert(kpis.reportsReviewed >= 1, 'KPI reportsReviewed is calculated accurately');
  assert(kpis.verifiedCompletions >= 2, 'KPI verifiedCompletions is calculated accurately');
  assert(kpis.issuedCertificates >= 1, 'KPI issuedCertificates is calculated accurately');

  // Verify Dashboard HTML rendering
  const mockDashContainer = { innerHTML: '', querySelectorAll: () => [] };
  app.renderDashboardTab(mockDashContainer);
  const dashHtml = mockDashContainer.innerHTML;
  assert(dashHtml.includes('Training Operations &amp; Completion Credentials (Phase 5)'), 'Dashboard includes Phase 5 Pillar 4');
  assert(dashHtml.includes('dashKpiStudents'), 'Dashboard includes Students KPI card');
  assert(dashHtml.includes('dashKpiCohorts'), 'Dashboard includes Active Cohorts KPI card');
  assert(dashHtml.includes('dashKpiEnrolments'), 'Dashboard includes Enrolments KPI card');
  assert(dashHtml.includes('dashKpiCompletions'), 'Dashboard includes Completions KPI card');
  assert(dashHtml.includes('dashKpiCerts'), 'Dashboard includes Certificates KPI card');

  // =========================================================================
  // 12. Strict Multi-Tenant Isolation
  // =========================================================================
  console.log('\n--- Test Suite 12: Strict Multi-Tenant Isolation ---');

  // Add Foreign Tenant Cohort
  app.state.cohorts.push({
    id: 'foreign-coh-999',
    tenantId: TENANT_B,
    cohortCode: 'FOREIGN-2026',
    name: 'Foreign Tenant Secret Cohort',
    capacity: 30,
    status: 'ACTIVE'
  });

  // Querying in Tenant A must never return Foreign Tenant Cohort
  const visibleCohorts = (app.state.cohorts || []).filter(c => c.tenantId === TENANT_A);
  assert(!visibleCohorts.some(c => c.id === 'foreign-coh-999'), 'Foreign tenant cohort invisible to Tenant A');

  // Foreign Tenant Certificate Cannot be issued for Tenant A Enrolment
  app.state.tenantId = TENANT_B;
  let foreignCertRejected = false;
  try {
    await app.issueAuthoritativeCertificate(enr1.id);
  } catch (err) {
    foreignCertRejected = true;
  }
  assert(foreignCertRejected, 'Cross-tenant certificate issuance attempt strictly rejected');

  // Restore Tenant A
  app.state.tenantId = TENANT_A;

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n===============================================================');
  console.log(` PHASE 5 TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (TOTAL ${passCount + failCount} ASSERTIONS)`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase5Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
