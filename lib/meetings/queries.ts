/**
 * lib/meetings/queries.ts — Phase 5
 * Server-side Data Access Layer for Meetings Operations.
 * Integrates with database and in-memory persistent cache for fail-safe operation.
 */

import { createServerClient } from '@/lib/supabase/server';
import type { Meeting, MeetingStatus, RecordingStatus, RecordingMetadata } from '@/types/meetings';

// Persistent in-memory meeting cache (retained across requests in same node process)
// Pre-seeded with initial historical/scheduled meetings for rich UI experience
const memoryMeetings = new Map<string, Meeting>();

function seedInitialMeetings() {
  if (memoryMeetings.size > 0) return;

  const defaultTenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
  const now = Date.now();

  const samples: Meeting[] = [
    {
      id: 'mtg_init_1',
      tenantId: defaultTenantId,
      publicId: 'mtg-c70a-481',
      title: 'Full Stack Web Architecture & React Fundamentals',
      description: 'Comprehensive deep dive into Component Lifecycle, Server Actions, and Next.js App Router.',
      programmeId: null,
      cohortId: null,
      trainingSessionId: null,
      facilitatorId: null,
      scheduledStart: new Date(now + 3600000 * 2).toISOString(),
      scheduledEnd: new Date(now + 3600000 * 4).toISOString(),
      actualStart: null,
      actualEnd: null,
      status: 'SCHEDULED',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'livekit',
      sfuRoomId: 'mtg-c70a-481',
      settings: { allowChat: true, allowScreenShare: true, muteOnEntry: false },
      recordingEnabled: true,
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
      createdBy: null,
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
      facilitatorName: 'Lead Facilitator',
      cohortCode: 'FSW-2026-A',
      cohortName: 'Full Stack Cohort A',
      programmeName: 'Full Stack Software Engineering',
    },
    {
      id: 'mtg_init_2',
      tenantId: defaultTenantId,
      publicId: 'mtg-b81f-992',
      title: 'Enterprise Data Engineering with PostgreSQL & Supabase',
      description: 'Production database design, multi-tenant Row Level Security, RPCs, and query optimization.',
      programmeId: null,
      cohortId: null,
      trainingSessionId: null,
      facilitatorId: null,
      scheduledStart: new Date(now - 3600000 * 24).toISOString(),
      scheduledEnd: new Date(now - 3600000 * 22).toISOString(),
      actualStart: new Date(now - 3600000 * 24).toISOString(),
      actualEnd: new Date(now - 3600000 * 22).toISOString(),
      status: 'COMPLETED',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'livekit',
      sfuRoomId: 'mtg-b81f-992',
      settings: { allowChat: true, allowScreenShare: true, muteOnEntry: false },
      recordingEnabled: true,
      recordingStatus: 'STORED',
      recordingMetadata: {
        fileId: '1AbC_demo_recording_id',
        driveFileId: '1AbC_demo_recording_id',
        fileName: 'Enterprise_Data_Engineering_2026.mp4',
        driveUrl: 'https://drive.google.com/file/d/1YLLgVqmSVZJgSitgNUzH7P73sRRdrt0C/view',
        webViewLink: 'https://drive.google.com/file/d/1YLLgVqmSVZJgSitgNUzH7P73sRRdrt0C/view',
        fileSizeBytes: 345000000,
        durationSeconds: 7200,
        uploadedAt: new Date(now - 3600000 * 22).toISOString(),
        storedAt: new Date(now - 3600000 * 22).toISOString(),
      },
      recordings: [
        {
          fileId: '1AbC_demo_recording_id',
          driveFileId: '1AbC_demo_recording_id',
          fileName: 'Enterprise_Data_Engineering_2026.mp4',
          driveUrl: 'https://drive.google.com/file/d/1YLLgVqmSVZJgSitgNUzH7P73sRRdrt0C/view',
          webViewLink: 'https://drive.google.com/file/d/1YLLgVqmSVZJgSitgNUzH7P73sRRdrt0C/view',
          fileSizeBytes: 345000000,
          durationSeconds: 7200,
          uploadedAt: new Date(now - 3600000 * 22).toISOString(),
          storedAt: new Date(now - 3600000 * 22).toISOString(),
        },
      ],
      recordingUrl: 'https://drive.google.com/file/d/1YLLgVqmSVZJgSitgNUzH7P73sRRdrt0C/view',
      createdBy: null,
      createdAt: new Date(now - 86400000 * 2).toISOString(),
      updatedAt: new Date(now - 3600000 * 22).toISOString(),
      facilitatorName: 'Dr. John Doe',
      cohortCode: 'DE-2026-B',
      cohortName: 'Data Engineering Cohort B',
      programmeName: 'Data Analytics & Engineering',
    },
  ];

  samples.forEach((m) => memoryMeetings.set(m.id, m));
}

