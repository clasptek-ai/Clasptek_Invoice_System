/**
 * app/audit-log/page.tsx
 * Server Component: Immutable Financial Audit Log
 * Phase 9B: Administration & Governance Module Migration
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getAuditLogs } from '@/lib/audit/queries';
import { AuditLogPageClient } from './AuditLogPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Audit Log — Clasptek Portal',
  description: 'Chronological history of all financial mutations, invoices, payments, enquiries, payslips, and banking settings.',
};

export default async function AuditLogPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/audit-log');
  }

  // Strictly Super Admin
  if (session.role !== 'Super Admin') {
    redirect('/dashboard');
  }

  const logs = await getAuditLogs(session.tenantId, 100);

  return <AuditLogPageClient initialLogs={logs} />;
}
