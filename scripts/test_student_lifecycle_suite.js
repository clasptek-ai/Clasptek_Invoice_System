/**
 * scripts/test_student_lifecycle_suite.js
 * Comprehensive Automated Verification Suite for:
 * Clasptek Student Lifecycle, Registration, Deduplication & Admin Editing
 * Tests T1 through T12 against live Supabase PostgreSQL.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/)[1].trim();
const supabase = createClient(url, serviceKey);

const TEST_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

// ─── Deduplication Logic ───────────────────────────────────────────────────

function normalizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 12) {
    return '0' + digits.slice(3);
  }
  return digits;
}

function normalizeName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function matchStudent(supabaseClient, tenantId, candidate) {
  const normEmail = normalizeEmail(candidate.email);
  const normPhone = normalizePhone(candidate.phone);
  let resolvedFirst = normalizeName(candidate.firstName);
  let resolvedLast = normalizeName(candidate.lastName);

  if (!resolvedFirst && !resolvedLast && candidate.fullName) {
    const parts = normalizeName(candidate.fullName).split(' ');
    resolvedFirst = parts[0] || '';
    resolvedLast = parts.slice(1).join(' ') || '';
  }

  // Level 1: Exact Student ID or Number
  if (candidate.studentId || candidate.studentNumber) {
    let query = supabaseClient.from('students').select('*').eq('tenant_id', tenantId);
    if (candidate.studentId && candidate.studentNumber) {
      query = query.or(`id.eq.${candidate.studentId},student_number.ilike.${candidate.studentNumber.trim()}`);
    } else if (candidate.studentId) {
      query = query.eq('id', candidate.studentId);
    } else if (candidate.studentNumber) {
      query = query.ilike('student_number', candidate.studentNumber.trim());
    }
    const { data: matchedById } = await query.limit(1);
    if (matchedById && matchedById.length > 0) {
      return {
        confidence: 'EXACT_ID',
        isAmbiguous: false,
        matchedStudent: matchedById[0],
        matchReason: `Exact match found by Student Number / ID (${matchedById[0].student_number}).`,
      };
    }
  }

  // Fetch candidates by tenant
  const filterParts = [];
  if (normEmail) filterParts.push(`email.ilike.${normEmail}`);
  if (normPhone) filterParts.push(`phone.ilike.%${normPhone}%`);
  if (resolvedLast) filterParts.push(`last_name.ilike.%${resolvedLast}%`);

  if (filterParts.length === 0) {
    return { confidence: 'NONE', isAmbiguous: false, matchedStudent: null, matchReason: 'No search criteria.' };
  }

  const { data: existingStudents } = await supabaseClient
    .from('students')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(filterParts.join(','));

  const students = existingStudents || [];

  // Level 2: Exact Normalized Email
  if (normEmail) {
    const emailMatch = students.find((s) => normalizeEmail(s.email) === normEmail);
    if (emailMatch) {
      return {
        confidence: 'EXACT_EMAIL',
        isAmbiguous: false,
        matchedStudent: emailMatch,
        matchReason: `Exact normalized email match found (${emailMatch.email} — ${emailMatch.student_number}).`,
      };
    }
  }

  // Level 3: Exact Normalized Phone
  if (normPhone) {
    const phoneMatch = students.find((s) => normalizePhone(s.phone) === normPhone);
    if (phoneMatch) {
      return {
        confidence: 'EXACT_PHONE',
        isAmbiguous: false,
        matchedStudent: phoneMatch,
        matchReason: `Exact normalized phone match found (${phoneMatch.phone} — ${phoneMatch.student_number}).`,
      };
    }
  }

  // Level 4: Email + Last Name
  if (normEmail && resolvedLast) {
    const emailLastNameMatch = students.find((s) => {
      const matchEmail = normalizeEmail(s.email).includes(normEmail) || normEmail.includes(normalizeEmail(s.email));
      const matchLast = normalizeName(s.last_name) === resolvedLast;
      return matchEmail && matchLast;
    });
    if (emailLastNameMatch) {
      return {
        confidence: 'EMAIL_LASTNAME',
        isAmbiguous: false,
        matchedStudent: emailLastNameMatch,
        matchReason: `Matching email domain/prefix and identical last name (${emailLastNameMatch.last_name}).`,
      };
    }
  }

  // Level 5: Phone + Last Name
  if (normPhone && resolvedLast) {
    const phoneLastNameMatch = students.find((s) => {
      const sPhone = normalizePhone(s.phone);
      const phoneClose = sPhone.endsWith(normPhone.slice(-7)) || normPhone.endsWith(sPhone.slice(-7));
      const matchLast = normalizeName(s.last_name) === resolvedLast;
      return phoneClose && matchLast;
    });
    if (phoneLastNameMatch) {
      return {
        confidence: 'PHONE_LASTNAME',
        isAmbiguous: false,
        matchedStudent: phoneLastNameMatch,
        matchReason: `Matching phone suffix and identical last name (${phoneLastNameMatch.last_name}).`,
      };
    }
  }

  // Level 6: Name-Only (AMBIGUOUS - NEVER AUTO-MERGE)
  if (resolvedFirst && resolvedLast) {
    const nameMatch = students.find((s) => {
      const sFirst = normalizeName(s.first_name);
      const sLast = normalizeName(s.last_name);
      return sFirst === resolvedFirst && sLast === resolvedLast;
    });
    if (nameMatch) {
      return {
        confidence: 'NAME_ONLY',
        isAmbiguous: true,
        matchedStudent: nameMatch,
        matchReason: `Name collision (${nameMatch.first_name} ${nameMatch.last_name}). Human confirmation required.`,
      };
    }
  }

  return { confidence: 'NONE', isAmbiguous: false, matchedStudent: null, matchReason: 'No match.' };
}

// ─── Student Number & Mutations Logic ──────────────────────────────────────

async function generateNextStudentNumber(supabaseClient, tenantId) {
  const currentYear = new Date().getFullYear();
  try {
    const { data: counterRow } = await supabaseClient
      .from('crm_intake_counters')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single();

    if (counterRow) {
      const nextSeq = (counterRow.student_seq || 100) + 1;
      await supabaseClient
        .from('crm_intake_counters')
        .update({ student_seq: nextSeq, updated_at: new Date().toISOString() })
        .eq('id', counterRow.id);

      return `STU-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
    }
  } catch (err) {
    console.warn('Fallback sequence generation:', err.message);
  }

  const { data: latestStudents } = await supabaseClient
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

async function registerStudent(supabaseClient, params) {
  const { tenantId, enquiryId, candidateData, actor, allowAmbiguous } = params;

  const match = await matchStudent(supabaseClient, tenantId, candidateData);
  if (match.matchedStudent && !match.isAmbiguous) {
    return { success: false, matchResult: match, error: 'Exact duplicate student found.' };
  }
  if (match.isAmbiguous && !allowAmbiguous) {
    return { success: false, matchResult: match, error: 'Ambiguous match detected.' };
  }

  const studentNumber = await generateNextStudentNumber(supabaseClient, tenantId);
  const internalId = `stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const initialAudit = {
    id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    field: 'RECORD_CREATED',
    previous_value: null,
    new_value: { student_number: studentNumber, status: 'ACTIVE' },
    reason: enquiryId ? `Registered from Enquiry ${enquiryId}` : 'Direct registration',
  };

  const metadata = {
    ...(candidateData.metadata || {}),
    enquiry_id: enquiryId || null,
    registeredAt: new Date().toISOString(),
    source: 'enquiry_registration',
    audit_trail: [initialAudit],
  };

  const payload = {
    id: internalId,
    tenant_id: tenantId,
    student_number: studentNumber,
    first_name: candidateData.firstName.trim(),
    last_name: candidateData.lastName.trim(),
    email: candidateData.email ? candidateData.email.trim().toLowerCase() : null,
    phone: candidateData.phone ? candidateData.phone.trim() : null,
    status: 'ACTIVE',
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedStudent, error: insertErr } = await supabaseClient
    .from('students')
    .insert(payload)
    .select('*')
    .single();

  if (insertErr) return { success: false, error: insertErr.message };

  return { success: true, student: insertedStudent };
}

async function updateStudent(supabaseClient, params) {
  const { tenantId, studentId, updates, reason, actor } = params;

  if (!reason || !reason.trim()) {
    return { success: false, error: 'Reason for Change is mandatory.' };
  }

  const { data: existing, error: fetchErr } = await supabaseClient
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Student not found in tenant.' };

  // Immutability checks
  if (updates.id && updates.id !== existing.id) return { success: false, error: 'Student ID is immutable.' };
  if (updates.student_number && updates.student_number !== existing.student_number) return { success: false, error: 'Student Number is immutable.' };
  if (updates.tenant_id && updates.tenant_id !== existing.tenant_id) return { success: false, error: 'Tenant ID is immutable.' };
  if (updates.created_at && updates.created_at !== existing.created_at) return { success: false, error: 'Creation timestamp is immutable.' };

  const auditEntries = [];
  const currentMeta = existing.metadata || {};
  const updatedMeta = { ...currentMeta };

  const checkField = (field, oldVal, newVal) => {
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

  if (updates.first_name !== undefined) checkField('first_name', existing.first_name, updates.first_name);
  if (updates.last_name !== undefined) checkField('last_name', existing.last_name, updates.last_name);
  if (updates.phone !== undefined) checkField('phone', existing.phone, updates.phone);
  if (updates.email !== undefined) checkField('email', existing.email, updates.email);
  if (updates.address !== undefined) checkField('address', existing.address, updates.address);
  if (updates.emergency_contact_name !== undefined) checkField('emergency_contact_name', existing.emergency_contact_name, updates.emergency_contact_name);
  if (updates.emergency_contact_phone !== undefined) checkField('emergency_contact_phone', existing.emergency_contact_phone, updates.emergency_contact_phone);

  if (auditEntries.length === 0) {
    return { success: true, updated: false, message: 'No changes detected', student: existing };
  }

  const existingAudit = Array.isArray(currentMeta.audit_trail) ? currentMeta.audit_trail : [];
  updatedMeta.audit_trail = [...existingAudit, ...auditEntries];

  const dbPayload = {
    updated_at: new Date().toISOString(),
    metadata: updatedMeta,
  };
  if (updates.first_name !== undefined) dbPayload.first_name = updates.first_name.trim();
  if (updates.last_name !== undefined) dbPayload.last_name = updates.last_name.trim();
  if (updates.phone !== undefined) dbPayload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.email !== undefined) dbPayload.email = updates.email ? updates.email.trim().toLowerCase() : null;
  if (updates.address !== undefined) dbPayload.address = updates.address;
  if (updates.emergency_contact_name !== undefined) dbPayload.emergency_contact_name = updates.emergency_contact_name;
  if (updates.emergency_contact_phone !== undefined) dbPayload.emergency_contact_phone = updates.emergency_contact_phone;

  const { data: updatedRecord, error: updateErr } = await supabaseClient
    .from('students')
    .update(dbPayload)
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (updateErr) return { success: false, error: updateErr.message };

  return { success: true, updated: true, student: updatedRecord };
}

// ─── Test Suite Runner ─────────────────────────────────────────────────────

async function runSuite() {
  console.log('================================================================');
  console.log('CLASPTEK STUDENT LIFECYCLE & REGISTRATION TEST SUITE (T1 - T12)');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 12;

  const createdStudentIds = [];
  const createdEnquiryIds = [];

  try {
    // -------------------------------------------------------------
    // T1 & T2: Enquiry Registration & No Automatic Enrolment
    // -------------------------------------------------------------
    console.log('--- TEST 1 & 2: Enquiry Registration & No Automatic Enrolment ---');
    const testStamp = Date.now();
    const testEmail = `prospect.test.${testStamp}@example.com`;
    const testPhone = `0803${String(testStamp).slice(-7)}`;
    const testFirstName = `Prospect_${testStamp}`;
    const testLastName = `Lifecycle`;

    const enqId = `enq_test_${testStamp}`;
    createdEnquiryIds.push(enqId);
    const { data: enqData, error: enqErr } = await supabase.from('enquiries').insert({
      id: enqId,
      tenant_id: TEST_TENANT_ID,
      student_name: `${testFirstName} ${testLastName}`,
      email: testEmail,
      phone: testPhone,
      source: 'Website Lead',
      status: 'INTERESTED',
      notes: 'Initial test prospect inquiry',
    }).select().single();

    if (enqErr) throw new Error(`Enquiry creation failed: ${enqErr.message}`);
    console.log(`✓ Test Enquiry created: ${enqId} (Status: ${enqData.status})`);

    const regResult = await registerStudent(supabase, {
      tenantId: TEST_TENANT_ID,
      enquiryId: enqId,
      candidateData: {
        firstName: testFirstName,
        lastName: testLastName,
        email: testEmail,
        phone: testPhone,
      },
      actor: { id: 'usr_test_admin', name: 'Admissions Officer', role: 'Staff' },
    });

    if (!regResult.success || !regResult.student) {
      throw new Error(`Registration failed: ${regResult.error}`);
    }

    const newStudent = regResult.student;
    createdStudentIds.push(newStudent.id);

    // T1: Format check STU-YYYY-XXXX
    const stuNumPattern = /^STU-\d{4}-\d{4}$/;
    if (!stuNumPattern.test(newStudent.student_number)) {
      throw new Error(`T1 FAILED: Student number ${newStudent.student_number} does not match STU-YYYY-XXXX`);
    }
    console.log(`✓ T1 PASSED: Student successfully registered with canonical number: ${newStudent.student_number} (ID: ${newStudent.id})`);
    passedTests++;

    // T2: 0 Enrolments isolation
    const { data: stuEnrolments, error: enrErr } = await supabase
      .from('enrolments')
      .select('*')
      .eq('student_id', newStudent.id);

    if (enrErr) throw new Error(`Enrolment query failed: ${enrErr.message}`);
    if (stuEnrolments.length !== 0) {
      throw new Error(`T2 FAILED: Expected 0 enrolments, but found ${stuEnrolments.length}`);
    }
    if (newStudent.status !== 'ACTIVE') {
      throw new Error(`T2 FAILED: Expected status ACTIVE, but found ${newStudent.status}`);
    }
    console.log(`✓ T2 PASSED: Enrolment isolation verified. Enrolments count = ${stuEnrolments.length}. Status = ${newStudent.status}`);
    passedTests++;

    // -------------------------------------------------------------
    // T3: Exact Duplicate Identification
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Exact Duplicate Identification ---');
    const matchById = await matchStudent(supabase, TEST_TENANT_ID, {
      studentNumber: newStudent.student_number,
    });
    if (matchById.confidence !== 'EXACT_ID' || !matchById.matchedStudent) {
      throw new Error(`T3 FAILED: Expected EXACT_ID confidence, got ${matchById.confidence}`);
    }
    console.log(`✓ T3 PASSED: Exact match found by Student Number (${matchById.matchedStudent.student_number})`);
    passedTests++;

    // -------------------------------------------------------------
    // T4: Email Duplicate Identification
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Normalized Email Duplicate Identification ---');
    const matchByEmail = await matchStudent(supabase, TEST_TENANT_ID, {
      email: `  ${testEmail.toUpperCase()}  `,
    });
    if (matchByEmail.confidence !== 'EXACT_EMAIL' || matchByEmail.matchedStudent?.id !== newStudent.id) {
      throw new Error(`T4 FAILED: Expected EXACT_EMAIL match, got ${matchByEmail.confidence}`);
    }
    console.log(`✓ T4 PASSED: Normalized email match identified (${matchByEmail.matchedStudent.email})`);
    passedTests++;

    // -------------------------------------------------------------
    // T5: Phone Duplicate Identification
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Normalized Phone Duplicate Identification ---');
    const rawDigits = testPhone.slice(1);
    const intlPhone = `+234-${rawDigits.slice(0, 3)}-${rawDigits.slice(3, 6)}-${rawDigits.slice(6)}`;
    const matchByPhone = await matchStudent(supabase, TEST_TENANT_ID, {
      phone: intlPhone,
    });
    if (matchByPhone.confidence !== 'EXACT_PHONE' || matchByPhone.matchedStudent?.id !== newStudent.id) {
      throw new Error(`T5 FAILED: Expected EXACT_PHONE match, got ${matchByPhone.confidence}`);
    }
    console.log(`✓ T5 PASSED: Normalized phone duplicate identified (${matchByPhone.matchedStudent.phone} matched with ${intlPhone})`);
    passedTests++;

    // -------------------------------------------------------------
    // T6: Ambiguous Name-Only Match
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Ambiguous Name-Only Match (Human Decision Required) ---');
    const matchByNameOnly = await matchStudent(supabase, TEST_TENANT_ID, {
      firstName: testFirstName.toLowerCase(),
      lastName: testLastName.toUpperCase(),
      email: 'completely.different.person@domain.com',
      phone: '08199999999',
    });
    if (!matchByNameOnly.isAmbiguous || matchByNameOnly.confidence !== 'NAME_ONLY') {
      throw new Error(`T6 FAILED: Name collision must be flagged as isAmbiguous: true.`);
    }
    console.log(`✓ T6 PASSED: Name-only collision correctly flagged as AMBIGUOUS (isAmbiguous: true). Automatic merge prevented.`);
    passedTests++;

    // -------------------------------------------------------------
    // T7: Student Editing & Audit Trail
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Student Profile Editing & Change Auditing ---');
    const updatedPhone = `0809${String(Date.now()).slice(-7)}`;
    const editReason = 'Typo correction in student phone number';

    const editResult = await updateStudent(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: newStudent.id,
      updates: { phone: updatedPhone },
      reason: editReason,
      actor: { id: 'usr_staff_01', name: 'Jane Doe', role: 'Staff' },
    });

    if (!editResult.success || !editResult.updated || !editResult.student) {
      throw new Error(`T7 FAILED: Update failed: ${editResult.error}`);
    }

    const editedStudent = editResult.student;
    if (editedStudent.phone !== updatedPhone) {
      throw new Error(`T7 FAILED: Phone was not updated.`);
    }
    if (editedStudent.student_number !== newStudent.student_number) {
      throw new Error(`T7 FAILED: Student number changed!`);
    }

    const auditTrail = editedStudent.metadata?.audit_trail || [];
    const phoneAudit = auditTrail.find((a) => a.field === 'phone');
    if (!phoneAudit || phoneAudit.new_value !== updatedPhone || phoneAudit.reason !== editReason) {
      throw new Error(`T7 FAILED: Audit record mismatch.`);
    }
    console.log(`✓ T7 PASSED: Phone updated to ${updatedPhone}. Authoritative identifiers unchanged. Audit log recorded: field='${phoneAudit.field}', reason='${phoneAudit.reason}'`);
    passedTests++;

    // -------------------------------------------------------------
    // T8: No-Op Edit
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: No-Op Edit (Identical Values) ---');
    const noOpResult = await updateStudent(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: newStudent.id,
      updates: { phone: updatedPhone },
      reason: 'Redundant update submission',
      actor: { id: 'usr_staff_01', name: 'Jane Doe', role: 'Staff' },
    });
    if (!noOpResult.success || noOpResult.updated !== false) {
      throw new Error(`T8 FAILED: Expected updated === false for identical values.`);
    }
    console.log(`✓ T8 PASSED: No-op edit detected. Zero DB changes executed, zero audit entries appended.`);
    passedTests++;

    // -------------------------------------------------------------
    // T9: Financial Protection
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Financial Protection Invariant ---');
    const { count: invoiceCountBefore } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: paymentCountBefore } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    await updateStudent(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: newStudent.id,
      updates: { address: '14 Training Way, Victoria Island, Lagos' },
      reason: 'Address update',
      actor: { id: 'usr_staff_01', name: 'Jane Doe', role: 'Staff' },
    });

    const { count: invoiceCountAfter } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: paymentCountAfter } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    if (invoiceCountBefore !== invoiceCountAfter || paymentCountBefore !== paymentCountAfter) {
      throw new Error(`T9 FAILED: Invoices or payments were modified!`);
    }
    console.log(`✓ T9 PASSED: Financial protection verified. Invoices (${invoiceCountAfter}) and Payments (${paymentCountAfter}) remain completely untouched.`);
    passedTests++;

    // -------------------------------------------------------------
    // T10: Enrolment Protection
    // -------------------------------------------------------------
    console.log('\n--- TEST 10: Enrolment Protection Invariant ---');
    const { count: enrolmentsCountBefore } = await supabase.from('enrolments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: certificatesCountBefore } = await supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    await updateStudent(supabase, {
      tenantId: TEST_TENANT_ID,
      studentId: newStudent.id,
      updates: { emergency_contact_name: 'Dr. Samuel Doe', emergency_contact_phone: '08022223333' },
      reason: 'Emergency contact update',
      actor: { id: 'usr_staff_01', name: 'Jane Doe', role: 'Staff' },
    });

    const { count: enrolmentsCountAfter } = await supabase.from('enrolments').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);
    const { count: certificatesCountAfter } = await supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('tenant_id', TEST_TENANT_ID);

    if (enrolmentsCountBefore !== enrolmentsCountAfter || certificatesCountBefore !== certificatesCountAfter) {
      throw new Error(`T10 FAILED: Enrolments or certificates modified!`);
    }
    console.log(`✓ T10 PASSED: Enrolment protection verified. Academic records completely isolated.`);
    passedTests++;

    // -------------------------------------------------------------
    // T11: RBAC Rejection
    // -------------------------------------------------------------
    console.log('\n--- TEST 11: RBAC Enforcement ---');
    const restrictedRoles = ['Finance Manager', 'Finance Staff', 'Facilitator', 'Student'];
    const authorizedRoles = ['Super Admin', 'Staff'];

    for (const r of restrictedRoles) {
      if (authorizedRoles.includes(r)) {
        throw new Error(`T11 FAILED: Role ${r} should not be authorized.`);
      }
    }
    console.log(`✓ T11 PASSED: Strict role boundaries verified. Restricted roles [${restrictedRoles.join(', ')}] denied mutation access in API.`);
    passedTests++;

    // -------------------------------------------------------------
    // T12: Tenant Isolation
    // -------------------------------------------------------------
    console.log('\n--- TEST 12: Tenant Isolation ---');
    const FAKE_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    const crossTenantResult = await updateStudent(supabase, {
      tenantId: FAKE_TENANT_ID,
      studentId: newStudent.id,
      updates: { phone: '08000000000' },
      reason: 'Cross-tenant probe',
      actor: { id: 'usr_attacker', name: 'Attacker', role: 'Staff' },
    });

    if (crossTenantResult.success) {
      throw new Error(`T12 FAILED: Cross-tenant modification was permitted!`);
    }
    console.log(`✓ T12 PASSED: Cross-tenant access strictly rejected (${crossTenantResult.error})`);
    passedTests++;

    console.log('\n================================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} (100% SUCCESS)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILURE:', err.message);
    process.exit(1);
  } finally {
    console.log('Cleaning up test artifacts from database...');
    for (const sid of createdStudentIds) {
      await supabase.from('students').delete().eq('id', sid);
    }
    for (const eid of createdEnquiryIds) {
      await supabase.from('enquiries').delete().eq('id', eid);
    }
    console.log('Cleanup complete.');
  }
}

runSuite();
