import React from 'react';
import { getPayslips, getPersonnelList, getFinancialMetrics, getFinanceTenantId } from '@/lib/finance/queries';
import { PayrollPageClient } from './PayrollPageClient';

export const metadata = {
  title: 'Staff & Facilitator Payroll — Clasptek Portal',
  description: 'Multi-stage compensation, payslip statements, reviews, approvals, and disbursement auditing.',
};

export default async function PayrollPage() {
  const tenantId = await getFinanceTenantId();

  const [payslips, personnel, metrics] = await Promise.all([
    getPayslips(tenantId),
    getPersonnelList(tenantId),
    getFinancialMetrics(tenantId),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <PayrollPageClient
        initialPayslips={payslips}
        personnel={personnel}
        metrics={metrics}
      />
    </div>
  );
}
