import { NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getProgrammes } from '@/lib/admissions/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'Staff') {
      return NextResponse.json({ error: 'Forbidden: Staff cannot access academic programmes' }, { status: 403 });
    }

    const programmes = await getProgrammes();
    return NextResponse.json({ ok: true, data: programmes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
