/**
 * app/api/ess/security/route.ts — Employee Security API (Password Change)
 * Phase 9E: User Workspaces Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await request.json();
    const { newPassword } = body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // Update password in Supabase Auth
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || 'Failed to update password' },
        { status: 400 }
      );
    }

    // Write immutable audit log
    await supabase.from('finance_audit_log').insert({
      tenant_id: session.tenantId,
      action: 'PASSWORD_CHANGE',
      entity_type: 'user',
      entity_id: session.user.id,
      entity_name: session.user.email,
      old_state: { action: 'change_password_attempt' },
      new_state: { action: 'password_updated_success' },
      reason: `User ${session.user.email} updated personal password via Employee Self-Service`,
      actor_id: session.user.id,
      actor_role: session.role,
      source: 'EMPLOYEE_SELF_SERVICE',
    }).select().maybeSingle();

    return NextResponse.json({
      success: true,
      message: 'Password successfully updated.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
