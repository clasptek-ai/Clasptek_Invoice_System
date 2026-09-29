/**
 * app/api/facilitator/overview/route.ts — Authoritative Overview for Facilitator & Staff Workspace
 * Phase 9E: User Workspaces Migration
 */

import { NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeePayslips, getEmployeeQueries, getEmployeeSessions } from '@/lib/ess/queries';

export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const [payslips, queries, sessions] = await Promise.all([
      getEmployeePayslips(),
      getEmployeeQueries(),
      getEmployeeSessions(),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySessions = sessions.filter((s) => s.sessionDate === todayStr);
    const upcomingSessions = sessions.filter((s) => s.sessionDate > todayStr && s.status === 'SCHEDULED');
    const pendingAttendance = sessions.filter(
      (s) => s.status === 'ATTENDANCE_PENDING' || (s.sessionDate <= todayStr && s.status !== 'COMPLETED')
    );

    const latestPayslip = payslips[0] || null;
    const pendingAck = payslips.filter((p) => p.status === 'issued');
    const totalPaidEarnings = payslips
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + (p.paidAmount || p.netPay || 0), 0);

    return NextResponse.json({
      role: session.role,
      userName: (session.user.user_metadata?.full_name as string) || session.user.email,
      todaySessionsCount: todaySessions.length,
      upcomingSessionsCount: upcomingSessions.length,
      pendingAttendanceCount: pendingAttendance.length,
      pendingAckCount: pendingAck.length,
      pendingAckFirst: pendingAck[0] || null,
      latestNetPay: latestPayslip ? latestPayslip.netPay : 0,
      latestPeriod: latestPayslip ? latestPayslip.payPeriod : 'Current Baseline',
      latestStatus: latestPayslip ? latestPayslip.status : 'NO STATEMENTS',
      latestPayslipNo: latestPayslip ? latestPayslip.payslipNo : null,
      totalPaidEarnings,
      recentPayslips: payslips.slice(0, 4),
      recentQueries: queries.slice(0, 3),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
