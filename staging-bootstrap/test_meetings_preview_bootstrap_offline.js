/**
 * staging-bootstrap/test_meetings_preview_bootstrap_offline.js
 *
 * Dedicated offline validation suite for meetings_preview_bootstrap.sql
 * Strict Phase C67/C69/C70 Invariants:
 * - ZERO network calls, ZERO database connections.
 * - Parses and structurally verifies the bootstrap artifact against the application contracts.
 * - Enforces least-privilege RLS, canonical schema parity, and fail-closed fresh-project preflight.
 * - Validates fail-closed tenant resolution and complete supporting-table RLS coverage.
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

console.log('\n=== Clasptek Phase C70: Offline Staging Bootstrap Artifact Audit ===\n');

const bootstrapPath = path.join(__dirname, 'meetings_preview_bootstrap.sql');

runTest('1.1: Bootstrap artifact exists and is non-empty', () => {
  assert(fs.existsSync(bootstrapPath), 'meetings_preview_bootstrap.sql must exist on disk');
  const stat = fs.statSync(bootstrapPath);
  assert(stat.size > 2000, `Artifact size (${stat.size} bytes) must be substantial (>2000 bytes)`);
});

const sqlContent = fs.readFileSync(bootstrapPath, 'utf8');

runTest('1.2: Production quarantine and absence of production credentials', () => {
  // Must NOT contain real connection strings or production host references
  assert(!sqlContent.includes('postgres://'), 'Must not contain raw postgres connection strings');
  assert(!sqlContent.includes('postgresql://'), 'Must not contain raw postgresql connection strings');
  assert(!sqlContent.includes('https://logaawoigfxnisimfatf.supabase.co'), 'Must not reference production URL');
  assert(!sqlContent.includes('https://dwhjoiebzwnjdpcvcwvs.supabase.co'), 'Must not reference legacy test URL');
  assert(sqlContent.includes('logaawoigfxnisimfatf'), 'Must declare quarantine against production ref');
});

runTest('1.3: Single authoritative public.meetings definition eliminates Phase 1/Phase 2 collision', () => {
  const matches = sqlContent.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.meetings\s*\(/gi);
  assert(matches && matches.length === 1, `Expected exactly 1 public.meetings table declaration, found ${matches ? matches.length : 0}`);
  
  // Must contain Phase 2 authoritative columns
  assert(sqlContent.includes('deleted_at TIMESTAMPTZ'), 'Must contain deleted_at TIMESTAMPTZ');
  assert(sqlContent.includes("provider TEXT NOT NULL DEFAULT 'LIVEKIT'"), 'Must contain provider column with LIVEKIT default');
  assert(sqlContent.includes('provider_room_url TEXT'), 'Must contain provider_room_url TEXT');
  assert(sqlContent.includes("provider IN ('LIVEKIT', 'DAILY', 'MOCK', 'GOOGLE_MEET')") || sqlContent.includes("CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK'))"), 'Must contain valid provider constraint allowing LIVEKIT default');
  assert(sqlContent.includes("CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'))"), 'Must contain COMPLETED status constraint (not ENDED)');
});

runTest('1.4: Prerequisites and table dependency ordering', () => {
  const posTenants = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.tenants');
  const posProfiles = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.profiles');
  const posMemberships = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.tenant_memberships');
  const posPersonnel = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.personnel');
  const posProgrammes = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.programmes');
  const posCohorts = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.cohorts');
  const posMeetings = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.meetings');
  const posParticipants = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.meeting_participants');
  const posAttendance = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.meeting_attendance');
  const posGuestRequests = sqlContent.indexOf('CREATE TABLE IF NOT EXISTS public.meeting_guest_requests');

  assert(posTenants > 0, 'tenants must be defined');
  assert(posProfiles > posTenants, 'profiles must be defined after tenants');
  assert(posMemberships > posProfiles, 'tenant_memberships must be defined after profiles');
  assert(posPersonnel > posMemberships, 'personnel must be defined after tenant_memberships');
  assert(posProgrammes > posPersonnel, 'programmes must be defined after personnel');
  assert(posCohorts > posProgrammes, 'cohorts must be defined after programmes');
  assert(posMeetings > posCohorts, 'meetings must be defined after cohorts');
  assert(posParticipants > posMeetings, 'meeting_participants must be defined after meetings');
  assert(posAttendance > posParticipants, 'meeting_attendance must be defined after participants');
  assert(posGuestRequests > posMeetings, 'meeting_guest_requests must be defined after meetings');
});

runTest('1.5: Security and RLS helper functions are defined before policies', () => {
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()'), 'get_auth_tenant_id must be defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.get_auth_user_role()'), 'get_auth_user_role must be defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.is_super_admin()'), 'is_super_admin must be defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.is_finance_manager()'), 'is_finance_manager must be defined');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.is_facilitator()'), 'is_facilitator must be defined');

  // Verify function definitions appear BEFORE RLS policy creation
  const posHelper = sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.is_facilitator()');
  const posPolicy = sqlContent.indexOf('CREATE POLICY "meetings_facilitator_select"');
  assert(posHelper < posPolicy, 'is_facilitator helper must be defined before meetings_facilitator_select policy');
});

runTest('1.6: RLS enabled on all meeting and security tables with least-privilege policies', () => {
  assert(sqlContent.includes('ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on meetings');
  assert(sqlContent.includes('ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on meeting_guest_requests');
  assert(sqlContent.includes('ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on tenant_memberships');
  assert(sqlContent.includes('ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on personnel');

  // Verify authoritative policies
  assert(sqlContent.includes('CREATE POLICY "meetings_admin_full_access"'), 'meetings_admin_full_access must be defined');
  assert(sqlContent.includes('CREATE POLICY "meetings_facilitator_select"'), 'meetings_facilitator_select must be defined');
  assert(sqlContent.includes('CREATE POLICY "meetings_student_select"'), 'meetings_student_select must be defined');
  
  // Phase C69/C70: meeting_guest_requests must use least-privilege scoped policies, NOT broad tenant-wide FOR ALL
  assert(sqlContent.includes('CREATE POLICY "meeting_guest_requests_host_select"'), 'meeting_guest_requests_host_select must be defined');
  assert(!sqlContent.includes('CREATE POLICY "meeting_guest_requests_tenant_isolation"'), 'Overly broad meeting_guest_requests_tenant_isolation policy must NOT be present');
});

runTest('1.7: Guest request waiting room contract conforms to application service', () => {
  assert(sqlContent.includes('request_token VARCHAR(128) NOT NULL UNIQUE'), 'request_token must be VARCHAR(128) NOT NULL UNIQUE');
  assert(sqlContent.includes("CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED'))"), 'Guest status constraint must match app service');
  assert(sqlContent.includes('livekit_token TEXT'), 'livekit_token column must exist');
  assert(sqlContent.includes('livekit_server_url VARCHAR(255)'), 'livekit_server_url column must exist');
});

runTest('1.8: Synthetic seed fixtures use DEFAULT_TENANT_ID and documented Auth steps', () => {
  assert(sqlContent.includes('f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6'), 'Seed fixture must use lib/auth/server.ts DEFAULT_TENANT_ID');
  assert(sqlContent.includes('OPERATOR STEP:'), 'Must document Supabase Auth user creation in dashboard');
  assert(sqlContent.includes('REPLACE_WITH_SUPABASE_AUTH_UID'), 'Must use placeholder for auth UID rather than hardcoding fake password');
  assert(sqlContent.includes('preview-test-room'), 'Must include preview-test-room meeting fixture');
});

runTest('1.9: Fail-closed fresh project preflight abort guard exists for all objects', () => {
  assert(sqlContent.includes('PREFLIGHT_ABORT'), 'Preflight abort message must be declared');
  assert(sqlContent.includes("'meetings'"), 'Preflight check must inspect meetings table existence');
  assert(sqlContent.includes("'meeting_guest_requests'"), 'Preflight check must inspect guest requests table existence');
  assert(sqlContent.includes("'tenants'"), 'Preflight check must inspect tenants table existence');
  assert(sqlContent.includes("'get_auth_tenant_id'"), 'Preflight check must inspect functions existence');
  assert(sqlContent.includes('RAISE EXCEPTION'), 'Preflight must raise exception on non-empty target');
});

runTest('1.10: Training sessions aligns with canonical schema', () => {
  assert(sqlContent.includes('session_title TEXT NOT NULL'), 'training_sessions must use session_title TEXT NOT NULL');
  assert(sqlContent.includes('session_number INT NOT NULL CHECK (session_number > 0)'), 'training_sessions must enforce session_number > 0');
  assert(sqlContent.includes('CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id)'), 'training_sessions must have UNIQUE (tenant_id, id)');
});

runTest('1.11: Fail-closed tenant resolution without unordered LIMIT 1', () => {
  // get_auth_tenant_id and get_auth_user_role must NOT use unordered LIMIT 1
  assert(!sqlContent.includes('LIMIT 1;'), 'Helper functions must not use arbitrary LIMIT 1');
  assert(sqlContent.includes('v_count = 1'), 'Tenant resolution must check for exactly 1 active membership');
});

runTest('1.12: Complete supporting-table RLS policies coverage', () => {
  // Verify policies exist for supporting tables needed by meeting authorization subqueries
  assert(sqlContent.includes('CREATE POLICY "personnel_tenant_select"'), 'personnel_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "cohorts_tenant_select"'), 'cohorts_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "students_tenant_select"'), 'students_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "enrolments_tenant_select"'), 'enrolments_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "programmes_tenant_select"'), 'programmes_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "training_sessions_tenant_select"'), 'training_sessions_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "memberships_tenant_read"'), 'memberships_tenant_read policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "meeting_participants_tenant_select"'), 'meeting_participants_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "meeting_attendance_tenant_select"'), 'meeting_attendance_tenant_select policy must be defined');
  assert(sqlContent.includes('CREATE POLICY "meeting_chat_tenant_select"'), 'meeting_chat_tenant_select policy must be defined');
});

runTest('1.13: Preflight verifies Supabase Auth prerequisites (auth.users, auth.uid(), roles)', () => {
  // Extract Section 0 DO block
  const doStart = sqlContent.indexOf('SECTION 0 — PREFLIGHT SAFETY GUARD');
  const doEnd = sqlContent.indexOf('SECTION 1 — EXTENSIONS');
  assert(doStart > 0 && doEnd > doStart, 'Section 0 preflight block must exist');
  const preflightSql = sqlContent.slice(doStart, doEnd);

  // 1. auth.users table existence check (supports regular and partitioned tables)
  assert(preflightSql.includes("nspname = 'auth'"), 'Preflight must target auth schema');
  assert(preflightSql.includes("relname = 'users'"), 'Preflight must target users relation');
  assert(preflightSql.includes("relkind IN ('r', 'p')"), 'Preflight must check for regular or partitioned table (r, p)');
  assert(preflightSql.includes('Required Supabase Auth table auth.users is missing'), 'Must raise clear abort for missing auth.users');

  // 2. auth.uid() function signature check (0 arguments, returns uuid)
  assert(preflightSql.includes("proname = 'uid'"), 'Preflight must check for uid function');
  assert(preflightSql.includes('pronargs = 0'), 'Preflight must enforce auth.uid() has 0 arguments');
  assert(preflightSql.includes("typname = 'uuid'"), 'Preflight must enforce auth.uid() returns uuid');
  assert(preflightSql.includes('Required Supabase Auth function auth.uid() returning uuid with 0 arguments is missing'), 'Must raise clear abort for missing or invalid auth.uid()');

  // 3. Supabase built-in roles check (anon, authenticated, service_role)
  assert(preflightSql.includes("rolname IN ('anon', 'authenticated', 'service_role')"), 'Preflight must verify all 3 Supabase roles');
  assert(preflightSql.includes('!= 3'), 'Preflight must fail if role count is not 3');
  assert(preflightSql.includes('One or more required Supabase roles (anon, authenticated, service_role) are missing'), 'Must raise clear abort for missing roles');
});

runTest('1.14: Preflight must complete before any application DDL begins', () => {
  const posBegin = sqlContent.indexOf('BEGIN;');
  const posPreflightEnd = sqlContent.indexOf('END $$;');
  const posFirstExtension = sqlContent.indexOf('CREATE EXTENSION');
  const posFirstTable = sqlContent.indexOf('CREATE TABLE');

  assert(posBegin !== -1, 'Script must begin with transaction BEGIN');
  assert(posPreflightEnd > posBegin, 'Preflight DO block must follow BEGIN');
  assert(posFirstExtension > posPreflightEnd, 'CREATE EXTENSION must occur after preflight completion');
  assert(posFirstTable > posPreflightEnd, 'Application DDL must occur after preflight completion');
});

runTest('1.15: Production quarantine invariants and non-application project protection', () => {
  // Asserts quarantine comments and project identity declarations
  assert(sqlContent.includes("Quarantined Production Project: 'logaawoigfxnisimfatf' is STRICTLY FORBIDDEN"), 'Production project quarantine must be stated');
  assert(sqlContent.includes("Legacy Drive Test Project: 'dwhjoiebzwnjdpcvcwvs' is NOT an application database"), 'Legacy Drive project must be declared non-application');
  assert(sqlContent.includes('SQL guards cannot inspect client-side network connection hostnames'), 'Must warn operators of network-level inspection limitations');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed (${failedTests} failed)\n`);

if (failedTests > 0) {
  process.exit(1);
}
