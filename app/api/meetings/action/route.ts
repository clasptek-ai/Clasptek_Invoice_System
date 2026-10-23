/**
 * app/api/meetings/action/route.ts — Phase 2 Meetings Persistence & Security
 * Route handler for Meeting Operations & Host Controls:
 * - GET: Status of room
 * - POST: START, END_MEETING (COMPLETED), DELETE_MEETING (soft-delete), CHECK_DEPENDENCIES, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getAuthoritativePersonnel } from '@/lib/ess/queries';
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

    if (action === 'DELETE_MEETING' || action === 'CANCEL_MEETING' || action === 'CANCEL') {
      if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete meetings.' }, { status: 403 });
      }
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const delRes = await deleteMeetingSafe(meetingId, session.tenantId);
      if (!delRes.success) {
        const statusCode = delRes.error === 'CALENDAR_EVENT_DELETION_FAILED' ? 502 : 400;
        return NextResponse.json({ error: delRes.error, message: delRes.message || delRes.error }, { status: statusCode });
      }
      return NextResponse.json({
        success: true,
        action: 'DELETE_MEETING',
        calendarDeleted: delRes.calendarDeleted,
      });
    }

    if (action === 'START_MEETING' || action === 'START') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        const mtgRes = await getMeetingById(meetingId);
        if (!mtgRes.data || (mtgRes.data.facilitatorId !== persId)) {
          return NextResponse.json({ error: 'Forbidden: You are not authorized to start this meeting.' }, { status: 403 });
        }
      } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions to start this meeting.' }, { status: 403 });
      }
      await updateMeetingStatus(meetingId, 'LIVE');
      return NextResponse.json({ success: true, action: 'START_MEETING', startedAt: new Date().toISOString() });
    }

    if (action === 'END_MEETING' || action === 'END') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        const mtgRes = await getMeetingById(meetingId);
        if (!mtgRes.data || (mtgRes.data.facilitatorId !== persId)) {
          return NextResponse.json({ error: 'Forbidden: You are not authorized to end this meeting.' }, { status: 403 });
        }
      } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions to end this meeting.' }, { status: 403 });
      }
      await updateMeetingStatus(meetingId, 'COMPLETED');
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

    if (action === 'START_RECORDING') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const { startMeetingRecording, RecordingServiceError } = await import('@/lib/meetings/recording-service');
      try {
        const res = await startMeetingRecording({ meetingId, session });
        return NextResponse.json({ action: 'START_RECORDING', ...res });
      } catch (err: unknown) {
        if (err instanceof RecordingServiceError) {
          return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
        }
        throw err;
      }
    }

    if (action === 'STOP_RECORDING') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const { stopMeetingRecording, RecordingServiceError } = await import('@/lib/meetings/recording-service');
      try {
        const res = await stopMeetingRecording({ meetingId, session });
        return NextResponse.json({ action: 'STOP_RECORDING', ...res });
      } catch (err: unknown) {
        if (err instanceof RecordingServiceError) {
          return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
        }
        throw err;
      }
    }

    if (action === 'RECORDING_STATUS') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const { getMeetingRecordingStatus, RecordingServiceError } = await import('@/lib/meetings/recording-service');
      try {
        const res = await getMeetingRecordingStatus({ meetingId, session });
        return NextResponse.json({ success: true, action: 'RECORDING_STATUS', ...res });
      } catch (err: unknown) {
        if (err instanceof RecordingServiceError) {
          return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
        }
        throw err;
      }
    }

    if (action === 'RECONCILE_RECORDING') {
      if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
      const { reconcileMeetingRecording, RecordingServiceError } = await import('@/lib/meetings/recording-service');
      try {
        const res = await reconcileMeetingRecording({ meetingId, session });
        return NextResponse.json({ action: 'RECONCILE_RECORDING', ...res });
      } catch (err: unknown) {
        if (err instanceof RecordingServiceError) {
          return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
        }
        throw err;
      }
    }

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
