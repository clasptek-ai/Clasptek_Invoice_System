/**
 * lib/certificates/certificate-queries.ts — Phase 9D
 * Server-side Data Access Layer for Certificate Management, Issuance, Revocation,
 * Reissuance, and Public Verification.
 * Enforces closed RLS, tenant isolation, and audit trail provenance.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import type {
  Certificate,
  IssueCertificateRequest,
  PublicCertificateVerification,
  ReissueCertificateRequest,
  UpdateCertificateRequest,
} from '@/types/certificates';
import { getDefaultCertificateSettingsForProgramme } from './constants';
import { formatRecipientName } from './format-name';

interface CertificateFilters {
  status?: string;
  search?: string;
}

export async function getCertificates(
  tenantId: string,
  filters: CertificateFilters = {}
): Promise<{
  data: Certificate[];
  kpis: {
    totalIssued: number;
    totalRevoked: number;
    totalReissued: number;
  };
  error: string | null;
}> {
  try {
    const supabase = await createServerClient();

    let query = supabase
      .from('certificates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('issue_date', { ascending: false })
      .order('certificate_number', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    const { data: certs, error: cErr } = await query;
    if (cErr) {
      console.error('[getCertificates] error:', cErr.message);
      return { data: [], kpis: { totalIssued: 0, totalRevoked: 0, totalReissued: 0 }, error: cErr.message };
    }

    let issuedCount = 0;
    let revokedCount = 0;
    let reissuedCount = 0;

    const studentIds = Array.from(new Set((certs || []).map((c) => c.student_id).filter(Boolean)));
    const { data: studentsData } =
      studentIds.length > 0
        ? await supabase.from('students').select('id, last_name, first_name, metadata').in('id', studentIds)
        : { data: [] };
    const studentMap = new Map((studentsData || []).map((s) => [s.id, s]));

    const formatted: Certificate[] = (certs || []).map((c) => {
      if (c.status === 'ISSUED') issuedCount++;
      if (c.status === 'REVOKED') revokedCount++;
      if (c.reissued_from_certificate_id) reissuedCount++;

      const stu = studentMap.get(c.student_id);
      const stuMeta = (stu?.metadata as Record<string, unknown>) || {};
      const sMiddle =
        (stuMeta.middleName as string) ||
        (stuMeta.middle_name as string) ||
        (stu as { middle_name?: string })?.middle_name ||
        '';
      const studentAuthoritativeName = stu
        ? formatRecipientName(stu.last_name, stu.first_name, sMiddle)
        : undefined;

      const meta = (c.metadata as Record<string, unknown>) || {};

      return {
        id: c.id,
        tenantId: c.tenant_id,
        studentId: c.student_id,
        enrolmentId: c.enrolment_id,
        programmeId: c.programme_id,
        cohortId: c.cohort_id,
        certificateNumber: c.certificate_number,
        issueDate: c.issue_date,
        completionDate: c.completion_date,
        status: c.status,
        issuedBy: c.issued_by,
        verificationToken: c.verification_token,
        studentNameSnapshot: c.student_name_snapshot,
        programmeNameSnapshot: c.programme_name_snapshot,
        programmeCodeSnapshot: c.programme_code_snapshot,
        cohortNameSnapshot: c.cohort_name_snapshot,
        cohortCodeSnapshot: c.cohort_code_snapshot,
        attendancePctSnapshot: Number(c.attendance_pct_snapshot || 0),
        certificateTitleSnapshot:
          (meta.certificate_title_snapshot as string) || (meta.certificateTitle as string) || 'Certificate of Completion',
        certificateDescriptionSnapshot:
          (meta.certificate_description_snapshot as string) || (meta.certificateDescription as string) || '',
        certificateIntroSnapshot:
          (meta.certificate_intro_snapshot as string) ||
          'Has successfully gained the knowledge and practical skills with core competencies in',
        certificateRoleSnapshot:
          (meta.certificate_role_snapshot as string) || (meta.certificateRole as string) || 'Certified Professional',
        signatoryName: (meta.signatory_name as string) || 'Academy Director',
        signatoryTitle: (meta.signatory_title as string) || 'Academy Director Signature',
        certificateTemplateId: (meta.certificate_template_id as string) || 'tpl_clasptek_v1',
        templateVersion: (meta.template_version as string) || '1.0',
        verificationUrl: (meta.verification_url as string) || undefined,
        pdfUrl: (meta.pdf_url as string) || null,
        revocationReason: c.revocation_reason,
        revokedBy: c.revoked_by,
        revokedAt: c.revoked_at,
        reissuedFromCertificateId: c.reissued_from_certificate_id,
        studentAuthoritativeName,
        metadata: meta,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    const searchLower = (filters.search || '').toLowerCase().trim();
    const filtered = searchLower
      ? formatted.filter((c) => {
          return (
            c.certificateNumber.toLowerCase().includes(searchLower) ||
            c.studentNameSnapshot.toLowerCase().includes(searchLower) ||
            c.programmeNameSnapshot.toLowerCase().includes(searchLower) ||
            c.verificationToken.toLowerCase().includes(searchLower)
          );
        })
      : formatted;

    return {
      data: filtered,
      kpis: {
        totalIssued: issuedCount,
        totalRevoked: revokedCount,
        totalReissued: reissuedCount,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve certificates';
    return { data: [], kpis: { totalIssued: 0, totalRevoked: 0, totalReissued: 0 }, error: msg };
  }
}

export async function getCertificateById(
  tenantId: string,
  certId: string
): Promise<{ data: Certificate | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const { data: c, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', certId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !c) {
      return { data: null, error: error ? error.message : 'Certificate not found' };
    }

    let studentAuthoritativeName: string | undefined;
    if (c.student_id) {
      const { data: stu } = await supabase
        .from('students')
        .select('id, last_name, first_name, metadata')
        .eq('id', c.student_id)
        .maybeSingle();
      if (stu) {
        const stuMeta = (stu.metadata as Record<string, unknown>) || {};
        const sMiddle =
          (stuMeta.middleName as string) ||
          (stuMeta.middle_name as string) ||
          (stu as { middle_name?: string })?.middle_name ||
          '';
        studentAuthoritativeName = formatRecipientName(stu.last_name, stu.first_name, sMiddle);
      }
    }

    const meta = (c.metadata as Record<string, unknown>) || {};
    const cert: Certificate = {
      id: c.id,
      tenantId: c.tenant_id,
      studentId: c.student_id,
      enrolmentId: c.enrolment_id,
      programmeId: c.programme_id,
      cohortId: c.cohort_id,
      certificateNumber: c.certificate_number,
      issueDate: c.issue_date,
      completionDate: c.completion_date,
      status: c.status,
      issuedBy: c.issued_by,
      verificationToken: c.verification_token,
      studentNameSnapshot: c.student_name_snapshot,
      programmeNameSnapshot: c.programme_name_snapshot,
      programmeCodeSnapshot: c.programme_code_snapshot,
      cohortNameSnapshot: c.cohort_name_snapshot,
      cohortCodeSnapshot: c.cohort_code_snapshot,
      attendancePctSnapshot: Number(c.attendance_pct_snapshot || 0),
      certificateTitleSnapshot:
        (meta.certificate_title_snapshot as string) || (meta.certificateTitle as string) || 'Certificate of Completion',
      certificateDescriptionSnapshot:
        (meta.certificate_description_snapshot as string) || (meta.certificateDescription as string) || '',
      certificateIntroSnapshot:
        (meta.certificate_intro_snapshot as string) ||
        'Has successfully gained the knowledge and practical skills with core competencies in',
      certificateRoleSnapshot:
        (meta.certificate_role_snapshot as string) || (meta.certificateRole as string) || 'Certified Professional',
      signatoryName: (meta.signatory_name as string) || 'Academy Director',
      signatoryTitle: (meta.signatory_title as string) || 'Academy Director Signature',
      certificateTemplateId: (meta.certificate_template_id as string) || 'tpl_clasptek_v1',
      templateVersion: (meta.template_version as string) || '1.0',
      verificationUrl: (meta.verification_url as string) || undefined,
      pdfUrl: (meta.pdf_url as string) || null,
      revocationReason: c.revocation_reason,
      revokedBy: c.revoked_by,
      revokedAt: c.revoked_at,
      reissuedFromCertificateId: c.reissued_from_certificate_id,
      studentAuthoritativeName,
      metadata: meta,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };

    return { data: cert, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve certificate';
    return { data: null, error: msg };
  }
}

export async function issueCertificate(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  request: IssueCertificateRequest & { reissuedFromCertificateId?: string; studentNameOverride?: string }
): Promise<{ success: boolean; certificate: Certificate | null; error: string | null }> {
  try {
    const supabase = await createServerClient();

    // 1. Authorization: Super Admin, Admin, or Staff only
    const roleLower = (actor.role || '').toLowerCase();
    const isAdminOrStaff =
      roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');
    if (!isAdminOrStaff) {
      return {
        success: false,
        certificate: null,
        error: 'UNAUTHORIZED: Only an authorized Administrator or Staff can issue Certificates of Completion',
      };
    }

    // 2. Fetch enrolment
    const { data: enr, error: enrErr } = await supabase
      .from('enrolments')
      .select('*')
      .eq('id', request.enrolmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (enrErr || !enr) {
      return { success: false, certificate: null, error: 'Enrolment not found or belongs to foreign tenant' };
    }

    // Academic Completion Guard
    if (enr.status !== 'COMPLETED' || enr.completion_status !== 'VERIFIED') {
      return {
        success: false,
        certificate: null,
        error: 'INELIGIBLE_CERTIFICATE_ISSUANCE: Student completion is not verified. Complete verification before issuing certificate.',
      };
    }

    // 3. Duplicate Active Certificate Guard
    const { data: existingActive } = await supabase
      .from('certificates')
      .select('id, certificate_number')
      .eq('enrolment_id', enr.id)
      .eq('status', 'ISSUED')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingActive) {
      return {
        success: false,
        certificate: null,
        error: `DUPLICATE_ACTIVE_CERTIFICATE: An active certificate (${existingActive.certificate_number}) has already been issued for this enrolment`,
      };
    }

    // 4. Fetch relational entities: student, programme, cohort
    const [studentRes, progRes, cohortRes] = await Promise.all([
      supabase.from('students').select('*').eq('id', enr.student_id).single(),
      supabase.from('programmes').select('*').eq('id', enr.programme_id).single(),
      enr.cohort_id ? supabase.from('cohorts').select('*').eq('id', enr.cohort_id).single() : Promise.resolve({ data: null }),
    ]);

    const student = studentRes.data;
    const programme = progRes.data;
    const cohort = cohortRes.data;

    // Student name snapshot - Strictly formatted as Last Name (Surname) + First Name + Middle Name
    const sMeta = (student?.metadata as Record<string, unknown>) || {};
    const middleName =
      (sMeta.middleName as string) ||
      (sMeta.middle_name as string) ||
      (student as { middle_name?: string })?.middle_name ||
      '';
    const authoritativeName = formatRecipientName(student?.last_name, student?.first_name, middleName);

    const studentNameSnapshot =
      request.studentNameOverride?.trim() ||
      authoritativeName ||
      student?.name ||
      enr.student_name ||
      'Student';

    // Programme snapshot
    const progNameSnapshot = programme?.name || enr.programme || 'Training Programme';
    const progCodeSnapshot = programme?.code || 'CLP';

    // Cohort snapshot
    const cohortMeta = (cohort?.metadata as Record<string, unknown>) || {};
    const cohortCodeSnapshot =
      (cohortMeta.cohort_code as string) || (cohortMeta.cohortCode as string) || enr.cohort || 'BATCH';
    const cohortNameSnapshot = cohort?.name || enr.cohort || 'Cohort';

    const attendancePctSnapshot = Number(enr.completion_attendance_pct || 0);

    // Programme settings
    const progMeta = (programme?.metadata as Record<string, unknown>) || {};
    const defaultSettings = getDefaultCertificateSettingsForProgramme(progNameSnapshot, progCodeSnapshot);
    const progSettings = (progMeta.certificateSettings as typeof defaultSettings) || defaultSettings;

    const certTitle = request.certificateTitle || progSettings.certificateTitle || 'Certificate of Completion';
    const certIntro = progSettings.certificateIntro || 'Has successfully gained the knowledge and practical skills with core competencies in';
    const certDesc = request.certificateDescription || progSettings.certificateDescription || '';
    const certRole = request.certificateRole || progSettings.certificateRole || `${progNameSnapshot} Professional`;
    const signatoryName = request.signatoryName || progSettings.signatoryName || 'Academy Director';
    const signatoryTitle = request.signatoryTitle || progSettings.signatoryTitle || 'Academy Director Signature';
    const templateId = request.certificateTemplateId || progSettings.certificateTemplateId || 'tpl_clasptek_v1';

    // 5. Canonical Sequential Certificate Number (e.g. CERT-2026-1001)
    const issueDate = request.issueDate || new Date().toISOString().slice(0, 10);
    const issueYear = new Date(issueDate).getFullYear();

    const { count: certCount } = await supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const nextSeq = 1001 + (certCount || 0);
    const certNumber = `CERT-${issueYear}-${nextSeq}`;

    // Cryptographic verification token
    const tokenBytes = crypto.randomBytes(16).toString('hex');
    const verificationToken = `vtok_${Date.now().toString(36)}_${tokenBytes}`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.clasptek.com';
    const verificationUrl = `${baseUrl}/verify-certificate/${encodeURIComponent(certNumber)}`;

    const certId = `cert_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const certRecord = {
      id: certId,
      tenant_id: tenantId,
      student_id: enr.student_id,
      enrolment_id: enr.id,
      programme_id: enr.programme_id,
      cohort_id: enr.cohort_id || null,
      certificate_number: certNumber,
      issue_date: issueDate,
      completion_date: enr.completion_date || issueDate,
      status: 'ISSUED',
      issued_by: actor.id,
      verification_token: verificationToken,
      student_name_snapshot: studentNameSnapshot,
      programme_name_snapshot: progNameSnapshot,
      programme_code_snapshot: progCodeSnapshot,
      cohort_name_snapshot: cohortNameSnapshot,
      cohort_code_snapshot: cohortCodeSnapshot,
      attendance_pct_snapshot: attendancePctSnapshot,
      reissued_from_certificate_id: request.reissuedFromCertificateId || null,
      metadata: {
        certificate_title_snapshot: certTitle,
        certificate_description_snapshot: certDesc,
        certificate_intro_snapshot: certIntro,
        certificate_role_snapshot: certRole,
        signatory_name: signatoryName,
        signatory_title: signatoryTitle,
        certificate_template_id: templateId,
        template_version: '1.0',
        verification_url: verificationUrl,
      },
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { error: insErr } = await supabase.from('certificates').insert(certRecord);
    if (insErr) {
      console.error('[issueCertificate] insert error:', insErr.message);
      return { success: false, certificate: null, error: insErr.message };
    }

    // 6. Resynchronize denormalized fields on enrolment
    await supabase
      .from('enrolments')
      .update({
        certificate_issued: true,
        certificate_number: certNumber,
        certificate_issued_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', enr.id)
      .eq('tenant_id', tenantId);

    // 7. Audit Log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'CERTIFICATE_ISSUED',
      entity_type: 'certificates',
      entity_id: certId,
      entity_name: certNumber,
      old_state: null,
      new_state: {
        certificate_number: certNumber,
        student: studentNameSnapshot,
        programme: progNameSnapshot,
        role: certRole,
      },
      reason: request.reissuedFromCertificateId
        ? `Reissued from previous certificate ID ${request.reissuedFromCertificateId}`
        : `Official certificate issued for enrolment ${enr.enrolment_number || enr.id}`,
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    const createdCert: Certificate = {
      id: certRecord.id,
      tenantId: certRecord.tenant_id,
      studentId: certRecord.student_id,
      enrolmentId: certRecord.enrolment_id,
      programmeId: certRecord.programme_id,
      cohortId: certRecord.cohort_id,
      certificateNumber: certRecord.certificate_number,
      issueDate: certRecord.issue_date,
      completionDate: certRecord.completion_date,
      status: 'ISSUED',
      issuedBy: certRecord.issued_by,
      verificationToken: certRecord.verification_token,
      studentNameSnapshot: certRecord.student_name_snapshot,
      programmeNameSnapshot: certRecord.programme_name_snapshot,
      programmeCodeSnapshot: certRecord.programme_code_snapshot,
      cohortNameSnapshot: certRecord.cohort_name_snapshot,
      cohortCodeSnapshot: certRecord.cohort_code_snapshot,
      attendancePctSnapshot: certRecord.attendance_pct_snapshot,
      certificateTitleSnapshot: certTitle,
      certificateDescriptionSnapshot: certDesc,
      certificateIntroSnapshot: certIntro,
      certificateRoleSnapshot: certRole,
      signatoryName,
      signatoryTitle,
      certificateTemplateId: templateId,
      templateVersion: '1.0',
      verificationUrl,
      reissuedFromCertificateId: certRecord.reissued_from_certificate_id,
      metadata: certRecord.metadata,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return { success: true, certificate: createdCert, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to issue certificate';
    return { success: false, certificate: null, error: msg };
  }
}

export async function revokeCertificate(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  certificateId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!reason || !reason.trim()) {
      return {
        success: false,
        error: 'REVOCATION_REASON_REQUIRED: Certificate revocation strictly requires a documented justification reason',
      };
    }

    const supabase = await createServerClient();

    // 1. Authorization
    const roleLower = (actor.role || '').toLowerCase();
    const isAdminOrStaff =
      roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');
    if (!isAdminOrStaff) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only an authorized Administrator or Staff can revoke Certificates of Completion',
      };
    }

    // 2. Fetch certificate
    const { data: cert, error: cErr } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', certificateId)
      .eq('tenant_id', tenantId)
      .single();

    if (cErr || !cert) {
      return { success: false, error: 'Certificate not found or belongs to foreign tenant' };
    }

    if (cert.status === 'REVOKED') {
      return { success: false, error: 'ALREADY_REVOKED: Certificate is already revoked' };
    }

    const nowIso = new Date().toISOString();
    const cleanReason = reason.trim();

    // 3. Mark Revoked
    const { error: updErr } = await supabase
      .from('certificates')
      .update({
        status: 'REVOKED',
        revocation_reason: cleanReason,
        revoked_by: actor.id,
        revoked_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', cert.id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // 4. Update enrolment certificateIssued status
    if (cert.enrolment_id) {
      await supabase
        .from('enrolments')
        .update({
          certificate_issued: false,
          updated_at: nowIso,
        })
        .eq('id', cert.enrolment_id)
        .eq('tenant_id', tenantId);
    }

    // 5. Audit Log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'CERTIFICATE_REVOKED',
      entity_type: 'certificates',
      entity_id: cert.id,
      entity_name: cert.certificate_number,
      old_state: { status: 'ISSUED' },
      new_state: { status: 'REVOKED', revocation_reason: cleanReason },
      reason: cleanReason,
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to revoke certificate';
    return { success: false, error: msg };
  }
}

export async function reissueCertificate(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  oldCertificateId: string,
  request: ReissueCertificateRequest
): Promise<{ success: boolean; certificate: Certificate | null; error: string | null }> {
  try {
    const cleanReason = request.reason ? request.reason.trim() : '';
    if (!cleanReason) {
      return {
        success: false,
        certificate: null,
        error: 'REISSUE_REASON_REQUIRED: Certificate reissuance strictly requires a documented justification reason',
      };
    }

    const supabase = await createServerClient();

    // 1. Fetch old cert
    const { data: oldCert, error: cErr } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', oldCertificateId)
      .eq('tenant_id', tenantId)
      .single();

    if (cErr || !oldCert) {
      return { success: false, certificate: null, error: 'Original certificate not found or belongs to foreign tenant' };
    }

    // 2. Revoke old certificate if active
    if (oldCert.status !== 'REVOKED') {
      const revokeRes = await revokeCertificate(tenantId, actor, oldCert.id, `Revoked for reissuance: ${cleanReason}`);
      if (!revokeRes.success) {
        return { success: false, certificate: null, error: revokeRes.error };
      }
    }

    // 3. Issue replacement certificate
    const issueRes = await issueCertificate(tenantId, actor, {
      enrolmentId: oldCert.enrolment_id,
      issueDate: request.issueDate || new Date().toISOString().slice(0, 10),
      studentNameOverride: request.studentNameOverride,
      certificateTitle: request.certificateTitle,
      certificateDescription: request.certificateDescription,
      certificateRole: request.certificateRole,
      reissuedFromCertificateId: oldCert.id,
    });

    if (!issueRes.success || !issueRes.certificate) {
      return { success: false, certificate: null, error: issueRes.error };
    }

    // 4. Audit Log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'CERTIFICATE_REISSUED',
      entity_type: 'certificates',
      entity_id: issueRes.certificate.id,
      entity_name: issueRes.certificate.certificateNumber,
      old_state: { reissued_from: oldCert.certificate_number },
      new_state: { certificate_number: issueRes.certificate.certificateNumber },
      reason: cleanReason,
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    return { success: true, certificate: issueRes.certificate, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reissue certificate';
    return { success: false, certificate: null, error: msg };
  }
}

export async function updateCertificateRecord(
  tenantId: string,
  actor: { id: string; role: string; email?: string },
  certificateId: string,
  updates: UpdateCertificateRequest
): Promise<{ success: boolean; certificate: Certificate | null; error: string | null }> {
  try {
    const supabase = await createServerClient();

    // 1. Authorisation Check
    const roleLower = (actor.role || '').toLowerCase();
    const isAdminOrStaff =
      roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');
    if (!isAdminOrStaff) {
      return {
        success: false,
        certificate: null,
        error: 'UNAUTHORIZED: Only an authorized Administrator or Staff member can edit issued certificates',
      };
    }

    // 2. Fetch existing certificate with tenant isolation
    const { data: cert, error: cErr } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', certificateId)
      .eq('tenant_id', tenantId)
      .single();

    if (cErr || !cert) {
      return {
        success: false,
        certificate: null,
        error: 'Certificate not found or belongs to foreign tenant',
      };
    }

    // 3. Validation: Recipient Name must not be empty if specified
    const newStudentName =
      updates.studentNameSnapshot !== undefined
        ? updates.studentNameSnapshot.trim()
        : cert.student_name_snapshot;

    if (!newStudentName) {
      return {
        success: false,
        certificate: null,
        error: 'RECIPIENT_NAME_REQUIRED: The recipient name cannot be empty',
      };
    }

    const editReason =
      (updates.reason || '').trim() || 'Administrative correction of certificate details';
    const nowIso = new Date().toISOString();
    const currentMeta = (cert.metadata as Record<string, unknown>) || {};

    // 4. Compute changed fields for audit log
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};

    if (newStudentName !== cert.student_name_snapshot) {
      changedFields.student_name_snapshot = {
        old: cert.student_name_snapshot,
        new: newStudentName,
      };
    }

    const newIssueDate = updates.issueDate ? updates.issueDate.trim() : cert.issue_date;
    if (newIssueDate !== cert.issue_date) {
      changedFields.issue_date = {
        old: cert.issue_date,
        new: newIssueDate,
      };
    }

    const newCompletionDate = updates.completionDate ? updates.completionDate.trim() : cert.completion_date;
    if (newCompletionDate !== cert.completion_date) {
      changedFields.completion_date = {
        old: cert.completion_date,
        new: newCompletionDate,
      };
    }

    const newTitle =
      updates.certificateTitle !== undefined
        ? updates.certificateTitle.trim()
        : (currentMeta.certificate_title_snapshot as string) ||
          (currentMeta.certificateTitle as string) ||
          'Certificate of Completion';

    const newDesc =
      updates.certificateDescription !== undefined
        ? updates.certificateDescription.trim()
        : (currentMeta.certificate_description_snapshot as string) ||
          (currentMeta.certificateDescription as string) ||
          '';

    const newRole =
      updates.certificateRole !== undefined
        ? updates.certificateRole.trim()
        : (currentMeta.certificate_role_snapshot as string) ||
          (currentMeta.certificateRole as string) ||
          '';

    const newSigName =
      updates.signatoryName !== undefined
        ? updates.signatoryName.trim()
        : (currentMeta.signatory_name as string) || 'Academy Director';

    const newSigTitle =
      updates.signatoryTitle !== undefined
        ? updates.signatoryTitle.trim()
        : (currentMeta.signatory_title as string) || 'Academy Director Signature';

    const updatedMeta: Record<string, unknown> = {
      ...currentMeta,
      certificate_title_snapshot: newTitle,
      certificate_description_snapshot: newDesc,
      certificate_role_snapshot: newRole,
      signatory_name: newSigName,
      signatory_title: newSigTitle,
    };

    // Append to audit trail inside metadata
    const existingAuditTrail = (Array.isArray(currentMeta.audit_trail) ? currentMeta.audit_trail : []) as Array<
      Record<string, unknown>
    >;
    const auditEntry = {
      timestamp: nowIso,
      actor_id: actor.id,
      actor_role: actor.role,
      actor_email: actor.email,
      action: 'CERTIFICATE_UPDATED',
      reason: editReason,
      changes: Object.keys(changedFields).reduce((acc, k) => {
        acc[k] = changedFields[k].new;
        return acc;
      }, {} as Record<string, unknown>),
    };
    updatedMeta.audit_trail = [...existingAuditTrail, auditEntry];

    // 5. Update certificate in-place, preserving id, certificate_number, status, relationships
    const updatePayload = {
      student_name_snapshot: newStudentName,
      issue_date: newIssueDate,
      completion_date: newCompletionDate,
      metadata: updatedMeta,
      updated_at: nowIso,
    };

    const { error: updErr } = await supabase
      .from('certificates')
      .update(updatePayload)
      .eq('id', cert.id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      console.error('[updateCertificateRecord] error:', updErr.message);
      return { success: false, certificate: null, error: updErr.message };
    }

    // 6. Record in authoritative finance_audit_log
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    const { error: audErr } = await supabase.from('finance_audit_log').insert({
      id: auditId,
      tenant_id: tenantId,
      action: 'CERTIFICATE_UPDATED',
      entity_type: 'certificates',
      entity_id: cert.id,
      entity_name: cert.certificate_number,
      old_state: Object.keys(changedFields).reduce((acc, k) => {
        acc[k] = changedFields[k].old;
        return acc;
      }, {} as Record<string, unknown>),
      new_state: Object.keys(changedFields).reduce((acc, k) => {
        acc[k] = changedFields[k].new;
        return acc;
      }, {} as Record<string, unknown>),
      reason: editReason,
      actor_id: actor.id,
      actor_role: actor.role,
      source: 'nextjs_training_certificates',
    });

    if (audErr) {
      console.error('[updateCertificateRecord] audit log insert error:', audErr.message);
      return {
        success: false,
        certificate: null,
        error: `AUDIT_LOG_FAILED: Required audit record could not be written (${audErr.message})`,
      };
    }

    // 7. Re-fetch or derive studentAuthoritativeName
    let studentAuthoritativeName: string | undefined;
    if (cert.student_id) {
      const { data: stu } = await supabase
        .from('students')
        .select('id, last_name, first_name, metadata')
        .eq('id', cert.student_id)
        .maybeSingle();
      if (stu) {
        const stuMeta = (stu.metadata as Record<string, unknown>) || {};
        const sMiddle =
          (stuMeta.middleName as string) ||
          (stuMeta.middle_name as string) ||
          (stu as { middle_name?: string })?.middle_name ||
          '';
        studentAuthoritativeName = formatRecipientName(stu.last_name, stu.first_name, sMiddle);
      }
    }

    const updatedCert: Certificate = {
      id: cert.id,
      tenantId: cert.tenant_id,
      studentId: cert.student_id,
      enrolmentId: cert.enrolment_id,
      programmeId: cert.programme_id,
      cohortId: cert.cohort_id,
      certificateNumber: cert.certificate_number,
      issueDate: newIssueDate,
      completionDate: newCompletionDate,
      status: cert.status,
      issuedBy: cert.issued_by,
      verificationToken: cert.verification_token,
      studentNameSnapshot: newStudentName,
      programmeNameSnapshot: cert.programme_name_snapshot,
      programmeCodeSnapshot: cert.programme_code_snapshot,
      cohortNameSnapshot: cert.cohort_name_snapshot,
      cohortCodeSnapshot: cert.cohort_code_snapshot,
      attendancePctSnapshot: Number(cert.attendance_pct_snapshot || 0),
      certificateTitleSnapshot: newTitle,
      certificateDescriptionSnapshot: newDesc,
      certificateIntroSnapshot:
        (updatedMeta.certificate_intro_snapshot as string) || cert.certificate_intro_snapshot,
      certificateRoleSnapshot: newRole,
      signatoryName: newSigName,
      signatoryTitle: newSigTitle,
      certificateTemplateId: (updatedMeta.certificate_template_id as string) || cert.certificate_template_id,
      templateVersion: (updatedMeta.template_version as string) || '1.0',
      verificationUrl: (updatedMeta.verification_url as string) || cert.verification_url,
      pdfUrl: cert.pdf_url,
      revocationReason: cert.revocation_reason,
      revokedBy: cert.revoked_by,
      revokedAt: cert.revoked_at,
      reissuedFromCertificateId: cert.reissued_from_certificate_id,
      studentAuthoritativeName,
      metadata: updatedMeta,
      createdAt: cert.created_at,
      updatedAt: nowIso,
    };

    return { success: true, certificate: updatedCert, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error updating certificate';
    return { success: false, certificate: null, error: msg };
  }
}

export async function verifyCertificatePublic(
  identifier: string
): Promise<PublicCertificateVerification> {
  try {
    const cleanId = String(identifier || '').trim();
    if (!cleanId) {
      return { found: false, isValid: false, status: 'NOT_FOUND', message: 'No credential identifier provided' };
    }

    const supabase = await createServerClient();

    // Lookup by certificate_number or verification_token
    const { data: cert, error } = await supabase
      .from('certificates')
      .select('*')
      .or(`certificate_number.eq."${cleanId}",verification_token.eq."${cleanId}"`)
      .limit(1)
      .maybeSingle();

    if (error || !cert) {
      return {
        found: false,
        isValid: false,
        status: 'NOT_FOUND',
        message: 'No official certificate was found matching the identifier in the Clasptek authoritative registry.',
      };
    }

    const meta = (cert.metadata as Record<string, unknown>) || {};

    // STRICT SANITIZATION: ZERO exposure of student email, phone, tenant ID, student ID, financial records
    return {
      found: true,
      isValid: cert.status === 'ISSUED',
      status: cert.status as 'ISSUED' | 'REVOKED',
      certificateNumber: cert.certificate_number,
      studentName: cert.student_name_snapshot,
      programmeName: cert.programme_name_snapshot,
      programmeCode: cert.programme_code_snapshot,
      cohortName: cert.cohort_name_snapshot,
      certificateTitle:
        (meta.certificate_title_snapshot as string) || (meta.certificateTitle as string) || 'Certificate of Completion',
      certificateDescription:
        (meta.certificate_description_snapshot as string) || (meta.certificateDescription as string) || '',
      certificateRole: (meta.certificate_role_snapshot as string) || (meta.certificateRole as string) || '',
      issueDate: cert.issue_date,
      completionDate: cert.completion_date,
      verificationToken: cert.verification_token,
      revocationReason: cert.status === 'REVOKED' ? cert.revocation_reason : null,
      revokedAt: cert.status === 'REVOKED' ? cert.revoked_at : null,
    };
  } catch {
    return {
      found: false,
      isValid: false,
      status: 'NOT_FOUND',
      message: 'Certificate credential could not be verified due to an internal error',
    };
  }
}
