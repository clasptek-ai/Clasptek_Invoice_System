/**
 * app/production-control/page.tsx
 * Server Component: Production Control Centre & Disaster Recovery
 * Phase 9B: Administration & Governance Module Migration
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  evaluateProductionGate,
  getRecoveryQueue,
} from '@/lib/production/queries';
import { ProductionControlPageClient } from './ProductionControlPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Production Control — Clasptek Portal',
  description: 'Continuous PostgreSQL authority verification, data reconciliation, financial ledger controls, and 15-point production gate.',
};

export default async function ProductionControlPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/production-control');
  }

  // Strictly Super Admin
  if (session.role !== 'Super Admin') {
    redirect('/dashboard');
  }

  const [gateResult, recoveryQueue] = await Promise.all([
    evaluateProductionGate(session.tenantId),
    getRecoveryQueue(session.tenantId),
  ]);

  return (
    <ProductionControlPageClient
      initialGate={gateResult}
      initialRecoveryQueue={recoveryQueue}
    />
  );
}
