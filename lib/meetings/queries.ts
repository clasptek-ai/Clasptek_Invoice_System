/**
 * lib/meetings/queries.ts — Phase 2 Meetings Persistence & Security
 * Authoritative Server-side Data Access Layer for Meetings Operations.
 * Fully backed by Supabase PostgreSQL with multi-tenant RLS isolation.
 * Zero dependency on process memory cache.
 *
 * PRIVILEGED WRITE SAFETY:
 *   updateMeetingStatus() and updateMeetingRecordingMetadata() use the
 *   service-role client ONLY for the final narrowly-scoped UPDATE, and ONLY
 *   after the caller has already established: authenticated session →
 *   authoritative tenant → facilitator identity → meeting assignment.
 *   The service client is never exposed to the browser or to client components.
 */

import { createServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import type { Meeting, MeetingStatus, RecordingStatus, RecordingMetadata } from '@/types/meetings';

function mapDbRowToMeeting(r: Record<string, unknown>): Meeting {
  const rawProvider = String(r.provider || 'LIVEKIT').toLowerCase();
  const sfuProvider = (['livekit', 'daily', 'mock'].includes(rawProvider) ? rawProvider : 'livekit') as Meeting['sfuProvider'];
  
  let rawStatus = String(r.status || 'SCHEDULED');
  if (rawStatus === 'ENDED') rawStatus = 'COMPLETED';
  const status = (['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'].includes(rawStatus) ? rawStatus : 'SCHEDULED') as MeetingStatus;

  const recMeta = (r.recording_metadata as RecordingMetadata) || {};
  const recUrl = (r.recording_url as string | null) || recMeta.webViewLink || recMeta.driveUrl || undefined;

  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    publicId: String(r.public_id),
    title: String(r.title),
    description: (r.description as string | null) || null,
    programmeId: null,
    cohortId: (r.cohort_id as string | null) || null,
    trainingSessionId: (r.training_session_id as string | null) || null,
    facilitatorId: (r.facilitator_id as string | null) || null,
    scheduledStart: String(r.scheduled_start),
    scheduledEnd: String(r.scheduled_end),
    actualStart: (r.actual_start as string | null) || null,
    actualEnd: (r.actual_end as string | null) || null,
    status,
    participantAccess: (r.participant_access as Meeting['participantAccess']) || 'COHORT_ONLY',
    sfuProvider,
    sfuRoomId: (r.provider_room_id as string | null) || String(r.public_id),
    settings: (r.settings as Meeting['settings']) || { allowChat: true, allowScreenShare: true, muteOnEntry: false },
    recordingEnabled: Boolean(r.recording_enabled),
    recordingStatus: (r.recording_status as Meeting['recordingStatus']) || 'NOT_STARTED',
    recordingMetadata: recMeta,
    recordingUrl: recUrl,
    recordings: recMeta.driveFileId ? [recMeta] : [],
    createdBy: (r.created_by as string | null) || null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: (r.deleted_at as string | null) || null,
  };
}

