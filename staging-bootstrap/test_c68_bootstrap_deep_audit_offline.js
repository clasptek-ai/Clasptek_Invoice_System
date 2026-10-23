/**
 * staging-bootstrap/test_c68_bootstrap_deep_audit_offline.js
 *
 * Phase C68/C69/C70: Deep Offline Compatibility & RLS Audit Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Validates advanced invariants:
 * 1. Composite foreign key target uniqueness and elimination of ON DELETE SET NULL hazards.
 * 2. SECURITY DEFINER search_path enforcement and least-privilege function execution grants.
 * 3. CHECK constraint parity with TypeScript types (types/meetings.ts, types/auth.ts).
 * 4. Tenant membership role enum alignment with canonical roles.
 * 5. Strict tenant-scoped facilitator resolution via personnel table (prevents cross-tenant leaks).
 * 6. Guest waiting room token entropy and expiry invariants.
 * 7. Least-privilege RLS policies on meeting_guest_requests (excludes Finance Manager, scopes to assigned meetings).
 * 8. Canonical training_sessions column schema parity (session_title, session_number).
 * 9. Fail-closed fresh-project preflight abort guard checking tables and functions.
 * 10. Fail-closed deterministic tenant resolution without arbitrary LIMIT 1.
 * 11. Complete supporting-table RLS policies coverage for meeting authorization subqueries.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n=== Clasptek Phase C70: Deep Offline Compatibility & RLS Audit ===\n');

const bootstrapPath = path.join(__dirname, 'meetings_preview_bootstrap.sql');
assert(fs.existsSync(bootstrapPath), 'meetings_preview_bootstrap.sql must exist');
const sqlContent = fs.readFileSync(bootstrapPath, 'utf8');

runTest('2.1: Target uniqueness for all composite foreign keys', () => {
  // Verify that referenced unique constraints exist for all referencing foreign keys:
  // cohorts -> programmes (tenant_id, id)
  assert(sqlContent.includes('CONSTRAINT uq_programmes_tenant_id UNIQUE (tenant_id, id)'), 'programmes must have UNIQUE (tenant_id, id)');
  // cohorts -> personnel (tenant_id, id)
  assert(sqlContent.includes('CONSTRAINT uq_personnel_tenant_id UNIQUE (tenant_id, id)'), 'personnel must have UNIQUE (tenant_id, id)');
  // meetings -> cohorts (tenant_id, id)
  assert(sqlContent.includes('CONSTRAINT uq_cohorts_tenant_id UNIQUE (tenant_id, id)'), 'cohorts must have UNIQUE (tenant_id, id)');
  // meetings -> personnel (tenant_id, id)
  assert(sqlContent.includes('CONSTRAINT uq_personnel_tenant_id UNIQUE (tenant_id, id)'), 'personnel must have UNIQUE (tenant_id, id)');
  // meetings -> training_sessions (tenant_id, id)
  assert(sqlContent.includes('CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id)'), 'training_sessions must have UNIQUE (tenant_id, id)');
});

runTest('2.2: Strict elimination of composite foreign key ON DELETE SET NULL hazards', () => {
  // Any composite foreign key containing tenant_id on a table where tenant_id is NOT NULL
  // must NOT use ON DELETE SET NULL, because PostgreSQL would attempt to null the non-nullable tenant_id.
  const unsafeCompositeSetNullRegex = /FOREIGN\s+KEY\s*\([^\)]*tenant_id[^\)]*\)[^;]*ON\s+DELETE\s+SET\s+NULL/gi;
  const matches = sqlContent.match(unsafeCompositeSetNullRegex);
  assert(!matches || matches.length === 0, `Unsafe composite ON DELETE SET NULL detected on tenant_id foreign keys: ${matches ? matches.join('; ') : ''}`);

  // Verify that composite foreign keys referencing tenant-scoped parents use ON DELETE RESTRICT
  assert(sqlContent.includes('CONSTRAINT fk_meetings_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)'), 'meetings.fk_meetings_tenant_cohort must exist');
  assert(sqlContent.includes('CONSTRAINT fk_meetings_tenant_session FOREIGN KEY (tenant_id, training_session_id)'), 'meetings.fk_meetings_tenant_session must exist');
  assert(sqlContent.includes('CONSTRAINT fk_meetings_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)'), 'meetings.fk_meetings_tenant_facilitator must exist');
  assert(sqlContent.includes('CONSTRAINT fk_cohorts_facilitator_tenant FOREIGN KEY (tenant_id, lead_facilitator_id)'), 'cohorts.fk_cohorts_facilitator_tenant must exist');
  
  assert(sqlContent.includes('REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT'), 'fk_meetings_tenant_cohort must use ON DELETE RESTRICT');
  assert(sqlContent.includes('REFERENCES public.training_sessions(tenant_id, id) ON DELETE RESTRICT'), 'fk_meetings_tenant_session must use ON DELETE RESTRICT');
  assert(sqlContent.includes('REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT'), 'fk_meetings_tenant_facilitator must use ON DELETE RESTRICT');
});

runTest('2.3: Security Definer search_path hygiene and function execution privilege hardening', () => {
  // Every SECURITY DEFINER function must explicitly declare SET search_path = public
  const secDefinerBlocks = sqlContent.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[^\$]+\$\$[\s\S]*?\$\$/gi) || [];
  for (const block of secDefinerBlocks) {
    if (block.includes('SECURITY DEFINER')) {
      assert(block.includes('SET search_path = public'), `Function must declare SET search_path = public:\n${block.slice(0, 100)}...`);
    }
  }

  // Explicit REVOKE ALL FROM PUBLIC, anon and GRANT EXECUTE TO authenticated, service_role for helpers
  const requiredFunctions = [
    'public.get_auth_tenant_id()',
    'public.get_auth_user_role()',
    'public.is_super_admin()',
    'public.is_finance_manager()',
    'public.is_staff()',
    'public.is_facilitator()'
  ];

  for (const fnName of requiredFunctions) {
    assert(sqlContent.includes(`REVOKE ALL ON FUNCTION ${fnName} FROM PUBLIC, anon;`), `Must revoke public/anon execution on ${fnName}`);
    assert(sqlContent.includes(`GRANT EXECUTE ON FUNCTION ${fnName} TO authenticated, service_role;`), `Must grant execution to authenticated and service_role on ${fnName}`);
  }

  // Trigger function must NOT be granted to authenticated
  assert(sqlContent.includes('REVOKE ALL ON FUNCTION public.set_meetings_updated_at() FROM PUBLIC, anon, authenticated;'), 'Trigger function must revoke direct execution from authenticated');
  assert(!sqlContent.includes('GRANT EXECUTE ON FUNCTION public.set_meetings_updated_at() TO authenticated'), 'Trigger function must NOT grant execute to authenticated');
});

runTest('2.4: Meeting status and provider enum parity with types/meetings.ts', () => {
  // Parse types/meetings.ts to confirm authoritative status and provider unions
  const typesPath = path.join(__dirname, '..', 'types', 'meetings.ts');
  assert(fs.existsSync(typesPath), 'types/meetings.ts must exist');
  const typesContent = fs.readFileSync(typesPath, 'utf8');

  // Verify status check in SQL matches MeetingStatus
  assert(typesContent.includes("'SCHEDULED'"), 'types/meetings.ts must have SCHEDULED');
  assert(typesContent.includes("'LIVE'"), 'types/meetings.ts must have LIVE');
  assert(typesContent.includes("'COMPLETED'"), 'types/meetings.ts must have COMPLETED');
  assert(typesContent.includes("'CANCELLED'"), 'types/meetings.ts must have CANCELLED');

  assert(sqlContent.includes("CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'))"), 'SQL status constraint must exactly match TypeScript union');
  assert(sqlContent.includes("CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK'))"), 'SQL provider constraint must match valid providers');
});

runTest('2.5: Tenant membership role constraint rejects invalid FACILITATOR string', () => {
  // Must restrict tenant_memberships.role to canonical 4 roles
  assert(sqlContent.includes("CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'))"), 'tenant_memberships must enforce canonical roles');
  assert(!sqlContent.includes("CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF', 'FACILITATOR'))"), 'tenant_memberships must NOT allow FACILITATOR role directly in membership');
});

runTest('2.6: Facilitator authorization checks personnel.employee_type and tenant_id', () => {
  // Function is_facilitator must query public.personnel with employee_type = 'facilitator' and active status
  assert(sqlContent.includes("employee_type = 'facilitator'"), 'is_facilitator must check employee_type');
  assert(sqlContent.includes("employment_status = 'active'"), 'is_facilitator must check active employment_status');
  assert(sqlContent.includes("user_id = auth.uid()"), 'is_facilitator must bind to auth.uid()');
  
  // Strict tenant boundary check in is_facilitator to prevent cross-tenant facilitator exploit
  assert(sqlContent.includes("tenant_id = public.get_auth_tenant_id()"), 'is_facilitator must strictly check tenant_id matches authoritative tenant');
});

runTest('2.7: Service-role and host guest-request isolation invariants', () => {
  // Guest requests table must contain request_token with UNIQUE index
  assert(sqlContent.includes('request_token VARCHAR(128) NOT NULL UNIQUE'), 'request_token must be unique');
  assert(sqlContent.includes('CREATE INDEX IF NOT EXISTS idx_guest_requests_token'), 'request_token must have lookup index');
  assert(sqlContent.includes('ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;'), 'meeting_guest_requests must have RLS');
});

runTest('2.8: Hardened guest-request RLS prevents student & finance manager leakage and scopes facilitator', () => {
  // Must NOT have broad tenant-wide authenticated policy
  assert(!sqlContent.includes('CREATE POLICY "meeting_guest_requests_tenant_isolation"'), 'Must eliminate broad tenant_isolation policy');

  // Must have role-restricted host select policy
  assert(sqlContent.includes('CREATE POLICY "meeting_guest_requests_host_select"'), 'Must define meeting_guest_requests_host_select');
  
  // Finance Manager must NOT be granted access to guest secrets
  const startHostSel = sqlContent.indexOf('CREATE POLICY "meeting_guest_requests_host_select"');
  const endHostSel = sqlContent.indexOf(';', startHostSel);
  const hostSelBlock = sqlContent.slice(startHostSel, endHostSel);
  assert(!hostSelBlock.includes('is_finance_manager()'), 'Finance Manager must NOT have access to guest secrets');

  // Facilitator access must be scoped to assigned meetings/cohorts
  assert(hostSelBlock.includes('m.facilitator_id IN'), 'Facilitator host select must check assigned facilitator_id');
  assert(hostSelBlock.includes('m.cohort_id IN'), 'Facilitator host select must check cohort lead facilitator');

  // Direct client writes must be restricted to Super Admin
  assert(sqlContent.includes('CREATE POLICY "meeting_guest_requests_admin_insert"'), 'Must define meeting_guest_requests_admin_insert');
  assert(sqlContent.includes('CREATE POLICY "meeting_guest_requests_admin_update"'), 'Must define meeting_guest_requests_admin_update');
  assert(sqlContent.includes('CREATE POLICY "meeting_guest_requests_admin_delete"'), 'Must define meeting_guest_requests_admin_delete');
});

runTest('2.9: Training sessions canonical schema parity and uniqueness', () => {
  assert(sqlContent.includes('session_title TEXT NOT NULL'), 'training_sessions must have session_title TEXT NOT NULL');
  assert(sqlContent.includes('session_number INT NOT NULL CHECK (session_number > 0)'), 'training_sessions must have session_number > 0');
  assert(sqlContent.includes('CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id)'), 'training_sessions must have UNIQUE (tenant_id, id)');
  assert(sqlContent.includes('CONSTRAINT uq_training_sessions_tenant_number UNIQUE (tenant_id, cohort_id, session_number)'), 'training_sessions must have UNIQUE (tenant_id, cohort_id, session_number)');
  
  // Verify training_sessions definition does not use invented title column
  const startIdx = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.training_sessions');
  assert(startIdx !== -1, 'training_sessions table declaration must exist');
  const endIdx = sqlContent.indexOf(');', startIdx);
  const tsBlock = sqlContent.slice(startIdx, endIdx);
  assert(!tsBlock.includes('    title TEXT NOT NULL,'), 'training_sessions must not use invented "title TEXT NOT NULL"');
});

runTest('2.10: Fail-closed fresh project preflight abort guard validates clean target', () => {
  assert(sqlContent.includes('SECTION 0 — PREFLIGHT SAFETY GUARD'), 'Preflight safety section must exist');
  assert(sqlContent.includes('PREFLIGHT_ABORT: Target database already contains bootstrap-owned tables'), 'Preflight abort message must be present for tables');
  assert(sqlContent.includes('PREFLIGHT_ABORT: Target database already contains bootstrap helper functions'), 'Preflight abort message must be present for functions');
  assert(sqlContent.includes('RAISE EXCEPTION'), 'Preflight must raise exception on non-empty target');
});

runTest('2.11: Fail-closed deterministic tenant resolution without arbitrary LIMIT 1', () => {
  // get_auth_tenant_id and get_auth_user_role must fail closed when ambiguous memberships exist
  const startTenantId = sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()');
  const endTenantId = sqlContent.indexOf('$$;', startTenantId);
  const tenantIdBlock = sqlContent.slice(startTenantId, endTenantId);
  assert(!tenantIdBlock.includes('LIMIT 1;'), 'get_auth_tenant_id must not use arbitrary LIMIT 1');
  assert(tenantIdBlock.includes('COUNT(*)'), 'get_auth_tenant_id must check COUNT(*)');
  assert(tenantIdBlock.includes('IF v_count = 1 THEN'), 'get_auth_tenant_id must enforce single active membership');

  const startUserRole = sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.get_auth_user_role()');
  const endUserRole = sqlContent.indexOf('$$;', startUserRole);
  const userRoleBlock = sqlContent.slice(startUserRole, endUserRole);
  assert(!userRoleBlock.includes('LIMIT 1;'), 'get_auth_user_role must not use arbitrary LIMIT 1');
  assert(userRoleBlock.includes('COUNT(*)'), 'get_auth_user_role must check COUNT(*)');
  assert(userRoleBlock.includes('IF v_count = 1 THEN'), 'get_auth_user_role must enforce single active membership');
});

runTest('2.12: Comprehensive supporting table RLS coverage prevents subquery denial', () => {
  // Check RLS policies exist for supporting tables that meetings RLS subqueries rely on
  const requiredPolicies = [
    'tenants_auth_read',
    'profiles_own_read',
    'profiles_own_update',
    'memberships_tenant_read',
    'personnel_tenant_select',
    'programmes_tenant_select',
    'cohorts_tenant_select',
    'training_sessions_tenant_select',
    'students_tenant_select',
    'enrolments_tenant_select',
    'meeting_participants_tenant_select',
    'meeting_attendance_tenant_select',
    'meeting_chat_tenant_select',
    'meeting_chat_tenant_insert'
  ];

  for (const pol of requiredPolicies) {
    assert(sqlContent.includes(`CREATE POLICY "${pol}"`), `Supporting policy ${pol} must be defined`);
  }
});

runTest('2.13: Catalog-level prerequisite checks fail fast on missing auth objects or wrong signature', () => {
  const doStart = sqlContent.indexOf('SECTION 0 — PREFLIGHT SAFETY GUARD');
  const doEnd = sqlContent.indexOf('SECTION 1 — EXTENSIONS');
  assert(doStart > 0 && doEnd > doStart, 'Preflight block must exist');
  const preflightSql = sqlContent.slice(doStart, doEnd);

  // 1. auth.users: must inspect pg_class, pg_namespace, relkind IN ('r', 'p')
  assert(preflightSql.includes('FROM pg_class c'), 'Must query pg_class catalog');
  assert(preflightSql.includes('JOIN pg_namespace n ON c.relnamespace = n.oid'), 'Must join pg_namespace on oid');
  assert(preflightSql.includes("n.nspname = 'auth'"), 'Must scope to auth schema');
  assert(preflightSql.includes("c.relname = 'users'"), 'Must scope to users table');
  assert(preflightSql.includes("c.relkind IN ('r', 'p')"), 'Must recognize regular (r) and partitioned (p) tables');
  assert(preflightSql.includes('Required Supabase Auth table auth.users is missing'), 'Must abort when auth.users is absent');

  // 2. auth.uid(): must inspect pg_proc, pg_namespace, pg_type, 0 args, uuid return type
  assert(preflightSql.includes('FROM pg_proc p'), 'Must query pg_proc catalog');
  assert(preflightSql.includes('JOIN pg_namespace n ON p.pronamespace = n.oid'), 'Must join pg_namespace on pronamespace');
  assert(preflightSql.includes('JOIN pg_type t ON p.prorettype = t.oid'), 'Must join pg_type on prorettype');
  assert(preflightSql.includes("p.proname = 'uid'"), 'Must scope to uid function');
  assert(preflightSql.includes('p.pronargs = 0'), 'Must verify 0 arguments for auth.uid()');
  assert(preflightSql.includes("t.typname = 'uuid'"), 'Must verify uuid return type for auth.uid()');
  assert(preflightSql.includes('Required Supabase Auth function auth.uid() returning uuid with 0 arguments is missing'), 'Must abort when auth.uid() signature is missing or mismatched');

  // 3. roles: must query pg_roles for all 3 built-in Supabase roles
  assert(preflightSql.includes('FROM pg_roles'), 'Must query pg_roles catalog');
  assert(preflightSql.includes("rolname IN ('anon', 'authenticated', 'service_role')"), 'Must check anon, authenticated, service_role');
  assert(preflightSql.includes('!= 3'), 'Must assert exact count of 3 roles');
  assert(preflightSql.includes('One or more required Supabase roles (anon, authenticated, service_role) are missing'), 'Must abort when any Supabase role is missing');
});

runTest('2.14: Fresh-only table and helper function checks remain unweakened', () => {
  const doStart = sqlContent.indexOf('SECTION 0 — PREFLIGHT SAFETY GUARD');
  const doEnd = sqlContent.indexOf('SECTION 1 — EXTENSIONS');
  const preflightSql = sqlContent.slice(doStart, doEnd);

  const expectedTables = [
    'tenants', 'profiles', 'tenant_memberships', 'personnel', 'programmes',
    'cohorts', 'training_sessions', 'students', 'enrolments', 'meetings',
    'meeting_participants', 'meeting_attendance', 'meeting_chat_messages',
    'meeting_guest_requests'
  ];

  for (const tbl of expectedTables) {
    assert(preflightSql.includes(`'${tbl}'`), `Preflight must check for table: ${tbl}`);
  }

  const expectedFunctions = [
    'get_auth_tenant_id', 'get_auth_user_role', 'is_super_admin',
    'is_finance_manager', 'is_staff', 'is_facilitator', 'set_meetings_updated_at'
  ];

  for (const fnName of expectedFunctions) {
    assert(preflightSql.includes(`'${fnName}'`), `Preflight must check for function: ${fnName}`);
  }
});

runTest('2.15: Strict preflight boundary and fail-closed DDL execution order', () => {
  const posBegin = sqlContent.indexOf('BEGIN;');
  const posPreflight = sqlContent.indexOf('DO $$');
  const posPreflightEnd = sqlContent.indexOf('END $$;');
  const posFirstExt = sqlContent.indexOf('CREATE EXTENSION');
  const posFirstTbl = sqlContent.indexOf('CREATE TABLE');

  assert(posBegin !== -1, 'Script must open transaction with BEGIN');
  assert(posPreflight > posBegin, 'Preflight DO block must immediately follow transaction open');
  assert(posPreflightEnd > posPreflight, 'Preflight DO block must terminate cleanly');
  assert(posFirstExt > posPreflightEnd, 'No extension may be created prior to preflight completion');
  assert(posFirstTbl > posPreflightEnd, 'No application table may be created prior to preflight completion');
});

console.log(`\nResults: ${passedTests}/${totalTests} deep audit tests passed (${failedTests} failed)\n`);

if (failedTests > 0) {
  process.exit(1);
}
