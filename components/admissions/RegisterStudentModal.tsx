'use client';

/**
 * components/admissions/RegisterStudentModal.tsx
 * Authoritative Student Registration & Deduplication Decision Modal
 *
 * Implements Clasptek Design System (.cp-* tokens):
 * - Direct registration of Enquiry -> Student
 * - Confidence hierarchy checks
 * - Mandatory Human Confirmation Dialog for Ambiguous Matches:
 *   [ Link to Existing Student ]
 *   [ Create New Student ]
 *   [ Cancel / Review ]
 * - Explicit rule: STUDENT CREATED ≠ ENROLMENT CREATED (0 enrolments)
 * - Fully responsive across Laptop, Tablet, and Mobile
 */

import React, { useState } from 'react';
import type { Enquiry } from '@/types/admissions';
import type { Student, DeduplicationMatchResult } from '@/types/students';

interface RegisterStudentModalProps {
  isOpen: boolean;
  enquiry: Enquiry;
  onClose: () => void;
  onSuccess: (student: Student) => void;
}

export function RegisterStudentModal({
  isOpen,
  enquiry,
  onClose,
  onSuccess,
}: RegisterStudentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<DeduplicationMatchResult | null>(null);
  const [isAmbiguousDecision, setIsAmbiguousDecision] = useState(false);

  // Editable candidate fields for pre-registration corrections
  const [fullName, setFullName] = useState(enquiry.student_name || '');
  const [email, setEmail] = useState(enquiry.email || '');
  const [phone, setPhone] = useState(enquiry.phone || '');

  if (!isOpen) return null;

  // Primary registration handler
  const handleRegister = async (forceNew = false) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admissions/enquiries/${enquiry.id}/register-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceNew,
          candidateOverrides: {
            name: fullName.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.matchResult && json.matchResult.isAmbiguous) {
          // Trigger the Human Confirmation Modal
          setMatchResult(json.matchResult);
          setIsAmbiguousDecision(true);
          setIsSubmitting(false);
          return;
        }

        setErrorMessage(json.error || 'Failed to complete student registration.');
        if (json.matchResult) {
          setMatchResult(json.matchResult);
        }
        setIsSubmitting(false);
        return;
      }

      onSuccess(json.student as Student);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error during registration.');
      setIsSubmitting(false);
    }
  };

  // Handler to link to existing student (Option 1)
  const handleLinkExisting = async (existingStudentId: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admissions/enquiries/${enquiry.id}/register-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkExistingStudentId: existingStudentId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || 'Failed to link to existing student.');
        setIsSubmitting(false);
        return;
      }

      onSuccess(json.student as Student);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error linking student.');
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
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reg-student-title"
    >
      <div
        className="cp-modal"
        style={{
          maxWidth: '560px',
          width: '95%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-0, #FFFFFF)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border, #E2E8F0)',
          boxShadow: 'var(--shadow-xl)',
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
            background: 'var(--surface-1, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 id="reg-student-title" className="cp-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--primary, #0284C7)' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Register Student</span>
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '4px 0 0 0' }}>
              Promote prospect from Enquiry to official Student record.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cp-modal-close"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMessage && (
            <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
              {errorMessage}
            </div>
          )}

          {/* AMBIGUOUS MATCH CONFIRMATION DIALOG */}
          {isAmbiguousDecision && matchResult?.matchedStudent ? (
            <div
              style={{
                background: 'var(--warning-bg, #FFFBEB)',
                border: '1px solid var(--warning-border, #FDE68A)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--warning-dark, #B45309)', margin: 0 }}>
                    Ambiguous Match Detected (Human Decision Required)
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary, #334155)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    An existing student has an identical name, but contact details differ or are missing.
                    Per policy, <strong style={{ color: 'var(--warning-dark)' }}>automatic merge is prohibited</strong>.
                  </p>
                </div>
              </div>

              {/* Matched Student Summary Card */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Existing Student:</span>
                  <span className="cp-pill active" style={{ fontFamily: 'var(--font-mono)' }}>
                    {matchResult.matchedStudent.student_number}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>
                  {matchResult.matchedStudent.first_name} {matchResult.matchedStudent.last_name}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  Email: {matchResult.matchedStudent.email || 'None on file'}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  Phone: {matchResult.matchedStudent.phone || 'None on file'}
                </div>
              </div>

              {/* 3 Explicit Human Decision Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleLinkExisting(matchResult.matchedStudent!.id)}
                  className="cp-btn primary"
                  style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
                >
                  ✓ Link to Existing Student ({matchResult.matchedStudent.student_number})
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleRegister(true)}
                  className="cp-btn secondary"
                  style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
                >
                  + Create as New Separate Student
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="cp-btn text"
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--text-muted)' }}
                >
                  Cancel / Review Later
                </button>
              </div>
            </div>
          ) : (
            /* STANDARD REGISTRATION FORM */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Invariant Banner */}
              <div
                style={{
                  background: 'var(--info-bg, #F0F9FF)',
                  border: '1px solid var(--info-border, #BAE6FD)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: 'var(--info-dark, #0369A1)',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ display: 'block', marginBottom: '2px' }}>Training Centre Architecture Invariant:</strong>
                Registering a Student assigns a canonical <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>STU-2026-XXXX</code> ID in <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>ACTIVE</code> status.
                <span style={{ display: 'block', marginTop: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  It will NOT create an enrolment. Student will display as &quot;Not yet enrolled&quot;.
                </span>
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="reg-fullname">Full Name <span style={{ color: 'var(--danger, #DC2626)' }}>*</span></label>
                <input
                  id="reg-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="reg-email">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="reg-phone">Phone Number</label>
                <input
                  id="reg-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Exact Match warning if found */}
              {matchResult && !matchResult.isAmbiguous && matchResult.matchedStudent && (
                <div role="alert" className="cp-alert error" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 700 }}>Existing Student Record Found:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {matchResult.matchedStudent.student_number} — {matchResult.matchedStudent.first_name} {matchResult.matchedStudent.last_name}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLinkExisting(matchResult.matchedStudent!.id)}
                    className="cp-btn primary"
                    style={{ marginTop: '4px', justifyContent: 'center' }}
                  >
                    Link Enquiry to Existing Student ({matchResult.matchedStudent.student_number})
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div
                className="cp-modal-footer"
                style={{
                  padding: '14px 0 0 0',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="cp-btn secondary"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || !fullName.trim()}
                  onClick={() => handleRegister(false)}
                  className="cp-btn primary"
                  style={{ fontWeight: 700 }}
                >
                  {isSubmitting ? 'Checking & Registering...' : 'Confirm & Register Student'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
