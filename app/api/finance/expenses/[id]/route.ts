/**
 * app/api/finance/expenses/[id]/route.ts
 * Authoritative Server Endpoint for Expense Actions (Approve, Cancel, Update)
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { approveExpense, cancelExpense } from '@/lib/finance/expense-queries';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const action = body.action;

  if (action === 'approve') {
    const auth = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager'],
    });
    if (auth.errorResponse) return auth.errorResponse;

    const result = await approveExpense(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Manager',
        role: auth.session.role,
      },
      id
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Expense approved' });
  }

  if (action === 'cancel') {
    const auth = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff'],
    });
    if (auth.errorResponse) return auth.errorResponse;

    const result = await cancelExpense(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Staff',
        role: auth.session.role,
      },
      id,
      body.reason || 'Cancelled by staff'
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Expense cancelled' });
  }

  return NextResponse.json({ success: false, error: 'Invalid expense action' }, { status: 400 });
}
