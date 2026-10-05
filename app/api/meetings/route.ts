/**
 * app/api/meetings/route.ts — Phase 5
 * Route handler for Meetings listing & filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getMeetings } from '@/lib/meetings/queries';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthoritativeSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'Staff' || session.role === 'Student') {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to view meetings.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const subTab = searchParams.get('subTab') || undefined;
    const search = searchParams.get('search') || undefined;

    const { data, error } = await getMeetings({ subTab, search });
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
