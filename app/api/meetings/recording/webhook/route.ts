/**
 * app/api/meetings/recording/webhook/route.ts — LiveKit Egress Webhook Receiver
 * Ingests LiveKit Egress events (e.g. egress_ended).
 * Verifies HMAC-SHA256 authorization token, handles completion & failure,
 * streams composite video to Google Drive, and updates meeting recording status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleLiveKitWebhook, RecordingServiceError } from '@/lib/meetings/recording-service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || undefined;

    const result = await handleLiveKitWebhook({
      body: rawBody,
      authHeader,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof RecordingServiceError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode }
      );
    }
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: 'WEBHOOK_PROCESSING_FAILED', message: msg }, { status: 500 });
  }
}
