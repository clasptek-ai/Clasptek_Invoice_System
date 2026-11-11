import { NextRequest, NextResponse } from 'next/server';
import { getManagementDashboardMetrics } from '@/lib/intelligence/queries';
import { requireAuth } from '@/lib/auth/server';
import type { DateFilterScope } from '@/types/intelligence';

/**
 * GET /api/intelligence/overview
 * Executive Management & Financial Intelligence Metrics
 *
 * ─── PERMISSION MATRIX & ACCESS POLICY REVIEW (C320) ────────────────────────
 *
 * Platform Role Matrix:
 * - Super Admin: Full enterprise & tenant executive oversight (revenue, margins, cash flow).
 * - Finance Manager: Full tenant financial analytics, budget drilldowns, receivables.
 * - Finance Staff: Operational financial summaries, payments, invoices.
 * - Finance Viewer: Read-only tenant financial intelligence reports.
 * - Staff: Admissions, student enrolments, course operations (UI uses /enrolments, /students).
 * - Facilitator: Attendance marking, session delivery, reports (UI uses /my-sessions, /attendance).
 *
 * Current Behavior:
 * The frontend UI (app/intelligence/page.tsx) gates page navigation to ['Super Admin', 'Finance Manager'].
 * However, this API route handler currently accepts:
 * ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer', 'Staff', 'Facilitator']
 *
 * Governance Policy Notice:
 * In accordance with C320 Remediation Scope and Security Rules, permissions must NOT be
 * silently altered or revoked without explicit governance approval, to avoid disrupting
 * active dashboard integrations.
 * Proposed policy for the next scheduled governance window:
 * Narrow allowedRoles to ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
 * directing Staff and Facilitators to their respective domain APIs (/api/admissions/*, /api/training/*).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId') || undefined;
    const scope = (searchParams.get('scope') as DateFilterScope) || 'all_time';

    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer', 'Staff', 'Facilitator'],
      requestedTenantId,
    });

    if (errorResponse) {
      return errorResponse;
    }

    const metrics = await getManagementDashboardMetrics(session.tenantId, scope);
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('API Error in GET /api/intelligence/overview:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
