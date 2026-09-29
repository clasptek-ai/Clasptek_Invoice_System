/**
 * app/api/certificates/route.ts — Phase 9D
 * API Route for Certificates Registry and Authoritative Certificate Issuance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getCertificates, issueCertificate } from '@/lib/certificates/certificate-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await getCertificates(auth.session.tenantId, {
      status,
      search,
    });

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      certificates: result.data,
      kpis: result.kpis,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching certificates';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    if (!body.enrolmentId) {
      return NextResponse.json({ success: false, error: 'Enrolment ID is required' }, { status: 400 });
    }

    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    const result = await issueCertificate(auth.session.tenantId, actor, {
      enrolmentId: body.enrolmentId,
      issueDate: body.issueDate,
      certificateTitle: body.certificateTitle,
      certificateDescription: body.certificateDescription,
      certificateRole: body.certificateRole,
      signatoryName: body.signatoryName,
      signatoryTitle: body.signatoryTitle,
      certificateTemplateId: body.certificateTemplateId,
    });

    if (!result.success || !result.certificate) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      certificate: result.certificate,
      message: `Certificate ${result.certificate.certificateNumber} issued successfully`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error issuing certificate';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
