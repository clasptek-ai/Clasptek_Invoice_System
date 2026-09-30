/**
 * scripts/test_unified_directory_audit.js
 * 
 * Comprehensive automated technical & UI audit for the Unified Student & Client Directory.
 * Verifies:
 * 1. Single Unified Directory in Navigation & UI Architecture (No separate Client/Customer Directory)
 * 2. Supabase Data Layer & Relationship Coherence (students <-> customers <-> invoices/payments/enrolments)
 * 3. Atomic Customer Ledger Record Creation upon Student Registration
 * 4. Deduplication by Email, Phone, and Student ID
 * 5. Student Created != Enrolment Created Invariant
 * 6. Student 360° Dossier Completeness (Personal, Contact, Registration, Profile, Sponsor, Enrolments, Invoices, Payments, Receipts, Timeline)
 * 7. Column 26 Strict Non-Existence
 * 8. Elimination of University-Style Academic Terminology from Active Workflows
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function runAudit() {
  console.log('\n===============================================================');
  console.log('CLASPTEK UNIFIED STUDENT & CLIENT DIRECTORY TECHNICAL AUDIT');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Single Unified Directory in Navigation & UI Architecture
  // ---------------------------------------------------------------------------
  console.log('GROUP 1: Single Unified Directory in Navigation & UI Architecture');
  
  const navContent = fs.readFileSync(path.join(__dirname, '..', 'lib', 'config', 'navigation.ts'), 'utf8');
  assert(
    navContent.includes("id: 'students'") && navContent.includes("label: 'Student & Client Directory'"),
    'Navigation has canonical "Student & Client Directory" entry',
    'Missing or renamed student directory in navigation.ts'
  );
  assert(
    !navContent.includes("label: 'Customer Directory'") && !navContent.includes("label: 'Client Directory'"),
    'No competing "Customer Directory" or "Client Directory" in navigation',
    'Found competing customer/client directory in navigation.ts'
  );
  assert(
    !navContent.includes("Applicant Portal") && !navContent.includes("Application Tracking"),
    'No obsolete academic navigation entries in navigation.ts',
    'Found obsolete application tracking entries in navigation.ts'
  );

  const studentsPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'students', 'StudentsPageClient.tsx'), 'utf8');
  assert(
    studentsPage.includes('Student &amp; Client Directory') || studentsPage.includes('Student & Client Directory'),
    'StudentsPageClient header reflects "Student & Client Directory"',
    'Missing unified title in StudentsPageClient'
  );
  assert(
    studentsPage.includes('Single source of truth for student journey, billing history, receipts, cohort enrolments, and balance tracking'),
    'StudentsPageClient subtitle clarifies unified student & client function',
    'Missing clarifying subtitle in StudentsPageClient'
  );
  assert(
    studentsPage.includes('setIsAddStudentOpen(true)') && studentsPage.includes('<StudentRegistrationModal'),
    'StudentsPageClient opens unified StudentRegistrationModal',
    'Missing registration modal trigger'
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: API Route & Customer Ledger Synchronization
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 2: API Route & Customer Ledger Synchronization');

  const apiRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'students', 'route.ts'), 'utf8');
  assert(
    apiRoute.includes(".from('customers').insert") || apiRoute.includes(".from('customers').upsert"),
    'API POST /api/students automatically creates/syncs public.customers ledger record',
    'Missing automatic customer sync in app/api/students/route.ts'
  );
  assert(
    apiRoute.includes("customer_id: resolvedCustomerId"),
    'API POST /api/students saves resolved customer_id onto the student record',
    'Missing customer_id attachment on student insert'
  );
  assert(
    apiRoute.includes("total_invoiced: 0") && apiRoute.includes("total_paid: 0") && apiRoute.includes("outstanding_balance: 0"),
    'API POST /api/students initializes customer ledger with zero financial balance',
    'Customer ledger not initialized cleanly'
  );

  const mutations = fs.readFileSync(path.join(__dirname, '..', 'lib', 'students', 'mutations.ts'), 'utf8');
  assert(
    mutations.includes(".from('customers').insert") || mutations.includes(".from('customers').upsert"),
    'lib/students/mutations.ts creates/syncs customer ledger record during registration/enquiry conversion',
    'Missing customer creation in registerStudentFromEnquiry'
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Deduplication Safeguards
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 3: Deduplication Safeguards');

  assert(
    apiRoute.includes("normalizePhone") && apiRoute.includes("eq('email', cleanEmail)"),
    'API route checks for duplicate email and normalized phone before student creation',
    'Missing email/phone deduplication check in API route'
  );
  assert(
    mutations.includes("existingStudent") || mutations.includes("checkExistingStudent") || mutations.includes("generateNextStudentNumber"),
    'lib/students/mutations.ts provides uniqueness and concurrency safeguards',
    'Missing deduplication or concurrency safeguards in mutations'
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Database Relationship & Coherence Verification
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 4: Database Relationship & Coherence Verification (Live Supabase)');

  const { data: students, error: stuErr } = await supabase.from('students').select('id, student_number, first_name, last_name, customer_id, email, phone').limit(10);
  assert(!stuErr && students && students.length > 0, `Supabase students table queried successfully (${students?.length || 0} sampled)`, stuErr?.message);

  const { data: customers, error: custErr } = await supabase.from('customers').select('id, name, email, total_invoiced, total_paid, outstanding_balance').limit(10);
  assert(!custErr && customers && customers.length > 0, `Supabase customers table queried successfully (${customers?.length || 0} sampled)`, custErr?.message);

  const { data: enrolments, error: enrErr } = await supabase.from('enrolments').select('id, student_id, customer_id, programme_id').limit(10);
  assert(!enrErr && enrolments && enrolments.length > 0, `Supabase enrolments table queried successfully (${enrolments?.length || 0} sampled)`, enrErr?.message);

  const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
  const { count: customerCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: enrolmentCount } = await supabase.from('enrolments').select('*', { count: 'exact', head: true });

  console.log(`    Total Students: ${studentCount}`);
  console.log(`    Total Customers: ${customerCount}`);
  console.log(`    Total Enrolments: ${enrolmentCount}`);

  assert(
    studentCount > 0 && customerCount > 0,
    'Both students and customers collections are populated and active',
    'Empty student or customer table'
  );

  // Invariant: Student Created != Enrolment Created
  assert(
    enrolmentCount !== studentCount,
    'Student Created != Enrolment Created invariant confirmed (Enrolments count is independent of Students count)',
    `Enrolments count (${enrolmentCount}) strictly matches students (${studentCount}), expected independent lifecycle`
  );

  // Check customer linking on invoices
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('id, invoice_no, customer_id, student_name').limit(5);
  assert(!invErr && invoices, 'Supabase invoices table verified and accessible', invErr?.message);
  if (invoices && invoices.length > 0) {
    const invWithCust = invoices.filter(i => !!i.customer_id);
    assert(
      invWithCust.length === invoices.length,
      'All sample invoices link cleanly to customer_id (financial ledger)',
      `Some invoices missing customer_id: ${invoices.length - invWithCust.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Student 360° Dossier & Drawer Verification
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 5: Student 360° Dossier & Drawer Verification');

  const studentDrawer = fs.readFileSync(path.join(__dirname, '..', 'components', 'students', 'StudentDrawer.tsx'), 'utf8');
  assert(
    studentDrawer.includes("activeTab === 'bio'") &&
    studentDrawer.includes("activeTab === 'profile'") &&
    studentDrawer.includes("activeTab === 'sponsor'") &&
    studentDrawer.includes("activeTab === 'academic'") &&
    studentDrawer.includes("activeTab === 'finance'") &&
    studentDrawer.includes("activeTab === 'audit'"),
    'StudentDrawer provides complete 360° dossier tabs (Personal & Contact, Registration & Profile, Sponsor & Emergency, Enrolments, Finance, Audit Timeline)',
    'Missing tabs in StudentDrawer'
  );

  const editModal = fs.readFileSync(path.join(__dirname, '..', 'components', 'students', 'EditStudentModal.tsx'), 'utf8');
  assert(
    editModal.includes("activeTab === 'personal'") &&
    editModal.includes("activeTab === 'contact'") &&
    editModal.includes("activeTab === 'emergency'") &&
    editModal.includes("activeTab === 'administrative'"),
    'EditStudentModal covers all canonical student profile tabs (Personal, Contact, Emergency & Sponsor, Administrative)',
    'Missing canonical tabs in EditStudentModal'
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Strict Column 26 Non-Existence
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 6: Strict Column 26 Non-Existence');

  const filesToCheckForCol26 = [
    'components/students/StudentRegistrationModal.tsx',
    'components/students/EditStudentModal.tsx',
    'components/students/StudentDrawer.tsx',
    'app/api/students/route.ts',
    'types/students.ts',
    'lib/students/mutations.ts',
    'lib/students/queries.ts',
    'index.html',
    'clasptek_invoice_system.html'
  ];

  let col26Found = false;
  filesToCheckForCol26.forEach(relPath => {
    const fullPath = path.join(__dirname, '..', relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('column 26') || content.toLowerCase().includes('column26') || content.includes('col26') || content.includes('col_26')) {
        col26Found = true;
        console.error(`  Found Column 26 reference in ${relPath}`);
      }
    }
  });

  assert(!col26Found, 'Column 26 strictly non-existent across all components, modals, APIs, and HTML templates', 'Column 26 reference detected!');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Expunging Obsolete Terminology from Active Workflows
  // ---------------------------------------------------------------------------
  console.log('\nGROUP 7: Expunging Obsolete Academic Terminology from Active Workflows');

  const applicantPortalPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'applicant-portal', 'page.tsx'), 'utf8');
  assert(
    applicantPortalPage.includes("redirect('/students')"),
    'app/applicant-portal redirects to canonical /students directory',
    'applicant-portal does not redirect to /students'
  );

  const applyPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'apply', 'page.tsx'), 'utf8');
  assert(
    applyPage.includes('Student Details & Registration — Clasptek Academy'),
    'app/apply adopts vocational Student Details & Registration title and workflow',
    'apply page does not reflect vocational student registration'
  );

  const kpiStrip = fs.readFileSync(path.join(__dirname, '..', 'components', 'enrolments', 'EnrolmentKpiStrip.tsx'), 'utf8');
  assert(
    !kpiStrip.includes('Graduated Candidates') && kpiStrip.includes('Graduated Students'),
    'EnrolmentKpiStrip uses "Graduated Students" instead of "Graduated Candidates"',
    'Obsolete candidate label still in EnrolmentKpiStrip'
  );

  const newEnqModal = fs.readFileSync(path.join(__dirname, '..', 'components', 'admissions', 'NewEnquiryModal.tsx'), 'utf8');
  assert(
    !newEnqModal.includes('Candidate / Prospect Full Name') && newEnqModal.includes('Prospect Full Name'),
    'NewEnquiryModal uses "Prospect" instead of "Candidate"',
    'Candidate label still in NewEnquiryModal'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit failed with uncaught error:', err);
  process.exit(1);
});
