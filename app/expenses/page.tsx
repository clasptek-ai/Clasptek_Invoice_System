/**
 * app/expenses/page.tsx
 * Server Component: Operational & Programme Expenses
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getExpenses, getAuthoritativeExpenseGroups } from '@/lib/finance/expense-queries';
import { getFinancialPeriodStatus } from '@/lib/controls/queries';
import { ExpensesPageClient } from './ExpensesPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Operational & Programme Expenses — Clasptek Portal',
  description: 'Track operational, facilitator, marketing and programme expenses with period locks.',
};

export default async function ExpensesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/expenses');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const [expenses, periodStatus] = await Promise.all([
    getExpenses(session.tenantId),
    getFinancialPeriodStatus(session.tenantId),
  ]);

  const groups = getAuthoritativeExpenseGroups();

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <ExpensesPageClient
        initialExpenses={expenses}
        expenseGroups={groups}
        currentUserRole={session.role}
        isPeriodLocked={periodStatus.status === 'locked' || periodStatus.status === 'closed'}
        currentPeriod={periodStatus.period}
      />
    </div>
  );
}
