/**
 * app/api/ess/payslips/[id]/ack/route.ts — Employee Payslip Acknowledgement API
 * Phase 9E: User Workspaces Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { acknowledgeEmployeePayslip } from '@/lib/ess/queries';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { id: payslipId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const remarks = typeof body.remarks === 'string' ? body.remarks : undefined;

    const payslip = await acknowledgeEmployeePayslip(payslipId, remarks);
    return NextResponse.json({ success: true, payslip });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    let status = 500;
    if (msg === 'UNAUTHORIZED') status = 401;
    else if (msg === 'PAYSLIP_NOT_FOUND') status = 404;
    else if (msg === 'FORBIDDEN_CROSS_EMPLOYEE_ACCESS') status = 403;
    else if (msg.startsWith('CANNOT_ACKNOWLEDGE_STATUS_')) status = 422;

    return NextResponse.json({ error: msg }, { status });
  }
}
