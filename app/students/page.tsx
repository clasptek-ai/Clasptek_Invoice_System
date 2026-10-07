/**
 * app/students/page.tsx — Phase 4
 * Server Component: Protected route for Student & Client Directory.
 * Enforces session verification, multi-filter extraction, and authoritative data fetching.
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getStudents } from '@/lib/students/queries';
import { getProgrammes } from '@/lib/admissions/queries';
import { StudentsPageClient } from './StudentsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Students & Client Directory — Clasptek Portal',
  description: 'Single source of truth for student journey, billing history, receipts, cohort enrolments, and balance tracking.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const session = await getAuthoritativeSession();
  if (!session) {
    redirect('/login?next=/students');
  }

  // Facilitators and Students must NOT access the organisation-wide Student Directory.
  // Super Admin, Finance Manager, and Staff (Admissions/Registrar) retain access.
  const allowedRoles = ['Super Admin', 'Finance Manager', 'Staff'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;

  const search = (params.search ?? '').trim();
  const status = params.status ?? 'ALL';
  const programmeId = params.programmeId ?? 'ALL';
  const enrolmentStatus = params.enrolmentStatus ?? 'ALL';
  const financialStatus = params.financialStatus ?? 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const rawPageSize = parseInt(params.pageSize ?? '25', 10);
  const pageSize = [10, 25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;
  const sortBy = params.sortBy ?? 'registration_date';
  const sortOrder = (params.order === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const [result, programmes] = await Promise.all([
    getStudents({
      search,
      status,
      programmeId,
      enrolmentStatus,
      financialStatus,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    getProgrammes(),
  ]);

  return (
    <StudentsPageClient
      initialStudents={result.data}
      totalCount={result.count}
      initialError={result.error}
      currentSearch={search}
      currentStatus={status}
      currentProgrammeId={programmeId}
      currentEnrolmentStatus={enrolmentStatus}
      currentFinancialStatus={financialStatus}
      programmes={programmes}
      currentPage={page}
      pageSize={pageSize}
      currentUserRole={session?.role || 'Staff'}
      currentSortBy={sortBy}
      currentSortOrder={sortOrder}
    />
  );
}
