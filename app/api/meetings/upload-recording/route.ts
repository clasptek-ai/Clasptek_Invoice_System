/**
 * app/api/meetings/upload-recording/route.ts — Phase 2 Meetings Persistence & Security
 * Route handler for Meeting Recording Upload to Google Drive.
 * Enforces least-privilege, multi-tenant isolation, role authorization (Admin or assigned Facilitator),
 * and persistent PostgreSQL metadata storage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateRecordingFileName } from '@/lib/meetings/google-drive';
import { getMeetingById } from '@/lib/meetings/queries';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Forbidden: Authoritative tenant could not be resolved.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { meetingId, publicId, fileName, fileData, durationSeconds } = body;

    const identifier = meetingId || publicId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    // Cross-tenant prevention
    if (meeting.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Role-based authorization: Admin or assigned Facilitator
    if (session.role === 'Facilitator') {
      const supabase = await createServerClient();
      const { data: persData } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const persId = persData?.id;
      if (!persId) {
        return NextResponse.json({ error: 'Forbidden: No authoritative personnel profile found.' }, { status: 403 });
      }

      let isAssigned = Boolean(meeting.facilitatorId && meeting.facilitatorId === persId);

      if (!isAssigned && meeting.cohortId) {
        const { data: assignedCohort } = await supabase
          .from('cohorts')
          .select('id')
          .eq('id', meeting.cohortId)
          .eq('lead_facilitator_id', persId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (assignedCohort) {
          isAssigned = true;
        }
      }

      if (!isAssigned) {
        return NextResponse.json(
          { error: 'Forbidden: You are not authorized to upload recordings for this meeting.' },
          { status: 403 }
        );
      }
    } else if (session.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to upload recordings.' },
        { status: 403 }
      );
    }

    // Idempotency check: if already STORED and fileId exists, return existing metadata
    if (meeting.recordingStatus === 'STORED' && meeting.recordingMetadata?.fileId) {
      return NextResponse.json({
        success: true,
        alreadyStored: true,
        recording: meeting.recordingMetadata,
      });
    }

    // Validate required fileData (base64 encoded recording video)
    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_RECORDING_PAYLOAD: fileData (base64 encoded video) is required for recording upload.' },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(fileData, 'base64');

    const resolvedFileName =
      fileName ||
      generateRecordingFileName({
        meetingPublicId: meeting.publicId,
        title: meeting.title,
        scheduledStart: meeting.scheduledStart,
      });

    // Perform upload to Google Drive Central Repository with safe retry handling
    const { uploadRecordingWithRetry } = await import('@/lib/meetings/recording-service');
    const result = await uploadRecordingWithRetry({
      meetingId: meeting.id,
      session,
      fileName: resolvedFileName,
      fileBuffer,
      durationSeconds: Number(durationSeconds) || 0,
      maxRetries: 3,
    });

    return NextResponse.json({
      success: true,
      recording: result.metadata,
      status: result.status,
      alreadyStored: result.alreadyStored || false,
    });
  } catch (err: unknown) {
    const { RecordingServiceError } = await import('@/lib/meetings/recording-service').catch(() => ({ RecordingServiceError: null }));
    if (RecordingServiceError && err instanceof RecordingServiceError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
