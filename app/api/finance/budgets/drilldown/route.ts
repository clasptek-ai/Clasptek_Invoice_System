/**
 * app/api/finance/budgets/drilldown/route.ts
 * Authoritative Server Endpoint for Budget Category Drilldown Transactions
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getBudgetTransactions } from '@/lib/finance/budget-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '';
    const period = searchParams.get('period') || undefined;

    const transactions = await getBudgetTransactions(auth.session.tenantId, category, period);
    return NextResponse.json({ success: true, transactions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching budget drilldown';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
