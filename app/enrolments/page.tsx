/**
 * app/enrolments/page.tsx — Phase 4
 * Server Component: Protected route for Course Enrolments.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getEnrolments, getCohorts } from '@/lib/academics/queries';
import { EnrolmentsPageClient } from './EnrolmentsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Course Enrolments — Clasptek Portal',
  description: 'Comprehensive enrolment lifecycle management, immutable agreed tuition snapshots, and academic status tracking.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function EnrolmentsPage({ searchParams }: PageProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/enrolments');
  }

  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const cohort = params.cohort ?? 'ALL';
  const status = params.status ?? 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));

  const [enrolmentsResult, cohortsResult] = await Promise.all([
    getEnrolments({
      search,
      cohortId: cohort,
      status,
      page,
    }),
    getCohorts(),
  ]);

  return (
    <EnrolmentsPageClient
      initialEnrolments={enrolmentsResult.data}
      totalCount={enrolmentsResult.count}
      cohorts={cohortsResult.data}
      currentSearch={search}
      currentCohort={cohort}
      currentStatus={status}
      currentPage={page}
    />
  );
}