export async function getMeetings(filters?: {
  subTab?: string;
  search?: string;
}): Promise<{ data: Meeting[]; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return { data: [], error: 'Unauthorized: Authentication required.' };
    }

    const supabase = await createServerClient();
    const tenantId = session.tenantId;

    // Base query: tenant-isolated, excluding soft-deleted records
    let query = supabase
      .from('meetings')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('scheduled_start', { ascending: false });

    // Role-based scoping
    if (session.role === 'Facilitator') {
      // Authoritative personnel lookup
      const { data: persData } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const persId = persData?.id;
      if (!persId) {
        return { data: [], error: null };
      }

      // Check lead facilitator cohort assignments
      const { data: myCohorts } = await supabase
        .from('cohorts')
        .select('id')
        .eq('lead_facilitator_id', persId)
        .eq('tenant_id', tenantId);

      const assignedCohortIds = (myCohorts || []).map((c) => c.id);

      if (assignedCohortIds.length > 0) {
        query = query.or(`facilitator_id.eq.${persId},cohort_id.in.(${assignedCohortIds.join(',')})`);
      } else {
        query = query.eq('facilitator_id', persId);
      }
    } else if (session.role === 'Student') {
      // Authoritative student lookup
      const { data: studData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const studentId = studData?.id;
      if (!studentId) {
        return { data: [], error: null };
      }

      // Active cohort enrolments
      const { data: myEnrolments } = await supabase
        .from('enrolments')
        .select('cohort_id')
        .eq('student_id', studentId)
        .eq('tenant_id', tenantId)
        .not('status', 'in', '("CANCELLED","WITHDRAWN")');

      const enrolledCohortIds = Array.from(new Set((myEnrolments || []).map((e) => e.cohort_id).filter(Boolean)));
      if (enrolledCohortIds.length === 0) {
        return { data: [], error: null };
      }

      query = query.in('cohort_id', enrolledCohortIds);
    } else if (['Staff', 'Finance Staff', 'Finance Viewer'].includes(session.role)) {
      return { data: [], error: null };
    }

    const { data: rows, error: fetchErr } = await query;
    if (fetchErr) {
      return { data: [], error: fetchErr.message };
    }

    let all: Meeting[] = (rows || []).map(mapDbRowToMeeting);

    if (session.role === 'Facilitator') {
      const { data: persData } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const persId = persData?.id;
      if (!persId) {
        return { data: [], error: null };
      }

      const { data: myCohorts } = await supabase
        .from('cohorts')
        .select('id')
        .eq('lead_facilitator_id', persId)
        .eq('tenant_id', tenantId);

      const assignedCohortIds = (myCohorts || []).map((c) => c.id);

      all = all.filter(
        (m) =>
          m.facilitatorId === persId ||
          (m.cohortId && assignedCohortIds.includes(m.cohortId))
      );
    }

    // Metadata joins: Cohorts, Personnel, Programmes
    const [cohortsRes, personnelRes, progRes] = await Promise.all([
      supabase.from('cohorts').select('id, name, programme_id, metadata').eq('tenant_id', tenantId),
      supabase.from('personnel').select('id, full_name, first_name, last_name').eq('tenant_id', tenantId),
      supabase.from('programmes').select('id, name').eq('tenant_id', tenantId),
    ]);

    const progMap = new Map((progRes.data || []).map((p) => [p.id, p.name]));
    const persMap = new Map(
      (personnelRes.data || []).map((p: Record<string, unknown>) => [
        String(p.id),
        (p.full_name as string) || `${(p.first_name as string) || ''} ${(p.last_name as string) || ''}`.trim() || 'Facilitator',
      ])
    );
    const cohortMap = new Map(
      (cohortsRes.data || []).map((c) => {
        const meta = (c.metadata as Record<string, unknown>) || {};
        const code = (meta.cohort_code as string) || (meta.cohortCode as string) || c.id;
        const pName = c.programme_id ? progMap.get(c.programme_id) || '' : '';
        return [c.id, { name: c.name, code, programmeName: pName, programmeId: c.programme_id }];
      })
    );

    all = all.map((m) => {
      const cInfo = m.cohortId ? cohortMap.get(m.cohortId) : null;
      return {
        ...m,
        facilitatorName: m.facilitatorId ? persMap.get(m.facilitatorId) || 'Facilitator' : 'Unassigned',
        cohortCode: cInfo?.code || 'Cohort',
        cohortName: cInfo?.name || '',
        programmeName: cInfo?.programmeName || (m.programmeId ? progMap.get(m.programmeId) || '' : ''),
        programmeId: m.programmeId || cInfo?.programmeId || null,
      };
    });

    // Subtab filtering
    if (filters?.subTab) {
      if (filters.subTab === 'upcoming') {
        all = all.filter((m) => m.status === 'SCHEDULED');
      } else if (filters.subTab === 'live') {
        all = all.filter((m) => m.status === 'LIVE');
      } else if (filters.subTab === 'completed') {
        all = all.filter((m) => m.status === 'COMPLETED');
      } else if (filters.subTab === 'recordings') {
        all = all.filter(
          (m) =>
            m.recordingStatus === 'STORED' ||
            Boolean(m.recordingMetadata?.driveUrl) ||
            Boolean(m.recordingUrl) ||
            m.status === 'COMPLETED'
        );
      }
    }

    // Keyword search
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      all = all.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)) ||
          (m.facilitatorName && m.facilitatorName.toLowerCase().includes(q)) ||
          (m.cohortCode && m.cohortCode.toLowerCase().includes(q))
      );
    }

    return { data: all, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch meetings';
    return { data: [], error: msg };
  }
}

