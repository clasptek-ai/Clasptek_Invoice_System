/**
 * app/api/students/[id]/dossier/route.ts — Phase 4
 * Authenticated API route returning complete Student 360° Dossier.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getStudentDossier } from '@/lib/students/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: `Forbidden: Role '${session.role}' is not authorized to view student dossier.` },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing student ID' }, { status: 400 });
    }

    const { data: dossier, error } = await getStudentDossier(id);

    if (error || !dossier) {
      return NextResponse.json({ error: error || 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({ dossier });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
