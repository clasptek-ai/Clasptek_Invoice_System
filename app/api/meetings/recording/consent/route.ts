/**
 * app/api/meetings/recording/consent/route.ts — LiveKit Recording Consent API
 * Server-enforced affirmative consent collection, withdrawal, and status verification.
 * Supports both Supabase Auth sessions and verified external guest credentials.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getGuestRequestByToken } from '@/lib/meetings/guest-requests';
import { getMeetingById } from '@/lib/meetings/queries';
import {
  initiateRecordingConsentSession,
  recordParticipantConsent,
  getRecordingConsentStatus,
  reconcileParticipantPermissions,
  RecordingServiceError,
} from '@/lib/meetings/recording-service';

/**
 * Resolves session for consent operations:
 * - Authenticated Supabase users (host, facilitator, enrolled student, admin)
 * - Approved external guests with valid requestId and requestToken
 */
async function resolveSessionForConsent(
  req: NextRequest,
  meetingId: string,
  bodyRequestId?: string,
  bodyRequestToken?: string
): Promise<{ session: any; isGuest: boolean; error?: string; statusCode?: number }> {
  // 1. Attempt authoritative Supabase user session
  try {
    const authSession = await getAuthoritativeSession();
    if (authSession?.user?.id) {
      return { session: authSession, isGuest: false };
    }
  } catch {
    // Proceed to check guest credentials
  }

  // 2. Attempt approved guest credentials
  const { searchParams } = new URL(req.url);
  const requestId = bodyRequestId || searchParams.get('requestId');
  const requestToken = bodyRequestToken || searchParams.get('requestToken');

  if (!requestId || !requestToken) {
    return {
      session: null,
      isGuest: false,
      error: 'Unauthorized: Authentication required. Please log in or provide verified guest credentials.',
      statusCode: 401,
    };
  }

  const guestRec = await getGuestRequestByToken(requestId, requestToken);
  if (!guestRec) {
    return {
      session: null,
      isGuest: true,
      error: 'Unauthorized: Guest request not found or invalid token.',
      statusCode: 401,
    };
  }

  // Constant-time token verification using fixed-length SHA-256 digests
  // This guarantees identical buffer lengths and prevents timing side-channels across differing lengths
  const storedHash = crypto.createHash('sha256').update(guestRec.requestToken, 'utf8').digest();
  const providedHash = crypto.createHash('sha256').update(requestToken, 'utf8').digest();
  if (!crypto.timingSafeEqual(storedHash, providedHash)) {
    return {
      session: null,
      isGuest: true,
      error: 'Unauthorized: Invalid guest secret token.',
      statusCode: 401,
    };
  }

  if (guestRec.status !== 'APPROVED') {
    return {
      session: null,
      isGuest: true,
      error: `Unauthorized: Guest access status is ${guestRec.status}. Only APPROVED guests may participate in recording consent.`,
      statusCode: 403,
    };
  }

  if (new Date(guestRec.expiresAt) <= new Date()) {
    return {
      session: null,
      isGuest: true,
      error: 'Unauthorized: Guest request has expired. Please request admission again.',
      statusCode: 401,
    };
  }

  // Verify meeting association
  const meetingRes = await getMeetingById(meetingId);
  if (!meetingRes.data) {
    return {
      session: null,
      isGuest: true,
      error: 'Meeting not found for guest consent.',
      statusCode: 404,
    };
  }
  const meeting = meetingRes.data;

  const matchesMeeting = guestRec.meetingId === meeting.id || guestRec.meetingPublicId === meeting.publicId;
  if (!matchesMeeting) {
    return {
      session: null,
      isGuest: true,
      error: 'Unauthorized: Guest token is not valid for this meeting.',
      statusCode: 403,
    };
  }

  if (guestRec.tenantId !== meeting.tenantId) {
    return {
      session: null,
      isGuest: true,
      error: 'Unauthorized: Cross-tenant guest access forbidden.',
      statusCode: 403,
    };
  }

  const guestSession = {
    user: {
      id: `guest_${guestRec.id}`,
      name: guestRec.guestName,
      email: guestRec.guestEmail,
      user_metadata: { full_name: guestRec.guestName },
    },
    role: 'GUEST',
    tenantId: guestRec.tenantId,
    isGuest: true,
    guestRequestId: guestRec.id,
  };

  return { session: guestSession, isGuest: true };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const { session, error, statusCode } = await resolveSessionForConsent(req, meetingId);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: error || 'Authentication required.' }, { status: statusCode || 401 });
    }

    const status = await getRecordingConsentStatus({ meetingId, session });
    return NextResponse.json(status, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof RecordingServiceError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { meetingId, recordingSessionId, decision, action, reason, requestId, requestToken } = body;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const { session, isGuest, error, statusCode } = await resolveSessionForConsent(req, meetingId, requestId, requestToken);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: error || 'Authentication required.' }, { status: statusCode || 401 });
    }

    if (action === 'INITIATE') {
      if (isGuest || session.role === 'GUEST') {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'External guests cannot initiate recording consent sessions.' },
          { status: 403 }
        );
      }
      const res = await initiateRecordingConsentSession({
        meetingId,
        session,
      });
      return NextResponse.json(res, { status: 200 });
    }

    if (action === 'RECONCILE_PERMISSIONS') {
      const targetParticipantId = body.participantId || session.user.id;
      const res = await reconcileParticipantPermissions({
        meetingId,
        participantId: targetParticipantId,
      });
      return NextResponse.json(res, { status: 200 });
    }

    if (!recordingSessionId || !decision) {
      return NextResponse.json(
        { error: 'recordingSessionId and decision (GRANTED | DECLINED | WITHDRAWN) are required.' },
        { status: 400 }
      );
    }

    if (!['GRANTED', 'DECLINED', 'WITHDRAWN'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid consent decision. Must be GRANTED, DECLINED, or WITHDRAWN.' },
        { status: 400 }
      );
    }

    const res = await recordParticipantConsent({
      meetingId,
      recordingSessionId,
      session,
      decision,
      reason,
    });

    return NextResponse.json(res, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof RecordingServiceError) {
      return NextResponse.json(
        { error: err.code, message: err.message, details: err.details },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
