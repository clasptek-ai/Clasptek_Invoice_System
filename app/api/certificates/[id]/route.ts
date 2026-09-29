/**
 * app/api/certificates/[id]/route.ts — Phase 9D
 * API Route for Single Certificate retrieval, Revocation, and Reissuance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getCertificateById,
  revokeCertificate,
  reissueCertificate,
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
    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { success: false, error: 'A documented justification reason is required for certificate revocation' },
        { status: 400 }
      );
    }

    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    const result = await revokeCertificate(auth.session.tenantId, actor, id, body.reason);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Certificate revoked successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error revoking certificate';
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
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
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
