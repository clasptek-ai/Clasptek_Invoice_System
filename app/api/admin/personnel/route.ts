/**
 * app/api/admin/personnel/route.ts
 * Authoritative Server Endpoint for Personnel Management
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getAdminPersonnelList,
  createPersonnelRecord,
  updatePersonnelRecord,
} from '@/lib/admin/personnel-queries';
import { recordFinanceAuditLog } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const action = request.nextUrl.searchParams.get('action');
  if (action === 'check-dependencies') {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    const supabase = await createServerClient();
    const { count: payslipCount } = await supabase
      .from('payslips')
      .select('id', { count: 'exact', head: true })
      .eq('personnel_id', id)
      .eq('tenant_id', auth.session.tenantId);
    const { count: reportCount } = await supabase
      .from('facilitator_reports')
      .select('id', { count: 'exact', head: true })
      .eq('facilitator_id', id)
      .eq('tenant_id', auth.session.tenantId);
    return NextResponse.json({
      success: true,
      payslipCount: payslipCount || 0,
      reportCount: reportCount || 0,
    });
  }

  const personnel = await getAdminPersonnelList(auth.session.tenantId);
  return NextResponse.json({ success: true, data: personnel });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await createPersonnelRecord(
      auth.session.tenantId,
      { id: auth.session.user.id, role: auth.session.role },
      body
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request payload';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();

    if (body.ids && Array.isArray(body.ids) && body.employmentStatus) {
      const supabase = await createServerClient();
      const { error: updErr } = await supabase
        .from('personnel')
        .update({ employment_status: body.employmentStatus, updated_at: new Date().toISOString() })
        .in('id', body.ids)
        .eq('tenant_id', auth.session.tenantId);
      if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
      return NextResponse.json({ success: true, count: body.ids.length });
    }

    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Personnel ID is required' },
        { status: 400 }
      );
    }

    const result = await updatePersonnelRecord(
      auth.session.tenantId,
      id,
      { id: auth.session.user.id, role: auth.session.role },
      updates
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request payload';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const personnelId = searchParams.get('id');

    if (!personnelId) {
      return NextResponse.json(
        { success: false, error: 'Personnel ID is required for deletion' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // 1. Fetch target personnel
    const { data: target, error: fetchErr } = await supabase
      .from('personnel')
      .select('*')
      .eq('id', personnelId)
      .eq('tenant_id', auth.session.tenantId)
      .single();

    if (fetchErr || !target) {
      return NextResponse.json(
        { success: false, error: 'Personnel record not found in tenant' },
        { status: 404 }
      );
    }

    // 2. Prevent self-deletion
    if (target.user_id && target.user_id === auth.session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Self-deletion prohibited: Cannot delete your own personnel profile' },
        { status: 400 }
      );
    }

    // 3. Dependency safety check: inspect payslips
    const { count: payslipCount } = await supabase
      .from('payslips')
      .select('id', { count: 'exact', head: true })
      .eq('personnel_id', personnelId)
      .eq('tenant_id', auth.session.tenantId);

    if (payslipCount && payslipCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete personnel: ${payslipCount} historical payslip records exist. Use deactivation to preserve financial audit trail.`,
        },
        { status: 409 }
      );
    }

    // 4. Dependency safety check: inspect facilitator sessions / reports
    const { count: reportCount } = await supabase
      .from('facilitator_reports')
      .select('id', { count: 'exact', head: true })
      .eq('facilitator_id', personnelId)
      .eq('tenant_id', auth.session.tenantId);

    if (reportCount && reportCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete facilitator: ${reportCount} facilitator reports exist. Deactivate instead.`,
        },
        { status: 409 }
      );
    }

    // 5. Execute deletion
    const { error: delErr } = await supabase
      .from('personnel')
      .delete()
      .eq('id', personnelId)
      .eq('tenant_id', auth.session.tenantId);

    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }

    // 6. Record authoritative audit event
    await recordFinanceAuditLog({
      tenantId: auth.session.tenantId,
      action: 'DELETE_PERSONNEL',
      entityType: 'personnel',
      entityId: personnelId,
      entityName: target.full_name,
      actorId: auth.session.user.id,
      actorRole: auth.session.role,
      reason: `Permanently deleted personnel record ${target.employee_id} (0 historical dependencies verified)`,
      source: 'people_and_access',
      oldState: target,
    });

    return NextResponse.json({ success: true, message: `Personnel ${target.employee_id} deleted` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
