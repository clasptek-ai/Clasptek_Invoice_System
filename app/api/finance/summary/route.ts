import { NextRequest, NextResponse } from 'next/server';
import { getFinancialMetrics } from '@/lib/finance/queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    const metrics = await getFinancialMetrics(tenantId);
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('API Error in GET /api/finance/summary:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
