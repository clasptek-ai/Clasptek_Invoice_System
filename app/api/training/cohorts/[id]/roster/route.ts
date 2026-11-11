/**
 * app/api/training/cohorts/[id]/roster/route.ts
 * Authoritative Server Endpoint for Cohort Class Roster
 *
 * Implements:
 * - Session verification & strict multi-tenant isolation
 * - RBAC:
 *   - Super Admin & Finance Manager: can inspect any cohort roster in tenant
 *   - Facilitator: can ONLY inspect roster for cohorts where they are assigned lead facilitator or session instructor
 *   - Staff & Student: strictly FORBIDDEN (403)
 * - Returns student names, numbers, email, and enrolment status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getCohortEnrolmentsWithStudents } from '@/lib/training/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'Staff' || session.role === 'Student') {
      return NextResponse.json(
        { error: `Forbidden: Role '${session.role}' is not authorized to access class rosters.` },
        { status: 403 }
      );
    }

    const { id: cohortId } = await params;
    if (!cohortId) {
      return NextResponse.json({ error: 'Cohort ID is required' }, { status: 400 });
    }

    const result = await getCohortEnrolmentsWithStudents(cohortId);
    if (result.error) {
      const isForbidden = result.error.includes('FORBIDDEN');
      return NextResponse.json(
        { error: result.error },
        { status: isForbidden ? 403 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cohortId,
      students: result.data || [],
      count: (result.data || []).length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

