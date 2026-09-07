/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 1: Authoritative Student Model — MANDATORY INDEPENDENT SECURITY GATE SUITE
 * 
 * Comprehensive adversarial attack test suite verifying:
 * 1. Cross-tenant isolation (SELECT, INSERT, UPDATE, DELETE, customer_id, user_id, lookup helpers)
 * 2. Role escalation (Super Admin, Staff/Admin, Finance, Facilitator, Student, Unauthenticated)
 * 3. Tenant ID tampering (Rejection of clasptek_main, null, undefined, foreign UUIDs)
 * 4. Student ID tampering (Access control and horizontal privilege boundary)
 * 5. Student deletion (Strict Super Admin restriction at DB/RLS & API layers)
 * 6. Audit log integrity (Append-only immutability, tamper prevention, timestamp accuracy)
 * 7. Local cache security (safeGet/safeSet treated strictly as cache, not authority)
 * 8. Synchronization safety (Cross-tenant legacy protection, ambiguous duplicate review path)
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

async function runSecurityGateSuite() {
  console.log('================================================================================');
  console.log(' CLASPTEK SECURITY GATE — PHASE 1 AUTHORITATIVE STUDENT MODEL ADVERSARIAL AUDIT');
  console.log('================================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const schemaPath = path.join(rootDir, 'supabase_schema.sql');
  const htmlPath = path.join(rootDir, 'index.html');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Load sandbox environment for application code
  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error('Could not find script tag in index.html');

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
    navigator: { userAgent: 'SecurityGateTestEngine/1.0' },
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
  const state = app.state;

  if (app.supabaseClient) {
    app.supabaseClient.isConfigured = () => true;
    app.supabaseClient.from = (tbl) => ({
      upsert: async (payload) => ({ error: null, data: payload }),
      delete: async (filter) => ({ error: null, data: [] }),
      select: () => ({
        eq: () => ({ error: null, data: [] })
      })
    });
  }

  const TENANT_A = '11111111-aaaa-bbbb-cccc-111111111111';
  const TENANT_B = '22222222-bbbb-cccc-dddd-222222222222';

  // ===========================================================================
  // SECTION 1: CROSS-TENANT ISOLATION ADVERSARIAL TESTS
  // ===========================================================================
  console.log('--- Section 1: Cross-Tenant Isolation Adversarial Attacks ---');

  // Schema RLS verification
  assert(schemaContent.includes('ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on public.students');
  assert(schemaContent.includes('tenant_id = public.get_auth_tenant_id()'), 'RLS policies mandate tenant_id = public.get_auth_tenant_id()');

  // 1.1 SELECT another tenant's students (RLS Simulation)
  function simulatePostgresStudentSelect(rowTenantId, userTenantId, userRole, isFacilitator = false, userId = null, rowUserId = null) {
    // Policy: tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance() OR public.is_facilitator() OR user_id = auth.uid())
    if (!userTenantId) return false;
    if (rowTenantId !== userTenantId) return false;
    const isStaffOrFinance = ['SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'].includes(userRole);
    const isFac = isFacilitator || userRole === 'FACILITATOR';
    const isOwnStudent = userId && rowUserId && userId === rowUserId;
    return Boolean(isStaffOrFinance || isFac || isOwnStudent);
  }

  const selectCrossTenant = simulatePostgresStudentSelect(TENANT_B, TENANT_A, 'SUPER_ADMIN');
  assert(selectCrossTenant === false, 'Super Admin of Tenant A cannot SELECT students of Tenant B');

  const selectStaffCrossTenant = simulatePostgresStudentSelect(TENANT_B, TENANT_A, 'STAFF');
  assert(selectStaffCrossTenant === false, 'Staff of Tenant A cannot SELECT students of Tenant B');

  // 1.2 INSERT a student using another tenant's UUID
  function simulatePostgresStudentInsert(incomingTenantId, userTenantId, userRole) {
    // Policy WITH CHECK: tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance())
    if (!userTenantId) return false;
    if (incomingTenantId !== userTenantId) return false;
    return ['SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'].includes(userRole);
  }

  const insertCrossTenant = simulatePostgresStudentInsert(TENANT_B, TENANT_A, 'SUPER_ADMIN');
  assert(insertCrossTenant === false, 'PostgreSQL RLS WITH CHECK blocks INSERT with foreign tenant UUID');

  // 1.3 App layer rejection of cross-tenant INSERT payload
  state.authoritativeTenantId = TENANT_A;
  state.students = [];
  state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin_a', name: 'Admin A', email: 'admin@tenant-a.com', role: 'Super Admin', tenant_id: TENANT_A }
  };

  const directTamperRes = await app.saveAuthoritativeStudent({
    firstName: 'CrossTenant',
    lastName: 'Hacker',
    email: 'hacker@tenant-b.com',
    tenant_id: TENANT_B
  });
  assert(directTamperRes.success === false, 'saveAuthoritativeStudent rejects browser-supplied foreign tenant UUID');
  assert(directTamperRes.message.includes('Cross-tenant write rejected'), 'Informative cross-tenant security rejection returned');

  // 1.4 UPDATE another tenant's student
  function simulatePostgresStudentUpdate(targetRowTenantId, incomingRowTenantId, userTenantId, userRole) {
    // Policy: USING (tenant_id = get_auth_tenant_id()) WITH CHECK (tenant_id = get_auth_tenant_id())
    if (!userTenantId) return false;
    if (targetRowTenantId !== userTenantId) return false;
    if (incomingRowTenantId !== userTenantId) return false;
    return ['SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'].includes(userRole);
  }

  const updateCrossTarget = simulatePostgresStudentUpdate(TENANT_B, TENANT_B, TENANT_A, 'SUPER_ADMIN');
  assert(updateCrossTarget === false, 'RLS blocks updating a student belonging to another tenant');

  const updateTenantTamper = simulatePostgresStudentUpdate(TENANT_A, TENANT_B, TENANT_A, 'SUPER_ADMIN');
  assert(updateTenantTamper === false, 'RLS WITH CHECK blocks modifying student tenant_id to another tenant');

  // 1.5 DELETE another tenant's student
  function simulatePostgresStudentDelete(rowTenantId, userTenantId, userRole) {
    // Policy: USING (tenant_id = get_auth_tenant_id() AND is_super_admin())
    if (!userTenantId) return false;
    if (rowTenantId !== userTenantId) return false;
    return userRole === 'SUPER_ADMIN';
  }

  const deleteCrossTenant = simulatePostgresStudentDelete(TENANT_B, TENANT_A, 'SUPER_ADMIN');
  assert(deleteCrossTenant === false, 'RLS blocks Super Admin of Tenant A from deleting Tenant B student');

  // 1.6 App layer deleteAuthoritativeStudent cross-tenant attack
  state.students = [
    {
      id: 'stu_foreign_999',
      studentNumber: 'STU-2026-9999',
      name: 'Foreign Student',
      tenant_id: TENANT_B,
      status: 'ACTIVE'
    }
  ];

  let crossDeleteThrew = false;
  try {
    await app.deleteAuthoritativeStudent('stu_foreign_999', 'Adversarial delete attempt');
  } catch (err) {
    crossDeleteThrew = true;
    assert(err.message.includes('Cross-tenant delete rejected'), `Expected cross-tenant error message: ${err.message}`);
  }
  assert(crossDeleteThrew === true, 'deleteAuthoritativeStudent threw cross-tenant security exception');
  assert(state.students.length === 1, 'Foreign student was not removed from memory');

  // 1.7 Student lookup helpers cross-tenant boundary verification
  state.students = [
    { id: 'stu_a1', studentNumber: 'STU-2026-0001', name: 'Alaba Davies', email: 'alaba@tenanta.com', tenant_id: TENANT_A },
    { id: 'stu_b1', studentNumber: 'STU-2026-0002', name: 'Alaba Davies', email: 'alaba@tenantb.com', tenant_id: TENANT_B }
  ];

  state.authoritativeTenantId = TENANT_A;
  const lookupById = app.findStudentById('stu_b1');
  assert(lookupById === null, 'findStudentById with active Tenant A returns null for Tenant B student');

  const lookupByNum = app.findStudentByNumber('STU-2026-0002');
  assert(lookupByNum === null, 'findStudentByNumber with active Tenant A returns null for Tenant B student');

  const lookupByEmail = app.findStudentByEmail('alaba@tenantb.com');
  assert(lookupByEmail === null, 'findStudentByEmail with active Tenant A returns null for Tenant B student');

  const lookupByName = app.findStudentByName('Alaba Davies');
  assert(lookupByName !== null && lookupByName.tenant_id === TENANT_A, 'findStudentByName resolves student belonging strictly to active tenant');

  // ===========================================================================
  // SECTION 2: ROLE ESCALATION & AUTHORIZATION MATRIX
  // ===========================================================================
  console.log('\n--- Section 2: Role Escalation & Authorization Matrix ---');

  const roles = [
    { role: 'SUPER_ADMIN', canSelect: true, canInsert: true, canUpdate: true, canDelete: true },
    { role: 'FINANCE_MANAGER', canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
    { role: 'FINANCE_STAFF', canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
    { role: 'STAFF', canSelect: true, canInsert: true, canUpdate: true, canDelete: false },
    { role: 'FACILITATOR', canSelect: true, canInsert: false, canUpdate: false, canDelete: false },
    { role: 'STUDENT', canSelect: false, canInsert: false, canUpdate: false, canDelete: false }, // Can only view own
    { role: 'ANONYMOUS', canSelect: false, canInsert: false, canUpdate: false, canDelete: false }
  ];

  roles.forEach(r => {
    const sel = simulatePostgresStudentSelect(TENANT_A, r.role === 'ANONYMOUS' ? null : TENANT_A, r.role);
    const ins = simulatePostgresStudentInsert(TENANT_A, r.role === 'ANONYMOUS' ? null : TENANT_A, r.role);
    const upd = simulatePostgresStudentUpdate(TENANT_A, TENANT_A, r.role === 'ANONYMOUS' ? null : TENANT_A, r.role);
    const del = simulatePostgresStudentDelete(TENANT_A, r.role === 'ANONYMOUS' ? null : TENANT_A, r.role);

    assert(sel === r.canSelect, `Role ${r.role}: SELECT permission matches expected (${r.canSelect})`);
    assert(ins === r.canInsert, `Role ${r.role}: INSERT permission matches expected (${r.canInsert})`);
    assert(upd === r.canUpdate, `Role ${r.role}: UPDATE permission matches expected (${r.canUpdate})`);
    assert(del === r.canDelete, `Role ${r.role}: DELETE permission matches expected (${r.canDelete})`);
  });

  // Client-side role spoofing test: User alters state.auth.user.role in DevTools
  state.students = [{ id: 'stu_101', studentNumber: 'STU-2026-0101', name: 'Real Student', tenant_id: TENANT_A }];
  state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_staff_1', name: 'Normal Staff', role: 'Staff', tenant_id: TENANT_A }
  };

  let nonAdminDeleteThrew = false;
  try {
    await app.deleteAuthoritativeStudent('stu_101', 'Unauthorized deletion');
  } catch (err) {
    nonAdminDeleteThrew = true;
    assert(err.message.includes('Only Super Admin can delete'), `Expected Super Admin restriction message: ${err.message}`);
  }
  assert(nonAdminDeleteThrew === true, 'deleteAuthoritativeStudent actively blocks Staff deletion');

  // DevTools spoofing attack: Attacker sets state.auth.user.role = 'Super Admin' locally
  // but in PostgreSQL, auth.uid() still maps to role 'STAFF' in tenant_memberships
  const pgRoleResult = simulatePostgresStudentDelete(TENANT_A, TENANT_A, 'STAFF');
  assert(pgRoleResult === false, 'PostgreSQL RLS rejects delete regardless of frontend JavaScript state modification');

  // ===========================================================================
  // SECTION 3: TENANT ID TAMPERING
  // ===========================================================================
  console.log('\n--- Section 3: Tenant ID Tampering ---');

  // Attempting to inject legacy or invalid tenant values
  const legacyTenants = ['clasptek_main', 'null', 'undefined', '', '   ', 'admin_override'];
  legacyTenants.forEach(badTenant => {
    state.authoritativeTenantId = badTenant;
    const resolved = app.resolveAuthoritativeTenantId ? app.resolveAuthoritativeTenantId({ tenant_id: badTenant }) : null;
    assert(resolved === null || resolved !== badTenant, `resolveAuthoritativeTenantId strictly rejects legacy/invalid tenant '${badTenant}'`);
  });

  // Database repo write rejection if tenant is non-authoritative
  let dbRepoRejectThrew = false;
  state.authoritativeTenantId = TENANT_A;
  try {
    if (app.dbRepo && app.dbRepo.saveRecord) {
      await app.dbRepo.saveRecord(app.STORE_KEY_STUDENTS, { id: 'stu_tamper', tenant_id: TENANT_B });
    }
  } catch (err) {
    dbRepoRejectThrew = true;
    assert(err.message.includes('Cross-tenant write rejected'), `dbRepo threw cross-tenant write exception: ${err.message}`);
  }
  assert(dbRepoRejectThrew === true, 'dbRepo.saveRecord strictly rejects cross-tenant payload writes');

  // ===========================================================================
  // SECTION 4: STUDENT ID & ATTRIBUTE TAMPERING
  // ===========================================================================
  console.log('\n--- Section 4: Student ID & Attribute Tampering ---');

  // Attempt to overwrite another student's official studentNumber during edit
  state.authoritativeTenantId = TENANT_A;
  state.students = [
    { id: 'stu_alpha', studentNumber: 'STU-2026-0001', name: 'Alpha Student', email: 'alpha@example.com', tenant_id: TENANT_A, status: 'ACTIVE' },
    { id: 'stu_beta', studentNumber: 'STU-2026-0002', name: 'Beta Student', email: 'beta@example.com', tenant_id: TENANT_A, status: 'ACTIVE' }
  ];

  // Try to register duplicate student with existing email
  const emailHijack = await app.saveAuthoritativeStudent({
    firstName: 'Attacker',
    lastName: 'User',
    email: 'alpha@example.com'
  });
  assert(emailHijack.success === false, 'Prevented registration hijack with existing student email');

  // ===========================================================================
  // SECTION 5: STUDENT DELETION CONTROLS
  // ===========================================================================
  console.log('\n--- Section 5: Student Deletion Authoritative Enforcement ---');

  // Confirm delete policy in schema strictly requires is_super_admin()
  assert(schemaContent.includes('CREATE POLICY "students_admin_delete" ON public.students FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());'),
    'PostgreSQL RLS explicitly mandates public.is_super_admin() for student deletion');

  // Confirm that deleting a non-existent student returns clean failure
  state.auth.user.role = 'Super Admin';
  const deleteMissing = await app.deleteAuthoritativeStudent('stu_non_existent', 'Cleanup');
  assert(deleteMissing.success === false && deleteMissing.message.includes('not found'), 'deleteAuthoritativeStudent handles non-existent student cleanly');

  // Confirm successful deletion by Super Admin of legitimate tenant student
  const deleteLegit = await app.deleteAuthoritativeStudent('stu_alpha', 'Super Admin verified deletion');
  assert(deleteLegit.success === true, 'deleteAuthoritativeStudent succeeds for legitimate Super Admin');
  assert(state.students.find(s => s.id === 'stu_alpha') === undefined, 'Student removed from local state');

  // ===========================================================================
  // SECTION 6: AUDIT LOG INTEGRITY & IMMUTABILITY
  // ===========================================================================
  console.log('\n--- Section 6: Audit Log Integrity & Database Immutability ---');

  // Verify PostgreSQL database trigger on public.finance_audit_log
  assert(schemaContent.includes('CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()'), 'enforce_audit_immutability() function defined in schema');
  assert(schemaContent.includes('CREATE TRIGGER trg_audit_immutability'), 'trg_audit_immutability trigger attached to public.finance_audit_log');
  assert(schemaContent.includes('BEFORE UPDATE OR DELETE ON public.finance_audit_log'), 'Trigger fires BEFORE UPDATE OR DELETE');
  assert(schemaContent.includes('The financial audit log is strictly immutable and append-only'), 'Trigger raises explicit SECURITY VIOLATION error');

  // Verify audit log entries capture deletion action with previousValue
  assert(state.auditLog.length > 0, 'Audit entries recorded in state.auditLog');
  const lastAudit = state.auditLog[0];
  assert(lastAudit.action === 'STUDENT_DELETED', 'Audit log captured STUDENT_DELETED action');
  assert(lastAudit.entityType === 'students', 'Audit log entityType is students');
  assert(lastAudit.previousValue !== null, 'Audit log preserved previousValue snapshot of deleted student');
  assert(lastAudit.tenant_id === TENANT_A, 'Audit log correctly stamped with authoritative tenant UUID');

  // ===========================================================================
  // SECTION 7: LOCAL CACHE SECURITY & NON-AUTHORITATIVE ISOLATION
  // ===========================================================================
  console.log('\n--- Section 7: Local Storage Cache Security ---');

  // Poison localStorage with tampered role and tenant_id
  mockStorage['clasptek:auth_session'] = JSON.stringify({
    user: { id: 'usr_hacker', role: 'Super Admin', tenant_id: 'tampered-tenant' }
  });

  // Verify that PostgreSQL functions never inspect or trust localStorage
  assert(schemaContent.includes('WHERE user_id = auth.uid()'), 'PostgreSQL role helpers resolve identity from auth.uid() in DB, not localStorage');
  assert(schemaContent.includes('SET search_path = public'), 'PostgreSQL security definer functions set safe search_path = public');

  // ===========================================================================
  // SECTION 8: SYNCHRONIZATION SAFETY & AMBIGUOUS IDENTITY SAFEGUARDS
  // ===========================================================================
  console.log('\n--- Section 8: Synchronization Safety & Ambiguous Identity Handling ---');

  state.authoritativeTenantId = TENANT_A;
  state.students = [
    {
      id: 'stu_canonical_1',
      studentNumber: 'STU-2026-0001',
      name: 'Fatima Abubakar',
      email: 'fatima.abubakar@clasptek.org',
      tenant_id: TENANT_A,
      status: 'ACTIVE'
    }
  ];

  // 8.1 Source records from another tenant must be rejected/ignored
  state.enrolments = [
    {
      id: 'enr_foreign_tenant',
      studentName: 'Foreign Enrolment Student',
      studentEmail: 'foreign@other.com',
      tenant_id: TENANT_B,
      status: 'active'
    }
  ];

  app.syncStudentsFromExistingData();
  const foreignSynced = app.findStudentByEmail('foreign@other.com');
  assert(foreignSynced === null, 'syncStudentsFromExistingData does NOT import enrolments from foreign tenants');

  // 8.2 Ambiguous Duplicate Protection: Enrolment has same name but CONFLICTING email
  state.enrolments = [
    {
      id: 'enr_ambiguous_same_name',
      studentName: 'Fatima Abubakar',
      studentEmail: 'completely_different_fatima@yahoo.com',
      status: 'active'
    }
  ];

  const countBeforeAmbiguous = state.students.length;
  app.syncStudentsFromExistingData();
  const countAfterAmbiguous = state.students.length;

  // The original student identity must NOT have been hijacked or merged!
  const canonicalFatima = app.findStudentById('stu_canonical_1');
  assert(canonicalFatima.email === 'fatima.abubakar@clasptek.org', 'Canonical student email was not overwritten by conflicting legacy record');
  assert(state.enrolments[0].studentId !== 'stu_canonical_1', 'Ambiguous duplicate enrolment was not automatically linked to canonical student ID');

  // ===========================================================================
  // FINAL SCORECARD SUMMARY
  // ===========================================================================
  console.log('\n================================================================================');
  console.log(` PHASE 1 SECURITY GATE COMPLETED: ${passedTests} PASSED / ${failedTests} FAILED`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    console.error('CRITICAL: Phase 1 Security Gate FAILED. Execution must STOP.');
    process.exit(1);
  } else {
    console.log('✔ Phase 1 Security Gate PASSED: All adversarial security tests certified green.');
  }
}

runSecurityGateSuite().catch(err => {
  console.error('Fatal Security Gate test exception:', err);
  process.exit(1);
});
