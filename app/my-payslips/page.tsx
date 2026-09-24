/**
 * app/my-payslips/page.tsx — Server Component for My Confidential Payslips
 * Phase 9E: User Workspaces Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeePayslips } from '@/lib/ess/queries';
import { MyPayslipsClient } from './MyPayslipsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Payslips — Clasptek Portal',
  description: 'Review monthly compensation statements, earnings, deductions, and confirm acknowledgements.',
};

export default async function MyPayslipsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/my-payslips');
  }

  const payslips = await getEmployeePayslips();

  return (
    <MyPayslipsClient
      initialPayslips={payslips}
      currentRole={session.role}
      userEmail={session.user.email || ''}
    />
  );
}
