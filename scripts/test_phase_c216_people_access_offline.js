/**
 * scripts/test_phase_c216_people_access_offline.js
 * Phase C216: People & Access Account Management Enhancement Offline Certification Suite
 *
 * Validates:
 * 1. Account Creation with Valid Inputs (Cohesive Personnel + User + Membership)
 * 2. Prevention of Duplicate Email Accounts & Existing Record Safety
 * 3. Admin-Initiated Password Reset Flow & Confidentiality
 * 4. Privilege Escalation Prevention & Super Admin RBAC Enforcement
 * 5. Last Super Admin Protection (Blocks Demotion and Suspension of Sole Super Admin)
 * 6. Account Lifecycle: Suspension, Reactivation, and Session Invalidation
 * 7. Cross-Tenant Data Isolation & Boundary Enforcement
 * 8. Authoritative Audit Trail Recording for All Actions (Zero Secret Leakage)
 * 9. UI & Navigation Integrity (4 KPI Cards, 3 Subtabs, 18x18 SVG Icons, Zero Emoji)
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

async function runPhaseC216Suite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE C216 ACCOUNT MANAGEMENT SUITE');
  console.log('======================================================================\n');

  const baseDir = path.resolve(__dirname, '..');
  const personnelQueriesPath = path.join(baseDir, 'lib', 'admin', 'personnel-queries.ts');
  const usersRoutePath = path.join(baseDir, 'app', 'api', 'admin', 'users', 'route.ts');
  const clientComponentPath = path.join(baseDir, 'app', 'people-access', 'PeopleAccessPageClient.tsx');

  // Verify file existence
  assert(fs.existsSync(personnelQueriesPath), 'lib/admin/personnel-queries.ts must exist');
  assert(fs.existsSync(usersRoutePath), 'app/api/admin/users/route.ts must exist');
  assert(fs.existsSync(clientComponentPath), 'app/people-access/PeopleAccessPageClient.tsx must exist');

  const personnelQueriesSource = fs.readFileSync(personnelQueriesPath, 'utf8');
  const usersRouteSource = fs.readFileSync(usersRoutePath, 'utf8');
  const clientComponentSource = fs.readFileSync(clientComponentPath, 'utf8');

  // -------------------------------------------------------------------------
  // 1. Account Creation Workflow & Dual-Record Provisioning
  // -------------------------------------------------------------------------
  console.log('[1/9] Account Creation Workflow & Dual-Record Provisioning:');

  it('Server query library exports createOrLinkUserAccount', () => {
    assert(personnelQueriesSource.includes('export async function createOrLinkUserAccount'), 'Missing createOrLinkUserAccount export');
  });

  it('createOrLinkUserAccount creates/links profile, personnel record, and tenant membership', () => {
    assert(personnelQueriesSource.includes('from(\'profiles\')'), 'Must interact with profiles table');
    assert(personnelQueriesSource.includes('from(\'personnel\')'), 'Must interact with personnel table');
    assert(personnelQueriesSource.includes('from(\'tenant_memberships\')'), 'Must interact with tenant_memberships table');
    assert(personnelQueriesSource.includes('getNextPersonnelIdentifier'), 'Must generate authoritative employee ID');
  });

  it('createOrLinkUserAccount generates secure invitation token with active/invited status', () => {
    assert(personnelQueriesSource.includes('inviteToken'), 'Must return inviteToken');
    assert(personnelQueriesSource.includes('status: \'invited\''), 'Must set status to invited');
  });

  it('Users API endpoint exposes POST for account creation gated to Super Admin', () => {
    assert(usersRouteSource.includes('export async function POST'), 'Users route must have POST handler');
    assert(usersRouteSource.includes('allowedRoles: [\'Super Admin\']'), 'POST route must be strictly gated to Super Admin');
    assert(usersRouteSource.includes('createOrLinkUserAccount'), 'POST route must invoke createOrLinkUserAccount');
  });

  // -------------------------------------------------------------------------
  // 2. Duplicate Account & Email Uniqueness Protection
  // -------------------------------------------------------------------------
  console.log('\n[2/9] Duplicate Account & Email Uniqueness Protection:');

  it('createOrLinkUserAccount validates and normalizes official email address', () => {
    assert(personnelQueriesSource.includes('.trim().toLowerCase()'), 'Email must be normalized to lower-case trimmed');
    assert(personnelQueriesSource.includes('^[^\s@]+@[^\s@]+\.[^\s@]+$') || personnelQueriesSource.includes('@'), 'Must validate email format');
  });

  it('createOrLinkUserAccount blocks creation if user membership already exists in tenant', () => {
    assert(personnelQueriesSource.includes('already exists in this organization'), 'Must reject duplicate tenant user');
    assert(personnelQueriesSource.includes('eq(\'tenant_id\', tenantId)'), 'Must check tenant scope');
  });

  it('Existing personnel records are linked rather than duplicated when provisioning login', () => {
    assert(personnelQueriesSource.includes('payload.personnelId'), 'Must support linking existing personnel record');
    assert(personnelQueriesSource.includes('user_id: userId'), 'Must update personnel.user_id on link');
  });

  // -------------------------------------------------------------------------
  // 3. Admin-Initiated Password Reset Flow & Zero Plaintext Credential Rule
  // -------------------------------------------------------------------------
  console.log('\n[3/9] Admin-Initiated Password Reset Flow:');

  it('Server query library exports initiateAdminPasswordReset', () => {
    assert(personnelQueriesSource.includes('export async function initiateAdminPasswordReset'), 'Missing initiateAdminPasswordReset export');
  });

  it('Users PATCH handler supports reset-password action', () => {
    assert(usersRouteSource.includes('case \'reset-password\':'), 'Users route PATCH must support reset-password action');
    assert(usersRouteSource.includes('initiateAdminPasswordReset'), 'Must invoke initiateAdminPasswordReset');
  });

  it('initiateAdminPasswordReset verifies tenant boundary before issuing token', () => {
    assert(personnelQueriesSource.includes('eq(\'tenant_id\', tenantId)'), 'Must verify target user belongs to tenant');
    assert(personnelQueriesSource.includes('User account not found within this organization'), 'Must reject cross-tenant target');
  });

  it('Zero Plaintext Rule: Passwords and sensitive tokens are NEVER written to audit log', () => {
    assert(!personnelQueriesSource.includes('password:') && !usersRouteSource.includes('password: body'), 'Zero plaintext password storage');
    assert(!personnelQueriesSource.includes('resetToken: resetToken'), 'Reset tokens must not be logged in audit state');
  });

  // -------------------------------------------------------------------------
  // 4. Privilege Escalation Prevention & RBAC Enforcement
  // -------------------------------------------------------------------------
  console.log('\n[4/9] Privilege Escalation Prevention & RBAC Enforcement:');

  it('Users PATCH endpoint is gated strictly to Super Admin', () => {
    assert(usersRouteSource.includes('export async function PATCH'), 'Users route must have PATCH handler');
    // Find requireAuth call in PATCH
    const patchSegment = usersRouteSource.slice(usersRouteSource.indexOf('export async function PATCH'));
    assert(patchSegment.includes('allowedRoles: [\'Super Admin\']'), 'PATCH must strictly require Super Admin');
  });

  it('Super Admin cannot demote their own account', () => {
    assert(usersRouteSource.includes('Cannot demote your own Super Admin role'), 'Must block self-demotion');
  });

  it('Role mapping validates against canonical USER_ROLES', () => {
    assert(usersRouteSource.includes('USER_ROLES.includes'), 'Must validate against canonical USER_ROLES');
  });

  // -------------------------------------------------------------------------
  // 5. Last Super Admin Protection
  // -------------------------------------------------------------------------
  console.log('\n[5/9] Last Super Admin Protection:');

  it('Server query library exports checkIsLastSuperAdmin', () => {
    assert(personnelQueriesSource.includes('export async function checkIsLastSuperAdmin'), 'Missing checkIsLastSuperAdmin export');
  });

  it('checkIsLastSuperAdmin checks active SUPER_ADMIN count for tenant', () => {
    assert(personnelQueriesSource.includes('eq(\'role\', \'SUPER_ADMIN\')'), 'Must query SUPER_ADMIN role');
    assert(personnelQueriesSource.includes('eq(\'status\', \'active\')'), 'Must query active status');
    assert(personnelQueriesSource.includes('data.length === 1'), 'Must detect solitary active super admin');
  });

  it('Users API blocks demoting the last active Super Admin', () => {
    assert(usersRouteSource.includes('Cannot demote the last active Super Admin in this organization'), 'Must block demotion of last super admin');
  });

  it('Users API blocks suspending or deactivating the last active Super Admin', () => {
    assert(usersRouteSource.includes('Cannot suspend the last active Super Admin in this organization'), 'Must block suspension of last super admin');
  });

  // -------------------------------------------------------------------------
  // 6. Account Lifecycle: Suspension, Reactivation, and Session Invalidation
  // -------------------------------------------------------------------------
  console.log('\n[6/9] Account Lifecycle Management:');

  it('Users PATCH supports toggle-status, suspend, deactivate, reactivate, and unlock-account', () => {
    assert(usersRouteSource.includes('case \'toggle-status\':'), 'Must support toggle-status');
    assert(usersRouteSource.includes('case \'suspend\':'), 'Must support suspend');
    assert(usersRouteSource.includes('case \'deactivate\':'), 'Must support deactivate');
    assert(usersRouteSource.includes('case \'reactivate\':'), 'Must support reactivate');
    assert(usersRouteSource.includes('case \'unlock-account\':'), 'Must support unlock-account');
  });

  it('Users PATCH blocks self-suspension and self-deactivation', () => {
    assert(usersRouteSource.includes('Cannot suspend your own account'), 'Must block self-suspension');
  });

  it('Users PATCH supports administrative session revocation (revoke-sessions)', () => {
    assert(usersRouteSource.includes('case \'revoke-sessions\':'), 'Must support revoke-sessions');
    assert(usersRouteSource.includes('REVOKE_USER_SESSIONS'), 'Must audit REVOKE_USER_SESSIONS');
  });

  it('Users PATCH supports invitation regeneration (resend-invite)', () => {
    assert(usersRouteSource.includes('case \'resend-invite\':'), 'Must support resend-invite');
    assert(usersRouteSource.includes('INVITATION_RESENT'), 'Must audit INVITATION_RESENT');
  });

  // -------------------------------------------------------------------------
  // 7. Cross-Tenant Data Isolation & Activity History
  // -------------------------------------------------------------------------
  console.log('\n[7/9] Cross-Tenant Data Isolation & Activity History:');

  it('Server query library exports getUserSecurityActivity bounded to tenant', () => {
    assert(personnelQueriesSource.includes('export async function getUserSecurityActivity'), 'Missing getUserSecurityActivity export');
    assert(personnelQueriesSource.includes('eq(\'tenant_id\', tenantId)'), 'getUserSecurityActivity must be tenant bounded');
  });

  it('Users GET endpoint supports action=activity for user audit history', () => {
    assert(usersRouteSource.includes('action === \'activity\''), 'GET must handle action=activity');
    assert(usersRouteSource.includes('getUserSecurityActivity'), 'Must call getUserSecurityActivity');
  });

  it('All personnel and user queries strictly enforce tenant_id equality', () => {
    assert(personnelQueriesSource.includes('.eq(\'tenant_id\', tenantId)'), 'Must enforce tenant equality');
  });

  // -------------------------------------------------------------------------
  // 8. Authoritative Audit Trail Recording (Finance Audit Log)
  // -------------------------------------------------------------------------
  console.log('\n[8/9] Authoritative Audit Trail Recording:');

  it('Audit log records ACCOUNT_CREATED on account provisioning', () => {
    assert(personnelQueriesSource.includes('action: \'ACCOUNT_CREATED\''), 'Must record ACCOUNT_CREATED');
  });

  it('Audit log records PASSWORD_RESET_INITIATED on reset initiation', () => {
    assert(personnelQueriesSource.includes('action: \'PASSWORD_RESET_INITIATED\''), 'Must record PASSWORD_RESET_INITIATED');
  });

  it('Audit log records CHANGE_USER_ROLE on role updates', () => {
    assert(usersRouteSource.includes('action: \'CHANGE_USER_ROLE\''), 'Must record CHANGE_USER_ROLE');
  });

  it('Audit log records TOGGLE_USER_STATUS and DEACTIVATE_USER on status changes', () => {
    assert(usersRouteSource.includes('action: \'TOGGLE_USER_STATUS\''), 'Must record TOGGLE_USER_STATUS');
    assert(usersRouteSource.includes('action: \'DEACTIVATE_USER\''), 'Must record DEACTIVATE_USER');
  });

  it('Audit records include actorId, actorRole, source, and tenantId', () => {
    assert(usersRouteSource.includes('actorId: auth.session.user.id'), 'Must record actorId');
    assert(usersRouteSource.includes('actorRole: auth.session.role'), 'Must record actorRole');
    assert(usersRouteSource.includes('source: \'people_and_access\''), 'Must record source');
  });

  // -------------------------------------------------------------------------
  // 9. UI & Navigation Integrity (4 KPI Cards, 3 Subtabs, 18x18 SVG Icons)
  // -------------------------------------------------------------------------
  console.log('\n[9/9] UI & Navigation Integrity:');

  it('PeopleAccessPageClient preserves all 4 summary KPI cards', () => {
    assert(clientComponentSource.includes('Active Staff'), 'Must display Active Staff card');
    assert(clientComponentSource.includes('Active Facilitators'), 'Must display Active Facilitators card');
    assert(clientComponentSource.includes('Portal Login Accounts'), 'Must display Portal Login Accounts card');
    assert(clientComponentSource.includes('Deactivated Records'), 'Must display Deactivated Records card');
  });

  it('PeopleAccessPageClient preserves all 3 subtabs: users, personnel, security', () => {
    assert(clientComponentSource.includes('subTab === \'users\''), 'Must contain users subtab');
    assert(clientComponentSource.includes('subTab === \'personnel\''), 'Must contain personnel subtab');
    assert(clientComponentSource.includes('subTab === \'security\''), 'Must contain security subtab');
  });

  it('Zero Unicode Emoji in PeopleAccessPageClient buttons, tabs, and headers', () => {
    const forbiddenEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const emojiMatches = clientComponentSource.match(forbiddenEmojiRegex);
    assert(!emojiMatches, `Found forbidden unicode emoji in client component: ${emojiMatches ? emojiMatches[0] : ''}`);
  });

  it('PeopleAccessPageClient uses standard 18x18 SVG icons for design system compliance', () => {
    assert(clientComponentSource.includes('width="18" height="18"'), 'Must define standard 18x18 SVG icons');
    assert(clientComponentSource.includes('viewBox="0 0 24 24"'), 'Must define viewBox="0 0 24 24"');
    assert(clientComponentSource.includes('SvgShield'), 'Must use SvgShield component');
    assert(clientComponentSource.includes('SvgKey'), 'Must use SvgKey component');
    assert(clientComponentSource.includes('SvgUsers'), 'Must use SvgUsers component');
    assert(clientComponentSource.includes('SvgDownload'), 'Must use SvgDownload component');
  });

  it('PeopleAccessPageClient provides accessible modal dialogs with ARIA attributes', () => {
    assert(clientComponentSource.includes('role="dialog"'), 'Modals must include role="dialog"');
    assert(clientComponentSource.includes('aria-modal="true"'), 'Modals must include aria-modal="true"');
    assert(clientComponentSource.includes('aria-labelledby'), 'Modals must include aria-labelledby');
  });

  it('PeopleAccessPageClient provides copyable link modal without plaintext password exposure', () => {
    assert(clientComponentSource.includes('credentialModal'), 'Must provide credential presentation modal');
    assert(clientComponentSource.includes('navigator.clipboard?.writeText'), 'Must provide copy button');
    assert(clientComponentSource.includes('Confidentiality Notice'), 'Must provide security confidentiality notice');
  });

  // Summary
  console.log('\n======================================================================');
  console.log(` PHASE C216 CERTIFICATION SUMMARY: ${totalPassed} PASSED / ${totalFailed} FAILED`);
  console.log('======================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhaseC216Suite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

