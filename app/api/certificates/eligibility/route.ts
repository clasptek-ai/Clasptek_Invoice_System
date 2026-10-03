/**
 * app/api/certificates/eligibility/route.ts — Phase 9D
 * API Route for Certificate Eligibility determination, candidate evaluation,
 * and completion sign-off / administrative overrides.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getCertificateEligibilityList,
  verifyEnrolmentCompletion,
  overrideEnrolmentCompletion,
} from '@/lib/certificates/eligibility-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get('cohortId') || undefined;
    const eligibilityFilter = (searchParams.get('eligibilityFilter') as
      | 'ALL'
      | 'ELIGIBLE'
      | 'BELOW_THRESHOLD'
      | 'VERIFIED'
      | 'UNVERIFIED') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await getCertificateEligibilityList(auth.session.tenantId, {
      cohortId,
      eligibilityFilter,
      search,
    });

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      candidates: result.data,
      kpis: result.kpis,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching certificate eligibility';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const action = body.action || 'verify';

    const actor = {
      id: auth.session.user.id,
      role: auth.session.role,
      email: auth.session.user.email,
    };

    if (action === 'verify') {
      if (body.enrolmentIds && Array.isArray(body.enrolmentIds)) {
        let verifiedCount = 0;
        const errors: string[] = [];
        for (const enId of body.enrolmentIds) {
          const res = await verifyEnrolmentCompletion(auth.session.tenantId, actor, enId, body.notes);
          if (res.success) {
            verifiedCount++;
          } else if (res.error) {
            errors.push(res.error);
          }
        }
        return NextResponse.json({
          success: true,
          message: `Successfully verified completion for ${verifiedCount} candidate(s).`,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      if (!body.enrolmentId) {
        return NextResponse.json({ success: false, error: 'Enrolment ID is required' }, { status: 400 });
      }
      const res = await verifyEnrolmentCompletion(auth.session.tenantId, actor, body.enrolmentId, body.notes);
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Training completion verified successfully' });
    }

    if (action === 'override') {
      if (!body.enrolmentId) {
        return NextResponse.json({ success: false, error: 'Enrolment ID is required' }, { status: 400 });
      }
      if (!body.overrideReason || !body.overrideReason.trim()) {
        return NextResponse.json(
          { success: false, error: 'Mandatory justification reason is required for administrative completion override' },
          { status: 400 }
        );
      }
      const res = await overrideEnrolmentCompletion(
        auth.session.tenantId,
        actor,
        body.enrolmentId,
        body.overrideReason,
        body.notes
      );
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Administrative completion override granted successfully' });
    }

    return NextResponse.json({ success: false, error: `Invalid action '${action}'` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error processing completion action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
