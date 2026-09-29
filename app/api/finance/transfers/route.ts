/**
 * app/api/finance/transfers/route.ts
 * Authoritative Server Endpoint for Internal Account Transfers
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getInternalTransfers, createInternalTransfer } from '@/lib/finance/funds-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const transfers = await getInternalTransfers(auth.session.tenantId);
    return NextResponse.json({ success: true, transfers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching transfers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await createInternalTransfer(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Finance Staff',
        role: auth.session.role,
      },
      {
        fromAccountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        amount: Number(body.amount),
        date: body.date || new Date().toISOString().slice(0, 10),
        reference: body.reference,
        reason: body.reason,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, transfer: result.transfer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error recording transfer';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
