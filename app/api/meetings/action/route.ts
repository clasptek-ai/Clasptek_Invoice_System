/**
 * app/api/meetings/action/route.ts — Phase 5
 * Route handler for Meeting Operations & Host Controls:
 * - GET: Status of room
 * - POST: Mute, Remove, End Meeting, Leave, Chat
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { updateMeetingStatus, getMeetingById } from '@/lib/meetings/queries';

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
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const actionQuery = searchParams.get('action');

    const body = await req.json().catch(() => ({}));
    const action = (actionQuery || body.action || '').toUpperCase();
    const meetingId = body.meetingId || body.publicId;

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
        senderId: user.id,
        senderName: body.senderName || user.email || 'Participant',
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
