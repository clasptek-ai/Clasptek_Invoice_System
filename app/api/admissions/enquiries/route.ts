import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createEnquiry, getEnquiries } from '@/lib/admissions/queries';
import { getAuthoritativeSession } from '@/lib/auth/server';
import type { EnquiryStatus } from '@/types/admissions';

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
    const search = searchParams.get('search') ?? '';
    const status = (searchParams.get('status') ?? 'all') as EnquiryStatus | 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

    const result = await getEnquiries({ search, status, page });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      count: result.count,
      page,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authoritative session check
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const student_name = (body.student_name ?? body.name ?? '').trim();
    const phone = (body.phone ?? '').trim();
    const email = (body.email ?? '').trim() || null;
    const programme_id = body.programme_id || null;
    const source = (body.source ?? 'Direct').trim();
    const notes = (body.notes ?? '').trim() || null;
    const status = (body.status ?? 'NEW') as EnquiryStatus;

    // 3. Validation
    if (!student_name) {
      return NextResponse.json(
        { error: 'Candidate / Prospect Full Name is required.' },
        { status: 422 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required.' },
        { status: 422 }
      );
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Please enter a valid email address.' },
          { status: 422 }
        );
      }
    }

    const validStatuses: EnquiryStatus[] = [
      'NEW',
      'CONTACTED',
      'INTERESTED',
      'APPLIED',
      'OFFERED',
      'ENROLLED',
      'LOST',
    ];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 422 }
      );
    }

    // 4. Create enquiry in database
    const { data: enquiry, error: createErr } = await createEnquiry({
      student_name,
      phone,
      email,
      programme_id,
      source,
      notes,
      status,
    });

    if (createErr || !enquiry) {
      return NextResponse.json(
        { error: createErr ?? 'Failed to log prospect enquiry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: enquiry }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
