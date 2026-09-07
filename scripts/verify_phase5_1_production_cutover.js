/**
 * CLASPTEK ENTERPRISE PLATFORM — PHASE 5.1 PRODUCTION POST-DEPLOYMENT VERIFICATION & SMOKE TEST
 * 
 * Target: Real Hosted Supabase Production Cloud
 * Project Ref: logaawoigfxnisimfatf
 * Project URL: https://logaawoigfxnisimfatf.supabase.co
 * Migration:   migrations/20260907_phase5_1_crm_intake_fix02.sql
 * SHA-256:     08c1faabac51457a6c186b7a6bb971981aa134bb1a20e351a4316b386562520a
 * 
 * Forensic audit across all 13 gates:
 * 1. Database Object Inventory & Schema Definitions
 * 2. PostgREST Schema Visibility (No 404s, reload schema verified)
 * 3. Permission Boundaries (anon vs authenticated vs service_role)
 * 4. RLS & Tenant Isolation
 * 5. Controlled Public Intake Smoke Test & Privacy Masking
 * 6. Idempotency Replay & Zero Duplicate Generation
 * 7. Database Trigger Immutability (applicant_data / IMMUTABLE_FIELD)
 * 8. Application-Number Concurrency & Monotonicity
 * 9. Academic Conversion Governance & Role Authorization
 * 10. Immutable Audit Trail (APPLICATION_CREATED & Audit Immutability)
 * 11. Production Data Protection Baseline Comparison
 * 12. Controlled Cleanup of Synthetic Entities
 * 13. Final Certification Assessment Classification
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';
const TARGET_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

// Load keys from .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let publishableKey = '';
let serviceKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_PUBLISHABLE_KEY=')) {
    publishableKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
  if (line.startsWith('SUPABASE_SECRET_KEY=')) {
    serviceKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});
if (!publishableKey) {
  envContent.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_ANON_KEY=')) {
      publishableKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  });
}

function request(endpoint, options = {}, payload = null, token = null, isService = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + endpoint);
    const apiKey = isService ? serviceKey : publishableKey;
    const authHeader = token ? `Bearer ${token}` : (isService ? `Bearer ${serviceKey}` : `Bearer ${publishableKey}`);
    const headers = {
      'apikey': apiKey,
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {})
    };

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', err => reject(err));
    if (payload) {
      req.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }
    req.end();
  });
}

async function loginUser(email, password) {
  const r = await request('/auth/v1/token?grant_type=password', { method: 'POST' }, { email, password }, null, false);
  return r.body?.access_token;
}

async function runProductionAudit() {
  console.log('========================================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 5.1 POST-DEPLOYMENT PRODUCTION AUDIT');
  console.log(' Project Ref:  logaawoigfxnisimfatf (Production Hosted Cloud)');
  console.log(' Project URL:  ' + SUPABASE_URL);
  console.log(' Migration:    migrations/20260907_phase5_1_crm_intake_fix02.sql');
  console.log(' SHA-256:      08c1faabac51457a6c186b7a6bb971981aa134bb1a20e351a4316b386562520a');
  console.log(' Audit Time:   ' + new Date().toISOString());
  console.log('========================================================================================\n');

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  const failureDetails = [];

  function assert(condition, message, failureDetail = null) {
    if (condition) {
      console.log(`  ✔ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${message}`);
      failed++;
      if (failureDetail) failureDetails.push(failureDetail);
    }
  }

  // --- SECTION 1: Baseline Production Data Protection Snapshot ---
  console.log('--- 1. Baseline Production Data Protection Snapshot ---');

  async function getCount(table) {
    const res = await request(`/rest/v1/${table}?select=count`, {}, null, null, true);
    if (res.status === 200 && Array.isArray(res.body) && res.body[0]) {
      return res.body[0].count;
    }
    return null;
  }

  const baselineCounts = {
    tenants: await getCount('tenants'),
    students: await getCount('students'),
    programmes: await getCount('programmes'),
    enrolments: await getCount('enrolments'),
    finance_settings: await getCount('finance_settings'),
    finance_audit_log: await getCount('finance_audit_log'),
    crm_intake_applications: await getCount('crm_intake_applications'),
    crm_intake_counters: await getCount('crm_intake_counters')
  };

  console.log('  Baseline table counts:', JSON.stringify(baselineCounts));
  assert(baselineCounts.tenants === 1, 'tenants table queryable (Baseline: 1)');
  assert(baselineCounts.students === 0, 'students table queryable (Baseline: 0)');
  assert(baselineCounts.programmes === 0, 'programmes table queryable (Baseline: 0)');
  assert(baselineCounts.enrolments === 0, 'enrolments table queryable (Baseline: 0)');
  assert(baselineCounts.finance_settings === 1, 'finance_settings table queryable (Baseline: 1)');
  assert(baselineCounts.crm_intake_applications === 0, 'crm_intake_applications table queryable (Baseline: 0)');
  assert(baselineCounts.crm_intake_counters !== null, 'crm_intake_counters table queryable (Baseline: ' + baselineCounts.crm_intake_counters + ')');

  // --- SECTION 2: Database Object Inventory & PostgREST Schema Visibility ---
  console.log('\n--- 2. Database Object Inventory & PostgREST Schema Visibility ---');

  const rSpec = await request('/rest/v1/?', {}, null, null, true);
  assert(rSpec.status === 200, 'PostgREST OpenAPI specification retrieved (HTTP 200)');
  const spec = rSpec.body || {};

  // Verify Tables in OpenAPI
  assert(spec.definitions?.crm_intake_applications !== undefined, 'Table public.crm_intake_applications present in schema definitions');
  assert(spec.definitions?.crm_intake_counters !== undefined, 'Table public.crm_intake_counters present in schema definitions');
  assert(spec.paths?.['/crm_intake_applications'] !== undefined, 'Path /crm_intake_applications visible in PostgREST');
  assert(spec.paths?.['/crm_intake_counters'] !== undefined, 'Path /crm_intake_counters visible in PostgREST');

  // Verify RPCs in OpenAPI
  assert(spec.paths?.['/rpc/submit_applicant_intake'] !== undefined, 'RPC public.submit_applicant_intake visible in PostgREST');
  assert(spec.paths?.['/rpc/convert_intake_application'] !== undefined, 'RPC public.convert_intake_application visible in PostgREST');
  assert(spec.paths?.['/rpc/get_next_application_number'] !== undefined, 'RPC public.get_next_application_number visible in PostgREST');

  // Table direct query probe
  const rTableApps = await request('/rest/v1/crm_intake_applications?select=id&limit=1', {}, null, null, true);
  assert(rTableApps.status === 200, `crm_intake_applications table query returns HTTP 200`);

  const rTableCounters = await request('/rest/v1/crm_intake_counters?select=id&limit=1', {}, null, null, true);
  assert(rTableCounters.status === 200, `crm_intake_counters table query returns HTTP 200`);

  // --- SECTION 3: Permission Boundaries & Privilege Isolation ---
  console.log('\n--- 3. Permission Boundaries & Privilege Isolation ---');

  // Anonymous direct mutations denied on crm_intake_applications
  const rAnonInsertApp = await request('/rest/v1/crm_intake_applications', { method: 'POST' }, {
    first_name: 'Adversary',
    last_name: 'Hacker',
    email: 'hacker@example.com'
  }, null, false);
  assert(
    rAnonInsertApp.status === 401 || rAnonInsertApp.status === 403,
    `Direct anonymous INSERT to crm_intake_applications denied by RLS (HTTP ${rAnonInsertApp.status})`
  );

  const rAnonPatchApp = await request('/rest/v1/crm_intake_applications?status=eq.NEW', { method: 'PATCH' }, {
    status: 'CONVERTED'
  }, null, false);
  assert(
    rAnonPatchApp.status === 401 || rAnonPatchApp.status === 403,
    `Direct anonymous UPDATE to crm_intake_applications denied by RLS (HTTP ${rAnonPatchApp.status})`
  );

  const rAnonDeleteApp = await request('/rest/v1/crm_intake_applications?status=eq.NEW', { method: 'DELETE' }, null, null, false);
  assert(
    rAnonDeleteApp.status === 401 || rAnonDeleteApp.status === 403,
    `Direct anonymous DELETE to crm_intake_applications denied by RLS (HTTP ${rAnonDeleteApp.status})`
  );

  // Anonymous direct mutations denied on crm_intake_counters
  const rAnonInsertCounter = await request('/rest/v1/crm_intake_counters', { method: 'POST' }, {
    tenant_id: TARGET_TENANT_ID,
    application_seq: 999
  }, null, false);
  assert(
    rAnonInsertCounter.status === 401 || rAnonInsertCounter.status === 403,
    `Direct anonymous INSERT to crm_intake_counters denied by RLS (HTTP ${rAnonInsertCounter.status})`
  );

  const rAnonPatchCounter = await request('/rest/v1/crm_intake_counters?tenant_id=eq.00000000-0000-0000-0000-000000000000', { method: 'PATCH' }, {
    application_seq: 999
  }, null, false);
  assert(
    rAnonPatchCounter.status === 401 || rAnonPatchCounter.status === 403,
    `Direct anonymous UPDATE to crm_intake_counters denied (HTTP ${rAnonPatchCounter.status})`
  );

  const rAnonDeleteCounter = await request('/rest/v1/crm_intake_counters?tenant_id=eq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' }, null, null, false);
  assert(
    rAnonDeleteCounter.status === 401 || rAnonDeleteCounter.status === 403,
    `Direct anonymous DELETE to crm_intake_counters denied (HTTP ${rAnonDeleteCounter.status})`
  );

  // Privileged counter helper completely denied to public/anon
  const rCounterRpcAnon = await request('/rest/v1/rpc/get_next_application_number', { method: 'POST' }, {
    p_tenant_id: TARGET_TENANT_ID
  }, null, false);
  assert(
    rCounterRpcAnon.status === 401 || rCounterRpcAnon.status === 403,
    `Privileged get_next_application_number helper strictly denied to anon (HTTP ${rCounterRpcAnon.status})`
  );

  // Anonymous execution of convert_intake_application denied
  const rAnonConvert = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: '00000000-0000-0000-0000-000000000000'
  }, null, false);
  assert(
    rAnonConvert.status === 401 || rAnonConvert.status === 403 || (rAnonConvert.body && (rAnonConvert.body.message || '').includes('UNAUTHORIZED')),
    `Anonymous execution of convert_intake_application rejected (HTTP ${rAnonConvert.status})`
  );

  // Privileged counter helper allowed to service_role
  const rCounterRpcService = await request('/rest/v1/rpc/get_next_application_number', { method: 'POST' }, {
    p_tenant_id: TARGET_TENANT_ID
  }, null, true);
  assert(
    rCounterRpcService.status === 200 && typeof rCounterRpcService.body === 'string' && rCounterRpcService.body.startsWith('APP-'),
    'Privileged get_next_application_number executes for service_role: ' + rCounterRpcService.body
  );

  // Authenticated user cannot execute get_next_application_number directly
  const adminToken = await loginUser('admin@clasptek.org', 'AdminSecure2026!');
  assert(adminToken !== undefined && adminToken.length > 50, 'Authenticated Super Admin session established');

  const rCounterRpcAuth = await request('/rest/v1/rpc/get_next_application_number', { method: 'POST' }, {
    p_tenant_id: TARGET_TENANT_ID
  }, adminToken, false);
  assert(
    rCounterRpcAuth.status === 401 || rCounterRpcAuth.status === 403,
    `Authenticated user cannot directly execute get_next_application_number (HTTP ${rCounterRpcAuth.status})`
  );

  // Unauthorized authenticated role rejected by convert_intake_application
  const tempFinanceEmail = `finance.audit.${Date.now()}@clasptek.org`;
  const tempFinancePass = 'AuditFinancePass2026!';
  const rCreateFinanceUser = await request('/auth/v1/admin/users', { method: 'POST' }, {
    email: tempFinanceEmail,
    password: tempFinancePass,
    email_confirm: true
  }, null, true);
  const tempFinanceUserId = rCreateFinanceUser.body?.id;

  await request('/rest/v1/tenant_memberships', { method: 'POST' }, {
    tenant_id: TARGET_TENANT_ID,
    user_id: tempFinanceUserId,
    role: 'FINANCE_STAFF',
    status: 'active'
  }, null, true);

  const financeToken = await loginUser(tempFinanceEmail, tempFinancePass);
  const rFinanceConvert = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: '00000000-0000-0000-0000-000000000000'
  }, financeToken, false);
  assert(
    rFinanceConvert.status === 400 && (rFinanceConvert.body?.message || '').includes('UNAUTHORIZED'),
    'Finance-only role strictly rejected by convert_intake_application: ' + (rFinanceConvert.body?.message || 'Rejected')
  );

  // Cleanup temporary finance user
  await request(`/rest/v1/tenant_memberships?user_id=eq.${tempFinanceUserId}`, { method: 'DELETE' }, null, null, true);
  await request(`/auth/v1/admin/users/${tempFinanceUserId}`, { method: 'DELETE' }, null, null, true);

  // --- SECTION 4: RLS & Multi-Tenant Isolation ---
  console.log('\n--- 4. RLS & Multi-Tenant Isolation ---');

  const rCrossTenantRead = await request(`/rest/v1/crm_intake_applications?tenant_id=neq.${TARGET_TENANT_ID}&select=*`, {}, null, adminToken, false);
  assert(
    rCrossTenantRead.status === 200 && Array.isArray(rCrossTenantRead.body) && rCrossTenantRead.body.length === 0,
    'RLS Tenant Isolation: Authenticated caller cannot read other tenant records (0 rows returned)'
  );

  // --- SECTION 5: Controlled Synthetic Public Intake Smoke Test ---
  console.log('\n--- 5. Controlled Synthetic Public Intake Smoke Test ---');

  const testTimestamp = Date.now();
  const testProgId = 'prog_smoke_' + testTimestamp;
  const testCohortId = 'cohort_smoke_' + testTimestamp;
  const testSubmissionId = 'smoke_sub_' + testTimestamp;
  const testEmail = `phase51.smoke.${testTimestamp}@clasptek.org`;
  const catalogueTuitionFee = 150000;
  const publicClaimedFee = 99000;

  // Provision synthetic active programme and UPCOMING cohort
  const rCreateProg = await request('/rest/v1/programmes', { method: 'POST' }, {
    id: testProgId,
    tenant_id: TARGET_TENANT_ID,
    name: 'Phase 5.1 Production Verification Programme',
    code: 'SMOKE-' + testTimestamp,
    tuition_fee: catalogueTuitionFee,
    status: 'active'
  }, null, true);
  assert(rCreateProg.status === 201 || rCreateProg.status === 200, `Synthetic active programme created (HTTP ${rCreateProg.status})`);

  const rCreateCohort = await request('/rest/v1/cohorts', { method: 'POST' }, {
    id: testCohortId,
    tenant_id: TARGET_TENANT_ID,
    programme_id: testProgId,
    cohort_code: 'COH-' + testTimestamp,
    name: 'Smoke Test Cohort ' + testTimestamp,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
    delivery_mode: 'IN_PERSON',
    capacity: 30,
    status: 'UPCOMING'
  }, null, true);
  assert(rCreateCohort.status === 201 || rCreateCohort.status === 200, `Synthetic active cohort created with capacity 30 and UPCOMING status (HTTP ${rCreateCohort.status})`);

  // Public Anonymous Intake Submission via Authoritative RPC
  const intakePayload = {
    p_source: 'WEB_INTAKE',
    p_source_submission_id: testSubmissionId,
    p_first_name: 'PHASE51_TEST',
    p_last_name: 'SMOKE',
    p_email: testEmail,
    p_phone: '+2348012345678',
    p_programme_id: testProgId,
    p_agreed_tuition_fee: publicClaimedFee,
    p_consent_acknowledged: true
  };

  const rIntake = await request('/rest/v1/rpc/submit_applicant_intake', { method: 'POST' }, intakePayload, null, false);
  assert(rIntake.status === 200, `submit_applicant_intake succeeds for public anonymous caller (HTTP ${rIntake.status})`);
  assert(rIntake.body && rIntake.body.success === true, 'Public intake response returns success: true');
  assert(
    rIntake.body && typeof rIntake.body.application_number === 'string' && rIntake.body.application_number.startsWith('APP-'),
    'Authoritative application number allocated: ' + rIntake.body?.application_number
  );
  assert(rIntake.body?.status === 'RECEIVED', 'Public status masked to RECEIVED');
  assert(rIntake.body?.application_id === undefined, 'Zero internal leakage: application_id omitted in public response');
  assert(rIntake.body?.matched_student_id === undefined, 'Zero PII leakage: matched_student_id omitted');
  assert(rIntake.body?.identity_confidence === undefined, 'Zero internal leakage: identity_confidence omitted');

  const createdAppNumber = rIntake.body?.application_number;

  // Verify Authoritative Database Record Created & Tenant Assigned by Server
  const rFetchApp = await request(`/rest/v1/crm_intake_applications?source_submission_id=eq.${testSubmissionId}&select=*`, {}, null, null, true);
  assert(rFetchApp.status === 200 && rFetchApp.body?.length === 1, 'Authoritative database record confirmed in crm_intake_applications');
  const appRecord = rFetchApp.body?.[0];
  assert(appRecord && appRecord.tenant_id === TARGET_TENANT_ID, 'Authoritative tenant assigned by server: ' + appRecord?.tenant_id);
  assert(appRecord && appRecord.application_number === createdAppNumber, 'Database application_number matches returned number');
  assert(appRecord && appRecord.status === 'NEW', 'Database record initial status is NEW');
  assert(appRecord && appRecord.applicant_data?.first_name === 'PHASE51_TEST', 'Raw applicant_data snapshot preserved in database');

  // Verify Database Audit Log on Creation
  const rAuditCreate = await request(`/rest/v1/finance_audit_log?entity_id=eq.${appRecord?.id}&action=eq.APPLICATION_CREATED&select=*`, {}, null, null, true);
  assert(rAuditCreate.status === 200 && rAuditCreate.body?.length === 1, 'Authoritative APPLICATION_CREATED event logged in finance_audit_log');
  const auditCreateRecord = rAuditCreate.body?.[0];
  assert(auditCreateRecord?.actor_role === 'ANONYMOUS', 'Audit event captures actor_role: ANONYMOUS');
  assert(auditCreateRecord?.source === 'supabase_rpc', 'Audit event captures source: supabase_rpc');

  // --- SECTION 6: Idempotency Replay Test ---
  console.log('\n--- 6. Idempotency Replay Test ---');

  const rReplay = await request('/rest/v1/rpc/submit_applicant_intake', { method: 'POST' }, intakePayload, null, false);
  assert(rReplay.status === 200, 'Replay submission succeeds with HTTP 200');
  assert(rReplay.body?.is_replay === true, 'Replay response correctly flags is_replay: true');
  assert(rReplay.body?.application_number === createdAppNumber, 'Replay returns identical application number: ' + createdAppNumber);

  // Confirm NO second application record was created
  const rFetchDuplicate = await request(`/rest/v1/crm_intake_applications?source_submission_id=eq.${testSubmissionId}&select=*`, {}, null, null, true);
  assert(rFetchDuplicate.status === 200 && rFetchDuplicate.body?.length === 1, 'Idempotency verified: exactly 1 database record exists (zero duplicates)');

  // --- SECTION 7: Immutable Raw Submission Trigger Test ---
  console.log('\n--- 7. Immutable Raw Submission Trigger Test ---');

  const rTamperRaw = await request(`/rest/v1/crm_intake_applications?id=eq.${appRecord?.id}`, {
    method: 'PATCH'
  }, { applicant_data: { tampered: true, evil_override: 'hacked' } }, null, true);
  assert(
    rTamperRaw.status === 400 && (rTamperRaw.body?.message || '').includes('IMMUTABLE_FIELD'),
    'Database trigger trg_prevent_applicant_data_update strictly prevents modifying applicant_data (IMMUTABLE_FIELD)'
  );

  // Verify legitimate CRM fields CAN be updated
  const rUpdateNotes = await request(`/rest/v1/crm_intake_applications?id=eq.${appRecord?.id}`, {
    method: 'PATCH'
  }, { notes: 'Counselor reviewed submission' }, null, true);
  assert(rUpdateNotes.status === 200 || rUpdateNotes.status === 204, 'Legitimate editable CRM fields (notes) updated successfully');

  // --- SECTION 8: Application-Number Concurrency Test ---
  console.log('\n--- 8. Application-Number Concurrency Test ---');

  const concurrentCalls = 5;
  const counterPromises = [];
  for (let i = 0; i < concurrentCalls; i++) {
    counterPromises.push(
      request('/rest/v1/rpc/get_next_application_number', { method: 'POST' }, {
        p_tenant_id: TARGET_TENANT_ID
      }, null, true)
    );
  }
  const concurrentResults = await Promise.all(counterPromises);
  const allocatedNumbers = concurrentResults.map(r => r.body);
  const uniqueNumbers = new Set(allocatedNumbers);

  assert(
    concurrentResults.every(r => r.status === 200),
    `All ${concurrentCalls} concurrent allocations returned HTTP 200`
  );
  assert(
    uniqueNumbers.size === concurrentCalls,
    `Zero duplicate numbers across concurrent calls (${uniqueNumbers.size}/${concurrentCalls} unique): ` + Array.from(uniqueNumbers).join(', ')
  );

  // --- SECTION 9: Academic Conversion Governance & Authorization ---
  console.log('\n--- 9. Academic Conversion Governance & Authorization ---');

  // 1. Conversion pre-condition: rejected if status is NEW (not MATCHED or QUALIFIED)
  const rConvertPremature = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: appRecord?.id,
    p_options: {}
  }, adminToken, false);
  assert(
    rConvertPremature.status === 400 && (rConvertPremature.body?.message || '').includes('INVALID_STATUS_FOR_CONVERSION'),
    'Premature conversion rejected when status is not MATCHED or QUALIFIED: ' + (rConvertPremature.body?.message || '')
  );

  // 2. Advance status to QUALIFIED
  const rQualify = await request(`/rest/v1/crm_intake_applications?id=eq.${appRecord?.id}`, {
    method: 'PATCH'
  }, { status: 'QUALIFIED' }, null, true);
  assert(rQualify.status === 200 || rQualify.status === 204, 'Application status advanced to QUALIFIED for conversion');

  // 3. Test Student Profile Conversion (without cohort)
  console.log('  Testing Student Profile Conversion (p_options: {})...');
  const rConvertStudentOnly = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: appRecord?.id,
    p_options: {}
  }, adminToken, false);

  assert(
    rConvertStudentOnly.status === 200 && rConvertStudentOnly.body?.success === true,
    'Student profile conversion succeeds (HTTP 200)'
  );
  assert(
    rConvertStudentOnly.body?.status === 'CONVERTED',
    'Conversion returns status: CONVERTED'
  );
  assert(
    typeof rConvertStudentOnly.body?.student_number === 'string' && rConvertStudentOnly.body.student_number.startsWith('STU-'),
    'Authoritative student number allocated: ' + rConvertStudentOnly.body?.student_number
  );
  assert(
    typeof rConvertStudentOnly.body?.student_id === 'string' && rConvertStudentOnly.body.student_id.startsWith('stu_') && rConvertStudentOnly.body.student_id.length > 20,
    'Authoritative student ID uses CSPRNG format: ' + rConvertStudentOnly.body?.student_id
  );

  const createdStudentId = rConvertStudentOnly.body?.student_id;

  // Verify Student Profile Created in public.students
  const rFetchStudent = await request(`/rest/v1/students?id=eq.${createdStudentId}&select=*`, {}, null, null, true);
  assert(rFetchStudent.status === 200 && rFetchStudent.body?.length === 1, 'Authoritative student profile created in public.students');

  // Verify Application Status is CONVERTED and Linked to Student
  const rFetchAppConverted = await request(`/rest/v1/crm_intake_applications?id=eq.${appRecord?.id}&select=status,matched_student_id,enrolment_id`, {}, null, null, true);
  assert(rFetchAppConverted.body?.[0]?.status === 'CONVERTED', 'Database application record status is CONVERTED');
  assert(rFetchAppConverted.body?.[0]?.matched_student_id === createdStudentId, 'Application linked to created student ID');

  // Verify Database Audit Log on Conversion
  const rAuditConvert = await request(`/rest/v1/finance_audit_log?entity_id=eq.${appRecord?.id}&action=eq.APPLICATION_CONVERTED&select=*`, {}, null, null, true);
  assert(rAuditConvert.status === 200 && rAuditConvert.body?.length === 1, 'Authoritative APPLICATION_CONVERTED event logged in finance_audit_log');
  assert(rAuditConvert.body?.[0]?.actor_role === 'SUPER_ADMIN', 'Audit log records actor_role: SUPER_ADMIN');

  // 4. Duplicate conversion rejected
  const rConvertDuplicate = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: appRecord?.id
  }, adminToken, false);
  assert(
    rConvertDuplicate.status === 400 && (rConvertDuplicate.body?.message || '').includes('ALREADY_CONVERTED'),
    'Duplicate conversion strictly rejected with ALREADY_CONVERTED'
  );

  // 5. Test Cohort Enrolment Conversion (FUNC-16: End-to-End Governance & Denormalized Integrity)
  console.log('  Testing Cohort Enrolment Conversion (Gate 68 / FUNC-16)...');
  const testSubCohortId = 'smoke_sub_cohort_' + testTimestamp;
  await request('/rest/v1/rpc/submit_applicant_intake', { method: 'POST' }, {
    p_source: 'WEB_INTAKE',
    p_source_submission_id: testSubCohortId,
    p_first_name: 'PHASE51_COHORT',
    p_last_name: 'TEST',
    p_email: `cohort.test.${testTimestamp}@clasptek.org`,
    p_phone: '+2348055443322',
    p_programme_id: testProgId,
    p_agreed_tuition_fee: publicClaimedFee,
    p_consent_acknowledged: true
  }, null, false);

  const rFetchApp2 = await request(`/rest/v1/crm_intake_applications?source_submission_id=eq.${testSubCohortId}&select=*`, {}, null, null, true);
  const app2 = rFetchApp2.body?.[0];

  await request(`/rest/v1/crm_intake_applications?id=eq.${app2?.id}`, { method: 'PATCH' }, { status: 'QUALIFIED' }, null, true);

  const rConvertWithCohort = await request('/rest/v1/rpc/convert_intake_application', { method: 'POST' }, {
    p_application_id: app2?.id,
    p_options: { cohort_id: testCohortId }
  }, adminToken, false);

  // Evaluate All FUNC-16 Acceptance Criteria into Gate 68
  let func16Success = false;
  let func16FailureDetail = null;

  if (rConvertWithCohort.status === 200 && rConvertWithCohort.body?.success === true && rConvertWithCohort.body?.enrolment_id) {
    const enrId = rConvertWithCohort.body.enrolment_id;
    const rFetchEnr2 = await request(`/rest/v1/enrolments?id=eq.${enrId}&select=*`, {}, null, null, true);
    const enrRecord2 = rFetchEnr2.body?.[0];

    const hasStatusConverted = rConvertWithCohort.body?.status === 'CONVERTED';
    const hasStudentNumber = typeof rConvertWithCohort.body?.student_number === 'string' && rConvertWithCohort.body.student_number.startsWith('STU-');
    const hasEnrolmentNumber = typeof rConvertWithCohort.body?.enrolment_number === 'string' && rConvertWithCohort.body.enrolment_number.startsWith('ENR-');
    const hasCsprngId = typeof enrId === 'string' && enrId.startsWith('enr_') && enrId.length > 20;
    const hasDbEnrolment = rFetchEnr2.status === 200 && rFetchEnr2.body?.length === 1;
    const hasCatalogueTuition = enrRecord2 && Number(enrRecord2.agreed_tuition_fee) === catalogueTuitionFee;
    const hasStudentName = enrRecord2 && enrRecord2.student_name === 'PHASE51_COHORT TEST';
    const hasStudentEmail = enrRecord2 && enrRecord2.student_email === `cohort.test.${testTimestamp}@clasptek.org`;
    const hasStudentPhone = enrRecord2 && enrRecord2.student_phone === '+2348055443322';
    const hasActiveStatus = enrRecord2 && enrRecord2.status === 'ACTIVE';

    if (hasStatusConverted && hasStudentNumber && hasEnrolmentNumber && hasCsprngId && hasDbEnrolment &&
        hasCatalogueTuition && hasStudentName && hasStudentEmail && hasStudentPhone && hasActiveStatus) {
      func16Success = true;
    } else {
      func16FailureDetail = `Enrolment fields mismatch: statusConverted=${hasStatusConverted}, studentNo=${hasStudentNumber}, enrolmentNo=${hasEnrolmentNumber}, dbRecord=${hasDbEnrolment}, tuition=${enrRecord2?.agreed_tuition_fee}, studentName=${enrRecord2?.student_name}, email=${enrRecord2?.student_email}`;
    }
  } else {
    func16FailureDetail = rConvertWithCohort.body?.message || JSON.stringify(rConvertWithCohort.body);
  }

  assert(
    func16Success,
    'Cohort enrolment conversion (FUNC-16): Authoritative enrolment created with catalogue tuition and denormalized applicant fields',
    `FUNC-16 failed: ${func16FailureDetail}`
  );

  // --- SECTION 10: Zero-Exam Model Verification ---
  console.log('\n--- 10. Zero-Exam Model Verification ---');

  const examTables = ['exams', 'examinations', 'assessments', 'quizzes', 'grades', 'scores', 'test_results'];
  for (const table of examTables) {
    const rExam = await request(`/rest/v1/${table}?select=count&limit=1`, {}, null, null, true);
    assert(rExam.status === 404, `Zero-Exam model verified: '${table}' does not exist (HTTP ${rExam.status})`);
  }

  // --- SECTION 11: Controlled Cleanup & Production Reconciliation ---
  console.log('\n--- 11. Controlled Test Data Cleanup & Reconciliation ---');

  // Delete synthetic business records
  if (rConvertWithCohort.body?.enrolment_id) {
    await request(`/rest/v1/enrolments?id=eq.${rConvertWithCohort.body.enrolment_id}`, { method: 'DELETE' }, null, null, true);
  }
  if (rConvertWithCohort.body?.student_id) {
    await request(`/rest/v1/students?id=eq.${rConvertWithCohort.body.student_id}`, { method: 'DELETE' }, null, null, true);
  }
  if (createdStudentId) {
    const rDelStudent = await request(`/rest/v1/students?id=eq.${createdStudentId}`, { method: 'DELETE' }, null, null, true);
    assert(rDelStudent.status === 200 || rDelStudent.status === 204, 'Synthetic test student profile cleanly removed');
  }
  if (testCohortId) {
    const rDelCohort = await request(`/rest/v1/cohorts?id=eq.${testCohortId}`, { method: 'DELETE' }, null, null, true);
    assert(rDelCohort.status === 200 || rDelCohort.status === 204, 'Synthetic test cohort cleanly removed');
  }
  if (appRecord?.id) {
    const rDelApp = await request(`/rest/v1/crm_intake_applications?id=eq.${appRecord.id}`, { method: 'DELETE' }, null, null, true);
    assert(rDelApp.status === 200 || rDelApp.status === 204, 'Synthetic test application cleanly removed');
  }
  if (app2?.id) {
    await request(`/rest/v1/crm_intake_applications?id=eq.${app2.id}`, { method: 'DELETE' }, null, null, true);
  }
  if (testProgId) {
    const rDelProg = await request(`/rest/v1/programmes?id=eq.${testProgId}`, { method: 'DELETE' }, null, null, true);
    assert(rDelProg.status === 200 || rDelProg.status === 204, 'Synthetic test programme cleanly removed');
  }

  // Verify Audit Log Immutability (Attempting DELETE must fail)
  const rTamperAudit = await request(`/rest/v1/finance_audit_log?entity_id=eq.${appRecord?.id}`, { method: 'DELETE' }, null, null, true);
  assert(
    rTamperAudit.status === 400 && (rTamperAudit.body?.message || '').includes('SECURITY VIOLATION'),
    'Audit Log Immutability Confirmed: Test audit events strictly retained for evidentiary compliance'
  );

  // Post-cleanup count reconciliation
  const postCounts = {
    tenants: await getCount('tenants'),
    students: await getCount('students'),
    programmes: await getCount('programmes'),
    enrolments: await getCount('enrolments'),
    finance_settings: await getCount('finance_settings'),
    crm_intake_applications: await getCount('crm_intake_applications')
  };

  console.log('\n  Post-cleanup table counts:', JSON.stringify(postCounts));
  assert(postCounts.tenants === baselineCounts.tenants, 'Production tenants count protected: ' + postCounts.tenants);
  assert(postCounts.students === baselineCounts.students, 'Production students count restored: ' + postCounts.students);
  assert(postCounts.programmes === baselineCounts.programmes, 'Production programmes count restored: ' + postCounts.programmes);
  assert(postCounts.enrolments === baselineCounts.enrolments, 'Production enrolments count restored: ' + postCounts.enrolments);
  assert(postCounts.finance_settings === baselineCounts.finance_settings, 'Production finance_settings count protected: ' + postCounts.finance_settings);
  assert(postCounts.crm_intake_applications === baselineCounts.crm_intake_applications, 'Production crm_intake_applications count restored: ' + postCounts.crm_intake_applications);

  console.log('\n========================================================================================');
  console.log(` PRODUCTION SMOKE TEST SUMMARY: ${passed} PASSED / ${failed} FAILED / ${blocked} BLOCKED`);
  if (failureDetails.length > 0) {
    console.log(' DETECTED FAILURES:');
    failureDetails.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  }
  console.log(` AUDIT VERDICT: ${failed === 0 ? 'CERTIFIED GREEN' : 'HOLD CERTIFICATION — DEFECT DETECTED'}`);
  console.log('========================================================================================\n');

  return { passed, failed, blocked, failureDetails, postCounts, baselineCounts };
}

if (require.main === module) {
  runProductionAudit().catch(err => {
    console.error('Fatal audit execution exception:', err);
    process.exit(1);
  });
}

module.exports = { runProductionAudit };
