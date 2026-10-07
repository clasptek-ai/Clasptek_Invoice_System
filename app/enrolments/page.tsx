/**
 * app/enrolments/page.tsx — Phase 4
 * Server Component: Protected route for Course Enrolments.
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
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
  const session = await getAuthoritativeSession();
  if (!session) {
    redirect('/login?next=/enrolments');
  }

  // Facilitators and Students must NOT access the organisation-wide Enrolments administration screen.
  // Super Admin, Finance Manager, and Staff (Admissions/Registrar) retain access.
  const allowedRoles = ['Super Admin', 'Finance Manager', 'Staff'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const cohort = params.cohort ?? 'ALL';
  const status = params.status ?? 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const rawPageSize = parseInt(params.pageSize ?? '25', 10);
  const pageSize = [10, 25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;
  const sortBy = params.sortBy ?? 'enrolment_date';
  const sortOrder = (params.order === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const [enrolmentsResult, cohortsResult] = await Promise.all([
    getEnrolments({
      search,
      cohortId: cohort,
      status,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    getCohorts(),
  ]);

  return (
    <EnrolmentsPageClient
      initialEnrolments={enrolmentsResult.data}
      totalCount={enrolmentsResult.count}
      initialError={enrolmentsResult.error}
      cohorts={cohortsResult.data}
      currentSearch={search}
      currentCohort={cohort}
      currentStatus={status}
      currentPage={page}
      pageSize={pageSize}
      currentSortBy={sortBy}
      currentSortOrder={sortOrder}
    />
  );
}
