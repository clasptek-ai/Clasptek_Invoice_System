'use client';

/**
 * components/meetings/ParticipantTile.tsx — Phase B
 * Renders an individual participant video/audio tile for local or remote participant.
 * Attaches real WebRTC video and audio tracks via livekit-client.
 * Falls back to an initials avatar when camera is disabled or unmuted.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Participant } from 'livekit-client';
import { Track, ParticipantEvent } from 'livekit-client';

interface ParticipantTileProps {
  participant: Participant;
  isLocal?: boolean;
  roleBadge?: string;
  source?: Track.Source.Camera | Track.Source.ScreenShare;
  isPinned?: boolean;
  onPinToggle?: () => void;
  style?: React.CSSProperties;
}

export function ParticipantTile({
  participant,
  isLocal = false,
  roleBadge,
  source = Track.Source.Camera,
  isPinned = false,
  onPinToggle,
  style,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [hasVideo, setHasVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [, setTrackRevision] = useState(0);

  const isScreenShare = source === Track.Source.ScreenShare;

  useEffect(() => {
    let active = true;

    const updateTracks = () => {
      if (!active) return;

      // Video track handling for camera or screen share
      const videoPub = participant.getTrackPublication(source);
      const isVideoSubscribed = videoPub?.isSubscribed ?? false;
      const videoTrack = videoPub?.track;
      const videoAvailable = Boolean(videoTrack && !videoPub?.isMuted && (isLocal || isVideoSubscribed));

      setHasVideo(Boolean(videoAvailable));
      setTrackRevision((r) => r + 1);

      if (videoRef.current) {
        if (videoAvailable && videoTrack) {
          videoTrack.attach(videoRef.current);
        } else if (videoTrack) {
          videoTrack.detach(videoRef.current);
        }
      }

      // Audio track handling (only for camera participant tiles, and only remote)
      if (!isScreenShare) {
        const audioPub = participant.getTrackPublication(Track.Source.Microphone);
        const audioTrack = audioPub?.track;
        const audioMuted = Boolean(audioPub?.isMuted || !audioTrack);
        setIsMuted(audioMuted);

        if (!isLocal && audioRef.current) {
          if (audioTrack && audioPub?.isSubscribed && !audioPub?.isMuted) {
            audioTrack.attach(audioRef.current);
          } else if (audioTrack) {
            audioTrack.detach(audioRef.current);
          }
        }
      }

      setIsSpeaking(participant.isSpeaking);
    };

    updateTracks();

    // Listen to participant track updates (publications, subscriptions, mute states, speaking)
    const onTrackChanged = () => updateTracks();
    const onIsSpeakingChanged = () => {
      if (active) setIsSpeaking(participant.isSpeaking);
    };

    participant.on(ParticipantEvent.TrackSubscribed, onTrackChanged);
    participant.on(ParticipantEvent.TrackUnsubscribed, onTrackChanged);
    participant.on(ParticipantEvent.TrackPublished, onTrackChanged);
    participant.on(ParticipantEvent.TrackUnpublished, onTrackChanged);
    participant.on(ParticipantEvent.LocalTrackPublished, onTrackChanged);
    participant.on(ParticipantEvent.LocalTrackUnpublished, onTrackChanged);
    participant.on(ParticipantEvent.TrackMuted, onTrackChanged);
    participant.on(ParticipantEvent.TrackUnmuted, onTrackChanged);
    participant.on(ParticipantEvent.IsSpeakingChanged, onIsSpeakingChanged);

    return () => {
      active = false;
      participant.off(ParticipantEvent.TrackSubscribed, onTrackChanged);
      participant.off(ParticipantEvent.TrackUnsubscribed, onTrackChanged);
      participant.off(ParticipantEvent.TrackPublished, onTrackChanged);
      participant.off(ParticipantEvent.TrackUnpublished, onTrackChanged);
      participant.off(ParticipantEvent.LocalTrackPublished, onTrackChanged);
      participant.off(ParticipantEvent.LocalTrackUnpublished, onTrackChanged);
      participant.off(ParticipantEvent.TrackMuted, onTrackChanged);
      participant.off(ParticipantEvent.TrackUnmuted, onTrackChanged);
      participant.off(ParticipantEvent.IsSpeakingChanged, onIsSpeakingChanged);

      if (videoRef.current) {
        const videoPub = participant.getTrackPublication(source);
        if (videoPub?.track) {
          videoPub.track.detach(videoRef.current);
        }
      }
      if (!isLocal && !isScreenShare && audioRef.current) {
        const audioPub = participant.getTrackPublication(Track.Source.Microphone);
        if (audioPub?.track) {
          audioPub.track.detach(audioRef.current);
        }
      }
    };
  }, [participant, isLocal, source, isScreenShare]);

  // Derive identity and display name
  const rawDisplayName = participant.name || participant.identity || 'Participant';
  const displayName = isScreenShare ? `${rawDisplayName}'s Screen` : rawDisplayName;
  const initial = rawDisplayName.charAt(0).toUpperCase() || 'P';

  return (
    <div
      style={{
        position: 'relative',
        background: '#1E293B',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16/9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: !isScreenShare && isSpeaking ? '2px solid #10B981' : isPinned ? '2px solid #F59E0B' : '2px solid #334155',
        boxShadow: !isScreenShare && isSpeaking
          ? '0 0 16px rgba(16, 185, 129, 0.35)'
          : isPinned
          ? '0 0 16px rgba(245, 158, 11, 0.35)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
        minHeight: 140,
        ...style,
      }}
    >
      {/* Pin Control Button */}
      {onPinToggle && !isScreenShare && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPinToggle();
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: isPinned ? 'rgba(245, 158, 11, 0.95)' : 'rgba(15, 23, 42, 0.8)',
            border: isPinned ? '1px solid #F59E0B' : '1px solid #334155',
            color: '#FFF',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            zIndex: 6,
            backdropFilter: 'blur(4px)',
          }}
          title={isPinned ? 'Unpin participant' : 'Pin participant to stage'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
          </svg>
          <span>{isPinned ? 'Pinned' : 'Pin'}</span>
        </button>
      )}
      {/* Video Stream Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isScreenShare ? 'contain' : 'cover',
          display: hasVideo ? 'block' : 'none',
          transform: isLocal && !isScreenShare ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Audio Stream for Remote Participants (camera tiles only) */}
      {!isLocal && !isScreenShare && <audio ref={audioRef} autoPlay />}

      {/* Avatar Fallback when Video is disabled or unmuted */}
      {!hasVideo && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isScreenShare ? (
            <>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>Screen Share Inactive</span>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: isLocal
                    ? 'linear-gradient(135deg, #1E3A8A, #0D9488)'
                    : 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                  color: '#FFF',
                  fontSize: 28,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                {initial}
              </div>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>Camera Off</span>
            </>
          )}
        </div>
      )}

      {/* Participant Badge & Mic Indicator Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          right: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            color: '#FFF',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: '80%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span>
            {displayName} {isLocal && !isScreenShare && '(You)'}
          </span>
          {roleBadge && (
            <span
              style={{
                fontSize: 10,
                color: roleBadge.toLowerCase().includes('host')
                  ? '#38BDF8'
                  : roleBadge.toLowerCase().includes('screen')
                  ? '#34D399'
                  : '#A78BFA',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              • {roleBadge}
            </span>
          )}
        </div>

        {/* Microphone State Pill (only for camera participant tiles) */}
        {!isScreenShare && (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: isMuted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
            title={isMuted ? 'Muted' : 'Microphone Active'}
          >
            {isMuted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
