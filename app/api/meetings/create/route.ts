/**
 * app/api/meetings/create/route.ts — Phase 2 Meetings Persistence & Security
 * Route handler for Meeting Creation.
 * Authoritative administrator creation with zero-trust validation of tenant,
 * personnel, cohort, and schedule boundaries.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthoritativeSession } from '@/lib/auth/server';
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
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to schedule meetings.' },
        { status: 403 }
      );
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Forbidden: Authoritative tenant could not be resolved.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      cohortId,
      trainingSessionId,
      facilitatorId,
      scheduledStart,
      scheduledEnd,
      participantAccess = 'COHORT_ONLY',
      settings = {},
      provider = 'livekit',
      customGoogleMeetUrl,
      googleMeetUrl,
    } = body;

    // LiveKit-only enforcement: reject explicit Google Meet requests with structured HTTP 400
    const rawProvider = body.provider !== undefined && body.provider !== null
      ? String(body.provider).trim().toLowerCase()
      : 'livekit';

    if (rawProvider === 'google_meet' || customGoogleMeetUrl || googleMeetUrl) {
      return NextResponse.json(
        {
          error: 'PROVIDER_UNSUPPORTED',
          message: 'Google Meet is not supported. Clasptek video meetings use LiveKit exclusively.',
        },
        { status: 400 }
      );
    }

    if (rawProvider !== 'livekit') {
      return NextResponse.json(
        {
          error: 'PROVIDER_UNSUPPORTED',
          message: `Unsupported meeting provider '${body.provider}'. Clasptek video meetings use LiveKit exclusively.`,
        },
        { status: 400 }
      );
    }

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Meeting title is required' }, { status: 400 });
    }

    const now = new Date();
    const startIso = scheduledStart ? new Date(scheduledStart).toISOString() : now.toISOString();
    const endIso = scheduledEnd
      ? new Date(scheduledEnd).toISOString()
      : new Date(now.getTime() + 2 * 3600000).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      return NextResponse.json(
        { error: 'Invalid schedule: scheduledEnd must be after scheduledStart.' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // Validate facilitator ID (must be a valid personnel.id for this tenant, NEVER an auth UUID)
    let validatedFacilitatorId: string | null = null;
    if (session.role === 'Facilitator') {
      const { data: pers } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!pers) {
        return NextResponse.json(
          { error: 'INVALID_FACILITATOR', message: 'No authoritative personnel profile found for this facilitator.' },
          { status: 403 }
        );
      }
      validatedFacilitatorId = pers.id;
    } else if (facilitatorId && typeof facilitatorId === 'string' && facilitatorId.trim()) {
      const cleanFacilitatorId = facilitatorId.trim();
      const { data: pers } = await supabase
        .from('personnel')
        .select('id')
        .eq('id', cleanFacilitatorId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!pers) {
        return NextResponse.json(
          { error: 'INVALID_FACILITATOR', message: 'The specified facilitator ID does not exist in this tenant.' },
          { status: 400 }
        );
      }
      validatedFacilitatorId = pers.id;
    }

    // Facilitators may only schedule for cohorts they lead. The facilitator identity is the
    // authoritative personnel.id resolved above from the session (never client-supplied), and
    // assignment is cohorts.lead_facilitator_id, matching join / upload-recording / guest-decision.
    const isFacilitatorActor = session.role === 'Facilitator';
    const denyFacilitatorCohort = () =>
      NextResponse.json(
        {
          error: 'COHORT_NOT_ASSIGNED',
          message: 'You can only schedule meetings for cohorts assigned to you.',
        },
        { status: 403 }
      );

    // Validate cohort ID if provided
    let validatedCohortId: string | null = null;
    if (cohortId && typeof cohortId === 'string' && cohortId.trim()) {
      const cleanCohortId = cohortId.trim();
      let cohortQuery = supabase
        .from('cohorts')
        .select('id')
        .eq('id', cleanCohortId)
        .eq('tenant_id', tenantId);

      if (isFacilitatorActor) {
        cohortQuery = cohortQuery.eq('lead_facilitator_id', validatedFacilitatorId);
      }

      const { data: coh } = await cohortQuery.maybeSingle();

      if (!coh) {
        // Uniform response for unassigned, cross-tenant and non-existent cohorts (no existence leak).
        if (isFacilitatorActor) return denyFacilitatorCohort();
        return NextResponse.json(
          { error: 'INVALID_COHORT', message: 'The specified cohort does not exist in this tenant.' },
          { status: 400 }
        );
      }
      validatedCohortId = coh.id;
    }

    // Validate training session ID if provided
    let validatedSessionId: string | null = null;
    if (trainingSessionId && typeof trainingSessionId === 'string' && trainingSessionId.trim()) {
      const cleanSessionId = trainingSessionId.trim();
      const { data: ts } = await supabase
        .from('training_sessions')
        .select('id, cohort_id, facilitator_id')
        .eq('id', cleanSessionId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!ts) {
        if (isFacilitatorActor) return denyFacilitatorCohort();
        return NextResponse.json(
          { error: 'INVALID_TRAINING_SESSION', message: 'The specified training session does not exist in this tenant.' },
          { status: 400 }
        );
      }

      if (isFacilitatorActor && ts.facilitator_id !== validatedFacilitatorId) {
        // Session not directly assigned: allow only if its cohort is led by this facilitator.
        let sessionCohortAssigned = false;
        if (ts.cohort_id) {
          const { data: sessionCohort } = await supabase
            .from('cohorts')
            .select('id')
            .eq('id', ts.cohort_id)
            .eq('tenant_id', tenantId)
            .eq('lead_facilitator_id', validatedFacilitatorId)
            .maybeSingle();
          sessionCohortAssigned = Boolean(sessionCohort);
        }
        if (!sessionCohortAssigned) return denyFacilitatorCohort();
      }
      validatedSessionId = ts.id;
    }

    const meetingId = generateMeetingId();
    const publicId = generatePublicId();

    const selectedProvider = 'livekit';
    let sfuRoomResult = null;
    let providerRoomUrl: string | null = null;
    const sfuRoomId: string = publicId;

    let sfu;
    try {
      sfu = getSFUService();
    } catch (configErr: unknown) {
      const msg = configErr instanceof Error ? configErr.message : '';
      const isMissingConfig = msg.includes('CONFIGURATION_ERROR') || msg.includes('missing');
      return NextResponse.json(
        {
          error: isMissingConfig ? 'SERVICE_UNCONFIGURED' : 'SERVICE_UNAVAILABLE',
          message: isMissingConfig
            ? 'The video meeting service is not configured. Please contact an administrator.'
            : 'The video meeting service is temporarily unavailable. Please try again shortly.',
        },
        { status: 503 }
      );
    }

    try {
      sfuRoomResult = await sfu.createRoom({
        roomId: publicId,
        roomTitle: title.trim(),
        settings: {
          emptyTimeout: 300,
          maxParticipants: 100,
        },
      });
      providerRoomUrl = process.env.LIVEKIT_URL || null;
    } catch (sfuErr: unknown) {
      return NextResponse.json(
        {
          error: 'SERVICE_UNAVAILABLE',
          message: 'The video meeting service is temporarily unavailable. Please try again shortly.',
        },
        { status: 502 }
      );
    }

    const meetingRecord: Meeting = {
      id: meetingId,
      tenantId,
      publicId,
      title: title.trim(),
      description: (description || '').trim() || null,
      programmeId: null,
      cohortId: validatedCohortId,
      trainingSessionId: validatedSessionId,
      facilitatorId: validatedFacilitatorId,
      scheduledStart: startIso,
      scheduledEnd: endIso,
      actualStart: null,
      actualEnd: null,
      status: 'SCHEDULED',
      participantAccess: ['COHORT_ONLY', 'ALL_STUDENTS', 'PUBLIC_TOKEN'].includes(participantAccess)
        ? participantAccess
        : 'COHORT_ONLY',
      sfuProvider: selectedProvider,
      sfuRoomId,
      providerRoomUrl,
      settings: {
        allowChat: settings.allowChat !== false,
        allowScreenShare: settings.allowScreenShare !== false,
        muteOnEntry: Boolean(settings.muteOnEntry),
      },
      recordingEnabled: false,
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
      createdBy: session.user.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    };

    // Save to PostgreSQL with strict error propagation
    await saveMeetingRecord(meetingRecord);

    return NextResponse.json(
      {
        success: true,
        meeting: meetingRecord,
        provider: selectedProvider,
        publicUrl: `/meet/${publicId}`,
        meetUrl: providerRoomUrl,
        sfuRoom: sfuRoomResult,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
