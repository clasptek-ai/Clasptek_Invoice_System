/**
 * lib/training/queries.ts — Phase 5
 * Server-side Data Access Layer for Training Operations: Attendance, Training Sessions, and Facilitator Reports.
 * Enforces multi-tenant RLS through createServerClient() and authoritative audit logging.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getAuthoritativePersonnel } from '@/lib/ess/queries';
import type {
  TrainingSession,
  AttendanceRecord,
  FacilitatorReport,
  AttendanceStatus,
  EnrolmentStudentInfo,
} from '@/types/training';

export async function getTrainingCohorts(): Promise<{
  data: Array<{
    id: string;
    cohortCode: string;
    name: string;
    status: string;
    programmeId?: string;
    programmeName?: string;
    leadFacilitatorId?: string;
    leadFacilitatorName?: string;
  }>;
  error: string | null;
}> {
  try {
    const session = await getAuthoritativeSession().catch(() => null);
    const supabase = await createServerClient();
    let query = supabase
      .from('cohorts')
      .select('id, name, status, programme_id, lead_facilitator_id, metadata, start_date, cohort_code, created_at')
      .order('start_date', { ascending: false })
      .order('cohort_code', { ascending: false })
      .order('id', { ascending: false });

    if (session) {
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        if (!persId) {
          return { data: [], error: null };
        }
        query = query.eq('lead_facilitator_id', persId);
      } else if (session.role === 'Staff' || session.role === 'Student') {
        return { data: [], error: null };
      }
    }

    const { data: cohorts, error: cErr } = await query;

    if (cErr) {
      console.error('[getTrainingCohorts]', cErr.message);
      return { data: [], error: cErr.message };
    }

    if (!cohorts || cohorts.length === 0) {
      return { data: [], error: null };
    }

    // Fetch programmes and personnel in parallel
    const [progRes, persRes] = await Promise.all([
      supabase.from('programmes').select('id, name'),
      supabase.from('personnel').select('id, name, first_name, last_name'),
    ]);

    const progMap = new Map((progRes.data || []).map((p) => [p.id, p.name]));
    const persMap = new Map(
      (persRes.data || []).map((p) => [
        p.id,
        p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
      ])
    );

    const formatted = cohorts.map((c) => {
      const meta = (c.metadata as Record<string, unknown>) || {};
      const cohortCode = (meta.cohort_code as string) || (meta.cohortCode as string) || c.id;
      return {
        id: c.id,
        cohortCode,
        name: c.name,
        status: c.status,
        programmeId: c.programme_id,
        programmeName: c.programme_id ? progMap.get(c.programme_id) || 'Academic Course' : 'Academic Course',
        leadFacilitatorId: c.lead_facilitator_id,
        leadFacilitatorName: c.lead_facilitator_id ? persMap.get(c.lead_facilitator_id) || 'Unassigned' : 'Unassigned',
      };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch cohorts';
    return { data: [], error: msg };
  }
}

export async function getTrainingSessions(cohortId?: string): Promise<{
  data: TrainingSession[];
  error: string | null;
}> {
  try {
    const session = await getAuthoritativeSession().catch(() => null);
    const supabase = await createServerClient();
    let query = supabase
      .from('training_sessions')
      .select('*')
      .order('session_date', { ascending: true })
      .order('session_number', { ascending: true });

    if (session) {
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        if (!persId) {
          return { data: [], error: null };
        }
        if (cohortId) {
          const { data: assignedCohort } = await supabase
            .from('cohorts')
            .select('id')
            .eq('id', cohortId)
            .eq('lead_facilitator_id', persId)
            .maybeSingle();

          const { data: sessionInCohort } = await supabase
            .from('training_sessions')
            .select('id')
            .eq('cohort_id', cohortId)
            .eq('facilitator_id', persId)
            .limit(1);

          if (!assignedCohort && (!sessionInCohort || sessionInCohort.length === 0)) {
            return { data: [], error: null };
          }
          query = query.eq('cohort_id', cohortId);
        } else {
          const { data: myCohorts } = await supabase
            .from('cohorts')
            .select('id')
            .eq('lead_facilitator_id', persId);
          const cIds = (myCohorts || []).map((c) => c.id);
          if (cIds.length > 0) {
            query = query.or(`facilitator_id.eq.${persId},cohort_id.in.(${cIds.join(',')})`);
          } else {
            query = query.eq('facilitator_id', persId);
          }
        }
      } else if (session.role === 'Staff' || session.role === 'Student') {
        return { data: [], error: null };
      } else if (cohortId) {
        query = query.eq('cohort_id', cohortId);
      }
    } else if (cohortId) {
      query = query.eq('cohort_id', cohortId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getTrainingSessions]', error.message);
      return { data: [], error: error.message };
    }

    // Also fetch personnel names for facilitators
    const facIds = Array.from(new Set((data || []).map((s) => s.facilitator_id).filter(Boolean)));
    let facMap = new Map<string, string>();
    if (facIds.length > 0) {
      const { data: personnel } = await supabase
        .from('personnel')
        .select('id, name, first_name, last_name')
        .in('id', facIds);
      if (personnel) {
        facMap = new Map(
          personnel.map((p) => [
            p.id,
            p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
          ])
        );
      }
    }

    const sessions: TrainingSession[] = (data || []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      cohortId: row.cohort_id,
      facilitatorId: row.facilitator_id,
      sessionNumber: row.session_number,
      sessionTitle: row.session_title,
      sessionDate: row.session_date,
      startTime: row.start_time,
      endTime: row.end_time,
      deliveryMode: row.delivery_mode,
      location: row.location,
      status: row.status,
      notes: row.notes,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      facilitatorName: row.facilitator_id ? facMap.get(row.facilitator_id) || 'Unassigned' : 'Unassigned',
    }));

    return { data: sessions, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch sessions';
    return { data: [], error: msg };
  }
}

export async function getCohortEnrolmentsWithStudents(cohortId: string): Promise<{
  data: EnrolmentStudentInfo[];
  error: string | null;
}> {
  try {
    const session = await getAuthoritativeSession().catch(() => null);
    const supabase = await createServerClient();

    if (session) {
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        if (!persId) {
          return { data: [], error: 'FORBIDDEN: Facilitator profile not found' };
        }
        const { data: assignedCohort } = await supabase
          .from('cohorts')
          .select('id')
          .eq('id', cohortId)
          .eq('lead_facilitator_id', persId)
          .maybeSingle();

        const { data: sessionInCohort } = await supabase
          .from('training_sessions')
          .select('id')
          .eq('cohort_id', cohortId)
          .eq('facilitator_id', persId)
          .limit(1);

        if (!assignedCohort && (!sessionInCohort || sessionInCohort.length === 0)) {
          return { data: [], error: 'FORBIDDEN: You are not assigned to this cohort' };
        }
      } else if (session.role === 'Student') {
        return { data: [], error: 'FORBIDDEN: Students cannot access cohort enrolment registers' };
      }
    }

    const { data: enrolments, error: eErr } = await supabase
      .from('enrolments')
      .select('id, enrolment_number, student_id, status, student_name, student_email')
      .eq('cohort_id', cohortId)
      .not('status', 'in', '("CANCELLED","WITHDRAWN")');

    if (eErr) {
      console.error('[getCohortEnrolmentsWithStudents]', eErr.message);
      return { data: [], error: eErr.message };
    }

    if (!enrolments || enrolments.length === 0) {
      return { data: [], error: null };
    }

    const studentIds = Array.from(new Set(enrolments.map((e) => e.student_id).filter(Boolean)));
    let studentMap = new Map<string, { studentNumber: string; name: string; email?: string }>();

    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, student_number, first_name, last_name, email')
        .in('id', studentIds);
      if (students) {
        studentMap = new Map(
          students.map((s) => [
            s.id,
            {
              studentNumber: s.student_number,
              name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student',
              email: s.email,
            },
          ])
        );
      }
    }

    const results: EnrolmentStudentInfo[] = enrolments.map((e) => {
      const s = e.student_id ? studentMap.get(e.student_id) : null;
      return {
        enrolmentId: e.id,
        enrolmentNumber: e.enrolment_number || e.id,
        studentId: e.student_id || e.id,
        studentNumber: s?.studentNumber || e.student_id || 'STU',
        studentName: s?.name || e.student_name || 'Enrolled Student',
        studentEmail: s?.email || e.student_email || '',
        status: e.status,
      };
    });

    return { data: results, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch cohort enrolments';
    return { data: [], error: msg };
  }
}

export async function getAttendance(
  sessionId?: string,
  cohortId?: string
): Promise<{
  data: AttendanceRecord[];
  error: string | null;
}> {
  try {
    const session = await getAuthoritativeSession().catch(() => null);
    const supabase = await createServerClient();

    if (session) {
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        if (!persId) {
          return { data: [], error: 'FORBIDDEN: Facilitator profile not found' };
        }
        if (cohortId) {
          const { data: assignedCohort } = await supabase
            .from('cohorts')
            .select('id')
            .eq('id', cohortId)
            .eq('lead_facilitator_id', persId)
            .maybeSingle();

          const { data: sessionInCohort } = await supabase
            .from('training_sessions')
            .select('id')
            .eq('cohort_id', cohortId)
            .eq('facilitator_id', persId)
            .limit(1);

          if (!assignedCohort && (!sessionInCohort || sessionInCohort.length === 0)) {
            return { data: [], error: null };
          }
        } else if (sessionId) {
          const { data: sessionRow } = await supabase
            .from('training_sessions')
            .select('cohort_id, facilitator_id')
            .eq('id', sessionId)
            .maybeSingle();

          if (!sessionRow) {
            return { data: [], error: null };
          }
          if (sessionRow.facilitator_id !== persId) {
            const { data: assignedCohort } = await supabase
              .from('cohorts')
              .select('id')
              .eq('id', sessionRow.cohort_id)
              .eq('lead_facilitator_id', persId)
              .maybeSingle();
            if (!assignedCohort) {
              return { data: [], error: null };
            }
          }
        }
      } else if (session.role === 'Staff' || session.role === 'Student') {
        return { data: [], error: null };
      }
    }

    let query = supabase.from('attendance').select('*');

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    } else if (cohortId) {
      query = query.eq('cohort_id', cohortId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getAttendance]', error.message);
      return { data: [], error: error.message };
    }

    const records: AttendanceRecord[] = (data || []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      cohortId: row.cohort_id,
      sessionId: row.session_id,
      enrolmentId: row.enrolment_id,
      attendanceStatus: row.attendance_status as AttendanceStatus,
      checkInAt: row.check_in_at,
      checkOutAt: row.check_out_at,
      facilitatorNote: row.facilitator_note,
      recordedBy: row.recorded_by,
      recordedAt: row.recorded_at,
      updatedAt: row.updated_at,
      metadata: row.metadata || {},
      correctionReason: row.metadata?.correctionReason as string | undefined,
    }));

    return { data: records, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch attendance';
    return { data: [], error: msg };
  }
}

export async function saveAttendance(record: {
  sessionId: string;
  enrolmentId: string;
  attendanceStatus: AttendanceStatus;
  facilitatorNote?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}): Promise<{ data: AttendanceRecord | null; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return { data: null, error: 'Unauthorized: login required' };
    }

    if (session.role === 'Staff' || session.role === 'Student') {
      return { data: null, error: 'FORBIDDEN: Role not authorized to record attendance' };
    }

    const supabase = await createServerClient();
    const user = session.user;

    // 1. Get session details and verify status
    const { data: trainingSession, error: sErr } = await supabase
      .from('training_sessions')
      .select('id, tenant_id, cohort_id, status, session_number, session_title, facilitator_id')
      .eq('id', record.sessionId)
      .single();

    if (sErr || !trainingSession) {
      return { data: null, error: `Referenced session '${record.sessionId}' does not exist` };
    }

    if (trainingSession.status === 'CANCELLED') {
      return { data: null, error: 'Cannot record attendance against a cancelled training session' };
    }

    // If facilitator, verify assignment to this session or cohort lead
    if (session.role === 'Facilitator') {
      const personnelRes = await getAuthoritativePersonnel().catch(() => null);
      const persId = personnelRes?.personnel?.id;
      if (!persId) {
        return { data: null, error: 'FORBIDDEN: Facilitator profile not found' };
      }

      if (trainingSession.facilitator_id !== persId) {
        const { data: cohortRow } = await supabase
          .from('cohorts')
          .select('id, lead_facilitator_id')
          .eq('id', trainingSession.cohort_id)
          .maybeSingle();

        if (cohortRow?.lead_facilitator_id !== persId) {
          return { data: null, error: 'FORBIDDEN: Facilitator is not assigned to this session or cohort' };
        }
      }
    }

    // 2. Get enrolment details and verify cohort match
    const { data: enrolment, error: eErr } = await supabase
      .from('enrolments')
      .select('id, cohort_id, tenant_id')
      .eq('id', record.enrolmentId)
      .single();

    if (eErr || !enrolment) {
      return { data: null, error: `Referenced enrolment '${record.enrolmentId}' does not exist` };
    }

    if (trainingSession.cohort_id !== enrolment.cohort_id) {
      return {
        data: null,
        error: "COHORT_MISMATCH: Student is not enrolled in this session's cohort",
      };
    }

    const now = new Date().toISOString();
    const attendanceId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Check if attendance already exists for this (session_id, enrolment_id)
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('session_id', record.sessionId)
      .eq('enrolment_id', record.enrolmentId)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { data: updated, error: uErr } = await supabase
        .from('attendance')
        .update({
          attendance_status: record.attendanceStatus,
          facilitator_note: record.facilitatorNote ?? null,
          check_in_at: record.checkInAt ?? null,
          check_out_at: record.checkOutAt ?? null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (uErr) {
        return { data: null, error: uErr.message };
      }

      return {
        data: {
          id: updated.id,
          tenantId: updated.tenant_id,
          cohortId: updated.cohort_id,
          sessionId: updated.session_id,
          enrolmentId: updated.enrolment_id,
          attendanceStatus: updated.attendance_status as AttendanceStatus,
          checkInAt: updated.check_in_at,
          checkOutAt: updated.check_out_at,
          facilitatorNote: updated.facilitator_note,
          recordedBy: updated.recorded_by,
          recordedAt: updated.recorded_at,
          updatedAt: updated.updated_at,
          metadata: updated.metadata || {},
        },
        error: null,
      };
    }

    // Insert new record
    const { data: created, error: insErr } = await supabase
      .from('attendance')
      .insert({
        id: attendanceId,
        tenant_id: trainingSession.tenant_id,
        cohort_id: trainingSession.cohort_id,
        session_id: record.sessionId,
        enrolment_id: record.enrolmentId,
        attendance_status: record.attendanceStatus,
        check_in_at: record.checkInAt ?? null,
        check_out_at: record.checkOutAt ?? null,
        facilitator_note: record.facilitatorNote ?? '',
        recorded_by: user.id,
        recorded_at: now,
        updated_at: now,
        metadata: {},
      })
      .select()
      .single();

    if (insErr) {
      console.error('[saveAttendance error]', insErr.message);
      return { data: null, error: insErr.message };
    }

    return {
      data: {
        id: created.id,
        tenantId: created.tenant_id,
        cohortId: created.cohort_id,
        sessionId: created.session_id,
        enrolmentId: created.enrolment_id,
        attendanceStatus: created.attendance_status as AttendanceStatus,
        checkInAt: created.check_in_at,
        checkOutAt: created.check_out_at,
        facilitatorNote: created.facilitator_note,
        recordedBy: created.recorded_by,
        recordedAt: created.recorded_at,
        updatedAt: created.updated_at,
        metadata: created.metadata || {},
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save attendance';
    return { data: null, error: msg };
  }
}

export async function correctAttendance(
  attendanceId: string,
  newStatus: AttendanceStatus,
  correctionReason: string
): Promise<{ data: AttendanceRecord | null; error: string | null }> {
  try {
    if (!attendanceId) return { data: null, error: 'Attendance record ID is required' };
    if (!correctionReason || !correctionReason.trim()) {
      return {
        data: null,
        error: 'CORRECTION_REASON_REQUIRED: Explicit reason is mandatory when correcting attendance records',
      };
    }

    const session = await getAuthoritativeSession();
    if (!session || !session.user) return { data: null, error: 'Unauthorized' };

    const allowedCorrectionRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedCorrectionRoles.includes(session.role)) {
      return { data: null, error: 'FORBIDDEN: Only administrators may correct historical attendance records' };
    }

    const supabase = await createServerClient();
    const user = session.user;

    const { data: existing, error: fetchErr } = await supabase
      .from('attendance')
      .select('*')
      .eq('id', attendanceId)
      .single();

    if (fetchErr || !existing) {
      return { data: null, error: `Attendance record '${attendanceId}' not found` };
    }

    const now = new Date().toISOString();
    const updatedMeta = {
      ...(existing.metadata || {}),
      correctionReason: correctionReason.trim(),
      correctedBy: user.id,
      correctedAt: now,
      previousStatus: existing.attendance_status,
    };

    const { data: updated, error: uErr } = await supabase
      .from('attendance')
      .update({
        attendance_status: newStatus,
        metadata: updatedMeta,
        updated_at: now,
      })
      .eq('id', attendanceId)
      .select()
      .single();

    if (uErr) {
      return { data: null, error: uErr.message };
    }

    return {
      data: {
        id: updated.id,
        tenantId: updated.tenant_id,
        cohortId: updated.cohort_id,
        sessionId: updated.session_id,
        enrolmentId: updated.enrolment_id,
        attendanceStatus: updated.attendance_status as AttendanceStatus,
        checkInAt: updated.check_in_at,
        checkOutAt: updated.check_out_at,
        facilitatorNote: updated.facilitator_note,
        recordedBy: updated.recorded_by,
        recordedAt: updated.recorded_at,
        updatedAt: updated.updated_at,
        metadata: updated.metadata || {},
        correctionReason: correctionReason.trim(),
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to correct attendance';
    return { data: null, error: msg };
  }
}

export async function submitSessionAttendance(
  sessionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) return { success: false, error: 'Unauthorized' };

    const supabase = await createServerClient();

    if (session.role === 'Facilitator') {
      const personnelRes = await getAuthoritativePersonnel().catch(() => null);
      const persId = personnelRes?.personnel?.id;
      const { data: sessionRow } = await supabase
        .from('training_sessions')
        .select('facilitator_id, cohort_id')
        .eq('id', sessionId)
        .maybeSingle();

      if (!sessionRow) {
        return { success: false, error: 'Session not found' };
      }

      if (sessionRow.facilitator_id !== persId) {
        const { data: cohortRow } = await supabase
          .from('cohorts')
          .select('lead_facilitator_id')
          .eq('id', sessionRow.cohort_id)
          .maybeSingle();
        if (cohortRow?.lead_facilitator_id !== persId) {
          return { success: false, error: 'FORBIDDEN: You are not assigned to this session' };
        }
      }
    } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { success: false, error: 'FORBIDDEN: Insufficient permissions to finalize session' };
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('training_sessions')
      .update({
        status: 'COMPLETED',
        updated_at: now,
      })
      .eq('id', sessionId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to finalize session attendance';
    return { success: false, error: msg };
  }
}

export async function saveTrainingSession(data: {
  id?: string;
  cohortId: string;
  sessionNumber: number;
  sessionTitle: string;
  sessionDate: string;
  startTime?: string | null;
  endTime?: string | null;
  deliveryMode?: string;
  location?: string | null;
  facilitatorId?: string | null;
  notes?: string | null;
}): Promise<{ data: TrainingSession | null; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) return { data: null, error: 'Unauthorized' };

    if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { data: null, error: 'FORBIDDEN: Only administrators may schedule or edit training sessions' };
    }

    const supabase = await createServerClient();

    // Get tenant from cohort
    const { data: cohort, error: cErr } = await supabase
      .from('cohorts')
      .select('id, tenant_id')
      .eq('id', data.cohortId)
      .single();

    if (cErr || !cohort) {
      return { data: null, error: `Referenced cohort '${data.cohortId}' not found` };
    }

    const now = new Date().toISOString();

    if (data.id) {
      // Update
      const { data: updated, error: uErr } = await supabase
        .from('training_sessions')
        .update({
          session_number: data.sessionNumber,
          session_title: data.sessionTitle.trim(),
          session_date: data.sessionDate,
          start_time: data.startTime || null,
          end_time: data.endTime || null,
          delivery_mode: data.deliveryMode || 'ONLINE',
          location: data.location || null,
          facilitator_id: data.facilitatorId || null,
          notes: data.notes || null,
          updated_at: now,
        })
        .eq('id', data.id)
        .select()
        .single();

      if (uErr) return { data: null, error: uErr.message };

      return {
        data: {
          id: updated.id,
          tenantId: updated.tenant_id,
          cohortId: updated.cohort_id,
          facilitatorId: updated.facilitator_id,
          sessionNumber: updated.session_number,
          sessionTitle: updated.session_title,
          sessionDate: updated.session_date,
          startTime: updated.start_time,
          endTime: updated.end_time,
          deliveryMode: updated.delivery_mode,
          location: updated.location,
          status: updated.status,
          notes: updated.notes,
          metadata: updated.metadata || {},
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
        error: null,
      };
    }

    // Insert
    const newId = `ts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: created, error: iErr } = await supabase
      .from('training_sessions')
      .insert({
        id: newId,
        tenant_id: cohort.tenant_id,
        cohort_id: data.cohortId,
        session_number: data.sessionNumber,
        session_title: data.sessionTitle.trim(),
        session_date: data.sessionDate,
        start_time: data.startTime || null,
        end_time: data.endTime || null,
        delivery_mode: data.deliveryMode || 'ONLINE',
        location: data.location || null,
        facilitator_id: data.facilitatorId || null,
        status: 'SCHEDULED',
        notes: data.notes || null,
        metadata: {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (iErr) return { data: null, error: iErr.message };

    return {
      data: {
        id: created.id,
        tenantId: created.tenant_id,
        cohortId: created.cohort_id,
        facilitatorId: created.facilitator_id,
        sessionNumber: created.session_number,
        sessionTitle: created.session_title,
        sessionDate: created.session_date,
        startTime: created.start_time,
        endTime: created.end_time,
        deliveryMode: created.delivery_mode,
        location: created.location,
        status: created.status,
        notes: created.notes,
        metadata: created.metadata || {},
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save training session';
    return { data: null, error: msg };
  }
}

// ─── Facilitator Reports Queries ─────────────────────────────────────────────

export async function getFacilitatorReports(filters?: {
  cohortId?: string;
  status?: string;
  search?: string;
}): Promise<{ data: FacilitatorReport[]; error: string | null }> {
  try {
    const session = await getAuthoritativeSession().catch(() => null);
    const supabase = await createServerClient();
    let query = supabase
      .from('facilitator_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (session) {
      if (session.role === 'Facilitator') {
        const personnelRes = await getAuthoritativePersonnel().catch(() => null);
        const persId = personnelRes?.personnel?.id;
        if (!persId) {
          return { data: [], error: null };
        }
        query = query.eq('facilitator_id', persId);
      } else if (session.role === 'Staff' || session.role === 'Student') {
        return { data: [], error: null };
      }
    }

    if (filters?.cohortId && filters.cohortId !== 'ALL') {
      query = query.eq('cohort_id', filters.cohortId);
    }
    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    const { data: reports, error: rErr } = await query;
    if (rErr) {
      console.error('[getFacilitatorReports]', rErr.message);
      return { data: [], error: rErr.message };
    }

    if (!reports || reports.length === 0) {
      return { data: [], error: null };
    }

    // Fetch cohort, programme, and facilitator details for reports
    const [cohortsRes, personnelRes, progRes] = await Promise.all([
      supabase.from('cohorts').select('id, name, programme_id, metadata'),
      supabase.from('personnel').select('id, name, first_name, last_name'),
      supabase.from('programmes').select('id, name'),
    ]);

    const progMap = new Map((progRes.data || []).map((p) => [p.id, p.name]));
    const persMap = new Map(
      (personnelRes.data || []).map((p) => [
        p.id,
        p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
      ])
    );
    const cohortMap = new Map(
      (cohortsRes.data || []).map((c) => {
        const meta = (c.metadata as Record<string, unknown>) || {};
        const code = (meta.cohort_code as string) || (meta.cohortCode as string) || c.id;
        const pName = c.programme_id ? progMap.get(c.programme_id) || '' : '';
        return [c.id, { name: c.name, code, programmeName: pName }];
      })
    );

    let mapped: FacilitatorReport[] = reports.map((r) => {
      const cInfo = cohortMap.get(r.cohort_id);
      return {
        id: r.id,
        tenantId: r.tenant_id,
        cohortId: r.cohort_id,
        sessionId: r.session_id,
        facilitatorId: r.facilitator_id,
        reportDate: r.report_date,
        sessionSummary: r.session_summary,
        topicsCovered: r.topics_covered,
        attendanceObservations: r.attendance_observations,
        studentParticipationNotes: r.student_participation_notes,
        issuesEncountered: r.issues_encountered,
        followUpRecommendations: r.follow_up_recommendations,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at,
        metadata: r.metadata || {},
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        facilitatorName: persMap.get(r.facilitator_id) || 'Facilitator',
        cohortCode: cInfo?.code || 'Cohort',
        cohortName: cInfo?.name || '',
        programmeName: cInfo?.programmeName || '',
      };
    });

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      mapped = mapped.filter(
        (r) =>
          r.topicsCovered.toLowerCase().includes(q) ||
          r.sessionSummary.toLowerCase().includes(q) ||
          (r.facilitatorName && r.facilitatorName.toLowerCase().includes(q)) ||
          (r.cohortCode && r.cohortCode.toLowerCase().includes(q))
      );
    }

    return { data: mapped, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch reports';
    return { data: [], error: msg };
  }
}

export async function saveFacilitatorReport(data: {
  id?: string;
  cohortId: string;
  sessionId?: string | null;
  facilitatorId: string;
  reportDate: string;
  sessionSummary: string;
  topicsCovered: string;
  attendanceObservations?: string;
  studentParticipationNotes?: string;
  issuesEncountered?: string;
  followUpRecommendations?: string;
  status?: string;
}): Promise<{ data: FacilitatorReport | null; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) return { data: null, error: 'Unauthorized: login required' };

    if (session.role === 'Staff' || session.role === 'Student') {
      return { data: null, error: 'FORBIDDEN: Role not authorized to submit reports' };
    }

    const supabase = await createServerClient();

    // ZERO-EXAMINATION AUDIT INVARIANT ON REPORT CONTENT
    const prohibitedPattern =
      /\b(exam scores?|exam results?|grades? [a-f]|quiz(zes)?|quiz scores?|assessment marks?|pass marks?|test scores?)\b/i;
    if (prohibitedPattern.test(data.sessionSummary) || prohibitedPattern.test(data.topicsCovered)) {
      return {
        data: null,
        error:
          'ZERO_EXAMINATION_VIOLATION: Facilitator reports must not contain examination marks, grades, or exam scores',
      };
    }

    // Verify cohort exists
    const { data: cohort, error: cErr } = await supabase
      .from('cohorts')
      .select('id, tenant_id, lead_facilitator_id')
      .eq('id', data.cohortId)
      .single();

    if (cErr || !cohort) {
      return { data: null, error: `Referenced cohort '${data.cohortId}' not found` };
    }

    let reportFacilitatorId = data.facilitatorId;

    if (session.role === 'Facilitator') {
      const personnelRes = await getAuthoritativePersonnel().catch(() => null);
      const persId = personnelRes?.personnel?.id;
      if (!persId) {
        return { data: null, error: 'FORBIDDEN: Facilitator profile not found' };
      }

      // Facilitator must submit report for themselves
      reportFacilitatorId = persId;

      // Verify cohort assignment
      if (cohort.lead_facilitator_id !== persId) {
        const { data: sessionInCohort } = await supabase
          .from('training_sessions')
          .select('id')
          .eq('cohort_id', data.cohortId)
          .eq('facilitator_id', persId)
          .limit(1);

        if (!sessionInCohort || sessionInCohort.length === 0) {
          return { data: null, error: 'FORBIDDEN: Cannot submit reports for an unassigned cohort' };
        }
      }

      // Facilitators cannot review or approve their own report
      if (data.status === 'REVIEWED') {
        return { data: null, error: 'FORBIDDEN: Facilitators cannot approve or review reports' };
      }
    }

    const now = new Date().toISOString();
    const status = data.status || 'SUBMITTED';

    if (data.id) {
      const { data: updated, error: uErr } = await supabase
        .from('facilitator_reports')
        .update({
          session_id: data.sessionId || null,
          facilitator_id: reportFacilitatorId,
          report_date: data.reportDate,
          session_summary: data.sessionSummary.trim(),
          topics_covered: data.topicsCovered.trim(),
          attendance_observations: data.attendanceObservations || '',
          student_participation_notes: data.studentParticipationNotes || '',
          issues_encountered: data.issuesEncountered || '',
          follow_up_recommendations: data.followUpRecommendations || '',
          status,
          updated_at: now,
        })
        .eq('id', data.id)
        .select()
        .single();

      if (uErr) return { data: null, error: uErr.message };

      return {
        data: {
          id: updated.id,
          tenantId: updated.tenant_id,
          cohortId: updated.cohort_id,
          sessionId: updated.session_id,
          facilitatorId: updated.facilitator_id,
          reportDate: updated.report_date,
          sessionSummary: updated.session_summary,
          topicsCovered: updated.topics_covered,
          attendanceObservations: updated.attendance_observations,
          studentParticipationNotes: updated.student_participation_notes,
          issuesEncountered: updated.issues_encountered,
          followUpRecommendations: updated.follow_up_recommendations,
          status: updated.status,
          reviewedBy: updated.reviewed_by,
          reviewedAt: updated.reviewed_at,
          metadata: updated.metadata || {},
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
        error: null,
      };
    }

    const newId = `frep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: created, error: iErr } = await supabase
      .from('facilitator_reports')
      .insert({
        id: newId,
        tenant_id: cohort.tenant_id,
        cohort_id: data.cohortId,
        session_id: data.sessionId || null,
        facilitator_id: reportFacilitatorId,
        report_date: data.reportDate,
        session_summary: data.sessionSummary.trim(),
        topics_covered: data.topicsCovered.trim(),
        attendance_observations: data.attendanceObservations || '',
        student_participation_notes: data.studentParticipationNotes || '',
        issues_encountered: data.issuesEncountered || '',
        followUpRecommendations: data.followUpRecommendations || '',
        status,
        metadata: {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (iErr) return { data: null, error: iErr.message };

    return {
      data: {
        id: created.id,
        tenantId: created.tenant_id,
        cohortId: created.cohort_id,
        sessionId: created.session_id,
        facilitatorId: created.facilitator_id,
        reportDate: created.report_date,
        sessionSummary: created.session_summary,
        topicsCovered: created.topics_covered,
        attendanceObservations: created.attendance_observations,
        studentParticipationNotes: created.student_participation_notes,
        issuesEncountered: created.issues_encountered,
        followUpRecommendations: created.follow_up_recommendations,
        status: created.status,
        reviewedBy: created.reviewed_by,
        reviewedAt: created.reviewed_at,
        metadata: created.metadata || {},
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save facilitator report';
    return { data: null, error: msg };
  }
}

export async function reviewFacilitatorReport(
  reportId: string,
  reviewNotes?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) return { success: false, error: 'Unauthorized: login required' };

    const allowedReviewRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedReviewRoles.includes(session.role)) {
      return { success: false, error: 'FORBIDDEN: Only administrators may review and sign off facilitator reports' };
    }

    const supabase = await createServerClient();
    const user = session.user;

    const now = new Date().toISOString();
    const reviewerName = user.email || user.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('facilitator_reports')
      .select('metadata')
      .eq('id', reportId)
      .single();

    if (fetchErr) return { success: false, error: fetchErr.message };

    const meta = {
      ...(existing?.metadata || {}),
      reviewNotes: reviewNotes || 'Administrative review completed',
    };

    const { error: uErr } = await supabase
      .from('facilitator_reports')
      .update({
        status: 'REVIEWED',
        reviewed_by: reviewerName,
        reviewed_at: now,
        metadata: meta,
        updated_at: now,
      })
      .eq('id', reportId);

    if (uErr) return { success: false, error: uErr.message };

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to review report';
    return { success: false, error: msg };
  }
}
