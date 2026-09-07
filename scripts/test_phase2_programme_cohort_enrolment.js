/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Phase 2 Automated Certification Test Suite: Programme, Cohort & Authoritative Enrolment Model
 * 
 * Tests:
 * 1. DDL & Schema Architecture (Composite Foreign Keys, Closed Perimeter, Zero Exam Invariants)
 * 2. Authoritative Programme Lifecycle & Tuition Calculation
 * 3. Authoritative Cohort Lifecycle & Capacity Constraints
 * 4. Authoritative Enrolment Entity (Student + Programme + Cohort)
 * 5. Concurrency & Seat Capacity Guard
 * 6. Closed Tenant Boundary & Cross-Tenant Isolation (All entity combinations)
 * 7. Staged Legacy Enrolment Migration & Review Flagging
 * 8. Comprehensive Audit Trail Certification
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
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {}
  };

  vm.runInNewContext(scriptContent, sandbox);
  return { app: sandbox.module.exports, sandbox, html };
}

async function runPhase2Certification() {
  console.log('========================================================================================');
  console.log(' PHASE 2: PROGRAMME, COHORT & AUTHORITATIVE ENROLMENT MODEL CERTIFICATION');
  console.log('========================================================================================\n');

  const schemaPath = path.join(__dirname, '..', 'supabase_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const { app } = loadApplicationSandbox();

  const TENANT_A = 'a1111111-1111-4111-8111-111111111111';
  const TENANT_B = 'b2222222-2222-4222-8222-222222222222';

  // ===========================================================================
  // SECTION 1: DDL & SCHEMA ARCHITECTURE (Composite FKs, Closed Perimeter, Zero Exam Invariants)
  // ===========================================================================
  console.log('--- SECTION 1: Schema Architecture, Closed Perimeter & Zero-Exam Invariants ---');

  // 1. Zero Examination Invariant
  const examKeywords = [
    /create table\s+public\.exams\b/i,
    /create table\s+public\.mock_exams\b/i,
    /create table\s+public\.quizzes\b/i,
    /create table\s+public\.assessments\b/i,
    /create table\s+public\.exam_grades\b/i,
    /exam_certificate/i
  ];
  examKeywords.forEach((regex, idx) => {
    assert(!regex.test(schemaSql), `DDL Zero-Exam Check ${idx + 1}: Prohibited exam/quiz construct does NOT exist`);
  });

  // 2. Program and Cohort tables exist
  assert(/CREATE TABLE IF NOT EXISTS public\.programmes/i.test(schemaSql), 'public.programmes table defined');
  assert(/CREATE TABLE IF NOT EXISTS public\.cohorts/i.test(schemaSql), 'public.cohorts table defined');
  assert(/CREATE TABLE IF NOT EXISTS public\.enrolments/i.test(schemaSql), 'public.enrolments table defined');

  // 3. Composite unique keys on parents
  assert(/CONSTRAINT uq_programmes_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'programmes has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_cohorts_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'cohorts has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_cohorts_tenant_prog UNIQUE\s*\(tenant_id,\s*id,\s*programme_id\)/i.test(schemaSql), 'cohorts has UNIQUE(tenant_id, id, programme_id)');
  assert(/CONSTRAINT uq_students_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'students has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_personnel_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'personnel has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_invoices_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'invoices has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_customers_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'customers has UNIQUE(tenant_id, id)');
  assert(/CONSTRAINT uq_enquiries_tenant_id UNIQUE\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enquiries has UNIQUE(tenant_id, id)');

  // 4. Composite FK perimeter on cohorts
  assert(/FOREIGN KEY\s*\(tenant_id,\s*programme_id\)\s*REFERENCES public\.programmes\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'cohorts composite FK to programmes(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*lead_facilitator_id\)\s*REFERENCES public\.personnel\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'cohorts composite FK to personnel(tenant_id, id)');

  // 5. Composite FK perimeter on enrolments
  assert(/FOREIGN KEY\s*\(tenant_id,\s*student_id\)\s*REFERENCES public\.students\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to students(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*programme_id\)\s*REFERENCES public\.programmes\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to programmes(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*cohort_id\)\s*REFERENCES public\.cohorts\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to cohorts(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*cohort_id,\s*programme_id\)\s*REFERENCES public\.cohorts\s*\(tenant_id,\s*id,\s*programme_id\)/i.test(schemaSql), 'enrolments composite FK to cohorts(tenant_id, id, programme_id) preventing cross-programme cohort mismatch');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*invoice_id\)\s*REFERENCES public\.invoices\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to invoices(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*customer_id\)\s*REFERENCES public\.customers\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to customers(tenant_id, id)');
  assert(/FOREIGN KEY\s*\(tenant_id,\s*enquiry_id\)\s*REFERENCES public\.enquiries\s*\(tenant_id,\s*id\)/i.test(schemaSql), 'enrolments composite FK to enquiries(tenant_id, id)');

  // 6. Concurrency Trigger & Function Definition
  assert(/CREATE OR REPLACE FUNCTION public\.check_cohort_capacity_before_enrolment\(\)/i.test(schemaSql), 'check_cohort_capacity_before_enrolment function exists');
  assert(/FOR UPDATE/i.test(schemaSql), 'Function acquires row lock FOR UPDATE on cohorts');
  assert(/REVOKE ALL ON FUNCTION public\.check_cohort_capacity_before_enrolment\(\) FROM PUBLIC,\s*authenticated,\s*anon/i.test(schemaSql), 'Function permissions revoked from authenticated and anon to prevent direct RPC execution');
  assert(/CREATE TRIGGER trg_check_cohort_capacity/i.test(schemaSql), 'Cohort capacity trigger attached to public.enrolments');

  // 7. RLS Enabled & Policies
  assert(/ALTER TABLE public\.cohorts ENABLE ROW LEVEL SECURITY/i.test(schemaSql), 'cohorts RLS enabled');
  assert(/CREATE POLICY "cohorts_admin_insert"/i.test(schemaSql), 'cohorts admin insert policy exists');
  assert(/CREATE POLICY "cohorts_admin_update"/i.test(schemaSql), 'cohorts admin update policy exists');
  assert(/CREATE POLICY "cohorts_admin_delete"/i.test(schemaSql), 'cohorts admin delete policy exists');

  // ===========================================================================
  // SECTION 2: AUTHORITATIVE PROGRAMME LIFECYCLE
  // ===========================================================================
  console.log('\n--- SECTION 2: Authoritative Programme Lifecycle & Validation ---');

  app.state.authoritativeTenantId = TENANT_A;
  app.state.auth = { isAuthenticated: true, user: { role: 'Super Admin', name: 'Super Admin Test', tenant_id: TENANT_A } };
  app.state.programmes = [];
  app.state.cohorts = [];
  app.state.enrolments = [];
  app.state.personnel = [];
  app.state.students = [];
  app.state.auditLog = [];

  // 1. Create valid programme
  const progRes1 = await app.saveAuthoritativeProgramme({
    code: 'CLP-IEL',
    name: 'IELTS Masterclass Intensive',
    description: 'Comprehensive 6-week IELTS preparation course',
    tuitionFee: 150000,
    maxDiscountPct: 20,
    durationWeeks: 6,
    sessionCount: 18,
    allowInstallments: true,
    installmentFirstPct: 60,
    installmentSecondPct: 40
  });

  assert(progRes1.success === true, 'Successfully created authoritative programme');
  assert(progRes1.programme.code === 'CLP-IEL', 'Programme code normalized');
  assert(progRes1.programme.tuitionFee === 150000, 'Tuition fee correctly set');
  assert(progRes1.programme.tenant_id === TENANT_A, 'Authoritative tenant_id injected');

  // 2. Reject negative tuition fee
  const negFeeRes = await app.saveAuthoritativeProgramme({
    code: 'CLP-NEG',
    name: 'Negative Fee Test',
    tuitionFee: -500
  });
  assert(negFeeRes.success === false, 'Negative tuition fee rejected');

  // 3. Reject invalid discount percentage (> 100)
  const invDiscRes = await app.saveAuthoritativeProgramme({
    code: 'CLP-DISC',
    name: 'Invalid Discount Test',
    tuitionFee: 100000,
    maxDiscountPct: 150
  });
  assert(invDiscRes.success === false, 'Discount percentage > 100 rejected');

  // 4. Reject installment sum != 100%
  const badInstRes = await app.saveAuthoritativeProgramme({
    code: 'CLP-INST',
    name: 'Bad Installments Test',
    tuitionFee: 100000,
    allowInstallments: true,
    installmentFirstPct: 50,
    installmentSecondPct: 60 // 110%
  });
  assert(badInstRes.success === false, 'Installment percentages summing to 110% rejected');

  // 5. Reject duplicate programme code in same tenant
  const dupCodeRes = await app.saveAuthoritativeProgramme({
    code: 'CLP-IEL',
    name: 'Duplicate IELTS Code',
    tuitionFee: 200000
  });
  assert(dupCodeRes.success === false, 'Duplicate programme code in same tenant rejected');

  // 6. Update programme
  const updateProgRes = await app.saveAuthoritativeProgramme({
    id: progRes1.programme.id,
    code: 'CLP-IEL',
    name: 'IELTS Masterclass Intensive (Updated)',
    tuitionFee: 160000,
    maxDiscountPct: 25,
    allowInstallments: true,
    installmentFirstPct: 50,
    installmentSecondPct: 50
  });
  assert(updateProgRes.success === true, 'Programme successfully updated');
  assert(updateProgRes.programme.tuitionFee === 160000, 'Tuition fee updated to 160,000');

  // ===========================================================================
  // SECTION 3: AUTHORITATIVE COHORT LIFECYCLE & CAPACITY
  // ===========================================================================
  console.log('\n--- SECTION 3: Authoritative Cohort Lifecycle & Capacity Constraints ---');

  // Add facilitator to personnel
  app.state.personnel.push({
    id: 'pers_fac_1',
    tenant_id: TENANT_A,
    name: 'Dr. Chinedu Eze',
    jobTitle: 'Senior IELTS Facilitator',
    employeeType: 'Facilitator',
    status: 'ACTIVE'
  });

  // Add non-facilitator to personnel (Finance Staff)
  app.state.personnel.push({
    id: 'pers_staff_1',
    tenant_id: TENANT_A,
    name: 'Amaka Accountant',
    jobTitle: 'Finance Officer',
    employeeType: 'Staff',
    status: 'ACTIVE'
  });

  // 1. Create valid cohort
  const cohortRes1 = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-2026-A',
    name: 'IELTS 2026 Batch A',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    deliveryMode: 'IN_PERSON',
    capacity: 25,
    leadFacilitatorId: 'pers_fac_1'
  });
  assert(cohortRes1.success === true, 'Cohort created successfully');
  assert(cohortRes1.cohort.cohortCode === 'CLP-IEL-2026-A', 'Cohort code normalized');
  assert(cohortRes1.cohort.capacity === 25, 'Capacity set to 25');
  assert(cohortRes1.cohort.tenant_id === TENANT_A, 'Tenant ID correctly attached');

  // 2. Reject cohort with end date earlier than start date
  const badDateRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-BAD-DATE',
    startDate: '2026-11-01',
    endDate: '2026-10-01',
    capacity: 20
  });
  assert(badDateRes.success === false, 'Cohort rejected when end date is earlier than start date');

  // 3. Reject non-positive or non-integer capacity
  const badCapRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-BAD-CAP',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    capacity: 0
  });
  assert(badCapRes.success === false, 'Zero capacity rejected');

  // 4. Reject invalid delivery mode
  const badModeRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-BAD-MODE',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    deliveryMode: 'SELF_PACED_NOT_ALLOWED',
    capacity: 20
  });
  assert(badModeRes.success === false, 'Invalid delivery mode rejected');

  // 5. Reject non-facilitator personnel assignment as lead facilitator
  const badFacRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-BAD-FAC',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    deliveryMode: 'IN_PERSON',
    capacity: 20,
    leadFacilitatorId: 'pers_staff_1'
  });
  assert(badFacRes.success === false, 'Non-facilitator personnel rejected as cohort lead');

  // 6. Reject duplicate cohort code in same tenant
  const dupCohortRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-IEL-2026-A',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    capacity: 20
  });
  assert(dupCohortRes.success === false, 'Duplicate cohort code rejected');

  // 7. Prevent deleting programme while referenced by cohort
  const delProgWithCohort = await app.deleteAuthoritativeProgramme(progRes1.programme.id);
  assert(delProgWithCohort.success === false, 'Prevented deleting programme referenced by existing cohort');

  // ===========================================================================
  // SECTION 4: AUTHORITATIVE ENROLMENT ENTITY & TUITION FEE SNAPSHOT
  // ===========================================================================
  console.log('\n--- SECTION 4: Authoritative Enrolment Entity & Tuition Fee Snapshot ---');

  // Create authoritative student
  const studentRes = await app.saveAuthoritativeStudent({
    firstName: 'Tunde',
    lastName: 'Bello',
    email: 'tunde.bello@example.com',
    phone: '+2348011223344'
  });
  assert(studentRes.success === true, 'Authoritative student created');
  const studentId = studentRes.student.id;

  // 1. Enrol student into Cohort A with 10% discount
  const enrolRes1 = await app.saveAuthoritativeEnrolment({
    studentId: studentId,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id,
    discountPct: 10
  });
  assert(enrolRes1.success === true, 'Student successfully enrolled');
  assert(enrolRes1.enrolment.studentId === studentId, 'Enrolment links authoritative studentId');
  assert(enrolRes1.enrolment.programmeId === progRes1.programme.id, 'Enrolment links authoritative programmeId');
  assert(enrolRes1.enrolment.cohortId === cohortRes1.cohort.id, 'Enrolment links authoritative cohortId');
  assert(enrolRes1.enrolment.enrolmentNumber.startsWith('ENR-'), 'Enrolment number generated with ENR- prefix');

  // Standard tuition was 160,000, 10% discount = 16,000, agreed tuition = 144,000
  assert(enrolRes1.enrolment.agreedTuitionFee === 144000, 'Agreed tuition snapshot calculated: ₦144,000');
  assert(enrolRes1.enrolment.discountAmount === 16000, 'Discount amount snapshot captured: ₦16,000');

  // 2. Financial Immobility / Snapshot Persistence:
  // If the programme standard tuition subsequently changes, existing enrolment agreedTuitionFee must NOT change!
  await app.saveAuthoritativeProgramme({
    id: progRes1.programme.id,
    code: 'CLP-IEL',
    name: 'IELTS Masterclass Intensive (Updated)',
    tuitionFee: 200000 // Price increases to 200,000
  });

  const persistedEnrolment = app.findEnrolmentById(enrolRes1.enrolment.id);
  assert(persistedEnrolment.agreedTuitionFee === 144000, 'Existing agreed tuition remains ₦144,000 after subsequent programme tuition hike');

  // 3. Discount cannot exceed programme maximum (max is 25%)
  const student2Res = await app.saveAuthoritativeStudent({
    firstName: 'Nkechi',
    lastName: 'Okafor',
    email: 'nkechi.okafor@example.com'
  });
  const excessDiscRes = await app.saveAuthoritativeEnrolment({
    studentId: student2Res.student.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id,
    discountPct: 35 // Exceeds max allowed 25%
  });
  assert(excessDiscRes.success === false, 'Enrolment rejected when requested discount exceeds maxDiscountPct');

  // 4. Duplicate enrolment rejection: Same student cannot enrol twice in the same cohort
  const dupEnrolRes = await app.saveAuthoritativeEnrolment({
    studentId: studentId,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id
  });
  assert(dupEnrolRes.success === false, 'Duplicate student enrolment in same cohort rejected');

  // 5. Cross-Programme Cohort Mismatch Rejection
  // Create a second programme
  const prog2Res = await app.saveAuthoritativeProgramme({
    code: 'CLP-DEV',
    name: 'Full Stack Web Engineering',
    tuitionFee: 300000
  });

  // Attempt to enrol into Programme 2 using Cohort 1 (which belongs to Programme 1)
  const mismatchRes = await app.saveAuthoritativeEnrolment({
    studentId: student2Res.student.id,
    programmeId: prog2Res.programme.id,
    cohortId: cohortRes1.cohort.id // Cohort 1 belongs to CLP-IEL, not CLP-DEV!
  });
  assert(mismatchRes.success === false, 'Composite integrity error: Cohort mismatch with specified programme rejected');

  // 6. Withdrawn student cannot be enrolled
  const studentWithdrawnRes = await app.saveAuthoritativeStudent({
    firstName: 'Withdrawn',
    lastName: 'Student',
    email: 'withdrawn@example.com',
    status: 'WITHDRAWN'
  });
  const enrolWithdrawnRes = await app.saveAuthoritativeEnrolment({
    studentId: studentWithdrawnRes.student.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id
  });
  assert(enrolWithdrawnRes.success === false, 'Enrolment of WITHDRAWN student rejected');

  // 7. Enrolment withdrawal transitions status and frees capacity
  const withdrawRes = await app.withdrawAuthoritativeEnrolment(enrolRes1.enrolment.id, 'Relocation abroad');
  assert(withdrawRes.success === true, 'Enrolment successfully withdrawn');
  assert(withdrawRes.enrolment.status === 'WITHDRAWN', 'Status updated to WITHDRAWN');

  // ===========================================================================
  // SECTION 5: REAL-TIME CONCURRENCY & SEAT CAPACITY ENFORCEMENT
  // ===========================================================================
  console.log('\n--- SECTION 5: Real-Time Seat Capacity & Concurrency Enforcement ---');

  // Create limited capacity cohort (Capacity = 2)
  const microCohortRes = await app.saveAuthoritativeCohort({
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-MICRO-2026',
    name: 'Micro Cohort (Max 2 Seats)',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    capacity: 2
  });
  const microCohortId = microCohortRes.cohort.id;

  // Create 3 students
  const stuA = (await app.saveAuthoritativeStudent({ firstName: 'Student', lastName: 'Alpha', email: 'alpha@test.com' })).student;
  const stuB = (await app.saveAuthoritativeStudent({ firstName: 'Student', lastName: 'Beta', email: 'beta@test.com' })).student;
  const stuC = (await app.saveAuthoritativeStudent({ firstName: 'Student', lastName: 'Gamma', email: 'gamma@test.com' })).student;

  // Enrol Alpha -> 1/2 seats
  const seat1Res = await app.saveAuthoritativeEnrolment({ studentId: stuA.id, programmeId: progRes1.programme.id, cohortId: microCohortId });
  assert(seat1Res.success === true, 'Student Alpha enrolled (1/2 seats)');
  let cap = app.getCohortCapacitySummary(microCohortId);
  assert(cap.enrolledCount === 1 && cap.availableSeats === 1 && cap.isFull === false, 'Capacity summary: 1/2 seats filled');

  // Enrol Beta -> 2/2 seats
  const seat2Res = await app.saveAuthoritativeEnrolment({ studentId: stuB.id, programmeId: progRes1.programme.id, cohortId: microCohortId });
  assert(seat2Res.success === true, 'Student Beta enrolled (2/2 seats)');
  cap = app.getCohortCapacitySummary(microCohortId);
  assert(cap.enrolledCount === 2 && cap.availableSeats === 0 && cap.isFull === true, 'Capacity summary: 2/2 seats filled (Cohort is FULL)');

  // Attempt to enrol Gamma into full cohort -> REJECTED
  const seat3Res = await app.saveAuthoritativeEnrolment({ studentId: stuC.id, programmeId: progRes1.programme.id, cohortId: microCohortId });
  assert(seat3Res.success === false, 'Student Gamma rejected: Capacity exceeded');
  assert(seat3Res.message.includes('COHORT CAPACITY EXCEEDED'), 'Detailed capacity exceeded error returned');

  // Withdraw Student Alpha -> Capacity drops back to 1/2
  await app.withdrawAuthoritativeEnrolment(seat1Res.enrolment.id, 'Seat vacated');
  cap = app.getCohortCapacitySummary(microCohortId);
  assert(cap.enrolledCount === 1 && cap.availableSeats === 1 && cap.isFull === false, 'Vacated seat restored: 1/2 seats filled');

  // Now Student Gamma can successfully enrol!
  const retryGammaRes = await app.saveAuthoritativeEnrolment({ studentId: stuC.id, programmeId: progRes1.programme.id, cohortId: microCohortId });
  assert(retryGammaRes.success === true, 'Student Gamma successfully enrolled into freed seat (2/2 seats)');

  // ===========================================================================
  // SECTION 6: CLOSED TENANT PERIMETER & CROSS-TENANT ATTACK TESTING
  // ===========================================================================
  console.log('\n--- SECTION 6: Closed Tenant Perimeter & Cross-Tenant Attack Testing ---');

  // Tenant B setup
  const foreignProg = {
    id: 'prog_foreign_b',
    tenant_id: TENANT_B,
    code: 'CLP-FOREIGN',
    name: 'Foreign Tenant Programme',
    tuitionFee: 100000,
    price: 100000,
    status: 'active'
  };
  app.state.programmes.push(foreignProg);

  const foreignCohort = {
    id: 'coh_foreign_b',
    tenant_id: TENANT_B,
    programmeId: foreignProg.id,
    cohortCode: 'CLP-FOR-2026',
    name: 'Foreign Cohort',
    capacity: 20,
    status: 'UPCOMING'
  };
  app.state.cohorts.push(foreignCohort);

  const foreignStudent = {
    id: 'stu_foreign_b',
    tenant_id: TENANT_B,
    studentNumber: 'STU-B-001',
    name: 'Foreign Student',
    email: 'foreign@tenantb.com',
    status: 'ACTIVE'
  };
  app.state.students.push(foreignStudent);

  // Set current execution context to TENANT A
  app.state.authoritativeTenantId = TENANT_A;

  // Attack 1: Attempt to write programme with Tenant B
  const attack1 = await app.saveAuthoritativeProgramme({
    tenant_id: TENANT_B,
    code: 'CLP-HACK',
    name: 'Tampered Tenant Programme',
    tuitionFee: 50000
  });
  assert(attack1.success === false, 'Attack 1: Rejected candidate tenant mismatch on programme creation');

  // Attack 2: Attempt to delete Tenant B programme from Tenant A
  let attack2Blocked = false;
  try {
    await app.deleteAuthoritativeProgramme(foreignProg.id);
  } catch (err) {
    attack2Blocked = true;
  }
  assert(attack2Blocked, 'Attack 2: Blocked cross-tenant deletion of foreign programme');

  // Attack 3: Attempt to write cohort with Tenant B
  const attack3 = await app.saveAuthoritativeCohort({
    tenant_id: TENANT_B,
    programmeId: progRes1.programme.id,
    cohortCode: 'CLP-HACK-COH',
    name: 'Tampered Cohort',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    capacity: 20
  });
  assert(attack3.success === false, 'Attack 3: Rejected candidate tenant mismatch on cohort creation');

  // Attack 4: Attempt to delete Tenant B cohort from Tenant A
  let attack4Blocked = false;
  try {
    await app.deleteAuthoritativeCohort(foreignCohort.id);
  } catch (err) {
    attack4Blocked = true;
  }
  assert(attack4Blocked, 'Attack 4: Blocked cross-tenant deletion of foreign cohort');

  // Attack 5: Enrol Tenant B student into Tenant A programme/cohort
  const attack5 = await app.saveAuthoritativeEnrolment({
    studentId: foreignStudent.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id
  });
  assert(attack5.success === false, 'Attack 5: Blocked enrolling foreign tenant student');

  // Attack 6: Enrol Tenant A student into Tenant B programme
  const attack6 = await app.saveAuthoritativeEnrolment({
    studentId: stuA.id,
    programmeId: foreignProg.id,
    cohortId: cohortRes1.cohort.id
  });
  assert(attack6.success === false, 'Attack 6: Blocked enrolling student into foreign tenant programme');

  // Attack 7: Enrol Tenant A student into Tenant B cohort
  const attack7 = await app.saveAuthoritativeEnrolment({
    studentId: stuA.id,
    programmeId: progRes1.programme.id,
    cohortId: foreignCohort.id
  });
  assert(attack7.success === false, 'Attack 7: Blocked enrolling student into foreign tenant cohort');

  // Attack 8: Enrolment referencing foreign invoice
  app.state.invoices = [{ id: 'inv_foreign_b', tenant_id: TENANT_B, invoiceNumber: 'INV-B-001' }];
  const attack8 = await app.saveAuthoritativeEnrolment({
    studentId: stuA.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id,
    invoiceId: 'inv_foreign_b'
  });
  assert(attack8.success === false, 'Attack 8: Blocked enrolment referencing foreign tenant invoice');

  // Attack 9: Enrolment referencing foreign customer
  app.state.customers = [{ id: 'cust_foreign_b', tenant_id: TENANT_B, name: 'Foreign Corp' }];
  const attack9 = await app.saveAuthoritativeEnrolment({
    studentId: stuA.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id,
    customerId: 'cust_foreign_b'
  });
  assert(attack9.success === false, 'Attack 9: Blocked enrolment referencing foreign tenant customer');

  // Attack 10: Enrolment referencing foreign enquiry
  app.state.enquiries = [{ id: 'enq_foreign_b', tenant_id: TENANT_B, name: 'Foreign Enquiry' }];
  const attack10 = await app.saveAuthoritativeEnrolment({
    studentId: stuA.id,
    programmeId: progRes1.programme.id,
    cohortId: cohortRes1.cohort.id,
    enquiryId: 'enq_foreign_b'
  });
  assert(attack10.success === false, 'Attack 10: Blocked enrolment referencing foreign tenant enquiry');

  // ===========================================================================
  // SECTION 7: STAGED LEGACY ENROLMENT RECONCILIATION & REVIEW FLAGGING
  // ===========================================================================
  console.log('\n--- SECTION 7: Staged Legacy Enrolment Migration & Review Flagging ---');

  app.state.enrolments = [
    // 1. Unlinked legacy enrolment that can be resolved
    {
      id: 'legacy_enr_resolvable',
      studentName: 'Tunde Bello',
      studentEmail: 'tunde.bello@example.com',
      programme: 'IELTS Masterclass Intensive',
      cohort: 'CLP-IEL-2026-A',
      enrolmentDate: '2026-08-01'
    },
    // 2. Unresolvable legacy enrolment (student doesn't exist)
    {
      id: 'legacy_enr_orphan',
      studentName: 'Ghost Candidate',
      studentEmail: 'ghost@nowhere.com',
      programme: 'Nonexistent Course',
      cohort: 'UNKNOWN-COHORT',
      enrolmentDate: '2026-08-01'
    }
  ];

  const dryRunResults = await app.migrateLegacyEnrolments({ dryRun: true });
  assert(dryRunResults.total === 2, 'Migration inspects 2 legacy records');
  assert(dryRunResults.migrated === 1, 'Dry run identifies 1 resolvable record');
  assert(dryRunResults.reviewRequired === 1, 'Dry run identifies 1 record requiring review');

  // Real migration execution
  const realResults = await app.migrateLegacyEnrolments({ dryRun: false });
  assert(realResults.migrated === 1, 'Real migration migrates 1 record');
  assert(realResults.reviewRequired === 1, 'Real migration flags 1 record for review');

  const migratedRec = app.state.enrolments.find(e => e.id === 'legacy_enr_resolvable');
  assert(migratedRec.studentId === studentId, 'Legacy record resolved studentId to authoritative student profile');
  assert(migratedRec.programmeId === progRes1.programme.id, 'Legacy record resolved programmeId');
  assert(migratedRec.cohortId === cohortRes1.cohort.id, 'Legacy record resolved cohortId');
  assert(migratedRec.enrolmentNumber && migratedRec.enrolmentNumber.startsWith('ENR-'), 'Assigned authoritative enrolment number');

  const orphanRec = app.state.enrolments.find(e => e.id === 'legacy_enr_orphan');
  assert(orphanRec.migrationReviewRequired === true, 'Orphan record preserved with migrationReviewRequired = true');
  assert(Array.isArray(orphanRec.migrationReviewReasons) && orphanRec.migrationReviewReasons.length > 0, 'Orphan record documents specific unresolved reasons');

  // ===========================================================================
  // SECTION 8: IMMUTABLE AUDIT LOGGING CERTIFICATION
  // ===========================================================================
  console.log('\n--- SECTION 8: Immutable Audit Logging Certification ---');

  const progLogs = (app.state.auditLog || []).filter(l => l.action && l.action.startsWith('PROGRAMME_'));
  assert(progLogs.length >= 2, 'Programmes have immutable audit log entries (create and update)');

  const cohortLogs = (app.state.auditLog || []).filter(l => l.action && l.action.startsWith('COHORT_'));
  assert(cohortLogs.length >= 1, 'Cohorts have immutable audit log entries');

  const enrolLogs = (app.state.auditLog || []).filter(l => l.action && l.action.startsWith('ENROLMENT_'));
  assert(enrolLogs.length >= 2, 'Enrolments have immutable audit log entries (create and withdraw)');

  console.log('\n========================================================================================');
  console.log(` PHASE 2 TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (TOTAL ${passCount + failCount} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase2Certification().catch(err => {
    console.error('Fatal error running Phase 2 certification:', err);
    process.exit(1);
  });
}

module.exports = { runPhase2Certification };
