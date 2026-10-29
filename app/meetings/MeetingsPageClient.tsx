'use client';

/**
 * app/meetings/MeetingsPageClient.tsx — Phase 5
 * Interactive Client Component for Meetings & Live Video Operations.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useTransition, useEffect } from 'react';
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
import { LiveMeetingRoom } from '@/components/meetings/LiveMeetingRoom';
import { ShareMeetingModal } from '@/components/meetings/ShareMeetingModal';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

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
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleModalError, setScheduleModalError] = useState<string | null>(null);

  // Google Calendar Connection Status for Schedule Modal (Phase C124, C240A)
  const [calendarStatus, setCalendarStatus] = useState<{
    isLoading: boolean;
    connected: boolean;
    hasCalendarScope: boolean;
    status:
      | 'IDLE'
      | 'LOADING'
      | 'CONNECTED'
      | 'NOT_CONNECTED'
      | 'PERMISSION_REQUIRED'
      | 'CALENDAR_DISABLED'
      | 'RECONNECT_REQUIRED'
      | 'VERIFICATION_FAILED'
      | 'FAILED'
      | 'PREVIEW_DISABLED';
    googleEmail?: string | null;
    errorMessage?: string | null;
    calendarReady?: boolean;
  }>({
    isLoading: false,
    connected: false,
    hasCalendarScope: false,
    status: 'IDLE',
  });
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [watchModalMeeting, setWatchModalMeeting] = useState<Meeting | null>(null);
  const [shareModalMeeting, setShareModalMeeting] = useState<Meeting | null>(null);
  const [activeLiveMeeting, setActiveLiveMeeting] = useState<Meeting | null>(null);
  // Close schedule modal on Escape
  useEffect(() => {
    if (!isScheduleModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsScheduleModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScheduleModalOpen]);

  // Restore meeting form draft after OAuth redirect and check URL triggers (Phase C124, C240A)
  useEffect(() => {
    let hadSavedDraft = false;
    try {
      const savedDraft = sessionStorage.getItem('clasptek_meeting_form_draft');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && typeof parsed === 'object') {
          setMeetingForm((prev) => ({
            ...prev,
            ...parsed,
          }));
          hadSavedDraft = true;
        }
        sessionStorage.removeItem('clasptek_meeting_form_draft');
        setIsScheduleModalOpen(true);
      }
    } catch (_) {}

    // Process return from Google OAuth callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isScheduleTab = params.get('tab') === 'schedule' || params.get('schedule') === 'true';
      if (isScheduleTab && !hadSavedDraft) {
        setIsScheduleModalOpen(true);
      }

      const googleConnect = params.get('google_connect');
      const googleDrive = params.get('google_drive');
      const calScope = params.get('calendar_scope');
      const reason = params.get('reason');

      let hasHandledStatus = false;

      if (googleConnect === 'connected' || googleDrive === 'connected') {
        hasHandledStatus = true;
        if (calScope === 'missing') {
          setFeedbackMsg({
            type: 'info',
            text: 'Google account connected, but Calendar permission was not granted. Please grant Calendar access.',
          });
        } else {
          setFeedbackMsg({
            type: 'success',
            text: 'Google account and Calendar connected successfully.',
          });
        }
        setTimeout(() => setFeedbackMsg(null), 5000);
        fetchCalendarStatus();
      } else if (googleConnect === 'denied' || googleDrive === 'access_denied') {
        hasHandledStatus = true;
        setFeedbackMsg({ type: 'error', text: 'Google authorization was cancelled or denied.' });
        if (isScheduleTab || hadSavedDraft) {
          setScheduleModalError('Google connection was cancelled or denied.');
        }
        setTimeout(() => setFeedbackMsg(null), 5000);
      } else if (googleConnect === 'invalid_state' || googleDrive === 'invalid_state') {
        hasHandledStatus = true;
        setFeedbackMsg({
          type: 'error',
          text: 'Google authorization could not be verified (session expired or invalid state). Please try again.',
        });
        if (isScheduleTab || hadSavedDraft) {
          setScheduleModalError('Authorization state was invalid or expired. Please retry connecting.');
        }
        setTimeout(() => setFeedbackMsg(null), 5000);
      } else if (googleConnect === 'error' || googleDrive === 'error') {
        hasHandledStatus = true;
        let errText = 'Failed to connect Google account. Please try again.';
        if (reason === 'token_exchange_failed') {
          errText = 'Failed to exchange authorization code with Google. Please try again.';
        } else if (reason === 'userinfo_failed') {
          errText = 'Connected to Google, but failed to retrieve account details.';
        } else if (reason === 'persistence_failed') {
          errText = 'Google connection could not be saved. Please reconnect.';
        }
        setFeedbackMsg({ type: 'error', text: errText });
        if (isScheduleTab || hadSavedDraft) {
          setScheduleModalError(errText);
        }
        setTimeout(() => setFeedbackMsg(null), 5000);
      }

      // Safe parameter sanitization: remove transient callback parameters from browser history
      // to prevent duplicate notifications on subsequent page refreshes
      if (hasHandledStatus) {
        const cleanParams = new URLSearchParams(window.location.search);
        cleanParams.delete('google_connect');
        cleanParams.delete('google_drive');
        cleanParams.delete('type');
        cleanParams.delete('calendar_scope');
        cleanParams.delete('reason');
        const remainingQuery = cleanParams.toString();
        const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, []);

  // Live meeting session state
  const [liveSessionState, setLiveSessionState] = useState<{
    token: string;
    serverUrl?: string;
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
    provider: 'livekit' as 'livekit' | 'google_meet',
    customGoogleMeetUrl: '',
    allowChat: true,
    allowScreenShare: true,
    muteOnEntry: false,
  });
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  const upcomingMeetings = [...meetings.filter((m) => m.status === 'SCHEDULED')].sort(
    (a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() || a.id.localeCompare(b.id)
  );
  const liveMeetings = meetings.filter((m) => m.status === 'LIVE');
  const completedMeetings = [...meetings.filter(
    (m) => m.status === 'COMPLETED'
  )].sort(
    (a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime() || b.id.localeCompare(a.id)
  );
  const recordingMeetings = [...meetings.filter(
    (m) =>
      m.recordingStatus === 'STORED' ||
      Boolean(m.recordingMetadata?.driveUrl) ||
      Boolean(m.recordingUrl) ||
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
          if (m.status === 'COMPLETED') {
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

  // Query Authoritative Google Calendar Connection Status (Phase C124)
  const fetchCalendarStatus = async () => {
    setCalendarStatus((prev) => ({ ...prev, isLoading: true, errorMessage: undefined }));
    try {
      const res = await fetch('/api/meetings/calendar-status');
      if (res.ok) {
        const data = await res.json();
        setCalendarStatus({
          isLoading: false,
          connected: Boolean(data.connected),
          hasCalendarScope: Boolean(data.hasCalendarScope),
          status: data.status || (data.connected ? 'CONNECTED' : 'NOT_CONNECTED'),
          googleEmail: data.googleEmail,
          errorMessage: data.message || data.error,
          calendarReady: Boolean(data.calendarReady),
        });
      } else if (res.status === 401) {
        setCalendarStatus({
          isLoading: false,
          connected: false,
          hasCalendarScope: false,
          status: 'NOT_CONNECTED',
          errorMessage: 'Authentication required to inspect Google connection.',
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setCalendarStatus({
          isLoading: false,
          connected: false,
          hasCalendarScope: false,
          status: 'FAILED',
          errorMessage: errData.message || 'Unable to verify Google Calendar connection.',
        });
      }
    } catch {
      setCalendarStatus({
        isLoading: false,
        connected: false,
        hasCalendarScope: false,
        status: 'FAILED',
        errorMessage: 'Network error checking Google Calendar connection.',
      });
    }
  };

  // Fetch Calendar status whenever Google Meet is selected or modal opened
  useEffect(() => {
    if (isScheduleModalOpen && meetingForm.provider === 'google_meet' && calendarStatus.status === 'IDLE') {
      fetchCalendarStatus();
    }
  }, [isScheduleModalOpen, meetingForm.provider, calendarStatus.status]);

  // Connect Google Calendar with Calendar Scope and Session Bearer Auth (Phase C124)
  const handleConnectCalendar = async () => {
    if (isConnectingCalendar) return;
    setIsConnectingCalendar(true);
    setScheduleModalError(null);

    try {
      // 1. Resolve browser session access token if available
      let token = '';
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: authData } = await supabase.auth.getSession();
        token = authData?.session?.access_token || '';
      } catch (_) {}

      // 2. Preserve entered meeting details across OAuth redirect
      try {
        sessionStorage.setItem('clasptek_meeting_form_draft', JSON.stringify(meetingForm));
      } catch (_) {}

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/auth/google/start', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          connectionType: 'TENANT_CENTRAL',
          redirectTarget: '/meetings?tab=schedule',
          includeCalendar: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.authUrl) {
        // Anti-open-redirect validation: target must be official Google OAuth
        const targetUrl = new URL(data.authUrl);
        if (targetUrl.hostname === 'accounts.google.com') {
          window.location.href = data.authUrl;
          return;
        } else {
          setScheduleModalError('Received an untrusted authorization URL from server.');
        }
      } else if (res.status === 401) {
        setScheduleModalError('Session expired or authentication required. Please sign in to connect Google Calendar.');
      } else if (res.status === 403) {
        setScheduleModalError(data.message || 'Only tenant administrators (Super Admin, Finance Manager) may connect Google Calendar.');
      } else if (data.error === 'GOOGLE_OAUTH_PREVIEW_DISABLED') {
        setCalendarStatus((prev) => ({
          ...prev,
          status: 'PREVIEW_DISABLED',
          errorMessage: 'Google OAuth is disabled in Preview environments to prevent production credential reuse.',
        }));
        setScheduleModalError('Google OAuth is disabled in Preview environments to prevent production credential reuse.');
      } else {
        setScheduleModalError(data.message || data.error || 'Failed to start Google Calendar connection.');
      }
    } catch {
      setScheduleModalError('Network error connecting to Google authorization service. Please check your network.');
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  // Schedule meeting submission
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleModalError(null);

    if (!meetingForm.title.trim()) {
      setScheduleModalError('Meeting title is required');
      return;
    }
    const cleanTitle = meetingForm.title.trim();

    const startDate = new Date(meetingForm.scheduledStart);
    const endDate = new Date(meetingForm.scheduledEnd);
    if (isNaN(startDate.getTime())) {
      setScheduleModalError('Please specify a valid start date and time.');
      return;
    }
    if (isNaN(endDate.getTime())) {
      setScheduleModalError('Please specify a valid end date and time.');
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setScheduleModalError('Meeting end time must be after the start time.');
      return;
    }
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    if (durationMinutes < 5) {
      setScheduleModalError('Meeting duration must be at least 5 minutes.');
      return;
    }

    const cleanCustomUrl = meetingForm.customGoogleMeetUrl.trim();
    if (meetingForm.provider === 'google_meet' && cleanCustomUrl) {
      const meetUrlPattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i;
      if (!meetUrlPattern.test(cleanCustomUrl)) {
        setScheduleModalError('Invalid Google Meet URL format. Expected: https://meet.google.com/xxx-yyyy-zzz');
        return;
      }
    }

    // Client-side prevention of guaranteed-invalid automated Google Meet creation
    if (meetingForm.provider === 'google_meet' && !cleanCustomUrl) {
      if (!calendarStatus.connected || !calendarStatus.hasCalendarScope) {
        setScheduleModalError(
          'Google Calendar is not configured for this organization. Connect Google Calendar above before automated scheduling, or enter a Custom Google Meet Link.'
        );
        return;
      }
    }

    if (isSubmittingSchedule) return;
    setIsSubmittingSchedule(true);
    try {
      const res = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          description: meetingForm.description.trim(),
          programmeId: meetingForm.programmeId || null,
          cohortId: meetingForm.cohortId || null,
          facilitatorId: meetingForm.facilitatorId ? meetingForm.facilitatorId.trim() : null,
          scheduledStart: new Date(meetingForm.scheduledStart).toISOString(),
          scheduledEnd: new Date(meetingForm.scheduledEnd).toISOString(),
          participantAccess: meetingForm.participantAccess,
          provider: meetingForm.provider,
          customGoogleMeetUrl: meetingForm.provider === 'google_meet' && cleanCustomUrl ? cleanCustomUrl : undefined,
          settings: {
            allowChat: meetingForm.allowChat,
            allowScreenShare: meetingForm.allowScreenShare,
            muteOnEntry: meetingForm.muteOnEntry,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setScheduleModalError(data.message || data.error || 'Failed to schedule meeting.');
        return;
      }

      setIsScheduleModalOpen(false);
      setMeetings((prev) => [data.meeting, ...prev]);
      setFeedbackMsg({ type: 'success', text: `Meeting scheduled: ${data.meeting.title}` });
      setTimeout(() => setFeedbackMsg(null), 3000);
      startTransition(() => router.refresh());
    } catch {
      setScheduleModalError('Network error connecting to meeting service. Please try again.');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  // Join meeting handler
  const handleJoinMeeting = async (meeting: Meeting) => {
    // If meeting is external Google Meet with a direct providerRoomUrl, open it in a new window/tab
    if (meeting.sfuProvider === 'google_meet' && meeting.providerRoomUrl) {
      window.open(meeting.providerRoomUrl, '_blank', 'noopener,noreferrer');
      return;
    }

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
        setFeedbackMsg({ type: 'error', text: data.message || data.error || 'Failed to join meeting' });
        return;
      }

      if (data.redirectUrl) {
        window.open(data.redirectUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (!data.serverUrl || typeof data.serverUrl !== 'string' || !data.serverUrl.trim()) {
        setFeedbackMsg({ type: 'error', text: 'Meeting service did not provide an approved LiveKit server URL. Please check server configuration.' });
        return;
      }

      // Enter live meeting mode
      setActiveLiveMeeting(meeting);
      setLiveSessionState({
        token: data.token,
        serverUrl: data.serverUrl.trim(),
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
      setFeedbackMsg({ type: 'error', text: 'Network error joining meeting' });
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



  // Verify Google Drive Central Repository
  const handleVerifyDrive = async () => {
    setFeedbackMsg({ type: 'info', text: 'Checking Google Drive repository status...' });
    try {
      const res = await fetch('/api/meetings/drive-status');
      const data = await res.json();
      if (res.ok) {
        setDriveStatus(data);
        if (data.connected) {
          setFeedbackMsg({
            type: 'success',
            text: `Google Drive Central Repository verified: Folder "${data.rootFolderName}" is active.`,
          });
        } else if (data.status === 'CONFIGURED_UNVERIFIED') {
          setFeedbackMsg({
            type: 'info',
            text: `Repository configuration detected (Folder "${data.rootFolderName}"), but authorization has not been verified with Google.`,
          });
        } else {
          setFeedbackMsg({
            type: 'error',
            text: 'Google Drive Central Repository is disconnected. Connect an organization account to enable recording storage.',
          });
        }
      } else {
        const errorMsg = data?.error || 'Unable to check Google Drive repository status.';
        setFeedbackMsg({ type: 'error', text: `Google Drive status check failed: ${errorMsg}` });
      }
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error verifying Google Drive repository.' });
    }
  };

  // Connect Google Drive Central Repository via authoritative OAuth flow
  const handleConnectDrive = async () => {
    setFeedbackMsg({ type: 'info', text: 'Initiating Google Drive authorization...' });
    try {
      let token = '';
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: authData } = await supabase.auth.getSession();
        token = authData?.session?.access_token || '';
      } catch (_) {}

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/auth/google/start', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          connectionType: 'TENANT_CENTRAL',
          redirectTarget: '/meetings',
          includeCalendar: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      if (data.error === 'GOOGLE_OAUTH_PREVIEW_DISABLED') {
        setFeedbackMsg({
          type: 'info',
          text: 'Google OAuth is disabled in Preview environments to prevent production credential reuse.',
        });
      } else if (res.status === 403) {
        setFeedbackMsg({
          type: 'error',
          text: data.message || 'Only tenant administrators may connect the central Google Drive repository.',
        });
      } else {
        setFeedbackMsg({
          type: 'error',
          text: data.message || data.error || 'Failed to start Google Drive connection.',
        });
      }
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error connecting to Google Drive.' });
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
            background:
              feedbackMsg.type === 'success'
                ? '#ECFDF5'
                : feedbackMsg.type === 'info'
                ? '#EFF6FF'
                : '#FEF2F2',
            border: `1px solid ${
              feedbackMsg.type === 'success'
                ? '#A7F3D0'
                : feedbackMsg.type === 'info'
                ? '#BFDBFE'
                : '#FECACA'
            }`,
            color:
              feedbackMsg.type === 'success'
                ? '#065F46'
                : feedbackMsg.type === 'info'
                ? '#1E40AF'
                : '#991B1B',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedbackMsg.text}</span>
          <button
            type="button"
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
        {['Super Admin', 'Finance Manager', 'Facilitator'].includes(currentUser.role) && (
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
                  {driveStatus.connected ? '● Connected' : driveStatus.status === 'CONFIGURED_UNVERIFIED' ? 'Configured · not verified' : 'Not Connected'}
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
                      {driveStatus.lastVerified ? driveStatus.lastVerified.split('T')[0] : 'Unverified'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {driveStatus.connected ? (
              <button
                type="button"
                className="cp-btn sm secondary"
                id="btnVerifyRepository"
                title="Verify repository folder exists and is accessible"
                onClick={handleVerifyDrive}
              >
                ✔ Verify Repository
              </button>
            ) : (
              <button
                type="button"
                className="cp-btn primary"
                id="btnConnectGoogleDrive"
                onClick={handleConnectDrive}
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
                  const isEnded = m.status === 'COMPLETED';
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13.5 }}>
                            {m.title}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 10,
                              background: m.sfuProvider === 'google_meet' ? '#fef3c7' : '#dbeafe',
                              color: m.sfuProvider === 'google_meet' ? '#b45309' : '#1d4ed8',
                              border: `1px solid ${m.sfuProvider === 'google_meet' ? '#fcd34d' : '#bfdbfe'}`,
                            }}
                          >
                            {m.sfuProvider === 'google_meet' ? 'Legacy (unsupported)' : 'LiveKit'}
                          </span>
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
                          <button
                            type="button"
                            className="cp-btn sm secondary"
                            onClick={() => setShareModalMeeting(m)}
                            title="Share Meeting Invitation (Link, WhatsApp, Email)"
                          >
                            🔗 Share
                          </button>
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
                const isEnded = m.status === 'COMPLETED';
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>
                              {m.title}
                            </span>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: 8,
                                background: m.sfuProvider === 'google_meet' ? '#fef3c7' : '#dbeafe',
                                color: m.sfuProvider === 'google_meet' ? '#b45309' : '#1d4ed8',
                              }}
                            >
                              {m.sfuProvider === 'google_meet' ? 'Legacy' : 'LiveKit'}
                            </span>
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
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setShareModalMeeting(m);
                        }}
                        style={{ padding: '6px 12px' }}
                      >
                        🔗 Share
                      </button>
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
          <div className="cp-modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                📅 Schedule New Video Meeting
              </h3>
              <button
                type="button"
                className="cp-btn ghost sm"
                style={{ padding: '4px 8px', fontSize: 14, lineHeight: 1 }}
                onClick={() => setIsScheduleModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px', overflowY: 'auto', flex: 1 }}>

                {/* Error Banner */}
                {scheduleModalError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#B91C1C',
                      fontSize: 12.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
                    <span style={{ flex: 1 }}>{scheduleModalError}</span>
                  </div>
                )}

                {/* 1. Meeting Title & Description / Agenda */}
                <div>
                  <label htmlFor="meetingTitleInput" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Meeting Title <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    id="meetingTitleInput"
                    type="text"
                    required
                    className="cp-input"
                    placeholder="e.g. Live Session: Cloud Infrastructure & DevOps"
                    value={meetingForm.title}
                    onChange={(e) => setMeetingForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="meetingDescriptionInput" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Description / Agenda <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted, #64748b)' }}>(Optional)</span>
                  </label>
                  <textarea
                    id="meetingDescriptionInput"
                    rows={2}
                    className="cp-input"
                    placeholder="Topics to discuss, agenda, and guidelines..."
                    value={meetingForm.description}
                    onChange={(e) => setMeetingForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                {/* 2. Platform Selection */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Meeting Platform
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Meeting Platform"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {/* LiveKit Provider Card */}
                    <div
                      role="radio"
                      id="platformLiveKit"
                      aria-checked={meetingForm.provider === 'livekit'}
                      tabIndex={0}
                      onClick={() => setMeetingForm((p) => ({ ...p, provider: 'livekit' }))}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setMeetingForm((p) => ({ ...p, provider: 'livekit' }));
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: meetingForm.provider === 'livekit'
                          ? '1.5px solid var(--primary, #2563eb)'
                          : '1px solid var(--border, #e2e8f0)',
                        background: meetingForm.provider === 'livekit'
                          ? 'rgba(37, 99, 235, 0.04)'
                          : 'var(--surface, #ffffff)',
                        transition: 'border-color 0.15s, background-color 0.15s',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            color: meetingForm.provider === 'livekit' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #94a3b8)',
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                        >
                          {meetingForm.provider === 'livekit' ? '●' : '○'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text, #0f172a)' }}>Clasptek Live Meeting</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                            LiveKit SFU · Native browser video &amp; audio
                          </div>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span
                          className="cp-pill active"
                          style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px' }}
                        >
                          Default Provider
                        </span>
                      </div>
                    </div>

                    {/* Google Meet Provider Card */}
                    <div
                      role="radio"
                      id="platformGoogleMeet"
                      aria-checked={meetingForm.provider === 'google_meet'}
                      tabIndex={0}
                      onClick={() => {
                        setMeetingForm((p) => ({ ...p, provider: 'google_meet' }));
                        if (calendarStatus.status === 'IDLE') {
                          fetchCalendarStatus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setMeetingForm((p) => ({ ...p, provider: 'google_meet' }));
                          if (calendarStatus.status === 'IDLE') {
                            fetchCalendarStatus();
                          }
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: meetingForm.provider === 'google_meet'
                          ? '1.5px solid var(--primary, #2563eb)'
                          : '1px solid var(--border, #e2e8f0)',
                        background: meetingForm.provider === 'google_meet'
                          ? 'rgba(37, 99, 235, 0.04)'
                          : 'var(--surface, #ffffff)',
                        transition: 'border-color 0.15s, background-color 0.15s',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            color: meetingForm.provider === 'google_meet' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #94a3b8)',
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                        >
                          {meetingForm.provider === 'google_meet' ? '●' : '○'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text, #0f172a)' }}>Google Meet</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                            External Google Meet conference
                          </div>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span
                          className="cp-pill secondary"
                          style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px' }}
                        >
                          Optional
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Platform-specific Settings & Google Calendar Connection Status */}
                {meetingForm.provider === 'livekit' ? (
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={meetingForm.allowChat}
                        onChange={(e) => setMeetingForm((p) => ({ ...p, allowChat: e.target.checked }))}
                      />
                      Enable Room Chat
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={meetingForm.allowScreenShare}
                        onChange={(e) => setMeetingForm((p) => ({ ...p, allowScreenShare: e.target.checked }))}
                      />
                      Enable Screen Share
                    </label>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 6,
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        fontSize: 12,
                        color: '#1E40AF',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>ℹ</span>
                      <span>
                        Google Meet conferences manage room chat, screen sharing, and participant controls externally within Google Meet.
                      </span>
                    </div>

                    {/* Google Calendar Connection Status Card (Phase C124, C240A) */}
                    <div
                      id="googleCalendarStatusCard"
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        border:
                          calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope
                            ? '1px solid #BBF7D0'
                            : calendarStatus.status === 'RECONNECT_REQUIRED'
                            ? '1px solid #FECACA'
                            : '1px solid #FED7AA',
                        background:
                          calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope
                            ? '#F0FDF4'
                            : calendarStatus.status === 'RECONNECT_REQUIRED'
                            ? '#FEF2F2'
                            : '#FFFBEB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14 }}>
                            {calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope ? '📅' : '⚠️'}
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 12.5,
                              color:
                                calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope
                                  ? '#166534'
                                  : calendarStatus.status === 'RECONNECT_REQUIRED'
                                  ? '#991B1B'
                                  : '#9A3412',
                            }}
                          >
                            {calendarStatus.isLoading
                              ? 'Checking Google Calendar Connection...'
                              : calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope
                              ? `Google Calendar Connected (${calendarStatus.googleEmail || 'Organization Account'})`
                              : calendarStatus.status === 'CALENDAR_DISABLED'
                              ? 'Calendar Integration Disabled'
                              : calendarStatus.status === 'PERMISSION_REQUIRED'
                              ? 'Calendar Permission Required'
                              : calendarStatus.status === 'RECONNECT_REQUIRED'
                              ? 'Reconnection Required'
                              : calendarStatus.status === 'VERIFICATION_FAILED'
                              ? 'Calendar Verification Failed'
                              : 'Google Calendar Not Connected'}
                          </span>
                        </div>
                        {calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope ? null : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {calendarStatus.status === 'VERIFICATION_FAILED' && (
                              <button
                                type="button"
                                className="cp-btn secondary sm"
                                onClick={fetchCalendarStatus}
                                disabled={calendarStatus.isLoading}
                                style={{ fontSize: 11.5, padding: '4px 10px', height: 'auto' }}
                              >
                                Retry Check
                              </button>
                            )}
                            <button
                              type="button"
                              className="cp-btn primary sm"
                              id="btnConnectCalendar"
                              onClick={handleConnectCalendar}
                              disabled={isConnectingCalendar || calendarStatus.isLoading}
                              style={{ fontSize: 11.5, padding: '4px 10px', height: 'auto' }}
                            >
                              {isConnectingCalendar
                                ? 'Connecting...'
                                : calendarStatus.status === 'PERMISSION_REQUIRED'
                                ? 'Grant Calendar Permission'
                                : calendarStatus.status === 'RECONNECT_REQUIRED'
                                ? 'Reconnect Google Calendar'
                                : 'Connect Google Calendar'}
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 11.5, color: '#4B5563', lineHeight: 1.4 }}>
                        {calendarStatus.status === 'CONNECTED' && calendarStatus.hasCalendarScope ? (
                          'Your organization is authorized. New Google Meet conferences will be scheduled automatically via Google Calendar.'
                        ) : calendarStatus.status === 'CALENDAR_DISABLED' ? (
                          'Google account is connected, but automated Calendar scheduling is disabled for this deployment.'
                        ) : calendarStatus.status === 'PERMISSION_REQUIRED' ? (
                          'The connected Google account has Drive permissions but has not granted Google Calendar permission. Please re-authorize to grant Calendar access.'
                        ) : calendarStatus.status === 'RECONNECT_REQUIRED' ? (
                          'Google Calendar authorization has expired or credentials were revoked. Please reconnect.'
                        ) : calendarStatus.status === 'VERIFICATION_FAILED' ? (
                          calendarStatus.errorMessage || 'Connected to Google, but Google Calendar API verification check failed. Please retry.'
                        ) : (
                          'Google Calendar must be connected for this organization before automatic Google Meet conference scheduling. Connect above, or enter an existing Google Meet link below.'
                        )}
                      </div>
                    </div>

                    {/* Custom Google Meet URL Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label htmlFor="customGoogleMeetUrl" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                        Custom Google Meet Link <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted, #64748b)' }}>(Optional)</span>
                      </label>
                      <input
                        id="customGoogleMeetUrl"
                        type="url"
                        className="cp-input"
                        placeholder="https://meet.google.com/xxx-yyyy-zzz"
                        value={meetingForm.customGoogleMeetUrl}
                        onChange={(e) => setMeetingForm((p) => ({ ...p, customGoogleMeetUrl: e.target.value }))}
                      />
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', lineHeight: 1.4 }}>
                        Paste an existing Google Meet link, or leave blank to automatically create a new Google Meet conference via the organization&apos;s connected Google Calendar.
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Start and End Date / Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="datetime-local"
                      id="scheduledStartInput"
                      required
                      className="cp-input"
                      style={{ width: '100%' }}
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
                      id="scheduledEndInput"
                      required
                      className="cp-input"
                      style={{ width: '100%' }}
                      value={meetingForm.scheduledEnd}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, scheduledEnd: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 5. Cohort and Facilitator / Host */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <div>
                    <label htmlFor="cohortSelect" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Cohort
                    </label>
                    <select
                      id="cohortSelect"
                      className="cp-input"
                      style={{ width: '100%' }}
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
                    <label htmlFor="facilitatorSelect" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Host / Facilitator
                    </label>
                    <select
                      id="facilitatorSelect"
                      className="cp-input"
                      style={{ width: '100%' }}
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

                {/* 6. Participant Access Scope */}
                <div>
                  <label htmlFor="participantAccessScope" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Participant Access Scope
                  </label>
                  <select
                    id="participantAccessScope"
                    className="cp-input"
                    style={{ width: '100%' }}
                    value={meetingForm.participantAccess}
                    onChange={(e) => setMeetingForm((p) => ({ ...p, participantAccess: e.target.value }))}
                  >
                    <option value="COHORT_ONLY">Enrolled Cohort Only (Recommended)</option>
                    <option value="ALL_STUDENTS">All Students in Organization</option>
                    <option value="PUBLIC_TOKEN">Public Access with Shared Link &amp; Waiting Room</option>
                  </select>
                </div>

              </div>

              {/* 7. Action Footer */}
              <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsScheduleModalOpen(false)}
                  disabled={isSubmittingSchedule}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cp-btn primary"
                  disabled={isSubmittingSchedule}
                  style={{ minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {isSubmittingSchedule ? 'Scheduling...' : 'Schedule Meeting'}
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

      {/* Real LiveKit WebRTC Meeting Room */}
      {activeLiveMeeting && liveSessionState && liveSessionState.serverUrl && (
        <LiveMeetingRoom
          meeting={activeLiveMeeting}
          token={liveSessionState.token}
          serverUrl={liveSessionState.serverUrl}
          isHost={liveSessionState.isHost}
          currentUser={currentUser}
          onLeave={() => {
            setActiveLiveMeeting(null);
            setLiveSessionState(null);
          }}
          onEndMeeting={liveSessionState.isHost ? handleEndLiveMeeting : undefined}
        />
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

      {/* Share Meeting Invitation Modal (Direct Link, WhatsApp, Email) */}
      {shareModalMeeting && (
        <ShareMeetingModal
          meeting={shareModalMeeting}
          onClose={() => setShareModalMeeting(null)}
        />
      )}
    </div>
  );
}
