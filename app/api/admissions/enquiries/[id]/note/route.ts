import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { appendEnquiryNote, updateEnquiryStatus, getEnquiryById } from '@/lib/admissions/queries';
import { ENQUIRY_TRANSITIONS, EnquiryStatus } from '@/types/admissions';

export async function POST(
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
    const note = (body.note ?? '').trim();
    const newStatus = body.status as EnquiryStatus | null | undefined;

    if (!note && !newStatus) {
      return NextResponse.json({ error: 'Note or status is required' }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await getEnquiryById(id);
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }

    if (note) {
      const { error: noteErr } = await appendEnquiryNote(id, note);
      if (noteErr) {
        return NextResponse.json({ error: noteErr }, { status: 500 });
      }
    }

    if (newStatus && newStatus !== current.status) {
      const allowed = ENQUIRY_TRANSITIONS[current.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot transition from ${current.status} to ${newStatus}` },
          { status: 422 }
        );
      }
      const { error: statusErr } = await updateEnquiryStatus(id, newStatus);
      if (statusErr) {
        return NextResponse.json({ error: statusErr }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
