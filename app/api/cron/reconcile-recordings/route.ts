import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { reconcileStaleRecordingsBatch } from '@/lib/meetings/recording-service';

export const dynamic = 'force-dynamic';

/**
 * Validates incoming Vercel Cron authorization header.
 * Uses timing-safe string comparison against process.env.CRON_SECRET.
 * Fails closed if CRON_SECRET is unconfigured or mismatch occurs.
 */
function verifyCronAuthorization(req: NextRequest | Request): boolean {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const providedToken = authHeader.slice(7).trim();
  const providedBuf = Buffer.from(providedToken, 'utf8');
  const expectedBuf = Buffer.from(cronSecret, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

async function handleReconciliation(req: NextRequest) {
  if (!verifyCronAuthorization(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid authorization token.' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const batchLimit = limitParam ? parseInt(limitParam, 10) : 10;

    const result = await reconcileStaleRecordingsBatch({
      batchLimit: isNaN(batchLimit) ? 10 : batchLimit,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number'
      ? err.statusCode
      : err?.code === 'RECONCILIATION_SCHEMA_UNAVAILABLE'
      ? 503
      : 500;
    const errorCode = err?.code || 'RECONCILIATION_CRON_FAILED';
    const message = (err?.message || 'An error occurred during scheduled recording reconciliation.')
      .replace(/^[A-Z0-9_]+:\s*/, '');

    return NextResponse.json(
      {
        success: false,
        error: errorCode,
        message,
      },
      { status: statusCode }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleReconciliation(req);
}

export async function POST(req: NextRequest) {
  return handleReconciliation(req);
}
