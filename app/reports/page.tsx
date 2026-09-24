import React from 'react';
import { getUnifiedReports } from '@/lib/intelligence/queries';
import { getFinanceTenantId, getFinancialMetrics } from '@/lib/finance/queries';
import { ReportsPageClient } from './ReportsPageClient';

export const metadata = {
  title: 'Reports & Analytics — Clasptek Portal',
  description: 'Official decision-grade operational intelligence report covering finance, revenue collection, receivables, programmes, and payroll.',
};

export default async function ReportsPage() {
  const tenantId = await getFinanceTenantId();

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
