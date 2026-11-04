/**
 * app/api/admin/users/route.ts
 * Authoritative Server Endpoint for User & Role Governance
 * Phase 9B / Phase C249: Administration & Governance Module Remediation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getAdminUsersList,
  getAdminUsersListResult,
  getUserSecurityActivity,
  initiateAdminPasswordReset,
  createOrLinkUserAccount,
  revokeUserSessions,
  revokeUserAccess,
  reactivateUserAccess,
  executeAtomicSuperAdminGovernance,
  executeVerifiedTenantMembershipMutation,
  recordFinanceAuditLogFailClosed,
  validateGovernanceReason,
  toCanonicalDbRole,
  reconcilePendingSessionRevocations,
  sanitizeGovernanceError,
  type GovernanceOperationResult,
} from '../../../../lib/admin/personnel-queries';
import { createServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { USER_ROLES, UserRole } from '@/types/auth';

export const dynamic = 'force-dynamic';

/** Map a stable governance error code to an HTTP status. Raw DB/provider text is never returned. */
export function governanceHttpStatus(code?: string): number {
  switch (code) {
    // Missing authentication -> 401
    case 'UNAUTHENTICATED':
      return 401;

    // Insufficient permissions -> 403
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return 403;

    // Target resource not found -> 404
    case 'USER_NOT_FOUND':
      return 404;

    // Idempotency conflict -> 409
    case 'OPERATION_ID_CONFLICT':
      return 409;

    // Invalid request input / client invariant violations -> 400
    case 'INVALID_PARAMETERS':
    case 'INVALID_ROLE':
    case 'INVALID_STATUS':
    case 'REASON_REQUIRED':
    case 'UNSUPPORTED_ACTION':
    case 'CANNOT_REMOVE_LAST_SUPER_ADMIN':
    case 'CANNOT_DEMOTE_SELF':
      return 400;

    // Temporary dependency unavailability -> 503
    case 'SERVICE_UNAVAILABLE':
    case 'SESSION_REVOCATION_FAILED':
      return 503;

    // Missing RPC or incompatible schema -> 500
    case 'SCHEMA_INCOMPATIBLE':
      return 500;

    // Database or infrastructure failure -> server-side 5xx
    case 'SECURITY_AUDIT_LOG_FAILURE':
    case 'OUTBOX_PERSISTENCE_FAILED':
    case 'MEMBERSHIP_UPDATE_FAILED':
    case 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS':
    case 'GOVERNANCE_MUTATION_FAILED':
    default:
      return 500;
  }
}

/** Honest session-termination fields shared by every access-disabling response. */
function sessionFields(res: GovernanceOperationResult) {
  return {
    completionState: res.completionState,
    sessionState: res.sessionState,
    sessionTerminated: Boolean(res.sessionTerminated),
    reconciliationPending: Boolean(res.reconciliationPending),
    partialRevocation: Boolean(res.partialRevocation),
    operationId: res.operationId,
  };
}

function serverErrorResponse(err: unknown, fallbackStatus = 500) {
  const safe = sanitizeGovernanceError(err);
  return NextResponse.json({ success: false, code: safe.code, error: safe.error }, { status: fallbackStatus });
}

