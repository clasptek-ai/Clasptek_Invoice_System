/**
 * components/admissions/ContactFollowUpModal.tsx
 * Task ID: CLASPTEK-ENQUIRY-FOLLOWUP-UI-001
 *
 * Dedicated modal for contacting a prospect directly and logging follow-up interactions.
 * Guarantees:
 * - Direct contact triggers: WhatsApp, Phone Call, Email
 * - Precise interaction recording (channel, outcome, summary, detailed notes, next date)
 * - Strict separation between interaction outcome and lifecycle stage progression
 * - Fully responsive across Laptop, Tablet, Mobile, and 125%/150% scaling
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { Enquiry, EnquiryStatus } from '@/types/admissions';
import { ENQUIRY_STATUS_LABELS, ENQUIRY_TRANSITIONS } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';

interface ContactFollowUpModalProps {
  isOpen: boolean;
  enquiry: Enquiry | null;
  onClose: () => void;
  onFollowUpLogged: (
    enquiryId: string,
    payload: {
      note: string;
      contactMethod: string;
      outcome: string;
      activitySummary?: string;
      nextFollowUpDate?: string;
      status?: EnquiryStatus | null;
    }
  ) => Promise<void>;
}

function formatWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `https://wa.me/234${digits.slice(1)}`;
  if (digits.startsWith('234')) return `https://wa.me/${digits}`;
  if (digits.length >= 10) return `https://wa.me/${digits}`;
  return null;
}

export function ContactFollowUpModal({
  isOpen,
  enquiry,
  onClose,
  onFollowUpLogged,
}: ContactFollowUpModalProps) {
  const [contactMethod, setContactMethod] = useState<string>('WhatsApp');
  const [outcome, setOutcome] = useState<string>('Contacted — Interested');
  const [activitySummary, setActivitySummary] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<EnquiryStatus | ''>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form when opened or enquiry changes
  useEffect(() => {
    if (isOpen && enquiry) {
      setContactMethod(enquiry.phone ? 'WhatsApp' : enquiry.email ? 'Email' : 'Phone Call');
      setOutcome('Contacted — Interested');
      setActivitySummary('');
      setNote('');
      setNextFollowUpDate('');
      setSelectedStage('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, enquiry]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !enquiry) return null;

  const waUrl = formatWhatsApp(enquiry.phone);
  const telUrl = enquiry.phone ? `tel:${enquiry.phone.replace(/\s+/g, '')}` : null;
  const mailtoUrl = enquiry.email
    ? `mailto:${enquiry.email}?subject=${encodeURIComponent(
        `Clasptek Admission Enquiry — ${enquiry.programme_name || 'Academic Programmes'}`
      )}`
    : null;

  const allowedTransitions = ENQUIRY_TRANSITIONS[enquiry.status] ?? [];
  const todayStr = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setErrorMessage('Please provide detailed interaction notes.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onFollowUpLogged(enquiry.id, {
        note: note.trim(),
        contactMethod,
        outcome,
        activitySummary: activitySummary.trim() || undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
        status: selectedStage || null,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to record follow-up interaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="cp-modal-overlay"
      style={{
        zIndex: 1200,
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-followup-title"
    >
      <div
        className="cp-modal"
        style={{
          maxWidth: '640px',
          width: '100%',
          boxSizing: 'border-box',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--surface-0, #FFFFFF)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border, #E2E8F0)',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1))',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="cp-modal-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            backgroundColor: 'var(--surface-1, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2
              id="contact-followup-title"
              className="cp-modal-title"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-primary, #0F172A)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>📞</span>
              <span>Contact Prospect &amp; Log Follow-up</span>
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '4px 0 0 0' }}>
              Directly reach candidate, document interaction outcome, and record follow-up history.
            </p>
          </div>
          <button
            type="button"
            className="cp-modal-close"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              fontWeight: 700,
              cursor: 'pointer',
              color: 'var(--text-muted, #64748B)',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0, fontSize: '13px' }}>
                {errorMessage}
              </div>
            )}

            {/* 1. Prospect Context Header */}
            <div
              style={{
                backgroundColor: 'var(--surface-1, #F8FAFC)',
                border: '1px solid var(--border, #E2E8F0)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted, #64748B)', fontWeight: 600 }}>Prospect:</span>{' '}
                  <strong style={{ color: 'var(--text-primary, #0F172A)', fontSize: '14px', fontWeight: 800 }}>
                    {enquiry.student_name || `Prospect_${enquiry.id.replace(/\D/g, '').slice(-12) || enquiry.id}`}
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)' }}>
                    Enquiry #{enquiry.id.slice(0, 8)}
                  </span>
                  <StatusBadge status={enquiry.status} />
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px 12px',
                  fontSize: '12px',
                  borderTop: '1px solid var(--surface-2, #E2E8F0)',
                  paddingTop: '8px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Programme:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {enquiry.programme_name || 'No programme selected'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Phone:</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {enquiry.phone || '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Email:</span>
                  <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {enquiry.email || '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Lifecycle Stage:</span>
                  <strong style={{ color: 'var(--primary, #0284C7)' }}>
                    {ENQUIRY_STATUS_LABELS[enquiry.status]}
                  </strong>
                </div>
              </div>
            </div>

            {/* 2. Direct Contact Actions */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--text-muted, #64748B)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>DIRECT CONTACT ACTIONS</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '8px',
                }}
              >
                {/* WhatsApp Action */}
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setContactMethod('WhatsApp')}
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#16A34A',
                      borderColor: '#86EFAC',
                      backgroundColor: '#F0FDF4',
                      textDecoration: 'none',
                    }}
                    title={`Open WhatsApp chat with ${enquiry.phone}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span>WhatsApp</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  >
                    <span>WhatsApp (No Phone)</span>
                  </button>
                )}

                {/* Phone Call Action */}
                {telUrl ? (
                  <a
                    href={telUrl}
                    onClick={() => setContactMethod('Phone Call')}
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#0284C7',
                      borderColor: '#BAE6FD',
                      backgroundColor: '#F0F9FF',
                      textDecoration: 'none',
                    }}
                    title={`Direct dial ${enquiry.phone}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span>Phone Call</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  >
                    <span>Call (No Phone)</span>
                  </button>
                )}

                {/* Email Action */}
                {mailtoUrl ? (
                  <a
                    href={mailtoUrl}
                    onClick={() => setContactMethod('Email')}
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#4F46E5',
                      borderColor: '#C7D2FE',
                      backgroundColor: '#EEF2FF',
                      textDecoration: 'none',
                    }}
                    title={`Send email to ${enquiry.email}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>Email</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cp-btn secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  >
                    <span>Email (No Email)</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. Interaction Recording Fields */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="fupContactMethod">
                  Contact Channel / Method <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
                </label>
                <select
                  id="fupContactMethod"
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  required
                >
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Phone Call">Phone Call</option>
                  <option value="Email">Email</option>
                  <option value="In-Person Consultation">In-Person Consultation</option>
                  <option value="Online Video Meeting">Online Video Meeting</option>
                </select>
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="fupOutcome">
                  Interaction Outcome <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
                </label>
                <select
                  id="fupOutcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  required
                >
                  <option value="Contacted — Interested">Contacted — Interested</option>
                  <option value="Needs More Information">Needs More Information</option>
                  <option value="No Response">No Response</option>
                  <option value="Lost / Not Interested">Lost / Not Interested</option>
                  <option value="Follow Up Later">Follow Up Later</option>
                </select>
              </div>
            </div>

            {/* Activity Summary / Title */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="fupActivitySummary">Activity Summary (Optional)</label>
              <input
                id="fupActivitySummary"
                type="text"
                placeholder="e.g. Discussed course curriculum, installment options, and class timings"
                value={activitySummary}
                onChange={(e) => setActivitySummary(e.target.value)}
              />
            </div>

            {/* Detailed Notes */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="fupNotes">
                Follow-up Notes <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
              </label>
              <textarea
                id="fupNotes"
                rows={3}
                required
                placeholder="Record prospect feedback, discussion points, questions raised..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Next Follow-up Date */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="fupNextDate">Recommended Next Follow-up Date (Optional)</label>
              <input
                id="fupNextDate"
                type="date"
                min={todayStr}
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
              />
            </div>

            {/* 4. Intentional Lifecycle Stage Progression */}
            <div
              style={{
                backgroundColor: 'var(--surface-1, #F8FAFC)',
                border: '1px solid var(--border, #E2E8F0)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label
                htmlFor="fupLifecycleStage"
                style={{
                  fontSize: '12.5px',
                  fontWeight: 800,
                  color: 'var(--text-primary, #0F172A)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--primary, #0284C7)' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>Enquiry Lifecycle Stage</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>(Intentional Decision)</span>
              </label>

              <p style={{ fontSize: '11.5px', color: 'var(--text-secondary, #475569)', margin: 0, lineHeight: 1.4 }}>
                The interaction outcome and lifecycle stage progression are separate concepts. Recording this follow-up will <strong>NOT</strong> advance the lifecycle stage unless you intentionally select a new stage below.
              </p>

              <select
                id="fupLifecycleStage"
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value as EnquiryStatus | '')}
                style={{
                  marginTop: '4px',
                  fontSize: '13px',
                  fontWeight: selectedStage ? 700 : 500,
                  color: selectedStage ? 'var(--primary, #0284C7)' : 'var(--text-primary)',
                }}
              >
                <option value="">Keep current stage: {ENQUIRY_STATUS_LABELS[enquiry.status]}</option>
                {allowedTransitions.map((stg) => (
                  <option key={stg} value={stg}>
                    Advance to → {ENQUIRY_STATUS_LABELS[stg]}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Modal Footer */}
          <div
            className="cp-modal-footer"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border, #E2E8F0)',
              backgroundColor: 'var(--surface-1, #F8FAFC)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <button
              type="button"
              className="cp-btn secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ fontWeight: 600 }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="cp-btn primary"
              disabled={isSubmitting || !note.trim()}
              style={{
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
                  <span>Logging Follow-up…</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">✔</span>
                  <span>Log Follow-up</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
