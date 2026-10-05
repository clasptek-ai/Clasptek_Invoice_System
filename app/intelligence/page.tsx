import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getManagementDashboardMetrics } from '@/lib/intelligence/queries';
import { IntelligencePageClient } from './IntelligencePageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Management Intelligence — Clasptek Portal',
  description: 'Consolidated executive decision-grade intelligence across admissions, academics, training, meetings, finance, and payroll.',
};

export default async function IntelligencePage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/intelligence');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;
  const initialMetrics = await getManagementDashboardMetrics(tenantId, 'all_time');

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <IntelligencePageClient initialMetrics={initialMetrics} />
    </div>
  );
}
