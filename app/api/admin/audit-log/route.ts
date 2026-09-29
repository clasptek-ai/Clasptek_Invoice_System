/**
 * app/api/admin/audit-log/route.ts
 * Authoritative Server Endpoint for Audit Log
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getAuditLogs } from '@/lib/audit/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(request.url);
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10));

  const logs = await getAuditLogs(auth.session.tenantId, limit);
  return NextResponse.json({ success: true, data: logs });
}
