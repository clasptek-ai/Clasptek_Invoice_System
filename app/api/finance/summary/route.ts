import { NextRequest, NextResponse } from 'next/server';
import { getFinancialMetrics } from '@/lib/finance/queries';
import { requireAuth } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId') || undefined;

    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
      requestedTenantId,
    });

    if (errorResponse) {
      return errorResponse;
    }

    const metrics = await getFinancialMetrics(session.tenantId);
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('API Error in GET /api/finance/summary:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
