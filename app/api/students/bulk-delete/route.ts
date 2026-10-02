/**
 * app/api/students/bulk-delete/route.ts
 * Authoritative Batch Deletion Endpoint for Students & Client Directory
 * Enforces:
 * - Session validation & Tenant isolation
 * - Strict RBAC: Super Admin and Staff only
 * - Individual dependency analysis for EVERY selected record
 * - Refusal to delete records with active financial or training dependencies
 * - Atomic cleanup of eligible records
 * - Audit logging in finance_audit_log
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { deleteStudentSafe } from '@/lib/students/mutations';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { studentIds, reason } = body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of studentIds is required.' },
        { status: 400 }
      );
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

    const deleted: Array<{ id: string; studentNumber: string; studentName: string }> = [];
    const blocked: Array<{ id: string; studentNumber: string; studentName: string; reason: string }> = [];
    const notFound: string[] = [];

    for (const id of studentIds) {
      const res = await deleteStudentSafe(supabase, {
        tenantId: session.tenantId,
        studentId: id,
        reason: reason || 'Bulk deletion via Student Directory',
        actor,
      });

      if (res.success && res.report) {
        deleted.push({
          id: res.report.studentId,
          studentNumber: res.report.studentNumber,
          studentName: res.report.studentName,
        });
      } else if (res.report) {
        blocked.push({
          id: res.report.studentId,
          studentNumber: res.report.studentNumber,
          studentName: res.report.studentName,
          reason: res.error || res.report.blockReason || 'Dependent records exist',
        });
      } else {
        notFound.push(id);
      }
    }

    return NextResponse.json({
      ok: true,
      totalRequested: studentIds.length,
      deletedCount: deleted.length,
      blockedCount: blocked.length,
      deleted,
      blocked,
      notFound,
      message: `${deleted.length} record(s) deleted. ${blocked.length} record(s) protected from deletion.`,
    });
  } catch (err: unknown) {
    console.error('[POST /api/students/bulk-delete error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
