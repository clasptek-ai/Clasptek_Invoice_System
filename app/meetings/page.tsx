/**
 * app/meetings/page.tsx — Phase 5
 * Server Component: Clasptek Meeting Operations
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getMeetings } from '@/lib/meetings/queries';
import { getGoogleDriveStatus } from '@/lib/meetings/google-drive';
import { getTrainingCohorts } from '@/lib/training/queries';
import { MeetingsPageClient } from './MeetingsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Meetings & Live Video Operations — Clasptek Portal',
  description: 'Native browser video meeting rooms for Clasptek live classrooms, cohort lectures, and facilitator sessions.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function MeetingsPage({ searchParams }: PageProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/meetings');
  }

  const params = await searchParams;
  const subTab = params.subTab || 'all';
  const searchQuery = params.search || '';

  const [meetingsRes, driveStatus, cohortsRes, personnelRes, progRes] = await Promise.all([
    getMeetings({ subTab, search: searchQuery }),
    getGoogleDriveStatus(),
    getTrainingCohorts(),
    supabase.from('personnel').select('id, name, first_name, last_name, role'),
    supabase.from('programmes').select('id, name'),
  ]);

  const meetings = meetingsRes.data || [];
  const cohorts = cohortsRes.data || [];
  const personnel = (personnelRes.data || []).map(
    (p: { id: string; name?: string; first_name?: string; last_name?: string; role?: string }) => ({
      id: p.id,
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
      role: p.role || 'Facilitator',
    })
  );
  const programmes = progRes.data || [];

  return (
    <MeetingsPageClient
      initialMeetings={meetings}
      initialDriveStatus={driveStatus}
      cohorts={cohorts}
      personnel={personnel}
      programmes={programmes}
      currentSubTab={subTab}
      currentSearch={searchQuery}
      currentUser={{
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || user.email || 'Staff Member',
        role: user.user_metadata?.role || 'Staff',
      }}
    />
  );
}
