import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getPayments, getInvoices, getFinancialMetrics } from '@/lib/finance/queries';
import { getFinanceSettings } from '@/lib/settings/queries';
import { PaymentsPageClient } from './PaymentsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Payments & Receipts Ledger — Clasptek Portal',
  description: 'Audit confirmed student fee deposits, bank transaction references, and generate official receipts.',
};

export default async function PaymentsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/payments');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;

  const [payments, allInvoices, metrics, financeSettings] = await Promise.all([
    getPayments(tenantId),
    getInvoices(tenantId),
    getFinancialMetrics(tenantId),
    getFinanceSettings(tenantId),
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
        allInvoices={allInvoices}
        financeSettings={financeSettings}
        metrics={metrics}
      />
    </div>
  );
}

