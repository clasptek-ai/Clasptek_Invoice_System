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
    const contactMethod = (body.contactMethod ?? '').trim();
    const outcome = (body.outcome ?? '').trim();
    const activitySummary = (body.activitySummary ?? '').trim();
    const nextFollowUpDate = body.nextFollowUpDate ? String(body.nextFollowUpDate).trim() : null;
    const newStatus = body.status as EnquiryStatus | null | undefined;

    if (!note && !newStatus && !outcome) {
      return NextResponse.json({ error: 'Note, outcome, or status is required' }, { status: 400 });
    }

    const { data: current, error: fetchErr } = await getEnquiryById(id);
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }

    const staffName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email ||
      'Admissions Staff';

    // Format structured note for enquiries.notes storage
    let noteTextToAppend = note;
    if (contactMethod || outcome || activitySummary || nextFollowUpDate) {
      const headerParts: string[] = [];
      if (contactMethod) headerParts.push(`Channel: ${contactMethod}`);
      if (outcome) headerParts.push(`Outcome: ${outcome}`);
      if (activitySummary) headerParts.push(`Summary: ${activitySummary}`);

      const metaHeader = headerParts.length > 0 ? `【${headerParts.join(' | ')}】` : '';
      const followUpTrailer = nextFollowUpDate ? `\nNext Follow-up Scheduled: ${nextFollowUpDate}` : '';

      noteTextToAppend = [metaHeader, note, followUpTrailer].filter(Boolean).join('\n');
    }

    if (noteTextToAppend) {
      const { error: noteErr } = await appendEnquiryNote(id, noteTextToAppend);
      if (noteErr) {
        return NextResponse.json({ error: noteErr }, { status: 500 });
      }
    }

    // If a linked customer exists with matching email, log to customer_timeline as well
    if (current.email && (note || contactMethod || outcome)) {
      try {
        const { data: matchedCust } = await supabase
          .from('customers')
          .select('id')
          .eq('email', current.email)
          .maybeSingle();

        if (matchedCust?.id) {
          const timelineId = `ctl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await supabase.from('customer_timeline').insert({
            id: timelineId,
            tenant_id: current.tenant_id,
            customer_id: matchedCust.id,
            enquiry_id: id,
            event_type: 'FOLLOW_UP',
            title: activitySummary || `Follow-up via ${contactMethod || 'Direct Outreach'}`,
            description: note,
            contact_method: contactMethod || null,
            outcome: outcome || null,
            next_follow_up_date: nextFollowUpDate || null,
            actor_name: staffName,
          });
        }
      } catch (err) {
        console.warn('[customer_timeline insert warning]', err);
      }
    }

    // Lifecycle status transition (STRICTLY SEPARATE from outcome)
    if (newStatus && newStatus !== current.status) {
      const allowed = ENQUIRY_TRANSITIONS[current.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot transition from ${current.status} to ${newStatus}` },
          { status: 422 }
        );
      }
      const { error: statusErr } = await updateEnquiryStatus(id, newStatus, {
        actorName: staffName,
        reason: activitySummary || `Follow-up interaction outcome: ${outcome || 'Progressed'}`,
      });
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
