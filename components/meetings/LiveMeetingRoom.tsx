'use client';

/**
 * components/meetings/LiveMeetingRoom.tsx — Phase C: Zoom-Style Meeting Experience
 * Authoritative Live Meeting Room Container powered by livekit-client WebRTC.
 * 
 * Features:
 * - Speaker View: Active speaker detection with prominent landscape stage & top filmstrip.
 * - Screen Share Mode: Presentation priority takeover with object-fit: contain.
 * - Gallery View: Dynamic responsive grid adjusting to participant counts.
 * - Manual Pinning: Pin/unpin participants with visual distinction from auto-speaker.
 * - Collapsible Drawers: Integrated live in-meeting Chat (P2P data channel) & Participants panel.
 * - Complete teardown resilience, Strict Mode protection, and zero emoji UI buttons.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Participant,
  Track,
  VideoPresets,
} from 'livekit-client';
import type { Meeting } from '@/types/meetings';
import { ParticipantTile } from './ParticipantTile';
import { MeetingControls } from './MeetingControls';

interface LiveMeetingRoomProps {
  meeting: Meeting;
  token: string;
  serverUrl: string;
  isHost: boolean;
  currentUser: { id: string; name: string; role: string; email: string };
  onLeave: () => void;
  onEndMeeting?: () => Promise<void>;
}

export function LiveMeetingRoom({
  meeting,
  token,
  serverUrl,
  isHost,
  currentUser,
  onLeave,
  onEndMeeting,
}: LiveMeetingRoomProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [isMicOn, setIsMicOn] = useState<boolean>(true);
  const [isCamOn, setIsCamOn] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Layout & UI State (isolated from WebRTC connection lifecycle)
  const [viewMode, setViewMode] = useState<'speaker' | 'gallery'>('speaker');
  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'participants'>('none');
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const [activeSpeakerIdentity, setActiveSpeakerIdentity] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    {
      sender: 'System',
      text: `Connected to ${meeting.title} session`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');

  const activeRef = useRef<boolean>(true);
  const roomInstanceRef = useRef<Room | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Meeting Elapsed Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activePanel === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activePanel]);

  // Reset unread count when chat opens
  useEffect(() => {
    if (activePanel === 'chat') {
      setUnreadChatCount(0);
    }
  }, [activePanel]);

  // Connect to LiveKit Room
  useEffect(() => {
    activeRef.current = true;
    let currentRoom: Room | null = null;

    async function initRoom() {
      try {
        setConnectionState('connecting');
        setConnectionError(null);

        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution,
          },
        });

        currentRoom = lkRoom;
        roomInstanceRef.current = lkRoom;

        // Register room lifecycle listeners
        lkRoom.on(RoomEvent.Connected, () => {
          if (!activeRef.current) return;
          setConnectionState('connected');
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.Reconnecting, () => {
          if (!activeRef.current) return;
          setConnectionState('reconnecting');
        });

        lkRoom.on(RoomEvent.Reconnected, () => {
          if (!activeRef.current) return;
          setConnectionState('connected');
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.Disconnected, () => {
          if (!activeRef.current) return;
          setConnectionState('disconnected');
        });

        lkRoom.on(RoomEvent.ParticipantConnected, () => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
          setPinnedIdentity((prev) => (prev === p.identity ? null : prev));
          setActiveSpeakerIdentity((prev) => (prev === p.identity ? null : prev));
        });

        lkRoom.on(RoomEvent.TrackSubscribed, () => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.TrackUnsubscribed, () => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.TrackPublished, () => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        lkRoom.on(RoomEvent.TrackUnpublished, () => {
          if (!activeRef.current) return;
          setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
        });

        // Active speaker detection
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          if (!activeRef.current) return;
          if (speakers && speakers.length > 0) {
            setActiveSpeakerIdentity(speakers[0].identity);
          }
        });

        // Genuine LiveKit P2P in-room data channel chat messages
        lkRoom.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: Participant) => {
          if (!activeRef.current) return;
          try {
            const raw = new TextDecoder().decode(payload);
            const data = JSON.parse(raw);
            if (data && data.text) {
              setChatMessages((prev) => [
                ...prev,
                {
                  sender: participant?.name || participant?.identity || data.sender || 'Participant',
                  text: data.text,
                  time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
              setUnreadChatCount((prev) => prev + 1);
            }
          } catch {
            // Ignore malformed payloads
          }
        });

        // Local track updates with direct payload inspection
        lkRoom.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (!activeRef.current) return;
          if (pub?.source === Track.Source.ScreenShare) {
            setIsScreenSharing(true);
          } else if (pub?.source === Track.Source.Camera) {
            setIsCamOn(!pub.isMuted);
          } else if (pub?.source === Track.Source.Microphone) {
            setIsMicOn(!pub.isMuted);
          }
          const micTrack = lkRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
          const camTrack = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
          const screenTrack = lkRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
          if (micTrack) setIsMicOn(!micTrack.isMuted);
          if (camTrack) setIsCamOn(!camTrack.isMuted);
          if (screenTrack) setIsScreenSharing(!screenTrack.isMuted);
        });

        lkRoom.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (!activeRef.current) return;
          if (pub?.source === Track.Source.ScreenShare) {
            setIsScreenSharing(false);
          } else if (pub?.source === Track.Source.Camera) {
            setIsCamOn(false);
          } else if (pub?.source === Track.Source.Microphone) {
            setIsMicOn(false);
          }
        });

        // Connect to LiveKit SFU server
        await lkRoom.connect(serverUrl, token);

        if (!activeRef.current) {
          lkRoom.removeAllListeners();
          lkRoom.disconnect(true);
          return;
        }

        setRoom(lkRoom);

        // Initial microphone publication
        try {
          await lkRoom.localParticipant.setMicrophoneEnabled(true);
          setIsMicOn(true);
        } catch (micErr: unknown) {
          console.warn('[LiveMeetingRoom] Microphone permission or device error:', micErr);
          setDeviceWarning('Microphone access is unavailable or was denied by your browser.');
          setIsMicOn(false);
        }

        // Initial camera publication
        try {
          await lkRoom.localParticipant.setCameraEnabled(true);
          setIsCamOn(true);
        } catch (camErr: unknown) {
          console.warn('[LiveMeetingRoom] Camera permission or device error:', camErr);
          setDeviceWarning((prev) =>
            prev ? `${prev} Camera access is also unavailable.` : 'Camera access is unavailable or was denied by your browser.'
          );
          setIsCamOn(false);
        }
      } catch (err: unknown) {
        console.error('[LiveMeetingRoom] Connection failed:', err);
        if (activeRef.current) {
          setConnectionState('error');
          const msg = err instanceof Error ? err.message : 'Failed to connect to LiveKit meeting server.';
          setConnectionError(msg);
        }
      }
    }

    initRoom();

    return () => {
      activeRef.current = false;
      if (currentRoom) {
        currentRoom.removeAllListeners();
        currentRoom.disconnect(true);
      }
      roomInstanceRef.current = null;
    };
  }, [serverUrl, token]);

  // Media Toggle Handlers
  const handleToggleMic = useCallback(async () => {
    if (!room) return;
    try {
      const nextState = !isMicOn;
      await room.localParticipant.setMicrophoneEnabled(nextState);
      setIsMicOn(nextState);
    } catch (err: unknown) {
      console.error('[LiveMeetingRoom] Failed to toggle microphone:', err);
      alert('Could not toggle microphone. Please check browser device permissions.');
    }
  }, [room, isMicOn]);

  const handleToggleCam = useCallback(async () => {
    if (!room) return;
    try {
      const nextState = !isCamOn;
      await room.localParticipant.setCameraEnabled(nextState);
      setIsCamOn(nextState);
    } catch (err: unknown) {
      console.error('[LiveMeetingRoom] Failed to toggle camera:', err);
      alert('Could not toggle camera. Please check browser device permissions.');
    }
  }, [room, isCamOn]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!room) return;
    try {
      const nextState = !isScreenSharing;
      await room.localParticipant.setScreenShareEnabled(nextState);
      setIsScreenSharing(nextState);
    } catch (err: unknown) {
      console.warn('[LiveMeetingRoom] Screen share cancelled or unsupported:', err);
      setIsScreenSharing(false);
    }
  }, [room, isScreenSharing]);

  // UI Handlers (do not trigger room reconnection)
  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'speaker' ? 'gallery' : 'speaker'));
  }, []);

  const handleTogglePanel = useCallback((panel: 'chat' | 'participants') => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  }, []);

  const handleTogglePin = useCallback((identity: string) => {
    setPinnedIdentity((prev) => (prev === identity ? null : identity));
  }, []);

  const handleSendChat = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !room) return;
      const text = chatInput.trim();
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg = { sender: currentUser.name, text, time };
      try {
        const payload = new TextEncoder().encode(JSON.stringify(msg));
        await room.localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn('[LiveMeetingRoom] Failed to publish chat data message:', err);
      }
      setChatMessages((prev) => [...prev, msg]);
      setChatInput('');
    },
    [chatInput, room, currentUser.name]
  );

  const totalParticipantCount = 1 + remoteParticipants.length;

  // Active Screen Share Detection
  const remoteScreenShare = remoteParticipants.find((p) => {
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    return pub && !pub.isMuted && (pub.isSubscribed || pub.track);
  });
  const localScreenShare =
    isScreenSharing &&
    room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track &&
    !room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.isMuted
      ? room.localParticipant
      : null;

  const activeScreenShare = remoteScreenShare || localScreenShare;

  // Stage Participant Resolution for Speaker View:
  // 1. Screen Share (Presentation takes top priority)
  // 2. Manual Pin
  // 3. Active Speaker
  // 4. Sensible Fallback (first remote or local)
  let stageParticipant: Participant | null = null;
  let stageSource: Track.Source.Camera | Track.Source.ScreenShare = Track.Source.Camera;
  let stageType: 'screenshare' | 'pinned' | 'speaker' | 'default' = 'default';

  if (activeScreenShare) {
    stageParticipant = activeScreenShare;
    stageSource = Track.Source.ScreenShare;
    stageType = 'screenshare';
  } else if (pinnedIdentity) {
    if (room && room.localParticipant.identity === pinnedIdentity) {
      stageParticipant = room.localParticipant;
      stageType = 'pinned';
    } else {
      const match = remoteParticipants.find((p) => p.identity === pinnedIdentity);
      if (match) {
        stageParticipant = match;
        stageType = 'pinned';
      }
    }
  }

  if (!stageParticipant && activeSpeakerIdentity) {
    if (room && room.localParticipant.identity === activeSpeakerIdentity) {
      stageParticipant = room.localParticipant;
      stageType = 'speaker';
    } else {
      const match = remoteParticipants.find((p) => p.identity === activeSpeakerIdentity);
      if (match) {
        stageParticipant = match;
        stageType = 'speaker';
      }
    }
  }

  if (!stageParticipant && room) {
    if (remoteParticipants.length > 0) {
      stageParticipant = remoteParticipants[0];
    } else {
      stageParticipant = room.localParticipant;
    }
    stageType = 'default';
  }

  // Filmstrip Participants for Speaker View
  const filmstripItems: Array<{ participant: Participant; isLocal: boolean }> = [];
  if (room) {
    if (stageType === 'screenshare' || stageParticipant?.identity !== room.localParticipant.identity) {
      filmstripItems.push({ participant: room.localParticipant, isLocal: true });
    }
    remoteParticipants.forEach((remote) => {
      if (stageType === 'screenshare' || stageParticipant?.identity !== remote.identity) {
        filmstripItems.push({ participant: remote, isLocal: false });
      }
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#090D16',
        color: '#FFF',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      {/* Top Meeting Header Bar */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid #1E293B',
          background: '#0B1120',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          zIndex: 10,
        }}
      >
        {/* Left: Meeting Branding & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{meeting.title}</span>
              <span
                style={{
                  background: '#DC2626',
                  color: '#FFF',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFF' }} />
                LIVE
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>
              Room: {meeting.publicId} &middot; Role:{' '}
              <span style={{ color: isHost ? '#38BDF8' : '#A78BFA', fontWeight: 600 }}>
                {isHost ? 'Host' : 'Participant'}
              </span>
            </div>
          </div>
        </div>

        {/* Center / Right Metadata & Quick Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Call Elapsed Timer */}
          <div
            style={{
              background: '#1E293B',
              padding: '4px 10px',
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              color: '#CBD5E1',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          {/* View Mode Indicator Badge */}
          <button
            onClick={handleToggleViewMode}
            style={{
              background: '#1E293B',
              border: '1px solid #334155',
              padding: '4px 10px',
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              color: '#38BDF8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Click to toggle Speaker / Gallery View"
          >
            <span>{viewMode === 'speaker' ? 'Speaker View' : 'Gallery View'}</span>
          </button>
        </div>
      </div>

      {/* Hardware / Permission Warning Notice */}
      {deviceWarning && (
        <div
          style={{
            background: 'rgba(217, 119, 6, 0.15)',
            borderBottom: '1px solid #D97706',
            color: '#FDE68A',
            padding: '8px 24px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
          }}
        >
          <span>Notice: {deviceWarning}</span>
          <button
            onClick={() => setDeviceWarning(null)}
            style={{ background: 'none', border: 'none', color: '#FDE68A', cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Video Arena & Collapsible Side Panels */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* Connection Loading State */}
        {connectionState === 'connecting' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div
              style={{
                width: 44,
                height: 44,
                border: '3px solid #334155',
                borderTopColor: '#38BDF8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: 16,
              }}
            />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Connecting to LiveKit Room...</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              Establishing secure WebRTC audio and video session
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Connection Failure Error Screen */}
        {connectionState === 'error' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div
              style={{
                maxWidth: 480,
                background: '#1E293B',
                border: '1px solid #EF4444',
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F87171' }}>Connection Failed</div>
              <div style={{ fontSize: 13, color: '#94A3B8', margin: '8px 0 20px 0' }}>
                {connectionError || 'Unable to establish peer connection to the media server.'}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  className="cp-btn primary sm"
                  onClick={() => window.location.reload()}
                  style={{ padding: '8px 20px' }}
                >
                  Retry Connection
                </button>
                <button
                  className="cp-btn secondary sm"
                  onClick={onLeave}
                  style={{ padding: '8px 20px' }}
                >
                  Back to Meetings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connected Participant Arena */}
        {connectionState === 'connected' && room && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              minWidth: 0,
              background: '#0F172A',
            }}
          >
            {/* View Mode: SPEAKER VIEW */}
            {viewMode === 'speaker' && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: 14,
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                {/* Horizontal Filmstrip (compact scrollable strip of remaining participants) */}
                {filmstripItems.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      overflowX: 'auto',
                      paddingBottom: 4,
                      flexShrink: 0,
                      scrollbarWidth: 'thin',
                    }}
                  >
                    {filmstripItems.map((item) => (
                      <div
                        key={`${item.participant.identity || item.participant.sid}-film`}
                        style={{
                          width: 200,
                          minWidth: 160,
                          height: 114,
                          flexShrink: 0,
                        }}
                      >
                        <ParticipantTile
                          participant={item.participant}
                          isLocal={item.isLocal}
                          roleBadge={item.isLocal && isHost ? 'Host' : undefined}
                          source={Track.Source.Camera}
                          isPinned={pinnedIdentity === item.participant.identity}
                          onPinToggle={() => handleTogglePin(item.participant.identity)}
                          style={{ width: '100%', height: '100%', minHeight: 110 }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Main Landscape Stage */}
                {stageParticipant && (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      background: '#080D1A',
                      borderRadius: 12,
                      border: '1px solid #1E293B',
                      overflow: 'hidden',
                      minHeight: 0,
                    }}
                  >
                    {/* Stage Type Indicator Pill Badge */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        zIndex: 8,
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(6px)',
                        padding: '5px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        border: '1px solid #334155',
                      }}
                    >
                      {stageType === 'screenshare' ? (
                        <>
                          <span style={{ color: '#34D399', fontSize: 14 }}>●</span>
                          <span>Shared Presentation</span>
                        </>
                      ) : stageType === 'pinned' ? (
                        <>
                          <span style={{ color: '#F59E0B' }}>📌</span>
                          <span>Pinned Stage</span>
                          <button
                            onClick={() => setPinnedIdentity(null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94A3B8',
                              cursor: 'pointer',
                              marginLeft: 4,
                              fontSize: 11,
                              textDecoration: 'underline',
                            }}
                          >
                            Unpin
                          </button>
                        </>
                      ) : stageType === 'speaker' ? (
                        <>
                          <span style={{ color: '#10B981' }}>🔊</span>
                          <span>Active Speaker</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: '#38BDF8' }}>🎥</span>
                          <span>Meeting Stage</span>
                        </>
                      )}
                    </div>

                    <ParticipantTile
                      participant={stageParticipant}
                      isLocal={stageParticipant.identity === room.localParticipant.identity}
                      roleBadge={
                        stageParticipant.identity === room.localParticipant.identity && isHost
                          ? 'Host'
                          : undefined
                      }
                      source={stageSource}
                      isPinned={pinnedIdentity === stageParticipant.identity}
                      onPinToggle={() => handleTogglePin(stageParticipant.identity)}
                      style={{ width: '100%', height: '100%', minHeight: '100%', borderRadius: 0, border: 'none' }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* View Mode: GALLERY VIEW */}
            {viewMode === 'gallery' && (
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns:
                    totalParticipantCount === 1
                      ? '1fr'
                      : totalParticipantCount === 2
                      ? 'repeat(2, 1fr)'
                      : totalParticipantCount <= 4
                      ? 'repeat(2, 1fr)'
                      : totalParticipantCount <= 6
                      ? 'repeat(3, 1fr)'
                      : totalParticipantCount <= 9
                      ? 'repeat(3, 1fr)'
                      : 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                  padding: 14,
                  overflowY: 'auto',
                  alignContent: 'center',
                  maxHeight: '100%',
                }}
              >
                {activeScreenShare && (
                  <ParticipantTile
                    key={`${activeScreenShare.identity || activeScreenShare.sid}-gallery-screen`}
                    participant={activeScreenShare}
                    isLocal={activeScreenShare.identity === room.localParticipant.identity}
                    roleBadge="Screen Share"
                    source={Track.Source.ScreenShare}
                    isPinned={pinnedIdentity === activeScreenShare.identity}
                    onPinToggle={() => handleTogglePin(activeScreenShare.identity)}
                  />
                )}
                <ParticipantTile
                  participant={room.localParticipant}
                  isLocal={true}
                  roleBadge={isHost ? 'Host' : currentUser.role}
                  source={Track.Source.Camera}
                  isPinned={pinnedIdentity === room.localParticipant.identity}
                  onPinToggle={() => handleTogglePin(room.localParticipant.identity)}
                />
                {remoteParticipants.map((remote) => (
                  <ParticipantTile
                    key={remote.identity || remote.sid}
                    participant={remote}
                    isLocal={false}
                    roleBadge="Participant"
                    source={Track.Source.Camera}
                    isPinned={pinnedIdentity === remote.identity}
                    onPinToggle={() => handleTogglePin(remote.identity)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Panel: CHAT DRAWER */}
        {activePanel === 'chat' && (
          <div
            style={{
              width: 320,
              maxWidth: '100%',
              background: '#0B1120',
              borderLeft: '1px solid #1E293B',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9,
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Meeting Chat &amp; Q&amp;A</span>
              </div>
              <button
                onClick={() => setActivePanel('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '2px 6px',
                }}
                title="Close Chat"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                padding: 12,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    background: msg.sender === currentUser.name ? 'rgba(37, 99, 235, 0.15)' : '#1E293B',
                    border: msg.sender === currentUser.name ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94A3B8', fontSize: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: msg.sender === currentUser.name ? '#60A5FA' : '#CBD5E1' }}>
                      {msg.sender} {msg.sender === currentUser.name && '(You)'}
                    </span>
                    <span>{msg.time}</span>
                  </div>
                  <div style={{ color: '#F1F5F9', wordBreak: 'break-word', lineHeight: 1.4 }}>{msg.text}</div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <form
              onSubmit={handleSendChat}
              style={{
                padding: 10,
                borderTop: '1px solid #1E293B',
                display: 'flex',
                gap: 8,
                background: '#090D16',
              }}
            >
              <input
                type="text"
                placeholder="Type a message..."
                className="cp-input"
                style={{
                  flex: 1,
                  background: '#1E293B',
                  color: '#FFF',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                }}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="cp-btn primary sm" style={{ padding: '6px 12px', fontSize: 12 }}>
                Send
              </button>
            </form>
          </div>
        )}

        {/* Collapsible Panel: PARTICIPANTS DRAWER */}
        {activePanel === 'participants' && (
          <div
            style={{
              width: 320,
              maxWidth: '100%',
              background: '#0B1120',
              borderLeft: '1px solid #1E293B',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9,
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                <span>Participants ({totalParticipantCount})</span>
              </div>
              <button
                onClick={() => setActivePanel('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '2px 6px',
                }}
                title="Close Participants"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                padding: 12,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Local Participant Entry */}
              <div
                style={{
                  padding: '8px 10px',
                  background: '#1E293B',
                  borderRadius: 8,
                  border: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser.name} (You)
                    </div>
                    <div style={{ fontSize: 10, color: isHost ? '#38BDF8' : '#A78BFA', fontWeight: 600 }}>
                      {isHost ? 'Host' : currentUser.role}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }} title={isMicOn ? 'Mic Unmuted' : 'Mic Muted'}>
                    {isMicOn ? '🎤' : '🔇'}
                  </span>
                  <span style={{ fontSize: 12 }} title={isCamOn ? 'Camera Active' : 'Camera Muted'}>
                    {isCamOn ? '📹' : '🚫'}
                  </span>
                </div>
              </div>

              {/* Remote Participants Entries */}
              {remoteParticipants.map((remote) => {
                const rName = remote.name || remote.identity || 'Participant';
                const micPub = remote.getTrackPublication(Track.Source.Microphone);
                const camPub = remote.getTrackPublication(Track.Source.Camera);
                const rMicOn = Boolean(micPub && !micPub.isMuted);
                const rCamOn = Boolean(camPub && !camPub.isMuted);
                const isRemotePinned = pinnedIdentity === remote.identity;

                return (
                  <div
                    key={remote.identity || remote.sid}
                    style={{
                      padding: '8px 10px',
                      background: '#1E293B',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {rName.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rName}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>Participant</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => handleTogglePin(remote.identity)}
                        style={{
                          background: isRemotePinned ? '#F59E0B' : '#0B1120',
                          border: '1px solid #334155',
                          color: '#FFF',
                          borderRadius: 4,
                          fontSize: 10,
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                        title={isRemotePinned ? 'Unpin participant' : 'Pin to main stage'}
                      >
                        {isRemotePinned ? 'Pinned' : 'Pin'}
                      </button>
                      <span style={{ fontSize: 12 }} title={rMicOn ? 'Mic Unmuted' : 'Mic Muted'}>
                        {rMicOn ? '🎤' : '🔇'}
                      </span>
                      <span style={{ fontSize: 12 }} title={rCamOn ? 'Camera Active' : 'Camera Off'}>
                        {rCamOn ? '📹' : '🚫'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Bar */}
      <MeetingControls
        room={room}
        isHost={isHost}
        isMicOn={isMicOn}
        isCamOn={isCamOn}
        isScreenSharing={isScreenSharing}
        connectionState={connectionState}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        activePanel={activePanel}
        onTogglePanel={handleTogglePanel}
        participantCount={totalParticipantCount}
        unreadChatCount={unreadChatCount}
        onToggleMic={handleToggleMic}
        onToggleCam={handleToggleCam}
        onToggleScreenShare={handleToggleScreenShare}
        onLeave={onLeave}
        onEndMeeting={onEndMeeting}
      />
    </div>
  );
}
