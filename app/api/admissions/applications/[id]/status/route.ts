import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { updateApplicationStatus, getApplicationById } from '@/lib/admissions/queries';
import { ApplicationStatus } from '@/types/admissions';

export async function PATCH(
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
      return NextResponse.json({ error: 'Missing application ID' }, { status: 400 });
    }

    const body = await request.json();
    const newStatus = body.status as ApplicationStatus;

    if (!newStatus) {
      return NextResponse.json({ error: 'Missing status in request body' }, { status: 400 });
    }

    if (newStatus === 'CONVERTED') {
      return NextResponse.json(
        { error: 'Cannot transition directly to CONVERTED. Use the conversion RPC instead.' },
        { status: 400 }
      );
    }

    // Verify current application exists
    const { data: current, error: fetchErr } = await getApplicationById(id);
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (current.status === 'CONVERTED') {
      return NextResponse.json(
        { error: 'Cannot change status of an already CONVERTED application.' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await updateApplicationStatus(id, newStatus);
    if (updateErr) {
      return NextResponse.json({ error: updateErr }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
