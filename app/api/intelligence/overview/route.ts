import { NextRequest, NextResponse } from 'next/server';
import { getManagementDashboardMetrics } from '@/lib/intelligence/queries';
import { requireAuth } from '@/lib/auth/server';
import type { DateFilterScope } from '@/types/intelligence';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId') || undefined;
    const scope = (searchParams.get('scope') as DateFilterScope) || 'all_time';

    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer', 'Staff', 'Facilitator'],
      requestedTenantId,
    });

    if (errorResponse) {
      return errorResponse;
    }

    const metrics = await getManagementDashboardMetrics(session.tenantId, scope);
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('API Error in GET /api/intelligence/overview:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
