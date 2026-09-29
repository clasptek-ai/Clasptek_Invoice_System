/**
 * app/facilitator-reports/page.tsx — Phase 5
 * Server Component: Facilitator Training Delivery Reports
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getFacilitatorReports, getTrainingCohorts } from '@/lib/training/queries';
import { FacilitatorReportsPageClient } from './FacilitatorReportsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Facilitator Training Delivery Reports — Clasptek Portal',
  description: 'Comprehensive session delivery logs submitted by instructors, syllabus coverage, student engagement, and management sign-off.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function FacilitatorReportsPage({ searchParams }: PageProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/facilitator-reports');
  }

  const params = await searchParams;
  const cohortFilter = params.cohortId || 'ALL';
  const statusFilter = params.status || 'ALL';
  const searchQuery = params.search || '';

  const [reportsRes, cohortsRes, personnelRes] = await Promise.all([
    getFacilitatorReports({
      cohortId: cohortFilter,
      status: statusFilter,
      search: searchQuery,
    }),
    getTrainingCohorts(),
    supabase.from('personnel').select('id, name, first_name, last_name, role, status'),
  ]);

  const reports = reportsRes.data || [];
  const cohorts = cohortsRes.data || [];
  const personnel = (personnelRes.data || []).map(
    (p: { id: string; name?: string; first_name?: string; last_name?: string; role?: string; status?: string }) => ({
      id: p.id,
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
      role: p.role || 'Facilitator',
      status: p.status || 'active',
    })
  );

  return (
    <FacilitatorReportsPageClient
      initialReports={reports}
      cohorts={cohorts}
      personnel={personnel}
      currentCohortFilter={cohortFilter}
      currentStatusFilter={statusFilter}
      currentSearch={searchQuery}
    />
  );
}
