/**
 * app/api/meetings/guest/decision/route.ts — Clasptek Meetings LiveKit Only
 * Host endpoint to admit (APPROVE), decline (REJECT), or remove (REVOKE) an external guest.
 * Enforces session authentication, tenant isolation, and generates short-lived LiveKit token on admission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getMeetingById } from '@/lib/meetings/queries';
import { decideGuestRequest } from '@/lib/meetings/guest-requests';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Authoritative tenant could not be resolved.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { requestId, decision, publicId, meetingId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
    }

    if (!['APPROVE', 'REJECT', 'REVOKE'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision. Allowed: APPROVE, REJECT, REVOKE' }, { status: 400 });
    }

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    // Cross-tenant verification
    if (meeting.tenantId !== tenantId) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    // Role check: Only Hosts/Facilitators/Admins can admit or decline guests
    const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Only meeting facilitators and administrators can admit guests.' },
        { status: 403 }
      );
    }

    if (session.role === 'Facilitator') {
      const { createServerClient } = await import('@/lib/supabase/server');
      const supabase = await createServerClient();
      const { data: pers } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const persId = pers?.id;
      if (!persId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'No authoritative personnel profile found for this facilitator.' },
          { status: 403 }
        );
      }

      let isAssigned = Boolean(persId && meeting.facilitatorId === persId);
      if (!isAssigned && meeting.cohortId) {
        const { data: assignedCohort } = await supabase
          .from('cohorts')
          .select('id')
          .eq('id', meeting.cohortId)
          .eq('lead_facilitator_id', persId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (assignedCohort) {
          isAssigned = true;
        }
      }

      if (!isAssigned) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'You are not authorized to manage guests for this meeting.' },
          { status: 403 }
        );
      }
    }

    const result = await decideGuestRequest({
      requestId,
      decision,
      deciderUserId: session.user.id,
      tenantId,
      meetingPublicId: meeting.publicId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to update guest status' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      requestId,
      status: result.status,
      message: `Guest request has been ${result.status.toLowerCase()}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
