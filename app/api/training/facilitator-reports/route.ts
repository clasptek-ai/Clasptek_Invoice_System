/**
 * app/api/training/facilitator-reports/route.ts — Phase 5
 * Route handler for Facilitator Reports:
 * - GET: List reports with filters
 * - POST: Submit or update facilitator report (enforces Zero-Examination invariant)
 * - PATCH: Admin review and sign-off
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  getFacilitatorReports,
  saveFacilitatorReport,
  reviewFacilitatorReport,
} from '@/lib/training/queries';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'Staff' || session.role === 'Student') {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to view facilitator reports.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const cohortId = searchParams.get('cohortId') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const { data, error } = await getFacilitatorReports({ cohortId, status, search });
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to submit facilitator reports.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      id,
      cohortId,
      sessionId,
      facilitatorId,
      reportDate,
      sessionSummary,
      topicsCovered,
      attendanceObservations,
      studentParticipationNotes,
      issuesEncountered,
      followUpRecommendations,
      status,
    } = body;

    if (!cohortId || !facilitatorId || !sessionSummary?.trim() || !topicsCovered?.trim()) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: cohortId, facilitatorId, sessionSummary, and topicsCovered',
        },
        { status: 400 }
      );
    }

    const { data, error } = await saveFacilitatorReport({
      id,
      cohortId,
      sessionId,
      facilitatorId,
      reportDate: reportDate || new Date().toISOString().split('T')[0],
      sessionSummary,
      topicsCovered,
      attendanceObservations,
      studentParticipationNotes,
      issuesEncountered,
      followUpRecommendations,
      status: status || 'SUBMITTED',
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: id ? 200 : 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators may review and sign off facilitator reports.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { reportId, reviewNotes } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });
    }

    const { error } = await reviewFacilitatorReport(reportId, reviewNotes);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
