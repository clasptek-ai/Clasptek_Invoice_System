/**
 * lib/meetings/guest-requests.ts — Clasptek Meetings LiveKit Only
 * Service module for External Guest Requests and Waiting Room Lifecycle.
 * Supports:
 * - Request creation (PENDING)
 * - Guest status polling by secure session secret
 * - Host listing of pending and active requests
 * - Host decision (APPROVE with short-lived LiveKit token, REJECT, REVOKE)
 * - Dual-layer storage: Supabase PostgreSQL `public.meeting_guest_requests`
 *   with resilient in-memory fallback if the migration has not yet been applied.
 */

import crypto from 'crypto';
import { createSupabaseServiceClient, createServerClient } from '@/lib/supabase/server';
import { getSFUService } from '@/lib/meetings/sfu';

export interface GuestRequestRecord {
  id: string;
  tenantId: string;
  meetingId: string;
  meetingPublicId: string;
  guestName: string;
  guestEmail: string;
  guestOrganization?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
  requestToken: string;
  livekitToken?: string | null;
  livekitServerUrl?: string | null;
  requestedAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  expiresAt: string;
}

// Resilient memory store for environments where migration has not yet been applied
const memoryGuestRequests = new Map<string, GuestRequestRecord>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a pending guest request
 */
export async function createGuestRequest(params: {
  tenantId: string;
  meetingId: string;
  meetingPublicId: string;
  guestName: string;
  guestEmail: string;
  guestOrganization?: string | null;
}): Promise<{ success: boolean; requestId: string; requestToken: string }> {
  const id = generateId('greq');
  const requestToken = generateSecureToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 3600000).toISOString();

  const record: GuestRequestRecord = {
    id,
    tenantId: params.tenantId,
    meetingId: params.meetingId,
    meetingPublicId: params.meetingPublicId,
    guestName: params.guestName.trim(),
    guestEmail: params.guestEmail.trim().toLowerCase(),
    guestOrganization: params.guestOrganization ? params.guestOrganization.trim() : null,
    status: 'PENDING',
    requestToken,
    livekitToken: null,
    livekitServerUrl: null,
    requestedAt: now.toISOString(),
    decidedAt: null,
    decidedBy: null,
    expiresAt,
  };

  // Always store in memory for resilience
  memoryGuestRequests.set(id, record);

  // Attempt database persistence via service client
  try {
    const supabase = createSupabaseServiceClient();
    await supabase.from('meeting_guest_requests').insert({
      id: record.id,
      tenant_id: record.tenantId,
      meeting_id: record.meetingId,
      meeting_public_id: record.meetingPublicId,
      guest_name: record.guestName,
      guest_email: record.guestEmail,
      guest_organization: record.guestOrganization,
      status: record.status,
      request_token: record.requestToken,
      requested_at: record.requestedAt,
      expires_at: record.expiresAt,
    });
  } catch {
    // Database table not present; memory fallback holds record
  }

  return { success: true, requestId: id, requestToken };
}

/**
 * Look up guest request by ID and high-entropy requestToken (for guest polling)
 */
export async function getGuestRequestByToken(
  requestId: string,
  requestToken: string
): Promise<GuestRequestRecord | null> {
  // Check memory store first
  const memoryRec = memoryGuestRequests.get(requestId);
  if (memoryRec && memoryRec.requestToken === requestToken) {
    return memoryRec;
  }

  // Attempt DB query
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from('meeting_guest_requests')
      .select('*')
      .eq('id', requestId)
      .eq('request_token', requestToken)
      .maybeSingle();

    if (data) {
      const dbRec: GuestRequestRecord = {
        id: data.id,
        tenantId: data.tenant_id,
        meetingId: data.meeting_id,
        meetingPublicId: data.meeting_public_id,
        guestName: data.guest_name,
        guestEmail: data.guest_email,
        guestOrganization: data.guest_organization,
        status: data.status,
        requestToken: data.request_token,
        livekitToken: data.livekit_token,
        livekitServerUrl: data.livekit_server_url,
        requestedAt: data.requested_at,
        decidedAt: data.decided_at,
        decidedBy: data.decided_by,
        expiresAt: data.expires_at,
      };
      memoryGuestRequests.set(dbRec.id, dbRec);
      return dbRec;
    }
  } catch {
    // DB query error
  }

  return null;
}

/**
 * List pending guest requests for a meeting (Host view)
 */
