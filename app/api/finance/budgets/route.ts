/**
 * app/api/finance/budgets/route.ts
 * Authoritative Server Endpoint for Budgets & Variance Analysis
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getBudgetVsActual, setBudgetAllocation } from '@/lib/finance/budget-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || undefined;
    const summary = await getBudgetVsActual(auth.session.tenantId, period);
    return NextResponse.json({ success: true, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching budgets';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await setBudgetAllocation(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Finance Manager',
        role: auth.session.role,
      },
      {
        category: body.category,
        subCategory: body.subCategory,
        periodKey: body.periodKey || new Date().toISOString().slice(0, 7),
        budgetAmount: Number(body.budgetAmount),
        department: body.department,
        notes: body.notes,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Budget allocation saved' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error allocating budget';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
