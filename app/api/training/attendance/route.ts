/**
 * app/api/training/attendance/route.ts — Phase 5
 * Route handler for Attendance operations:
 * - POST: Save attendance record (single or bulk)
 * - PATCH: Correct attendance with mandatory audited reason
 * - PUT: Submit session attendance & mark session COMPLETED
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  saveAttendance,
  correctAttendance,
  submitSessionAttendance,
} from '@/lib/training/queries';
import type { AttendanceStatus } from '@/types/training';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to record attendance.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Check if bulk attendance (e.g. Mark All Present)
    if (Array.isArray(body.records)) {
      const results = [];
      for (const rec of body.records) {
        const res = await saveAttendance({
          sessionId: rec.sessionId,
          enrolmentId: rec.enrolmentId,
          attendanceStatus: rec.attendanceStatus as AttendanceStatus,
          facilitatorNote: rec.facilitatorNote,
          checkInAt: rec.checkInAt,
          checkOutAt: rec.checkOutAt,
        });
        results.push(res);
      }
      return NextResponse.json({ success: true, count: results.length });
    }

    // Single attendance record
    const { sessionId, enrolmentId, attendanceStatus, facilitatorNote, checkInAt, checkOutAt } = body;
    if (!sessionId || !enrolmentId || !attendanceStatus) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, enrolmentId, attendanceStatus' },
        { status: 400 }
      );
    }

    const { data, error } = await saveAttendance({
      sessionId,
      enrolmentId,
      attendanceStatus: attendanceStatus as AttendanceStatus,
      facilitatorNote,
      checkInAt,
      checkOutAt,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
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
        { error: 'Forbidden: Only administrators may correct historical attendance records.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { attendanceId, newStatus, correctionReason } = body;

    if (!attendanceId || !newStatus || !correctionReason?.trim()) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: attendanceId, newStatus, and non-empty correctionReason',
        },
        { status: 400 }
      );
    }

    const { data, error } = await correctAttendance(
      attendanceId,
      newStatus as AttendanceStatus,
      correctionReason
    );

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Facilitator'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to finalize session attendance.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const { error } = await submitSessionAttendance(sessionId);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
