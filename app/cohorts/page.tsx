/**
 * app/cohorts/page.tsx — Phase 4
 * Server Component: Protected route for Cohorts & Schedules.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getCohorts, getProgrammes } from '@/lib/academics/queries';
import { CohortsPageClient } from './CohortsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cohorts & Schedules — Clasptek Portal',
  description: 'Authoritative cohort scheduling, seat capacity management, assigned lead facilitators, and training progression.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function CohortsPage({ searchParams }: PageProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/cohorts');
  }

  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const prog = params.prog ?? 'ALL';
  const status = params.status ?? 'ALL';

  const [cohortsResult, progsResult] = await Promise.all([
    getCohorts({
      search,
      programmeId: prog,
      status,
    }),
    getProgrammes(),
  ]);

  return (
    <CohortsPageClient
      initialCohorts={cohortsResult.data}
      programmes={progsResult.data}
      currentSearch={search}
      currentProg={prog}
      currentStatus={status}
    />
  );
}
