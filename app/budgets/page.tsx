/**
 * app/budgets/page.tsx
 * Server Component: Budgets & Planning Management
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getBudgetVsActual } from '@/lib/finance/budget-queries';
import { getAuthoritativeExpenseGroups } from '@/lib/finance/expense-queries';
import { BudgetsPageClient } from './BudgetsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Budgets & Planning — Clasptek Portal',
  description: 'Departmental expenditure envelopes, live variance tracking, category utilization bars, and transaction drill-down.',
};

export default async function BudgetsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/budgets');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const summary = await getBudgetVsActual(session.tenantId);
  const expenseGroups = getAuthoritativeExpenseGroups();

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <BudgetsPageClient
        initialSummary={summary}
        expenseGroups={expenseGroups}
        currentUserRole={session.role}
      />
    </div>
  );
}
