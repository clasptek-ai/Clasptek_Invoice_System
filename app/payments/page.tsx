import React from 'react';
import { getPayments, getInvoices, getFinancialMetrics, getFinanceTenantId } from '@/lib/finance/queries';
import { PaymentsPageClient } from './PaymentsPageClient';

export const metadata = {
  title: 'Payments & Receipts Ledger — Clasptek Portal',
  description: 'Audit confirmed student fee deposits, bank transaction references, and generate official receipts.',
};

export default async function PaymentsPage() {
  const tenantId = await getFinanceTenantId();

  const [payments, allInvoices, metrics] = await Promise.all([
    getPayments(tenantId),
    getInvoices(tenantId),
    getFinancialMetrics(tenantId),
  ]);

  const targetInvoices = allInvoices
    .filter(inv => inv.status !== 'cancelled' && inv.status !== 'voided')
    .map(inv => ({
      id: inv.id,
      invoiceDisplayNo: inv.invoiceDisplayNo,
      studentName: inv.studentName,
      totalAmount: inv.totalAmount,
      balanceAmount: inv.balanceAmount || Math.max(0, inv.totalAmount - (inv.paidAmount || 0)),
      status: inv.status,
    }));

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <PaymentsPageClient
        initialPayments={payments}
        targetInvoices={targetInvoices}
        metrics={metrics}
      />
    </div>
  );
}
