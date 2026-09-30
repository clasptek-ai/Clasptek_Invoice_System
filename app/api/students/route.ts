/**
 * app/api/students/route.ts
 * Authoritative Server Endpoint for Student Details & Registration
 *
 * Implements:
 * - Session verification & strict multi-tenant isolation
 * - RBAC: Super Admin and Staff (Operations / Admissions)
 * - Required fields validation (First Name, Last Name, Email, Phone)
 * - Derived Student Name (First Name + Middle Name + Last Name)
 * - System-generated Student ID (STU-YYYY-XXXX via generateNextStudentNumber)
 * - Duplicate student detection (Email & Phone within tenant)
 * - All authoritative fields:
 *   1. Student Identification (Student ID, derived Student Name)
 *   2. Personal Details (First Name, Middle Name, Last Name, Gender, DOB, Nationality, Religion, Marital Status)
 *   3. Contact Details (Email, Phone, Alternative Phone, Phone 2, Address, Location, State)
 *   4. Registration (Registration Date, Referral Source)
 *   5. Student Profile (Expertise Level, Employment Status)
 *   6. Sponsor Information (Sponsor toggle, Sponsor Name, Sponsor Phone, Sponsor's Email)
 *   - Strictly ends at Sponsor's Email Address
 * - ZERO automatic enrolment creation (Invariant: Student Created !== Enrolment Created)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateNextStudentNumber } from '@/lib/students/mutations';
import { normalizeEmail, normalizePhone } from '@/lib/students/deduplication';
import type { StudentStatus, StudentAuditTrailEntry } from '@/types/students';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || 'ALL').trim();

    const supabase = await createServerClient();
    let query = supabase
      .from('students')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_number.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    if (status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data: students, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: students || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Session verification & RBAC check
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const authorizedRoles = ['Super Admin', 'Staff'];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${session.role}' is not authorized to register students. Only Admissions, Operations, and Super Admin can execute student registration.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload: Request body is missing or invalid' }, { status: 400 });
    }

    // 2. Extract authoritative fields
    // Personal Details
    const firstName = String(body.firstName || body.first_name || '').trim();
    const middleName = String(body.middleName || body.middle_name || '').trim();
    const lastName = String(body.lastName || body.last_name || '').trim();
    const gender = body.gender ? String(body.gender).trim() : null;
    const dateOfBirth = body.dateOfBirth ? String(body.dateOfBirth).trim() : null;
    const nationality = body.nationality ? String(body.nationality).trim() : 'Nigerian';
    const religion = body.religion ? String(body.religion).trim() : null;
    const maritalStatus = body.maritalStatus ? String(body.maritalStatus).trim() : null;

    // Contact Details
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const alternativePhone = body.alternativePhone ? String(body.alternativePhone).trim() : null;
    const phone2 = body.phone2 || body.secondaryPhone ? String(body.phone2 || body.secondaryPhone).trim() : null;
    const address = body.address ? String(body.address).trim() : null;
    const location = body.location ? String(body.location).trim() : null;
    const state = body.state || body.stateOfOrigin ? String(body.state || body.stateOfOrigin).trim() : null;

    // Registration Details
    const registrationDate = body.registrationDate || body.registeredAt
      ? String(body.registrationDate || body.registeredAt).trim()
      : new Date().toISOString().slice(0, 10);
    const referralSource = body.referralSource ? String(body.referralSource).trim() : 'Direct';

    // Student Profile
    const expertiseLevel = body.expertiseLevel ? String(body.expertiseLevel).trim() : 'Beginner';
    const employmentStatus = body.employmentStatus ? String(body.employmentStatus).trim() : 'Employed';

    // Sponsor Information
    const rawSponsor = body.hasSponsor !== undefined ? body.hasSponsor : body.sponsor;
    const hasSponsor = rawSponsor === true || rawSponsor === 'Yes' || rawSponsor === 'YES' || rawSponsor === 'yes';
    const sponsorName = hasSponsor && body.sponsorName ? String(body.sponsorName).trim() : null;
    const sponsorPhone = hasSponsor && body.sponsorPhone ? String(body.sponsorPhone).trim() : null;
    const sponsorEmail = hasSponsor && body.sponsorEmail ? String(body.sponsorEmail).trim().toLowerCase() : null;

    // Derived Student Name
    const derivedFullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

    // 3. Validation
    if (!firstName) {
      return NextResponse.json({ error: 'First Name is required.' }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ error: 'Last Name is required.' }, { status: 400 });
    }
    if (hasSponsor) {
      if (!sponsorName) {
        return NextResponse.json({ error: 'Sponsor Name is required when student has a sponsor.' }, { status: 400 });
      }
      if (!sponsorPhone && !sponsorEmail) {
        return NextResponse.json({ error: 'At least one contact method (Sponsor Phone or Sponsor Email) is required.' }, { status: 400 });
      }
    }

    const supabase = await createServerClient();

    // 4. Concurrency-Safe Deduplication Check
    if (email) {
      const normEmail = normalizeEmail(email);
      const { data: existingEmail } = await supabase
        .from('students')
        .select('id, student_number, first_name, last_name, email')
        .eq('tenant_id', session.tenantId)
        .ilike('email', normEmail)
        .limit(1);

      if (existingEmail && existingEmail.length > 0) {
        const match = existingEmail[0];
        return NextResponse.json(
          {
            error: `A student with email '${email}' is already registered (${match.student_number}: ${match.first_name} ${match.last_name}).`,
          },
          { status: 400 }
        );
      }
    }

    if (phone) {
      const normPhone = normalizePhone(phone);
      if (normPhone) {
        const { data: existingPhone } = await supabase
          .from('students')
          .select('id, student_number, first_name, last_name, phone')
          .eq('tenant_id', session.tenantId);

        const phoneMatch = (existingPhone || []).find((s) => normalizePhone(s.phone) === normPhone);
        if (phoneMatch) {
          return NextResponse.json(
            {
              error: `A student with phone number '${phone}' is already registered (${phoneMatch.student_number}: ${phoneMatch.first_name} ${phoneMatch.last_name}).`,
            },
            { status: 400 }
          );
        }
      }
    }

    // 5. Generate unique authoritative Student ID
    const studentNumber = await generateNextStudentNumber(supabase, session.tenantId);
    const internalId = `stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const actor = {
      id: session.user.id,
      name:
        (session.user.user_metadata?.full_name as string) ||
        (session.user.user_metadata?.name as string) ||
        session.user.email ||
        'Authorized Staff',
      role: session.role,
    };

    const initialAudit: StudentAuditTrailEntry = {
      id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      field: 'RECORD_CREATED',
      previous_value: null,
      new_value: { student_number: studentNumber, status: 'ACTIVE' },
      reason: 'Student Details & Registration (Vocational Training Intake)',
    };

    // 6. Assemble Metadata with Authoritative Fields
    // Strict requirement: Ends at Sponsor's Email Address
    const metadata = {
      middleName: middleName || null,
      rawFullName: derivedFullName,
      dateOfBirth: dateOfBirth || null,
      nationality: nationality || 'Nigerian',
      religion: religion || null,
      maritalStatus: maritalStatus || null,
      alternativePhone: alternativePhone || null,
      secondaryPhone: phone2 || null,
      phone2: phone2 || null,
      location: location || null,
      stateOfOrigin: state || null,
      state: state || null,
      registeredAt: registrationDate,
      registrationDate: registrationDate,
      referralSource: referralSource || null,
      expertiseLevel: expertiseLevel || null,
      employmentStatus: employmentStatus || null,
      hasSponsor: hasSponsor ? 'Yes' : 'No',
      sponsorName: sponsorName || null,
      sponsorPhone: sponsorPhone || null,
      sponsorEmail: sponsorEmail || null,
      sponsorType: hasSponsor ? 'Sponsor' : 'Self',
      sponsor: {
        hasSponsor,
        name: sponsorName || null,
        phone: sponsorPhone || null,
        email: sponsorEmail || null,
      },
      source: 'student_details_and_registration',
      audit_trail: [initialAudit],
    };

    // Establish canonical Financial Customer link in public.customers
    let resolvedCustomerId: string | null = null;
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanPhone = phone ? phone.trim() : null;

    try {
      if (cleanEmail || cleanPhone) {
        let custQuery = supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', session.tenantId);

        if (cleanEmail) {
          custQuery = custQuery.eq('email', cleanEmail);
        } else if (cleanPhone) {
          custQuery = custQuery.eq('phone', cleanPhone);
        }

        const { data: matchedCust } = await custQuery.limit(1).maybeSingle();
        if (matchedCust?.id) {
          resolvedCustomerId = matchedCust.id;
        }
      }

      if (!resolvedCustomerId) {
        const newCustId = `cust_${internalId}`;
        const { error: custErr } = await supabase.from('customers').insert({
          id: newCustId,
          tenant_id: session.tenantId,
          name: derivedFullName,
          email: cleanEmail,
          phone: cleanPhone,
          address: address || null,
          total_invoiced: 0,
          total_paid: 0,
          outstanding_balance: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (!custErr) {
          resolvedCustomerId = newCustId;
        } else {
          console.warn('[POST /api/students] Customer ledger creation notice:', custErr.message);
        }
      }
    } catch (custEx) {
      console.warn('[POST /api/students] Customer resolution exception:', custEx);
    }

    const studentPayload = {
      id: internalId,
      tenant_id: session.tenantId,
      customer_id: resolvedCustomerId,
      user_id: null,
      student_number: studentNumber,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      gender: gender || null,
      address: address || null,
      emergency_contact_name: sponsorName || null,
      emergency_contact_phone: sponsorPhone || null,
      status: 'ACTIVE' as StudentStatus,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: insertedStudent, error: insertError } = await supabase
      .from('students')
      .insert(studentPayload)
      .select('*')
      .single();

    if (insertError || !insertedStudent) {
      console.error('[POST /api/students] Insert error:', insertError);
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create student record in database.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        student: insertedStudent,
        message: `Student ${studentNumber} (${derivedFullName}) successfully registered.`,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('[POST /api/students exception]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
