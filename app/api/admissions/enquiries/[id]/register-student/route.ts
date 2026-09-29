/**
 * app/api/admissions/enquiries/[id]/register-student/route.ts
 * Authoritative Server Endpoint: Register Prospect/Enquiry as a Student
 * Enforces:
 * - Session & Tenant isolation
 * - Strict RBAC: Super Admin and Staff (Admissions / Operations)
 * - Deterministic deduplication
 * - Human decision workflow for ambiguous matches
 * - Explicit linking or safe creation without automatic enrolment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { registerStudentFromEnquiry } from '@/lib/students/mutations';
import type { StudentAuditTrailEntry } from '@/types/students';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['Super Admin', 'Staff'];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${session.role}' is not authorized to register Students. Only Admissions, Operations, and Super Admin can execute registration.`,
        },
        { status: 403 }
      );
    }

    const { id: enquiryId } = await params;
    if (!enquiryId) {
      return NextResponse.json({ error: 'Enquiry ID is required.' }, { status: 400 });
    }

    const supabase = await createServerClient();

    // 1. Fetch Enquiry
    const { data: enquiry, error: enqErr } = await supabase
      .from('enquiries')
      .select('*')
      .eq('id', enquiryId)
      .eq('tenant_id', session.tenantId)
      .single();

    if (enqErr || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { forceNew, linkExistingStudentId, candidateOverrides } = body;

    const actor = {
      id: session.user.id,
      name:
        (session.user.user_metadata?.full_name as string) ||
        (session.user.user_metadata?.name as string) ||
        session.user.email ||
        'Authorized Staff',
      role: session.role,
    };

    // 2. Action: Link to Existing Student (Human Decision Option A)
    if (linkExistingStudentId) {
      const { data: existingStudent, error: stuErr } = await supabase
        .from('students')
        .select('*')
        .eq('id', linkExistingStudentId)
        .eq('tenant_id', session.tenantId)
        .single();

      if (stuErr || !existingStudent) {
        return NextResponse.json({ error: 'Existing Student not found in tenant.' }, { status: 404 });
      }

      // Record audit in student metadata
      const currentMeta = (existingStudent.metadata as Record<string, unknown>) || {};
      const auditTrail = (currentMeta.audit_trail as StudentAuditTrailEntry[]) || [];
      const linkAudit: StudentAuditTrailEntry = {
        id: `aud_stu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        field: 'ENQUIRY_LINKED',
        previous_value: currentMeta.enquiry_id || null,
        new_value: enquiryId,
        reason: `Manually linked to Enquiry ${enquiryId} by ${actor.name}`,
      };

      await supabase
        .from('students')
        .update({
          metadata: {
            ...currentMeta,
            enquiry_id: enquiryId,
            audit_trail: [...auditTrail, linkAudit],
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkExistingStudentId);

      // Link crm_intake_applications
      try {
        await supabase
          .from('crm_intake_applications')
          .update({
            matched_student_id: linkExistingStudentId,
            updated_at: new Date().toISOString(),
          })
          .eq('enquiry_id', enquiryId)
          .eq('tenant_id', session.tenantId);
      } catch (e) {
        console.warn('[register-student] Link to intake application deferred:', e);
      }

      // Record customer_timeline event gracefully
      try {
        if (existingStudent.customer_id) {
          await supabase.from('customer_timeline').insert({
            id: `tl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            tenant_id: session.tenantId,
            customer_id: existingStudent.customer_id,
            enquiry_id: enquiryId,
            event_type: 'STUDENT_LINKED',
            title: `Enquiry Linked to Existing Student (${existingStudent.student_number})`,
            description: `Staff confirmed linkage between Enquiry ${enquiryId} and existing Student.`,
            contact_method: 'ADMIN_LINK',
            outcome: 'LINKED',
            reference_id: existingStudent.id,
            actor_name: `${actor.role} — ${actor.name}`,
            created_at: new Date().toISOString(),
          });
        }
      } catch (tlErr) {
        console.warn('[register-student] Timeline event deferred:', tlErr);
      }

      return NextResponse.json({
        ok: true,
        linked: true,
        student: existingStudent,
        message: `Successfully linked Enquiry to existing student ${existingStudent.student_number}.`,
      });
    }

    // 3. Action: Register New Student
    // Split full name into first and last
    const fullName = (candidateOverrides?.name || enquiry.student_name || 'Prospect').trim();
    const nameParts = fullName.split(' ');
    const firstName = candidateOverrides?.firstName || nameParts[0] || 'Prospect';
    const lastName = candidateOverrides?.lastName || nameParts.slice(1).join(' ') || 'Student';

    const candidateData = {
      firstName,
      lastName,
      email: candidateOverrides?.email !== undefined ? candidateOverrides.email : enquiry.email,
      phone: candidateOverrides?.phone !== undefined ? candidateOverrides.phone : enquiry.phone,
      gender: candidateOverrides?.gender || null,
      address: candidateOverrides?.address || null,
      city: candidateOverrides?.city || null,
      state: candidateOverrides?.state || null,
      country: candidateOverrides?.country || null,
      emergencyContactName: candidateOverrides?.emergencyContactName || null,
      emergencyContactPhone: candidateOverrides?.emergencyContactPhone || null,
      metadata: {
        notes: enquiry.notes || null,
        programmeId: enquiry.programme_id || null,
      },
    };

    const result = await registerStudentFromEnquiry(supabase, {
      tenantId: session.tenantId,
      enquiryId,
      candidateData,
      actor,
      allowAmbiguous: Boolean(forceNew), // User confirmed "Create New Student" on ambiguous match
    });

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          matchResult: result.matchResult,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      student: result.student,
      message: `Student ${result.student?.student_number} registered successfully. (Enrolments: 0, Status: ACTIVE).`,
    });
  } catch (err: unknown) {
    console.error('[POST /api/admissions/enquiries/[id]/register-student error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
