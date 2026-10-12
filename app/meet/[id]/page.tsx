/**
 * app/meet/[id]/page.tsx — Clasptek Meetings LiveKit Only
 * Public Invitation Landing Page Route.
 * Server component that verifies meeting validity and passes safe metadata
 * to the interactive MeetLandingClient.
 */

import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { MeetLandingClient } from './MeetLandingClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Join Meeting ${id} — Clasptek LiveKit Video Conferencing`,
    description: 'Join live video classroom session on Clasptek Enterprise Platform.',
  };
}

export default async function MeetingLandingPage({ params }: PageProps) {
  const { id } = await params;
  const publicId = id;

  const supabase = await createServerClient();
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select(`
      id,
      public_id,
      title,
      description,
      status,
      provider,
      provider_room_url,
      scheduled_start,
      scheduled_end,
      settings,
      cohort_id,
      facilitator_id,
      cohorts (
        cohort_code,
        name
      ),
      personnel:facilitator_id (
        first_name,
        last_name
      )
    `)
    .eq('public_id', publicId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !meeting) {
    notFound();
  }

  const session = await getAuthoritativeSession().catch(() => null);

  // Map personnel facilitator name safely
  const pers = meeting.personnel as unknown as { first_name?: string; last_name?: string } | null;
  const facilitatorName = pers ? `${pers.first_name || ''} ${pers.last_name || ''}`.trim() : null;

  // Map cohort details safely
  const coh = meeting.cohorts as unknown as { cohort_code?: string; name?: string } | null;
  const cohortName = coh?.name || null;
  const cohortCode = coh?.cohort_code || null;

  const safeMeeting = {
    id: meeting.id,
    publicId: meeting.public_id,
    title: meeting.title,
    description: meeting.description,
    status: meeting.status,
    provider: String(meeting.provider || 'LIVEKIT').toLowerCase(),
    providerRoomUrl: meeting.provider_room_url || null,
    scheduledStart: meeting.scheduled_start,
    scheduledEnd: meeting.scheduled_end,
    settings: meeting.settings || {},
    cohortId: meeting.cohort_id,
    cohortCode,
    cohortName,
    facilitatorName,
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
