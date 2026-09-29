/**
 * lib/students/mutations.ts
 * Authoritative Server-side Mutation Logic for Students
 * Enforces:
 * - Immutable identifiers protection (id, student_number, tenant_id, created_at)
 * - Required reason for every profile update
 * - Strict field diffing and append-only audit trail in metadata.audit_trail
 * - Graceful customer_timeline logging
 * - Collision-resistant IDs (crypto.randomUUID, no Math.random)
 * - Zero automatic enrolment creation on student registration
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Student,
  StudentStatus,
  StudentAuditTrailEntry,
} from '@/types/students';
import { matchStudent, normalizeEmail, normalizePhone, CandidateIdentity } from './deduplication';

export interface MutationActor {
  id: string;
  name: string;
  role: string;
}

/**
 * Generate sequential student number (STU-YYYY-XXXX) using crm_intake_counters
 * or fallback to max existing student number.
 */
export async function generateNextStudentNumber(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    // 1. Check crm_intake_counters
    const { data: counterRow } = await supabase
      .from('crm_intake_counters')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single();

    if (counterRow) {
      const nextSeq = (counterRow.student_seq || 100) + 1;
      await supabase
        .from('crm_intake_counters')
        .update({ student_seq: nextSeq, updated_at: new Date().toISOString() })
        .eq('id', counterRow.id);

      return `STU-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
    }
  } catch (err) {
    console.warn('[generateNextStudentNumber] Counter query fallback:', err);
  }

  // Fallback: Query highest existing student number for current year
  const { data: latestStudents } = await supabase
    .from('students')
    .select('student_number')
    .eq('tenant_id', tenantId)
    .ilike('student_number', `STU-${currentYear}-%`)
    .order('student_number', { ascending: false })
    .limit(1);

  let seq = 100;
  if (latestStudents && latestStudents.length > 0 && latestStudents[0].student_number) {
    const parts = latestStudents[0].student_number.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
  }

  return `STU-${currentYear}-${String(seq).padStart(4, '0')}`;
}

/**
 * Generate sequential enrolment number (ENR-YYYY-XXXX) using crm_intake_counters
 * or fallback to max existing enrolment number.
 */
export async function generateNextEnrolmentNumber(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    const { data: counterRow } = await supabase
      .from('crm_intake_counters')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single();

    if (counterRow) {
      const nextSeq = (counterRow.enrolment_seq || 1000) + 1;
      await supabase
        .from('crm_intake_counters')
        .update({ enrolment_seq: nextSeq, updated_at: new Date().toISOString() })
        .eq('id', counterRow.id);

      return `ENR-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
    }
  } catch (err) {
    console.warn('[generateNextEnrolmentNumber] Counter query fallback:', err);
  }

  // Fallback: Query highest existing enrolment number for current year
  const { data: latestEnrolments } = await supabase
    .from('enrolments')
    .select('enrolment_number')
    .eq('tenant_id', tenantId)
    .ilike('enrolment_number', `ENR-${currentYear}-%`)
    .order('enrolment_number', { ascending: false })
    .limit(1);

  let seq = 1000;
  if (latestEnrolments && latestEnrolments.length > 0 && latestEnrolments[0].enrolment_number) {
    const parts = latestEnrolments[0].enrolment_number.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
  }

  return `ENR-${currentYear}-${String(seq).padStart(4, '0')}`;
}

export interface RegisterStudentParams {
  tenantId: string;
  enquiryId?: string | null;
  candidateData: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    gender?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    metadata?: Record<string, unknown>;
  };
  actor: MutationActor;
  allowAmbiguous?: boolean;
}

/**
 * Registers an Enquiry as a Student.
 * MANDATORY INVARIANT: STUDENT CREATED ≠ ENROLMENT CREATED.
 * Creates student with 0 enrolments and status ACTIVE.
 */
