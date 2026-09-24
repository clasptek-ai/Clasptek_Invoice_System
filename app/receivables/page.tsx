/**
 * app/receivables/page.tsx
 * Server Component: Receivables & Collections Management
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getReceivablesAgeing } from '@/lib/finance/receivables-queries';
import { ReceivablesPageClient } from './ReceivablesPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Receivables & Collections — Clasptek Portal',
  description: 'Authoritative receivables ledger, 5-bucket ageing analysis, collection action tracking, and risk scores.',
};

export default async function ReceivablesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/receivables');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const data = await getReceivablesAgeing(session.tenantId);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <ReceivablesPageClient
        initialBuckets={data.buckets}
        initialInvoices={data.outstandingInvoices}
        currentUserRole={session.role}
      />
    </div>
  );
}
