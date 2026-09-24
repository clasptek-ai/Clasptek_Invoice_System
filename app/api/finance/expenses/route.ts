/**
 * app/api/finance/expenses/route.ts
 * Authoritative Server Endpoint for Operational & Programme Expenses
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getExpenses, createExpense } from '@/lib/finance/expense-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const group = searchParams.get('group') || undefined;
    const status = searchParams.get('status') || undefined;
    const period = searchParams.get('period') || undefined;

    const expenses = await getExpenses(auth.session.tenantId, {
      search,
      group,
      status,
      period,
    });

    return NextResponse.json({ success: true, expenses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching expenses';
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
    const result = await createExpense(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Staff',
        role: auth.session.role,
      },
      {
        categoryGroup: body.categoryGroup,
        subCategory: body.subCategory,
        amount: Number(body.amount),
        expenseDate: body.expenseDate,
        description: body.description,
        beneficiary: body.beneficiary,
        paymentMethod: body.paymentMethod,
        reference: body.reference,
        programmeId: body.programmeId,
      }
    );

    if (!result.success) {
      if (result.locked) {
        return NextResponse.json({ success: false, error: result.error }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, expense: result.expense });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error logging expense';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
