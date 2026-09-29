import { NextRequest, NextResponse } from 'next/server';
import { updatePayslipStatus } from '@/lib/finance/queries';
import { requireAuth } from '@/lib/auth/server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager'],
    });

    if (errorResponse) {
      return errorResponse;
    }

    const { id } = await context.params;
    const body = await request.json();

    if (!body.action) {
      return NextResponse.json({ success: false, error: 'Action parameter is required' }, { status: 400 });
    }

    const allowedActions = ['acknowledge', 'approve', 'pay', 'cancel'];
    if (!allowedActions.includes(body.action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${allowedActions.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await updatePayslipStatus(
      id,
      body.action,
      {
        remarks: body.remarks,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        cancelReason: body.cancelReason,
      },
      {
        id: session.user.id,
        role: session.role,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error in POST /api/finance/payroll/[id]/action:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
