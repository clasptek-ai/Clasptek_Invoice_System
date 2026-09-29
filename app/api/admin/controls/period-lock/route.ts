/**
 * app/api/admin/controls/period-lock/route.ts
 * Authoritative Server Endpoint for Period Locking
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { toggleFinancialPeriodLock } from '@/lib/controls/queries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const period = body.period || new Date().toISOString().slice(0, 7);

    const result = await toggleFinancialPeriodLock(
      auth.session.tenantId,
      { id: auth.session.user.id, role: auth.session.role },
      period,
      body.notes
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      period,
      status: result.newStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
