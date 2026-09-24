/**
 * app/api/ess/queries/route.ts — Employee Payroll Queries API
 * Phase 9E: User Workspaces Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeeQueries, raiseEmployeePayrollQuery } from '@/lib/ess/queries';

export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const queries = await getEmployeeQueries();
    return NextResponse.json({ queries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await request.json();
    const { payslipId, queryReason, queryComment } = body;

    if (!payslipId || !queryReason || !queryComment) {
      return NextResponse.json(
        { error: 'payslipId, queryReason, and queryComment are required' },
        { status: 400 }
      );
    }

    const query = await raiseEmployeePayrollQuery(payslipId, {
      queryReason,
      queryComment,
    });

    return NextResponse.json({ success: true, query }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    let status = 500;
    if (msg === 'UNAUTHORIZED') status = 401;
    else if (msg === 'PAYSLIP_NOT_FOUND') status = 404;
    else if (msg === 'FORBIDDEN_CROSS_EMPLOYEE_ACCESS') status = 403;
    else if (msg === 'MISSING_QUERY_FIELDS') status = 400;

    return NextResponse.json({ error: msg }, { status });
  }
}
