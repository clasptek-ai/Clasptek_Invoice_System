import { NextRequest, NextResponse } from 'next/server';
import { getPayments, recordPayment } from '@/lib/finance/queries';
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

    const payments = await getPayments(session.tenantId);
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error('API Error in GET /api/finance/payments:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff'],
    });

    if (errorResponse) {
      return errorResponse;
    }

    const body = await request.json();

    if (!body.invoiceId || !body.amount || !body.paymentMethod) {
      return NextResponse.json(
        { success: false, error: 'Missing required payment parameters (invoiceId, amount, paymentMethod)' },
        { status: 400 }
      );
    }

    const result = await recordPayment(body, {
      id: session.user.id,
      role: session.role,
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
