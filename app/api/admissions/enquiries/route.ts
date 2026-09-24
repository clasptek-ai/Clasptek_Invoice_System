import { NextRequest, NextResponse } from 'next/server';
import { createEnquiry, getEnquiries } from '../../../../lib/admissions/queries';
import { getAuthoritativeSession } from '../../../../lib/auth/server';
import type { EnquiryStatus } from '../../../../types/admissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? '';
    const status = (searchParams.get('status') ?? 'all') as EnquiryStatus | 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

    const result = await getEnquiries({ search, status, page });
    if (result.error) {
      console.error('[Admissions Enquiries GET error]', result.error);
      return NextResponse.json(
        { error: 'Unable to load enquiries. Please try again. If the problem persists, contact an administrator.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      count: result.count,
      page,
    });
  } catch (err: unknown) {
    console.error('[Admissions Enquiries GET uncaught error]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authoritative session check
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role check
    const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to create prospect enquiries' },
        { status: 403 }
      );
    }

    // 2. Parse request body safely
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const student_name = String(body.student_name ?? body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const programme_id = body.programme_id ? String(body.programme_id).trim() : null;
    const source = String(body.source ?? 'Direct').trim();
    const notes = body.notes ? String(body.notes).trim() : null;
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

    // 4. Create enquiry in database with authoritative tenant
    const { data: enquiry, error: createErr } = await createEnquiry({
      student_name,
      phone,
      email,
      programme_id,
      source,
      notes,
      status,
      tenant_id: session.tenantId,
    });

    if (createErr || !enquiry) {
      console.error('[Admissions Enquiries POST error]', createErr);
      return NextResponse.json(
        { error: 'Failed to log prospect enquiry. Please check your input or contact an administrator.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: enquiry }, { status: 201 });
  } catch (err: unknown) {
    console.error('[Admissions Enquiries POST uncaught error]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
