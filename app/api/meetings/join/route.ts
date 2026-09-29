/**
 * app/api/meetings/join/route.ts — Phase 5
 * Route handler for Meeting Join & Token Issuance.
 * Issues short-lived LiveKit token with server-side HMAC-SHA256 signature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getSFUService } from '@/lib/meetings/sfu';
import { getMeetingById, updateMeetingStatus } from '@/lib/meetings/queries';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be logged into Clasptek to join this meeting.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { publicId, meetingId, displayName } = body;

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    if (meeting.status === 'ENDED' || meeting.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'MEETING_ENDED', message: 'This meeting has ended. Thank you for attending.' },
        { status: 400 }
      );
    }

    if (meeting.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'MEETING_CANCELLED', message: 'This meeting has been cancelled.' },
        { status: 400 }
      );
    }

    // Role resolution
    const isAssigned = meeting.facilitatorId === user.id;
    // Check if admin or staff from user metadata or role
    const userRole = (user.user_metadata?.role || '').toLowerCase();
    const isAdmin = ['super admin', 'admin'].includes(userRole);
    const isHost = isAdmin || isAssigned;
    const participantRole = isHost ? 'HOST' : ['facilitator', 'staff'].includes(userRole) ? 'FACILITATOR' : 'STUDENT';

    // If meeting was SCHEDULED and host joins, transition to LIVE
    if (isHost && meeting.status === 'SCHEDULED') {
      await updateMeetingStatus(meeting.id, 'LIVE');
    }

    const sfu = getSFUService();
    const pName = displayName || user.user_metadata?.name || user.email || 'Participant';

    const tokenResult = await sfu.generateParticipantToken({
      roomId: meeting.publicId,
      participantId: user.id,
      participantName: pName,
      isHost,
      role: participantRole,
    });

    return NextResponse.json({
      success: true,
      participantSessionId: `mp_${Date.now()}`,
      participantId: user.id,
      participantName: pName,
      role: participantRole,
      isHost,
      sfuProvider: 'livekit',
      token: tokenResult.token,
      serverUrl: tokenResult.serverUrl,
      meeting,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
