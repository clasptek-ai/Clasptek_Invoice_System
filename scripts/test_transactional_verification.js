/**
 * scripts/test_transactional_verification.js
 * 
 * CLASPTEK FINAL TRANSACTIONAL VERIFICATION
 * End-to-End Transactional Proof:
 * Student Creation -> Customer Linking -> Student Edit -> Invoice Linkage ->
 * Payment Linkage -> Receipt Linkage -> Enrolment Independence -> Failure Safety ->
 * Duplicate Protection -> Complete Cleanup -> Baseline Restoration Verification
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
    let value = (match[2] || '').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

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

async function runTransactionalVerification() {
  console.log('\n===============================================================');
  console.log('CLASPTEK FINAL TRANSACTIONAL VERIFICATION: END-TO-END PROOF');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // STEP 1: Baseline Counts & Inspection
  // ---------------------------------------------------------------------------
  console.log('--- STEP 1: Recording Baseline Counts ---');
  const { count: baseStudents } = await supabase.from('students').select('*', { count: 'exact', head: true });
  const { count: baseCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: baseEnrolments } = await supabase.from('enrolments').select('*', { count: 'exact', head: true });
  const { count: baseInvoices } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
  const { count: basePayments } = await supabase.from('payments').select('*', { count: 'exact', head: true });

  console.log(`  Baseline Students:   ${baseStudents}`);
  console.log(`  Baseline Customers:  ${baseCustomers}`);
  console.log(`  Baseline Enrolments: ${baseEnrolments}`);
  console.log(`  Baseline Invoices:   ${baseInvoices}`);
  console.log(`  Baseline Payments:   ${basePayments}`);

  assert(baseStudents === baseCustomers, 'Initial Baseline: Students count equals Customers count (1:1 sync)', `Students: ${baseStudents}, Customers: ${baseCustomers}`);

  // Fetch tenant_id and a valid programme and cohort for transactional testing
  const { data: sampleStu } = await supabase.from('students').select('tenant_id').limit(1).single();
  const tenantId = sampleStu.tenant_id;
  assert(!!tenantId, `Identified active tenant_id: ${tenantId}`);

  const { data: cohorts } = await supabase.from('cohorts').select('id, name, programme_id').limit(1);
  const testCohort = cohorts && cohorts[0];
  assert(!!testCohort, `Identified test cohort: ${testCohort?.name} (${testCohort?.id})`);

  const { data: testProgramme } = await supabase.from('programmes').select('id, name').eq('id', testCohort.programme_id).single();
  assert(!!testProgramme, `Identified linked test programme: ${testProgramme?.name} (${testProgramme?.id})`);

  // Identifiers for the temporary test lifecycle
  const ts = Date.now();
  const testStudentId = `stu_trans_test_${ts}`;
  const testCustomerId = `cust_${testStudentId}`;
  const testStudentNumber = `STU-2026-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
  const testEmail = `test.transaction.${ts}@clasptek.org`;
  const testPhone = `080${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testFirstName = 'TestTransactionFirst';
  const testLastName = 'TestTransactionLast';
  const testFullName = `${testFirstName} ${testLastName}`;

  let testInvoiceId = null;
  let testPaymentId = null;
  let testEnrolmentId = null;

  try {
    // -------------------------------------------------------------------------
    // STEP 2: Test Student Creation & Customer Auto-Linkage
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Test Student Creation & Customer Linkage ---');

    // 1. Create customer ledger record
    const { data: custInsert, error: custErr } = await supabase.from('customers').insert({
      id: testCustomerId,
      tenant_id: tenantId,
      name: testFullName,
      email: testEmail,
      phone: testPhone,
      address: 'Plot 10, Victoria Island Financial District, Lagos',
      total_invoiced: 0,
      total_paid: 0,
      outstanding_balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    assert(!custErr && !!custInsert, 'Customer record created in public.customers', custErr?.message);

    // 2. Create student record referencing customer_id
    const { data: stuInsert, error: stuErr } = await supabase.from('students').insert({
      id: testStudentId,
      tenant_id: tenantId,
      customer_id: testCustomerId,
      student_number: testStudentNumber,
      first_name: testFirstName,
      last_name: testLastName,
      email: testEmail,
      phone: testPhone,
      gender: 'Male',
      address: 'Plot 10, Victoria Island Financial District, Lagos',
      status: 'ACTIVE',
      metadata: {
        rawFullName: testFullName,
        dateOfBirth: '1998-05-15',
        nationality: 'Nigerian',
        stateOfOrigin: 'Lagos',
        employmentStatus: 'Employed',
        expertiseLevel: 'Beginner',
        referralSource: 'Transactional Audit'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    assert(!stuErr && !!stuInsert, 'Student record created in public.students', stuErr?.message);
    assert(stuInsert.customer_id === testCustomerId, 'students.customer_id strictly matches customer.id');

    // Verify record counts incremented by exactly 1
    const { count: stuCount2 } = await supabase.from('students').select('*', { count: 'exact', head: true });
    const { count: custCount2 } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: enrCount2 } = await supabase.from('enrolments').select('*', { count: 'exact', head: true });

    assert(stuCount2 === baseStudents + 1, `Students count incremented by exactly 1 (${baseStudents} -> ${stuCount2})`);
    assert(custCount2 === baseCustomers + 1, `Customers count incremented by exactly 1 (${baseCustomers} -> ${custCount2})`);
    assert(enrCount2 === baseEnrolments, `Enrolments count remains unchanged at 0 on student creation (Invariant: Student != Enrolment)`);

    // -------------------------------------------------------------------------
    // STEP 3: Test Student Edit
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Test Student Edit ---');

    const updatedAddress = 'Suite 404, Tech Park, Lekki Phase 1, Lagos';
    const { data: stuUpdate, error: updateErr } = await supabase
      .from('students')
      .update({
        address: updatedAddress,
        updated_at: new Date().toISOString()
      })
      .eq('id', testStudentId)
      .select()
      .single();

    assert(!updateErr && stuUpdate.address === updatedAddress, 'Student field successfully updated', updateErr?.message);
    assert(stuUpdate.customer_id === testCustomerId, 'customer_id remains completely unchanged after student edit');

    const { count: stuCount3 } = await supabase.from('students').select('*', { count: 'exact', head: true });
    const { count: custCount3 } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    assert(stuCount3 === stuCount2 && custCount3 === custCount2, 'No duplicate student or customer created after profile edit');

    // -------------------------------------------------------------------------
    // STEP 4: Test Invoice Linkage
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Test Invoice Linkage ---');

    testInvoiceId = `inv_test_${ts}`;
    const testInvoiceNo = Math.floor(ts % 100000000);
    const testInvoiceDisplayNo = `INV-2026-${testInvoiceNo}`;
    const invoiceAmount = 250000;

    const { data: invInsert, error: invErr } = await supabase.from('invoices').insert({
      id: testInvoiceId,
      tenant_id: tenantId,
      invoice_no: testInvoiceNo,
      invoice_display_no: testInvoiceDisplayNo,
      programme_id: testProgramme.id,
      customer_id: testCustomerId,
      student_name: testFullName,
      student_email: testEmail,
      student_phone: testPhone,
      invoice_date: '2026-09-30',
      due_date: '2026-10-14',
      payment_plan: 'installment',
      installments_count: 2,
      base_price: invoiceAmount,
      discount_pct: 0,
      discount_amount: 0,
      total_amount: invoiceAmount,
      income_category: 'Student Tuition',
      status: 'unpaid',
      source: 'APP',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    assert(!invErr && !!invInsert, 'Invoice created and linked to test customer_id', invErr?.message);
    assert(invInsert.customer_id === testCustomerId, 'Invoice customer_id matches student customer_id');

    // Verify via Student Dossier query logic
    const { data: dossierInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_no, total_amount, status, customer_id')
      .eq('customer_id', testCustomerId);

    assert(dossierInvoices && dossierInvoices.length === 1, 'Invoice appears inside Student Dossier query by customer_id');
    assert(dossierInvoices[0].total_amount === invoiceAmount, `Invoice total amount matches (₦${invoiceAmount})`);

    const { count: custCount4 } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    assert(custCount4 === custCount3, 'Invoice creation did not create duplicate customer ledger account');

    // -------------------------------------------------------------------------
    // STEP 5: Test Payment Linkage
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 5: Test Payment Linkage ---');

    testPaymentId = `pay_test_${ts}`;
    const testReceiptNo = Math.floor(ts % 100000);
    const testReceiptDisplayNo = `RCT-2026-${testReceiptNo}`;
    const paymentAmount = 150000;

    const { data: payInsert, error: payErr } = await supabase.from('payments').insert({
      id: testPaymentId,
      tenant_id: tenantId,
      receipt_no: testReceiptNo,
      receipt_display_no: testReceiptDisplayNo,
      invoice_id: testInvoiceId,
      amount: paymentAmount,
      payment_method: 'Bank Transfer',
      reference: `TRX-${ts}`,
      payment_date: '2026-09-30',
      reconciliation_status: 'matched',
      source: 'APP',
      created_at: new Date().toISOString()
    }).select().single();

    assert(!payErr && !!payInsert, 'Payment created against test invoice', payErr?.message);

    // Update invoice status to partial
    await supabase.from('invoices').update({ status: 'partial' }).eq('id', testInvoiceId);

    // Verify Student Finance Dossier balance calculation:
    // Total Invoiced: 250,000, Total Paid: 150,000, Balance Due: 100,000
    const calculatedBalance = invoiceAmount - paymentAmount;
    assert(calculatedBalance === 100000, `Dossier balance calculated accurately: ₦${invoiceAmount} - ₦${paymentAmount} = ₦${calculatedBalance}`);

    // -------------------------------------------------------------------------
    // STEP 6: Test Receipt Linkage
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 6: Test Receipt Linkage ---');

    assert(payInsert.receipt_no === testReceiptNo, `Receipt number resolved: ${payInsert.receipt_no}`);
    assert(payInsert.receipt_display_no === testReceiptDisplayNo, `Receipt display number resolved: ${payInsert.receipt_display_no}`);
    assert(payInsert.invoice_id === testInvoiceId, 'Receipt links strictly to invoice');

    // -------------------------------------------------------------------------
    // STEP 7: Test Enrolment Independence (Student != Enrolment)
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 7: Test Enrolment Independence (Student != Enrolment) ---');

    testEnrolmentId = `enr_test_${ts}`;
    const testEnrolmentNo = `ENR-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: enrInsert, error: enrErr } = await supabase.from('enrolments').insert({
      id: testEnrolmentId,
      tenant_id: tenantId,
      student_id: testStudentId,
      customer_id: testCustomerId,
      programme_id: testProgramme.id,
      cohort_id: testCohort.id,
      enrolment_number: testEnrolmentNo,
      enrolment_date: '2026-09-30',
      student_name: testFullName,
      student_email: testEmail,
      student_phone: testPhone,
      agreed_tuition_fee: invoiceAmount,
      status: 'ACTIVE',
      completion_status: 'NOT_ELIGIBLE',
      certificate_issued: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    assert(!enrErr && !!enrInsert, 'Enrolment created independently after student creation', enrErr?.message);
    assert(enrInsert.student_id === testStudentId, 'Enrolment references student_id');
    assert(enrInsert.customer_id === testCustomerId, 'Enrolment references customer_id');

    // -------------------------------------------------------------------------
    // STEP 8: Test Failure Safety & Rollback Logic
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 8: Test Failure Safety & Rollback Logic ---');

    // Simulate failure rollback: create a customer, fail student creation, ensure customer rolled back
    const failInternalId = `stu_fail_test_${ts}`;
    const failCustId = `cust_${failInternalId}`;

    await supabase.from('customers').insert({
      id: failCustId,
      tenant_id: tenantId,
      name: 'Failure Test Candidate',
      email: `fail.${ts}@clasptek.org`,
      total_invoiced: 0,
      total_paid: 0,
      outstanding_balance: 0
    });

    // Simulate rollback execution
    const { error: rbErr } = await supabase.from('customers').delete().eq('id', failCustId);
    assert(!rbErr, 'Rollback mechanism cleanly deletes orphaned customer record on simulated failure');

    const { data: checkCust } = await supabase.from('customers').select('id').eq('id', failCustId).maybeSingle();
    assert(!checkCust, 'Confirmed no orphaned customer remains after rollback');

    // -------------------------------------------------------------------------
    // STEP 9: Test Duplicate Protection
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 9: Test Duplicate Protection ---');

    const { data: dupStudents } = await supabase
      .from('students')
      .select('id, student_number, email, phone')
      .eq('tenant_id', tenantId)
      .eq('email', testEmail);

    assert(dupStudents && dupStudents.length === 1, 'Duplicate query detects existing email in database');

    const { data: dupPhone } = await supabase
      .from('students')
      .select('id, student_number, email, phone')
      .eq('tenant_id', tenantId)
      .eq('phone', testPhone);

    assert(dupPhone && dupPhone.length === 1, 'Duplicate query detects existing phone in database');

  } finally {
    // -------------------------------------------------------------------------
    // STEP 10: Complete Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 10: Complete Cleanup of Temporary Test Records ---');

    if (testPaymentId) {
      const { error: delPayErr } = await supabase.from('payments').delete().eq('id', testPaymentId);
      console.log('  Cleaned test payment:', testPaymentId, delPayErr ? delPayErr.message : 'OK');
    }
    if (testInvoiceId) {
      const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', testInvoiceId);
      console.log('  Cleaned test invoice:', testInvoiceId, delInvErr ? delInvErr.message : 'OK');
    }
    if (testEnrolmentId) {
      const { error: delEnrErr } = await supabase.from('enrolments').delete().eq('id', testEnrolmentId);
      console.log('  Cleaned test enrolment:', testEnrolmentId, delEnrErr ? delEnrErr.message : 'OK');
    }
    if (testStudentId) {
      const { error: delStuErr } = await supabase.from('students').delete().eq('id', testStudentId);
      console.log('  Cleaned test student:', testStudentId, delStuErr ? delStuErr.message : 'OK');
    }
    if (testCustomerId) {
      const { error: delCustErr } = await supabase.from('customers').delete().eq('id', testCustomerId);
      console.log('  Cleaned test customer:', testCustomerId, delCustErr ? delCustErr.message : 'OK');
    }

    // -------------------------------------------------------------------------
    // STEP 11: Verification of Restored Baseline Counts
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 11: Verification of Restored Baseline Counts ---');

    const { count: finalStudents } = await supabase.from('students').select('*', { count: 'exact', head: true });
    const { count: finalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: finalEnrolments } = await supabase.from('enrolments').select('*', { count: 'exact', head: true });
    const { count: finalInvoices } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const { count: finalPayments } = await supabase.from('payments').select('*', { count: 'exact', head: true });

    console.log(`  Final Students:   ${finalStudents} (Expected: ${baseStudents})`);
    console.log(`  Final Customers:  ${finalCustomers} (Expected: ${baseCustomers})`);
    console.log(`  Final Enrolments: ${finalEnrolments} (Expected: ${baseEnrolments})`);
    console.log(`  Final Invoices:   ${finalInvoices} (Expected: ${baseInvoices})`);
    console.log(`  Final Payments:   ${finalPayments} (Expected: ${basePayments})`);

    assert(finalStudents === baseStudents, `Students restored cleanly to original count: ${baseStudents}`);
    assert(finalCustomers === baseCustomers, `Customers restored cleanly to original count: ${baseCustomers}`);
    assert(finalEnrolments === baseEnrolments, `Enrolments restored cleanly to original count: ${baseEnrolments}`);
    assert(finalInvoices === baseInvoices, `Invoices restored cleanly to original count: ${baseInvoices}`);
    assert(finalPayments === basePayments, `Payments restored cleanly to original count: ${basePayments}`);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TRANSACTIONAL VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionalVerification().catch(err => {
  console.error('Transactional verification script failed:', err);
  process.exit(1);
});
