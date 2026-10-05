import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getInvoices, getCustomersList, getFinancialMetrics } from '@/lib/finance/queries';
import { getFinanceSettings, getPaymentAccounts } from '@/lib/settings/queries';
import { createServerClient } from '@/lib/supabase/server';
import { InvoicesPageClient } from './InvoicesPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Invoices & Tuition Billing — Clasptek Portal',
  description: 'Manage, view, and track student tuition invoices, installments, and payment statuses.',
};

export default async function InvoicesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/invoices');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const tenantId = session.tenantId;
  const supabase = await createServerClient();

  const [invoices, customers, metrics, programmesRes, financeSettings, paymentAccounts] = await Promise.all([
    getInvoices(tenantId),
    getCustomersList(tenantId),
    getFinancialMetrics(tenantId),
    supabase
      .from('programmes')
      .select('id, code, name, tuition_fee')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    getFinanceSettings(tenantId),
    getPaymentAccounts(tenantId),
  ]);

  const programmes = (programmesRes.data || []).map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    tuitionFee: Number(p.tuition_fee || 0),
  }));

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <InvoicesPageClient
        initialInvoices={invoices}
        programmes={programmes}
        customers={customers}
        metrics={metrics}
        financeSettings={financeSettings}
        paymentAccounts={paymentAccounts}
      />
    </div>
  );
}
