/**
 * app/my-queries/page.tsx — Server Component for My Payroll Queries
 * Phase 9E: User Workspaces Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeeQueries, getEmployeePayslips } from '@/lib/ess/queries';
import { MyQueriesClient } from './MyQueriesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Payroll Queries — Clasptek Portal',
  description: 'Track discrepancy claims and feedback on compensation statements.',
};

export default async function MyQueriesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/my-queries');
  }

  const [queries, payslips] = await Promise.all([
    getEmployeeQueries(),
    getEmployeePayslips(),
  ]);

  return (
    <MyQueriesClient
      initialQueries={queries}
      payslips={payslips}
      currentRole={session.role}
      userEmail={session.user.email || ''}
    />
  );
}
