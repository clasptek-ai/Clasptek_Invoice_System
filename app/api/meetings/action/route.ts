/**
 * app/api/meetings/action/route.ts — Phase 5
 * Route handler for Meeting Operations & Host Controls:
 * - GET: Status of room
 * - POST: Mute, Remove, End Meeting, Leave, Chat
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { updateMeetingStatus, getMeetingById, checkMeetingDependencies, deleteMeetingSafe } from '@/lib/meetings/queries';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const publicId = searchParams.get('publicId') || searchParams.get('meetingId');

    if (!publicId) {
      return NextResponse.json({ error: 'Meeting publicId is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(publicId);
    const meeting = meetingRes.data;

    return NextResponse.json({
      success: true,
      roomId: publicId,
      sfuStatus: meeting ? meeting.status : 'UNKNOWN',
      meeting,
      participants: [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const actionQuery = searchParams.get('action');

    const body = await req.json().catch(() => ({}));
    const action = (actionQuery || body.action || '').toUpperCase();
    const meetingId = body.meetingId || body.publicId;

    if (action === 'CHECK_DEPENDENCIES') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const depCheck = await checkMeetingDependencies(meetingId);
      return NextResponse.json({ success: true, ...depCheck });
    }

    if (action === 'DELETE_MEETING') {
      if (!['Super Admin', 'Staff'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete meetings.' }, { status: 403 });
      }
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const delRes = await deleteMeetingSafe(meetingId, session.tenantId);
      if (!delRes.success) {
        return NextResponse.json({ error: delRes.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, action: 'DELETE_MEETING' });
    }

    if (action === 'END_MEETING') {
      if (meetingId) {
        await updateMeetingStatus(meetingId, 'ENDED');
      }
      return NextResponse.json({ success: true, action: 'END_MEETING', endedAt: new Date().toISOString() });
    }

    if (action === 'LEAVE') {
      return NextResponse.json({ success: true, action: 'LEAVE', leftAt: new Date().toISOString() });
    }

    if (action === 'MUTE_PARTICIPANT') {
      return NextResponse.json({
        success: true,
        action: 'MUTE_PARTICIPANT',
        participantId: body.targetParticipantId,
      });
    }

    if (action === 'REMOVE_PARTICIPANT') {
      return NextResponse.json({
        success: true,
        action: 'REMOVE_PARTICIPANT',
        participantId: body.targetParticipantId,
      });
    }

    if (action === 'CHAT') {
      const message = {
        id: `msg_${Date.now()}`,
        meetingId,
        senderId: session.user.id,
        senderName: body.senderName || session.user.email || 'Participant',
        content: body.content || '',
        timestamp: new Date().toISOString(),
      };
      return NextResponse.json({ success: true, message });
    }

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
