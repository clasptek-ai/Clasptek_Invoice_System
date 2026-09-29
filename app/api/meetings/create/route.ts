/**
 * app/api/meetings/create/route.ts — Phase 5
 * Route handler for Meeting Creation.
 * Allocates LiveKit room and saves meeting record with tenant isolation.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { getSFUService } from '@/lib/meetings/sfu';
import { saveMeetingRecord } from '@/lib/meetings/queries';
import type { Meeting } from '@/types/meetings';

function generatePublicId(): string {
  const p1 = crypto.randomBytes(4).toString('hex');
  const p2 = crypto.randomBytes(3).toString('hex');
  return `mtg-${p1}-${p2}`;
}

function generateMeetingId(): string {
  return `mtg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      programmeId,
      cohortId,
      trainingSessionId,
      facilitatorId,
      scheduledStart,
      scheduledEnd,
      participantAccess = 'COHORT_ONLY',
      settings = {},
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Meeting title is required' }, { status: 400 });
    }

    // Role check: Admins and facilitators can schedule
    const meetingId = generateMeetingId();
    const publicId = generatePublicId();
    const tenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

    const sfu = getSFUService();
    let sfuRoomResult;
    try {
      sfuRoomResult = await sfu.createRoom({
        roomId: publicId,
        roomTitle: title.trim(),
        settings: {
          emptyTimeout: 300,
          maxParticipants: 100,
        },
      });
    } catch (sfuErr: unknown) {
      const msg = sfuErr instanceof Error ? sfuErr.message : 'SFU Room creation failed';
      return NextResponse.json(
        {
          error: 'Meeting unavailable',
          message: 'The meeting service is temporarily unavailable. Please try again shortly.',
          detail: msg,
        },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();
    const meetingRecord: Meeting = {
      id: meetingId,
      tenantId,
      publicId,
      title: title.trim(),
      description: (description || '').trim(),
      programmeId: programmeId || null,
      cohortId: cohortId || null,
      trainingSessionId: trainingSessionId || null,
      facilitatorId: facilitatorId || user.id,
      scheduledStart: scheduledStart || now,
      scheduledEnd: scheduledEnd || new Date(Date.now() + 2 * 3600000).toISOString(),
      actualStart: null,
      actualEnd: null,
      status: 'SCHEDULED',
      participantAccess: ['COHORT_ONLY', 'ALL_STUDENTS', 'PUBLIC_TOKEN'].includes(participantAccess)
        ? participantAccess
        : 'COHORT_ONLY',
      sfuProvider: 'livekit',
      sfuRoomId: publicId,
      settings: {
        allowChat: settings.allowChat !== false,
        allowScreenShare: settings.allowScreenShare !== false,
        muteOnEntry: Boolean(settings.muteOnEntry),
      },
      recordingEnabled: false,
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };

    await saveMeetingRecord(meetingRecord);

    return NextResponse.json(
      {
        success: true,
        meeting: meetingRecord,
        publicUrl: `/meet/${publicId}`,
        sfuRoom: sfuRoomResult,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
