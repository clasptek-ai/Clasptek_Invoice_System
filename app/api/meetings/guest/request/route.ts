/**
 * app/api/meetings/guest/request/route.ts — Clasptek Meetings LiveKit Only
 * Public endpoint for external guests to request entry into a meeting.
 * Puts guest into PENDING status in the waiting room ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMeetingById } from '@/lib/meetings/queries';
import { createGuestRequest } from '@/lib/meetings/guest-requests';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { publicId, meetingId, guestName, guestEmail, guestOrganization } = body;

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    if (!guestName || !String(guestName).trim()) {
      return NextResponse.json({ error: 'Your name is required to request entry.' }, { status: 400 });
    }

    if (!guestEmail || !String(guestEmail).trim() || !String(guestEmail).includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    // Resolve meeting
    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    if (meeting.deletedAt) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    if (meeting.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'MEETING_ENDED', message: 'This meeting has completed. New guests cannot join.' },
        { status: 400 }
      );
    }

    if (meeting.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'MEETING_CANCELLED', message: 'This meeting has been cancelled.' },
        { status: 400 }
      );
    }

    // Google Meet meetings manage admission externally
    if (meeting.sfuProvider === 'google_meet') {
      return NextResponse.json(
        {
          error: 'GOOGLE_MEET_EXTERNAL_MANAGEMENT',
          message: 'This meeting is hosted on Google Meet. Admission and room controls are managed directly by Google Meet, not through Clasptek waiting rooms.',
          provider: 'google_meet',
          redirectUrl: meeting.providerRoomUrl || null,
        },
        { status: 400 }
      );
    }

    const result = await createGuestRequest({
      tenantId: meeting.tenantId,
      meetingId: meeting.id,
      meetingPublicId: meeting.publicId,
      guestName: String(guestName).trim(),
      guestEmail: String(guestEmail).trim(),
      guestOrganization: guestOrganization ? String(guestOrganization).trim() : null,
    });

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      requestToken: result.requestToken,
      status: 'PENDING',
      message: 'Your request has been submitted. Please wait for the host to admit you.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
