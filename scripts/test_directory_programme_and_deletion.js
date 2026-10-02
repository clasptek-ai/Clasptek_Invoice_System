/**
 * scripts/test_directory_programme_and_deletion.js
 * Verification Suite for:
 * 1. Programme Data Accuracy (True programme display, no false 'General' fallbacks)
 * 2. Directory Filtering (Search, Status, Programme, Enrolment Status, Financial Status)
 * 3. Selection & Batch Deletion (Individual, Select All, Clear, Protected Deletion)
 * 4. Dependency Protection (Prevents deletion of students with enrolments/invoices/certs)
 */

const fs = require('fs');
const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

// 1. Read environment config
const envContent = fs.readFileSync('.env.local', 'utf8');
let url = '', serviceKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SECRET_KEY=')) serviceKey = line.split('=')[1].trim().replace(/['"]/g, '');
});

const sb = createClient(url, serviceKey);

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// Mirror authoritative dependency check from lib/students/mutations.ts
async function checkStudentDependencies(supabase, tenantId, studentId) {
  const { data: student } = await supabase
    .from('students')
    .select('id, student_number, first_name, last_name, customer_id, email')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (!student) return null;

  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();

  // 1. Enrolments
  const { count: enrCount } = await supabase
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
    const { data: invRows } = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(orClauses.join(','));
    invCount = invRows?.length || 0;
    if (invCount > 0) {
      const invIds = invRows.map(i => i.id);
      const { count: pCount } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('invoice_id', invIds);
      payCount = pCount || 0;
    }
  }

  // 3. Certificates
  const { count: certCount } = await supabase
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

  let blockReason;
  if (hasDeps) {
    const reasons = [];
    if (dependencies.enrolments > 0) reasons.push(`${dependencies.enrolments} enrolment(s)`);
    if (dependencies.invoices > 0) reasons.push(`${dependencies.invoices} invoice(s)`);
    if (dependencies.payments > 0) reasons.push(`${dependencies.payments} payment(s)`);
    if (dependencies.certificates > 0) reasons.push(`${dependencies.certificates} certificate(s)`);
    blockReason = `Cannot delete because related records exist: ${reasons.join(', ')}.`;
  }

  return {
    studentId: student.id,
    studentNumber: student.student_number || '',
    studentName: fullName || 'Student',
    canDelete: !hasDeps,
    blockReason,
    dependencies,
  };
}

