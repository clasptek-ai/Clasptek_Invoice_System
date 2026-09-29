/**
 * app/api/finance/receivables/notes/route.ts
 * Authoritative Server Endpoint for Invoice Collection Notes
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getCollectionNotes, addCollectionNote } from '@/lib/finance/receivables-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoiceId');
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'invoiceId is required' }, { status: 400 });
    }

    const notes = await getCollectionNotes(auth.session.tenantId, invoiceId);
    return NextResponse.json({ success: true, notes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching collection notes';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    if (!body.invoiceId || !body.note) {
      return NextResponse.json({ success: false, error: 'invoiceId and note are required' }, { status: 400 });
    }

    const result = await addCollectionNote(
      auth.session.tenantId,
      {
        id: auth.session.user.id,
        name: (auth.session.user.user_metadata?.full_name as string) || auth.session.user.email || 'Staff',
        role: auth.session.role,
      },
      {
        invoiceId: body.invoiceId,
        note: body.note,
        promisedDate: body.promisedDate,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, note: result.note });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error recording collection note';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
