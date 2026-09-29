/**
 * app/applications/page.tsx — Phase 3
 * Server Component: Protected route for CRM Intake Applications.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import {
  getApplications,
  getApplicationStatusCounts,
  getProgrammes,
} from '@/lib/admissions/queries';
import { ApplicationsPageClient } from './ApplicationsPageClient';
import type { ApplicationStatus, ApplicationSource } from '@/types/admissions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Student Registration & Intake — Clasptek Portal',
  description: 'Student registration intake management, identity resolution, and student conversion pipeline.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  // 1. Verify authentication
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/applications');
  }

  // 2. Parse search params
  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const status = (params.status ?? 'ALL') as ApplicationStatus | 'ALL';
  const programme = params.programme ?? '';
  const source = (params.source ?? 'ALL') as ApplicationSource | 'ALL';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const rawPageSize = parseInt(params.pageSize ?? '25', 10);
  const pageSize = [10, 25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;

  // 3. Parallel fetch data server-side
  const [appsResult, statusCounts, programmes] = await Promise.all([
    getApplications({
      search,
      status,
      programmeId: programme,
      source,
      page,
      pageSize,
    }),
    getApplicationStatusCounts(),
    getProgrammes(),
  ]);

  if (appsResult.error) {
    console.error('[/applications] data fetch error:', appsResult.error);
  }

  return (
    <ApplicationsPageClient
      initialApplications={appsResult.data}
      totalCount={appsResult.count}
      statusCounts={statusCounts}
      programmes={programmes}
      currentSearch={search}
      currentStatus={status}
      currentProgramme={programme}
      currentSource={source}
      currentPage={page}
      pageSize={pageSize}
    />
  );
}
