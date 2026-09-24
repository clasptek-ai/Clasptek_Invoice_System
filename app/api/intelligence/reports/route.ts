import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedReports } from '@/lib/intelligence/queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const category = (searchParams.get('category') as 'ALL' | 'FINANCE' | 'ACADEMIC' | 'TRAINING' | 'ADMISSIONS' | 'PAYROLL') || 'ALL';

    const reports = await getUnifiedReports(category, tenantId);
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error('API Error in GET /api/intelligence/reports:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
