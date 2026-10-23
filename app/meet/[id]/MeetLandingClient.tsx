/**
 * app/meet/[id]/MeetLandingClient.tsx — Clasptek Meetings LiveKit Only
 * Client Component for the Public Meeting Landing Page.
 * Handles:
 * 1. Logged-in participant direct join via /api/meetings/join
 * 2. Unauthenticated guest request submission via /api/meetings/guest/request
 * 3. Animated Waiting Room with status polling loop
 * 4. Automatic transition into <LiveMeetingRoom> upon approval
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LiveMeetingRoom } from '@/components/meetings/LiveMeetingRoom';
import type { Meeting } from '@/types/meetings';

interface SafeMeeting {
  id: string;
  publicId: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  settings: Record<string, unknown>;
  cohortId?: string | null;
  cohortCode?: string | null;
  cohortName?: string | null;
  facilitatorName?: string | null;
  provider?: string;
  providerRoomUrl?: string | null;
}

interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string;
}

interface MeetLandingClientProps {
  meeting: SafeMeeting;
  currentUser: SafeUser | null;
}

export function MeetLandingClient({ meeting, currentUser }: MeetLandingClientProps) {
  const [viewState, setViewState] = useState<'idle' | 'waiting' | 'connected' | 'rejected'>('idle');
  const [guestName, setGuestName] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [guestOrg, setGuestOrg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guest waiting session secrets
  const [, setGuestSession] = useState<{
    requestId: string;
    requestToken: string;
  } | null>(null);

  // Live session credentials once joined
  const [liveCredentials, setLiveCredentials] = useState<{
    token: string;
    serverUrl: string;
    isHost: boolean;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      guestRequestId?: string;
      guestRequestToken?: string;
    };
  } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Format dates
  const startDate = meeting.scheduledStart ? new Date(meeting.scheduledStart) : new Date();
  const endDate = meeting.scheduledEnd ? new Date(meeting.scheduledEnd) : new Date();
  const dateFormatted = startDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Direct Join for Authenticated Users
  const handleAuthenticatedJoin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/meetings/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: meeting.publicId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        if (!data.serverUrl || typeof data.serverUrl !== 'string' || !data.serverUrl.trim()) {
          setErrorMessage('Meeting service did not provide an approved LiveKit server URL. Please check server configuration.');
          return;
        }
        setLiveCredentials({
          token: data.token,
          serverUrl: data.serverUrl.trim(),
          isHost: Boolean(data.isHost),
          user: {
            id: data.participantId,
            email: currentUser?.email || '',
            name: data.participantName,
            role: data.role,
          },
        });
        setViewState('connected');
      } else {
        setErrorMessage(data.message || data.error || 'Failed to join meeting.');
      }
    } catch {
      setErrorMessage('Network error connecting to meeting service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Guest Entry Request
  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!guestEmail.trim() || !guestEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/meetings/guest/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: meeting.publicId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestOrganization: guestOrg.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGuestSession({
          requestId: data.requestId,
          requestToken: data.requestToken,
        });
        setViewState('waiting');
        startWaitingRoomPolling(data.requestId, data.requestToken);
      } else {
        setErrorMessage(data.message || data.error || 'Could not submit guest request.');
      }
    } catch {
      setErrorMessage('Network error submitting request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Poll waiting room status
  const startWaitingRoomPolling = (requestId: string, requestToken: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/meetings/guest/status?requestId=${encodeURIComponent(requestId)}&requestToken=${encodeURIComponent(requestToken)}`
        );
        const data = await res.json();

        if (res.ok) {
          if (data.status === 'APPROVED' && data.token) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (!data.serverUrl || typeof data.serverUrl !== 'string' || !data.serverUrl.trim()) {
              setViewState('idle');
              setErrorMessage('Host approved your entry, but the meeting service did not provide an approved LiveKit server URL.');
              return;
            }
            setLiveCredentials({
              token: data.token,
              serverUrl: data.serverUrl.trim(),
              isHost: false,
              user: {
                id: `guest_${requestId}`,
                email: guestEmail,
                name: data.guestName || guestName,
                role: 'GUEST',
                guestRequestId: requestId,
                guestRequestToken: requestToken,
              },
            });
            setViewState('connected');
          } else if (data.status === 'REJECTED' || data.status === 'REVOKED') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setViewState('rejected');
            setErrorMessage(data.message || 'The host has declined access to this classroom.');
          }
        }
      } catch {
        // Continue polling
      }
    }, 3000);
  };

  // Render Connected Live Room
  if (viewState === 'connected' && liveCredentials && liveCredentials.serverUrl) {
    const fullMeeting: Meeting = {
      id: meeting.id,
      tenantId: currentUser?.tenantId || 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      publicId: meeting.publicId,
      title: meeting.title,
      description: meeting.description || null,
      programmeId: null,
      cohortId: meeting.cohortId || null,
      trainingSessionId: null,
      facilitatorId: null,
      scheduledStart: meeting.scheduledStart,
      scheduledEnd: meeting.scheduledEnd,
      actualStart: null,
      actualEnd: null,
      status: (meeting.status as 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED') || 'LIVE',
      participantAccess: 'COHORT_ONLY',
      sfuProvider: 'livekit',
      sfuRoomId: meeting.publicId,
      settings: {
        allowChat: true,
        allowScreenShare: true,
        muteOnEntry: false,
      },
      recordingEnabled: false,
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
      createdBy: null,
      createdAt: meeting.scheduledStart,
      updatedAt: meeting.scheduledStart,
      deletedAt: null,
    };

    return (
      <LiveMeetingRoom
        meeting={fullMeeting}
        token={liveCredentials.token}
        serverUrl={liveCredentials.serverUrl}
        isHost={liveCredentials.isHost}
        currentUser={liveCredentials.user}
        onLeave={() => {
          setViewState('idle');
          setLiveCredentials(null);
        }}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0b1120 0%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflowY: 'auto',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          margin: 'auto',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* Banner */}
        <div
          style={{
            flexShrink: 0,
            background: 'linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%)',
            padding: '24px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
            {meeting.title}
          </h1>
          <div style={{ fontSize: 13, color: '#bfdbfe', marginTop: 6 }}>
            {meeting.cohortName || meeting.cohortCode || 'Clasptek Live Classroom'}
          </div>
          <div
            style={{
              display: 'inline-block',
              marginTop: 10,
              padding: '3px 12px',
              borderRadius: 20,
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: 12,
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            {meeting.provider === 'google_meet' ? '⚠ Platform: Retired provider (unsupported)' : '🎥 Platform: Clasptek LiveKit'}
          </div>
        </div>

        {/* Meeting Metadata */}
        <div style={{ flexShrink: 0, padding: '20px 28px', borderBottom: '1px solid #334155', background: '#0f172a' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, fontSize: 13 }}>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                Facilitator
              </span>
              <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                {meeting.facilitatorName || 'Course Facilitator'}
              </span>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                Date &amp; Time
              </span>
              <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                {dateFormatted}
              </span>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>{timeFormatted}</div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ padding: 28, overflowY: 'auto', flex: 1, overscrollBehavior: 'contain' }}>
          {errorMessage && (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#450a0a',
                border: '1px solid #dc2626',
                color: '#fca5a5',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* State 1: WAITING ROOM SCREEN */}
          {viewState === 'waiting' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(37, 99, 235, 0.2)',
                  border: '2px solid #3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                  animation: 'pulse 2s infinite',
                }}
              >
                <span style={{ fontSize: 28 }}>⏳</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#ffffff' }}>
                You are in the Waiting Room
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px' }}>
                Hello <strong>{guestName}</strong>, the host has been notified of your arrival. Please keep this window open while you are being admitted.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#38bdf8' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#38bdf8',
                    display: 'inline-block',
                  }}
                />
                Waiting for host approval...
              </div>
            </div>
          )}

          {/* State 2: REJECTED SCREEN */}
          {viewState === 'rejected' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#ffffff' }}>
                Access Not Granted
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px' }}>
                {errorMessage || 'The host did not approve your request to join this session.'}
              </p>
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => {
                  setViewState('idle');
                  setErrorMessage(null);
                }}
                style={{ width: '100%' }}
              >
                Back to Invitation
              </button>
            </div>
          )}

          {/* State 3: IDLE SCREEN (Authenticated or Guest Entry) */}
          {viewState === 'idle' && (
            <>
              {meeting.provider === 'google_meet' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      padding: 16,
                      background: '#450a0a',
                      borderRadius: 10,
                      border: '1px solid #dc2626',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#fca5a5',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Meeting unavailable</div>
                    This meeting was created on a video provider that Clasptek no longer supports. Please contact your facilitator to schedule a new Clasptek LiveKit meeting.
                  </div>
                </div>
              ) : currentUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      padding: 14,
                      background: '#0f172a',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                      Logged in as
                    </div>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>{currentUser.name}</div>
                    <div style={{ fontSize: 12, color: '#38bdf8' }}>Role: {currentUser.role}</div>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleAuthenticatedJoin}
                    className="cp-btn primary"
                    style={{
                      width: '100%',
                      padding: '12px 18px',
                      fontSize: 14,
                      fontWeight: 700,
                      justifyContent: 'center',
                    }}
                  >
                    {isSubmitting ? 'Joining Live Room...' : '🎥 Join Live Room'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleGuestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. guest@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                      Organization or Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Guest Speaker / Partner"
                      value={guestOrg}
                      onChange={(e) => setGuestOrg(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="cp-btn primary"
                    style={{
                      width: '100%',
                      padding: '12px 18px',
                      fontSize: 14,
                      fontWeight: 700,
                      justifyContent: 'center',
                      marginTop: 4,
                    }}
                  >
                    {isSubmitting ? 'Submitting Request...' : 'Request Entry to Classroom'}
                  </button>

                  <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                    Already have a Clasptek account?{' '}
                    <a href="/login" style={{ color: '#38bdf8', textDecoration: 'none' }}>
                      Sign In
                    </a>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
