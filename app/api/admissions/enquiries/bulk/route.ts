/**
 * app/api/admissions/enquiries/bulk/route.ts
 * Bulk and Safe Lifecycle API for Enquiries
 * Supports: CHECK_DEPENDENCIES, UPDATE_STATUS, and DELETE with referential checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import {
  checkEnquiriesDependencies,
  bulkUpdateEnquiriesStatus,
  deleteEnquiriesSafe,
} from '@/lib/admissions/queries';
import type { EnquiryStatus } from '@/types/admissions';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff'];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions for admissions management.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, enquiryIds, status, reason } = body || {};

    if (!Array.isArray(enquiryIds) || enquiryIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of enquiryIds is required.' },
        { status: 400 }
      );
    }

    if (action === 'CHECK_DEPENDENCIES') {
      const reports = await checkEnquiriesDependencies(enquiryIds, session.tenantId);
      return NextResponse.json({ ok: true, reports });
    }

    if (action === 'UPDATE_STATUS') {
      if (!status) {
        return NextResponse.json({ error: 'Status is required.' }, { status: 400 });
      }
      const res = await bulkUpdateEnquiriesStatus(enquiryIds, status as EnquiryStatus, session.tenantId);
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Failed to update status.' }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: `Successfully updated status for ${res.updatedCount} enquiry record(s).`,
      });
    }

    if (action === 'DELETE') {
      // Deletion requires Super Admin or Staff
      if (!['Super Admin', 'Staff'].includes(session.role)) {
        return NextResponse.json(
          { error: 'Forbidden: Role not authorized to delete enquiries.' },
          { status: 403 }
        );
      }

      const res = await deleteEnquiriesSafe(enquiryIds, reason, session.tenantId);
      if (!res.success) {
        return NextResponse.json(
          { error: res.error || 'Deletion blocked by dependencies.', blocked: res.blocked },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        deletedCount: res.deleted.length,
        blocked: res.blocked,
        message: `Successfully deleted ${res.deleted.length} enquiry record(s).`,
      });
    }

    return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Admissions Enquiries Bulk POST error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
