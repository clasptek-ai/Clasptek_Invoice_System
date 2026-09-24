import { NextRequest, NextResponse } from 'next/server';
import { getManagementDashboardMetrics } from '@/lib/intelligence/queries';
import type { DateFilterScope } from '@/types/intelligence';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const scope = (searchParams.get('scope') as DateFilterScope) || 'all_time';

    const metrics = await getManagementDashboardMetrics(tenantId, scope);
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('API Error in GET /api/intelligence/overview:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
