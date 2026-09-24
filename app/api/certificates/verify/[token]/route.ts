/**
 * app/api/certificates/verify/[token]/route.ts — Phase 9D
 * Public Credential Verification Endpoint
 *
 * Provides tamper-evident verification of issued credentials for employers,
 * academic bodies, and students.
 * SECURITY: Zero disclosure of internal tenant IDs, student email, phone, or financial data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCertificatePublic } from '@/lib/certificates/certificate-queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const decoded = decodeURIComponent(token || '');

    const result = await verifyCertificatePublic(decoded);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error during credential verification';
    return NextResponse.json(
      { found: false, isValid: false, status: 'NOT_FOUND', message },
      { status: 500 }
    );
  }
}
