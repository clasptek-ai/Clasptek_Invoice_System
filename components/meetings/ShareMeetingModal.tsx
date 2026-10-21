/**
 * components/meetings/ShareMeetingModal.tsx — Clasptek Meetings LiveKit Only
 * Dedicated modal for sharing meeting invitations via:
 * 1. Direct Clipboard Copy (stable, secure URL)
 * 2. WhatsApp URL-encoded sharing (reviewed message)
 * 3. Email Invitations (via configured server service or client mailto)
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { Meeting } from '@/types/meetings';

interface ShareMeetingModalProps {
  meeting: Meeting | null;
  onClose: () => void;
}

export function ShareMeetingModal({ meeting, onClose }: ShareMeetingModalProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'whatsapp' | 'email'>('link');
  const [copied, setCopied] = useState<boolean>(false);
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [whatsAppPhone, setWhatsAppPhone] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!meeting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [meeting, onClose]);

  if (!meeting) return null;

  // Google Meet is retired: legacy rows remain readable, but no external link is ever offered.
  const isGoogleMeet = meeting.sfuProvider === 'google_meet';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.clasptek.org';
  const meetingUrl = isGoogleMeet ? '' : `${origin}/meet/${meeting.publicId}`;

  // Formatted date and time
  const startDate = meeting.scheduledStart ? new Date(meeting.scheduledStart) : new Date();
  const endDate = meeting.scheduledEnd ? new Date(meeting.scheduledEnd) : new Date();
  const dateStr = startDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const defaultInvitationText = isGoogleMeet
    ? `This meeting was created on a retired video provider and can no longer be shared.\n` +
      `Meeting: ${meeting.title}\n` +
      `Please schedule a new Clasptek LiveKit meeting.`
    : `🎓 Clasptek Online Classroom Invitation\n` +
      `Meeting: ${meeting.title}\n` +
      `Facilitator: ${meeting.facilitatorName || 'Course Facilitator'}\n` +
      `Platform: Clasptek LiveKit\n` +
      `Date: ${dateStr}\n` +
      `Time: ${timeStr}\n\n` +
      `Join via Clasptek LiveKit Classroom:\n` +
      `${meetingUrl}`;

  const [invitationMessage, setInvitationMessage] = useState<string>(defaultInvitationText);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handleCopyFullText = async () => {
    try {
      await navigator.clipboard.writeText(invitationMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = whatsAppPhone.replace(/\D/g, '');
    let waUrl = 'https://wa.me/';
    if (cleanPhone) {
      const international = cleanPhone.startsWith('0') && cleanPhone.length === 11
        ? `234${cleanPhone.slice(1)}`
        : cleanPhone;
      waUrl += `${international}?text=${encodeURIComponent(invitationMessage)}`;
    } else {
      waUrl += `?text=${encodeURIComponent(invitationMessage)}`;
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendEmailServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGoogleMeet) {
      setEmailFeedback({ type: 'error', message: 'This meeting uses a retired provider and cannot be shared. Schedule a new LiveKit meeting.' });
      return;
    }

    if (!recipientEmail.trim()) {
      setEmailFeedback({ type: 'error', message: 'Please enter at least one recipient email address.' });
      return;
    }

    setIsSendingEmail(true);
    setEmailFeedback(null);

    try {
      const recipients = recipientEmail
        .split(',')
        .map((em) => em.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch('/api/meetings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          publicId: meeting.publicId,
          recipients,
          message: invitationMessage,
          channel: 'email',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEmailFeedback({
          type: 'success',
          message: data.feedback || `Invitation successfully sent to ${recipients.length} recipient(s).`,
        });
        setRecipientEmail('');
      } else if (data.fallbackMailto) {
        // Server email service not configured, trigger mailto fallback
        setEmailFeedback({
          type: 'info',
          message: data.message || 'Server email service not configured. Opening default email client...',
        });
        window.location.href = data.fallbackMailto;
      } else {
        setEmailFeedback({
          type: 'error',
          message: data.message || data.error || 'Failed to dispatch email invitation.',
        });
      }
    } catch {
      setEmailFeedback({
        type: 'error',
        message: 'Network error communicating with email dispatch service.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const mailtoSubject = encodeURIComponent(`Invitation: ${meeting.title} — Clasptek Online Classroom`);
  const mailtoBody = encodeURIComponent(invitationMessage);
  const clientMailtoUrl = `mailto:${recipientEmail ? recipientEmail.trim() : ''}?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="cp-card"
        style={{
          width: '100%',
          maxWidth: 580,
          background: 'var(--surface, #ffffff)',
          borderRadius: 14,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-header, #f8fafc)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🔗</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
                Share Meeting Invitation
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
                {meeting.title} ({meeting.cohortCode || 'Live Classroom'})
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: isGoogleMeet ? '#fef3c7' : '#dbeafe',
                  color: isGoogleMeet ? '#b45309' : '#1d4ed8',
                  border: `1px solid ${isGoogleMeet ? '#fcd34d' : '#bfdbfe'}`,
                }}
              >
                {isGoogleMeet ? '⚠ Legacy provider (unsupported)' : '🎥 Clasptek LiveKit'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '4px 8px',
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-header, #f8fafc)',
            padding: '0 24px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'link' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'link' ? '#2563eb' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'link' ? 700 : 500,
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            📋 Direct Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'whatsapp' ? '2px solid #16a34a' : '2px solid transparent',
              color: activeTab === 'whatsapp' ? '#16a34a' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'whatsapp' ? 700 : 500,
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            💬 WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'email' ? '2px solid #0284c7' : '2px solid transparent',
              color: activeTab === 'email' ? '#0284c7' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'email' ? 700 : 500,
              cursor: 'pointer',
              fontSize: 13.5,
            }}
          >
            ✉️ Email Invitation
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {isGoogleMeet && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #f87171',
                color: '#991b1b',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              ⚠️ <strong>Unsupported provider:</strong> This meeting was created on a retired video provider. Clasptek meetings use LiveKit only, so it cannot be shared. Please schedule a new meeting.
            </div>
          )}

          {/* Tab 1: Direct Link */}
          {activeTab === 'link' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Universal Invitation URL
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={meetingUrl}
                    placeholder={isGoogleMeet ? 'No link available for unsupported provider' : ''}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border, #cbd5e1)',
                      background: '#f8fafc',
                      fontSize: 13,
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    className="cp-btn primary"
                    onClick={handleCopyLink}
                    disabled={!meetingUrl}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 6 }}>
                  {isGoogleMeet
                    ? 'This meeting cannot be shared because its video provider is no longer supported.'
                    : 'Registered students and facilitators join directly. External guests will be placed in your waiting room.'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Full Invitation Text
                </label>
                <textarea
                  rows={6}
                  value={invitationMessage}
                  onChange={(e) => setInvitationMessage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={handleCopyFullText}
                  style={{ marginTop: 8 }}
                >
                  {copied ? '✓ Copied Text!' : 'Copy Full Text'}
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: WhatsApp Sharing */}
          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Recipient WhatsApp Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678 or +234..."
                  value={whatsAppPhone}
                  onChange={(e) => setWhatsAppPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: 13,
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                  Leave blank to pick any contact or group inside WhatsApp.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Review Invitation Message
                </label>
                <textarea
                  rows={6}
                  value={invitationMessage}
                  onChange={(e) => setInvitationMessage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
              </div>

              <button
                type="button"
                className="cp-btn"
                onClick={handleOpenWhatsApp}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '12px 18px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span>💬</span> Launch WhatsApp &amp; Send
              </button>
            </div>
          )}

          {/* Tab 3: Email Invitations */}
          {activeTab === 'email' && (
            <form onSubmit={handleSendEmailServer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Recipient Email Address(es)
                </label>
                <input
                  type="text"
                  placeholder="e.g. student@clasptek.org, guest@partner.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: 13,
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                  Separate multiple email addresses with commas.
                </div>
              </div>

              {emailFeedback && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    backgroundColor:
                      emailFeedback.type === 'success'
                        ? '#ecfdf5'
                        : emailFeedback.type === 'error'
                        ? '#fef2f2'
                        : '#eff6ff',
                    color:
                      emailFeedback.type === 'success'
                        ? '#065f46'
                        : emailFeedback.type === 'error'
                        ? '#991b1b'
                        : '#1e40af',
                    border: `1px solid ${
                      emailFeedback.type === 'success'
                        ? '#a7f3d0'
                        : emailFeedback.type === 'error'
                        ? '#fecaca'
                        : '#bfdbfe'
                    }`,
                  }}
                >
                  {emailFeedback.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="cp-btn primary"
                  style={{ flex: 1 }}
                >
                  {isSendingEmail ? 'Sending...' : '✉️ Send via Server Service'}
                </button>
                <a
                  href={clientMailtoUrl}
                  className="cp-btn secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                >
                  Open in Email Client
                </a>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-header, #f8fafc)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="cp-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
