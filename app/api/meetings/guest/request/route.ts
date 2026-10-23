/**
 * app/api/meetings/guest/request/route.ts — Clasptek Meetings Guest Entry
 * Public endpoint for external guests to request entry into a meeting.
 * Puts guest into PENDING status in the waiting room ledger.
 *
 * Security Invariants:
 * - Does not require a staff/student session (resolves meeting safely via service client).
 * - Strict syntax validation against PostgREST filter injection.
 * - Both LiveKit and Google Meet meetings require host admission (ZERO immediate URL disclosure).
 * - Enforces meeting lifecycle (rejects cancelled, completed, or deleted meetings).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createGuestRequest } from '@/lib/meetings/guest-requests';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { publicId, meetingId, guestName, guestEmail, guestOrganization } = body;

    const identifier = publicId || meetingId;
    if (!identifier) {
      return NextResponse.json({ error: 'Meeting identifier is required' }, { status: 400 });
    }

    const cleanId = String(identifier).trim();
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanId);
    const isPublicFormat = /^[a-zA-Z0-9_-]{3,128}$/.test(cleanId);

    if (!isPublicFormat && !isUuid) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Invalid meeting identifier' }, { status: 404 });
    }

    if (!guestName || !String(guestName).trim()) {
      return NextResponse.json({ error: 'Your name is required to request entry.' }, { status: 400 });
    }

    if (!guestEmail || !String(guestEmail).trim() || !String(guestEmail).includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    // Resolve meeting safely without requiring an authenticated user session (Finding V-03)
    let meeting: any = null;

    if ((globalThis as any).__MOCK_MEETINGS_DB__) {
      const mockDb = (globalThis as any).__MOCK_MEETINGS_DB__;
      let m = mockDb.get(cleanId);
      if (!m) {
        for (const val of mockDb.values()) {
          if (val.id === cleanId || val.publicId === cleanId) {
            m = val;
            break;
          }
        }
      }
      if (m && !m.deletedAt) {
        meeting = {
          id: m.id,
          public_id: m.publicId,
          tenant_id: m.tenantId,
          title: m.title,
          status: m.status,
          provider: m.sfuProvider || 'livekit',
          provider_room_url: m.providerRoomUrl,
          deleted_at: m.deletedAt || null,
        };
      }
    }

    if (!meeting) {
      const supabase = createSupabaseServiceClient();

      // Parameterized lookup by public_id
      const { data: byPublic } = await supabase
        .from('meetings')
        .select('id, public_id, tenant_id, title, status, provider, provider_room_url, deleted_at')
        .eq('public_id', cleanId)
        .is('deleted_at', null)
        .maybeSingle();

      if (byPublic) {
        meeting = byPublic;
      } else if (isUuid) {
        // Parameterized fallback by internal UUID
        const { data: byId } = await supabase
          .from('meetings')
          .select('id, public_id, tenant_id, title, status, provider, provider_room_url, deleted_at')
          .eq('id', cleanId)
          .is('deleted_at', null)
          .maybeSingle();
        meeting = byId;
      }
    }

    if (!meeting || meeting.deleted_at) {
      return NextResponse.json({ error: 'MEETING_NOT_FOUND', message: 'Meeting not found' }, { status: 404 });
    }

    if (meeting.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'MEETING_ENDED', message: 'This meeting has completed. New guests cannot join.' },
        { status: 400 }
      );
    }

    if (meeting.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'MEETING_CANCELLED', message: 'This meeting has been cancelled.' },
        { status: 400 }
      );
    }

    // Both LiveKit and Google Meet meetings register a pending waiting room request
    // DO NOT return redirectUrl directly here (Finding V-01 / V-03)
    const result = await createGuestRequest({
      tenantId: meeting.tenant_id,
      meetingId: meeting.id,
      meetingPublicId: meeting.public_id,
      guestName: String(guestName).trim(),
      guestEmail: String(guestEmail).trim(),
      guestOrganization: guestOrganization ? String(guestOrganization).trim() : null,
    });

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      requestToken: result.requestToken,
      status: 'PENDING',
      message: 'Your request has been submitted. Please wait for the host to admit you.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
