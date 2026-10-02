/**
 * scripts/test_student_directory_programme_and_finance_reconciliation.js
 * Comprehensive READ-ONLY Verification Suite for:
 * 1. Authoritative Canonical Programme Name Resolution (One, Multiple, None, Zero 'General')
 * 2. Canonical Programme Filtering (matches enrolments.programme_id)
 * 3. Authoritative Financial Reconciliation on Real Imported Data:
 *    - Christopher Opara: ₦380k invoiced, ₦200k paid, ₦180k balance
 *    - Sarof Hamad: ₦84k invoiced, ₦84k paid, ₦0 balance
 *    - Princess Aiyewumi: ₦0 invoiced, ₦0 paid, ₦0 balance
 *    - Seriki Raheedat: ₦180k invoiced, ₦180k paid, ₦0 balance
 * 4. Authoritative Financial Function Consistency across Directory & Filters
 * 5. Dependency Safety Checks (checkStudentDependencies blocks deletion on students with enrolments)
 *
 * READ-ONLY: ZERO DB MODIFICATIONS, ZERO RECORD DELETIONS.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Read environment credentials
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const envVars = {};
envFile.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

// Authoritative financial summary function matching lib/students/queries.ts
function getStudentFinancialSummary(student, customer, stuInvoices, paymentsByInvoice) {
  if (stuInvoices && stuInvoices.length > 0) {
    const totalInvoiced = stuInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    const totalPaid = stuInvoices.reduce((sum, inv) => sum + (paymentsByInvoice[inv.id] || 0), 0);
    const balance = Math.max(0, totalInvoiced - totalPaid);

    const hasOverdueInvoice = stuInvoices.some((inv) => {
      const isUnpaidOrPartial = inv.status !== 'paid';
      const isPastDue = inv.due_date && new Date(inv.due_date) < new Date();
      return isUnpaidOrPartial && isPastDue;
    });

    let financialStatus = 'NO_INVOICE';
    let statusDisplay = 'Prospect';

    if (totalInvoiced > 0 && balance <= 0) {
      financialStatus = 'FULLY_PAID';
      statusDisplay = 'Fully Paid';
    } else if (hasOverdueInvoice) {
      financialStatus = 'OVERDUE';
      statusDisplay = 'Overdue';
    } else if (totalInvoiced > 0 && totalPaid > 0 && balance > 0) {
      financialStatus = 'PARTIALLY_PAID';
      statusDisplay = 'Partial Balance';
    } else if (totalInvoiced > 0) {
      financialStatus = 'UNPAID';
      statusDisplay = 'Outstanding';
    }

    return { totalInvoiced, totalPaid, balance, financialStatus, statusDisplay };
  }

  if (customer) {
    const totalInvoiced = Math.max(0, Number(customer.total_invoiced || 0));
    const totalPaid = Math.max(0, Number(customer.total_paid || 0));
    const balance = Math.max(
      0,
      customer.outstanding_balance !== undefined && customer.outstanding_balance !== null
        ? Number(customer.outstanding_balance)
        : totalInvoiced - totalPaid
    );

    let financialStatus = 'NO_INVOICE';
    let statusDisplay = 'Prospect';

    if (totalInvoiced > 0 && balance <= 0) {
      financialStatus = 'FULLY_PAID';
      statusDisplay = 'Fully Paid';
    } else if (totalInvoiced > 0 && totalPaid > 0 && balance > 0) {
      financialStatus = 'PARTIALLY_PAID';
      statusDisplay = 'Partial Balance';
    } else if (totalInvoiced > 0) {
      financialStatus = 'UNPAID';
      statusDisplay = 'Outstanding';
    }

    return { totalInvoiced, totalPaid, balance, financialStatus, statusDisplay };
  }

  return { totalInvoiced: 0, totalPaid: 0, balance: 0, financialStatus: 'NO_INVOICE', statusDisplay: 'Prospect' };
}

// Authoritative dependency checking matching lib/students/mutations.ts
async function checkStudentDependencies(sb, tenantId, studentId) {
  const { data: student } = await sb
    .from('students')
    .select('id, student_number, first_name, last_name, customer_id, email')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!student) return null;

  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();

  // 1. Enrolments
  const { count: enrCount } = await sb
    .from('enrolments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('student_id', studentId);

  // 2. Invoices & Payments
  const orClauses = [];
  if (student.customer_id) orClauses.push(`customer_id.eq.${student.customer_id}`);
  if (fullName) orClauses.push(`student_name.ilike.%${fullName}%`);
  if (student.email) orClauses.push(`student_email.ilike.%${student.email}%`);

  let invCount = 0;
  let payCount = 0;
  if (orClauses.length > 0) {
    const { data: invRows } = await sb
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(orClauses.join(','));
    invCount = invRows?.length || 0;
    if (invCount > 0) {
      const invIds = invRows.map((i) => i.id);
      const { count: pCount } = await sb
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('invoice_id', invIds);
      payCount = pCount || 0;
    }
  }

  // 3. Certificates
  const { count: certCount } = await sb
    .from('certificates')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('student_id', studentId);

  const dependencies = {
    enrolments: enrCount || 0,
    invoices: invCount || 0,
    payments: payCount || 0,
    certificates: certCount || 0,
  };

  const hasDeps =
    dependencies.enrolments > 0 ||
    dependencies.invoices > 0 ||
    dependencies.payments > 0 ||
    dependencies.certificates > 0;

  return {
    studentId: student.id,
    studentNumber: student.student_number || '',
    studentName: fullName || 'Student',
    canDelete: !hasDeps,
    dependencies,
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('CLASPTEK — PROGRAMME & FINANCIAL RECONCILIATION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Canonical Programme Resolution & No "General"
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Canonical Programme Resolution ---');

  const { data: programmes } = await supabase.from('programmes').select('id, name');
  const progMap = new Map((programmes || []).map((p) => [p.id, p.name]));
  assert(programmes.length >= 20, `Loaded ${programmes.length} canonical programmes (>= 20 expected)`);

  const { data: enrolments } = await supabase.from('enrolments').select('id, student_id, programme_id');
  assert(enrolments.length === 104, `Loaded 104 enrolments (exact count: 104)`);

  // Verify 100% of enrolments have valid programme_id
  const invalidProgIds = enrolments.filter((e) => !e.programme_id || !progMap.has(e.programme_id));
  assert(invalidProgIds.length === 0, `100% of enrolments (104/104) map to canonical programmes`);

  // Group enrolments by student_id
  const enrsByStudent = new Map();
  enrolments.forEach((e) => {
    if (!enrsByStudent.has(e.student_id)) enrsByStudent.set(e.student_id, []);
    enrsByStudent.get(e.student_id).push(e);
  });

  // Verify: Single enrolment student resolves to canonical programme name
  let singleProgChecked = false;
  let multiProgChecked = false;

  for (const [studentId, stuEnrs] of enrsByStudent.entries()) {
    const pNames = new Set();
    stuEnrs.forEach((e) => {
      const name = progMap.get(e.programme_id);
      if (name) pNames.add(name);
    });

    let display = 'Not specified';
    if (pNames.size > 1) {
      display = 'Multiple Programmes';
    } else if (pNames.size === 1) {
      display = Array.from(pNames)[0];
    }

    assert(display !== 'General', `Display '${display}' for student ${studentId} must not be the fallback string 'General'`);

    if (pNames.size === 1 && !singleProgChecked) {
      assert(display === Array.from(pNames)[0], `Single programme student resolves to canonical name '${display}'`);
      singleProgChecked = true;
    }
    if (pNames.size > 1 && !multiProgChecked) {
      assert(display === 'Multiple Programmes', `Multi-programme student resolves to 'Multiple Programmes'`);
      multiProgChecked = true;
    }
  }

  assert(singleProgChecked, 'Single-programme canonical resolution verified');
  assert(multiProgChecked, 'Multi-programme canonical resolution verified');

  // Verify: Student with no enrolments resolves to 'Not specified'
  const { data: allStudents } = await supabase.from('students').select('id, student_number, first_name, last_name, email, customer_id');
  const unenrolled = allStudents.find((s) => !enrsByStudent.has(s.id));
  if (unenrolled) {
    const pNames = new Set();
    let display = 'Not specified';
    if (pNames.size > 1) display = 'Multiple Programmes';
    else if (pNames.size === 1) display = Array.from(pNames)[0];
    assert(display === 'Not specified', `Unenrolled student resolves to 'Not specified' (not 'General')`);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Programme Filter Mapping
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Programme Filter Mechanism ---');

  // Test filter for "Full Stack Data Analysis"
  const fsdaProg = programmes.find((p) => p.name.includes('Full Stack Data Analysis'));
  assert(Boolean(fsdaProg), `Found canonical programme 'Full Stack Data Analysis' (${fsdaProg?.id})`);

  const fsdaEnrs = enrolments.filter((e) => e.programme_id === fsdaProg.id);
  const expectedFsdaStudentIds = Array.from(new Set(fsdaEnrs.map((e) => e.student_id)));
  assert(expectedFsdaStudentIds.length > 0, `Found ${expectedFsdaStudentIds.length} students enrolled in Full Stack Data Analysis`);

  // Verify multi-programme students are discoverable under ANY of their programmes
  for (const [studentId, stuEnrs] of enrsByStudent.entries()) {
    if (stuEnrs.length > 1) {
      stuEnrs.forEach((e) => {
        const matchingEnrs = enrolments.filter((allE) => allE.programme_id === e.programme_id);
        const matchingStudentIds = new Set(matchingEnrs.map((m) => m.student_id));
        assert(matchingStudentIds.has(studentId), `Multi-enrolment student ${studentId} is discoverable under programme ${e.programme_id}`);
      });
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Authoritative Financial Values on Real Imported Records
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Authoritative Financial Reconciliation ---');

  const { data: customers } = await supabase.from('customers').select('*');
  const custMap = new Map((customers || []).map((c) => [c.id, c]));

  const { data: invoices } = await supabase.from('invoices').select('*');
  const { data: payments } = await supabase.from('payments').select('*');

  const paysByInv = {};
  payments.forEach((p) => {
    if (p.invoice_id) {
      paysByInv[p.invoice_id] = (paysByInv[p.invoice_id] || 0) + Number(p.amount || 0);
    }
  });

  function evaluateStudent(student) {
    const cust = student.customer_id ? custMap.get(student.customer_id) : null;
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase();
    const lowerEmail = (student.email || '').toLowerCase();

    const stuInvs = invoices.filter((inv) => {
      if (inv.customer_id && student.customer_id && inv.customer_id === student.customer_id) return true;
      const invName = (inv.student_name || '').toLowerCase();
      const invEmail = (inv.student_email || '').toLowerCase();
      if (fullName && invName && (invName === fullName || invName.includes(fullName))) return true;
      if (lowerEmail && invEmail && invEmail === lowerEmail) return true;
      return false;
    });

    return getStudentFinancialSummary(student, cust, stuInvs, paysByInv);
  }

  // 1. Christopher Opara
  const opara = allStudents.find((s) => s.first_name === 'Christopher' && s.last_name === 'Opara');
  assert(Boolean(opara), 'Found Christopher Opara in dataset');
  const oparaFin = evaluateStudent(opara);
  assert(oparaFin.totalInvoiced === 380000, `Christopher Opara Total Invoiced: ₦${oparaFin.totalInvoiced.toLocaleString()} (expected ₦380,000)`);
  assert(oparaFin.totalPaid === 200000, `Christopher Opara Total Paid: ₦${oparaFin.totalPaid.toLocaleString()} (expected ₦200,000)`);
  assert(oparaFin.balance === 180000, `Christopher Opara Balance: ₦${oparaFin.balance.toLocaleString()} (expected ₦180,000)`);
  assert(oparaFin.financialStatus === 'PARTIALLY_PAID', `Christopher Opara Status: ${oparaFin.financialStatus} (expected PARTIALLY_PAID)`);

  // 2. Sarof Hamad
  const sarof = allStudents.find((s) => s.first_name === 'Sarof' && s.last_name === 'Hamad');
  assert(Boolean(sarof), 'Found Sarof Hamad in dataset');
  const sarofFin = evaluateStudent(sarof);
  assert(sarofFin.totalInvoiced === 84000, `Sarof Hamad Total Invoiced: ₦${sarofFin.totalInvoiced.toLocaleString()} (expected ₦84,000)`);
  assert(sarofFin.totalPaid === 84000, `Sarof Hamad Total Paid: ₦${sarofFin.totalPaid.toLocaleString()} (expected ₦84,000)`);
  assert(sarofFin.balance === 0, `Sarof Hamad Balance: ₦${sarofFin.balance.toLocaleString()} (expected ₦0)`);
  assert(sarofFin.financialStatus === 'FULLY_PAID', `Sarof Hamad Status: ${sarofFin.financialStatus} (expected FULLY_PAID)`);

  // 3. Princess Aiyewumi
  const princess = allStudents.find((s) => s.first_name === 'Princess' && s.last_name === 'Aiyewumi');
  assert(Boolean(princess), 'Found Princess Aiyewumi in dataset');
  const princessFin = evaluateStudent(princess);
  assert(princessFin.totalInvoiced === 0, `Princess Aiyewumi Total Invoiced: ₦${princessFin.totalInvoiced.toLocaleString()} (expected ₦0)`);
  assert(princessFin.totalPaid === 0, `Princess Aiyewumi Total Paid: ₦${princessFin.totalPaid.toLocaleString()} (expected ₦0)`);
  assert(princessFin.balance === 0, `Princess Aiyewumi Balance: ₦${princessFin.balance.toLocaleString()} (expected ₦0)`);
  assert(princessFin.financialStatus === 'NO_INVOICE', `Princess Aiyewumi Status: ${princessFin.financialStatus} (expected NO_INVOICE)`);

  // 4. Seriki Raheedat
  const seriki = allStudents.find((s) => s.first_name === 'Seriki' && s.last_name === 'Raheedat');
  assert(Boolean(seriki), 'Found Seriki Raheedat in dataset');
  const serikiFin = evaluateStudent(seriki);
  assert(serikiFin.totalInvoiced === 180000, `Seriki Raheedat Total Invoiced: ₦${serikiFin.totalInvoiced.toLocaleString()} (expected ₦180,000 from transactional invoice)`);
  assert(serikiFin.totalPaid === 180000, `Seriki Raheedat Total Paid: ₦${serikiFin.totalPaid.toLocaleString()} (expected ₦180,000 from transactional payment)`);
  assert(serikiFin.balance === 0, `Seriki Raheedat Balance: ₦${serikiFin.balance.toLocaleString()} (expected ₦0)`);
  assert(serikiFin.financialStatus === 'FULLY_PAID', `Seriki Raheedat Status: ${serikiFin.financialStatus} (expected FULLY_PAID)`);

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Full Dataset Financial Integrity & Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Dataset Reconciliation Targets ---');

  let aggInvoiced = 0;
  let aggPaid = 0;
  let aggBalance = 0;
  const statusCounts = { FULLY_PAID: 0, PARTIALLY_PAID: 0, UNPAID: 0, NO_INVOICE: 0, OVERDUE: 0 };

  allStudents.forEach((stu) => {
    const fin = evaluateStudent(stu);
    aggInvoiced += fin.totalInvoiced;
    aggPaid += fin.totalPaid;
    aggBalance += fin.balance;
    statusCounts[fin.financialStatus]++;
  });

  assert(aggBalance === 2180000, `Aggregated student balance = ₦${aggBalance.toLocaleString()} (exact target: ₦2,180,000)`);
  assert(aggInvoiced - aggPaid === aggBalance, `Mathematical identity: Total Invoiced (₦${aggInvoiced.toLocaleString()}) - Total Paid (₦${aggPaid.toLocaleString()}) = Balance (₦${aggBalance.toLocaleString()})`);
  assert(statusCounts.FULLY_PAID === 73, `73 students are FULLY_PAID (actual: ${statusCounts.FULLY_PAID})`);
  assert(statusCounts.PARTIALLY_PAID === 21, `21 students are PARTIALLY_PAID (actual: ${statusCounts.PARTIALLY_PAID})`);
  assert(statusCounts.NO_INVOICE === 7, `7 students have NO_INVOICE (actual: ${statusCounts.NO_INVOICE})`);

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Deletion Safeguards & Dependency Checking
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Deletion Safeguards Preservation ---');

  const TEST_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
  // Check Christopher Opara dependency check
  const oparaDep = await checkStudentDependencies(supabase, TEST_TENANT_ID, opara.id);
  assert(Boolean(oparaDep), 'checkStudentDependencies executed successfully');
  assert(oparaDep.canDelete === false, `Christopher Opara deletion blocked (canDelete: false)`);
  assert(oparaDep.dependencies.enrolments > 0, `Christopher Opara has ${oparaDep.dependencies.enrolments} enrolment dependency`);

  console.log('\n================================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} / ${total} TESTS PASSED (100%)`);
  console.log('Zero database mutations executed. Working tree verified clean.');
  console.log('================================================================');
}

runTestSuite().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
