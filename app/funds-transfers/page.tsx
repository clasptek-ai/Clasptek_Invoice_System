/**
 * app/funds-transfers/page.tsx
 * Server Component: Funds & Official Accounts Intelligence
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  getPaymentAccounts,
  getCreditedAccountDistribution,
  getInternalTransfers,
  getFundsOverviewMetrics,
} from '@/lib/finance/funds-queries';
import { FundsTransfersPageClient } from './FundsTransfersPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Funds & Transfers — Clasptek Portal',
  description: 'Authoritative multi-account fund movement, external receipts ledger, and non-revenue transfers.',
};

export default async function FundsTransfersPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/funds-transfers');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;
  const [accounts, distribution, transfers, metrics] = await Promise.all([
    getPaymentAccounts(tenantId),
    getCreditedAccountDistribution(tenantId),
    getInternalTransfers(tenantId),
    getFundsOverviewMetrics(tenantId),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <FundsTransfersPageClient
        accounts={accounts}
        distribution={distribution}
        initialTransfers={transfers}
        metrics={metrics}
        currentUserRole={session.role}
      />
    </div>
  );
}
