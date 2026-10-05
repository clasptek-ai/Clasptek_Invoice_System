/**
 * app/api/admissions/cohorts/bulk/route.ts
 * Bulk status update and safe lifecycle endpoint for training cohorts.
 * Enforces referential protection: blocks deletion if students are enrolled.
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

    const allowedRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions for cohort management.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, cohortIds, status } = body || {};

    if (!Array.isArray(cohortIds) || cohortIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of cohortIds is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    if (action === 'CHECK_DEPENDENCIES') {
      const { data: cohorts } = await supabase
        .from('cohorts')
        .select('id, cohort_code, name')
        .in('id', cohortIds)
        .eq('tenant_id', session.tenantId);

      const reports = await Promise.all(
        (cohorts || []).map(async (c) => {
          const { count: enrolmentCount } = await supabase
            .from('enrolments')
            .select('id', { count: 'exact', head: true })
            .eq('cohort_id', c.id)
            .eq('tenant_id', session.tenantId);

          const totalDeps = enrolmentCount || 0;
          const canDelete = totalDeps === 0;

          return {
            id: c.id,
            identifier: `${c.cohort_code} (${c.name})`,
            canDelete,
            blockedReason: !canDelete
              ? `Cohort has ${enrolmentCount} enrolled student(s). Delete is blocked. Use Close/Archive instead.`
              : null,
            dependencies: [
              { label: 'Enrolled Students', count: enrolmentCount || 0 },
            ],
          };
        })
      );

      return NextResponse.json({ ok: true, reports });
    }

    if (action === 'UPDATE_STATUS' || action === 'CLOSE') {
      const targetStatus = action === 'CLOSE' ? 'COMPLETED' : status;
      if (!targetStatus) {
        return NextResponse.json({ error: 'Target status is required.' }, { status: 400 });
      }

      const { error, count } = await supabase
        .from('cohorts')
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .in('id', cohortIds)
        .eq('tenant_id', session.tenantId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully updated ${count || cohortIds.length} cohort(s) to ${targetStatus}.`,
      });
    }

    if (action === 'DELETE') {
      for (const id of cohortIds) {
        const { count: eCount } = await supabase
          .from('enrolments')
          .select('id', { count: 'exact', head: true })
          .eq('cohort_id', id)
          .eq('tenant_id', session.tenantId);

        if ((eCount || 0) > 0) {
          return NextResponse.json(
            { error: `Cannot delete cohort: ${eCount} student enrolment(s) exist. Transition to COMPLETED or ARCHIVED instead.` },
            { status: 400 }
          );
        }
      }

      const { error } = await supabase
        .from('cohorts')
        .delete()
        .in('id', cohortIds)
        .eq('tenant_id', session.tenantId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully deleted ${cohortIds.length} cohort record(s).`,
      });
    }

    return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Cohorts Bulk POST error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
