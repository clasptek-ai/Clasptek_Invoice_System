/**
 * app/api/finance/receivables/route.ts
 * Authoritative Server Endpoint for Receivables & 5-Bucket Ageing
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getReceivablesAgeing } from '@/lib/finance/receivables-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const data = await getReceivablesAgeing(auth.session.tenantId);
    return NextResponse.json({
      success: true,
      buckets: data.buckets,
      invoices: data.outstandingInvoices,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching receivables';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
