import { NextRequest, NextResponse } from 'next/server';
import { getPayments, recordPayment } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    const payments = await getPayments(tenantId);
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error('API Error in GET /api/finance/payments:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();

    if (!body.invoiceId || !body.amount || !body.paymentMethod) {
      return NextResponse.json(
        { success: false, error: 'Missing required payment parameters (invoiceId, amount, paymentMethod)' },
        { status: 400 }
      );
    }

    const result = await recordPayment(body, {
      id: user?.id,
      role: 'Staff',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, payment: result.payment }, { status: 201 });
  } catch (error) {
    console.error('API Error in POST /api/finance/payments:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
