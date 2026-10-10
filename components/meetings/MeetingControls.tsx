'use client';

/**
 * components/meetings/MeetingControls.tsx — Phase B
 * In-meeting interactive control bar:
 * Controls actual WebRTC tracks for microphone, camera, and screen sharing via livekit-client.
 * Includes host termination, participant exit, and connection health indicators.
 */

import React, { useState } from 'react';
import type { Room } from 'livekit-client';

interface MeetingControlsProps {
  room: Room | null;
  isHost: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  connectionState: string;
  viewMode?: 'speaker' | 'gallery';
  onToggleViewMode?: () => void;
  activePanel?: 'none' | 'chat' | 'participants';
  onTogglePanel?: (panel: 'chat' | 'participants') => void;
  participantCount?: number;
  unreadChatCount?: number;
  onToggleMic: () => Promise<void>;
  onToggleCam: () => Promise<void>;
  onToggleScreenShare: () => Promise<void>;
  onLeave: () => void;
  onEndMeeting?: () => Promise<void>;
}

export function MeetingControls({
  room,
  isHost,
  isMicOn,
  isCamOn,
  isScreenSharing,
  connectionState,
  viewMode = 'speaker',
  onToggleViewMode,
  activePanel = 'none',
  onTogglePanel,
  participantCount = 1,
  unreadChatCount = 0,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onLeave,
  onEndMeeting,
}: MeetingControlsProps) {
  const [isEnding, setIsEnding] = useState(false);
  const [isTogglingMic, setIsTogglingMic] = useState(false);
  const [isTogglingCam, setIsTogglingCam] = useState(false);
  const [isTogglingScreen, setIsTogglingScreen] = useState(false);

  const handleMicClick = async () => {
    if (isTogglingMic) return;
    setIsTogglingMic(true);
    try {
      await onToggleMic();
    } finally {
      setIsTogglingMic(false);
    }
  };

  const handleCamClick = async () => {
    if (isTogglingCam) return;
    setIsTogglingCam(true);
    try {
      await onToggleCam();
    } finally {
      setIsTogglingCam(false);
    }
  };

  const handleScreenClick = async () => {
    if (isTogglingScreen) return;
    setIsTogglingScreen(true);
    try {
      await onToggleScreenShare();
    } finally {
      setIsTogglingScreen(false);
    }
  };

  const handleEndClick = async () => {
    if (!onEndMeeting) return;
    if (window.confirm('Are you sure you want to end this meeting for all participants?')) {
      setIsEnding(true);
      try {
        await onEndMeeting();
      } finally {
        setIsEnding(false);
      }
    }
  };

  // Determine connection status color
  let connColor = '#10B981'; // green for connected
  if (connectionState === 'connecting' || connectionState === 'reconnecting') connColor = '#F59E0B'; // amber
  if (connectionState === 'disconnected' || connectionState === 'error') connColor = '#EF4444'; // red

  return (
    <div
      style={{
        padding: '12px 24px',
        borderTop: '1px solid #1E293B',
        background: '#090D16',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        zIndex: 10,
      }}
    >
      {/* Left: Connection State Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connColor,
            boxShadow: `0 0 8px ${connColor}`,
          }}
        />
        <span style={{ fontSize: 12, color: '#94A3B8', textTransform: 'capitalize' }}>
          {connectionState}
        </span>
      </div>

      {/* Center: Primary Media & Meeting Controls Dock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Microphone Toggle */}
        <button
          className="cp-btn sm"
          disabled={!room || isTogglingMic}
          onClick={handleMicClick}
          style={{
            minWidth: 110,
            background: isMicOn ? '#1E293B' : '#DC2626',
            color: '#FFF',
            border: isMicOn ? '1px solid #334155' : '1px solid #EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicOn ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          <span>{isMicOn ? 'Mute' : 'Unmute'}</span>
        </button>

        {/* Camera Toggle */}
        <button
          className="cp-btn sm"
          disabled={!room || isTogglingCam}
          onClick={handleCamClick}
          style={{
            minWidth: 120,
            background: isCamOn ? '#1E293B' : '#DC2626',
            color: '#FFF',
            border: isCamOn ? '1px solid #334155' : '1px solid #EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isCamOn ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m5 0h6a2 2 0 0 1 2 2v4" />
              <polyline points="23 7 16 12 23 17" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
          <span>{isCamOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        {/* Screen Share Toggle */}
        <button
          className="cp-btn sm"
          disabled={!room || isTogglingScreen}
          onClick={handleScreenClick}
          style={{
            minWidth: 130,
            background: isScreenSharing ? '#2563EB' : '#1E293B',
            color: '#FFF',
            border: isScreenSharing ? '1px solid #3B82F6' : '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>

        {/* View Mode Switcher Toggle */}
        {onToggleViewMode && (
          <button
            className="cp-btn sm secondary"
            onClick={onToggleViewMode}
            style={{
              background: '#1E293B',
              color: '#FFF',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            title={viewMode === 'speaker' ? 'Switch to Gallery View' : 'Switch to Speaker View'}
          >
            {viewMode === 'speaker' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <rect x="2" y="3" width="6" height="3" />
                <rect x="9" y="3" width="6" height="3" />
                <rect x="16" y="3" width="6" height="3" />
              </svg>
            )}
            <span>{viewMode === 'speaker' ? 'Gallery View' : 'Speaker View'}</span>
          </button>
        )}

        {/* Participants Panel Toggle */}
        {onTogglePanel && (
          <button
            className="cp-btn sm secondary"
            onClick={() => onTogglePanel('participants')}
            style={{
              background: activePanel === 'participants' ? '#2563EB' : '#1E293B',
              color: '#FFF',
              border: activePanel === 'participants' ? '1px solid #3B82F6' : '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            title="Toggle Participants Panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Participants ({participantCount})</span>
          </button>
        )}

        {/* Chat Panel Toggle */}
        {onTogglePanel && (
          <button
            className="cp-btn sm secondary"
            onClick={() => onTogglePanel('chat')}
            style={{
              background: activePanel === 'chat' ? '#2563EB' : '#1E293B',
              color: '#FFF',
              border: activePanel === 'chat' ? '1px solid #3B82F6' : '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              position: 'relative',
            }}
            title="Toggle Meeting Chat Panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
            {unreadChatCount > 0 && activePanel !== 'chat' && (
              <span
                style={{
                  background: '#EF4444',
                  color: '#FFF',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  marginLeft: 2,
                }}
              >
                {unreadChatCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Right: Exit / End Meeting Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isHost && onEndMeeting && (
          <button
            className="cp-btn sm danger"
            disabled={isEnding}
            onClick={handleEndClick}
            style={{
              background: '#DC2626',
              color: '#FFF',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isEnding ? 'Ending...' : 'End for All'}
          </button>
        )}

        <button
          className="cp-btn sm secondary"
          onClick={onLeave}
          style={{
            background: '#334155',
            color: '#FFF',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