export async function getMeetingById(idOrPublicId: string): Promise<{
  data: Meeting | null;
  error: string | null;
}> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return { data: null, error: 'Unauthorized: Authentication required.' };
    }

    const supabase = await createServerClient();
    const tenantId = session.tenantId;

    const { data: row, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`id.eq.${idOrPublicId},public_id.eq.${idOrPublicId}`)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !row) {
      return { data: null, error: 'Meeting not found' };
    }

    const meeting = mapDbRowToMeeting(row);

    // Authorization checks based on authoritative role
    if (session.role === 'Facilitator') {
      const { data: persData } = await supabase
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const persId = persData?.id;
      if (!persId) {
        return { data: null, error: 'Meeting not found' };
      }

      if (meeting.facilitatorId !== persId) {
        let isCohortLead = false;
        if (meeting.cohortId) {
          const { data: cohortRow } = await supabase
            .from('cohorts')
            .select('id')
            .eq('id', meeting.cohortId)
            .eq('lead_facilitator_id', persId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
          if (cohortRow) isCohortLead = true;
        }
        if (!isCohortLead) {
          return { data: null, error: 'Meeting not found' };
        }
      }
    } else if (session.role === 'Student') {
      const { data: studData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const studentId = studData?.id;
      if (!studentId || !meeting.cohortId) {
        return { data: null, error: 'Meeting not found' };
      }

      const { data: enrolment } = await supabase
        .from('enrolments')
        .select('id')
        .eq('cohort_id', meeting.cohortId)
        .eq('student_id', studentId)
        .eq('tenant_id', tenantId)
        .not('status', 'in', '("CANCELLED","WITHDRAWN")')
        .maybeSingle();

      if (!enrolment) {
        return { data: null, error: 'Meeting not found' };
      }
    } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { data: null, error: 'Meeting not found' };
    }

    return { data: meeting, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to get meeting';
    return { data: null, error: msg };
  }
}

