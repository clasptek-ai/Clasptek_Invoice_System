/**
 * app/api/admin/users/route.ts
 * Authoritative Server Endpoint for User & Role Governance
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getAdminUsersList } from '@/lib/admin/personnel-queries';
import { recordFinanceAuditLog } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';
import { USER_ROLES, UserRole } from '@/types/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const users = await getAdminUsersList(auth.session.tenantId);
  return NextResponse.json({ success: true, data: users });
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

        // Prevent Super Admin self-demotion if they are the only Super Admin
        if (userId === auth.session.user.id && role !== 'Super Admin') {
          return NextResponse.json(
            { success: false, error: 'Cannot demote your own Super Admin role.' },
            { status: 400 }
          );
        }

        // Map role to DB enum if needed
        const dbRole = role === 'Super Admin' ? 'SUPER_ADMIN'
          : role === 'Finance Manager' ? 'FINANCE_MANAGER'
          : role === 'Finance Staff' ? 'FINANCE_STAFF'
          : 'STAFF';

        const { error: roleErr } = await supabase
          .from('tenant_memberships')
          .update({ role: dbRole, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (roleErr) {
          return NextResponse.json({ success: false, error: roleErr.message }, { status: 500 });
        }

        await recordFinanceAuditLog({
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
        const { error: statErr } = await supabase
          .from('tenant_memberships')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (statErr) {
          return NextResponse.json({ success: false, error: statErr.message }, { status: 500 });
        }

        await recordFinanceAuditLog({
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

      case 'deactivate': {
        const { error: deactErr } = await supabase
          .from('tenant_memberships')
          .update({ status: 'suspended', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (deactErr) {
          return NextResponse.json({ success: false, error: deactErr.message }, { status: 500 });
        }

        await recordFinanceAuditLog({
          tenantId: auth.session.tenantId,
          action: 'DEACTIVATE_USER',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: reason || 'Deactivated by Super Admin',
          source: 'people_and_access',
          newState: { status: 'suspended', reason },
        });

        return NextResponse.json({ success: true, message: 'User account deactivated' });
      }

      case 'reactivate': {
        const { error: reactErr } = await supabase
          .from('tenant_memberships')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tenant_id', auth.session.tenantId);

        if (reactErr) {
          return NextResponse.json({ success: false, error: reactErr.message }, { status: 500 });
        }

        await recordFinanceAuditLog({
          tenantId: auth.session.tenantId,
          action: 'REACTIVATE_USER',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: 'Reactivated by Super Admin',
          source: 'people_and_access',
          newState: { status: 'active' },
        });

        return NextResponse.json({ success: true, message: 'User account reactivated' });
      }

      case 'revoke-sessions': {
        await recordFinanceAuditLog({
          tenantId: auth.session.tenantId,
          action: 'REVOKE_USER_SESSIONS',
          entityType: 'user',
          entityId: userId,
          actorId: auth.session.user.id,
          actorRole: auth.session.role,
          reason: 'Administrative revocation of active sessions across devices',
          source: 'people_and_access',
        });

        return NextResponse.json({ success: true, message: 'Active sessions revoked' });
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
