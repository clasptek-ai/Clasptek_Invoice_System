/**
 * app/dashboard/page.tsx — Authenticated Dashboard Foundation
 * Phase 2: Next.js Foundation
 * Server Component: validates session, renders AppLayout with KPI cards.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { DashboardClient } from './DashboardClient';

// Opt out of static generation — reads auth session from cookies at runtime
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Clasptek Portal — Executive Dashboard',
};

export default async function DashboardPage() {
  // Server-side authoritative auth & tenant membership guard (C253 / DEF-C252-04)
  // Ensures suspended or unmapped users cannot access protected dashboard content
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login');
  }

  return <DashboardClient />;
}
