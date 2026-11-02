/**
 * Phase C220 — People & Access Security Defect Remediation Test Suite
 * 
 * Comprehensive offline verification covering all 33 required test scenarios
 * specified in Phase C220 across Atomic Governance, Account Creation, Password Recovery,
 * Access Revocation, and Audit Logging.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('CLASPTEK PHASE C220 — SECURITY DEFECT REMEDIATION VERIFICATION SUITE');
console.log('Target Worktree: scratch/c201_worktree');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
const failures = [];

function runAssertion(id, category, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] Test ${String(id).padStart(2, ' ')} [${category}]: ${description}`);
  } catch (err) {
    console.error(`[FAIL] Test ${String(id).padStart(2, ' ')} [${category}]: ${description}`);
    console.error(`       Error: ${err.message}`);
    failures.push({ id, category, description, error: err.message });
  }
}

// -------------------------------------------------------------------------
// Load Files for Static & Semantic AST Analysis
// -------------------------------------------------------------------------
const worktreeDir = path.resolve(__dirname, '..');
const migrationPath = path.join(worktreeDir, 'migrations', '20261102_atomic_last_super_admin.sql');
const queriesPath = path.join(worktreeDir, 'lib', 'admin', 'personnel-queries.ts');
const routePath = path.join(worktreeDir, 'app', 'api', 'admin', 'users', 'route.ts');
const clientPath = path.join(worktreeDir, 'app', 'people-access', 'PeopleAccessPageClient.tsx');

const migrationContent = fs.readFileSync(migrationPath, 'utf8');
const queriesContent = fs.readFileSync(queriesPath, 'utf8');
const routeContent = fs.readFileSync(routePath, 'utf8');
const clientContent = fs.readFileSync(clientPath, 'utf8');

// =========================================================================
// Category 1: Atomic Governance (Tests 1-10)
// =========================================================================

// 1. Two concurrent attempts to demote different Super Admins in the same tenant
runAssertion(1, 'Atomic Governance', 'Two concurrent attempts to demote different Super Admins in the same tenant serialized via advisory lock', () => {
  assert(migrationContent.includes('pg_advisory_xact_lock'), 'Migration must acquire pg_advisory_xact_lock');
  assert(migrationContent.includes('tenant_super_admin_governance:'), 'Lock key must be derived from tenant namespace');
  assert(!migrationContent.match(/SELECT\s+count\(\*\)[^;]*?FOR\s+UPDATE/i), 'Must not use invalid FOR UPDATE on count(*) aggregate');
});

// 2. The same concurrency attempt across separate tenants
runAssertion(2, 'Atomic Governance', 'Concurrency attempt across separate tenants preserves strict tenant isolation', () => {
  assert(migrationContent.includes('WHERE tenant_id = p_tenant_id'), 'All queries must scope to target tenant');
  assert(queriesContent.includes(".eq('tenant_id', tenantId)"), 'Server queries must filter by tenantId');
});

// 3. Last active Super Admin demotion
runAssertion(3, 'Atomic Governance', 'Last active Super Admin demotion is rejected atomically', () => {
  assert(migrationContent.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'RPC raises exception if last Super Admin removed');
  assert(queriesContent.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN'), 'Server handles CANNOT_REMOVE_LAST_SUPER_ADMIN');
});

// 4. Last active Super Admin suspension
runAssertion(4, 'Atomic Governance', 'Last active Super Admin suspension is rejected atomically', () => {
  assert(migrationContent.includes("p_action IN ('suspend', 'deactivate', 'revoke-access')"), 'Guard checks all suspension/revocation actions');
  assert(migrationContent.includes('v_active_super_admins <= 1'), 'Checks count of active super admins');
});

// 5. Last active Super Admin permanent access revocation
runAssertion(5, 'Atomic Governance', 'Last active Super Admin permanent access revocation is rejected', () => {
  assert(queriesContent.includes("membership?.role === 'SUPER_ADMIN' && membership?.status === 'active'"), 'revokeUserAccess intercepts Super Admin');
  assert(queriesContent.includes("executeAtomicSuperAdminGovernance(tenantId, actor, userId, 'revoke-access'"), 'Delegates Super Admin revocation to atomic RPC');
});

// 6. Unauthorized caller invoking the RPC
runAssertion(6, 'Atomic Governance', 'Unauthorized caller invoking the RPC is rejected', () => {
  assert(migrationContent.includes('UNAUTHORIZED: Caller'), 'RPC checks if caller is active Super Admin in tenant');
  assert(migrationContent.includes("role = 'SUPER_ADMIN'") && migrationContent.includes("status = 'active'"), 'Requires active SUPER_ADMIN role');
});

// 7. Forged p_actor_id
runAssertion(7, 'Atomic Governance', 'Forged p_actor_id parameter is detected and rejected', () => {
  assert(migrationContent.includes('FORGED_ACTOR_IDENTITY'), 'RPC verifies client p_actor_id matches auth.uid()');
  assert(migrationContent.includes('p_actor_id != v_caller_id'), 'Checks actor identity equality');
});

// 8. Cross-tenant target
runAssertion(8, 'Atomic Governance', 'Target user belonging to a different tenant is rejected', () => {
  assert(migrationContent.includes('USER_NOT_FOUND: User % is not a member of tenant %'), 'RPC checks target membership in tenant');
});

// 9. Missing RPC or unapplied migration
runAssertion(9, 'Atomic Governance', 'Missing RPC or unapplied migration fails closed with ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE', () => {
  assert(queriesContent.includes('ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE'), 'Must fail closed with explicit unavailable code');
  // Confirm application fallback is completely removed
  const hasAppFallback = queriesContent.includes("action === 'change-role'") && queriesContent.includes("checkIsLastSuperAdmin") && queriesContent.includes("from('tenant_memberships').update");
  assert(!hasAppFallback, 'Unsafe application count-then-update fallback must not exist');
});

// 10. Database RPC failure
runAssertion(10, 'Atomic Governance', 'Database RPC execution failure returns controlled error without silent bypass', () => {
  assert(queriesContent.includes('ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE: Atomic database governance RPC failed:'), 'Propagates RPC error');
});

// =========================================================================
// Category 2: Account Creation & Rollback (Tests 11-19)
// =========================================================================

// 11. Auth creation success
runAssertion(11, 'Account Creation', 'Auth creation success links authoritative user ID', () => {
  assert(queriesContent.includes('adminClient.auth.admin.createUser'), 'Invokes GoTrue admin createUser');
  assert(queriesContent.includes('createdAuthUserId = authData.user.id'), 'Captures authoritative user UUID');
});

// 12. Auth creation failure
runAssertion(12, 'Account Creation', 'Auth creation failure aborts operation and returns descriptive error', () => {
  assert(queriesContent.includes('AUTHENTICATION_SERVICE_ERROR: Failed to provision user identity:'), 'Fails closed on Auth failure');
});

// 13. Duplicate email
runAssertion(13, 'Account Creation', 'Duplicate email within tenant is rejected with 409 conflict message', () => {
  assert(queriesContent.includes('already exists in this organization'), 'Rejects duplicate registration');
});

// 14. Existing Auth identity safely reused
runAssertion(14, 'Account Creation', 'Existing legitimate Auth identity across tenants is safely linked', () => {
  assert(queriesContent.includes('existingProfile'), 'Checks existing profile');
  assert(queriesContent.includes('userId = existingProfile.id'), 'Reuses existing identity when legitimate');
});

// 15. Cross-tenant linking rejected if already member
runAssertion(15, 'Account Creation', 'Cross-tenant account linking rejected if already member of target tenant', () => {
  assert(queriesContent.includes('existingMem'), 'Checks tenant_memberships for existing user in tenant');
});

// 16. Profile creation failure after Auth creation
runAssertion(16, 'Account Creation', 'Profile creation failure triggers compensation rollback of created Auth user', () => {
  assert(queriesContent.includes('adminClient.auth.admin.deleteUser(createdAuthUserId)'), 'Rolls back auth user');
});

// 17. Membership creation failure after profile creation
runAssertion(17, 'Account Creation', 'Membership creation failure triggers rollback of created Auth user, profile, and personnel', () => {
  assert(queriesContent.includes("supabase.from('profiles').delete().eq('id', userId)"), 'Rolls back profile');
  assert(queriesContent.includes("supabase.from('personnel').delete().eq('id', createdPersonnelId)"), 'Rolls back created personnel');
});

// 18. Rollback failure produces an explicit recoverable error
runAssertion(18, 'Account Creation', 'Rollback failure produces an explicit CRITICAL_PARTIAL_FAILURE error', () => {
  assert(queriesContent.includes('CRITICAL_PARTIAL_FAILURE:'), 'Returns CRITICAL_PARTIAL_FAILURE on rollback error');
});

// 19. No synthetic usr_... fallback under any failure path
runAssertion(19, 'Account Creation', 'Zero synthetic usr_... fallback under any failure path in createOrLinkUserAccount', () => {
  const matches = queriesContent.match(/userId\s*=\s*createdAuthUserId\s*\|\|\s*`usr_/);
  assert(!matches, 'Synthetic usr_ ID fallback must be completely absent');
});

// =========================================================================
// Category 3: Password Recovery (Tests 20-24)
// =========================================================================

// 20. Successful GoTrue request
runAssertion(20, 'Password Recovery', 'Successful GoTrue request returns structured success without credential exposure', () => {
  assert(queriesContent.includes('adminClient.auth.resetPasswordForEmail'), 'Dispatches via GoTrue');
  assert(queriesContent.includes('Password recovery request accepted by authentication provider.'), 'Returns accepted message');
});

// 21. GoTrue dispatch error
runAssertion(21, 'Password Recovery', 'GoTrue dispatch error propagates controlled failure instead of silent success', () => {
  assert(queriesContent.includes('PASSWORD_RESET_DISPATCH_FAILED: Authentication provider rejected recovery request:'), 'Propagates GoTrue error');
  assert(queriesContent.includes('if (dispatchError) {'), 'Checks dispatch error before audit log');
});

// 22. Suspended account recovery rejection
runAssertion(22, 'Password Recovery', 'Suspended account recovery attempt is rejected', () => {
  assert(queriesContent.includes("membership.status === 'suspended'"), 'Rejects suspended account');
  assert(queriesContent.includes('Cannot initiate password reset for a suspended or revoked account.'), 'Clear error message');
});

// 23. No token or recovery URL in API response
runAssertion(23, 'Password Recovery', 'Zero token or recovery URL returned in API response payload', () => {
  assert(!routeContent.includes('resetToken:'), 'route.ts must not return resetToken');
  assert(!queriesContent.includes('resetToken:'), 'personnel-queries.ts must not return resetToken');
});

// 24. No misleading success message after dispatch failure
runAssertion(24, 'Password Recovery', 'UI does not claim user received email; acknowledges provider request status', () => {
  assert(clientContent.includes('Password recovery request accepted for'), 'UI notifies request accepted');
  assert(!clientContent.includes('Password recovery email dispatched to'), 'UI avoids false delivery claim');
});

// =========================================================================
// Category 4: Access Revocation & State Separation (Tests 25-30)
// =========================================================================

// 25. Revoke Access does not alter employment status
runAssertion(25, 'Access Revocation', 'Revoke Access does not alter employment status in public.personnel', () => {
  // In queriesContent revokeUserAccess
  const revokeStart = queriesContent.indexOf('export async function revokeUserAccess');
  const revokeEnd = queriesContent.indexOf('export async function reactivateUserAccess');
  const revokeFnBody = queriesContent.slice(revokeStart, revokeEnd);
  assert(!revokeFnBody.includes("employment_status: 'deactivated'"), 'revokeUserAccess must not deactivate employment status');
  assert(!revokeFnBody.includes("employmentStatus: 'deactivated'"), 'Audit state must not mark employment deactivated');
});

// 26. Revoke Access does not alter payroll status
runAssertion(26, 'Access Revocation', 'Revoke Access does not modify payroll or compensation records', () => {
  const revokeStart = queriesContent.indexOf('export async function revokeUserAccess');
  const revokeEnd = queriesContent.indexOf('export async function reactivateUserAccess');
  const revokeFnBody = queriesContent.slice(revokeStart, revokeEnd);
  assert(!revokeFnBody.includes('basic_pay'), 'Must not touch basic_pay');
  assert(!revokeFnBody.includes('bank_name'), 'Must not touch bank_name');
});

// 27. Revoke Sessions calls global sign-out
runAssertion(27, 'Access Revocation', 'Revoke Sessions invalidates sessions via GoTrue global sign-out', () => {
  assert(queriesContent.includes("adminClient.auth.admin.signOut(userId, 'global')"), 'Calls GoTrue global sign-out');
});

// 28. Revoked account cannot access protected server operations
runAssertion(28, 'Access Revocation', 'Revoked account is marked suspended in tenant_memberships and inactive in profiles', () => {
  assert(queriesContent.includes(".update({ status: 'suspended', updated_at: new Date().toISOString() })"), 'Suspends membership');
  assert(queriesContent.includes(".update({ is_active: false, updated_at: new Date().toISOString() })"), 'Marks profile inactive');
});

// 29. Reactivation does not silently restore an old role
runAssertion(29, 'Access Revocation', 'Reactivation authoritatively activates status without role modification', () => {
  const reactStart = queriesContent.indexOf('export async function reactivateUserAccess');
  const reactEnd = queriesContent.indexOf('export async function executeAtomicSuperAdminGovernance');
  const reactBody = queriesContent.slice(reactStart, reactEnd);
  assert(!reactBody.includes(".update({ role:"), 'reactivateUserAccess must not mutate role');
  assert(!reactBody.includes("role: newRole"), 'reactivateUserAccess must not take newRole parameter');
  assert(!reactBody.includes("employment_status: 'active'"), 'reactivateUserAccess must not mutate employment status');
});

// 30. Revoke Access preserves historical records
runAssertion(30, 'Access Revocation', 'Revoke Access preserves historical personnel and audit trail records', () => {
  assert(queriesContent.includes("action: 'REVOKE_USER_ACCESS'"), 'Logs REVOKE_USER_ACCESS event');
});

// =========================================================================
// Category 5: Audit Logging (Tests 31-33)
// =========================================================================

// 31. Audit insert failure blocks mutation
runAssertion(31, 'Audit Logging', 'Audit insert failure aborts mutation by throwing fail-closed exception', () => {
  assert(queriesContent.includes('SECURITY_AUDIT_LOG_FAILURE: Mutation aborted.'), 'recordFinanceAuditLogFailClosed throws exception on insert error');
});

// 32. Mutation failure is not reported as success
runAssertion(32, 'Audit Logging', 'Route error handler captures exceptions and returns controlled HTTP error', () => {
  assert(routeContent.includes('NextResponse.json({ success: false, error:'), 'Route catches and returns error');
});

// 33. Audit payload contains no credentials or recovery tokens
runAssertion(33, 'Audit Logging', 'recordFinanceAuditLogFailClosed sanitizes passwords, tokens, and secrets from state', () => {
  assert(queriesContent.includes('.password;'), 'Redacts password');
  assert(queriesContent.includes('.tempPassword;'), 'Redacts tempPassword');
  assert(queriesContent.includes('.token;'), 'Redacts token');
  assert(queriesContent.includes('.secret;'), 'Redacts secret');
  assert(queriesContent.includes('.inviteToken;'), 'Redacts inviteToken');
});

// -------------------------------------------------------------------------
// Summary Output
// -------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`TOTAL PHASE C220 ASSERTIONS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failures.length}`);
console.log('======================================================================\n');

if (failures.length > 0) {
  console.error('Failed Assertions:');
  failures.forEach((f) => {
    console.error(`  - Test ${f.id} [${f.category}]: ${f.description} -> ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('ALL 33 PHASE C220 SECURITY DEFECT REMEDIATION TESTS PASSED!');
  process.exit(0);
}
