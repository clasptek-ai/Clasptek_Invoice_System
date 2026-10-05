import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getCohortsByProgramme } from '@/lib/admissions/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get('programmeId');

    if (!programmeId) {
      return NextResponse.json({ error: 'programmeId is required' }, { status: 400 });
    }

    const cohorts = await getCohortsByProgramme(programmeId);
    return NextResponse.json({ data: cohorts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to create cohorts.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      programme_id,
      cohort_code,
      name,
      start_date,
      end_date,
      delivery_mode = 'IN_PERSON',
      capacity = 25,
      lead_facilitator_id = null,
      status = 'PLANNING',
    } = body || {};

    if (!programme_id) {
      return NextResponse.json({ error: 'Programme is required.' }, { status: 400 });
    }
    if (!cohort_code || !cohort_code.trim()) {
      return NextResponse.json({ error: 'Cohort Code is required.' }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Cohort Name is required.' }, { status: 400 });
    }
    if (!start_date) {
      return NextResponse.json({ error: 'Start Date is required.' }, { status: 400 });
    }

    const validStatuses = ['PLANNING', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid cohort status '${status}'.` }, { status: 400 });
    }

    const validDeliveryModes = ['IN_PERSON', 'ONLINE', 'HYBRID'];
    if (!validDeliveryModes.includes(delivery_mode)) {
      return NextResponse.json({ error: `Invalid delivery mode '${delivery_mode}'.` }, { status: 400 });
    }

    const supabase = await createServerClient();

    // Check unique cohort_code per tenant
    const { data: existingCode } = await supabase
      .from('cohorts')
      .select('id, cohort_code')
      .eq('tenant_id', session.tenantId)
      .eq('cohort_code', cohort_code.trim().toUpperCase())
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json(
        { error: `A cohort with code '${cohort_code.trim().toUpperCase()}' already exists.` },
        { status: 400 }
      );
    }

    const id = `coh_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    const { data: inserted, error: insertErr } = await supabase
      .from('cohorts')
      .insert({
        id,
        tenant_id: session.tenantId,
        programme_id,
        cohort_code: cohort_code.trim().toUpperCase(),
        name: name.trim(),
        start_date,
        end_date: end_date || null,
        delivery_mode,
        capacity: Number(capacity) || 25,
        lead_facilitator_id: lead_facilitator_id || null,
        status,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*, programmes!fk_cohorts_programme_tenant(name), personnel(full_name)')
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message || 'Failed to create cohort record.' },
        { status: 500 }
      );
    }

    const enriched = {
      ...inserted,
      programme_name: (inserted as { programmes?: { name?: string } }).programmes?.name || 'Academic Programme',
      lead_facilitator_name: (inserted as { personnel?: { full_name?: string } }).personnel?.full_name || undefined,
      enrolled_count: 0,
      is_full: false,
      percentage_full: 0,
    };

    return NextResponse.json({ success: true, cohort: enriched }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
