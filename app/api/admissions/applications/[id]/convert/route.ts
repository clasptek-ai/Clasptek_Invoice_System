import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getApplicationById } from '@/lib/admissions/queries';
import { CONVERTIBLE_STATUSES, ConversionOptions, ConversionResult } from '@/types/admissions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing application ID' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ConversionOptions;

    // Check application status first
    const { data: current, error: fetchErr } = await getApplicationById(id);
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (!CONVERTIBLE_STATUSES.includes(current.status)) {
      return NextResponse.json(
        {
          error: `Application status is '${current.status}'. Only ${CONVERTIBLE_STATUSES.join(' or ')} applications can be converted.`,
        },
        { status: 422 }
      );
    }

    // Call convert_intake_application RPC
    const { data, error: rpcErr } = await supabase.rpc('convert_intake_application', {
      p_application_id: id,
      p_options: {
        cohort_id: body.cohort_id || null,
        approved_tuition_fee: body.approved_tuition_fee ?? current.agreed_tuition_fee,
      },
    });

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      result: data as ConversionResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
