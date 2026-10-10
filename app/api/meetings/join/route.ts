/**
 * app/api/meetings/join/route.ts — Phase 2 Meetings Persistence & Security
 * Route handler for Meeting Join & Token Issuance.
 * Issues short-lived LiveKit token only after strict database-backed authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getAuthoritativePersonnel } from '@/lib/ess/queries';
import { getSFUService } from '@/lib/meetings/sfu';
import { getMeetingById, updateMeetingStatus } from '@/lib/meetings/queries';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be logged into Clasptek to join this meeting.' },
        { status: 401 }
      );
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Authoritative tenant could not be resolved.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { publicId, meetingId } = body;

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const meetingRes = await getMeetingById(identifier);
    if (!meetingRes.data) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingRes.data;

    // Cross-tenant prevention
    if (meeting.tenantId !== tenantId) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    // Soft delete check
    if (meeting.deletedAt) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    // Canonical status check
    if (meeting.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'MEETING_ENDED', message: 'This meeting has completed. Thank you for attending.' },
        { status: 400 }
      );
    }

    if (meeting.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'MEETING_CANCELLED', message: 'This meeting has been cancelled.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const userRole = session.role;
    let isHost = false;
    let participantRole: 'HOST' | 'FACILITATOR' | 'STUDENT' = 'STUDENT';

    if (['Super Admin', 'Finance Manager'].includes(userRole)) {
      isHost = true;
      participantRole = 'HOST';
    } else if (userRole === 'Facilitator') {
      // Authoritative personnel lookup: auth.uid() -> personnel.user_id -> personnel.id
      const personnelRes = await getAuthoritativePersonnel().catch(() => null);
      const persId = personnelRes?.personnel?.id;
      if (!persId) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED_MEETING_ACCESS', message: 'No authoritative personnel profile found for this facilitator.' },
          { status: 403 }
        );
      }

      let isAssigned = Boolean(persId && meeting.facilitatorId === persId);

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
          {
            error: 'UNAUTHORIZED_MEETING_ACCESS',
            message: 'You are not assigned as a facilitator to this meeting or its cohort.',
          },
          { status: 403 }
        );
      }

      isHost = true;
      participantRole = 'HOST';
    } else if (userRole === 'Student') {
      // Authoritative student lookup: auth.uid() -> students.user_id -> students.id
      const { data: studData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const studentId = studData?.id;
      if (!studentId || !meeting.cohortId) {
        return NextResponse.json(
          {
            error: 'UNAUTHORIZED_MEETING_ACCESS',
            message: 'You are not enrolled in the cohort scheduled for this meeting.',
          },
          { status: 403 }
        );
      }

      // Check active enrolment in meeting's cohort
      const { data: enrolment } = await supabase
        .from('enrolments')
        .select('id')
        .eq('cohort_id', meeting.cohortId)
        .eq('student_id', studentId)
        .eq('tenant_id', tenantId)
        .not('status', 'in', '("CANCELLED","WITHDRAWN")')
        .maybeSingle();

      if (!enrolment) {
        return NextResponse.json(
          {
            error: 'UNAUTHORIZED_MEETING_ACCESS',
            message: 'You are not enrolled in the cohort scheduled for this meeting.',
          },
          { status: 403 }
        );
      }

      isHost = false;
      participantRole = 'STUDENT';
    } else {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED_MEETING_ACCESS',
          message: 'Staff access to live classroom meetings requires administrative or facilitator authorization.',
        },
        { status: 403 }
      );
    }

    // If meeting was SCHEDULED and host joins, transition to LIVE
    if (isHost && meeting.status === 'SCHEDULED') {
      await updateMeetingStatus(meeting.id, 'LIVE');
    }

    const sfu = getSFUService();
    const authName =
      (session.user.user_metadata?.full_name as string) ||
      (session.user.user_metadata?.name as string) ||
      session.user.email;
    const pName = authName || 'Participant';

    const tokenResult = await sfu.generateParticipantToken({
      roomId: meeting.publicId,
      participantId: session.user.id,
      participantName: pName,
      isHost,
      role: participantRole,
    });

    return NextResponse.json({
      success: true,
      participantSessionId: `mp_${Date.now()}`,
      participantId: session.user.id,
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
