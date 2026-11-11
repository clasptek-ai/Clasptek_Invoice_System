/**
 * app/api/facilitator/overview/route.ts — Authoritative Overview for Facilitator & Staff Workspace
 * Phase 9E / C328: Role Separation & Facilitator Workspace Restoration
 *
 * Implements:
 * - Session verification & tenant isolation
 * - Role-based isolation:
 *   - Facilitator: Full 5-core-area training delivery + ESS overview (assigned cohorts, attendance sessions, meetings, reports, payslips)
 *   - Staff: Pure Employee Self-Service (ESS) overview ONLY (payslips, queries, compensation). Zero training/academic access.
 *   - Denied for Student (403)
 */

import { NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeePayslips, getEmployeeQueries, getEmployeeSessions } from '@/lib/ess/queries';
import { getTrainingCohorts, getFacilitatorReports } from '@/lib/training/queries';
import { getMeetings } from '@/lib/meetings/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const allowedRoles = ['Facilitator', 'Staff', 'Super Admin', 'Finance Manager'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: `Forbidden: Role '${session.role}' cannot access overview.` },
        { status: 403 }
      );
    }

    // 1. Fetch ESS data (common to both Staff and Facilitator)
    const [payslips, queries] = await Promise.all([
      getEmployeePayslips().catch(() => []),
      getEmployeeQueries().catch(() => []),
    ]);

    const latestPayslip = payslips[0] || null;
    const pendingAck = payslips.filter((p) => p.status === 'issued');
    const totalPaidEarnings = payslips
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + (p.paidAmount || p.netPay || 0), 0);

    // 2. If Staff: return strictly ESS-scoped data
    if (session.role === 'Staff') {
      return NextResponse.json({
        role: 'Staff',
        userName: (session.user.user_metadata?.full_name as string) || session.user.email,
        todaySessionsCount: 0,
        upcomingSessionsCount: 0,
        pendingAttendanceCount: 0,
        cohortsCount: 0,
        meetingsCount: 0,
        reportsCount: 0,
        assignedCohorts: [],
        meetings: [],
        sessions: [],
        reports: [],
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
    }

    // 3. If Facilitator: fetch training delivery modules
    const [sessions, cohortsRes, meetingsRes, reportsRes] = await Promise.all([
      getEmployeeSessions().catch(() => []),
      getTrainingCohorts().catch(() => ({ data: [], error: null })),
      getMeetings({ subTab: 'all' }).catch(() => ({ data: [], error: null })),
      getFacilitatorReports().catch(() => ({ data: [], error: null })),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySessions = sessions.filter((s) => s.sessionDate === todayStr);
    const upcomingSessions = sessions.filter((s) => s.sessionDate > todayStr && s.status === 'SCHEDULED');
    const pendingAttendance = sessions.filter(
      (s) => s.status === 'ATTENDANCE_PENDING' || (s.sessionDate <= todayStr && s.status !== 'COMPLETED')
    );

    const assignedCohorts = cohortsRes.data || [];
    const meetings = meetingsRes.data || [];
    const reports = reportsRes.data || [];

    return NextResponse.json({
      role: session.role,
      userName: (session.user.user_metadata?.full_name as string) || session.user.email,
      todaySessionsCount: todaySessions.length,
      upcomingSessionsCount: upcomingSessions.length,
      pendingAttendanceCount: pendingAttendance.length,
      cohortsCount: assignedCohorts.length,
      meetingsCount: meetings.length,
      reportsCount: reports.length,
      assignedCohorts: assignedCohorts.slice(0, 6),
      meetings: meetings.slice(0, 5),
      sessions: sessions.slice(0, 5),
      reports: reports.slice(0, 5),
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
