/**
 * app/api/students/[id]/enrol/route.ts
 * Authoritative Server Endpoint for Enrolling an Existing Student into a Programme / Cohort.
 *
 * CRITICAL INVARIANTS:
 * - Session verification & tenant isolation
 * - Strict RBAC: Super Admin and Staff (Admissions / Operations) only.
 *   Denied for Finance Manager, Facilitator, Student.
 * - Student record is NEVER duplicated. Student ID is immutable.
 * - Enrolment number generated via crm_intake_counters (ENR-YYYY-XXXX).
 * - Enforces uq_enrolments_student_cohort (prevents duplicate enrolment in same cohort).
 * - Financial totals remain in finance records (not written to public.students).
 * - Preserves corporate customer relationship (customer_id).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { createStudentEnrolment } from '@/lib/students/mutations';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Session verification
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Strict Role Verification
    // Authorized: Super Admin, Staff (Admissions / Operations)
    // Strictly Denied: Finance Manager, Finance Staff, Finance Viewer, Facilitator, Student
    const authorizedRoles = ['Super Admin', 'Staff'];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${session.role}' is not authorized to enrol students. Only Admissions, Operations, and Super Admin can manage enrolments.`,
        },
        { status: 403 }
      );
    }

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 });
    }

    // 3. Parse and validate body
    const body = await request.json().catch(() => ({}));
    const { programmeId, cohortId, startDate, agreedTuitionFee } = body || {};

    if (!programmeId || typeof programmeId !== 'string') {
      return NextResponse.json({ error: 'Programme selection is required.' }, { status: 400 });
    }

    if (!cohortId || typeof cohortId !== 'string') {
      return NextResponse.json({ error: 'Cohort selection is required.' }, { status: 400 });
    }

    // 4. Execute Server-Side Mutation
    const supabase = await createServerClient();
    const actor = {
      id: session.user.id,
      name:
        (session.user.user_metadata?.full_name as string) ||
        (session.user.user_metadata?.name as string) ||
        session.user.email ||
        'Authorized Staff',
      role: session.role,
    };

    const result = await createStudentEnrolment(supabase, {
      tenantId: session.tenantId,
      studentId,
      programmeId,
      cohortId,
      startDate: startDate || null,
      agreedTuitionFee: agreedTuitionFee !== undefined ? Number(agreedTuitionFee) : undefined,
      actor,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      enrolment: result.enrolment,
      message: `Successfully enrolled in cohort with enrolment number ${result.enrolment?.enrolment_number}.`,
    });
  } catch (err: unknown) {
    console.error('[POST /api/students/[id]/enrol error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
