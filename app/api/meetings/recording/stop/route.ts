/**
 * app/api/meetings/recording/stop/route.ts — LiveKit Recording Stop Endpoint
 * Stops active meeting recording and transitions status to PROCESSING.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { stopMeetingRecording, RecordingServiceError } from '@/lib/meetings/recording-service';

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

    const result = await stopMeetingRecording({
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
