/**
 * app/enquiries/page.tsx — Phase 3
 * Server Component: Protected route for Enquiries & CRM.
 *
 * Responsibilities:
 *  1. Verify authenticated session (redirect to /login if not).
 *  2. Fetch initial enquiry data server-side (RLS enforces tenant isolation).
 *  3. Pass data to the client component.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getEnquiries } from '@/lib/admissions/queries';
import { EnquiriesPageClient } from './EnquiriesPageClient';
import type { EnquiryFilters } from '@/types/admissions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enquiries & Leads — Clasptek Portal',
  description: 'Manage prospect enquiries, lead progression, and CRM pipeline.',
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function EnquiriesPage({ searchParams }: PageProps) {
  // 1. Verify authentication
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/enquiries');
  }

  // 2. Parse search params
  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const status = (params.status ?? '') as EnquiryFilters['status'];
  const page = Math.max(1, parseInt(params.page ?? '1', 10));

  // 3. Fetch initial data server-side
  const { data: enquiries, count, error } = await getEnquiries({ search, status, page });

  if (error) {
    // Non-blocking — surface error in UI
    console.error('[/enquiries] data fetch error:', error);
  }

  return (
    <EnquiriesPageClient
      initialEnquiries={enquiries}
      totalCount={count}
      currentSearch={search}
      currentStatus={status}
      currentPage={page}
    />
  );
}
