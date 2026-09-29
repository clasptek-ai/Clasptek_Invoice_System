/**
 * app/api/students/[id]/dossier/route.ts — Phase 4
 * Authenticated API route returning complete Student 360° Dossier.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getStudentDossier } from '@/lib/students/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
