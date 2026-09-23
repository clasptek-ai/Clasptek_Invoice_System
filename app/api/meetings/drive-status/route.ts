/**
 * app/api/meetings/drive-status/route.ts — Phase 5
 * Route handler to query or verify Google Drive Central Repository status.
 */

import { NextResponse } from 'next/server';
import { getGoogleDriveStatus } from '@/lib/meetings/google-drive';

export async function GET() {
  try {
    const status = await getGoogleDriveStatus();
    return NextResponse.json(status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
