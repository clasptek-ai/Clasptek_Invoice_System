'use client';

/**
 * app/meetings/MeetingsPageClient.tsx — Phase 5
 * Interactive Client Component for Meetings & Live Video Operations.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting, GoogleDriveStatus } from '@/types/meetings';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface MeetingsPageClientProps {
  initialMeetings: Meeting[];
  initialDriveStatus: GoogleDriveStatus;
  cohorts: Array<{ id: string; cohortCode: string; name: string }>;
  personnel: Array<{ id: string; name: string; role: string }>;
  programmes: Array<{ id: string; name: string }>;
  currentSubTab: string;
  currentSearch: string;
  currentUser: { id: string; email: string; name: string; role: string };
}

export function MeetingsPageClient({
  initialMeetings,
  initialDriveStatus,
  cohorts,
  personnel,
  programmes,
  currentSubTab,
  currentSearch,
  currentUser,
}: MeetingsPageClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus>(initialDriveStatus);
  const [subTab, setSubTab] = useState(currentSubTab);
  const [search, setSearch] = useState(currentSearch);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [watchModalMeeting, setWatchModalMeeting] = useState<Meeting | null>(null);
  const [activeLiveMeeting, setActiveLiveMeeting] = useState<Meeting | null>(null);

  // Live meeting session state
  const [liveSessionState, setLiveSessionState] = useState<{
    token: string;
    isHost: boolean;
    isMicOn: boolean;
    isCamOn: boolean;
    isRecording: boolean;
    chatMessages: Array<{ sender: string; text: string; time: string }>;
    chatInput: string;
    participants: string[];
  } | null>(null);

  // Schedule meeting form
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    description: '',
    programmeId: programmes.length > 0 ? programmes[0].id : '',
    cohortId: cohorts.length > 0 ? cohorts[0].id : '',
    facilitatorId: personnel.length > 0 ? personnel[0].id : '',
    scheduledStart: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    scheduledEnd: new Date(Date.now() + 3600000 * 3).toISOString().slice(0, 16),
    participantAccess: 'COHORT_ONLY',
    allowChat: true,
    allowScreenShare: true,
    muteOnEntry: false,
  });

  const upcomingMeetings = [...meetings.filter((m) => m.status === 'SCHEDULED')].sort(
    (a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() || a.id.localeCompare(b.id)
  );
  const liveMeetings = meetings.filter((m) => m.status === 'LIVE');
  const completedMeetings = [...meetings.filter(
    (m) => m.status === 'ENDED' || m.status === 'COMPLETED'
  )].sort(
    (a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime() || b.id.localeCompare(a.id)
  );
  const recordingMeetings = [...meetings.filter(
    (m) =>
      m.recordingStatus === 'STORED' ||
      Boolean(m.recordingMetadata?.driveUrl) ||
      Boolean(m.recordingUrl) ||
      m.status === 'ENDED' ||
      m.status === 'COMPLETED'
  )].sort(
    (a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime() || b.id.localeCompare(a.id)
  );

  let displayed = meetings;
  if (subTab === 'upcoming') displayed = upcomingMeetings;
  else if (subTab === 'live') displayed = liveMeetings;
  else if (subTab === 'completed') displayed = completedMeetings;
  else if (subTab === 'recordings') displayed = recordingMeetings;

  if (search.trim()) {
    const q = search.toLowerCase().trim();
    displayed = displayed.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.facilitatorName && m.facilitatorName.toLowerCase().includes(q)) ||
        (m.cohortCode && m.cohortCode.toLowerCase().includes(q))
    );
  }

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedMeetings,
    setPage,
    setPageSize,
  } = usePagination(displayed, {
    initialPageSize: 25,
    resetDeps: [subTab, search],
  });

  // Multi-row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    meetingIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'DELETE',
    meetingIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const visibleIds = paginatedMeetings.map((m) => m.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      const someSelected = visibleIds.some((id) => selectedIds.has(id));
      headerCheckboxRef.current.indeterminate = someSelected && !isAllSelected;
    }
  }, [selectedIds, visibleIds, isAllSelected]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Open Cancel / Delete Meeting Modal with referential integrity dependency inspection
  const handleOpenDeleteModal = async (ids: string[], targetIdentifier?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'DELETE',
      meetingIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected meeting(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: true,
    });

    try {
      const deps: RecordDependencyItem[] = [];
      let blockedMsg: string | null = null;

      for (const id of ids) {
        const m = meetings.find((x) => x.id === id);
        if (m) {
          const hasRecording =
            m.recordingStatus === 'STORED' ||
            Boolean(m.recordingMetadata?.driveUrl) ||
            Boolean(m.recordingUrl);
          if (hasRecording) {
            deps.push({
              label: `Archived Video Recording (${m.title})`,
              count: 1,
            });
            blockedMsg = 'Hard deletion is blocked: Completed or recorded meetings must be preserved for academic accreditation and student review.';
          }
          if (m.status === 'ENDED' || m.status === 'COMPLETED') {
            deps.push({
              label: `Attendance Ledger (${m.title})`,
              count: 1,
            });
            blockedMsg = 'Completed academic meetings preserve learner attendance logs and cannot be deleted.';
          }
        }
      }

      setLifecycleModal((prev) => ({
        ...prev,
        dependencies: deps,
        blockedMessage: blockedMsg,
        isLoading: false,
      }));
    } catch {
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleConfirmDelete = async () => {
    const { meetingIds } = lifecycleModal;
    if (meetingIds.length === 0) return;

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    let deletedCount = 0;
    try {
      for (const id of meetingIds) {
        const res = await fetch('/api/meetings/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'DELETE_MEETING', meetingId: id }),
        });
        if (res.ok) {
          deletedCount++;
        }
      }

      setMeetings((prev) => prev.filter((m) => !meetingIds.includes(m.id)));
      setLifecycleModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
      handleClearSelection();
      setFeedbackMsg({ type: 'success', text: `Removed ${deletedCount} meeting session(s).` });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting meeting';
      setFeedbackMsg({ type: 'error', text: msg });
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Subtab switch
  const handleTabChange = (tab: string) => {
    setSubTab(tab);
    startTransition(() => {
      const sp = new URLSearchParams();
      if (tab !== 'all') sp.set('subTab', tab);
      if (search.trim()) sp.set('search', search.trim());
      router.push(`/meetings?${sp.toString()}`);
    });
  };

  // Schedule meeting submission
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingForm.title.trim()) {
      alert('Meeting title is required');
      return;
    }

    try {
      const res = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetingForm.title.trim(),
          description: meetingForm.description.trim(),
          programmeId: meetingForm.programmeId || null,
          cohortId: meetingForm.cohortId || null,
          facilitatorId: meetingForm.facilitatorId || currentUser.id,
          scheduledStart: new Date(meetingForm.scheduledStart).toISOString(),
          scheduledEnd: new Date(meetingForm.scheduledEnd).toISOString(),
          participantAccess: meetingForm.participantAccess,
          settings: {
            allowChat: meetingForm.allowChat,
            allowScreenShare: meetingForm.allowScreenShare,
            muteOnEntry: meetingForm.muteOnEntry,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to schedule meeting');
        return;
      }

      setIsScheduleModalOpen(false);
      setMeetings((prev) => [data.meeting, ...prev]);
      setFeedbackMsg({ type: 'success', text: `Meeting scheduled: ${data.meeting.title}` });
      setTimeout(() => setFeedbackMsg(null), 3000);
      startTransition(() => router.refresh());
    } catch {
      alert('Network error scheduling meeting');
    }
  };

  // Join meeting handler
  const handleJoinMeeting = async (meeting: Meeting) => {
    try {
      const res = await fetch('/api/meetings/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          publicId: meeting.publicId,
          displayName: currentUser.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || data.error || 'Failed to join meeting');
        return;
      }

      // Enter live meeting mode
      setActiveLiveMeeting(meeting);
      setLiveSessionState({
        token: data.token,
        isHost: data.isHost,
        isMicOn: true,
        isCamOn: true,
        isRecording: meeting.recordingStatus === 'RECORDING',
        chatMessages: [
          {
            sender: 'System',
            text: `Connected to ${meeting.title} (${data.sfuProvider.toUpperCase()} SFU)`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
        chatInput: '',
        participants: [currentUser.name, 'Facilitator (Host)'],
      });

      // Update meeting status locally if it became LIVE
      if (meeting.status === 'SCHEDULED' && data.isHost) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === meeting.id ? { ...m, status: 'LIVE' } : m))
        );
      }
    } catch {
      alert('Network error joining meeting');
    }
  };

  // Live room end / leave
  const handleEndLiveMeeting = async () => {
    if (!activeLiveMeeting) return;
    try {
      await fetch('/api/meetings/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'END_MEETING',
          meetingId: activeLiveMeeting.id,
          publicId: activeLiveMeeting.publicId,
        }),
      });

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === activeLiveMeeting.id ? { ...m, status: 'COMPLETED' } : m
        )
      );
      setActiveLiveMeeting(null);
      setLiveSessionState(null);
      setFeedbackMsg({ type: 'success', text: 'Meeting successfully ended.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      startTransition(() => router.refresh());
    } catch {
      setActiveLiveMeeting(null);
      setLiveSessionState(null);
    }
  };

  // Toggle Live Recording & Upload to Google Drive
  const handleToggleRecording = async () => {
    if (!activeLiveMeeting || !liveSessionState) return;

    if (!liveSessionState.isRecording) {
      // Start Recording
      setLiveSessionState((p) => (p ? { ...p, isRecording: true } : null));
      setFeedbackMsg({ type: 'success', text: 'Recording started...' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } else {
      // Stop Recording & Upload to Google Drive
      setLiveSessionState((p) => (p ? { ...p, isRecording: false } : null));
      setFeedbackMsg({ type: 'success', text: 'Processing & uploading recording to Google Drive...' });

      try {
        const res = await fetch('/api/meetings/upload-recording', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: activeLiveMeeting.id,
            publicId: activeLiveMeeting.publicId,
            durationSeconds: 1800,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setFeedbackMsg({
            type: 'success',
            text: 'Recording successfully archived to Google Drive Central Repository!',
          });
          setMeetings((prev) =>
            prev.map((m) =>
              m.id === activeLiveMeeting.id
                ? {
                    ...m,
                    recordingStatus: 'STORED',
                    recordingMetadata: data.recording,
                    recordingUrl: data.recording.driveUrl,
                  }
                : m
            )
          );
        } else {
          setFeedbackMsg({ type: 'error', text: 'Recording upload failed' });
        }
      } catch {
        setFeedbackMsg({ type: 'error', text: 'Network error uploading recording' });
      }
    }
  };

  // Send chat message in live room
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSessionState || !liveSessionState.chatInput.trim()) return;

    const newMsg = {
      sender: currentUser.name,
      text: liveSessionState.chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setLiveSessionState((p) =>
      p
        ? {
            ...p,
            chatMessages: [...p.chatMessages, newMsg],
            chatInput: '',
          }
        : null
    );
  };

  // Verify Google Drive Central Repository
  const handleVerifyDrive = async () => {
    setFeedbackMsg({ type: 'success', text: 'Verifying Google Drive repository...' });
    try {
      const res = await fetch('/api/meetings/drive-status');
      const data = await res.json();
      if (res.ok && data.connected) {
        setDriveStatus(data);
        setFeedbackMsg({
          type: 'success',
          text: `Google Drive Central Repository verified: Folder "${data.rootFolderName}" is active.`,
        });
      } else {
        setFeedbackMsg({ type: 'error', text: 'Google Drive repository verification failed.' });
      }
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error verifying Google Drive' });
    }
  };

  return (
    <div className="cp-main-area" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Feedback banner */}
      {feedbackMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: feedbackMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
            color: feedbackMsg.type === 'success' ? '#065F46' : '#991B1B',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📹</span> Clasptek Meeting Operations
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Native browser video meeting rooms for Clasptek live classrooms, cohort lectures, and facilitator sessions.
          </div>
        </div>
        {currentUser.role !== 'Facilitator' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="cp-btn primary"
              id="btnOpenScheduleMeetingModal"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              + Schedule Meeting
            </button>
          </div>
        )}
      </div>

      {/* Top KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div className="cp-kpi-card" style={{ padding: 16 }}>
          <div className="cp-kpi-label">Upcoming Meetings</div>
          <div className="cp-kpi-val" style={{ fontSize: 26, color: '#2563EB' }}>
            {upcomingMeetings.length}
          </div>
          <div className="cp-kpi-sub">Scheduled classroom sessions</div>
        </div>
        <div
          className="cp-kpi-card"
          style={{
            padding: 16,
            ...(liveMeetings.length > 0
              ? { border: '2px solid #EF4444', background: 'rgba(239, 68, 68, 0.04)' }
              : {}),
          }}
        >
          <div className="cp-kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {liveMeetings.length > 0 && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#EF4444',
                  display: 'inline-block',
                }}
              />
            )}
            Live Meetings Now
          </div>
          <div className="cp-kpi-val" style={{ fontSize: 26, color: '#EF4444' }}>
            {liveMeetings.length}
          </div>
          <div className="cp-kpi-sub">
            {liveMeetings.length > 0 ? 'Sessions currently in progress' : 'No meetings currently live'}
          </div>
        </div>
        <div className="cp-kpi-card" style={{ padding: 16 }}>
          <div className="cp-kpi-label">Completed Meetings</div>
          <div className="cp-kpi-val" style={{ fontSize: 26, color: 'var(--success)' }}>
            {completedMeetings.length}
          </div>
          <div className="cp-kpi-sub">Delivered &amp; attendance logged</div>
        </div>
      </div>

      {/* Google Drive Central Repository Card */}
      <div
        id="googleDriveStorageCard"
        className="cp-card"
        style={{
          marginBottom: 20,
          padding: '18px 22px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              📁
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15.5,
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                Google Drive Central Repository
                <span
                  id="gdriveStatusBadge"
                  className={`cp-badge sm ${driveStatus.connected ? 'success' : 'neutral'}`}
                >
                  {driveStatus.connected ? '● Connected' : 'Not Connected'}
                </span>
                <span className="cp-pill draft" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px' }}>
                  TENANT_CENTRAL
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, maxWidth: 680 }}>
                {driveStatus.connected
                  ? 'Authoritative organization meeting archive. All classroom and cohort recordings are automatically stored under the tenant repository.'
                  : 'Central repository must be owned and authorized by the designated Clasptek organization Google account. Individual facilitators do not need personal Drive connections.'}
              </div>

              {driveStatus.connected && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                    marginTop: 12,
                    background: 'var(--bg-card)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Google Account:</span>
                    <br />
                    <strong style={{ color: 'var(--text)' }}>{driveStatus.email || 'organization@clasptek.org'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Repository Folder:</span>
                    <br />
                    <strong style={{ color: 'var(--primary)' }}>
                      {driveStatus.rootFolderName || 'Clasptek Meeting Recordings'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Folder ID:</span>
                    <br />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {driveStatus.rootFolderId || 'Authoritative (App-Provisioned)'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Storage:</span>
                    <br />
                    <strong style={{ color: 'var(--text)' }}>Google Drive</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Last Verified:</span>
                    <br />
                    <span style={{ color: 'var(--text)' }}>
                      {driveStatus.lastVerified?.split('T')[0] || 'Verified on Connect'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {driveStatus.connected ? (
              <button
                className="cp-btn sm secondary"
                id="btnVerifyRepository"
                title="Verify repository folder exists and is accessible"
                onClick={handleVerifyDrive}
              >
                ✔ Verify Repository
              </button>
            ) : (
              <button
                className="cp-btn primary"
                id="btnConnectGoogleDrive"
                onClick={handleVerifyDrive}
              >
                🔗 Connect Organization Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Filter Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 2,
            maxWidth: '100%',
          }}
        >
          <button
            className={`cp-btn sm ${subTab === 'all' ? 'primary' : 'ghost'} btnMeetingFilter`}
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('all')}
          >
            All Meetings ({meetings.length})
          </button>
          <button
            className={`cp-btn sm ${subTab === 'upcoming' ? 'primary' : 'ghost'} btnMeetingFilter`}
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('upcoming')}
          >
            Upcoming ({upcomingMeetings.length})
          </button>
          <button
            className={`cp-btn sm ${subTab === 'live' ? 'danger' : 'ghost'} btnMeetingFilter`}
            style={{ whiteSpace: 'nowrap', ...(liveMeetings.length > 0 ? { fontWeight: 700 } : {}) }}
            onClick={() => handleTabChange('live')}
          >
            {liveMeetings.length > 0 && '● '}Live Now ({liveMeetings.length})
          </button>
          <button
            className={`cp-btn sm ${subTab === 'recordings' ? 'primary' : 'ghost'} btnMeetingFilter`}
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('recordings')}
          >
            Recordings ({recordingMeetings.length})
          </button>
          <button
            className={`cp-btn sm ${subTab === 'completed' ? 'primary' : 'ghost'} btnMeetingFilter`}
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('completed')}
          >
            Completed ({completedMeetings.length})
          </button>
        </div>

        <div style={{ flex: '1 1 200px', maxWidth: 260, marginLeft: 'auto' }}>
          <input
            type="text"
            className="cp-input"
            style={{ fontSize: 12, padding: '5px 10px', width: '100%' }}
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

        {/* Selection Bar */}
        {currentUser.role !== 'Facilitator' && (
          <TableSelectionBar
            selectedCount={selectedIds.size}
            totalVisibleCount={visibleIds.length}
            entityLabel="meeting"
            onSelectAllVisible={handleToggleSelectAll}
            isAllSelected={isAllSelected}
            onClearSelection={handleClearSelection}
          >
            <button
              type="button"
              className="cp-btn sm danger"
              onClick={() => handleOpenDeleteModal(Array.from(selectedIds))}
              title="Cancel or delete selected meetings"
            >
              🗑️ Cancel / Delete Selected ({selectedIds.size})
            </button>
          </TableSelectionBar>
        )}

        {/* Meetings Table / List */}
        <div className="cp-card">
          {displayed.length === 0 ? (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">📹</div>
            <div className="cp-empty-title">
              No {subTab !== 'all' ? subTab : ''} meetings found
            </div>
            <div className="cp-empty-desc">
              Click &ldquo;Schedule Meeting&rdquo; above or launch directly from an assigned Training Session.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop">
            <table className="cp-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all visible meetings"
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Meeting Title &amp; Programme</th>
                  <th>Cohort / Class</th>
                  <th>Facilitator</th>
                  <th>Date &amp; Schedule</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMeetings.map((m) => {
                  const isSelected = selectedIds.has(m.id);
                  const isLive = m.status === 'LIVE';
                  const isScheduled = m.status === 'SCHEDULED';
                  const isEnded = m.status === 'ENDED' || m.status === 'COMPLETED';
                  const hasRecording =
                    m.recordingStatus === 'STORED' || Boolean(m.recordingMetadata?.driveUrl);

                  let pillColor = 'draft';
                  if (isLive) pillColor = 'danger';
                  else if (isScheduled) pillColor = 'active';
                  else if (isEnded) pillColor = 'paid';

                  return (
                    <tr
                      key={m.id}
                      style={{
                        backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(m.id)}
                          aria-label={`Select meeting ${m.title}`}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13.5 }}>
                          {m.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {m.programmeName || 'Academic Course'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{m.cohortCode || 'General'}</span>
                        {m.cohortName && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.cohortName}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {m.facilitatorName || 'Facilitator'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div>{m.scheduledStart?.split('T')[0]}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {m.scheduledStart?.split('T')[1]?.slice(0, 5)} – {m.scheduledEnd?.split('T')[1]?.slice(0, 5)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`cp-pill ${pillColor}`} style={{ fontSize: 10.5, fontWeight: 700 }}>
                          {isLive && '● '}
                          {m.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isLive && (
                            <button
                              className="cp-btn sm danger"
                              style={{ fontWeight: 700 }}
                              onClick={() => handleJoinMeeting(m)}
                            >
                              🔴 Join Live Room
                            </button>
                          )}
                          {isScheduled && (
                            <button
                              className="cp-btn sm primary"
                              onClick={() => handleJoinMeeting(m)}
                            >
                              Join Room
                            </button>
                          )}
                          {hasRecording && (
                            <button
                              className="cp-btn sm paid"
                              onClick={() => setWatchModalMeeting(m)}
                            >
                              ▶ Watch Recording
                            </button>
                          )}
                          {isEnded && !hasRecording && (
                            <button
                              className="cp-btn sm secondary"
                              onClick={() => setWatchModalMeeting(m)}
                            >
                              Summary
                            </button>
                          )}
                          {currentUser.role !== 'Facilitator' && (
                            <button
                              type="button"
                              className="cp-btn sm danger"
                              onClick={() => handleOpenDeleteModal([m.id], m.title)}
                              title="Cancel / Delete Meeting"
                              style={{ padding: '4px 8px' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

            {/* Mobile Vertical Cards Stack */}
            <div className="cp-cards-mobile">
              {paginatedMeetings.map((m) => {
                const isSelected = selectedIds.has(m.id);
                const isLive = m.status === 'LIVE';
                const isScheduled = m.status === 'SCHEDULED';
                const isEnded = m.status === 'ENDED' || m.status === 'COMPLETED';
                const hasRecording =
                  m.recordingStatus === 'STORED' || Boolean(m.recordingMetadata?.driveUrl);

                let pillColor = 'draft';
                if (isLive) pillColor = 'danger';
                else if (isScheduled) pillColor = 'active';
                else if (isEnded) pillColor = 'paid';

                return (
                  <div
                    key={m.id}
                    className="cp-mobile-record-card"
                    style={{
                      borderLeft: isSelected ? '4px solid var(--primary, #0284c7)' : undefined,
                    }}
                    onClick={() => handleToggleSelect(m.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(evt) => evt.key === 'Enter' && handleToggleSelect(m.id)}
                    aria-label={`Select meeting ${m.title}`}
                  >
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(evt) => {
                            evt.stopPropagation();
                            handleToggleSelect(m.id);
                          }}
                          aria-label={`Select meeting ${m.title}`}
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>
                            {m.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {m.programmeName || 'Academic Course'}
                          </div>
                        </div>
                      </div>
                      <span className={`cp-pill ${pillColor}`} style={{ fontSize: '10.5px', fontWeight: 700 }}>
                        {isLive && '● '}
                        {m.status}
                      </span>
                    </div>

                    <div className="cp-mobile-record-grid">
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Cohort</span>
                        <span className="cp-mobile-record-value">{m.cohortCode || 'General'}</span>
                      </div>
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Facilitator</span>
                        <span className="cp-mobile-record-value">{m.facilitatorName || 'Facilitator'}</span>
                      </div>
                      <div className="cp-mobile-record-field" style={{ gridColumn: 'span 2' }}>
                        <span className="cp-mobile-record-label">Date &amp; Schedule</span>
                        <span className="cp-mobile-record-value">
                          {m.scheduledStart?.split('T')[0]} ({m.scheduledStart?.split('T')[1]?.slice(0, 5)} – {m.scheduledEnd?.split('T')[1]?.slice(0, 5)})
                        </span>
                      </div>
                    </div>

                    <div className="cp-mobile-record-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {isLive && (
                        <button
                          type="button"
                          className="cp-btn sm danger"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            handleJoinMeeting(m);
                          }}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          🔴 Join Live Room
                        </button>
                      )}
                      {isScheduled && (
                        <button
                          type="button"
                          className="cp-btn sm primary"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            handleJoinMeeting(m);
                          }}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          Join Room
                        </button>
                      )}
                      {hasRecording && (
                        <button
                          type="button"
                          className="cp-btn sm paid"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            setWatchModalMeeting(m);
                          }}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          ▶ Watch Recording
                        </button>
                      )}
                      {currentUser.role !== 'Facilitator' && (
                        <button
                          type="button"
                          className="cp-btn sm danger"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            handleOpenDeleteModal([m.id], m.title);
                          }}
                          style={{ padding: '4px 10px' }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Standard Pagination */}
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalRecords={displayed.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="meetings"
            />
          </>
        )}
      </div>

      {/* Schedule Meeting Modal */}
      {isScheduleModalOpen && (
        <div className="cp-modal-overlay" onClick={() => setIsScheduleModalOpen(false)}>
          <div className="cp-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                📅 Schedule New Video Meeting
              </h3>
              <button className="cp-btn ghost sm" onClick={() => setIsScheduleModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit}>
              <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Meeting Title <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="cp-input"
                    placeholder="e.g. Cohort Lecture: Cloud Infrastructure & DevOps"
                    value={meetingForm.title}
                    onChange={(e) => setMeetingForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    className="cp-input"
                    placeholder="Topics to discuss, agenda, and guidelines..."
                    value={meetingForm.description}
                    onChange={(e) => setMeetingForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Cohort
                    </label>
                    <select
                      className="cp-input"
                      value={meetingForm.cohortId}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, cohortId: e.target.value }))}
                    >
                      <option value="">No Cohort (All Students)</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cohortCode} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Host / Facilitator
                    </label>
                    <select
                      className="cp-input"
                      value={meetingForm.facilitatorId}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, facilitatorId: e.target.value }))}
                    >
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="cp-input"
                      value={meetingForm.scheduledStart}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, scheduledStart: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="cp-input"
                      value={meetingForm.scheduledEnd}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, scheduledEnd: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={meetingForm.allowChat}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, allowChat: e.target.checked }))}
                    />
                    Enable Room Chat
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={meetingForm.allowScreenShare}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, allowScreenShare: e.target.checked }))}
                    />
                    Enable Screen Share
                  </label>
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsScheduleModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="cp-btn primary">
                  Schedule Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Watch Recording / Meeting Summary Modal */}
      {watchModalMeeting && (
        <div className="cp-modal-overlay" onClick={() => setWatchModalMeeting(null)}>
          <div className="cp-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                🎬 {watchModalMeeting.title}
              </h3>
              <button className="cp-btn ghost sm" onClick={() => setWatchModalMeeting(null)}>
                ✕
              </button>
            </div>
            <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: '#0F172A',
                  color: '#FFF',
                  height: 220,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 8 }}>▶️</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {watchModalMeeting.recordingStatus === 'STORED'
                    ? 'Recording Available in Google Drive Central Repository'
                    : 'Meeting Session Completed'}
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                  LiveKit SFU Egress &middot; Google Drive Storage
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: 6,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <br />
                  <span className="cp-pill paid" style={{ fontSize: 10 }}>
                    {watchModalMeeting.recordingStatus}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                  <br />
                  <strong>
                    {watchModalMeeting.recordingMetadata?.durationSeconds
                      ? `${Math.round(watchModalMeeting.recordingMetadata.durationSeconds / 60)} mins`
                      : '2 hours'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Destination:</span>
                  <br />
                  <strong>TENANT_CENTRAL</strong>
                </div>
              </div>

              {watchModalMeeting.recordingMetadata?.driveUrl && (
                <div style={{ marginTop: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Google Drive Central Link:
                  </label>
                  <a
                    href={watchModalMeeting.recordingMetadata.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-btn primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                  >
                    <span>📁</span> Open Recording in Google Drive
                  </a>
                </div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setWatchModalMeeting(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Meeting Room Overlay */}
      {activeLiveMeeting && liveSessionState && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: '#0F172A',
            color: '#FFF',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top Live Bar */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid #1E293B',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>🎥</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{activeLiveMeeting.title}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  LiveKit SFU &middot; {activeLiveMeeting.publicId} &middot; Role:{' '}
                  <span style={{ color: '#38BDF8' }}>{liveSessionState.isHost ? 'Host' : 'Participant'}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {liveSessionState.isRecording && (
                <div
                  style={{
                    background: '#DC2626',
                    color: '#FFF',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFF' }} />
                  RECORDING
                </div>
              )}
              {liveSessionState.isHost && (
                <button
                  className="cp-btn sm danger"
                  style={{ background: '#DC2626', color: '#FFF' }}
                  onClick={handleEndLiveMeeting}
                >
                  End Meeting
                </button>
              )}
              <button
                className="cp-btn sm secondary"
                style={{ background: '#334155', color: '#FFF', border: 'none' }}
                onClick={() => {
                  setActiveLiveMeeting(null);
                  setLiveSessionState(null);
                }}
              >
                Leave Room
              </button>
            </div>
          </div>

          {/* Main Stage & Chat Panel */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Video Stage */}
            <div
              style={{
                flex: 1,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 900,
                  height: 480,
                  background: '#1E293B',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #334155',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: '#3B82F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    fontWeight: 700,
                  }}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ marginTop: 12, fontWeight: 600, fontSize: 16 }}>
                  {currentUser.name} (You)
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  {liveSessionState.isCamOn ? 'Camera Active' : 'Camera Muted'} &middot;{' '}
                  {liveSessionState.isMicOn ? 'Microphone Active' : 'Microphone Muted'}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    left: 14,
                    background: 'rgba(0,0,0,0.6)',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  {liveSessionState.isHost ? '👑 Host' : '🎓 Student'}
                </div>
              </div>
            </div>

            {/* In-Meeting Chat Drawer */}
            <div
              style={{
                width: 320,
                borderLeft: '1px solid #1E293B',
                background: '#0B1120',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1E293B', fontWeight: 700, fontSize: 13 }}>
                💬 Meeting Chat &amp; Q&amp;A
              </div>
              <div style={{ flex: 1, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {liveSessionState.chatMessages.map((msg, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94A3B8', fontSize: 10 }}>
                      <strong>{msg.sender}</strong>
                      <span>{msg.time}</span>
                    </div>
                    <div style={{ marginTop: 2, color: '#E2E8F0' }}>{msg.text}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendChat} style={{ padding: 10, borderTop: '1px solid #1E293B', display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Send a message..."
                  className="cp-input"
                  style={{ background: '#1E293B', color: '#FFF', border: '1px solid #334155', fontSize: 12 }}
                  value={liveSessionState.chatInput}
                  onChange={(e) =>
                    setLiveSessionState((p) => (p ? { ...p, chatInput: e.target.value } : null))
                  }
                />
                <button type="submit" className="cp-btn primary sm" style={{ padding: '4px 10px' }}>
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Bottom Live Controls Bar */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #1E293B',
              background: '#090D16',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <button
              className={`cp-btn sm ${liveSessionState.isMicOn ? 'secondary' : 'danger'}`}
              onClick={() =>
                setLiveSessionState((p) => (p ? { ...p, isMicOn: !p.isMicOn } : null))
              }
            >
              {liveSessionState.isMicOn ? '🎤 Mute Mic' : '🔇 Unmute Mic'}
            </button>

            <button
              className={`cp-btn sm ${liveSessionState.isCamOn ? 'secondary' : 'danger'}`}
              onClick={() =>
                setLiveSessionState((p) => (p ? { ...p, isCamOn: !p.isCamOn } : null))
              }
            >
              {liveSessionState.isCamOn ? '📹 Turn Off Camera' : '📷 Turn On Camera'}
            </button>

            <button
              className="cp-btn sm secondary"
              onClick={() => alert('Screen share stream simulated via LiveKit WebRTC')}
            >
              🖥 Share Screen
            </button>

            {liveSessionState.isHost && (
              <button
                className={`cp-btn sm ${liveSessionState.isRecording ? 'danger' : 'secondary'}`}
                onClick={handleToggleRecording}
              >
                {liveSessionState.isRecording ? '⏹ Stop & Upload to Drive' : '⏺ Record Meeting'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Record Lifecycle Modal (Delete / Cancel Protection) */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Classroom Meeting Session"
        recordIdentifier={lifecycleModal.recordIdentifier}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
