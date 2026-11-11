/**
 * app/api/admin/users/route.ts
 * Authoritative Server Endpoint for User & Role Governance
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getAdminUsersList,
  getUserSecurityActivity,
  initiateAdminPasswordReset,
  createOrLinkUserAccount,
  revokeUserSessions,
  revokeUserAccess,
  reactivateUserAccess,
  executeAtomicSuperAdminGovernance,
  recordFinanceAuditLogFailClosed,
} from '../../../../lib/admin/personnel-queries';
import { recordFinanceAuditLog } from '@/lib/finance/queries';
import { createServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { USER_ROLES, UserRole } from '@/types/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('userId');

  if (action === 'activity' && userId) {
    const activity = await getUserSecurityActivity(auth.session.tenantId, userId);
    return NextResponse.json({ success: true, data: activity });
  }

  const users = await getAdminUsersList(auth.session.tenantId);
  return NextResponse.json({ success: true, data: users });
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
    const message = err instanceof Error ? err.message : 'Server error while creating user';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const { action, userId, role, status, reason, personnelId } = body;

    if (!userId && action !== 'provision-invite') {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

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

        // Map role to DB enum
        const dbRole = role === 'Super Admin' ? 'SUPER_ADMIN'
          : role === 'Finance Manager' ? 'FINANCE_MANAGER'
          : role === 'Finance Staff' ? 'FINANCE_STAFF'
          : 'STAFF';

        // Check if target user is currently an active Super Admin
        const { data: currentMem } = await supabase
          .from('tenant_memberships')
          .select('role, status')
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId)
          .maybeSingle();

        const isSuperAdminDemotion = currentMem?.role === 'SUPER_ADMIN' && currentMem?.status === 'active' && role !== 'Super Admin';

        if (isSuperAdminDemotion) {
          // Route through atomic governance with transaction-scoped advisory locks (DEF-C219-01, DEF-C219-03)
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
              { success: false, error: govRes.error || 'Cannot demote the last active Super Admin in this organization.' },
              { status: 400 }
            );
          }

          return NextResponse.json({ success: true, message: `Role updated to ${role}` });
        }

        const { error: roleErr } = await supabase
          .from('tenant_memberships')
          .update({ role: dbRole, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (roleErr) {
          return NextResponse.json({ success: false, error: roleErr.message }, { status: 500 });
        }

        // Also update profiles role for consistency using service client (C330D)
        const serviceClient = createSupabaseServiceClient();
        await serviceClient
          .from('profiles')
          .update({ role: dbRole, updated_at: new Date().toISOString() })
          .eq('id', userId);

        await recordFinanceAuditLogFailClosed({
          tenantId: auth.session.tenantId,
          action: 'CHANGE_USER_ROLE',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: `Changed user role to ${role}`,
          source: 'people_and_access',
          newState: { role },
        });

        return NextResponse.json({ success: true, message: `Role updated to ${role}` });
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
            .select('role, status')
            .eq('user_id', userId)
            .eq('tenant_id', auth.session.tenantId)
            .maybeSingle();

          if (currentMem?.role === 'SUPER_ADMIN' && currentMem?.status === 'active') {
            const govRes = await executeAtomicSuperAdminGovernance(
              auth.session.tenantId,
              { id: auth.session.user.id, role: auth.session.role },
              userId,
              'suspend',
              undefined,
              reason
            );

            if (!govRes.success) {
              return NextResponse.json(
                { success: false, error: govRes.error || 'Cannot suspend the last active Super Admin in this organization.' },
                { status: 400 }
              );
            }

            return NextResponse.json({ success: true, status: nextStatus });
          }
        }

        const { error: statErr } = await supabase
          .from('tenant_memberships')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (statErr) {
          return NextResponse.json({ success: false, error: statErr.message }, { status: 500 });
        }

        await recordFinanceAuditLogFailClosed({
          tenantId: auth.session.tenantId,
          action: 'TOGGLE_USER_STATUS',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: `Set user status to ${nextStatus}`,
          source: 'people_and_access',
          newState: { status: nextStatus },
        });

        return NextResponse.json({ success: true, status: nextStatus });
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
          .select('role, status')
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId)
          .maybeSingle();

        if (currentMem?.role === 'SUPER_ADMIN' && currentMem?.status === 'active') {
          const govRes = await executeAtomicSuperAdminGovernance(
            auth.session.tenantId,
            { id: auth.session.user.id, role: auth.session.role },
            userId,
            'suspend',
            undefined,
            reason
          );

          if (!govRes.success) {
            return NextResponse.json(
              { success: false, error: govRes.error || 'Cannot demote the last active Super Admin in this organization.' },
              { status: 400 }
            );
          }

          return NextResponse.json({ success: true, message: 'User account suspended' });
        }

        const { error: deactErr } = await supabase
          .from('tenant_memberships')
          .update({ status: 'suspended', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (deactErr) {
          return NextResponse.json({ success: false, error: deactErr.message }, { status: 500 });
        }

        await recordFinanceAuditLogFailClosed({
          tenantId: auth.session.tenantId,
          action: 'DEACTIVATE_USER',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: reason || 'Suspended by Super Admin',
          source: 'people_and_access',
          newState: { status: 'suspended', reason },
        });

        return NextResponse.json({ success: true, message: 'User account suspended' });
      }

      case 'reactivate':
      case 'unlock-account': {
        const reactRes = await reactivateUserAccess(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId,
          reason
        );

        if (!reactRes.success) {
          return NextResponse.json({ success: false, error: reactRes.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'User account unlocked and active' });
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
        const serviceClient = createSupabaseServiceClient();
        const { data: profile } = await serviceClient
          .from('profiles')
          .select('email, full_name')
          .eq('id', userId)
          .maybeSingle();

        const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
            { success: false, code: revokeRes.code || 'REVOKE_SESSIONS_FAILED', error: revokeRes.error },
            { status: 400 }
          );
        }

        return NextResponse.json({ success: true, message: 'All active sessions have been revoked across devices.' });
      }

      case 'revoke-access': {
        const revokeAccessRes = await revokeUserAccess(
          auth.session.tenantId,
          { id: auth.session.user.id, role: auth.session.role },
          userId,
          reason
        );

        if (!revokeAccessRes.success) {
          return NextResponse.json({ success: false, error: revokeAccessRes.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
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

        await recordFinanceAuditLog({
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

        return NextResponse.json({
          success: true,
          inviteToken,
          email: pers.email,
          fullName: pers.full_name,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
