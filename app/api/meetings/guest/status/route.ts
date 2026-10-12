/**
 * app/api/meetings/guest/status/route.ts — Clasptek Meetings LiveKit Only
 * Public polling endpoint for guests waiting in the waiting room.
 * Requires both requestId and requestToken.
 * Returns LiveKit token only when status is APPROVED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGuestRequestByToken } from '@/lib/meetings/guest-requests';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get('requestId');
    const requestToken = searchParams.get('requestToken');

    if (!requestId || !requestToken) {
      return NextResponse.json(
        { error: 'requestId and requestToken are both required to check status.' },
        { status: 400 }
      );
    }

    const record = await getGuestRequestByToken(requestId, requestToken);
    if (!record) {
      return NextResponse.json({ error: 'REQUEST_NOT_FOUND', message: 'Guest request not found.' }, { status: 404 });
    }

    // Check expiration
    if (new Date(record.expiresAt) < new Date()) {
      return NextResponse.json({
        status: 'EXPIRED',
        message: 'This guest access request has expired. Please submit a new request.',
      });
    }

    if (record.status === 'APPROVED') {
      return NextResponse.json({
        status: 'APPROVED',
        token: record.livekitToken,
        serverUrl: record.livekitServerUrl,
        guestName: record.guestName,
        message: 'Access approved! Joining classroom...',
      });
    }

    if (record.status === 'REJECTED') {
      return NextResponse.json({
        status: 'REJECTED',
        message: 'The meeting host declined your request to join.',
      });
    }

    if (record.status === 'REVOKED') {
      return NextResponse.json({
        status: 'REVOKED',
        message: 'Your guest access has been revoked by the host.',
      });
    }

    // PENDING
    return NextResponse.json({
      status: 'PENDING',
      message: 'Waiting for host to admit you to the classroom...',
      requestedAt: record.requestedAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
