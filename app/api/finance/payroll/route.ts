import { NextRequest, NextResponse } from 'next/server';
import { getPayslips, createPayslip, getPersonnelList } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const includePersonnel = searchParams.get('includePersonnel') === 'true';

    const [payslips, personnel] = await Promise.all([
      getPayslips(tenantId),
      includePersonnel ? getPersonnelList(tenantId) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      payslips,
      personnel: includePersonnel ? personnel : undefined,
    });
  } catch (error) {
    console.error('API Error in GET /api/finance/payroll:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();

    if (!body.personnelId || !body.payPeriod) {
      return NextResponse.json(
        { success: false, error: 'Missing required payroll parameters (personnelId, payPeriod)' },
        { status: 400 }
      );
    }

    const result = await createPayslip(body, {
      id: user?.id,
      role: 'Finance Manager',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, payslip: result.payslip }, { status: 201 });
  } catch (error) {
    console.error('API Error in POST /api/finance/payroll:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
