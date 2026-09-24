/**
 * app/api/admin/settings/route.ts
 * Authoritative Server Endpoint for Company Finance Settings
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getFinanceSettings, updateFinanceSettings } from '@/lib/settings/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const settings = await getFinanceSettings(auth.session.tenantId);
  return NextResponse.json({ success: true, data: settings });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await updateFinanceSettings(
      auth.session.tenantId,
      { id: auth.session.user.id, role: auth.session.role },
      body
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Settings saved' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
