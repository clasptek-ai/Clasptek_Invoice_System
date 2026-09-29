import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getProgrammes } from '@/lib/admissions/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const programmes = await getProgrammes();
    return NextResponse.json({ ok: true, data: programmes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
