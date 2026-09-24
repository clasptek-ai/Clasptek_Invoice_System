/**
 * components/admissions/NewEnquiryModal.tsx — Phase 9G
 * Forensic recreation of original renderNewEnquiryModal (legacy index.html lines 36170–36255).
 * Native Clasptek modal with prospect intake form, duplicate checking, and API submission.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Enquiry, ProgrammeOption } from '@/types/admissions';

interface NewEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  programmes: ProgrammeOption[];
  existingEnquiries?: Enquiry[];
  assignedStaffName?: string;
  onEnquiryCreated?: (newEnquiry: Enquiry) => void;
}

const ENQUIRY_SOURCES = [
  'Direct',
  'WhatsApp',
  'Web Intake',
  'Referral',
  'Phone',
  'Social Media',
  'Walk-in',
  'Google Form',
];

export function NewEnquiryModal({
  isOpen,
  onClose,
  programmes,
  existingEnquiries = [],
  assignedStaffName = 'Admissions',
  onEnquiryCreated,
}: NewEnquiryModalProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [programmeId, setProgrammeId] = useState(programmes[0]?.id || '');
  const [source, setSource] = useState('Direct');
  const [enquiryDate, setEnquiryDate] = useState(todayStr);
  const [staff, setStaff] = useState(assignedStaffName);
  const [notes, setNotes] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update default programme if programmes list changes
  useEffect(() => {
    if (!programmeId && programmes.length > 0) {
      setProgrammeId(programmes[0].id);
    }
  }, [programmes, programmeId]);

  // Focus trap / auto-focus
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setName('');
      setPhone('');
      setEmail('');
      setNotes('');
      setDuplicateWarning(false);
      setEnquiryDate(todayStr);
      setStaff(assignedStaffName);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, assignedStaffName, todayStr]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Duplicate detection matching legacy behavior
  const handleNameChange = (val: string) => {
    setName(val);
    const clean = val.trim().toLowerCase();
    if (clean.length >= 3) {
      const match = existingEnquiries.some((en) =>
        en.student_name.toLowerCase().includes(clean)
      );
      setDuplicateWarning(match);
    } else {
      setDuplicateWarning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedPhone) {
      setError('Please provide candidate full name and phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullNotes = staff.trim()
        ? `[Assigned: ${staff.trim()}] [Date: ${enquiryDate}] ${notes.trim()}`.trim()
        : notes.trim();

      const res = await fetch('/api/admissions/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: trimmedName,
          phone: trimmedPhone,
          email: email.trim() || null,
          programme_id: programmeId || null,
          source,
          notes: fullNotes || null,
          status: 'NEW',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save enquiry');
      }

      if (onEnquiryCreated && data.data) {
        onEnquiryCreated(data.data);
      }

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error logging enquiry');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cp-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="cp-modal"
        ref={modalRef}
        style={{ maxWidth: '580px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalTitleNewEnq"
      >
        {/* Modal Header */}
        <div className="cp-modal-header">
          <div
            className="cp-modal-title"
            id="modalTitleNewEnq"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--accent)' }}
              aria-hidden="true"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Log New Prospect Enquiry
          </div>
          <button
            type="button"
            className="cp-modal-close"
            id="btnCloseNewEnqMod"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit}>
          <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="enqName" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Candidate / Prospect Full Name *
              </label>
              <input
                id="enqName"
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Oluwaseun Balogun"
                required
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {duplicateWarning && (
              <div
                id="duplicateWarningBox"
                className="duplicateWarningBox"
                style={{
                  background: '#FFFBEB',
                  border: '1px solid var(--warning, #D97706)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#92400E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  <strong>Potential Existing Profile:</strong> A prospect or student with a similar name already exists.
                </span>
              </div>
            )}

            <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqPhone" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Phone Number (WhatsApp) *
                </label>
                <input
                  id="enqPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08031234567"
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqEmail" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Email Address
                </label>
                <input
                  id="enqEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="candidate@example.com"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqProg" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Target Programme *
                </label>
                <select
                  id="enqProg"
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="">-- Select Programme --</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.tuition_fee ? `(₦${Number(p.tuition_fee).toLocaleString()})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqSource" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Lead Acquisition Source *
                </label>
                <select
                  id="enqSource"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                >
                  {ENQUIRY_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqDate" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Enquiry Date *
                </label>
                <input
                  id="enqDate"
                  type="date"
                  value={enquiryDate}
                  onChange={(e) => setEnquiryDate(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enqStaff" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Assigned Admissions Officer
                </label>
                <input
                  id="enqStaff"
                  type="text"
                  value={staff}
                  onChange={(e) => setStaff(e.target.value)}
                  placeholder="Admissions Officer"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="enqNotes" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Candidate Background &amp; Notes
              </label>
              <textarea
                id="enqNotes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Inquired via WhatsApp regarding weekend IELTS batch, interested in morning cohort."
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {error && (
              <div
                id="enqFormErr"
                style={{
                  color: 'var(--danger, #DC2626)',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="cp-btn secondary"
              id="btnCancelNewEnq"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cp-btn accent"
              id="btnSaveNewEnq"
              disabled={isSubmitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {isSubmitting ? 'Saving...' : 'Save Prospect Enquiry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
