/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 1: Authoritative Student Model Automated Certification Suite
 * 
 * Verifies:
 * 1. Database schema and RLS policies for public.students
 * 2. Bi-directional entity transformations (PostgreSQL <-> App State)
 * 3. Authoritative student lifecycle (Creation, ID numbering, Updates, Audit Logging)
 * 4. Case-insensitive deduplication and unique email integrity
 * 5. Automatic synchronization from existing business records (Enrolments, Invoices, Enquiries)
 * 6. Unified Student & Client Account Summary engine (financial position + training status)
 * 7. Tenant isolation invariants
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    failedTests++;
  }
}

async function runPhase1Suite() {
  console.log('================================================================================');
  console.log(' CLASPTEK CRM + TRAINING — PHASE 1: AUTHORITATIVE STUDENT MODEL CERTIFICATION');
  console.log('================================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const schemaPath = path.join(rootDir, 'supabase_schema.sql');
  const htmlPath = path.join(rootDir, 'index.html');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // ---------------------------------------------------------------------------
  // CATEGORY 1: DATABASE SCHEMA & RLS CERTIFICATION
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Database Schema & RLS Policy Invariants ---');

  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.students ('), 'Schema defines public.students table');
  assert(schemaContent.includes('tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT'), 'public.students enforces tenant UUID foreign key with ON DELETE RESTRICT');
  assert(schemaContent.includes('customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL'), 'public.students links to customer CRM entity');
  assert(schemaContent.includes('user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL'), 'public.students links to auth user for future student portal');
  assert(schemaContent.includes('student_number TEXT NOT NULL'), 'public.students requires student_number');
  assert(schemaContent.includes('first_name TEXT NOT NULL') && schemaContent.includes('last_name TEXT NOT NULL'), 'public.students requires first_name and last_name');
  assert(schemaContent.includes("status TEXT NOT NULL DEFAULT 'ACTIVE'"), 'public.students defaults status to ACTIVE');
  assert(schemaContent.includes("CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'WITHDRAWN'))"), 'public.students status CHECK constraint enforced');
  assert(schemaContent.includes('UNIQUE(tenant_id, student_number)'), 'Unique constraint on (tenant_id, student_number)');
  assert(schemaContent.includes('UNIQUE(tenant_id, email)'), 'Unique constraint on (tenant_id, email)');
  assert(schemaContent.includes('ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on public.students');
  assert(schemaContent.includes('CREATE POLICY "students_tenant_select"'), 'Tenant SELECT policy defined for students');
  assert(schemaContent.includes('CREATE POLICY "students_tenant_insert"'), 'Tenant INSERT policy defined for students');
  assert(schemaContent.includes('CREATE POLICY "students_tenant_update"'), 'Tenant UPDATE policy defined for students');
  assert(schemaContent.includes('CREATE POLICY "students_admin_delete"'), 'Super Admin DELETE policy defined for students');

  // ---------------------------------------------------------------------------
  // CATEGORY 2: BROWSER SCRIPT EXTRACTION & ENVIRONMENT SIMULATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Browser Script & Logic Sandbox Environment ---');

  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  assert(Boolean(scriptMatch), 'Application <script> tag successfully located in index.html');

  // Setup minimal browser simulation environment
  const mockStorage = {};
  const mockWindow = {
    location: { href: 'https://app.clasptek.org', search: '' },
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const mockDocument = {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const sandboxContext = {
    window: mockWindow,
    document: mockDocument,
    module: { exports: {} },
    localStorage: {
      getItem: k => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
      removeItem: k => { delete mockStorage[k]; },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
      key: i => Object.keys(mockStorage)[i] || null,
      get length() { return Object.keys(mockStorage).length; }
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    navigator: { userAgent: 'NodeTestEngine/1.0' },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) })
  };

  vm.createContext(sandboxContext);
  vm.runInContext(scriptMatch[1], sandboxContext);

  const app = sandboxContext.module.exports;
  assert(Boolean(app), 'module.exports successfully initialized from Clasptek engine');

  assert(typeof app.saveAuthoritativeStudent === 'function', 'saveAuthoritativeStudent is defined and exported');
  assert(typeof app.findStudentById === 'function', 'findStudentById is defined and exported');
  assert(typeof app.findStudentByNumber === 'function', 'findStudentByNumber is defined and exported');
  assert(typeof app.findStudentByEmail === 'function', 'findStudentByEmail is defined and exported');
  assert(typeof app.findStudentByName === 'function', 'findStudentByName is defined and exported');
  assert(typeof app.findStudentDuplicate === 'function', 'findStudentDuplicate is defined and exported');
  assert(typeof app.syncStudentsFromExistingData === 'function', 'syncStudentsFromExistingData is defined and exported');
  assert(typeof app.getStudentAccountSummaries === 'function', 'getStudentAccountSummaries is defined and exported');

  // ---------------------------------------------------------------------------
  // CATEGORY 3: ENTITY TRANSFORMATIONS (SNAKE_CASE <-> CAMELCASE)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Postgres Data Transformations ---');

  const testTenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const rawStudent = {
    id: 'stu_1001',
    studentNumber: 'STU-2026-0101',
    firstName: 'Chinedu',
    lastName: 'Okafor',
    email: 'chinedu.okafor@example.com',
    phone: '+2348011223344',
    gender: 'Male',
    status: 'ACTIVE',
    address: '14 Admiralty Way, Lekki, Lagos',
    emergencyContactName: 'Ngozi Okafor',
    emergencyContactPhone: '+2348099887766'
  };

  const dbTransformed = app.transformEntityForPostgres('students', rawStudent, testTenantId);
  assert(dbTransformed.id === 'stu_1001', 'Transform for Postgres retains ID');
  assert(dbTransformed.tenant_id === testTenantId, 'Transform for Postgres stamps tenant_id');
  assert(dbTransformed.student_number === 'STU-2026-0101', 'Transform for Postgres snake_cases student_number');
  assert(dbTransformed.first_name === 'Chinedu', 'Transform for Postgres snake_cases first_name');
  assert(dbTransformed.last_name === 'Okafor', 'Transform for Postgres snake_cases last_name');
  assert(dbTransformed.emergency_contact_name === 'Ngozi Okafor', 'Transform for Postgres snake_cases emergency_contact_name');
  assert(dbTransformed.emergency_contact_phone === '+2348099887766', 'Transform for Postgres snake_cases emergency_contact_phone');

  const appTransformed = app.transformEntityFromPostgres('students', dbTransformed);
  assert(appTransformed.studentNumber === 'STU-2026-0101', 'Transform from Postgres camelCases studentNumber');
  assert(appTransformed.firstName === 'Chinedu', 'Transform from Postgres camelCases firstName');
  assert(appTransformed.lastName === 'Okafor', 'Transform from Postgres camelCases lastName');
  assert(appTransformed.name === 'Chinedu Okafor', 'Transform from Postgres derives full display name');
  assert(appTransformed.emergencyContactName === 'Ngozi Okafor', 'Transform from Postgres camelCases emergencyContactName');
  assert(appTransformed.emergencyContactPhone === '+2348099887766', 'Transform from Postgres camelCases emergencyContactPhone');

  // ---------------------------------------------------------------------------
  // CATEGORY 4: AUTHORITATIVE STUDENT CREATION, NUMBERING & AUDIT TRAIL
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Student Creation, Numbering & Audit Logging ---');

  // Reset state in sandbox
  app.state.students = [];
  app.state.auditLog = [];
  app.state.counters = { student: 101, invoice: 1001 };
  app.state.authoritativeTenantId = testTenantId;
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin', name: 'Super Admin', email: 'admin@clasptek.org', role: 'Super Admin' }
  };

  const createRes1 = await app.saveAuthoritativeStudent({
    firstName: 'Amara',
    lastName: 'Eze',
    email: 'amara.eze@example.com',
    phone: '+2348022334455',
    gender: 'Female',
    emergencyContactName: 'Dr. Eze',
    emergencyContactPhone: '+2348033445566'
  }, 'Initial admissions intake');

  assert(createRes1.success === true, 'saveAuthoritativeStudent succeeds for valid new student');
  assert(createRes1.student.studentNumber.startsWith('STU-'), `Official student number generated: ${createRes1.student.studentNumber}`);
  assert(createRes1.student.name === 'Amara Eze', 'Student full name correctly assembled');
  assert(createRes1.student.status === 'ACTIVE', 'Default training status is ACTIVE');
  assert(createRes1.student.tenant_id === testTenantId, 'Authoritative tenant UUID stamped on student');
  assert(app.state.students.length === 1, 'Student successfully pushed to state.students');

  // Verify Audit Log
  assert(app.state.auditLog.length > 0, 'Audit log entry recorded');
  const auditEntry = app.state.auditLog[0];
  assert(auditEntry.action === 'STUDENT_CREATED', 'Audit action is STUDENT_CREATED');
  assert(auditEntry.entityType === 'students', 'Audit entityType is students');
  assert(auditEntry.entityId === createRes1.student.id, 'Audit entityId matches student ID');

  // ---------------------------------------------------------------------------
  // CATEGORY 5: EMAIL DEDUPLICATION & INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Email Deduplication & Validation ---');

  const dupRes = await app.saveAuthoritativeStudent({
    firstName: 'Amara',
    lastName: 'Duplicate',
    email: 'AMARA.EZE@EXAMPLE.COM' // uppercase to test case-insensitivity
  });

  assert(dupRes.success === false, 'Duplicate email registration is rejected');
  assert(dupRes.message.includes('already registered'), 'Helpful error message returned for duplicate email');
  assert(app.state.students.length === 1, 'Duplicate record was not added to state.students');

  // Validation: Missing first name
  const missingNameRes = await app.saveAuthoritativeStudent({
    firstName: '',
    lastName: 'Empty',
    email: 'empty@example.com'
  });
  assert(missingNameRes.success === false, 'Missing first name is rejected');

  // ---------------------------------------------------------------------------
  // CATEGORY 6: STUDENT UPDATES & AUDIT TRAIL PRESERVATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Student Profile Modification & Change Auditing ---');

  const studentToUpdate = createRes1.student;

  const updateRes = await app.saveAuthoritativeStudent({
    id: studentToUpdate.id,
    firstName: 'Amara',
    lastName: 'Eze-Johnson',
    email: 'amara.eze@example.com',
    phone: '+2348099001122',
    status: 'ACTIVE',
    emergencyContactName: 'Chief Johnson'
  }, 'Updated married surname and emergency contact');

  assert(updateRes.success === true, 'saveAuthoritativeStudent succeeds for update');
  assert(updateRes.student.name === 'Amara Eze-Johnson', 'Name updated to Amara Eze-Johnson');
  assert(updateRes.student.phone === '+2348099001122', 'Phone updated');
  assert(app.state.students.length === 1, 'State still contains 1 student (updated in-place)');

  const updateAudit = app.state.auditLog[0];
  assert(updateAudit.action === 'STUDENT_UPDATED', 'Audit action recorded as STUDENT_UPDATED');
  const prevObj = typeof updateAudit.previousValue === 'string' ? JSON.parse(updateAudit.previousValue) : updateAudit.previousValue;
  const newObj = typeof updateAudit.newValue === 'string' ? JSON.parse(updateAudit.newValue) : updateAudit.newValue;
  assert(prevObj.name === 'Amara Eze', 'Audit log captured exact previous name');
  assert(newObj.name === 'Amara Eze-Johnson', 'Audit log captured exact new name');
  assert(updateAudit.reason === 'Updated married surname and emergency contact', 'Audit log captured modification reason');

  // ---------------------------------------------------------------------------
  // CATEGORY 7: LOOKUP HELPERS
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Student Lookup Helpers ---');

  const byId = app.findStudentById(studentToUpdate.id);
  assert(byId !== null && byId.id === studentToUpdate.id, 'findStudentById resolves correct student');

  const byNum = app.findStudentByNumber(studentToUpdate.studentNumber);
  assert(byNum !== null && byNum.id === studentToUpdate.id, 'findStudentByNumber resolves correct student');

  const byEmail = app.findStudentByEmail('AmArA.EzE@example.com');
  assert(byEmail !== null && byEmail.id === studentToUpdate.id, 'findStudentByEmail is case-insensitive');

  const byName = app.findStudentByName('Amara Eze-Johnson');
  assert(byName !== null && byName.id === studentToUpdate.id, 'findStudentByName resolves student');

  // ---------------------------------------------------------------------------
  // CATEGORY 8: AUTOMATIC SYNCHRONIZATION FROM EXISTING RECORDS
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 8: Auto-Sync from Existing Enrolments & Invoices ---');

  // Setup legacy enrolments without student records
  app.state.enrolments = [
    {
      id: 'enr_201',
      studentName: 'Tunde Bakare',
      studentEmail: 'tunde.bakare@example.com',
      studentPhone: '+2348055443322',
      programmeName: 'Executive Leadership Training',
      cohort: 'Cohort 2026-A',
      status: 'active'
    },
    {
      id: 'enr_202',
      studentName: 'Blessing Okon',
      studentEmail: 'blessing.okon@example.com',
      studentPhone: '+2348066554433',
      programmeName: 'Financial Modeling Bootcamp',
      cohort: 'Cohort 2026-B',
      status: 'completed'
    }
  ];

  app.state.invoices = [
    {
      id: 'inv_301',
      invoiceNo: 1001,
      clientName: 'Tunde Bakare',
      email: 'tunde.bakare@example.com',
      total: 250000,
      dueDate: '2026-09-30'
    },
    {
      id: 'inv_302',
      invoiceNo: 1002,
      clientName: 'Kelechi Nwosu',
      email: 'kelechi.nwosu@example.com',
      category: 'Student Tuition',
      programmeName: 'Data Analytics Mastery',
      total: 180000,
      dueDate: '2026-09-30'
    }
  ];

  app.state.payments = [
    {
      id: 'pay_401',
      invoiceId: 'inv_301',
      receiptNo: 2001,
      amount: 250000,
      clientName: 'Tunde Bakare',
      paymentMethod: 'Bank Transfer'
    }
  ];

  app.syncStudentsFromExistingData();

  // Verify that Tunde Bakare, Blessing Okon, and Kelechi Nwosu were created
  const tunde = app.findStudentByEmail('tunde.bakare@example.com');
  const blessing = app.findStudentByEmail('blessing.okon@example.com');
  const kelechi = app.findStudentByEmail('kelechi.nwosu@example.com');

  assert(tunde !== null, 'Tunde Bakare synced into state.students');
  assert(tunde && tunde.studentNumber.startsWith('STU-'), `Tunde received official student number: ${tunde?.studentNumber}`);
  assert(app.state.enrolments[0].studentId === tunde?.id, 'Enrolment record linked to new studentId');

  assert(blessing !== null, 'Blessing Okon synced into state.students');
  assert(blessing?.status === 'COMPLETED', 'Blessing inherited COMPLETED status from completed enrolment');

  assert(kelechi !== null, 'Kelechi Nwosu synced from tuition invoice');

  // Deduplication check: Running sync again does NOT create duplicate students
  const countBefore = app.state.students.length;
  app.syncStudentsFromExistingData();
  const countAfter = app.state.students.length;
  assert(countBefore === countAfter, `Idempotent sync: Student count stayed at ${countBefore} without duplicates`);

  // ---------------------------------------------------------------------------
  // CATEGORY 9: UNIFIED STUDENT ACCOUNT SUMMARIES ENGINE
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 9: Unified Student Account Summaries Engine ---');

  const summaries = app.getStudentAccountSummaries();
  assert(Array.isArray(summaries) && summaries.length >= 4, `Summaries returned ${summaries.length} student records`);

  const tundeSummary = summaries.find(s => s.clientName === 'Tunde Bakare');
  assert(tundeSummary !== null, 'Tunde Bakare found in account summaries');
  assert(tundeSummary?.studentNumber === tunde?.studentNumber, 'Summary provides authoritative studentNumber');
  assert(tundeSummary?.totalInvoiced === 250000, 'Tunde totalInvoiced is 250,000');
  assert(tundeSummary?.totalPaid === 250000, 'Tunde totalPaid is 250,000');
  assert(tundeSummary?.balance === 0, 'Tunde balance is 0');
  assert(tundeSummary?.financialStatus === 'FULLY_PAID', 'Tunde financialStatus is FULLY_PAID');
  assert(tundeSummary?.trainingStatus === 'ACTIVE', 'Tunde trainingStatus is ACTIVE');

  const kelechiSummary = summaries.find(s => s.clientName === 'Kelechi Nwosu');
  assert(kelechiSummary !== null, 'Kelechi Nwosu found in account summaries');
  assert(kelechiSummary?.totalInvoiced === 180000, 'Kelechi totalInvoiced is 180,000');
  assert(kelechiSummary?.totalPaid === 0, 'Kelechi totalPaid is 0');
  assert(kelechiSummary?.balance === 180000, 'Kelechi balance is 180,000');
  assert(kelechiSummary?.financialStatus === 'UNPAID', 'Kelechi financialStatus is UNPAID');

  // ---------------------------------------------------------------------------
  // FINAL SCORECARD
  // ---------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(` PHASE 1 CERTIFICATION COMPLETE: ${passedTests} PASSED / ${failedTests} FAILED`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase1Suite().catch(err => {
  console.error('Fatal test suite exception:', err);
  process.exit(1);
});
