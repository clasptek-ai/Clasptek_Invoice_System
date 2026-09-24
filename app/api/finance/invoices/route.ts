import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, createInvoice } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    const invoices = await getInvoices(tenantId);
    return NextResponse.json({ success: true, invoices });
  } catch (error) {
    console.error('API Error in GET /api/finance/invoices:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();

    if (!body.studentName || !body.programmeId || body.basePrice === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required invoice parameters (studentName, programmeId, basePrice)' },
        { status: 400 }
      );
    }

    const result = await createInvoice(body, {
      id: user?.id,
      role: 'Staff',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, invoice: result.invoice }, { status: 201 });
  } catch (error) {
    console.error('API Error in POST /api/finance/invoices:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
