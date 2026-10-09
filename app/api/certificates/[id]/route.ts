/**
 * app/api/certificates/[id]/route.ts — Phase 9D
 * API Route for Single Certificate retrieval, Editing, Revocation, and Reissuance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getCertificateById,
  revokeCertificate,
  reissueCertificate,
  updateCertificateRecord,
} from '@/lib/certificates/certificate-queries';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const result = await getCertificateById(auth.session.tenantId, id);
    if (result.error || !result.data) {
      return NextResponse.json({ success: false, error: result.error || 'Certificate not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, certificate: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching certificate';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function mapCertificateErrorToStatus(error: string | null): number {
  if (!error) return 400;
  const errLower = error.toLowerCase();
  if (errLower.includes('unauthorized') || errLower.includes('forbidden')) return 403;
  if (errLower.includes('not found') || errLower.includes('foreign tenant')) return 404;
  if (
    errLower.includes('audit_log_failed') ||
    errLower.includes('database') ||
    errLower.includes('server') ||
    errLower.includes('internal')
  ) {
    return 500;
  }
  return 400;
}

const PROTECTED_FIELDS = [
  'id',
  'status',
  'certificate_number',
  'certificateNumber',
  'tenant_id',
  'tenantId',
  'verification_token',
  'verificationToken',
  'student_id',
  'studentId',
  'enrolment_id',
  'enrolmentId',
  'programme_id',
  'programmeId',
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    // Distinguish between EDIT/UPDATE and REVOCATION workflows
    const isEdit =
      body.action === 'EDIT' ||
      body.action === 'UPDATE' ||
      (body.action !== 'REVOKE' &&
        (body.studentNameSnapshot !== undefined ||
          body.certificateTitle !== undefined ||
          body.issueDate !== undefined ||
          body.completionDate !== undefined ||
          body.certificateDescription !== undefined ||
          body.certificateRole !== undefined));

    if (isEdit) {
      const attemptedProtected = PROTECTED_FIELDS.find((f) => f in body);
      if (attemptedProtected) {
        return NextResponse.json(
          {
            success: false,
            error: `PROTECTED_FIELD_IMMUTABLE: Field '${attemptedProtected}' cannot be modified on an issued credential.`,
          },
          { status: 400 }
        );
      }

      const result = await updateCertificateRecord(auth.session.tenantId, actor, id, body);
      if (!result.success || !result.certificate) {
        const statusCode = mapCertificateErrorToStatus(result.error);
        return NextResponse.json({ success: false, error: result.error || 'Failed to update certificate' }, { status: statusCode });
      }

      return NextResponse.json({
        success: true,
        certificate: result.certificate,
        message: 'Certificate updated successfully',
      });
    }

    // Default to revocation workflow
    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { success: false, error: 'A documented justification reason is required for certificate revocation' },
        { status: 400 }
      );
    }

    const result = await revokeCertificate(auth.session.tenantId, actor, id, body.reason);
    if (!result.success) {
      const statusCode = mapCertificateErrorToStatus(result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: statusCode });
    }

    return NextResponse.json({ success: true, message: 'Certificate revoked successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error processing certificate update';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    const attemptedProtected = PROTECTED_FIELDS.find((f) => f in body);
    if (attemptedProtected) {
      return NextResponse.json(
        {
          success: false,
          error: `PROTECTED_FIELD_IMMUTABLE: Field '${attemptedProtected}' cannot be modified on an issued credential.`,
        },
        { status: 400 }
      );
    }

    const result = await updateCertificateRecord(auth.session.tenantId, actor, id, body);
    if (!result.success || !result.certificate) {
      const statusCode = mapCertificateErrorToStatus(result.error);
      return NextResponse.json({ success: false, error: result.error || 'Failed to update certificate' }, { status: statusCode });
    }

    return NextResponse.json({
      success: true,
      certificate: result.certificate,
      message: 'Certificate updated successfully',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error updating certificate';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { success: false, error: 'A documented justification reason is required for certificate reissuance' },
        { status: 400 }
      );
    }

    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    const result = await reissueCertificate(auth.session.tenantId, actor, id, {
      reason: body.reason,
      issueDate: body.issueDate,
      studentNameOverride: body.studentNameOverride,
      certificateTitle: body.certificateTitle,
      certificateDescription: body.certificateDescription,
      certificateRole: body.certificateRole,
    });

    if (!result.success || !result.certificate) {
      const statusCode = mapCertificateErrorToStatus(result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: statusCode });
    }

    return NextResponse.json({
      success: true,
      certificate: result.certificate,
      message: `Certificate reissued as ${result.certificate.certificateNumber}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error reissuing certificate';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
