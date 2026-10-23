/**
 * app/meet/[id]/page.tsx — Clasptek Video Conferencing Landing Page
 * Public Invitation Landing Page Route.
 * Server component that verifies meeting validity and passes safe minimal metadata
 * to the interactive MeetLandingClient.
 *
 * Security Invariants:
 * - Strict parameter validation against PostgREST filter injection.
 * - Minimal public projection (NO settings, NO providerRoomUrl, NO internal DB UUIDs).
 * - Provider URLs and LiveKit tokens released strictly through authenticated / authorized join.
 */

import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetLandingClient } from './MeetLandingClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const cleanId = (id || '').trim();
  return {
    title: `Join Meeting ${cleanId} — Clasptek Video Conferencing`,
    description: 'Join live video classroom session on Clasptek Enterprise Platform.',
  };
}

export default async function MeetingLandingPage({ params }: PageProps) {
  const { id } = await params;
  const cleanId = (id || '').trim();

  // 1. Strict syntax validation to prevent PostgREST filter injection (Finding V-04)
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanId);
  const isPublicFormat = /^[a-zA-Z0-9_-]{3,128}$/.test(cleanId);

  if (!isPublicFormat && !isUuid) {
    notFound();
  }

  let meeting: any = null;

  // Controlled offline tests mock support
  if ((globalThis as any).__MOCK_MEETINGS_DB__) {
    const mockDb = (globalThis as any).__MOCK_MEETINGS_DB__;
    let m = mockDb.get(cleanId);
    if (!m) {
      for (const val of mockDb.values()) {
        if (val.id === cleanId || val.publicId === cleanId) {
          m = val;
          break;
        }
      }
    }
    if (m && !m.deletedAt) {
      meeting = {
        id: m.id,
        public_id: m.publicId,
        tenant_id: m.tenantId,
        title: m.title,
        description: m.description,
        status: m.status,
        provider: m.sfuProvider || 'livekit',
        provider_room_url: m.providerRoomUrl,
        scheduled_start: m.scheduledStart,
        scheduled_end: m.scheduledEnd,
        cohort_id: m.cohortId,
        facilitator_id: m.facilitatorId,
        participant_access: m.participantAccess || 'COHORT_ONLY',
      };
    }
  }

  // 2. Safe, parameterized database query without composing dynamic .or() strings
  if (!meeting) {
    const supabase = createSupabaseServiceClient();

    // Primary lookup: by public_id
    const { data: byPublic } = await supabase
      .from('meetings')
      .select(`
        id,
        public_id,
        tenant_id,
        title,
        description,
        status,
        provider,
        provider_room_url,
        scheduled_start,
        scheduled_end,
        cohort_id,
        facilitator_id,
        participant_access
      `)
      .eq('public_id', cleanId)
      .is('deleted_at', null)
      .maybeSingle();

    if (byPublic) {
      meeting = byPublic;
    } else if (isUuid) {
      // Fallback lookup: by internal UUID if parameter is valid UUID format
      const { data: byId } = await supabase
        .from('meetings')
        .select(`
          id,
          public_id,
          tenant_id,
          title,
          description,
          status,
          provider,
          provider_room_url,
          scheduled_start,
          scheduled_end,
          cohort_id,
          facilitator_id,
          participant_access
        `)
        .eq('id', cleanId)
        .is('deleted_at', null)
        .maybeSingle();

      if (byId) {
        meeting = byId;
      }
    }

    if (!meeting) {
      notFound();
    }
  }

  const session = await getAuthoritativeSession().catch(() => null);

  // Authoritatively resolve facilitator display name (tenant-scoped)
  let facilitatorName: string | null = null;
  if (meeting.facilitator_id && meeting.tenant_id) {
    const supabase = createSupabaseServiceClient();
    const { data: pers } = await supabase
      .from('personnel')
      .select('first_name, last_name, full_name')
      .eq('id', meeting.facilitator_id)
      .eq('tenant_id', meeting.tenant_id)
      .maybeSingle();
    if (pers) {
      facilitatorName = (pers as any).full_name || `${(pers as any).first_name || ''} ${(pers as any).last_name || ''}`.trim() || null;
    }
  }

  // Authoritatively resolve cohort details (tenant-scoped)
  let cohortName: string | null = null;
  let cohortCode: string | null = null;
  if (meeting.cohort_id && meeting.tenant_id) {
    const supabase = createSupabaseServiceClient();
    const { data: coh } = await supabase
      .from('cohorts')
      .select('cohort_code, name')
      .eq('id', meeting.cohort_id)
      .eq('tenant_id', meeting.tenant_id)
      .maybeSingle();
    if (coh) {
      cohortName = coh.name || null;
      cohortCode = (coh as any).cohort_code || null;
    }
  }

  // 3. Metadata Minimization (Findings V-01 and V-02):
  // Omit settings, omit internal meeting UUID, omit internal cohort UUID.
  // CRITICAL: providerRoomUrl is NEVER disclosed to unauthenticated landing props.
  const safeMeeting = {
    publicId: meeting.public_id,
    title: meeting.title,
    description: meeting.description,
    status: meeting.status,
    provider: String(meeting.provider || 'LIVEKIT').toLowerCase() as 'livekit' | 'google_meet',
    scheduledStart: meeting.scheduled_start,
    scheduledEnd: meeting.scheduled_end,
    cohortCode,
    cohortName,
    facilitatorName,
    participantAccess: (meeting.participant_access || 'COHORT_ONLY') as 'COHORT_ONLY' | 'ALL_STUDENTS' | 'PUBLIC_TOKEN',
  };

  const safeUser = session?.user
    ? {
        id: session.user.id,
        email: session.user.email || '',
        name:
          (session.user.user_metadata?.full_name as string) ||
          (session.user.user_metadata?.name as string) ||
          session.user.email ||
          'Student',
        role: session.role,
        tenantId: session.tenantId,
      }
    : null;

  return <MeetLandingClient meeting={safeMeeting} currentUser={safeUser} />;
}
