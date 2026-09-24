/**
 * components/admissions/EnquiryDrawer.tsx — Phase 3 & 9G
 * Slide-in detail drawer for a single enquiry.
 * Uses genuine .cp-drawer and .cp-btn design system styles.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Enquiry, EnquiryStatus } from '@/types/admissions';
import { ENQUIRY_TRANSITIONS, ENQUIRY_STATUS_LABELS } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';

interface EnquiryDrawerProps {
  enquiry: Enquiry | null;
  onClose: () => void;
  onStatusChange?: (enquiryId: string, newStatus: EnquiryStatus) => Promise<void>;
  onNoteAppend?: (enquiryId: string, note: string, newStatus: EnquiryStatus | null) => Promise<void>;
}

function formatWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `https://wa.me/234${digits.slice(1)}`;
  if (digits.startsWith('234')) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function EnquiryDrawer({
  enquiry,
  onClose,
  onStatusChange,
  onNoteAppend,
}: EnquiryDrawerProps) {
  const [note, setNote] = useState('');
  const [selectedNextStatus, setSelectedNextStatus] = useState<EnquiryStatus | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reset form when enquiry changes
  useEffect(() => {
    setNote('');
    setSelectedNextStatus('');
    setSaveError(null);
    setSaveSuccess(false);
  }, [enquiry?.id]);

  // Focus trap: move focus into drawer when opened
  useEffect(() => {
    if (enquiry) {
      closeButtonRef.current?.focus();
    }
  }, [enquiry]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!enquiry) return;
    if (!note.trim() && !selectedNextStatus) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const newStatus = selectedNextStatus || null;
      if (onNoteAppend) {
        await onNoteAppend(enquiry.id, note.trim(), newStatus as EnquiryStatus | null);
      } else if (newStatus && onStatusChange) {
        await onStatusChange(enquiry.id, newStatus as EnquiryStatus);
      }
      setNote('');
      setSelectedNextStatus('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [enquiry, note, selectedNextStatus, onNoteAppend, onStatusChange]);

  if (!enquiry) return null;

  const wa = formatWhatsApp(enquiry.phone);
  const allowedTransitions = ENQUIRY_TRANSITIONS[enquiry.status] ?? [];

  return (
    <div className="cp-drawer-overlay" onClick={onClose} aria-hidden="true">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Enquiry details — ${enquiry.student_name}`}
        className="cp-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cp-drawer-header">
          <div>
            <h2 className="cp-drawer-title">{enquiry.student_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <StatusBadge status={enquiry.status} />
              {enquiry.source && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>{enquiry.source}</span>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="cp-drawer-close"
            aria-label="Close enquiry drawer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="cp-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Contact Information */}
          <section aria-labelledby="enq-contact-heading">
            <h3 id="enq-contact-heading" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Contact Information
            </h3>
            <div className="cp-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {enquiry.email ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <a
                    href={`mailto:${enquiry.email}`}
                    style={{ fontSize: '13px', color: 'var(--interactive, #0284C7)', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {enquiry.email}
                  </a>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>No email recorded</p>
              )}
              {enquiry.phone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <a href={`tel:${enquiry.phone}`} style={{ fontSize: '13px', color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {enquiry.phone}
                  </a>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cp-pill success"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>No phone recorded</p>
              )}
            </div>
          </section>

          {/* Programme */}
          <section aria-labelledby="enq-prog-heading">
            <h3 id="enq-prog-heading" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Programme Interest
            </h3>
            <div className="cp-card" style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-primary)' }}>
              {enquiry.programme_name ?? 'Not specified'}
            </div>
          </section>

          {/* Notes */}
          {enquiry.notes && (
            <section aria-labelledby="enq-notes-heading">
              <h3 id="enq-notes-heading" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Notes
              </h3>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 14px' }}>
                <pre style={{ fontSize: '13px', color: '#92400E', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, lineHeight: 1.5 }}>
                  {enquiry.notes}
                </pre>
              </div>
            </section>
          )}

          {/* Record Metadata */}
          <section aria-labelledby="enq-meta-heading">
            <h3 id="enq-meta-heading" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Record Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Logged</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateTime(enquiry.created_at)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Updated</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateTime(enquiry.updated_at)}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>ID</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--text-muted)' }}>{enquiry.id}</span>
              </div>
            </div>
          </section>

          {/* Follow-up & Status Transition */}
          {allowedTransitions.length > 0 && (
            <section aria-labelledby="enq-followup-heading">
              <h3 id="enq-followup-heading" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Log Follow-up &amp; Progress
              </h3>
              <div className="cp-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#F8FAFC' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="enq-followup-note">Discussion Notes</label>
                  <textarea
                    id="enq-followup-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was discussed? What's the next step?"
                    aria-describedby="enq-followup-desc"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="enq-next-status">Progress Status (Optional)</label>
                  <select
                    id="enq-next-status"
                    value={selectedNextStatus}
                    onChange={(e) => setSelectedNextStatus(e.target.value as EnquiryStatus | '')}
                  >
                    <option value="">Keep current: {ENQUIRY_STATUS_LABELS[enquiry.status]}</option>
                    {allowedTransitions.map((s) => (
                      <option key={s} value={s}>
                        → {ENQUIRY_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <span id="enq-followup-desc" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Leaving this blank preserves the current stage.
                  </span>
                </div>

                {saveError && (
                  <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div role="status" className="cp-alert success" style={{ margin: 0 }}>
                    ✓ Follow-up saved successfully.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || (!note.trim() && !selectedNextStatus)}
                  className="cp-btn primary"
                  style={{ width: '100%' }}
                  aria-busy={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save Follow-up'}
                </button>
              </div>
            </section>
          )}

          {enquiry.status === 'ENROLLED' && (
            <div className="cp-alert success" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
              <span>This prospect has been enrolled. No further status changes available.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
