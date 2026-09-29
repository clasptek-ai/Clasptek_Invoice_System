/**
 * app/dashboard/page.tsx — Authenticated Dashboard Foundation
 * Phase 2: Next.js Foundation
 * Server Component: validates session, renders AppLayout with KPI cards.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';

// Opt out of static generation — reads auth session from cookies at runtime
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Clasptek Portal — Executive Dashboard',
};

export default async function DashboardPage() {
  // Server-side auth guard — middleware also protects this route
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return <DashboardClient />;
}
