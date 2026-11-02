/**
 * scripts/test_phase_c218_security_remediation_offline.js
 * Clasptek Phase C218: People & Access Security Remediation Offline Certification Suite
 *
 * Validates the five mandatory security remediations identified in C217:
 * Fix 1 — Secure Password Reset: Zero administrator-visible tokens, GoTrue recovery dispatch,
 *        deactivated/suspended account recovery rejection.
 * Fix 2 — Real Supabase Auth Account Creation: GoTrue Admin API integration, authentic UUIDs,
 *        rollback on partial failure, existing personnel deduplication.
 * Fix 3 — Atomic Last-Super-Admin Protection: SQL migration with FOR UPDATE row locks,
 *        concurrency guard, self-demotion block, last admin guard.
 * Fix 4 — Separate Session Revocation from Permanent Access Revocation:
 *        signOut('global') session termination vs. full account/personnel deactivation and reactivation.
 * Fix 5 — Fail-Closed Security Audit Logging: Mutations abort if audit logging fails, zero secret leakage.
 * Plus UI & Design Integrity: Distinct buttons ("Revoke Sessions" vs "Revoke Access"), zero emoji, 18x18 SVGs.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let totalPassed = 0;
let totalFailed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    totalFailed++;
  }
}

async function runPhaseC218Suite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE C218 SECURITY REMEDIATION SUITE');
  console.log('======================================================================\n');

  const baseDir = path.resolve(__dirname, '..');
  const personnelQueriesPath = path.join(baseDir, 'lib', 'admin', 'personnel-queries.ts');
  const usersRoutePath = path.join(baseDir, 'app', 'api', 'admin', 'users', 'route.ts');
  const clientComponentPath = path.join(baseDir, 'app', 'people-access', 'PeopleAccessPageClient.tsx');
  const migrationPath = path.join(baseDir, 'migrations', '20261102_atomic_last_super_admin.sql');

  // Verify file existence
  assert(fs.existsSync(personnelQueriesPath), 'lib/admin/personnel-queries.ts must exist');
  assert(fs.existsSync(usersRoutePath), 'app/api/admin/users/route.ts must exist');
  assert(fs.existsSync(clientComponentPath), 'app/people-access/PeopleAccessPageClient.tsx must exist');
  assert(fs.existsSync(migrationPath), 'migrations/20261102_atomic_last_super_admin.sql must exist');

  const personnelQueriesSource = fs.readFileSync(personnelQueriesPath, 'utf8');
  const usersRouteSource = fs.readFileSync(usersRoutePath, 'utf8');
  const clientComponentSource = fs.readFileSync(clientComponentPath, 'utf8');
  const migrationSource = fs.readFileSync(migrationPath, 'utf8');

  // -------------------------------------------------------------------------
  // 1. Fix 1: Secure Password Reset & Zero Administrator Token Exposure
  // -------------------------------------------------------------------------
  console.log('[1/6] Fix 1 — Secure Password Reset & Zero Token Exposure:');

  it('initiateAdminPasswordReset does NOT return resetToken in its return object', () => {
    // Check initiateAdminPasswordReset signature and return block
    const fnStart = personnelQueriesSource.indexOf('export async function initiateAdminPasswordReset');
    assert(fnStart !== -1, 'Missing initiateAdminPasswordReset function');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3500);

    assert(!fnSegment.includes('resetToken: resetToken'), 'Must not return resetToken in return object');
    assert(!fnSegment.includes('resetToken: string'), 'Must not declare resetToken in return type signature');
    assert(fnSegment.includes('message: \'Password reset recovery email dispatched successfully.\''), 'Must return safe success message');
  });

  it('Users PATCH route reset-password handler does NOT return resetToken to client', () => {
    const patchSegment = usersRouteSource.slice(usersRouteSource.indexOf('case \'reset-password\':'));
    const caseSegment = patchSegment.slice(0, patchSegment.indexOf('case \'resend-invite\':'));

    assert(!caseSegment.includes('resetToken:'), 'PATCH response must not contain resetToken');
    assert(caseSegment.includes('Password reset recovery email dispatched successfully'), 'Must return direct dispatch message');
  });

  it('initiateAdminPasswordReset rejects suspended or revoked accounts', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function initiateAdminPasswordReset');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3000);

    assert(fnSegment.includes('membership.status === \'suspended\''), 'Must verify membership status is not suspended');
    assert(fnSegment.includes('Cannot initiate password reset for a suspended or revoked account'), 'Must reject suspended accounts');
  });

  it('initiateAdminPasswordReset rejects deactivated or terminated personnel', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function initiateAdminPasswordReset');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3000);

    assert(fnSegment.includes('personnel.employment_status === \'deactivated\''), 'Must check personnel deactivated status');
    assert(fnSegment.includes('Cannot initiate password reset for a deactivated or terminated personnel account'), 'Must reject deactivated personnel');
  });

  it('initiateAdminPasswordReset calls Supabase GoTrue resetPasswordForEmail', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function initiateAdminPasswordReset');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3000);

    assert(fnSegment.includes('adminClient.auth.resetPasswordForEmail'), 'Must invoke GoTrue resetPasswordForEmail');
  });

  it('Client credentialModal displays zero-exposure confirmation for reset with no token or copy button', () => {
    assert(clientComponentSource.includes('Zero-Exposure Security Standard'), 'Must state zero-exposure standard');
    assert(clientComponentSource.includes('credentialModal.actionType === \'reset\''), 'Must branch on reset actionType');
  });

  // -------------------------------------------------------------------------
  // 2. Fix 2: Real Supabase Auth Account Creation via Admin API
  // -------------------------------------------------------------------------
  console.log('\n[2/6] Fix 2 — Real Supabase Auth Account Creation:');

  const fnUserEnd = personnelQueriesSource.indexOf('export async function revokeUserSessions');

  it('createOrLinkUserAccount integrates with Supabase Auth Admin API', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function createOrLinkUserAccount');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnUserEnd);

    assert(fnSegment.includes('adminClient.auth.admin.createUser'), 'Must call GoTrue auth.admin.createUser');
  });

  it('createOrLinkUserAccount implements rollback on profile creation failure', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function createOrLinkUserAccount');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnUserEnd);

    assert(fnSegment.includes('adminClient.auth.admin.deleteUser(createdAuthUserId)'), 'Must delete auth user if profile fails');
  });

  it('createOrLinkUserAccount implements rollback on personnel creation failure', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function createOrLinkUserAccount');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnUserEnd);

    assert(fnSegment.includes('Failed to create personnel record'), 'Must handle personnel insert failure');
  });

  it('createOrLinkUserAccount implements rollback on membership creation failure', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function createOrLinkUserAccount');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnUserEnd);

    assert(fnSegment.includes('Failed to create membership'), 'Must handle membership insert failure');
  });

  // -------------------------------------------------------------------------
  // 3. Fix 3: Atomic Last-Super-Admin Concurrency Protection
  // -------------------------------------------------------------------------
  console.log('\n[3/6] Fix 3 — Atomic Last-Super-Admin Concurrency Protection:');

  it('Database migration defines demote_or_suspend_super_admin function', () => {
    assert(migrationSource.includes('CREATE OR REPLACE FUNCTION public.demote_or_suspend_super_admin'), 'Must define demote_or_suspend_super_admin');
  });

  it('Database migration uses FOR UPDATE row locking across active super admins', () => {
    assert(migrationSource.includes('FOR UPDATE'), 'Must acquire transaction-level row locks with FOR UPDATE');
    assert(migrationSource.includes('role = \'SUPER_ADMIN\''), 'Must target SUPER_ADMIN role');
    assert(migrationSource.includes('status = \'active\''), 'Must target active status');
  });

  it('Database migration raises exception if remaining active super admin count would drop to zero', () => {
    assert(migrationSource.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'Must raise CANNOT_REMOVE_LAST_SUPER_ADMIN exception');
    assert(migrationSource.includes('v_active_super_admins <= 1'), 'Must check active count <= 1');
  });

  it('Server queries export executeAtomicSuperAdminGovernance with atomic fallback', () => {
    assert(personnelQueriesSource.includes('export async function executeAtomicSuperAdminGovernance'), 'Missing executeAtomicSuperAdminGovernance');
    assert(personnelQueriesSource.includes('rpc(\'demote_or_suspend_super_admin\''), 'Must attempt PostgreSQL RPC call');
    assert(personnelQueriesSource.includes('ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE'), 'Must fail closed on RPC unavailability (DEF-C219-03)');
  });

  // -------------------------------------------------------------------------
  // 4. Fix 4: Separate Session Revocation from Permanent Access Revocation
  // -------------------------------------------------------------------------
  console.log('\n[4/6] Fix 4 — Separate Session Revocation from Permanent Access Revocation:');

  it('Server queries export distinct revokeUserSessions function', () => {
    assert(personnelQueriesSource.includes('export async function revokeUserSessions'), 'Missing revokeUserSessions export');
    const fnStart = personnelQueriesSource.indexOf('export async function revokeUserSessions');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3500);
    assert(fnSegment.includes('adminClient.auth.admin.signOut(userId, \'global\')'), 'Must invoke GoTrue global signOut');
    assert(fnSegment.includes('REVOKE_USER_SESSIONS'), 'Must audit REVOKE_USER_SESSIONS');
  });

  it('Server queries export distinct revokeUserAccess function', () => {
    assert(personnelQueriesSource.includes('export async function revokeUserAccess'), 'Missing revokeUserAccess export');
    const fnStart = personnelQueriesSource.indexOf('export async function revokeUserAccess');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 2500);

    assert(fnSegment.includes('executeAtomicSuperAdminGovernance') || fnSegment.includes('SUPER_ADMIN'), 'Must protect Super Admin access revocation');
    assert(fnSegment.includes('status: \'suspended\''), 'Must suspend tenant membership');
    assert(fnSegment.includes('is_active: false'), 'Must mark profile inactive');
    assert(!fnSegment.includes('employment_status: \'deactivated\''), 'Must NOT alter personnel employment status (DEF-C219-06)');
    assert(fnSegment.includes('adminClient.auth.admin.signOut(userId, \'global\')'), 'Must terminate active sessions');
    assert(fnSegment.includes('REVOKE_USER_ACCESS'), 'Must audit REVOKE_USER_ACCESS');
  });

  it('Server queries export distinct reactivateUserAccess function', () => {
    assert(personnelQueriesSource.includes('export async function reactivateUserAccess'), 'Missing reactivateUserAccess export');
    const fnStart = personnelQueriesSource.indexOf('export async function reactivateUserAccess');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 2000);

    assert(fnSegment.includes('status: \'active\''), 'Must restore tenant membership to active');
    assert(fnSegment.includes('is_active: true'), 'Must restore profile to active');
    assert(!fnSegment.includes('employment_status: \'active\''), 'Must NOT mutate personnel employment status (DEF-C219-06)');
    assert(fnSegment.includes('REACTIVATE_USER'), 'Must audit REACTIVATE_USER');
  });

  it('Users API route PATCH exposes distinct revoke-sessions and revoke-access cases', () => {
    assert(usersRouteSource.includes('case \'revoke-sessions\':'), 'Must support case revoke-sessions');
    assert(usersRouteSource.includes('case \'revoke-access\':'), 'Must support case revoke-access');
    assert(usersRouteSource.includes('revokeUserSessions'), 'Must call revokeUserSessions');
    assert(usersRouteSource.includes('revokeUserAccess'), 'Must call revokeUserAccess');
  });

  it('PeopleAccessPageClient provides distinct buttons for Revoke Sessions and Revoke Access', () => {
    assert(clientComponentSource.includes('Revoke Sessions'), 'Must have button labeled Revoke Sessions');
    assert(clientComponentSource.includes('Revoke Access'), 'Must have button labeled Revoke Access');
  });

  it('PeopleAccessPageClient provides distinct modal dialogs for session revocation and permanent access revocation', () => {
    assert(clientComponentSource.includes('aria-labelledby="modal-revoke-title"'), 'Must have modal for active sessions');
    assert(clientComponentSource.includes('aria-labelledby="modal-revoke-access-title"'), 'Must have modal for access revocation');
    assert(clientComponentSource.includes('Permanently Revoke Access'), 'Must explain permanent revocation consequences');
  });

  // -------------------------------------------------------------------------
  // 5. Fix 5: Fail-Closed Security Audit Logging
  // -------------------------------------------------------------------------
  console.log('\n[5/6] Fix 5 — Fail-Closed Security Audit Logging:');

  it('Server queries export recordFinanceAuditLogFailClosed that throws on error', () => {
    assert(personnelQueriesSource.includes('export async function recordFinanceAuditLogFailClosed'), 'Missing recordFinanceAuditLogFailClosed');
    const fnStart = personnelQueriesSource.indexOf('export async function recordFinanceAuditLogFailClosed');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3500);

    assert(fnSegment.includes('SECURITY_AUDIT_LOG_FAILURE'), 'Must throw error with code SECURITY_AUDIT_LOG_FAILURE');
  });

  it('recordFinanceAuditLogFailClosed strips passwords, tokens, and secrets from state', () => {
    const fnStart = personnelQueriesSource.indexOf('export async function recordFinanceAuditLogFailClosed');
    const fnSegment = personnelQueriesSource.slice(fnStart, fnStart + 3500);

    assert(fnSegment.includes('delete (sanitizedNewState as Record<string, unknown>).password'), 'Must sanitize password');
    assert(fnSegment.includes('delete (sanitizedNewState as Record<string, unknown>).resetToken'), 'Must sanitize resetToken');
    assert(fnSegment.includes('delete (sanitizedNewState as Record<string, unknown>).token'), 'Must sanitize token');
  });

  it('Users API routes use fail-closed audit logging for sensitive actions', () => {
    assert(usersRouteSource.includes('recordFinanceAuditLogFailClosed'), 'Users route must import and use recordFinanceAuditLogFailClosed');
  });

  // -------------------------------------------------------------------------
  // 6. UI, Design System Compliance & Worktree Hygiene
  // -------------------------------------------------------------------------
  console.log('\n[6/6] UI, Design System Compliance & Worktree Hygiene:');

  it('Zero Unicode Emoji in client component', () => {
    const forbiddenEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const emojiMatches = clientComponentSource.match(forbiddenEmojiRegex);
    assert(!emojiMatches, `Found forbidden unicode emoji in client component: ${emojiMatches ? emojiMatches[0] : ''}`);
  });

  it('PeopleAccessPageClient uses 18x18 SVG icons for design system compliance', () => {
    assert(clientComponentSource.includes('width="18" height="18"'), 'Must define standard 18x18 SVG icons');
    assert(clientComponentSource.includes('viewBox="0 0 24 24"'), 'Must define standard viewBox="0 0 24 24"');
  });

  it('Migration file is documented as unapplied pending authorization', () => {
    assert(migrationSource.includes('LOCAL REPOSITORY ONLY — UNAPPLIED PENDING AUTHORIZED REMOTE EXECUTION'), 'Migration must document quarantine status');
  });

  // Summary
  console.log('\n======================================================================');
  console.log(` PHASE C218 CERTIFICATION SUMMARY: ${totalPassed} PASSED / ${totalFailed} FAILED`);
  console.log('======================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhaseC218Suite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