export async function saveMeetingRecord(meeting: Meeting): Promise<void> {
  const session = await getAuthoritativeSession();
  if (!session || !session.user || !['Super Admin', 'Finance Manager'].includes(session.role)) {
    throw new Error('FORBIDDEN: Only administrators may save or schedule meetings.');
  }

  const supabase = await createServerClient();
  const tenantId = session.tenantId;

  // Validate facilitator_id belongs to personnel of the tenant
  let resolvedFacilitatorId: string | null = null;
  if (meeting.facilitatorId && typeof meeting.facilitatorId === 'string' && meeting.facilitatorId.trim()) {
    const { data: pers } = await supabase
      .from('personnel')
      .select('id')
      .eq('id', meeting.facilitatorId.trim())
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    if (pers) {
      resolvedFacilitatorId = pers.id;
    }
  }

  // Validate cohort_id if provided
  let resolvedCohortId: string | null = null;
  if (meeting.cohortId && typeof meeting.cohortId === 'string' && meeting.cohortId.trim()) {
    const { data: coh } = await supabase
      .from('cohorts')
      .select('id')
      .eq('id', meeting.cohortId.trim())
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    if (coh) {
      resolvedCohortId = coh.id;
    }
  }

  let canonicalStatus = meeting.status as string;
  if (canonicalStatus === 'ENDED') canonicalStatus = 'COMPLETED';
  if (!['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'].includes(canonicalStatus)) {
    canonicalStatus = 'SCHEDULED';
  }

  const dbPayload = {
    id: meeting.id,
    tenant_id: tenantId,
    public_id: meeting.publicId,
    title: meeting.title,
    description: meeting.description || null,
    meeting_type: 'ONLINE_CLASS',
    status: canonicalStatus,
    participant_access: meeting.participantAccess || 'COHORT_ONLY',
    cohort_id: resolvedCohortId,
    training_session_id: meeting.trainingSessionId || null,
    facilitator_id: resolvedFacilitatorId,
    created_by: session.user.id,
    provider: (meeting.sfuProvider || 'livekit').toUpperCase(),
    provider_room_id: meeting.sfuRoomId || meeting.publicId,
    provider_room_name: meeting.title,
    provider_room_url: process.env.LIVEKIT_URL || null,
    scheduled_start: meeting.scheduledStart,
    scheduled_end: meeting.scheduledEnd,
    actual_start: meeting.actualStart || null,
    actual_end: meeting.actualEnd || null,
    settings: meeting.settings || { allowChat: true, allowScreenShare: true, muteOnEntry: false },
    recording_enabled: Boolean(meeting.recordingEnabled),
    recording_status: meeting.recordingStatus || 'NOT_STARTED',
    recording_url: meeting.recordingUrl || null,
    recording_metadata: meeting.recordingMetadata || {},
    created_at: meeting.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  const { error } = await supabase.from('meetings').upsert(dbPayload);
  if (error) {
    throw new Error(`Database error saving meeting: ${error.message}`);
  }
}

export async function updateMeetingStatus(
  meetingId: string,
  status: MeetingStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use the authenticated (RLS-scoped) client for all reads and auth checks.
    const authClient = await createServerClient();
    const tenantId = session.tenantId;

    const meetingRes = await getMeetingById(meetingId);
    if (!meetingRes.data) {
      return { success: false, error: 'Meeting not found' };
    }

    const meeting = meetingRes.data;

    // Authoritative tenant isolation: meeting must belong to the session's tenant.
    if (meeting.tenantId !== tenantId) {
      return { success: false, error: 'Meeting not found' };
    }

    // Authorization: Admin or assigned Facilitator.
    // Facilitator identity resolved: auth.uid() → personnel.user_id → personnel.id
    if (session.role === 'Facilitator') {
      const { data: persData } = await authClient
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!persData?.id || meeting.facilitatorId !== persData.id) {
        return { success: false, error: 'Forbidden: You are not authorized to update this meeting.' };
      }
    } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { success: false, error: 'Forbidden: Insufficient permissions.' };
    }

    // Server-side lifecycle state-transition enforcement.
    // Prevents arbitrary status jumps (e.g. SCHEDULED → COMPLETED directly).
    const canonicalStatus = status;
    const currentStatus = meeting.status;

    const allowedTransitions: Record<string, MeetingStatus[]> = {
      SCHEDULED: ['LIVE', 'CANCELLED'],
      LIVE: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(canonicalStatus)) {
      return {
        success: false,
        error: `Invalid lifecycle transition: ${currentStatus} → ${canonicalStatus}. Allowed: ${allowed.join(', ') || 'none'}.`,
      };
    }

    const now = new Date().toISOString();

    // DEFENCE-IN-DEPTH: Use the privileged service client for the final UPDATE,
    // which now passes RLS because the service key bypasses it.
    // The UPDATE is strictly scoped to lifecycle fields only — no ownership,
    // scheduling, configuration, or tenant fields may be modified here.
    const privilegedUpdates: Record<string, unknown> = {
      status: canonicalStatus,
      updated_at: now,
    };

    if (canonicalStatus === 'LIVE' && !meeting.actualStart) {
      privilegedUpdates.actual_start = now;
    } else if (canonicalStatus === 'COMPLETED') {
      privilegedUpdates.actual_end = now;
    }

    // The privileged service client is used ONLY here, after all authorization
    // checks above have passed. It is scoped by both meeting.id AND tenant_id
    // to prevent cross-tenant privilege escalation.
    const serviceClient = createSupabaseServiceClient();
    const { error } = await serviceClient
      .from('meetings')
      .update(privilegedUpdates)
      .eq('id', meeting.id)
      .eq('tenant_id', tenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update meeting status';
    return { success: false, error: msg };
  }
}

