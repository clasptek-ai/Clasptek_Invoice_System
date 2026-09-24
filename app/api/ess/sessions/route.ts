/**
 * app/api/ess/sessions/route.ts — Employee Training Sessions API
 * Phase 9E: User Workspaces Migration
 */

import { NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeeSessions } from '@/lib/ess/queries';

export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const sessions = await getEmployeeSessions();
    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