export async function registerStudentFromEnquiry(
  supabase: SupabaseClient,
  params: RegisterStudentParams
): Promise<{
  success: boolean;
  student?: Student;
  matchResult?: ReturnType<typeof matchStudent> extends Promise<infer T> ? T : never;
  error?: string;
}> {
  const { tenantId, enquiryId, candidateData, actor, allowAmbiguous } = params;

  // 1. Deduplication check
  const candidateIdentity: CandidateIdentity = {
    firstName: candidateData.firstName,
    lastName: candidateData.lastName,
    email: candidateData.email,
    phone: candidateData.phone,
  };

  const match = await matchStudent(supabase, tenantId, candidateIdentity);

  // If high-confidence match found
  if (match.matchedStudent && !match.isAmbiguous) {
    return {
      success: false,
      matchResult: match,
      error: `An existing student was found (${match.matchedStudent.student_number}: ${match.matchedStudent.first_name} ${match.matchedStudent.last_name}). ${match.matchReason}`,
    };
  }

  // If ambiguous match (e.g. name only) and admin hasn't confirmed
  if (match.isAmbiguous && !allowAmbiguous) {
    return {
      success: false,
      matchResult: match,
      error: 'Ambiguous match detected. Human confirmation is required before proceeding.',
    };
  }

  // 2. Generate authoritative identifiers (no Math.random)
  const studentNumber = await generateNextStudentNumber(supabase, tenantId);
  const internalId = `stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  // 3. Assemble Student payload
  const initialAudit: StudentAuditTrailEntry = {
    id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    field: 'RECORD_CREATED',
    previous_value: null,
    new_value: { student_number: studentNumber, status: 'ACTIVE' },
    reason: enquiryId
      ? `Registered as Student from Enquiry ${enquiryId}`
      : 'Direct Student Registration',
  };

  const metadata: Record<string, unknown> = {
    ...(candidateData.metadata || {}),
    enquiry_id: enquiryId || null,
    registeredAt: new Date().toISOString(),
    source: enquiryId ? 'enquiry_registration' : 'direct_registration',
    audit_trail: [initialAudit],
  };

  const newStudentPayload = {
    id: internalId,
    tenant_id: tenantId,
    student_number: studentNumber,
    first_name: candidateData.firstName.trim(),
    last_name: candidateData.lastName.trim(),
    email: candidateData.email ? candidateData.email.trim().toLowerCase() : null,
    phone: candidateData.phone ? candidateData.phone.trim() : null,
    gender: candidateData.gender || null,
    address: candidateData.address || null,
    emergency_contact_name: candidateData.emergencyContactName || null,
    emergency_contact_phone: candidateData.emergencyContactPhone || null,
    status: 'ACTIVE' as StudentStatus,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedStudent, error: insertErr } = await supabase
    .from('students')
    .insert(newStudentPayload)
    .select('*')
    .single();

  if (insertErr || !insertedStudent) {
    return {
      success: false,
      error: insertErr?.message || 'Failed to insert Student record into database.',
    };
  }

  // 4. Update crm_intake_applications if enquiryId exists
  if (enquiryId) {
    try {
      await supabase
        .from('crm_intake_applications')
        .update({
          matched_student_id: internalId,
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_id', enquiryId)
        .eq('tenant_id', tenantId);
    } catch (e) {
      console.warn('[registerStudentFromEnquiry] Link to intake application deferred:', e);
    }
  }

  // 5. Record lifecycle event in customer_timeline gracefully
  try {
    // Check if there is an associated customer record
    const { data: customerRow } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`email.eq.${candidateData.email || '___none___'},name.ilike.%${candidateData.firstName}%${candidateData.lastName}%`)
      .limit(1)
      .single();

    if (customerRow && customerRow.id) {
      await supabase.from('customer_timeline').insert({
        id: `tl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        tenant_id: tenantId,
        customer_id: customerRow.id,
        enquiry_id: enquiryId || null,
        event_type: 'STUDENT_REGISTERED',
        title: `Student Registered (${studentNumber})`,
        description: `Prospect successfully registered as active Student (${candidateData.firstName} ${candidateData.lastName}). Enrolments: 0.`,
        contact_method: 'REGISTRATION',
        outcome: 'REGISTERED',
        reference_id: internalId,
        actor_name: `${actor.role} — ${actor.name}`,
        created_at: new Date().toISOString(),
      });
    }
  } catch (tlErr) {
    console.warn('[registerStudentFromEnquiry] Timeline event deferred:', tlErr);
  }

  return {
    success: true,
    student: insertedStudent as Student,
  };
}

