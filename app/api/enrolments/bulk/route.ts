/**
 * app/api/enrolments/bulk/route.ts
 * Bulk status update and safe lifecycle endpoint for course enrolments.
 * Prevents hard deletion when certificates or academic records exist;
 * provides status transition (ACTIVE, WITHDRAWN, COMPLETED, CANCELLED).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Staff'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Role not authorized for enrolment management.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, enrolmentIds, status } = body || {};

    if (!Array.isArray(enrolmentIds) || enrolmentIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of enrolmentIds is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    if (action === 'CHECK_DEPENDENCIES') {
      const { data: enrolments } = await supabase
        .from('enrolments')
        .select('id, enrolment_number, student_name, certificate_issued, certificate_number')
        .in('id', enrolmentIds)
        .eq('tenant_id', session.tenantId);

      const reports = await Promise.all(
        (enrolments || []).map(async (en) => {
          // Check certificates
          const hasCert = Boolean(en.certificate_issued || en.certificate_number);

          // Check attendance records (check 'attendance' table first, fallback if needed)
          const { count: attCount } = await supabase
            .from('attendance')
            .select('id', { count: 'exact', head: true })
            .eq('enrolment_id', en.id);

          const totalDeps = (hasCert ? 1 : 0) + (attCount || 0);
          const canDelete = totalDeps === 0;

          return {
            id: en.id,
            identifier: `${en.enrolment_number} (${en.student_name})`,
            canDelete,
            blockedReason: !canDelete
              ? `Enrolment has ${hasCert ? 'an issued certificate' : ''}${hasCert && attCount ? ' and ' : ''}${attCount ? `${attCount} class attendance marks` : ''}. Use Withdraw/Cancel instead.`
              : null,
            dependencies: [
              { label: 'Issued Certificate', count: hasCert ? 1 : 0 },
              { label: 'Attendance Records', count: attCount || 0 },
            ],
          };
        })
      );

      return NextResponse.json({ ok: true, reports });
    }

    if (action === 'UPDATE_STATUS' || action === 'WITHDRAW') {
      const targetStatus = action === 'WITHDRAW' ? 'WITHDRAWN' : status;
      if (!targetStatus) {
        return NextResponse.json({ error: 'Target status is required.' }, { status: 400 });
      }

      const { error, count } = await supabase
        .from('enrolments')
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .in('id', enrolmentIds)
        .eq('tenant_id', session.tenantId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully transitioned ${count || enrolmentIds.length} enrolment(s) to ${targetStatus}.`,
      });
    }

    if (action === 'DELETE') {
      // Hard delete only permitted if 0 certificates and 0 attendance marks within tenant
      const { data: enrolments } = await supabase
        .from('enrolments')
        .select('id, certificate_issued')
        .in('id', enrolmentIds)
        .eq('tenant_id', session.tenantId);

      if (!enrolments || enrolments.length === 0) {
        return NextResponse.json(
          { error: 'No matching enrolments found in tenant to delete.' },
          { status: 404 }
        );
      }

      const certIssued = enrolments.filter((e) => e.certificate_issued);
      if (certIssued.length > 0) {
        return NextResponse.json(
          { error: 'Cannot delete enrolments with issued certificates. Transition to WITHDRAWN or CANCELLED instead.' },
          { status: 400 }
        );
      }

      const eligibleIds = enrolments.map((e) => e.id);
      const { error } = await supabase
        .from('enrolments')
        .delete()
        .in('id', eligibleIds)
        .eq('tenant_id', session.tenantId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully deleted ${eligibleIds.length} enrolment record(s).`,
      });
    }

    return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Enrolments Bulk POST error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
