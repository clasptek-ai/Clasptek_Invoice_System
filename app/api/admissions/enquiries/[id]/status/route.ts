import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { updateEnquiryStatus, getEnquiryById } from '@/lib/admissions/queries';
import { ENQUIRY_TRANSITIONS, EnquiryStatus } from '@/types/admissions';

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
      return NextResponse.json({ error: 'Missing enquiry ID' }, { status: 400 });
    }

    const body = await request.json();
    const newStatus = body.status as EnquiryStatus;

    if (!newStatus) {
      return NextResponse.json({ error: 'Missing status in request body' }, { status: 400 });
    }

    // Verify current enquiry and transition validity
    const { data: current, error: fetchErr } = await getEnquiryById(id);
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }

    const allowed = ENQUIRY_TRANSITIONS[current.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current.status} to ${newStatus}` },
        { status: 422 }
      );
    }

    const staffName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email ||
      'Admissions Staff';

    const { error: updateErr } = await updateEnquiryStatus(id, newStatus, {
      actorName: staffName,
      reason: (body.reason as string) || `Status updated to ${newStatus}`,
    });
    if (updateErr) {
      return NextResponse.json({ error: updateErr }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
