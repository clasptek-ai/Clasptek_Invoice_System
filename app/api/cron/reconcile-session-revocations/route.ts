import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { reconcilePendingSessionRevocations } from '@/lib/admin/personnel-queries';

export const dynamic = 'force-dynamic';

/**
 * Session-revocation outbox worker endpoint (C253 / DEF-C252-02).
 *
 * AUTHENTICATION CONTRACT (same convention as /api/cron/reconcile-recordings):
 *   Authorization: Bearer <CRON_SECRET>   (timing-safe compare; fail closed if CRON_SECRET unset)
 * Authentication is validated BEFORE any outbox record is read or claimed.
 *
 * SCOPE: processes due work for all tenants. It deliberately accepts NO tenant, user or operation
 * identifier from the caller; it can only drain the durable outbox through the same
 * claim -> terminate -> conditional-complete logic used by manual administrator retries.
 *
 * SCHEDULING: NOT CONFIGURED by this repository. vercel.json defines no "crons" and this phase does
 * not change deployment configuration. An operator-approved scheduler (Vercel Cron or an external
 * scheduler) must call GET or POST on this path every 1-5 minutes with the bearer secret.
 * Until that is configured, retries are manual only (People & Access "Retry" or reconcile-sessions).
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

  const providedBuf = Buffer.from(authHeader.slice(7).trim(), 'utf8');
  const expectedBuf = Buffer.from(cronSecret, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

async function handle(req: NextRequest) {
  if (!verifyCronAuthorization(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid authorization token.' },
      { status: 401 }
    );
  }

  try {
    const result = await reconcilePendingSessionRevocations(null, {
      limit: 50,
      claimer: 'cron:session-revocation-worker',
    });
    return NextResponse.json(
      {
        success: result.success,
        timestamp: new Date().toISOString(),
        processed: result.processed,
        completed: result.completed,
        retryPending: result.retryPending,
        superseded: result.superseded,
        failed: result.failed,
        ...(result.success ? {} : { error: 'SESSION_REVOCATION_WORKER_FAILED' }),
      },
      { status: result.success ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'SESSION_REVOCATION_WORKER_FAILED' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

