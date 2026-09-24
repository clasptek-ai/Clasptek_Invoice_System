import React from 'react';
import { getManagementDashboardMetrics } from '@/lib/intelligence/queries';
import { getFinanceTenantId } from '@/lib/finance/queries';
import { IntelligencePageClient } from './IntelligencePageClient';

export const metadata = {
  title: 'Management Intelligence — Clasptek Portal',
  description: 'Consolidated executive decision-grade intelligence across admissions, academics, training, meetings, finance, and payroll.',
};

export default async function IntelligencePage() {
  const tenantId = await getFinanceTenantId();
  const initialMetrics = await getManagementDashboardMetrics(tenantId, 'all_time');

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <IntelligencePageClient initialMetrics={initialMetrics} />
    </div>
  );
}
