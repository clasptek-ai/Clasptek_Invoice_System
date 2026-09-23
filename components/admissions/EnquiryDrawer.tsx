/**
 * components/admissions/EnquiryDrawer.tsx — Phase 3
 * Slide-in detail drawer for a single enquiry.
 *
 * Provides:
 *  - Prospect contact info + quick-action links
 *  - Current status + programme
 *  - Notes display
 *  - Status transition controls (DB-authoritative allowed transitions only)
 *  - Follow-up log (note entry + optional status change)
 *
 * Database-authoritative status transitions:
 *  NEW → CONTACTED → INTERESTED → APPLIED → OFFERED → ENROLLED
 *  Any (except ENROLLED) → LOST
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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Enquiry details — ${enquiry.student_name}`}
        className="fixed right-0 top-0 h-full w-full sm:w-[480px] lg:w-[540px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-base font-bold text-gray-900">{enquiry.student_name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={enquiry.status} />
              {enquiry.source && (
                <span className="text-xs text-gray-400">{enquiry.source}</span>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Close enquiry drawer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Contact Information */}
          <section aria-labelledby="enq-contact-heading">
            <h3 id="enq-contact-heading" className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Contact
            </h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              {enquiry.email ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm" aria-hidden="true">✉️</span>
                  <a
                    href={`mailto:${enquiry.email}`}
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {enquiry.email}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No email recorded</p>
              )}
              {enquiry.phone ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm" aria-hidden="true">📱</span>
                  <a href={`tel:${enquiry.phone}`} className="text-sm text-gray-700 hover:underline">
                    {enquiry.phone}
                  </a>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition-colors"
                    >
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No phone recorded</p>
              )}
            </div>
          </section>

          {/* Programme */}
          <section aria-labelledby="enq-prog-heading">
            <h3 id="enq-prog-heading" className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Programme Interest
            </h3>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">
              {enquiry.programme_name ?? 'Not specified'}
            </p>
          </section>

          {/* Notes */}
          {enquiry.notes && (
            <section aria-labelledby="enq-notes-heading">
              <h3 id="enq-notes-heading" className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Notes
              </h3>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {enquiry.notes}
                </pre>
              </div>
            </section>
          )}

          {/* Metadata */}
          <section aria-labelledby="enq-meta-heading">
            <h3 id="enq-meta-heading" className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Record
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-gray-400">Logged</dt>
              <dd className="text-gray-700">{formatDateTime(enquiry.created_at)}</dd>
              <dt className="text-gray-400">Updated</dt>
              <dd className="text-gray-700">{formatDateTime(enquiry.updated_at)}</dd>
              <dt className="text-gray-400">ID</dt>
              <dd className="text-gray-400 truncate font-mono">{enquiry.id}</dd>
            </dl>
          </section>

          {/* Follow-up & Status Transition */}
          {allowedTransitions.length > 0 && (
            <section aria-labelledby="enq-followup-heading">
              <h3 id="enq-followup-heading" className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Log Follow-up
              </h3>
              <div className="bg-blue-50 rounded-xl p-3 space-y-3">
                <div>
                  <label htmlFor="enq-followup-note" className="block text-xs font-medium text-gray-600 mb-1">
                    Note
                  </label>
                  <textarea
                    id="enq-followup-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was discussed? What's the next step?"
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none"
                    aria-describedby="enq-followup-desc"
                  />
                </div>

                <div>
                  <label htmlFor="enq-next-status" className="block text-xs font-medium text-gray-600 mb-1">
                    Progress status (optional)
                  </label>
                  <select
                    id="enq-next-status"
                    value={selectedNextStatus}
                    onChange={(e) => setSelectedNextStatus(e.target.value as EnquiryStatus | '')}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Keep current: {ENQUIRY_STATUS_LABELS[enquiry.status]}</option>
                    {allowedTransitions.map((s) => (
                      <option key={s} value={s}>
                        → {ENQUIRY_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <p id="enq-followup-desc" className="text-xs text-gray-400 mt-1">
                    Leaving this blank preserves the current stage.
                  </p>
                </div>

                {saveError && (
                  <div role="alert" className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div role="status" className="text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                    ✓ Follow-up saved successfully.
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={isSaving || (!note.trim() && !selectedNextStatus)}
                  className="w-full py-2 px-4 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-busy={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save Follow-up'}
                </button>
              </div>
            </section>
          )}

          {enquiry.status === 'ENROLLED' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
              🎓 This prospect has been enrolled. No further status changes available.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
