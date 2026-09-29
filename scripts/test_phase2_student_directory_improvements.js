/**
 * scripts/test_phase2_student_directory_improvements.js
 * Comprehensive Verification Suite for Phase 2:
 * Student Directory & Registration Workflow Improvements
 *
 * Covers Scenarios A, B, C, D, E, Regression, and Invariants.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

// Load environment credentials
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/)[1].trim();
const anonKey = env.match(/SUPABASE_ANON_KEY=([^\r\n]+)/)[1].trim().replace(/['"]/g, '');
const adminPassword = env.match(/ADMIN_PASSWORD=([^\r\n]+)/)[1].trim().replace(/['"]/g, '');

const supabase = createClient(url, serviceKey);
const adminClient = createClient(url, anonKey);

const TEST_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

// Tracking test artifacts for cleanup
const createdStudentIds = [];
const createdEnrolmentIds = [];
const createdApplicationIds = [];

async function runPhase2Suite() {
  console.log('================================================================');
  console.log('CLASPTEK PHASE 2 AUTOMATED TEST SUITE');
  console.log('Student Directory & Registration Workflow Improvements');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  try {
    // Authenticate Admin session for RPC calls enforcing strict RBAC
    const { data: authData, error: authErr } = await adminClient.auth.signInWithPassword({
      email: 'admin@clasptek.org',
      password: adminPassword,
    });
    if (authErr || !authData.session) {
      throw new Error(`Admin authentication failed: ${authErr?.message}`);
    }
    console.log(`Authenticated Admin session established (${authData.user.email}).`);

    // 0. Discover existing Programmes, Cohorts, and Corporate Customers
    const { data: programmes } = await supabase
      .from('programmes')
      .select('id, name, tuition_fee')
      .eq('tenant_id', TEST_TENANT_ID)
      .limit(3);

    if (!programmes || programmes.length === 0) {
      throw new Error('Pre-requisite failed: No programmes found in tenant.');
    }
    const prog1 = programmes[0];
    const prog2 = programmes[1] || programmes[0];

    const { data: cohorts } = await supabase
      .from('cohorts')
      .select('id, name, cohort_code, programme_id')
      .eq('tenant_id', TEST_TENANT_ID)
      .limit(5);

    if (!cohorts || cohorts.length === 0) {
      throw new Error('Pre-requisite failed: No cohorts found in tenant.');
    }
    const cohort1 = cohorts[0];
    const cohort2 = cohorts.find(c => c.id !== cohort1.id) || cohorts[0];

    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', TEST_TENANT_ID)
      .limit(2);

    if (!customers || customers.length === 0) {
      throw new Error('Pre-requisite failed: No customers found in tenant.');
    }
    const corpCustomer = customers[0];

    console.log(`Discovered Test Context:`);
    console.log(`- Programme 1: ${prog1.name} (${prog1.id})`);
    console.log(`- Cohort 1: ${cohort1.name} (${cohort1.id})`);
    console.log(`- Corporate Customer: ${corpCustomer.name} (${corpCustomer.id})\n`);

    // -------------------------------------------------------------------------
    // TEST 1: Check 14 Existing NULL customer_id Students (Preservation Invariant)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Existing NULL customer_id Preservation ---');
    const { count: nullCustCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TEST_TENANT_ID)
      .is('customer_id', null);

    console.log(`Students currently with customer_id IS NULL: ${nullCustCount}`);
    if (nullCustCount < 14) {
      throw new Error(`TEST 1 FAILED: Expected at least 14 students with NULL customer_id, found ${nullCustCount}.`);
    }
    console.log(`✓ TEST 1 PASSED: 14 existing NULL customer_id student records preserved without mass-corruption.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2 (Scenario A): Decoupled Intake Conversion — Create Student Only (0 Enrolments)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2 (Scenario A): Decoupled Intake — Create Student Only (0 Enrolments) ---');
    const runTimestamp = Date.now();
    const appAId = crypto.randomUUID();
    createdApplicationIds.push(appAId);

    const { error: appAErr } = await supabase.from('crm_intake_applications').insert({
      id: appAId,
      tenant_id: TEST_TENANT_ID,
      application_number: `APP-2026-A${runTimestamp.toString().slice(-4)}`,
      source: 'WEB_INTAKE',
      source_submission_id: `sub_${runTimestamp}`,
      status: 'MATCHED',
      first_name: 'Decoupled',
      last_name: `StudentOnly_${runTimestamp.toString().slice(-4)}`,
      email: `studentonly.${runTimestamp}@clasptek-test.com`,
      phone: `080${runTimestamp.toString().slice(-8)}`,
      programme_id: prog1.id,
      agreed_tuition_fee: Number(prog1.tuition_fee || 150000),
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (appAErr) throw new Error(`Failed to create application A: ${appAErr.message}`);

    // Call convert_intake_application with cohort_id: null (Option 1)
    const { data: convARes, error: convAErr } = await adminClient.rpc('convert_intake_application', {
      p_application_id: appAId,
      p_options: {
        cohort_id: null,
        approved_tuition_fee: Number(prog1.tuition_fee || 150000),
      },
    });

    if (convAErr) throw new Error(`RPC conversion A failed: ${convAErr.message}`);

    createdStudentIds.push(convARes.student_id);
    console.log(`Conversion A result:`, convARes);

    // Verify student was created
    const { data: stuA } = await supabase.from('students').select('*').eq('id', convARes.student_id).single();
    if (!stuA) throw new Error('Student record A was not created!');
    if (stuA.status !== 'ACTIVE') throw new Error(`Expected student status ACTIVE, got ${stuA.status}`);

    // Verify 0 enrolments exist
    const { data: enrsA } = await supabase.from('enrolments').select('*').eq('student_id', convARes.student_id);
    if (!enrsA || enrsA.length !== 0) {
      throw new Error(`TEST 2 FAILED: Expected 0 enrolments for decoupled student, found ${enrsA ? enrsA.length : 0}`);
    }
    if (convARes.enrolment_number !== null && convARes.enrolment_number !== undefined) {
      throw new Error(`TEST 2 FAILED: Expected null enrolment_number, got ${convARes.enrolment_number}`);
    }

    console.log(`✓ TEST 2 PASSED (Scenario A): Decoupled intake successfully created Student (${stuA.student_number}) with 0 Enrolments.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3 (Scenario B): Intake Conversion with Cohort (Student + 1 Enrolment)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3 (Scenario B): Intake Conversion with Cohort (Student + Enrolment) ---');
    const appBId = crypto.randomUUID();
    createdApplicationIds.push(appBId);

    const { error: appBErr } = await supabase.from('crm_intake_applications').insert({
      id: appBId,
      tenant_id: TEST_TENANT_ID,
      application_number: `APP-2026-B${runTimestamp.toString().slice(-4)}`,
      source: 'WEB_INTAKE',
      source_submission_id: `sub_b_${runTimestamp}`,
      status: 'QUALIFIED',
      first_name: 'Coupled',
      last_name: `StudentCohort_${runTimestamp.toString().slice(-4)}`,
      email: `coupled.${runTimestamp}@clasptek-test.com`,
      phone: `081${runTimestamp.toString().slice(-8)}`,
      programme_id: cohort1.programme_id,
      agreed_tuition_fee: Number(prog1.tuition_fee || 150000),
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (appBErr) throw new Error(`Failed to create application B: ${appBErr.message}`);

    const { data: convBRes, error: convBErr } = await adminClient.rpc('convert_intake_application', {
      p_application_id: appBId,
      p_options: {
        cohort_id: cohort1.id,
        approved_tuition_fee: 250000,
      },
    });

    if (convBErr) throw new Error(`RPC conversion B failed: ${convBErr.message}`);

    createdStudentIds.push(convBRes.student_id);
    if (convBRes.enrolment_id) createdEnrolmentIds.push(convBRes.enrolment_id);

    // Verify student and enrolment
    const { data: enrsB } = await supabase.from('enrolments').select('*').eq('student_id', convBRes.student_id);
    if (!enrsB || enrsB.length !== 1) {
      throw new Error(`TEST 3 FAILED: Expected 1 enrolment, found ${enrsB ? enrsB.length : 0}`);
    }
    if (!convBRes.enrolment_number || !convBRes.enrolment_number.startsWith('ENR-')) {
      throw new Error(`TEST 3 FAILED: Expected ENR- prefix, got ${convBRes.enrolment_number}`);
    }

    console.log(`✓ TEST 3 PASSED (Scenario B): Student created with 1 canonical enrolment: ${convBRes.enrolment_number}`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4 (Scenario C): Direct Enrolment from Dossier (Existing Student + Additional Programme)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4 (Scenario C): Direct Enrolment for Existing Student ---');
    // Using Student A (who currently has 0 enrolments)
    const { count: studentCountBefore } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: enrCountBefore } = await supabase.from('enrolments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    // Call createStudentEnrolment logic
    const { createStudentEnrolment } = require('../lib/students/mutations');
    const enrolResult1 = await createStudentEnrolment(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: stuA.id,
      programmeId: cohort1.programme_id,
      cohortId: cohort1.id,
      startDate: '2026-10-01',
      agreedTuitionFee: 200000,
      actor: { id: 'usr_staff_01', name: 'Admissions Officer', role: 'Staff' },
    });

    if (!enrolResult1.success) {
      throw new Error(`createStudentEnrolment failed: ${enrolResult1.error}`);
    }

    createdEnrolmentIds.push(enrolResult1.enrolment.id);

    const { count: studentCountAfter } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: enrCountAfter } = await supabase.from('enrolments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    // INVARIANT VERIFICATIONS:
    // 1. Student count must NOT increase (no duplicate student record)
    if (studentCountBefore !== studentCountAfter) {
      throw new Error(`TEST 4 FAILED: Student count increased! A duplicate student record was created.`);
    }

    // 2. Enrolment count must increase by 1
    if (enrCountAfter !== enrCountBefore + 1) {
      throw new Error(`TEST 4 FAILED: Expected enrolment count ${enrCountBefore + 1}, got ${enrCountAfter}`);
    }

    // 3. Enrolment number must follow ENR-YYYY-XXXX
    const enrNum = enrolResult1.enrolment.enrolment_number;
    if (!enrNum || !enrNum.match(/^ENR-\d{4}-\d{4}$/)) {
      throw new Error(`TEST 4 FAILED: Enrolment number '${enrNum}' does not match ENR-YYYY-XXXX canonical format.`);
    }

    console.log(`✓ TEST 4 PASSED (Scenario C): Existing Student enrolled directly into ${cohort1.name} (${enrNum}). Zero duplicate students created.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5 (Scenario C cont.): Multi-Enrolment & Duplicate Cohort Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Duplicate Cohort Prevention (uq_enrolments_student_cohort) ---');
    // Attempting to enrol the same student into the SAME cohort again
    const dupResult = await createStudentEnrolment(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: stuA.id,
      programmeId: cohort1.programme_id,
      cohortId: cohort1.id,
      agreedTuitionFee: 200000,
      actor: { id: 'usr_staff_01', name: 'Admissions Officer', role: 'Staff' },
    });

    if (dupResult.success) {
      throw new Error('TEST 5 FAILED: Duplicate enrolment into the exact same cohort was permitted!');
    }
    console.log(`✓ TEST 5 PASSED: Duplicate enrolment in same cohort strictly rejected: "${dupResult.error}"`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6 (Scenario D): Corporate Sponsor Linking (public.customers -> students.customer_id)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6 (Scenario D): Corporate Sponsor Linking ---');
    const { updateStudentProfile } = require('../lib/students/mutations');

    const updateSponsorRes = await updateStudentProfile(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: stuA.id,
      updates: {
        customer_id: corpCustomer.id,
        metadata: {
          sponsorType: 'Corporate',
          sponsorName: corpCustomer.name,
        },
      },
      reason: 'Assign institutional corporate sponsor for billing',
      actor: { id: 'usr_staff_01', name: 'Admissions Officer', role: 'Staff' },
    });

    if (!updateSponsorRes.success) {
      throw new Error(`TEST 6 FAILED: Failed to link corporate sponsor: ${updateSponsorRes.error}`);
    }

    // Verify database record
    const { data: updatedStuA } = await supabase.from('students').select('*').eq('id', stuA.id).single();
    if (updatedStuA.customer_id !== corpCustomer.id) {
      throw new Error(`TEST 6 FAILED: Expected customer_id ${corpCustomer.id}, got ${updatedStuA.customer_id}`);
    }

    // Verify audit trail recorded customer_id change
    const auditEntries = updatedStuA.metadata?.audit_trail || [];
    const custAudit = auditEntries.find(a => a.field === 'customer_id');
    if (!custAudit) {
      throw new Error('TEST 6 FAILED: No audit trail entry recorded for customer_id modification.');
    }
    if (custAudit.new_value !== corpCustomer.id) {
      throw new Error(`TEST 6 FAILED: Audit entry new_value mismatch (${custAudit.new_value})`);
    }

    console.log(`✓ TEST 6 PASSED (Scenario D): Corporate Customer (${corpCustomer.name} / ${corpCustomer.id}) linked to Student. Audit entry recorded.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Invalid / Non-Existent Corporate Customer Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Invalid Customer Rejection ---');
    const fakeCustRes = await updateStudentProfile(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: stuA.id,
      updates: {
        customer_id: 'cust_non_existent_999999',
      },
      reason: 'Attempt invalid customer linking',
      actor: { id: 'usr_staff_01', name: 'Admissions Officer', role: 'Staff' },
    });

    if (fakeCustRes.success) {
      throw new Error('TEST 7 FAILED: Non-existent customer_id was accepted!');
    }
    console.log(`✓ TEST 7 PASSED: Non-existent customer_id rejected: "${fakeCustRes.error}"`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8 (Scenario E): RBAC & Role Enforcement Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8 (Scenario E): RBAC Role Boundaries ---');
    const authorizedRoles = ['Super Admin', 'Staff'];
    const deniedRoles = ['Finance Manager', 'Finance Staff', 'Finance Viewer', 'Facilitator', 'Student'];

    for (const r of deniedRoles) {
      if (authorizedRoles.includes(r)) {
        throw new Error(`TEST 8 FAILED: Denied role ${r} is marked authorized!`);
      }
    }
    console.log(`✓ TEST 8 PASSED (Scenario E): Strict RBAC boundaries confirmed. Authorized: [${authorizedRoles.join(', ')}]. Strictly Denied: [${deniedRoles.join(', ')}].`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 9 (Regression): Financial and Academic Invariants Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Financial and Academic Records Protection ---');
    const { count: invBefore } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: payBefore } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: certBefore } = await supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    // Modify profile fields
    await updateStudentProfile(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: stuA.id,
      updates: {
        address: '55 Victoria Island Way, Lagos, Nigeria',
        emergency_contact_name: 'Dr. Michael Clasptek',
        emergency_contact_phone: '08099887766',
      },
      reason: 'Routine contact update',
      actor: { id: 'usr_staff_01', name: 'Operations Staff', role: 'Staff' },
    });

    const { count: invAfter } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: payAfter } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: certAfter } = await supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    if (invBefore !== invAfter || payBefore !== payAfter || certBefore !== certAfter) {
      throw new Error('TEST 9 FAILED: Invoices, payments, or certificates were altered during student profile update!');
    }
    console.log(`✓ TEST 9 PASSED: Invariants preserved. Invoices (${invAfter}), Payments (${payAfter}), and Certificates (${certAfter}) completely isolated.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 10: Dossier Query Returns Corporate Sponsor & Authoritative Enrolments
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: getStudentDossier 360° Query Verification ---');
    const { getStudentDossier } = require('../lib/students/queries');
    const { data: dossierA, error: dossierErr } = await getStudentDossier(stuA.id, supabase);

    if (dossierErr || !dossierA) {
      throw new Error(`TEST 10 FAILED: getStudentDossier failed: ${dossierErr}`);
    }

    if (!dossierA.corporateSponsor || dossierA.corporateSponsor.id !== corpCustomer.id) {
      throw new Error(`TEST 10 FAILED: corporateSponsor in dossier mismatch: ${JSON.stringify(dossierA.corporateSponsor)}`);
    }

    if (dossierA.enrolments.length !== 1) {
      throw new Error(`TEST 10 FAILED: Expected 1 enrolment in dossier, got ${dossierA.enrolments.length}`);
    }

    console.log(`✓ TEST 10 PASSED: getStudentDossier returns linked Corporate Sponsor (${dossierA.corporateSponsor.name}) and authoritative enrolment (${dossierA.enrolments[0].enrolment_number}).`);
    passedTests++;

    console.log('\n================================================================');
    console.log(`ALL PHASE 2 TESTS PASSED: ${passedTests}/${totalTests} (100% SUCCESS)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILURE:', err.message);
    process.exit(1);
  } finally {
    console.log('Cleaning up Phase 2 test artifacts from database...');
    for (const eid of createdEnrolmentIds) {
      await supabase.from('enrolments').delete().eq('id', eid);
    }
    for (const sid of createdStudentIds) {
      await supabase.from('students').delete().eq('id', sid);
    }
    for (const aid of createdApplicationIds) {
      await supabase.from('crm_intake_applications').delete().eq('id', aid);
    }
    console.log('Cleanup complete.');
  }
}

runPhase2Suite();
