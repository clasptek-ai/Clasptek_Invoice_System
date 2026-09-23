/**
 * app/students/page.tsx — Phase 4
 * Server Component: Protected route for Student & Client Directory.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getStudents } from '@/lib/students/queries';
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

  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const status = params.status ?? 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));

  const result = await getStudents({
    search,
    status,
    page,
  });

  return (
    <StudentsPageClient
      initialStudents={result.data}
      totalCount={result.count}
      currentSearch={search}
      currentStatus={status}
      currentPage={page}
    />
  );
}
