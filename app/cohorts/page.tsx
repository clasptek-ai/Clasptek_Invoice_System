/**
 * app/cohorts/page.tsx — Phase 4
 * Server Component: Protected route for Cohorts & Schedules.
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getCohorts, getProgrammes } from '@/lib/academics/queries';
import { getPersonnelList } from '@/lib/finance/queries';
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
  const session = await getAuthoritativeSession();
  if (!session) {
    redirect('/login?next=/cohorts');
  }

  // Cohort creation/management is an Admin-authorized operation
  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const prog = params.prog ?? 'ALL';
  const status = params.status ?? 'ALL';

  const [cohortsResult, progsResult, personnelList] = await Promise.all([
    getCohorts({
      search,
      programmeId: prog,
      status,
    }),
    getProgrammes(),
    getPersonnelList(),
  ]);

  const facilitators = (personnelList || []).map((p) => ({
    id: p.id,
    fullName: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
    name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
    employeeId: p.employeeId,
    jobTitle: p.department || (p.employeeType === 'facilitator' ? 'Lead Facilitator' : 'Staff'),
  }));

  return (
    <CohortsPageClient
      initialCohorts={cohortsResult.data}
      programmes={progsResult.data}
      facilitators={facilitators}
      currentSearch={search}
      currentProg={prog}
      currentStatus={status}
    />
  );
}
