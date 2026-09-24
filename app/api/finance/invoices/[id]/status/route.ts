import { NextRequest, NextResponse } from 'next/server';
import { updateInvoiceStatus } from '@/lib/finance/queries';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!body.status) {
      return NextResponse.json({ success: false, error: 'Status is required' }, { status: 400 });
    }

    const allowed = ['unpaid', 'partial', 'paid', 'voided', 'cancelled'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${allowed.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const result = await updateInvoiceStatus(id, body.status, body.reason, {
      id: user?.id,
      role: 'Staff',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error in PATCH /api/finance/invoices/[id]/status:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
