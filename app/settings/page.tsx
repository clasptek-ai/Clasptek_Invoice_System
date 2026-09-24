/**
 * app/settings/page.tsx
 * Server Component: Finance Settings & Configuration
 * Phase 9B: Administration & Governance Module Migration
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getFinanceSettings, getPaymentAccounts } from '@/lib/settings/queries';
import { getPersonnelList } from '@/lib/finance/queries';
import { SettingsPageClient } from './SettingsPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings — Clasptek Portal',
  description: 'Configurable company information, payment accounts, invoice defaults, and storage settings.',
};

export default async function SettingsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/settings');
  }

  // Strictly Super Admin
  if (session.role !== 'Super Admin') {
    redirect('/dashboard');
  }

  const [settings, accounts, personnel] = await Promise.all([
    getFinanceSettings(session.tenantId),
    getPaymentAccounts(session.tenantId),
    getPersonnelList(session.tenantId),
  ]);

  return (
    <SettingsPageClient
      initialSettings={settings}
      initialAccounts={accounts}
      personnelList={personnel}
      currentUserRole={session.role}
    />
  );
}
