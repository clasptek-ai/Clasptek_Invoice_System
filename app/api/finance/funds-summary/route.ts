/**
 * app/api/finance/funds-summary/route.ts
 * Authoritative Server Endpoint for Multi-Account Funds Overview & Distribution
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getPaymentAccounts,
  getCreditedAccountDistribution,
  getInternalTransfers,
  getFundsOverviewMetrics,
} from '@/lib/finance/funds-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const tenantId = auth.session.tenantId;
    const [accounts, distribution, transfers, metrics] = await Promise.all([
      getPaymentAccounts(tenantId),
      getCreditedAccountDistribution(tenantId),
      getInternalTransfers(tenantId),
      getFundsOverviewMetrics(tenantId),
    ]);

    return NextResponse.json({
      success: true,
      accounts,
      distribution,
      transfers,
      metrics,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching funds summary';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