export async function listGuestRequestsForMeeting(
  meetingPublicId: string,
  tenantId: string
): Promise<GuestRequestRecord[]> {
  const results: GuestRequestRecord[] = [];

  // 1. Check memory store
  for (const rec of memoryGuestRequests.values()) {
    if (rec.meetingPublicId === meetingPublicId && rec.tenantId === tenantId) {
      results.push(rec);
    }
  }

  // 2. Attempt DB query if possible
  try {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from('meeting_guest_requests')
      .select('*')
      .eq('meeting_public_id', meetingPublicId)
      .eq('tenant_id', tenantId)
      .order('requested_at', { ascending: false });

    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (!results.some((r) => r.id === row.id)) {
          results.push({
            id: row.id,
            tenantId: row.tenant_id,
            meetingId: row.meeting_id,
            meetingPublicId: row.meeting_public_id,
            guestName: row.guest_name,
            guestEmail: row.guest_email,
            guestOrganization: row.guest_organization,
            status: row.status,
            requestToken: row.request_token,
            livekitToken: row.livekit_token,
            livekitServerUrl: row.livekit_server_url,
            requestedAt: row.requested_at,
            decidedAt: row.decided_at,
            decidedBy: row.decided_by,
            expiresAt: row.expires_at,
          });
        }
      }
    }
  } catch {
    // DB not available, rely on memory store
  }

  return results;
}

/**
 * Host Decision: APPROVE, REJECT, or REVOKE
 */
export async function decideGuestRequest(params: {
  requestId: string;
  decision: 'APPROVE' | 'REJECT' | 'REVOKE';
  deciderUserId: string;
  tenantId: string;
  meetingPublicId: string;
}): Promise<{ success: boolean; status: string; error?: string }> {
  // Find record
  let record = memoryGuestRequests.get(params.requestId);

  if (!record) {
    try {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from('meeting_guest_requests')
        .select('*')
        .eq('id', params.requestId)
        .eq('tenant_id', params.tenantId)
        .maybeSingle();

      if (data) {
        record = {
          id: data.id,
          tenantId: data.tenant_id,
          meetingId: data.meeting_id,
          meetingPublicId: data.meeting_public_id,
          guestName: data.guest_name,
          guestEmail: data.guest_email,
          guestOrganization: data.guest_organization,
          status: data.status,
          requestToken: data.request_token,
          livekitToken: data.livekit_token,
          livekitServerUrl: data.livekit_server_url,
          requestedAt: data.requested_at,
          decidedAt: data.decided_at,
          decidedBy: data.decided_by,
          expiresAt: data.expires_at,
        };
        memoryGuestRequests.set(record.id, record);
      }
    } catch {
      // Ignore
    }
  }

  if (!record) {
    return { success: false, status: 'NOT_FOUND', error: 'Guest request not found.' };
  }

  // Cross-tenant verification
  if (record.tenantId !== params.tenantId) {
    return { success: false, status: 'FORBIDDEN', error: 'Cross-tenant access forbidden.' };
  }

  // Check guest request expiration
  if (new Date(record.expiresAt) <= new Date()) {
    return { success: false, status: 'EXPIRED', error: 'Guest request has expired.' };
  }

  const nowIso = new Date().toISOString();

  if (params.decision === 'APPROVE') {
    // Enforce invariants: Never issue LiveKit tokens for Google Meet meetings or closed sessions
    try {
      const { getMeetingById } = await import('@/lib/meetings/queries');
      const mRes = await getMeetingById(record.meetingPublicId);
      if (mRes.data && mRes.data.sfuProvider === 'google_meet') {
        return {
          success: false,
          status: 'INVALID_PROVIDER',
          error: 'Google Meet meetings do not issue LiveKit tokens. Admission is managed directly by Google Meet.',
        };
      }
      if (mRes.data && (mRes.data.status === 'COMPLETED' || mRes.data.status === 'CANCELLED')) {
        return {
          success: false,
          status: 'MEETING_CLOSED',
          error: 'Cannot admit guests to an ended or cancelled meeting.',
        };
      }
    } catch {
      // ignore
    }

    // Generate restricted short-lived LiveKit token (2 hours TTL, role: GUEST, roomAdmin: false)
    const sfu = getSFUService();
    const tokenResult = await sfu.generateParticipantToken({
      roomId: record.meetingPublicId,
      participantId: `guest_${record.id}`,
      participantName: `${record.guestName} (Guest)`,
      isHost: false,
      role: 'GUEST',
      ttlSeconds: 2 * 60 * 60,
      canPublish: true,
    });

    record.status = 'APPROVED';
    record.livekitToken = tokenResult.token;
    record.livekitServerUrl = tokenResult.serverUrl;
    record.decidedAt = nowIso;
    record.decidedBy = params.deciderUserId;
  } else if (params.decision === 'REJECT') {
    record.status = 'REJECTED';
    record.decidedAt = nowIso;
    record.decidedBy = params.deciderUserId;
  } else if (params.decision === 'REVOKE') {
    record.status = 'REVOKED';
    record.livekitToken = null;
    record.decidedAt = nowIso;
    record.decidedBy = params.deciderUserId;
  }

  memoryGuestRequests.set(record.id, record);

  // Update DB record
  try {
    const supabase = createSupabaseServiceClient();
    await supabase
      .from('meeting_guest_requests')
      .update({
        status: record.status,
        livekit_token: record.livekitToken,
        livekit_server_url: record.livekitServerUrl,
        decided_at: record.decidedAt,
        decided_by: record.decidedBy,
        updated_at: nowIso,
      })
      .eq('id', record.id);
  } catch {
    // Handled in memory
  }

  return { success: true, status: record.status };
}
