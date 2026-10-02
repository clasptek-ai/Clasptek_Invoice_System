/**
 * app/students/page.tsx — Phase 4
 * Server Component: Protected route for Student & Client Directory.
 * Enforces session verification, multi-filter extraction, and authoritative data fetching.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/students');
  }

  const session = await getAuthoritativeSession();
  const params = await searchParams;

  const search = (params.search ?? '').trim();
  const status = params.status ?? 'ALL';
  const programmeId = params.programmeId ?? 'ALL';
  const enrolmentStatus = params.enrolmentStatus ?? 'ALL';
  const financialStatus = params.financialStatus ?? 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const rawPageSize = parseInt(params.pageSize ?? '25', 10);
  const pageSize = [10, 25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;

  const [result, programmes] = await Promise.all([
    getStudents({
      search,
      status,
      programmeId,
      enrolmentStatus,
      financialStatus,
      page,
      pageSize,
    }),
    getProgrammes(),
  ]);

  return (
    <StudentsPageClient
      initialStudents={result.data}
      totalCount={result.count}
      currentSearch={search}
      currentStatus={status}
      currentProgrammeId={programmeId}
      currentEnrolmentStatus={enrolmentStatus}
      currentFinancialStatus={financialStatus}
      programmes={programmes}
      currentPage={page}
      pageSize={pageSize}
      currentUserRole={session?.role || 'Staff'}
    />
  );
}
