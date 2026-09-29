import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getEnquiryById, getEnquiryHistory } from '@/lib/admissions/queries';

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
      return NextResponse.json({ error: 'Missing enquiry ID' }, { status: 400 });
    }

    const { data: enquiry, error: fetchErr } = await getEnquiryById(id);
    if (fetchErr || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }

    const history = await getEnquiryHistory(id, enquiry.notes);
    return NextResponse.json({ success: true, history, financials: enquiry.financials });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
