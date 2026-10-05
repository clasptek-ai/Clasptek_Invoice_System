import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getPayslips, getPersonnelList, getFinancialMetrics } from '@/lib/finance/queries';
import { getFinanceSettings } from '@/lib/settings/queries';
import { PayrollPageClient } from './PayrollPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Staff & Facilitator Payroll — Clasptek Portal',
  description: 'Multi-stage compensation, payslip statements, reviews, approvals, and disbursement auditing.',
};

export default async function PayrollPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/payroll');
  }

  const allowed = ['Super Admin', 'Finance Manager'].includes(session.role);
  if (!allowed) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;

  const [payslips, personnel, metrics, financeSettings] = await Promise.all([
    getPayslips(tenantId),
    getPersonnelList(tenantId),
    getFinancialMetrics(tenantId),
    getFinanceSettings(tenantId),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <PayrollPageClient
        initialPayslips={payslips}
        personnel={personnel}
        metrics={metrics}
        financeSettings={financeSettings}
      />
    </div>
  );
}
