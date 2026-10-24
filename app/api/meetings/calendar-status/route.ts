/**
 * app/api/meetings/calendar-status/route.ts — Phase C124
 * Authoritative Server-Side Query for Tenant Google Calendar Connection Status.
 *
 * Invariants:
 * 1. Requires authenticated session with staff role (Super Admin, Finance Manager, Facilitator).
 * 2. Scoped strictly to session.tenantId.
 * 3. Never returns access tokens, refresh tokens, or client secrets.
 * 4. Accurately reports whether tenant has connected Google Calendar with calendar.events scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireAuth(request, {
      allowedRoles: ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'],
    });

    if (errorResponse) {
      return errorResponse;
    }

    const tenantId = session.tenantId;

    // Load google-oauth-config safely
    let googleConfig: any = null;
    try {
      googleConfig = require('@/api/_lib/google-oauth-config');
    } catch {
      try {
        googleConfig = require('../../../api/_lib/google-oauth-config');
      } catch (_) {}
    }

    let connection: any = null;
    let fetchError: any = null;
    if (googleConfig && typeof googleConfig.getTenantCentralDriveConnection === 'function') {
      try {
        connection = await googleConfig.getTenantCentralDriveConnection(tenantId);
      } catch (err) {
        fetchError = err;
      }
    }

    if (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      if (errorMsg.includes('SUPABASE_QUARANTINE_VIOLATION') || errorMsg.includes('SUPABASE_CONFIG_')) {
        return NextResponse.json(
          {
            connected: false,
            hasCalendarScope: false,
            status: 'DATABASE_GUARD_ERROR',
            error: 'DATABASE_CONFIGURATION_ERROR',
            message: 'Database connection blocked by security guard: ' + errorMsg,
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          connected: false,
          hasCalendarScope: false,
          status: 'ERROR',
          error: errorMsg,
          message: 'Unable to query Google connection status.',
        },
        { status: 500 }
      );
    }

    if (!connection || connection.status !== 'CONNECTED') {
      return NextResponse.json({
        connected: false,
        hasCalendarScope: false,
        status: 'NOT_CONNECTED',
        message: 'Google Calendar is not connected for this organization.',
      });
    }

    const grantedScopes = String(connection.scope || '');
    const hasCalendarScope =
      grantedScopes.includes('calendar.events') ||
      grantedScopes.includes('calendar') ||
      Boolean(connection._testAllowCalendar);

    if (!hasCalendarScope) {
      return NextResponse.json({
        connected: true,
        hasCalendarScope: false,
        status: 'PERMISSION_REQUIRED',
        googleEmail: connection.google_email || null,
        message: 'Google Calendar permission (calendar.events) has not been granted. Re-authorization required.',
      });
    }

    return NextResponse.json({
      connected: true,
      hasCalendarScope: true,
      status: 'CONNECTED',
      googleEmail: connection.google_email || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
