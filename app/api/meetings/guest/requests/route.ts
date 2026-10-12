/**
 * app/api/meetings/guest/requests/route.ts — Clasptek Meetings LiveKit Only
 * Host endpoint to list guest requests for a meeting.
 * Enforces session authentication and tenant isolation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getMeetingById } from '@/lib/meetings/queries';
import { listGuestRequestsForMeeting } from '@/lib/meetings/guest-requests';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const identifier = searchParams.get('publicId') || searchParams.get('meetingId');

    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    // Cross-tenant verification
    if (meeting.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const requests = await listGuestRequestsForMeeting(meeting.publicId, session.tenantId);

    // Sanitize output (do not expose internal requestToken to client)
    const sanitized = requests.map((r) => ({
      id: r.id,
      meetingPublicId: r.meetingPublicId,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestOrganization: r.guestOrganization,
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      expiresAt: r.expiresAt,
    }));

    return NextResponse.json({
      success: true,
      requests: sanitized,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
