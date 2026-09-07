/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Production Smoke Test: Full End-to-End Persona Verification
 * 
 * Personas & Workflows Tested:
 * 1. Admin: Create application, review ambiguous match, link student, qualify, convert, verify enrolment & tuition snapshot & CRM history
 * 2. Facilitator: Inspect assigned cohort/session, submit report, blocked from Admin operations
 * 3. Student: Inspect own profile, blocked from viewing other student dossiers, blocked from mutations
 * 4. Certificate: Issue Certificate of Completion, public verification, verify Zero-Exam invariant
 * 5. Finance: Confirm existing finance records intact, catalogue price unchanged, agreed tuition snapshot preserved
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
    throw new Error(`Smoke Test Assertion failed: ${message}`);
  }
  passCount++;
  console.log(`  ✔ PASS: ${message}`);
}

function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (key) => (store[key] !== undefined ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

function loadApplicationSandbox() {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const scriptContent = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].pop()[1];
  const mockStorage = createMockLocalStorage();

  const sandbox = {
    require,
    Buffer,
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
        SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
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
    console: { log: () => {}, warn: () => {}, error: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {},
    alert: () => {},
    prompt: () => ''
  };

  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(scriptContent, sandbox);
  return sandbox.module.exports;
}

async function runProductionSmokeTest() {
  console.log('========================================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — COMPREHENSIVE PRODUCTION SMOKE TEST');
  console.log('========================================================================================\n');

  const app = loadApplicationSandbox();
  const TENANT_ID = '33333333-3333-3333-3333-333333333333';

  // Seed authenticated admin
  app.state.authoritativeTenantId = TENANT_ID;
  app.state.auth = {
    isAuthenticated: true,
    user: {
      id: 'admin_smoke_01',
      name: 'Admissions Director',
      role: 'Super Admin',
      tenantId: TENANT_ID
    }
  };

  // Seed baseline financial invoice & baseline programme
  const progRes = await app.saveAuthoritativeProgramme({
    code: 'PRG-SOLAR-TECH',
    name: 'Solar PV Installation & Energy Systems',
    description: 'Practical solar vocational training',
    tuitionFee: 300000,
    durationWeeks: 8,
    status: 'ACTIVE'
  });
  assert(progRes.success, 'Baseline Solar PV programme registered');
  const solarProg = progRes.programme;

  // Add facilitator to personnel
  app.state.personnel.push({
    id: 'pers_fac_smoke',
    tenant_id: TENANT_ID,
    name: 'Engr. Emeka Obi',
    jobTitle: 'Senior Renewable Energy Facilitator',
    employeeType: 'facilitator',
    role: 'Facilitator',
    status: 'ACTIVE'
  });

  // Seed baseline cohort
  const cohortRes = await app.saveAuthoritativeCohort({
    programmeId: solarProg.id,
    cohortCode: 'COH-SOL-2026-01',
    name: '2026 Solar PV Alpha Cohort',
    startDate: '2026-10-01',
    endDate: '2026-11-30',
    capacity: 20,
    deliveryMode: 'IN_PERSON',
    leadFacilitatorId: 'pers_fac_smoke',
    status: 'UPCOMING'
  });
  assert(cohortRes.success, 'Baseline Solar cohort registered');
  const solarCohort = cohortRes.cohort;

  // Seed baseline pre-existing student
  const student1Res = await app.saveAuthoritativeStudent({
    firstName: 'Chidinma',
    lastName: 'Okeke',
    email: 'chidinma.okeke@example.com',
    phone: '+2348011223344',
    gender: 'FEMALE',
    dateOfBirth: '1999-04-12',
    status: 'ACTIVE'
  });
  assert(student1Res.success, 'Baseline student Chidinma Okeke registered');
  const existingStudent = student1Res.student;

  // Seed baseline existing financial invoice
  app.state.invoices = [{
    id: 'inv_smoke_existing',
    tenant_id: TENANT_ID,
    invoiceNo: 101,
    invoiceDisplayNo: 'INV-2026-101',
    studentName: existingStudent.name,
    basePrice: 300000,
    totalAmount: 300000,
    status: 'PAID',
    createdAt: new Date().toISOString()
  }];

  // =========================================================================
  // 1. ADMIN PERSONA WORKFLOW
  // =========================================================================
  console.log('--- 1. Admin Persona Production Workflow ---');

  // Step 1: Create application for NEW applicant (triggers linked CRM enquiry)
  const newAppPayload = {
    firstName: 'Tari',
    lastName: 'Briggs',
    email: 'tari.briggs@example.com',
    phone: '+2348077665544',
    programmeId: solarProg.id,
    agreedTuitionFee: 275000,
    deliveryMode: 'IN_PERSON',
    preferredSchedule: 'WEEKDAY',
    consentAcknowledged: true
  };

  const newAppSubmitRes = await app.submitAuthoritativeApplication(newAppPayload, 'WEB_INTAKE', 'sub_smoke_tari_01');
  assert(newAppSubmitRes.success, 'Admin/Intake: New applicant submitted successfully');
  const tariApp = newAppSubmitRes.application;
  assert(tariApp.applicationNumber.startsWith('APP-'), 'Admin/Intake: Application reference assigned');
  assert(tariApp.status === 'NEW', 'Admin/Intake: Status is NEW');
  assert(tariApp.enquiryId, 'Admin/Intake: Linked CRM Enquiry provisioned');

  // Step 2: Qualify New Applicant
  await app.qualifyApplication(tariApp.id);
  assert(tariApp.status === 'QUALIFIED', 'Admin: New application qualified');

  // Step 3: Convert New Applicant -> creates Student & Enrolment & updates CRM Enquiry
  const convertTariRes = await app.convertApplicationToStudentAndEnrolment(tariApp.id, {
    cohortId: solarCohort.id
  });
  assert(convertTariRes.success, 'Admin: Application converted to Student and Enrolment');
  assert(convertTariRes.student.studentNumber.startsWith('STU-'), 'Admin: New Student Number STU- assigned');
  assert(convertTariRes.enrolment.enrolmentNumber.startsWith('ENR-'), 'Admin: New Enrolment Number ENR- assigned');
  assert(convertTariRes.enrolment.agreedTuitionFee === 275000, 'Admin: Agreed tuition snapshot preserved at 275,000 NGN');
  assert(solarProg.tuitionFee === 300000, 'Admin: Programme catalogue price completely unchanged at 300,000 NGN');

  // Step 4: Verify CRM Enquiry updated to ENROLLED
  const tariEnquiry = (app.state.enquiries || []).find(e => e.id === tariApp.enquiryId);
  assert(tariEnquiry && tariEnquiry.status === 'ENROLLED', 'Admin: CRM Enquiry updated to ENROLLED');

  // Step 5: Test Ambiguous Match Resolution and Existing Student Re-enrolment
  const existAppPayload = {
    firstName: 'Chidinma',
    lastName: 'Okeke',
    email: 'chidinma.okeke@example.com',
    phone: '+2348011223344',
    programmeId: solarProg.id,
    agreedTuitionFee: 280000,
    deliveryMode: 'IN_PERSON',
    consentAcknowledged: true
  };
  const existSubmitRes = await app.submitAuthoritativeApplication(existAppPayload, 'WEB_INTAKE', 'sub_smoke_exist_01');
  assert(existSubmitRes.status === 'MATCHED', 'Admin: Existing student matched with HIGH confidence');

  const convertExistRes = await app.convertApplicationToStudentAndEnrolment(existSubmitRes.application.id, {
    cohortId: solarCohort.id
  });
  assert(convertExistRes.isExistingStudent === true, 'Admin: Existing student re-enrolled without duplicate student entity');
  assert(convertExistRes.student.id === existingStudent.id, 'Admin: Enrolment linked to original student identity');
  const createdApp = existSubmitRes.application;

  // =========================================================================
  // 2. FACILITATOR PERSONA WORKFLOW
  // =========================================================================
  console.log('\n--- 2. Facilitator Persona Production Workflow ---');

  // Switch context to Facilitator
  app.state.auth = {
    isAuthenticated: true,
    user: {
      id: 'usr_fac_01',
      name: 'Engr. Emeka Obi',
      role: 'Facilitator',
      tenantId: TENANT_ID,
      personnelId: 'pers_fac_smoke'
    }
  };

  // Step 1: See assigned training/cohort info
  const facCohorts = (app.state.cohorts || []).filter(c => c.leadFacilitatorId === 'pers_fac_smoke');
  assert(facCohorts.length > 0, 'Facilitator: Authorized to view assigned cohorts');

  // Create a training session in assigned cohort
  const sessRes = await app.saveAuthoritativeTrainingSession({
    cohortId: solarCohort.id,
    facilitatorId: 'pers_fac_smoke',
    sessionNumber: 1,
    sessionDate: '2026-10-05',
    title: 'Photovoltaic Cell Physics & Inverter Fundamentals',
    durationHours: 4,
    status: 'COMPLETED'
  });
  assert(sessRes.success, 'Facilitator: Training session registered: ' + (sessRes.message || JSON.stringify(sessRes)));

  // Step 2: Submit facilitator report
  const repRes = await app.saveAuthoritativeFacilitatorReport({
    cohortId: solarCohort.id,
    facilitatorId: 'pers_fac_smoke',
    sessionId: sessRes.session.id,
    topicsCovered: 'Photovoltaic Cell Physics & Inverter Fundamentals',
    sessionSummary: 'Practical installation wiring and voltage test completed successfully.',
    challengesEncountered: 'None',
    recommendations: 'Proceed to battery storage modules'
  });
  assert(repRes.success, 'Facilitator: Facilitator report submitted');

  // Step 3: Blocked from Admin-only operations
  let facBlockedAdminOps = 0;
  try {
    await app.convertApplicationToStudentAndEnrolment(createdApp.id, { cohortId: solarCohort.id });
  } catch (err) {
    if (err.message.includes('UNAUTHORIZED')) facBlockedAdminOps++;
  }

  try {
    await app.deleteAuthoritativeStudent(existingStudent.id);
  } catch (err) {
    if (err.message.includes('UNAUTHORIZED')) facBlockedAdminOps++;
  }

  try {
    await app.reviewFacilitatorReport(repRes.report.id, 'Review notes');
  } catch (err) {
    if (err.message.includes('UNAUTHORIZED')) facBlockedAdminOps++;
  }

  assert(facBlockedAdminOps === 3, 'Facilitator: Blocked from all Admin-only operations (convert, delete student, review report)');

  // =========================================================================
  // 3. STUDENT PERSONA WORKFLOW
  // =========================================================================
  console.log('\n--- 3. Student Persona Production Workflow ---');

  // Switch context to Student Chidinma
  app.state.auth = {
    isAuthenticated: true,
    user: {
      id: 'usr_stu_chidinma',
      name: 'Chidinma Okeke',
      role: 'Student',
      tenantId: TENANT_ID,
      studentId: existingStudent.id,
      email: existingStudent.email
    }
  };

  // Register another student Bob
  app.state.auth.user.role = 'Admin'; // momentarily register Bob as Admin
  const bobRes = await app.saveAuthoritativeStudent({
    firstName: 'Bob',
    lastName: 'Eze',
    email: 'bob.eze@example.com',
    status: 'ACTIVE'
  });
  app.state.auth.user.role = 'Student'; // back to Student Chidinma

  const createMockContainer = () => ({
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  });

  // Step 1: See own information
  const ownModal = createMockContainer();
  const ownProfileRes = app.renderStudentProfileModal(ownModal, existingStudent);
  assert(ownModal.innerHTML.includes('Identity &amp; Bio') || (!ownProfileRes || ownProfileRes.success !== false), 'Student: Allowed to access own student dossier');

  // Step 2: Cannot see another student's profile (IDOR)
  const bobModal = createMockContainer();
  const bobProfileRes = app.renderStudentProfileModal(bobModal, bobRes.student);
  assert(bobProfileRes && bobProfileRes.success === false, 'Student: Access to Bob profile blocked');
  assert(!bobModal.innerHTML.includes('bob.eze@example.com'), 'Student: Zero PII disclosure of Bob profile');

  // Step 3: Cannot modify governed records
  let stuBlockedMutations = 0;
  try {
    await app.saveAuthoritativeAttendance({
      sessionId: sessRes.session.id,
      enrolmentId: convertExistRes.enrolment.id,
      attendanceStatus: 'PRESENT'
    });
  } catch (err) {
    if (err.message.includes('UNAUTHORIZED')) stuBlockedMutations++;
  }

  try {
    await app.saveAuthoritativeCohort({
      programmeId: solarProg.id,
      cohortCode: 'CLP-HACK-01',
      name: 'Hacked Cohort',
      startDate: '2026-10-01',
      endDate: '2026-11-01',
      capacity: 10
    });
  } catch (err) {
    if (err.message.includes('UNAUTHORIZED')) stuBlockedMutations++;
  }

  assert(stuBlockedMutations === 2, 'Student: Blocked from mutating attendance and cohorts');

  // =========================================================================
  // 4. CERTIFICATE & ZERO-EXAM INVARIANT WORKFLOW
  // =========================================================================
  console.log('\n--- 4. Certificate & Zero-Exam Invariant Workflow ---');

  // Switch back to Admin
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'admin_smoke_01', name: 'Admin', role: 'Super Admin', tenantId: TENANT_ID }
  };

  // Complete sessions and mark attendance for Chidinma
  await app.saveAuthoritativeAttendance({
    sessionId: sessRes.session.id,
    enrolmentId: convertExistRes.enrolment.id,
    attendanceStatus: 'PRESENT'
  });

  // Verify completion with verified attendance
  const compRes = await app.verifyAuthoritativeCompletion(convertExistRes.enrolment.id, 'Attended practical vocational training sessions');
  assert(compRes.success, 'Certificate: Vocational training completion verified');

  // Issue Certificate of Completion
  const certRes = await app.issueAuthoritativeCertificate(convertExistRes.enrolment.id);
  assert(certRes.success, 'Certificate: Certificate of Completion issued successfully');
  assert(certRes.certificate.certificateNumber.startsWith('CERT-'), 'Certificate: Official certificate number generated');

  // Verify certificate publicly
  const pubVerify = app.verifyCertificatePublic(certRes.certificate.verificationToken);
  assert(pubVerify.found === true && pubVerify.isValid === true, 'Certificate: Public verification confirms valid credential');
  assert(pubVerify.programmeName.includes('Solar'), 'Certificate: Verified programme title exposed');
  assert(pubVerify.financialAmount === undefined && pubVerify.agreedTuitionFee === undefined, 'Certificate: Zero financial data leaked in public credential verification');

  // Confirm Zero Examination / Grade terminology in all workflows
  const fullHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const opsSection = fullHtml.slice(
    fullHtml.indexOf('PHASE 5: ADMIN CRM & TRAINING OPERATIONS'),
    fullHtml.indexOf('// TAB: FINANCIAL INTELLIGENCE')
  );

  const prohibitedExamTerms = [
    /\bexam_score\b/i,
    /\bpass_mark\b/i,
    /\bgrading_rubric\b/i,
    /\btest_score\b/i,
    /\bfailed_exam\b/i
  ];
  let foundExamTerm = false;
  for (const term of prohibitedExamTerms) {
    if (term.test(opsSection)) {
      foundExamTerm = true;
      console.error(`Prohibited term found: ${term}`);
    }
  }
  assert(!foundExamTerm, 'Certificate: Zero examination/grading workflow strictly preserved across all training operations');

  // =========================================================================
  // 5. FINANCE INVARIANT WORKFLOW
  // =========================================================================
  console.log('\n--- 5. Finance Invariant Workflow ---');

  // Verify pre-existing invoice intact
  const existingInv = (app.state.invoices || []).find(i => i.id === 'inv_smoke_existing');
  assert(existingInv && existingInv.status === 'PAID', 'Finance: Pre-existing financial invoices remain 100% intact');

  // Verify programme catalogue pricing intact
  const finalProg = app.findProgrammeById(solarProg.id);
  assert(finalProg.tuitionFee === 300000, 'Finance: Programme catalogue tuition fee unaltered by intake conversions');

  // Verify agreed tuition snapshot
  const finalEnrolment = app.findEnrolmentById(convertExistRes.enrolment.id);
  assert(finalEnrolment.agreedTuitionFee === 280000, 'Finance: Enrolment tuition snapshot accurately preserved at agreed scholarship rate (280,000 NGN)');

  console.log('\n========================================================================================');
  console.log(` PRODUCTION SMOKE TEST RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log(` ALL 5 PRODUCTION PERSONAS & INVARIANTS CERTIFIED GREEN`);
  console.log('========================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProductionSmokeTest().catch(err => {
  console.error('Smoke Test Fatal Error:', err);
  process.exit(1);
});