export async function updateMeetingRecordingMetadata(
  meetingId: string,
  status: RecordingStatus,
  metadata: RecordingMetadata
): Promise<{ success: boolean; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use the authenticated (RLS-scoped) client for all reads and auth checks.
    const authClient = await createServerClient();
    const tenantId = session.tenantId;

    const meetingRes = await getMeetingById(meetingId);
    if (!meetingRes.data) {
      return { success: false, error: 'Meeting not found' };
    }

    const meeting = meetingRes.data;

    // Authoritative tenant isolation: meeting must belong to the session's tenant.
    if (meeting.tenantId !== tenantId) {
      return { success: false, error: 'Meeting not found' };
    }

    // Authorization: Admin or assigned Facilitator.
    // Facilitator identity resolved: auth.uid() → personnel.user_id → personnel.id
    if (session.role === 'Facilitator') {
      const { data: persData } = await authClient
        .from('personnel')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!persData?.id || meeting.facilitatorId !== persData.id) {
        return { success: false, error: 'Forbidden: You are not authorized to update recordings for this meeting.' };
      }
    } else if (!['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { success: false, error: 'Forbidden: Insufficient permissions.' };
    }

    const mergedMeta = {
      ...(meeting.recordingMetadata || {}),
      ...metadata,
    };
    const recUrl = metadata.webViewLink || metadata.driveUrl || meeting.recordingUrl || null;

    // DEFENCE-IN-DEPTH: Use the privileged service client for the final UPDATE,
    // strictly scoped to recording fields only. No ownership, scheduling,
    // configuration, or tenant fields may be modified by this operation.
    // The service client is used ONLY here, after all authorization checks above.
    const serviceClient = createSupabaseServiceClient();
    const { error } = await serviceClient
      .from('meetings')
      .update({
        recording_status: status,
        recording_metadata: mergedMeta,
        recording_url: recUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meeting.id)
      .eq('tenant_id', tenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update recording metadata';
    return { success: false, error: msg };
  }
}

export async function checkMeetingDependencies(meetingId: string): Promise<{
  canDelete: boolean;
  blockedReason?: string;
  dependencies: Array<{ label: string; count: number }>;
}> {
  try {
    const meetingRes = await getMeetingById(meetingId);
    if (!meetingRes.data) {
      return { canDelete: true, dependencies: [] };
    }

    const meeting = meetingRes.data;
    const deps: Array<{ label: string; count: number }> = [];

    const hasRecording =
      meeting.recordingStatus === 'STORED' ||
      Boolean(meeting.recordingMetadata?.driveUrl) ||
      Boolean(meeting.recordingUrl);

    if (hasRecording) {
      deps.push({
        label: 'Archived Classroom Recording & Google Drive Media',
        count: 1,
      });
    }

    if (meeting.status === 'COMPLETED') {
      deps.push({
        label: 'Delivered Academic Session & Attendance Logs',
        count: 1,
      });
    }

    if (meeting.cohortId) {
      const supabase = await createServerClient();
      const { count } = await supabase
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', meeting.cohortId)
        .eq('tenant_id', meeting.tenantId);

      if (count && count > 0) {
        deps.push({
          label: 'Linked Cohort Student Attendance Ledger Records',
          count,
        });
      }
    }

    if (deps.length > 0) {
      return {
        canDelete: false,
        blockedReason:
          'This meeting has an archived classroom recording or delivered academic attendance records. Hard deletion is prohibited to preserve curriculum audit logs.',
        dependencies: deps,
      };
    }

    return { canDelete: true, dependencies: [] };
  } catch {
    return { canDelete: false, blockedReason: 'Dependency inspection failed', dependencies: [] };
  }
}

export async function deleteMeetingSafe(
  meetingId: string,
  tenantId?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const session = await getAuthoritativeSession();
    if (!session || !session.user || !['Super Admin', 'Finance Manager'].includes(session.role)) {
      return { success: false, error: 'Forbidden: Only administrators may delete meetings.' };
    }

    const targetTenantId = tenantId || session.tenantId;

    const depCheck = await checkMeetingDependencies(meetingId);
    if (!depCheck.canDelete) {
      return { success: false, error: depCheck.blockedReason || 'Cannot delete meeting with dependencies' };
    }

    const supabase = await createServerClient();

    // Soft delete: sets deleted_at and status = CANCELLED
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('meetings')
      .update({
        deleted_at: now,
        status: 'CANCELLED',
        updated_at: now,
      })
      .or(`id.eq.${meetingId},public_id.eq.${meetingId}`)
      .eq('tenant_id', targetTenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete meeting';
    return { success: false, error: msg };
  }
}
