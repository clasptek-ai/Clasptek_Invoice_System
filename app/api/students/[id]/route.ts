/**
 * app/api/students/[id]/route.ts
 * Authoritative Server Endpoint for Student Profile Mutations
 * Enforces:
 * - Session validation
 * - Tenant isolation
 * - Strict RBAC: Super Admin and Staff (Admissions / Operations) only.
 *   Denied for Finance Manager, Finance Staff, Finance Viewer, Facilitator, Student.
 * - Protection of immutable identifiers (id, student_number, tenant_id, created_at)
 * - Mandatory change reason
 * - Change diffing & audit logging to metadata.audit_trail
 * - Graceful customer_timeline logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  updateStudentProfile,
  deleteStudentSafe,
  checkStudentDependencies,
} from '@/lib/students/mutations';

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

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const report = await checkStudentDependencies(supabase, session.tenantId, studentId);

    if (!report) {
      return NextResponse.json({ error: 'Student not found in tenant.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, report });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['Super Admin', 'Staff'];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${session.role}' is not authorized to delete Student records.`,
        },
        { status: 403 }
      );
    }

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 });
    }

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

    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body?.reason;
    } catch {
      // Optional body on DELETE
    }

    const result = await deleteStudentSafe(supabase, {
      tenantId: session.tenantId,
      studentId,
      reason,
      actor,
    });

    if (!result.success) {
      const status = result.report && !result.report.canDelete ? 409 : 400;
      return NextResponse.json(
        {
          error: result.error,
          report: result.report,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Student record successfully deleted.`,
      report: result.report,
    });
  } catch (err: unknown) {
    console.error('[DELETE /api/students/[id] error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
          error: `Forbidden: Role '${session.role}' is not authorized to edit Student profiles. Only Admissions, Operations, and Super Admin can modify personal data.`,
        },
        { status: 403 }
      );
    }

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 });
    }

    // 3. Parse and validate body
    const body = await request.json();
    const { updates, reason } = body || {};

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { error: 'A mandatory Reason for Change is required to record profile updates.' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'Invalid update payload provided.' },
        { status: 400 }
      );
    }

    // 4. Reject immutable identifier modifications
    if (updates.id && updates.id !== studentId) {
      return NextResponse.json(
        { error: 'Modification of immutable Student ID is prohibited.' },
        { status: 400 }
      );
    }
    if (updates.student_number) {
      return NextResponse.json(
        { error: 'Modification of immutable Student Number is prohibited.' },
        { status: 400 }
      );
    }
    if (updates.tenant_id && updates.tenant_id !== session.tenantId) {
      return NextResponse.json(
        { error: 'Cross-tenant modification is prohibited.' },
        { status: 403 }
      );
    }
    if (updates.created_at) {
      return NextResponse.json(
        { error: 'Modification of immutable Creation Timestamp is prohibited.' },
        { status: 400 }
      );
    }

    // 5. Execute Server-Side Mutation
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

    const result = await updateStudentProfile(supabase, {
      tenantId: session.tenantId,
      studentId,
      updates,
      reason: reason.trim(),
      actor,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      message: result.message,
      data: result.student,
    });
  } catch (err: unknown) {
    console.error('[PATCH /api/students/[id] error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
