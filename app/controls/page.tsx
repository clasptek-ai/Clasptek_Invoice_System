/**
 * app/controls/page.tsx
 * Server Component: Financial Controls & Governance
 * Phase 9B: Administration & Governance Module Migration
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getFinancialPeriodStatus } from '@/lib/controls/queries';
import { FinancialControlsPageClient } from './FinancialControlsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Financial Controls — Clasptek Portal',
  description: 'Accounting period locks, approval threshold tiers, and transaction governance.',
};

export default async function FinancialControlsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/controls');
  }

  const allowed = ['Super Admin', 'Finance Manager'].includes(session.role);
  if (!allowed) {
    redirect('/dashboard');
  }

  const periodStatus = await getFinancialPeriodStatus(session.tenantId);

  return (
    <FinancialControlsPageClient
      initialPeriod={periodStatus}
      currentUserRole={session.role}
    />
  );
}
