/**
 * lib/certificates/eligibility-queries.ts — Phase 9D
 * Authoritative Server-side Data Access Layer for Certificate Eligibility
 * Evaluates completion based strictly on attendance participation (>= 80%)
 * and facilitator reports. Zero exam/quiz/grading dependencies.
 */

import { createServerClient } from '@/lib/supabase/server';
import type {
  CertificateEligibilityCandidate,
  CompletionStatus,
} from '@/types/certificates';
import { DEFAULT_ATTENDANCE_THRESHOLD } from './constants';

interface EligibilityFilters {
  cohortId?: string;
  eligibilityFilter?: 'ALL' | 'ELIGIBLE' | 'BELOW_THRESHOLD' | 'VERIFIED' | 'UNVERIFIED';
  search?: string;
}

export async function getCertificateEligibilityList(
  tenantId: string,
  filters: EligibilityFilters = {}
): Promise<{
  data: CertificateEligibilityCandidate[];
  kpis: {
    totalCandidates: number;
    attendanceEligible: number;
    verifiedCompletions: number;
    belowThreshold: number;
  };
  error: string | null;
}> {
  try {
    const supabase = await createServerClient();

    // 1. Fetch active enrolments (exclude cancelled / withdrawn)
    let enrQuery = supabase
      .from('enrolments')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("CANCELLED","WITHDRAWN")')
      .order('created_at', { ascending: false });

    if (filters.cohortId && filters.cohortId !== 'ALL') {
      enrQuery = enrQuery.eq('cohort_id', filters.cohortId);
    }

    const { data: enrolments, error: enrErr } = await enrQuery;
    if (enrErr) {
      console.error('[getCertificateEligibilityList] Enrolments fetch error:', enrErr.message);
      return {
        data: [],
        kpis: { totalCandidates: 0, attendanceEligible: 0, verifiedCompletions: 0, belowThreshold: 0 },
        error: enrErr.message,
      };
    }

    if (!enrolments || enrolments.length === 0) {
      return {
        data: [],
        kpis: { totalCandidates: 0, attendanceEligible: 0, verifiedCompletions: 0, belowThreshold: 0 },
        error: null,
      };
    }

    // 2. Fetch auxiliary relational data: students, programmes, cohorts, training sessions, attendance, active certs
    const enrolmentIds = enrolments.map((e) => e.id);
    const cohortIds = Array.from(new Set(enrolments.map((e) => e.cohort_id).filter(Boolean)));
    const studentIds = Array.from(new Set(enrolments.map((e) => e.student_id).filter(Boolean)));
    const programmeIds = Array.from(new Set(enrolments.map((e) => e.programme_id).filter(Boolean)));

    const [studentsRes, progRes, cohortsRes, sessionsRes, attendanceRes, certsRes] =
      await Promise.all([
        supabase.from('students').select('id, name, first_name, last_name, student_number, email').in('id', studentIds),
        supabase.from('programmes').select('id, name, code, metadata').in('id', programmeIds),
        cohortIds.length > 0
          ? supabase.from('cohorts').select('id, name, metadata, lead_facilitator_id').in('id', cohortIds)
          : Promise.resolve({ data: [] }),
        cohortIds.length > 0
          ? supabase
              .from('training_sessions')
              .select('id, cohort_id, session_number, status')
              .in('cohort_id', cohortIds)
              .not('status', 'eq', 'CANCELLED')
          : Promise.resolve({ data: [] }),
        enrolmentIds.length > 0
          ? supabase
              .from('attendance')
              .select('id, session_id, enrolment_id, attendance_status')
              .in('enrolment_id', enrolmentIds)
          : Promise.resolve({ data: [] }),
        enrolmentIds.length > 0
          ? supabase
              .from('certificates')
              .select('id, enrolment_id, certificate_number, status')
              .eq('tenant_id', tenantId)
              .eq('status', 'ISSUED')
              .in('enrolment_id', enrolmentIds)
          : Promise.resolve({ data: [] }),
      ]);

    const studentMap = new Map((studentsRes.data || []).map((s) => [s.id, s]));
    const progMap = new Map((progRes.data || []).map((p) => [p.id, p]));
    const cohortMap = new Map((cohortsRes.data || []).map((c) => [c.id, c]));

    // Delivered sessions map per cohort (COMPLETED or ATTENDANCE_SUBMITTED)
    const deliveredSessionsPerCohort = new Map<string, string[]>();
    (sessionsRes.data || []).forEach((s) => {
      const isDelivered = s.status === 'COMPLETED' || s.status === 'ATTENDANCE_SUBMITTED';
      if (isDelivered) {
        const arr = deliveredSessionsPerCohort.get(s.cohort_id) || [];
        arr.push(s.id);
        deliveredSessionsPerCohort.set(s.cohort_id, arr);
      }
    });

    // Attendance records grouped by enrolment_id
    const attendanceByEnrolment = new Map<string, typeof attendanceRes.data>();
    (attendanceRes.data || []).forEach((rec) => {
      const arr = attendanceByEnrolment.get(rec.enrolment_id) || [];
      arr.push(rec);
      attendanceByEnrolment.set(rec.enrolment_id, arr);
    });

    // Active certificates grouped by enrolment_id
    const certByEnrolment = new Map<string, { id: string; certificate_number: string }>();
    (certsRes.data || []).forEach((cert) => {
      certByEnrolment.set(cert.enrolment_id, cert);
    });

    // 3. Evaluate each candidate
    let totalEligible = 0;
    let totalVerified = 0;
    let totalBelowThreshold = 0;

    const candidates: CertificateEligibilityCandidate[] = enrolments.map((en) => {
      const student = studentMap.get(en.student_id);
      const studentName =
        student?.name ||
        `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
        en.student_name ||
        'Student';
      const studentNumber = student?.student_number || en.student_number || '';
      const studentEmail = student?.email || en.student_email || '';

      const prog = progMap.get(en.programme_id);
      const progName = prog?.name || en.programme || 'Programme';
      const progCode = prog?.code || 'CLP';

      const cohort = cohortMap.get(en.cohort_id);
      const meta = (cohort?.metadata as Record<string, unknown>) || {};
      const cohortCode = (meta.cohort_code as string) || (meta.cohortCode as string) || en.cohort || 'Cohort';
      const cohortName = cohort?.name || en.cohort || 'Cohort';

      // Delivered sessions for this cohort
      const cohortDeliveredSessionIds = new Set(deliveredSessionsPerCohort.get(en.cohort_id) || []);
      const totalDelivered = cohortDeliveredSessionIds.size;

      // Attendance records for this enrolment
      const attRecords = attendanceByEnrolment.get(en.id) || [];
      let presentCount = 0;
      let lateCount = 0;
      let excusedCount = 0;

      attRecords.forEach((r) => {
        if (!cohortDeliveredSessionIds.has(r.session_id)) return;
        if (r.attendance_status === 'PRESENT') presentCount++;
        else if (r.attendance_status === 'LATE') lateCount++;
        else if (r.attendance_status === 'EXCUSED') excusedCount++;
      });

      const effectiveAttended = presentCount * 1.0 + lateCount * 1.0 + excusedCount * 0.5;
      const attendancePct =
        totalDelivered > 0 ? Math.min(100, Math.round((effectiveAttended / totalDelivered) * 100)) : 0;

      const requiredPct = DEFAULT_ATTENDANCE_THRESHOLD;
      const isAttendanceEligible = totalDelivered > 0 && attendancePct >= requiredPct;
      const isVerified = en.completion_status === 'VERIFIED';
      const activeCert = certByEnrolment.get(en.id);

      if (isAttendanceEligible) totalEligible++;
      if (isVerified) totalVerified++;
      if (totalDelivered > 0 && !isAttendanceEligible && !isVerified) totalBelowThreshold++;

      return {
        enrolmentId: en.id,
        enrolmentNumber: en.enrolment_number || en.id,
        studentId: en.student_id,
        studentNumber,
        studentName,
        studentEmail,
        programmeId: en.programme_id,
        programmeName: progName,
        programmeCode: progCode,
        cohortId: en.cohort_id,
        cohortName,
        cohortCode,
        currentStatus: en.status,
        completionStatus: (en.completion_status as CompletionStatus) || 'NOT_ELIGIBLE',
        completionDate: en.completion_date,
        completionVerifiedBy: en.completion_verified_by,
        completionVerifiedAt: en.completion_verified_at,
        completionNotes: en.completion_notes,
        attendancePct,
        requiredPct,
        totalDeliveredSessions: totalDelivered,
        totalAttendedSessions: presentCount + lateCount,
        isAttendanceEligible,
        isVerified,
        hasActiveCertificate: Boolean(activeCert),
        activeCertificateId: activeCert?.id || null,
        activeCertificateNumber: activeCert?.certificate_number || null,
      };
    });

    // 4. Apply in-memory filtering (search & eligibility filter)
    const searchLower = (filters.search || '').toLowerCase().trim();
    const elFilter = filters.eligibilityFilter || 'ALL';

    const filtered = candidates.filter((c) => {
      if (elFilter === 'ELIGIBLE' && !c.isAttendanceEligible) return false;
      if (elFilter === 'BELOW_THRESHOLD' && (c.isAttendanceEligible || c.isVerified)) return false;
      if (elFilter === 'VERIFIED' && !c.isVerified) return false;
      if (elFilter === 'UNVERIFIED' && c.isVerified) return false;

      if (searchLower) {
        const matchName = c.studentName.toLowerCase().includes(searchLower);
        const matchNum = c.enrolmentNumber.toLowerCase().includes(searchLower);
        const matchEmail = (c.studentEmail || '').toLowerCase().includes(searchLower);
        const matchProg = c.programmeName.toLowerCase().includes(searchLower);
        const matchCert = (c.activeCertificateNumber || '').toLowerCase().includes(searchLower);
        if (!matchName && !matchNum && !matchEmail && !matchProg && !matchCert) return false;
      }
      return true;
    });

    return {
      data: filtered,
      kpis: {
        totalCandidates: candidates.length,
        attendanceEligible: totalEligible,
        verifiedCompletions: totalVerified,
        belowThreshold: totalBelowThreshold,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve certificate eligibility list';
    return {
      data: [],
      kpis: { totalCandidates: 0, attendanceEligible: 0, verifiedCompletions: 0, belowThreshold: 0 },
      error: msg,
    };
  }
}

export async function verifyEnrolmentCompletion(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  enrolmentId: string,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createServerClient();

    // 1. Fetch enrolment
    const { data: enr, error: enrErr } = await supabase
      .from('enrolments')
      .select('*')
      .eq('id', enrolmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (enrErr || !enr) {
      return { success: false, error: 'Enrolment not found or does not belong to authoritative tenant' };
    }

    // 2. Authorization: Super Admin, Admin, Staff, or Lead Facilitator of cohort
    const roleLower = (actor.role || '').toLowerCase();
    const isAdminOrStaff =
      roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');

    let isLeadFacilitator = false;
    if (!isAdminOrStaff && enr.cohort_id) {
      const { data: cohort } = await supabase
        .from('cohorts')
        .select('lead_facilitator_id')
        .eq('id', enr.cohort_id)
        .eq('tenant_id', tenantId)
        .single();
      if (cohort && cohort.lead_facilitator_id === actor.id) {
        isLeadFacilitator = true;
      }
    }

    if (!isAdminOrStaff && !isLeadFacilitator) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only an authorized Administrator, Staff, or assigned Cohort Lead Facilitator can verify training completion',
      };
    }

    // 3. Derive attendance
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('id, status')
      .eq('cohort_id', enr.cohort_id)
      .in('status', ['COMPLETED', 'ATTENDANCE_SUBMITTED']);

    const deliveredIds = (sessions || []).map((s) => s.id);
    const totalDelivered = deliveredIds.length;

    let present = 0;
    let late = 0;
    let excused = 0;

    if (totalDelivered > 0) {
      const { data: att } = await supabase
        .from('attendance')
        .select('attendance_status, session_id')
        .eq('enrolment_id', enr.id)
        .in('session_id', deliveredIds);

      (att || []).forEach((r) => {
        if (r.attendance_status === 'PRESENT') present++;
        else if (r.attendance_status === 'LATE') late++;
        else if (r.attendance_status === 'EXCUSED') excused++;
      });
    }

    const effective = present * 1.0 + late * 1.0 + excused * 0.5;
    const attendancePct = totalDelivered > 0 ? Math.min(100, Math.round((effective / totalDelivered) * 100)) : 0;

    if (attendancePct < DEFAULT_ATTENDANCE_THRESHOLD && !isAdminOrStaff) {
      return {
        success: false,
        error: `INELIGIBLE_COMPLETION: Student attendance (${attendancePct}%) does not meet the required threshold (${DEFAULT_ATTENDANCE_THRESHOLD}%). Requires administrative override.`,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const { error: updErr } = await supabase
      .from('enrolments')
      .update({
        completion_status: 'VERIFIED',
        status: 'COMPLETED',
        completion_date: today,
        completion_verified_by: actor.id,
        completion_verified_at: nowIso,
        completion_notes: notes || 'Completion verified based on training participation and attendance records',
        completion_attendance_pct: attendancePct,
        updated_at: nowIso,
      })
      .eq('id', enr.id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // 4. Immutable Audit Log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'COMPLETION_VERIFIED',
      entity_type: 'enrolments',
      entity_id: enr.id,
      entity_name: enr.enrolment_number || enr.id,
      old_state: { status: enr.status, completion_status: enr.completion_status },
      new_state: { status: 'COMPLETED', completion_status: 'VERIFIED', attendance_pct: attendancePct },
      reason: notes || 'Facilitator training completion signoff',
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to verify completion';
    return { success: false, error: msg };
  }
}

export async function overrideEnrolmentCompletion(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  enrolmentId: string,
  overrideReason: string,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!overrideReason || !overrideReason.trim()) {
      return {
        success: false,
        error: 'OVERRIDE_REASON_REQUIRED: Administrative completion override requires a documented justification reason',
      };
    }

    const supabase = await createServerClient();

    // 1. Authorization: Super Admin or Staff only
    const roleLower = (actor.role || '').toLowerCase();
    const isAdminOrStaff =
      roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');

    if (!isAdminOrStaff) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only Super Admin or Staff can execute an administrative completion override',
      };
    }

    // 2. Fetch enrolment
    const { data: enr, error: enrErr } = await supabase
      .from('enrolments')
      .select('*')
      .eq('id', enrolmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (enrErr || !enr) {
      return { success: false, error: 'Enrolment not found or does not belong to authoritative tenant' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const cleanReason = overrideReason.trim();
    const fullNotes = `ADMIN OVERRIDE: ${cleanReason}` + (notes && notes.trim() ? ` | ${notes.trim()}` : '');

    const { error: updErr } = await supabase
      .from('enrolments')
      .update({
        completion_status: 'VERIFIED',
        status: 'COMPLETED',
        completion_date: today,
        completion_verified_by: actor.id,
        completion_verified_at: nowIso,
        completion_notes: fullNotes,
        updated_at: nowIso,
      })
      .eq('id', enr.id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // 3. Immutable Audit Log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'COMPLETION_OVERRIDE',
      entity_type: 'enrolments',
      entity_id: enr.id,
      entity_name: enr.enrolment_number || enr.id,
      old_state: { status: enr.status, completion_status: enr.completion_status },
      new_state: { status: 'COMPLETED', completion_status: 'VERIFIED', reason: cleanReason },
      reason: cleanReason,
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to override completion';
    return { success: false, error: msg };
  }
}