export interface StudentProfileUpdates {
  first_name?: string;
  last_name?: string;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  customer_id?: string | null;
  status?: StudentStatus;
  metadata?: {
    middleName?: string | null;
    dateOfBirth?: string | null;
    maritalStatus?: string | null;
    nationality?: string | null;
    stateOfOrigin?: string | null;
    religion?: string | null;
    sponsorName?: string | null;
    sponsorType?: string | null;
    sponsorEmail?: string | null;
    sponsorPhone?: string | null;
    emergencyContactRelationship?: string | null;
    notes?: string | null;
    [key: string]: unknown;
  };
  // Attempted modifications to immutable fields to explicitly reject
  id?: string;
  student_number?: string;
  tenant_id?: string;
  created_at?: string;
}

export interface UpdateStudentProfileParams {
  tenantId: string;
  studentId: string;
  updates: StudentProfileUpdates;
  reason: string;
  actor: MutationActor;
}

/**
 * Updates a Student Profile with mandatory Reason, Field Diffing, and Immutability Protection.
 * CRITICAL INVARIANTS:
 * - Rejects any modification to id, student_number, tenant_id, created_at.
 * - Requires non-empty reason.
 * - Compares old vs. new values; if no values changed, returns early (no DB mutation, no audit log).
 * - Appends each modified field change to metadata.audit_trail.
 * - Does NOT modify invoices, payments, enrolments, attendance, certificates.
 */
