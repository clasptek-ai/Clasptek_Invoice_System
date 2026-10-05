import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getUnifiedReports } from '@/lib/intelligence/queries';
import { getFinancialMetrics } from '@/lib/finance/queries';
import { ReportsPageClient } from './ReportsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reports & Analytics — Clasptek Portal',
  description: 'Official decision-grade operational intelligence report covering finance, revenue collection, receivables, programmes, and payroll.',
};

export default async function ReportsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/reports');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;

  const [initialReports, financeMetrics] = await Promise.all([
    getUnifiedReports('ALL', tenantId),
    getFinancialMetrics(tenantId),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <ReportsPageClient
        initialReports={initialReports}
        financeMetrics={financeMetrics}
      />
    </div>
  );
}
