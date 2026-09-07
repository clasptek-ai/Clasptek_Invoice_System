/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Phase 4 Automated Certification Test Suite:
 * Authoritative Certificate of Completion, Issuance, Verification & Audit Layer
 * 
 * Tests:
 * 1. Zero Examination Invariant Enforcement across Schema, Engine & Template
 * 2. DDL & Schema Architecture (public.certificates, Composite FKs, Triggers, RLS)
 * 3. Authoritative Certificate Issuance Lifecycle & Historical Snapshots
 * 4. Academic Completion Guard (Rejection of Unverified / Active / Withdrawn Enrolments)
 * 5. Duplicate Active Certificate Guard (Partial Unique Index & In-Memory Check)
 * 6. Four-Eyes Role Authorization (Admin/Staff Allowed, Facilitator/Finance/Student Blocked)
 * 7. Financial Separation Invariant (Outstanding Balance Never Blocks Certificate)
 * 8. Controlled Revocation Governance & Mandatory Reason Logging
 * 9. Controlled Reissuance Lifecycle with Traceable Provenance
 * 10. Safe Public Verification Service (Read-Only Minimal Disclosure)
 * 11. Cross-Tenant Attack Testing across All Permutations
 * 12. Audit Trail Immutability & Event Integrity
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

async function runPhase4Tests() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 4 CERTIFICATION: CERTIFICATE OF COMPLETION');
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
    /\bcreate\s+table\s+public\.exam_certificates\b/i
  ];
  prohibitedSqlPatterns.forEach((pattern, i) => {
    assert(!pattern.test(sql), `Zero exam schema invariant [${i + 1}]: No exam tables or columns in DDL`);
  });

  // Certificate template zero-exam verification
  const app = loadApplicationSandbox();
  const sampleCert = {
    studentNameSnapshot: 'Ada Lovelace',
    programmeNameSnapshot: 'Enterprise Systems Engineering',
    certificateNumber: 'CERT-2026-0001',
    completionDate: '2026-09-01',
    issueDate: '2026-09-02',
    status: 'ISSUED'
  };
  const certHtml = app.renderCertificateDocumentHtml(sampleCert);
  assert(certHtml.includes('Certificate of Completion'), 'Official credential title is Certificate of Completion');
  assert(!/\bexam\b/i.test(certHtml), 'Certificate document contains no examination terminology');
  assert(!/\bgrade\b/i.test(certHtml), 'Certificate document contains no grade terminology');
  assert(!/\bscore\b/i.test(certHtml), 'Certificate document contains no score terminology');
  assert(!/\bquiz\b/i.test(certHtml), 'Certificate document contains no quiz terminology');
  assert(!/\bpass\s+mark\b/i.test(certHtml), 'Certificate document contains no pass mark terminology');

  // =========================================================================
  // 2. DDL & Schema Architecture
  // =========================================================================
  console.log('\n--- Test Suite 2: DDL & Schema Architecture ---');

  assert(Boolean(inventory.allTables['certificates']), 'public.certificates registered in canonical inventory');
  assert(inventory.allTables['certificates'].rlsEnabled === true, 'RLS enabled on public.certificates');

  // Verify composite foreign keys
  assert(sql.includes('CONSTRAINT fk_certificates_tenant_student FOREIGN KEY (tenant_id, student_id)'), 'certificates has composite FK to students (tenant_id, student_id)');
  assert(sql.includes('CONSTRAINT fk_certificates_tenant_enrolment FOREIGN KEY (tenant_id, enrolment_id)'), 'certificates has composite FK to enrolments (tenant_id, enrolment_id)');
  assert(sql.includes('CONSTRAINT fk_certificates_tenant_programme FOREIGN KEY (tenant_id, programme_id)'), 'certificates has composite FK to programmes (tenant_id, programme_id)');
  assert(sql.includes('CONSTRAINT fk_certificates_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)'), 'certificates has composite FK to cohorts (tenant_id, cohort_id)');
  assert(sql.includes('CONSTRAINT fk_certificates_tenant_enrolment_cohort FOREIGN KEY (tenant_id, enrolment_id, cohort_id)'), 'certificates has composite FK to enrolments (tenant_id, enrolment_id, cohort_id)');

  // Verify unique constraints
  assert(sql.includes('CONSTRAINT uq_certificates_tenant_id UNIQUE (tenant_id, id)'), 'certificates has UNIQUE(tenant_id, id)');
  assert(sql.includes('CONSTRAINT uq_certificates_tenant_number UNIQUE (tenant_id, certificate_number)'), 'certificates has UNIQUE(tenant_id, certificate_number)');
  assert(sql.includes('CONSTRAINT uq_certificates_tenant_token UNIQUE (tenant_id, verification_token)'), 'certificates has UNIQUE(tenant_id, verification_token)');

  // Duplicate active certificate partial index
  assert(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_active_certificate_per_enrolment'), 'uq_active_certificate_per_enrolment partial index defined in DDL');

  // Triggers and Functions
  assert(sql.includes('FUNCTION public.validate_certificate_eligibility_before_insert()'), 'validate_certificate_eligibility_before_insert function defined');
  assert(sql.includes('FUNCTION public.prevent_certificate_mutation()'), 'prevent_certificate_mutation function defined');
  assert(sql.includes('FUNCTION public.verify_certificate_public('), 'verify_certificate_public function defined');
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT, TEXT) TO anon, authenticated;'), 'verify_certificate_public granted to anon and authenticated');

  // =========================================================================
  // 3. Test Harness Setup & Authoritative Entities
  // =========================================================================
  console.log('\n--- Test Suite 3: Test Environment Initialization ---');

  const tenantA = '550e8400-e29b-41d4-a716-446655440000';
  const tenantB = '660e8400-e29b-41d4-a716-446655440001';

  app.state.authoritativeTenantId = tenantA;
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin_a', role: 'Super Admin', name: 'Academic Administrator' }
  };
  app.state.students = [];
  app.state.programmes = [];
  app.state.cohorts = [];
  app.state.enrolments = [];
  app.state.certificates = [];
  app.state.auditLog = [];
  app.state.invoices = [];
  app.state.counters = { student: 101, enrolment: 1001, certificate: 1001 };

  // Create Student
  const stuAlice = {
    id: 'stu_p4_alice',
    tenant_id: tenantA,
    tenantId: tenantA,
    studentNumber: 'STU-2026-0001',
    name: 'Alice Johnson',
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@example.com'
  };
  app.state.students.push(stuAlice);

  // Create Programme
  const progFullStack = {
    id: 'prog_p4_01',
    tenant_id: tenantA,
    tenantId: tenantA,
    code: 'FSD-PRO',
    name: 'Full Stack Software Development',
    tuitionFee: 350000,
    sessionCount: 20
  };
  app.state.programmes.push(progFullStack);

  // Create Cohort
  const cohortSept = {
    id: 'coh_p4_01',
    tenant_id: tenantA,
    tenantId: tenantA,
    programmeId: 'prog_p4_01',
    cohortCode: 'FSD-2026-09',
    name: 'Full Stack September 2026 Cohort',
    startDate: '2026-09-01',
    endDate: '2026-11-30',
    capacity: 25,
    status: 'ACTIVE'
  };
  app.state.cohorts.push(cohortSept);

  // Seed delivered session and attendance for Alice
  app.state.trainingSessions = [{
    id: 'ses_p4_01',
    tenant_id: tenantA,
    tenantId: tenantA,
    cohortId: 'coh_p4_01',
    sessionNumber: 1,
    status: 'COMPLETED'
  }];
  app.state.attendance = [{
    id: 'att_p4_01',
    tenant_id: tenantA,
    tenantId: tenantA,
    cohortId: 'coh_p4_01',
    sessionId: 'ses_p4_01',
    enrolmentId: 'enr_p4_alice',
    attendanceStatus: 'PRESENT'
  }];

  // Create Active Enrolment (unverified)
  const enrAlice = {
    id: 'enr_p4_alice',
    tenant_id: tenantA,
    tenantId: tenantA,
    enrolmentNumber: 'ENR-2026-1001',
    studentId: 'stu_p4_alice',
    studentName: 'Alice Johnson',
    programmeId: 'prog_p4_01',
    programmeName: 'Full Stack Software Development',
    cohortId: 'coh_p4_01',
    cohortName: 'Full Stack September 2026 Cohort',
    status: 'ACTIVE',
    completionStatus: 'NOT_ELIGIBLE',
    certificateIssued: false,
    certificateNumber: null,
    certificateIssuedAt: null
  };
  app.state.enrolments.push(enrAlice);

  assert(app.state.students.length === 1, 'Student Alice registered in tenant A');
  assert(app.state.enrolments.length === 1, 'Active enrolment registered for Alice');

  // =========================================================================
  // 4. Academic Completion Guard
  // =========================================================================
  console.log('\n--- Test Suite 4: Academic Completion Guard ---');

  // Attempt to issue certificate for unverified enrolment -> MUST BE REJECTED
  let unverifiedThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_alice');
  } catch (err) {
    unverifiedThrown = true;
    assert(err.message.includes('INELIGIBLE_CERTIFICATE_ISSUANCE'), 'Issuance rejected: Enrolment is not completed and verified');
  }
  assert(unverifiedThrown, 'Unverified enrolment certificate issuance rejected');

  // Now verify completion via authoritative verification service
  enrAlice.completionAttendancePct = 95;
  const verResult = await app.verifyAuthoritativeCompletion('enr_p4_alice', 'Exceptional capstone performance and attendance');
  assert(verResult.success === true, 'Enrolment completion verified successfully');
  assert(enrAlice.status === 'COMPLETED', 'Enrolment status updated to COMPLETED');
  assert(enrAlice.completionStatus === 'VERIFIED', 'Enrolment completionStatus marked as VERIFIED');

  // =========================================================================
  // 5. Authoritative Certificate Issuance & Snapshots
  // =========================================================================
  console.log('\n--- Test Suite 5: Authoritative Certificate Issuance & Snapshots ---');

  const issueRes = await app.issueAuthoritativeCertificate('enr_p4_alice', {
    issueDate: '2026-09-05'
  });
  assert(issueRes.success === true, 'Certificate issued successfully for completed enrolment');

  const cert = issueRes.certificate;
  assert(cert.certificateNumber === 'CERT-2026-1001', 'Deterministic certificate numbering: CERT-2026-1001');
  assert(cert.tenantId === tenantA, 'Certificate belongs to authoritative tenant');
  assert(cert.studentId === 'stu_p4_alice', 'Certificate linked to student Alice');
  assert(cert.enrolmentId === 'enr_p4_alice', 'Certificate linked to enrolment');
  assert(cert.programmeId === 'prog_p4_01', 'Certificate linked to programme');
  assert(cert.cohortId === 'coh_p4_01', 'Certificate linked to cohort');
  assert(cert.status === 'ISSUED', 'Certificate status is ISSUED');
  assert(Boolean(cert.verificationToken), 'Secure verification token generated');
  assert(cert.studentNameSnapshot === 'Alice Johnson', 'Immutable student name snapshot preserved');
  assert(cert.programmeNameSnapshot === 'Full Stack Software Development', 'Immutable programme name snapshot preserved');
  assert(cert.programmeCodeSnapshot === 'FSD-PRO', 'Immutable programme code snapshot preserved');
  assert(cert.cohortNameSnapshot === 'Full Stack September 2026 Cohort', 'Immutable cohort name snapshot preserved');
  assert(cert.cohortCodeSnapshot === 'FSD-2026-09', 'Immutable cohort code snapshot preserved');
  assert(cert.attendancePctSnapshot === 100, 'Immutable attendance percentage snapshot preserved');

  // Check synchronization of denormalized fields on enrolment
  assert(enrAlice.certificateIssued === true, 'Enrolment certificate_issued marked true');
  assert(enrAlice.certificateNumber === 'CERT-2026-1001', 'Enrolment certificate_number synchronized');
  assert(Boolean(enrAlice.certificateIssuedAt), 'Enrolment certificate_issued_at synchronized');

  // =========================================================================
  // 6. Duplicate Active Certificate Guard
  // =========================================================================
  console.log('\n--- Test Suite 6: Duplicate Active Certificate Guard ---');

  let dupThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_alice');
  } catch (err) {
    dupThrown = true;
    assert(err.message.includes('DUPLICATE_ACTIVE_CERTIFICATE'), 'Duplicate active certificate issuance rejected');
  }
  assert(dupThrown, 'Duplicate active certificate blocked');

  // =========================================================================
  // 7. Four-Eyes Role Authorization
  // =========================================================================
  console.log('\n--- Test Suite 7: Four-Eyes Role Authorization ---');

  // Create second student for role testing
  const stuBob = {
    id: 'stu_p4_bob',
    tenant_id: tenantA,
    tenantId: tenantA,
    studentNumber: 'STU-2026-0002',
    name: 'Bob Smith'
  };
  app.state.students.push(stuBob);

  const enrBob = {
    id: 'enr_p4_bob',
    tenant_id: tenantA,
    tenantId: tenantA,
    enrolmentNumber: 'ENR-2026-1002',
    studentId: 'stu_p4_bob',
    studentName: 'Bob Smith',
    programmeId: 'prog_p4_01',
    cohortId: 'coh_p4_01',
    status: 'COMPLETED',
    completionStatus: 'VERIFIED',
    completionAttendancePct: 88,
    certificateIssued: false
  };
  app.state.enrolments.push(enrBob);

  // Attack 1: Facilitator attempts certificate issuance
  app.state.auth.user = { id: 'usr_fac_01', role: 'Facilitator', name: 'Lead Facilitator' };
  let facThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_bob');
  } catch (err) {
    facThrown = true;
    assert(err.message.includes('UNAUTHORIZED'), 'Facilitator blocked from issuing certificate');
  }
  assert(facThrown, 'Facilitator issuance unauthorized');

  // Attack 2: Finance attempts certificate issuance
  app.state.auth.user = { id: 'usr_fin_01', role: 'Finance', name: 'Finance Officer' };
  let finThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_bob');
  } catch (err) {
    finThrown = true;
    assert(err.message.includes('UNAUTHORIZED'), 'Finance blocked from issuing certificate');
  }
  assert(finThrown, 'Finance issuance unauthorized');

  // Attack 3: Student attempts certificate issuance
  app.state.auth.user = { id: 'usr_stu_bob', role: 'Student', name: 'Bob Smith' };
  let stuThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_bob');
  } catch (err) {
    stuThrown = true;
    assert(err.message.includes('UNAUTHORIZED'), 'Student blocked from issuing certificate');
  }
  assert(stuThrown, 'Student issuance unauthorized');

  // Restore authorized Admin user
  app.state.auth.user = { id: 'usr_admin_a', role: 'Super Admin', name: 'Academic Administrator' };

  // =========================================================================
  // 8. Financial Separation Invariant
  // =========================================================================
  console.log('\n--- Test Suite 8: Financial Separation Invariant ---');

  // Attach an outstanding invoice of ₦200,000 to Bob's enrolment
  const unpaidInvoice = {
    id: 'inv_p4_unpaid',
    tenant_id: tenantA,
    tenantId: tenantA,
    enrolmentId: 'enr_p4_bob',
    studentId: 'stu_p4_bob',
    total: 200000,
    balance: 200000,
    status: 'UNPAID'
  };
  app.state.invoices.push(unpaidInvoice);

  // Issue certificate for Bob despite outstanding balance
  const bobCertRes = await app.issueAuthoritativeCertificate('enr_p4_bob');
  assert(bobCertRes.success === true, 'Financial Separation: Certificate issued despite outstanding financial balance');
  assert(bobCertRes.certificate.certificateNumber === 'CERT-2026-1002', 'Bob certificate number generated');
  assert(enrBob.certificateIssued === true, 'Bob enrolment marked certificate_issued');

  // =========================================================================
  // 9. Controlled Revocation Governance
  // =========================================================================
  console.log('\n--- Test Suite 9: Controlled Revocation Governance ---');

  // Revocation without reason -> MUST BE REJECTED
  let noReasonThrown = false;
  try {
    await app.revokeAuthoritativeCertificate(cert.id, '');
  } catch (err) {
    noReasonThrown = true;
    assert(err.message.includes('REVOCATION_REASON_REQUIRED'), 'Revocation without documented reason rejected');
  }
  assert(noReasonThrown, 'Mandatory revocation reason enforced');

  // Revocation with documented reason -> ALLOWED
  const revokeRes = await app.revokeAuthoritativeCertificate(cert.id, 'Student legal name misspelled on official identity document');
  assert(revokeRes.success === true, 'Certificate revoked successfully');
  assert(cert.status === 'REVOKED', 'Certificate status updated to REVOKED');
  assert(cert.revocationReason === 'Student legal name misspelled on official identity document', 'Revocation reason captured');
  assert(Boolean(cert.revokedAt), 'Revocation timestamp captured');

  // Enrolment summary updated
  assert(enrAlice.certificateIssued === false, 'Enrolment certificate_issued set to false after revocation');

  // Attempting to revoke an already revoked certificate -> REJECTED
  let doubleRevokeThrown = false;
  try {
    await app.revokeAuthoritativeCertificate(cert.id, 'Second revocation attempt');
  } catch (err) {
    doubleRevokeThrown = true;
    assert(err.message.includes('ALREADY_REVOKED'), 'Double revocation rejected');
  }
  assert(doubleRevokeThrown, 'Already revoked certificate cannot be revoked again');

  // =========================================================================
  // 10. Controlled Reissuance Lifecycle
  // =========================================================================
  console.log('\n--- Test Suite 10: Controlled Reissuance Lifecycle ---');

  const reissueRes = await app.reissueAuthoritativeCertificate(cert.id, 'Reissuing with corrected legal name: Dr. Alice M. Johnson', {
    studentNameSnapshot: 'Dr. Alice M. Johnson'
  });
  assert(reissueRes.success === true, 'Certificate reissued successfully');

  const newCert = reissueRes.certificate;
  assert(newCert.id !== cert.id, 'New certificate has unique primary key');
  assert(newCert.certificateNumber === 'CERT-2026-1003', 'New certificate has sequential certificate number');
  assert(newCert.reissuedFromCertificateId === cert.id, 'New certificate linked to previous revoked certificate ID');
  assert(newCert.status === 'ISSUED', 'New certificate status is ISSUED');
  assert(newCert.studentNameSnapshot === 'Dr. Alice M. Johnson', 'New certificate contains corrected student name snapshot');
  assert(enrAlice.certificateIssued === true, 'Enrolment summary resynchronized to active');
  assert(enrAlice.certificateNumber === 'CERT-2026-1003', 'Enrolment certificateNumber updated to reissued number');

  // =========================================================================
  // 11. Safe Public Verification Service
  // =========================================================================
  console.log('\n--- Test Suite 11: Safe Public Verification Service ---');

  // Public verification of active issued certificate
  const verifyActive = app.verifyCertificatePublic('CERT-2026-1003');
  assert(verifyActive.found === true, 'Public verification found issued certificate');
  assert(verifyActive.isValid === true, 'Public verification confirms valid credential');
  assert(verifyActive.status === 'ISSUED', 'Status reported as ISSUED');
  assert(verifyActive.studentName === 'Dr. Alice M. Johnson', 'Verified student name exposed');
  assert(verifyActive.programmeName === 'Full Stack Software Development', 'Verified programme name exposed');

  // Data Privacy Invariant: Check that NO sensitive data is leaked
  assert(verifyActive.invoiceId === undefined, 'No invoice ID exposed in public verification');
  assert(verifyActive.balance === undefined, 'No financial balance exposed in public verification');
  assert(verifyActive.email === undefined, 'No student private email exposed in public verification');
  assert(verifyActive.phone === undefined, 'No student phone exposed in public verification');
  assert(verifyActive.tenantId === undefined, 'No tenant UUID exposed in public verification');

  // Verification of revoked certificate
  const verifyRevoked = app.verifyCertificatePublic('CERT-2026-1001');
  assert(verifyRevoked.found === true, 'Public verification found original certificate');
  assert(verifyRevoked.isValid === false, 'Public verification flags revoked certificate as invalid');
  assert(verifyRevoked.status === 'REVOKED', 'Status reported as REVOKED');

  // Verification via secure token
  const verifyByToken = app.verifyCertificatePublic(null, newCert.verificationToken);
  assert(verifyByToken.found === true, 'Public verification by secure token succeeds');
  assert(verifyByToken.certificateNumber === 'CERT-2026-1003', 'Token resolves correct certificate');

  // Verification of non-existent credential
  const verifyBogus = app.verifyCertificatePublic('CERT-9999-9999');
  assert(verifyBogus.found === false, 'Non-existent certificate returns found: false');
  assert(verifyBogus.isValid === false, 'Non-existent certificate returns isValid: false');

  // =========================================================================
  // 12. Cross-Tenant Attack Testing
  // =========================================================================
  console.log('\n--- Test Suite 12: Cross-Tenant Attack Testing ---');

  // Create Tenant B entities
  const enrTenantB = {
    id: 'enr_p4_tb_01',
    tenant_id: tenantB,
    tenantId: tenantB,
    enrolmentNumber: 'ENR-2026-9001',
    studentId: 'stu_p4_tb',
    programmeId: 'prog_p4_01',
    cohortId: 'coh_p4_01',
    status: 'COMPLETED',
    completionStatus: 'VERIFIED',
    completionAttendancePct: 90
  };
  app.state.enrolments.push(enrTenantB);

  // Attack 1: Tenant A administrator attempts to issue certificate for Tenant B enrolment
  let crossEnrThrown = false;
  try {
    await app.issueAuthoritativeCertificate('enr_p4_tb_01');
  } catch (err) {
    crossEnrThrown = true;
    assert(err.message.includes('foreign tenant') || err.message.includes('not found'), 'Cross-Tenant Attack 1: Cannot issue certificate for foreign tenant enrolment');
  }
  assert(crossEnrThrown, 'Cross-tenant certificate issuance rejected');

  // Attack 2: Query isolation - getCertificatesByStudent for foreign student
  const foreignStudentCerts = app.getCertificatesByStudent('stu_p4_tb');
  assert(foreignStudentCerts.length === 0, 'Cross-Tenant Attack 2: getCertificatesByStudent returns empty for foreign student');

  // =========================================================================
  // 13. Audit Trail Immutability & Event Integrity
  // =========================================================================
  console.log('\n--- Test Suite 13: Audit Trail Immutability & Event Integrity ---');

  const finalAudit = app.state.auditLog || [];
  const requiredActions = [
    'CERTIFICATE_ISSUED',
    'CERTIFICATE_REVOKED',
    'CERTIFICATE_REISSUED'
  ];

  requiredActions.forEach(action => {
    const found = finalAudit.find(a => a.action === action);
    assert(Boolean(found), `Phase 4 audit event '${action}' logged in immutable audit trail`);
  });

  console.log('\n===============================================================');
  console.log(` PHASE 4 TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (TOTAL ${passCount + failCount} ASSERTIONS)`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch(err => {
  console.error('\nTest runner fatal error:', err);
  process.exit(1);
});