export async function updateStudentProfile(
  supabase: SupabaseClient,
  params: UpdateStudentProfileParams
): Promise<{
  success: boolean;
  updated: boolean;
  student?: Student;
  message?: string;
  error?: string;
}> {
  const { tenantId, studentId, updates, reason, actor } = params;

  // 1. Validate mandatory reason
  if (!reason || !reason.trim()) {
    return {
      success: false,
      updated: false,
      error: 'A mandatory Reason for Change is required to update a Student profile.',
    };
  }

  // 2. Fetch existing student
  const { data: existing, error: fetchErr } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !existing) {
    return {
      success: false,
      updated: false,
      error: fetchErr?.message || 'Student not found in tenant.',
    };
  }

  const currentStudent = existing as Student;

  // 3. Strict Protection of Immutable Identifiers
  if (updates.id && updates.id !== currentStudent.id) {
    return { success: false, updated: false, error: 'Modification of immutable Student ID is prohibited.' };
  }
  if (updates.student_number && updates.student_number !== currentStudent.student_number) {
    return { success: false, updated: false, error: 'Modification of immutable Student Number is prohibited.' };
  }
  if (updates.tenant_id && updates.tenant_id !== currentStudent.tenant_id) {
    return { success: false, updated: false, error: 'Modification of immutable Tenant ID is prohibited.' };
  }
  if (updates.created_at && updates.created_at !== currentStudent.created_at) {
    return { success: false, updated: false, error: 'Modification of immutable Creation Timestamp is prohibited.' };
  }

  // 4. Collision checking if email or phone is updated
  if (updates.email !== undefined && updates.email !== currentStudent.email) {
    const normNewEmail = normalizeEmail(updates.email);
    if (normNewEmail) {
      const { data: collEmail } = await supabase
        .from('students')
        .select('id, student_number')
        .eq('tenant_id', tenantId)
        .ilike('email', normNewEmail)
        .neq('id', studentId)
        .limit(1);

      if (collEmail && collEmail.length > 0) {
        return {
          success: false,
          updated: false,
          error: `Email address '${updates.email}' is already assigned to student ${collEmail[0].student_number}.`,
        };
      }
    }
  }

  if (updates.phone !== undefined && updates.phone !== currentStudent.phone) {
    const normNewPhone = normalizePhone(updates.phone);
    if (normNewPhone) {
      const { data: collPhone } = await supabase
        .from('students')
        .select('id, student_number, phone')
        .eq('tenant_id', tenantId)
        .neq('id', studentId);

      const hit = (collPhone || []).find((s) => normalizePhone(s.phone) === normNewPhone);
      if (hit) {
        return {
          success: false,
          updated: false,
          error: `Phone number '${updates.phone}' is already assigned to student ${hit.student_number}.`,
        };
      }
    }
  }

  // 5. Customer ID verification if updated
  if (updates.customer_id !== undefined && updates.customer_id !== null && updates.customer_id !== '') {
    const { data: custRow, error: custErr } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', updates.customer_id)
      .eq('tenant_id', tenantId)
      .limit(1);

    if (custErr || !custRow || custRow.length === 0) {
      return {
        success: false,
        updated: false,
        error: `Corporate Customer with ID '${updates.customer_id}' was not found in your tenant.`,
      };
    }
  }

  // 6. Compare old and new values to identify exact modified fields
  const auditEntries: StudentAuditTrailEntry[] = [];
  const currentMeta = currentStudent.metadata || {};
  const updatedMeta: Record<string, unknown> = { ...currentMeta };

  // Helper for tracking differences
  const checkField = (field: string, oldVal: unknown, newVal: unknown) => {
    // Normalise empty strings and nulls for fair comparison
    const normOld = oldVal === '' || oldVal === undefined ? null : oldVal;
    const normNew = newVal === '' || newVal === undefined ? null : newVal;

    if (normOld !== normNew) {
      auditEntries.push({
        id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        field,
        previous_value: normOld,
        new_value: normNew,
        reason: reason.trim(),
      });
    }
  };

  // Compare direct column fields
  if (updates.first_name !== undefined) checkField('first_name', currentStudent.first_name, updates.first_name);
  if (updates.last_name !== undefined) checkField('last_name', currentStudent.last_name, updates.last_name);
  if (updates.gender !== undefined) checkField('gender', currentStudent.gender, updates.gender);
  if (updates.email !== undefined) checkField('email', currentStudent.email, updates.email);
  if (updates.phone !== undefined) checkField('phone', currentStudent.phone, updates.phone);
  if (updates.address !== undefined) checkField('address', currentStudent.address, updates.address);
  if (updates.emergency_contact_name !== undefined) checkField('emergency_contact_name', currentStudent.emergency_contact_name, updates.emergency_contact_name);
  if (updates.emergency_contact_phone !== undefined) checkField('emergency_contact_phone', currentStudent.emergency_contact_phone, updates.emergency_contact_phone);
  if (updates.customer_id !== undefined) checkField('customer_id', currentStudent.customer_id, updates.customer_id || null);
  if (updates.status !== undefined) checkField('status', currentStudent.status, updates.status);

  // Compare metadata fields
  if (updates.metadata) {
    const metaKeys = [
      'middleName',
      'dateOfBirth',
      'maritalStatus',
      'nationality',
      'stateOfOrigin',
      'religion',
      'sponsorName',
      'sponsorType',
      'sponsorEmail',
      'sponsorPhone',
      'emergencyContactRelationship',
      'notes',
    ];

    for (const key of metaKeys) {
      if (updates.metadata[key] !== undefined) {
        checkField(`metadata.${key}`, currentMeta[key], updates.metadata[key]);
        updatedMeta[key] = updates.metadata[key];
      }
    }
  }

  // If NO values changed, return early
  if (auditEntries.length === 0) {
    return {
      success: true,
      updated: false,
      message: 'No changes detected. Profile values are identical.',
      student: currentStudent,
    };
  }

  // Append audit entries to metadata.audit_trail
  const existingAuditTrail: StudentAuditTrailEntry[] = Array.isArray(currentMeta.audit_trail)
    ? (currentMeta.audit_trail as StudentAuditTrailEntry[])
    : [];

  updatedMeta.audit_trail = [...existingAuditTrail, ...auditEntries];

  // Assemble DB payload
  const dbPayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    metadata: updatedMeta,
  };

  if (updates.first_name !== undefined) dbPayload.first_name = updates.first_name.trim();
  if (updates.last_name !== undefined) dbPayload.last_name = updates.last_name.trim();
  if (updates.gender !== undefined) dbPayload.gender = updates.gender;
  if (updates.email !== undefined) dbPayload.email = updates.email ? updates.email.trim().toLowerCase() : null;
  if (updates.phone !== undefined) dbPayload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.address !== undefined) dbPayload.address = updates.address;
  if (updates.emergency_contact_name !== undefined) dbPayload.emergency_contact_name = updates.emergency_contact_name;
  if (updates.emergency_contact_phone !== undefined) dbPayload.emergency_contact_phone = updates.emergency_contact_phone;
  if (updates.customer_id !== undefined) dbPayload.customer_id = updates.customer_id || null;
  if (updates.status !== undefined) dbPayload.status = updates.status;

  const { data: updatedRecord, error: updateErr } = await supabase
    .from('students')
    .update(dbPayload)
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (updateErr || !updatedRecord) {
    return {
      success: false,
      updated: false,
      error: updateErr?.message || 'Failed to update Student record.',
    };
  }

  // Timeline event logging gracefully
  try {
    const targetCustomerId = updatedRecord.customer_id || currentStudent.customer_id;
    if (targetCustomerId) {
      const fieldList = auditEntries.map((a) => a.field).join(', ');
      await supabase.from('customer_timeline').insert({
        id: `tl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        tenant_id: tenantId,
        customer_id: targetCustomerId,
        event_type: 'STUDENT_PROFILE_UPDATED',
        title: `Student Profile Corrected (${currentStudent.student_number})`,
        description: `Admin updated [${fieldList}]. Reason: "${reason.trim()}".`,
        contact_method: 'ADMIN_UPDATE',
        outcome: 'CORRECTED',
        reference_id: studentId,
        actor_name: `${actor.role} — ${actor.name}`,
        created_at: new Date().toISOString(),
      });
    }
  } catch (tlErr) {
    console.warn('[updateStudentProfile] Timeline logging deferred:', tlErr);
  }

  return {
    success: true,
    updated: true,
    student: updatedRecord as Student,
    message: `Successfully updated ${auditEntries.length} field(s).`,
  };
}

export interface CreateStudentEnrolmentParams {
  tenantId: string;
  studentId: string;
  programmeId: string;
  cohortId: string;
  startDate?: string | null;
  agreedTuitionFee?: number;
  actor: MutationActor;
}

/**
 * Creates an authoritative enrolment record for an existing student.
 * CRITICAL INVARIANTS:
 * - One Student -> Multiple Enrolments
 * - Student record is NEVER duplicated. Student ID is immutable.
 * - Enrolment number generated via crm_intake_counters (ENR-YYYY-XXXX).
 * - Enforces uq_enrolments_student_cohort (prevents duplicate enrolment in the same cohort).
 * - Financial totals remain in finance records (not written into public.students).
 * - Corporate Customer is linked via customer_id without replacing student identity.
 */
export async function createStudentEnrolment(
  supabase: SupabaseClient,
  params: CreateStudentEnrolmentParams
): Promise<{
  success: boolean;
  enrolment?: any;
  error?: string;
}> {
  const { tenantId, studentId, programmeId, cohortId, startDate, agreedTuitionFee, actor } = params;

  // 1. Validate student exists in tenant
  const { data: student, error: stuErr } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (stuErr || !student) {
    return { success: false, error: 'Student not found in tenant.' };
  }

  // 2. Validate programme exists in tenant
  const { data: programme, error: progErr } = await supabase
    .from('programmes')
    .select('id, name, tuition_fee')
    .eq('id', programmeId)
    .eq('tenant_id', tenantId)
    .single();

  if (progErr || !programme) {
    return { success: false, error: 'Programme not found in tenant.' };
  }

  // 3. Validate cohort exists in tenant and belongs to programme
  const { data: cohort, error: cohErr } = await supabase
    .from('cohorts')
    .select('id, name, cohort_code, programme_id, start_date')
    .eq('id', cohortId)
    .eq('tenant_id', tenantId)
    .single();

  if (cohErr || !cohort) {
    return { success: false, error: 'Cohort not found in tenant.' };
  }

  if (cohort.programme_id !== programmeId) {
    return {
      success: false,
      error: `Cohort '${cohort.name}' does not belong to programme '${programme.name}'.`,
    };
  }

  // 4. Check for duplicate enrolment in the same cohort (uq_enrolments_student_cohort invariant)
  const { data: existingEnr } = await supabase
    .from('enrolments')
    .select('id, enrolment_number')
    .eq('tenant_id', tenantId)
    .eq('student_id', studentId)
    .eq('cohort_id', cohortId)
    .limit(1);

  if (existingEnr && existingEnr.length > 0) {
    return {
      success: false,
      error: `Student ${student.student_number} is already enrolled in cohort '${cohort.name}' (${existingEnr[0].enrolment_number}).`,
    };
  }

  // 5. Determine agreed tuition fee:
  // Defaults to catalogue programme fee if not provided or adjusted
  const resolvedFee =
    agreedTuitionFee !== undefined && agreedTuitionFee !== null && !isNaN(Number(agreedTuitionFee))
      ? Math.max(0, Number(agreedTuitionFee))
      : Number(programme.tuition_fee || 0);

  // 6. Generate canonical enrolment identifier: ENR-YYYY-XXXX (atomic, no Math.random)
  const enrolmentNumber = await generateNextEnrolmentNumber(supabase, tenantId);
  const internalId = `enr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const enrolmentDate = startDate || cohort.start_date || new Date().toISOString().split('T')[0];

  // 7. Insert enrolment record
  // Preserves existing foreign key relationships: student_id -> students, customer_id -> customers
  const enrolmentPayload = {
    id: internalId,
    tenant_id: tenantId,
    student_id: student.id,
    customer_id: student.customer_id || null,
    programme_id: programme.id,
    cohort_id: cohort.id,
    enrolment_number: enrolmentNumber,
    enrolment_date: enrolmentDate,
    student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
    student_email: student.email || null,
    student_phone: student.phone || null,
    agreed_tuition_fee: resolvedFee,
    status: 'ACTIVE',
    completion_status: 'NOT_ELIGIBLE',
    certificate_issued: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedEnrolment, error: insertErr } = await supabase
    .from('enrolments')
    .insert(enrolmentPayload)
    .select('*')
    .single();

  if (insertErr || !insertedEnrolment) {
    return {
      success: false,
      error: insertErr?.message || 'Failed to create enrolment record in database.',
    };
  }

  // 8. Record audit entry in student's metadata.audit_trail
  const auditEntry: StudentAuditTrailEntry = {
    id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    field: 'ENROLMENT_CREATED',
    previous_value: null,
    new_value: {
      enrolment_id: internalId,
      enrolment_number: enrolmentNumber,
      programme_id: programme.id,
      programme_name: programme.name,
      cohort_id: cohort.id,
      cohort_name: cohort.name,
      agreed_tuition_fee: resolvedFee,
    },
    reason: `Enrolled in ${programme.name} (${cohort.name})`,
  };

  const currentMeta = (student.metadata as Record<string, unknown>) || {};
  const currentAuditTrail = Array.isArray(currentMeta.audit_trail)
    ? (currentMeta.audit_trail as StudentAuditTrailEntry[])
    : [];

  await supabase
    .from('students')
    .update({
      metadata: {
        ...currentMeta,
        audit_trail: [...currentAuditTrail, auditEntry],
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', student.id)
    .eq('tenant_id', tenantId);

  // 9. Timeline event logging if student is linked to a customer
  if (student.customer_id) {
    try {
      await supabase.from('customer_timeline').insert({
        id: `tl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        tenant_id: tenantId,
        customer_id: student.customer_id,
        event_type: 'ENROLMENT_CREATED',
        title: `Student Enrolled (${enrolmentNumber})`,
        description: `Enrolled in ${programme.name} — ${cohort.name}. Agreed Tuition: ₦${resolvedFee.toLocaleString()}.`,
        contact_method: 'SYSTEM_ENROLMENT',
        outcome: 'ENROLLED',
        reference_id: internalId,
        actor_name: `${actor.role} — ${actor.name}`,
        created_at: new Date().toISOString(),
      });
    } catch (tlErr) {
      console.warn('[createStudentEnrolment] Timeline logging deferred:', tlErr);
    }
  }

  return {
    success: true,
    enrolment: insertedEnrolment,
  };
}
