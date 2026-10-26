/**
 * app/api/meetings/drive-status/route.ts — Phase 5 / Phase 8 Hardened
 * Route handler to query or verify Google Drive Central Repository status.
 * Enforces server-side authentication for staff members.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveStatus } from '@/lib/meetings/google-drive';
import { requireAuth } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
    });

    if (errorResponse || !session) {
      return errorResponse;
    }

    const status = await getGoogleDriveStatus(session.tenantId);
    if (status.status === 'ERROR') {
      return NextResponse.json(status, { status: 500 });
    }
    return NextResponse.json(status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
