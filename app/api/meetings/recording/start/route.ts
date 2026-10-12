/**
 * app/api/meetings/recording/start/route.ts — LiveKit Recording Start Endpoint
 * Starts meeting recording for authorized Super Admin, Finance Manager, or assigned Facilitator.
 * Connects to LiveKit Egress or registers active recording session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { startMeetingRecording, RecordingServiceError } from '@/lib/meetings/recording-service';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const meetingId = body.meetingId || body.publicId;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const result = await startMeetingRecording({
      meetingId,
      session,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof RecordingServiceError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          details: err.details,
        },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
