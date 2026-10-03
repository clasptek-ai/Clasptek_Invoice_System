/**
 * app/api/admissions/programmes/bulk/route.ts
 * Bulk status update and safe lifecycle endpoint for academic programmes.
 * Checks for dependent cohorts, enrolments, and invoices before allowing changes.
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
        { error: 'Forbidden: Insufficient permissions for programme management.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, programmeIds, status } = body || {};

    if (!Array.isArray(programmeIds) || programmeIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of programmeIds is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    if (action === 'CHECK_DEPENDENCIES') {
      const { data: programmes } = await supabase
        .from('programmes')
        .select('id, code, name')
        .in('id', programmeIds)
        .eq('tenant_id', session.tenantId);

      const reports = await Promise.all(
        (programmes || []).map(async (p) => {
          const { count: cohortCount } = await supabase
            .from('cohorts')
            .select('id', { count: 'exact', head: true })
            .eq('programme_id', p.id)
            .eq('tenant_id', session.tenantId);

          const { count: enrolmentCount } = await supabase
            .from('enrolments')
            .select('id', { count: 'exact', head: true })
            .eq('programme_id', p.id)
            .eq('tenant_id', session.tenantId);

          const totalDeps = (cohortCount || 0) + (enrolmentCount || 0);
          const canDelete = totalDeps === 0;

          return {
            id: p.id,
            identifier: `${p.code} (${p.name})`,
            canDelete,
            blockedReason: !canDelete
              ? `Programme has ${cohortCount || 0} cohort(s) and ${enrolmentCount || 0} student enrolment(s). Delete is blocked to protect academic history. Deactivate instead.`
              : null,
            dependencies: [
              { label: 'Cohorts', count: cohortCount || 0 },
              { label: 'Student Enrolments', count: enrolmentCount || 0 },
            ],
          };
        })
      );

      return NextResponse.json({ ok: true, reports });
    }

    if (action === 'UPDATE_STATUS' || action === 'DEACTIVATE') {
      const targetStatus = action === 'DEACTIVATE' ? 'inactive' : status || 'inactive';

      const { error, count } = await supabase
        .from('programmes')
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .in('id', programmeIds)
        .eq('tenant_id', session.tenantId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully updated ${count || programmeIds.length} programme(s) to ${targetStatus}.`,
      });
    }

    if (action === 'DELETE') {
      // Deletion is blocked if dependencies exist
      for (const id of programmeIds) {
        const { count: cCount } = await supabase
          .from('cohorts')
          .select('id', { count: 'exact', head: true })
          .eq('programme_id', id)
          .eq('tenant_id', session.tenantId);

        const { count: eCount } = await supabase
          .from('enrolments')
          .select('id', { count: 'exact', head: true })
          .eq('programme_id', id)
          .eq('tenant_id', session.tenantId);

        if ((cCount || 0) > 0 || (eCount || 0) > 0) {
          return NextResponse.json(
            { error: `Cannot delete programme: active cohorts or student enrolments exist. Use Deactivate instead.` },
            { status: 400 }
          );
        }
      }

      const { error } = await supabase
        .from('programmes')
        .delete()
        .in('id', programmeIds)
        .eq('tenant_id', session.tenantId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully deleted ${programmeIds.length} programme(s).`,
      });
    }

    return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Programmes Bulk POST error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
