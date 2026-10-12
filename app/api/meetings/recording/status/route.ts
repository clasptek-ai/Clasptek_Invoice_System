/**
 * app/api/meetings/recording/status/route.ts — LiveKit Recording Status Endpoint
 * Returns server-confirmed recording status, consent notice, and metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getMeetingRecordingStatus, RecordingServiceError } from '@/lib/meetings/recording-service';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId') || searchParams.get('publicId');

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const result = await getMeetingRecordingStatus({
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
        },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