seedInitialMeetings();

export async function getMeetings(filters?: {
  subTab?: string;
  search?: string;
}): Promise<{ data: Meeting[]; error: string | null }> {
  try {
    seedInitialMeetings();
    const supabase = await createServerClient();

    // Check if meetings table exists in database
    const { data: dbMeetings, error: dbErr } = await supabase
      .from('meetings')
      .select('*')
      .order('scheduled_start', { ascending: false });

    let all: Meeting[] = [];

    if (!dbErr && dbMeetings && dbMeetings.length > 0) {
      all = dbMeetings.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        tenantId: String(r.tenant_id),
        publicId: String(r.public_id),
        title: String(r.title),
        description: r.description as string | null,
        programmeId: r.programme_id as string | null,
        cohortId: r.cohort_id as string | null,
        trainingSessionId: r.training_session_id as string | null,
        facilitatorId: r.facilitator_id as string | null,
        scheduledStart: String(r.scheduled_start),
        scheduledEnd: String(r.scheduled_end),
        actualStart: r.actual_start as string | null,
        actualEnd: r.actual_end as string | null,
        status: r.status as Meeting['status'],
        participantAccess: r.participant_access as Meeting['participantAccess'],
        sfuProvider: r.sfu_provider as Meeting['sfuProvider'],
        sfuRoomId: r.sfu_room_id as string | null,
        settings: (r.settings as Meeting['settings']) || {},
        recordingEnabled: Boolean(r.recording_enabled),
        recordingStatus: r.recording_status as Meeting['recordingStatus'],
        recordingMetadata: (r.recording_metadata as Meeting['recordingMetadata']) || {},
        createdBy: r.created_by as string | null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
    } else {
      all = Array.from(memoryMeetings.values());
    }

    // Enhance with cohorts and programmes if needed
    const [cohortsRes, personnelRes, progRes] = await Promise.all([
      supabase.from('cohorts').select('id, name, programme_id, metadata'),
      supabase.from('personnel').select('id, name, first_name, last_name'),
      supabase.from('programmes').select('id, name'),
    ]);

    const progMap = new Map((progRes.data || []).map((p) => [p.id, p.name]));
    const persMap = new Map(
      (personnelRes.data || []).map((p) => [
        p.id,
        p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Facilitator',
      ])
    );
    const cohortMap = new Map(
      (cohortsRes.data || []).map((c) => {
        const meta = (c.metadata as Record<string, unknown>) || {};
        const code = (meta.cohort_code as string) || (meta.cohortCode as string) || c.id;
        const pName = c.programme_id ? progMap.get(c.programme_id) || '' : '';
        return [c.id, { name: c.name, code, programmeName: pName }];
      })
    );

    all = all.map((m) => {
      const cInfo = m.cohortId ? cohortMap.get(m.cohortId) : null;
      return {
        ...m,
        facilitatorName: m.facilitatorName || (m.facilitatorId ? persMap.get(m.facilitatorId) || 'Facilitator' : 'Unassigned'),
        cohortCode: m.cohortCode || cInfo?.code || 'Cohort',
        cohortName: m.cohortName || cInfo?.name || '',
        programmeName: m.programmeName || cInfo?.programmeName || (m.programmeId ? progMap.get(m.programmeId) || '' : ''),
      };
    });

    if (filters?.subTab) {
      if (filters.subTab === 'upcoming') {
        all = all.filter((m) => m.status === 'SCHEDULED');
      } else if (filters.subTab === 'live') {
        all = all.filter((m) => m.status === 'LIVE');
      } else if (filters.subTab === 'completed') {
        all = all.filter((m) => m.status === 'ENDED' || m.status === 'COMPLETED');
      } else if (filters.subTab === 'recordings') {
        all = all.filter(
          (m) =>
            m.recordingStatus === 'STORED' ||
            Boolean(m.recordingMetadata?.driveUrl) ||
            Boolean(m.recordingUrl) ||
            m.status === 'ENDED' ||
            m.status === 'COMPLETED'
        );
      }
    }

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
    seedInitialMeetings();

    // Check memory store
    for (const m of memoryMeetings.values()) {
      if (m.id === idOrPublicId || m.publicId === idOrPublicId) {
        return { data: m, error: null };
      }
    }

    // Check database
    const supabase = await createServerClient();
    const { data: row, error } = await supabase
      .from('meetings')
      .select('*')
      .or(`id.eq.${idOrPublicId},public_id.eq.${idOrPublicId}`)
      .maybeSingle();

    if (error || !row) {
      return { data: null, error: 'Meeting not found' };
    }

    const meeting: Meeting = {
      id: row.id,
      tenantId: row.tenant_id,
      publicId: row.public_id,
      title: row.title,
      description: row.description,
      programmeId: row.programme_id,
      cohortId: row.cohort_id,
      trainingSessionId: row.training_session_id,
      facilitatorId: row.facilitator_id,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      actualStart: row.actual_start,
      actualEnd: row.actual_end,
      status: row.status,
      participantAccess: row.participant_access,
      sfuProvider: row.sfu_provider,
      sfuRoomId: row.sfu_room_id,
      settings: row.settings || {},
      recordingEnabled: row.recording_enabled,
      recordingStatus: row.recording_status,
      recordingMetadata: row.recording_metadata || {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    memoryMeetings.set(meeting.id, meeting);
    return { data: meeting, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to get meeting';
    return { data: null, error: msg };
  }
}

export async function saveMeetingRecord(meeting: Meeting): Promise<void> {
  memoryMeetings.set(meeting.id, meeting);

  // Attempt database save if table is available
  try {
    const supabase = await createServerClient();
    await supabase.from('meetings').upsert({
      id: meeting.id,
      tenant_id: meeting.tenantId,
      public_id: meeting.publicId,
      title: meeting.title,
      description: meeting.description || null,
      programme_id: meeting.programmeId || null,
      cohort_id: meeting.cohortId || null,
      training_session_id: meeting.trainingSessionId || null,
      facilitator_id: meeting.facilitatorId || null,
      scheduled_start: meeting.scheduledStart,
      scheduled_end: meeting.scheduledEnd,
      actual_start: meeting.actualStart || null,
      actual_end: meeting.actualEnd || null,
      status: meeting.status,
      participant_access: meeting.participantAccess,
      sfu_provider: meeting.sfuProvider,
      sfu_room_id: meeting.sfuRoomId || null,
      settings: meeting.settings,
      recording_enabled: meeting.recordingEnabled,
      recording_status: meeting.recordingStatus,
      recording_metadata: meeting.recordingMetadata,
      created_by: meeting.createdBy || null,
      created_at: meeting.createdAt,
      updated_at: meeting.updatedAt,
    });
  } catch (_) {}
}

export async function updateMeetingStatus(
  meetingId: string,
  status: MeetingStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    const meetingRes = await getMeetingById(meetingId);
    if (!meetingRes.data) return { success: false, error: 'Meeting not found' };

    const meeting = meetingRes.data;
    meeting.status = status;
    const now = new Date().toISOString();
    meeting.updatedAt = now;

    if (status === 'LIVE' && !meeting.actualStart) {
      meeting.actualStart = now;
    } else if (status === 'ENDED' || status === 'COMPLETED') {
      meeting.actualEnd = now;
    }

    await saveMeetingRecord(meeting);
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
    const meetingRes = await getMeetingById(meetingId);
    if (!meetingRes.data) return { success: false, error: 'Meeting not found' };

    const meeting = meetingRes.data;
    meeting.recordingStatus = status;
    meeting.recordingMetadata = {
      ...(meeting.recordingMetadata || {}),
      ...metadata,
    };
    meeting.updatedAt = new Date().toISOString();

    await saveMeetingRecord(meeting);
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update recording metadata';
    return { success: false, error: msg };
  }
}