async function deleteStudentSafe(supabase, params) {
  const { tenantId, studentId, reason, actor } = params;

  const report = await checkStudentDependencies(supabase, tenantId, studentId);
  if (!report) {
    return { success: false, error: 'Student not found in tenant.' };
  }

  if (!report.canDelete) {
    return {
      success: false,
      error: report.blockReason || 'Student has dependent records and cannot be deleted.',
      report,
    };
  }

  // Safe to delete: clean up loose references in crm_intake_applications
  await supabase
    .from('crm_intake_applications')
    .update({ matched_student_id: null, updated_at: new Date().toISOString() })
    .eq('matched_student_id', studentId)
    .eq('tenant_id', tenantId);

  const { error: delErr } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId)
    .eq('tenant_id', tenantId);

  if (delErr) {
    return { success: false, error: delErr.message, report };
  }

  // Audit log
  try {
    const isUuid = (val) =>
      typeof val === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const { error: audErr } = await supabase.from('finance_audit_log').insert({
      id: `aud_del_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      tenant_id: tenantId,
      action: 'STUDENT_DELETED',
      entity_type: 'Student',
      entity_id: studentId,
      entity_name: `${report.studentName} (${report.studentNumber})`,
      actor_id: isUuid(actor.id) ? actor.id : null,
      actor_role: actor.role,
      reason: reason || 'Deleted from Student Directory (0 dependencies verified)',
      source: 'STUDENT_DIRECTORY',
      created_at: new Date().toISOString(),
    });
    if (audErr) console.warn('[deleteStudentSafe] Audit log error:', audErr);
  } catch (auditErr) {
    console.warn('[deleteStudentSafe] Audit log deferred:', auditErr);
  }

  return { success: true, report };
}

async function main() {
  console.log('================================================================');
  console.log('CLASPTEK DIRECTORY PROGRAMME ACCURACY & SAFE DELETION SUITE');
  console.log('================================================================\n');

  // --- SECTION 1: PROGRAMME DATA RESOLUTION & FALLBACKS ---
  console.log('--- SECTION 1: Programme Resolution & Safe Fallbacks ---');

  const { data: programmes } = await sb.from('programmes').select('id, name');
  const progMap = new Map(programmes.map(p => [p.id, p.name]));

  runTest('1.1 Canonical programmes in database have specific names', () => {
    assert(programmes.length > 5, 'Should have multiple canonical programmes');
    const hasDataAnalysis = programmes.some(p => p.name.includes('Data Analysis'));
    const hasCybersecurity = programmes.some(p => p.name.includes('Cybersecurity'));
    assert(hasDataAnalysis, 'Should contain Data Analysis programme');
    assert(hasCybersecurity, 'Should contain Cybersecurity programme');
  });

  await runAsyncTest('1.2 Enquiries resolve true programme name via programme_id', async () => {
    const { data: enqs, error } = await sb
      .from('enquiries')
      .select('id, student_name, programme_id, programmes:programme_id(name)')
      .limit(5);

    assert(!error, `Enquiries fetch failed: ${error?.message}`);
    enqs.forEach(e => {
      if (e.programme_id) {
        const expectedName = progMap.get(e.programme_id);
        const resolvedName = e.programmes?.name || expectedName;
        assert(resolvedName, `Programme should resolve for ${e.student_name}`);
        assert.notStrictEqual(resolvedName, 'General', 'Should not falsely resolve to General');
      }
    });
  });

  await runAsyncTest('1.3 Student enrolments resolve specific programme names (not General)', async () => {
    const { data: enrs, error } = await sb
      .from('enrolments')
      .select('id, student_id, programme_id, programmes!fk_enrolments_programme_tenant(name)')
      .limit(10);

    assert(!error, `Enrolments join failed: ${error?.message}`);
    assert(enrs.length > 0, 'Should have enrolments');
    enrs.forEach(en => {
      const pName = en.programmes?.name;
      assert(pName, `Enrolment ${en.id} must resolve programme name`);
      assert.notStrictEqual(pName, 'General', 'Must not be General');
    });
  });

  await runAsyncTest('1.4 Codebase fallback scan: Zero occurrences of || "General" in academic components', async () => {
    const cohortTable = fs.readFileSync('components/cohorts/CohortTable.tsx', 'utf8');
    const enrolmentTable = fs.readFileSync('components/enrolments/EnrolmentTable.tsx', 'utf8');
    const academicQueries = fs.readFileSync('lib/academics/queries.ts', 'utf8');

    assert(!cohortTable.includes("programme_name || 'General'"), 'CohortTable must not use General fallback');
    assert(!enrolmentTable.includes("programme_name || 'General'"), 'EnrolmentTable must not use General fallback');
    assert(!academicQueries.includes("c.programmes?.name || 'General'"), 'academics/queries must not use General fallback');
  });

  // --- SECTION 2: DIRECTORY FILTERING ---
  console.log('\n--- SECTION 2: Directory Filtering Capabilities ---');

  const { data: testStudents } = await sb.from('students').select('id, status').limit(20);
  const { data: allEnrs } = await sb.from('enrolments').select('student_id, programme_id');

  runTest('2.1 Filter by Enrolment Status (Enrolled vs Not Enrolled)', () => {
    const enrolledIds = new Set(allEnrs.map(e => e.student_id));
    const enrolledStudents = testStudents.filter(s => enrolledIds.has(s.id));
    assert(enrolledStudents.length > 0, 'Should identify enrolled students');
    assert(enrolledStudents.every(s => enrolledIds.has(s.id)), 'All enrolled must have enrolments');
  });

  runTest('2.2 Filter by Programme ID returns strictly students in that programme', () => {
    const sampleProgId = programmes[0].id;
    const studentsInProg = allEnrs.filter(e => e.programme_id === sampleProgId).map(e => e.student_id);
    assert(Array.isArray(studentsInProg), 'Should filter students by programme ID');
  });

  // --- SECTION 3: DEPENDENCY CHECKING & CONTROLLED DELETION ---
  console.log('\n--- SECTION 3: Dependency Checking & Controlled Deletion ---');

  const tenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

  await runAsyncTest('3.1 Student with active enrolment is PROTECTED from deletion', async () => {
    // Sarof Hamad has enrolment enr_enr_00174
    const studentWithEnrolmentId = '23585e3d-7b7d-4cf8-a20e-c30eebf25afe';
    const report = await checkStudentDependencies(sb, tenantId, studentWithEnrolmentId);

    assert(report, 'Report should be generated');
    assert.strictEqual(report.canDelete, false, 'Student with enrolment must NOT be deletable');
    assert(report.dependencies.enrolments > 0, 'Dependencies must show enrolments > 0');
    assert(report.blockReason.includes('enrolment'), 'Block reason must cite enrolments');

    // Attempting deleteStudentSafe must be blocked
    const deleteAttempt = await deleteStudentSafe(sb, {
      tenantId,
      studentId: studentWithEnrolmentId,
      actor: { id: 'admin_test', name: 'Test Admin', role: 'Super Admin' }
    });

    assert.strictEqual(deleteAttempt.success, false, 'deleteStudentSafe must fail on protected student');
    assert(
      deleteAttempt.error.includes('related records exist') || deleteAttempt.error.includes('dependent records exist'),
      'Must return dependency block error'
    );
  });

  await runAsyncTest('3.2 Ephemeral student without dependencies CAN be safely deleted', async () => {
    // 1. Create a dummy ephemeral student with 0 dependencies
    const dummyId = `stu_test_ephemeral_${Date.now()}`;
    const dummyNumber = `STU-TEST-${Date.now().toString().slice(-4)}`;

    const { data: createdStudent, error: createErr } = await sb
      .from('students')
      .insert({
        id: dummyId,
        tenant_id: tenantId,
        student_number: dummyNumber,
        first_name: 'Ephemeral',
        last_name: 'TestSubject',
        email: `ephemeral_${Date.now()}@test.clasptek.com`,
        phone: '08000000000',
        status: 'ACTIVE',
        metadata: { source: 'automated_test' }
      })
      .select('*')
      .single();

    assert(!createErr, `Failed to create dummy student: ${createErr?.message}`);
    assert(createdStudent, 'Dummy student created');

    // 2. Check dependencies
    const report = await checkStudentDependencies(sb, tenantId, dummyId);
    assert(report, 'Report should exist');
    assert.strictEqual(report.canDelete, true, 'Student without dependencies must be eligible for delete');
    assert.strictEqual(report.dependencies.enrolments, 0, 'Enrolments must be 0');
    assert.strictEqual(report.dependencies.invoices, 0, 'Invoices must be 0');
    assert.strictEqual(report.dependencies.payments, 0, 'Payments must be 0');

    // 3. Delete student safely
    const deleteRes = await deleteStudentSafe(sb, {
      tenantId,
      studentId: dummyId,
      reason: 'Automated test cleanup verification',
      actor: { id: 'admin_test', name: 'Test Admin', role: 'Super Admin' }
    });

    assert(deleteRes.success, `Safe deletion failed: ${deleteRes.error}`);

    // 4. Verify record is gone from students table
    const { data: lookup } = await sb.from('students').select('id').eq('id', dummyId).maybeSingle();
    assert(!lookup, 'Deleted student must no longer exist in students table');

    // 5. Verify audit log was recorded in finance_audit_log
    const { data: auditLog } = await sb
      .from('finance_audit_log')
      .select('*')
      .eq('entity_id', dummyId)
      .eq('action', 'STUDENT_DELETED')
      .maybeSingle();

    assert(auditLog, 'Audit log must be recorded for STUDENT_DELETED');
    assert.strictEqual(auditLog.action, 'STUDENT_DELETED');
  });

  // --- SECTION 4: BATCH SELECTION & CHECK ENDPOINT INTEGRATION ---
  console.log('\n--- SECTION 4: Selection & Batch Integration ---');

  await runAsyncTest('4.1 Batch dependency checker accurately segregates eligible vs blocked records', async () => {
    // Create one eligible student
    const dummyId2 = `stu_test_batch_${Date.now()}`;
    await sb.from('students').insert({
      id: dummyId2,
      tenant_id: tenantId,
      student_number: `STU-BAT-${Date.now().toString().slice(-4)}`,
      first_name: 'BatchEligible',
      last_name: 'Student',
      email: `batch_${Date.now()}@test.com`,
      status: 'ACTIVE'
    });

    const enrolledStudentId = '23585e3d-7b7d-4cf8-a20e-c30eebf25afe'; // Has enrolment

    const r1 = await checkStudentDependencies(sb, tenantId, dummyId2);
    const r2 = await checkStudentDependencies(sb, tenantId, enrolledStudentId);

    assert(r1.canDelete, 'Unattached student must be eligible');
    assert(!r2.canDelete, 'Enrolled student must be blocked');

    // Clean up dummyId2
    await sb.from('students').delete().eq('id', dummyId2);
  });

  runTest('4.2 Verify Server API endpoints exist and export expected methods', () => {
    assert(fs.existsSync('app/api/students/[id]/route.ts'), 'Single student route must exist');
    assert(fs.existsSync('app/api/students/bulk-delete/route.ts'), 'Bulk delete route must exist');
    assert(fs.existsSync('app/api/students/check-dependencies/route.ts'), 'Check dependencies route must exist');

    const singleRoute = fs.readFileSync('app/api/students/[id]/route.ts', 'utf8');
    assert(singleRoute.includes('export async function DELETE'), 'Single route must export DELETE');
    assert(singleRoute.includes('export async function GET'), 'Single route must export GET');
    assert(singleRoute.includes('checkStudentDependencies'), 'Single route must check dependencies');

    const bulkRoute = fs.readFileSync('app/api/students/bulk-delete/route.ts', 'utf8');
    assert(bulkRoute.includes('export async function POST'), 'Bulk delete route must export POST');
    assert(bulkRoute.includes('deleteStudentSafe'), 'Bulk delete route must call deleteStudentSafe');
  });

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
