/**
 * app/api/students/check-dependencies/route.ts
 * Batch dependency checking for single or multiple students before deletion.
 * Powers the preflight confirmation dialog in Student & Client Directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { checkStudentDependencies } from '@/lib/students/mutations';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { studentIds } = body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of studentIds is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const reports = await Promise.all(
      studentIds.map((id: string) =>
        checkStudentDependencies(supabase, session.tenantId, id)
      )
    );

    const validReports = reports.filter(Boolean);
    const eligible = validReports.filter((r) => r?.canDelete);
    const blocked = validReports.filter((r) => !r?.canDelete);

    return NextResponse.json({
      ok: true,
      totalRequested: studentIds.length,
      totalFound: validReports.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      reports: validReports,
      eligible,
      blocked,
    });
  } catch (err: unknown) {
    console.error('[POST /api/students/check-dependencies error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