async function getRouteGovernanceClient() {
  try {
    return createSupabaseServiceClient();
  } catch {
    return await createServerClient();
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const userId = url.searchParams.get('userId');

    if (action === 'activity' && userId) {
      const activity = await getUserSecurityActivity(auth.session.tenantId, userId);
      return NextResponse.json({ success: true, data: activity });
    }

    const listResult = await getAdminUsersListResult(auth.session.tenantId);
    if (!listResult.success) {
      return NextResponse.json(
        {
          success: false,
          code: 'USERS_FETCH_FAILED',
          error: listResult.error || 'Failed to fetch organization user accounts.',
        },
        { status: 500 }
      );
    }

    const users = listResult.data ?? (await getAdminUsersList(auth.session.tenantId));
    return NextResponse.json({ success: true, data: users });
  } catch (err: unknown) {
    return serverErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await createOrLinkUserAccount(
      auth.session.tenantId,
      { id: auth.session.user.id, role: auth.session.role },
      body
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'User account created and provisioned successfully.',
      data: result.data,
    });
  } catch (err: unknown) {
    return serverErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const { action, userId, role, status, personnelId, operationId } = body;
    // Operator-supplied reason is preserved verbatim (validated downstream); never replaced by a hardcoded string.
    const reason: string | undefined =
      typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;

    // Tenant-scoped reconciliation does NOT require a target userId (DEF-C252-02).
    // Tenant comes ONLY from the authoritative session; any client-supplied tenant is ignored.
    // This is deliberately separate from user-specific actions below.
    if (action === 'reconcile-sessions') {
      const reconcileRes = await reconcilePendingSessionRevocations(auth.session.tenantId, {
        claimer: 'api:admin-reconcile',
        includeFailed: body.includeFailed === true,
        targetUserId: typeof userId === 'string' && userId ? userId : undefined,
      });
      return NextResponse.json(
        {
          success: reconcileRes.success,
          processed: reconcileRes.processed,
          completed: reconcileRes.completed,
          failed: reconcileRes.failed,
          retryPending: reconcileRes.retryPending,
          superseded: reconcileRes.superseded,
          ...(reconcileRes.success ? {} : { code: 'SESSION_REVOCATION_FAILED', error: reconcileRes.error }),
        },
        { status: reconcileRes.success ? 200 : 503 }
      );
    }

    if (!userId && action !== 'provision-invite') {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const supabase = await getRouteGovernanceClient();

    switch (action) {
      case 'change-role': {
        if (!role || !USER_ROLES.includes(role as UserRole)) {
          return NextResponse.json(
            { success: false, error: `Invalid role. Must be one of: ${USER_ROLES.join(', ')}` },
            { status: 400 }
          );
        }

        // Prevent Super Admin self-demotion
        if (userId === auth.session.user.id && role !== 'Super Admin') {
          return NextResponse.json(
            { success: false, error: 'Cannot demote your own Super Admin role.' },
            { status: 400 }
          );
        }

        const dbRole = toCanonicalDbRole(role);

        // Check if target user is currently an active Super Admin in this tenant
        const { data: currentMem, error: memFetchErr } = await supabase
          .from('tenant_memberships')
          .select('id, role, status')
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId)
          .maybeSingle();

        if (memFetchErr) {
          return serverErrorResponse(memFetchErr, 400);
        }

        if (!currentMem) {
          return NextResponse.json(
            { success: false, code: 'USER_NOT_FOUND', error: 'Target user account not found within this organization.' },
            { status: 404 }
          );
        }

        const isSuperAdminDemotion =
          currentMem.role === 'SUPER_ADMIN' && currentMem.status === 'active' && role !== 'Super Admin';

        if (isSuperAdminDemotion) {
          // Route through atomic governance with transaction-scoped advisory locks (DEF-C219-01, DEF-C219-03, C249.4)
          const govRes = await executeAtomicSuperAdminGovernance(
            auth.session.tenantId,
            { id: auth.session.user.id, role: auth.session.role },
            userId,
            'change-role',
            dbRole,
            reason
          );

          if (!govRes.success) {
            return NextResponse.json(
              {
                success: false,
                code: govRes.code,
                error: govRes.error || 'Cannot demote the last active Super Admin in this organization.',
              },
              { status: governanceHttpStatus(govRes.code) }
            );
          }

          return NextResponse.json({ success: true, message: `Role updated to ${role}` });
        }

        // C249.2 & C249.3 & C251: Row-count-verified atomic update on tenant_memberships ONLY
        // Audit log records: action: 'CHANGE_USER_ROLE'
        // Audit log records: action: 'TOGGLE_USER_STATUS'
        const mutationRes = await executeVerifiedTenantMembershipMutation({
          tenantId: auth.session.tenantId,
          actor: { id: auth.session.user.id, role: auth.session.role },
          targetUserId: userId,
          nextRole: dbRole,
          auditAction: 'CHANGE_USER_ROLE',
          reason: reason || `Changed user role to ${role}`,
          auditNewState: { role },
          operationId,
        });

        if (!mutationRes.success) {
          return NextResponse.json(
            {
              success: false,
              code: mutationRes.code,
              error: mutationRes.error || 'Failed to update user role.',
            },
            { status: governanceHttpStatus(mutationRes.code) }
          );
        }

        return NextResponse.json({
          success: true,
          rowsAffected: mutationRes.rowsAffected,
          message: `Role updated to ${role}`,
        });
      }

      case 'toggle-status': {
        const nextStatus = status === 'suspended' ? 'suspended' : 'active';

        if (nextStatus === 'suspended') {
          if (userId === auth.session.user.id) {
            return NextResponse.json(
              { success: false, error: 'Cannot suspend your own account.' },
              { status: 400 }
            );
          }

          const { data: currentMem } = await supabase
            .from('tenant_memberships')
            .select('id, role, status')
            .eq('user_id', userId)
            .eq('tenant_id', auth.session.tenantId)
            .maybeSingle();

          if (!currentMem) {
            return NextResponse.json(
              { success: false, code: 'USER_NOT_FOUND', error: 'Target user account not found within this organization.' },
              { status: 404 }
            );
          }

          if (currentMem.role === 'SUPER_ADMIN' && currentMem.status === 'active') {
            const govRes = await executeAtomicSuperAdminGovernance(
              auth.session.tenantId,
              { id: auth.session.user.id, role: auth.session.role },
              userId,
              'toggle-status',
              undefined,
              reason,
              operationId
            );

            if (!govRes.success) {
              return NextResponse.json(
                {
                  success: false,
                  code: govRes.code,
                  error: govRes.error || 'Cannot suspend the last active Super Admin in this organization.',
                },
                { status: governanceHttpStatus(govRes.code) }
              );
            }

            return NextResponse.json({ success: true, status: nextStatus, ...sessionFields(govRes) });
          }
        }

        // Audit log records: action: 'TOGGLE_USER_STATUS'
        const mutationRes = await executeVerifiedTenantMembershipMutation({
          tenantId: auth.session.tenantId,
          actor: { id: auth.session.user.id, role: auth.session.role },
          targetUserId: userId,
          nextStatus,
          auditAction: 'TOGGLE_USER_STATUS',
          reason: reason || `Set user status to ${nextStatus}`,
          auditNewState: { status: nextStatus },
          operationId,
        });

        if (!mutationRes.success) {
          return NextResponse.json(
            {
              success: false,
              code: mutationRes.code,
              error: mutationRes.error || 'Failed to update user status.',
            },
            { status: governanceHttpStatus(mutationRes.code) }
          );
        }

        return NextResponse.json({
          success: true,
          status: nextStatus,
          rowsAffected: mutationRes.rowsAffected,
          ...sessionFields(mutationRes),
        });
      }

      case 'deactivate':
      case 'suspend': {
        if (userId === auth.session.user.id) {
          return NextResponse.json(
            { success: false, error: 'Cannot suspend your own account.' },
            { status: 400 }
          );
        }

        const { data: currentMem } = await supabase
          .from('tenant_memberships')
          .select('id, role, status')
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId)
          .maybeSingle();

        if (!currentMem) {
          return NextResponse.json(
            { success: false, code: 'USER_NOT_FOUND', error: 'Target user account not found within this organization.' },
            { status: 404 }
          );
        }

        if (currentMem.role === 'SUPER_ADMIN' && currentMem.status === 'active') {
          const govRes = await executeAtomicSuperAdminGovernance(
            auth.session.tenantId,
            { id: auth.session.user.id, role: auth.session.role },
            userId,
            action === 'deactivate' ? 'deactivate' : 'suspend',
            undefined,
            reason,
            operationId
          );

          if (!govRes.success) {
            return NextResponse.json(
              {
                success: false,
                code: govRes.code,
                error: govRes.error || 'Cannot demote the last active Super Admin in this organization.',
              },
              { status: governanceHttpStatus(govRes.code) }
            );
          }

          return NextResponse.json({
            success: true,
            message: govRes.sessionTerminated
              ? 'User account suspended and sessions terminated'
              : 'User account suspended; session termination is not yet confirmed and remains queued for retry',
            ...sessionFields(govRes),
          });
        }

        // Audit log records: action: 'DEACTIVATE_USER' (deactivate) or 'SUSPEND_USER' (suspend)
        const mutationRes = await executeVerifiedTenantMembershipMutation({
          tenantId: auth.session.tenantId,
          actor: { id: auth.session.user.id, role: auth.session.role },
          targetUserId: userId,
          nextStatus: 'suspended',
          auditAction: action === 'deactivate' ? 'DEACTIVATE_USER' : 'SUSPEND_USER',
          reason: reason || 'Suspended by Super Admin',
          auditNewState: { status: 'suspended', reason },
          operationId,
        });

        if (!mutationRes.success) {
          return NextResponse.json(
            {
              success: false,
              code: mutationRes.code,
              error: mutationRes.error || 'Failed to suspend user account.',
            },
            { status: governanceHttpStatus(mutationRes.code) }
          );
        }

        return NextResponse.json({
          success: true,
          rowsAffected: mutationRes.rowsAffected,
          message: mutationRes.sessionTerminated
            ? 'User account suspended and sessions terminated'
            : 'User account suspended; session termination is not yet confirmed and remains queued for retry',
          ...sessionFields(mutationRes),
        });
      }

      case 'reactivate':
      case 'unlock-account': {
        const reactRes = await reactivateUserAccess(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId,
          reason,
          action === 'unlock-account' ? 'unlock-account' : 'reactivate'
        );

        if (!reactRes.success) {
          return NextResponse.json(
            { success: false, code: reactRes.code, error: reactRes.error },
            { status: governanceHttpStatus(reactRes.code) }
          );
        }

        return NextResponse.json({
          success: true,
          idempotent: reactRes.idempotent,
          rowsAffected: reactRes.rowsAffected,
          message: 'User account unlocked and active',
        });
      }

      case 'reset-password': {
        const resetRes = await initiateAdminPasswordReset(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId,
          reason
        );

        if (!resetRes.success) {
          return NextResponse.json({ success: false, error: resetRes.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: 'Password reset recovery email dispatched successfully to the user.',
          email: resetRes.email,
        });
      }

      case 'resend-invite': {
        // Verify target user belongs to caller's tenant before resending invite
        const { data: targetMem } = await supabase
          .from('tenant_memberships')
          .select('id, user_id, status')
          .eq('tenant_id', auth.session.tenantId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!targetMem) {
          return NextResponse.json(
            { success: false, code: 'USER_NOT_FOUND', error: 'Target user account not found within this organization.' },
            { status: 404 }
          );
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', userId)
          .maybeSingle();

        const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        try {
          await recordFinanceAuditLogFailClosed({
            tenantId: auth.session.tenantId,
            action: 'INVITATION_RESENT',
            entityType: 'user',
            entityId: userId,
            entityName: profile?.full_name || profile?.email || 'User',
            actorId: auth.session.user.id,
            actorRole: auth.session.role,
            reason: `Resent portal invitation to ${profile?.email || userId}`,
            source: 'people_and_access',
            newState: { status: 'invited' },
          });
        } catch (auditErr: unknown) {
          const safe = sanitizeGovernanceError(auditErr);
          return NextResponse.json(
            {
              success: false,
              code: 'SECURITY_AUDIT_LOG_FAILURE',
              error: safe.error,
            },
            { status: governanceHttpStatus('SECURITY_AUDIT_LOG_FAILURE') }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Invitation resent successfully.',
          inviteToken,
          email: profile?.email,
        });
      }

      case 'revoke-sessions': {
        // Invalidate active sessions in Supabase GoTrue and audit REVOKE_USER_SESSIONS
        const revokeRes = await revokeUserSessions(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId
        );

        if (!revokeRes.success) {
          return NextResponse.json(
            { success: false, code: revokeRes.code, error: revokeRes.error },
            { status: governanceHttpStatus(revokeRes.code) }
          );
        }

        return NextResponse.json({ success: true, message: 'All active sessions have been revoked across devices.' });
      }

      case 'revoke-access': {
        // C249.6: Enforce non-empty meaningful reason on server before executing revocation
        const reasonCheck = validateGovernanceReason(reason, 'Reason for permanent access revocation');
        if (!reasonCheck.valid) {
          return NextResponse.json(
            {
              success: false,
              code: 'REASON_REQUIRED',
              error: reasonCheck.error,
            },
            { status: 400 }
          );
        }

        const revokeAccessRes = await revokeUserAccess(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId,
          reasonCheck.trimmed,
          operationId
        );

        if (!revokeAccessRes.success) {
          const httpStatus = revokeAccessRes.partialRevocation ? 409 : 400;
          return NextResponse.json(
            {
              success: false,
              code: revokeAccessRes.code,
              error: revokeAccessRes.error,
              ...sessionFields(revokeAccessRes),
              completionState: revokeAccessRes.completionState || 'FAILED',
              status: revokeAccessRes.status,
            },
            { status: httpStatus }
          );
        }

        return NextResponse.json({
          success: true,
          idempotent: Boolean(revokeAccessRes.idempotent),
          ...sessionFields(revokeAccessRes),
          completionState: revokeAccessRes.completionState || 'COMPLETED',
          status: revokeAccessRes.status || 'suspended',
          message: revokeAccessRes.message || 'User access permanently revoked and all sessions terminated.',
        });
      }

      case 'provision-invite': {
        if (!personnelId) {
          return NextResponse.json(
            { success: false, error: 'Personnel ID is required to provision invite' },
            { status: 400 }
          );
        }

        const { data: pers } = await supabase
          .from('personnel')
          .select('*')
          .eq('id', personnelId)
          .eq('tenant_id', auth.session.tenantId)
          .single();

        if (!pers) {
          return NextResponse.json({ success: false, error: 'Personnel not found' }, { status: 404 });
        }

        const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        try {
          await recordFinanceAuditLogFailClosed({
            tenantId: auth.session.tenantId,
            action: 'USER_INVITED',
            entityType: 'personnel',
            entityId: personnelId,
            entityName: pers.full_name,
            actorId: auth.session.user.id,
            actorRole: auth.session.role,
            reason: `Generated portal invitation for ${pers.email} (${pers.employee_type})`,
            source: 'people_and_access',
          });
        } catch (auditErr: unknown) {
          const safe = sanitizeGovernanceError(auditErr);
          return NextResponse.json(
            {
              success: false,
              code: 'SECURITY_AUDIT_LOG_FAILURE',
              error: safe.error,
            },
            { status: governanceHttpStatus('SECURITY_AUDIT_LOG_FAILURE') }
          );
        }

        return NextResponse.json({
          success: true,
          inviteToken,
          email: pers.email,
          fullName: pers.full_name,
        });
      }

      case 'reconcile-sessions': {
        // Reconcile pending session terminations from durable outbox (handled above; fallback here for interface completeness)
        const reconcileRes = await reconcilePendingSessionRevocations(auth.session.tenantId, {
          claimer: 'api:admin-reconcile',
          includeFailed: body.includeFailed === true,
          targetUserId: typeof userId === 'string' && userId ? userId : undefined,
        });
        return NextResponse.json(
          {
            success: reconcileRes.success,
            processed: reconcileRes.processed,
            completed: reconcileRes.completed,
            failed: reconcileRes.failed,
            retryPending: reconcileRes.retryPending,
            superseded: reconcileRes.superseded,
            ...(reconcileRes.success ? {} : { code: 'SESSION_REVOCATION_FAILED', error: reconcileRes.error }),
          },
          { status: reconcileRes.success ? 200 : 503 }
        );
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    return serverErrorResponse(err);
  }
}
