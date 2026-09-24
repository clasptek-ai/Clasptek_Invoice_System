/**
 * app/api/admissions/applications/track/route.ts — Public Applicant Status Tracking API
 * Phase 9E: User Workspaces Migration
 *
 * Implements anti-enumeration protection and zero-leakage payload sanitization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trackApplicantApplication } from '@/lib/admissions/tracking-queries';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { applicationNumber, credential } = body;

    const result = await trackApplicantApplication({
      applicationNumber,
      credential,
    });

    if (!result.success || !result.application) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.message ||
            'Application could not be found or verified with the provided details. Please check your reference number and contact information.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        message:
          'Application could not be found or verified with the provided details. Please check your reference number and contact information.',
        error: process.env.NODE_ENV === 'development' ? msg : undefined,
      },
      { status: 404 }
    );
  }
}
