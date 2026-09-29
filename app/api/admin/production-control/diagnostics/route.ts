/**
 * app/api/admin/production-control/diagnostics/route.ts
 * Authoritative Server Endpoint for Production Control & Gate Diagnostics
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  evaluateProductionGate,
  evaluateContinuousReconciliation,
  evaluateFinancialLedger,
} from '@/lib/production/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'gate';

  if (type === 'reconciliation') {
    const recon = evaluateContinuousReconciliation();
    return NextResponse.json({ success: true, data: recon });
  }

  if (type === 'ledger') {
    const ledger = evaluateFinancialLedger();
    return NextResponse.json({ success: true, data: ledger });
  }

  const gate = await evaluateProductionGate(auth.session.tenantId);
  return NextResponse.json({ success: true, data: gate });
}
