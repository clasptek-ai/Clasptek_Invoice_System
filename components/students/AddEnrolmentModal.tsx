'use client';

/**
 * components/students/AddEnrolmentModal.tsx — Phase 2 Feature A & Phase C6F Accessibility
 * Controlled modal for enrolling an existing student into an additional Programme / Cohort.
 *
 * CRITICAL REQUIREMENTS:
 * - Selects Programme, Cohort, Start Date, Agreed Tuition Fee
 * - Dynamic catalogue tuition fee populated from selected programme
 * - Canonical ID format ENR-YYYY-XXXX (via server mutation)
 * - Zero duplication of Student record
 * - Enforces uq_enrolments_student_cohort
 *
 * Phase C6F Certified Improvements:
 * - Keyboard Accessibility: Escape key dismissal when not submitting.
 * - Focus Management:
 *   - Initial focus directed to primary input (#enrol-prog-select) on open.
 *   - Focus restoration to invoking element on close/unmount.
 *   - Tab & Shift+Tab focus containment (focus trap) preventing focus escape to background.
 * - Semantic dialog attributes: role="dialog", aria-modal="true", aria-labelledby.
 * - Synchronous reentrancy lock (isSubmittingRef) preventing duplicate submissions.
 * - Accessible SVG icons conforming to Clasptek design standards (replaces raw emoji/entities).
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Student } from '@/types/students';
import type { ProgrammeOption, CohortOption } from '@/types/admissions';

interface AddEnrolmentModalProps {
  isOpen: boolean;
  student: Student;
  existingEnrolmentCohortIds?: string[];
  onClose: () => void;
  onEnrolled: (enrolment?: any) => void;
  programmes?: ProgrammeOption[];
  cohorts?: CohortOption[];
  customSubmitHandler?: (payload: {
    studentId: string;
    programmeId: string;
    cohortId: string;
    startDate?: string;
    agreedTuitionFee: number;
  }) => Promise<{ success: boolean; enrolment?: any; error?: string }>;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AddEnrolmentModal({
  isOpen,
  student,
  existingEnrolmentCohortIds = [],
  onClose,
  onEnrolled,
  programmes: propsProgrammes,
  cohorts: propsCohorts,
  customSubmitHandler,
}: AddEnrolmentModalProps) {
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('');
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [agreedTuitionFee, setAgreedTuitionFee] = useState<number>(0);

  const [isLoadingProgrammes, setIsLoadingProgrammes] = useState(false);
  const [isLoadingCohorts, setIsLoadingCohorts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Load active programmes on mount / open
  useEffect(() => {
    if (!isOpen) return;

    if (propsProgrammes || customSubmitHandler) {
      if (propsProgrammes && propsProgrammes.length > 0) {
        setProgrammes(propsProgrammes);
        const firstProg = propsProgrammes[0];
        setSelectedProgrammeId(firstProg.id);
        setAgreedTuitionFee(Number(firstProg.tuition_fee || 0));
      }
      return;
    }

    let isMounted = true;
    async function loadProgrammes() {
      setIsLoadingProgrammes(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/admissions/programmes');
        const json = await res.json();
        if (isMounted && res.ok && json.data) {
          setProgrammes(json.data);
          if (json.data.length > 0) {
            const firstProg = json.data[0];
            setSelectedProgrammeId(firstProg.id);
            setAgreedTuitionFee(Number(firstProg.tuition_fee || 0));
          }
        }
      } catch (err) {
        console.error('Failed to load programmes', err);
        if (isMounted) setErrorMessage('Failed to load programmes from catalogue.');
      } finally {
        if (isMounted) setIsLoadingProgrammes(false);
      }
    }

    loadProgrammes();
    return () => {
      isMounted = false;
    };
  }, [isOpen, propsProgrammes, customSubmitHandler]);

  // Load cohorts whenever selected programme changes
  useEffect(() => {
    if (!selectedProgrammeId) {
      setCohorts([]);
      setSelectedCohortId('');
      return;
    }

    if (propsCohorts || customSubmitHandler) {
      const filtered = (propsCohorts || []).filter(
        (c) => !c.programme_id || c.programme_id === selectedProgrammeId
      );
      setCohorts(filtered);
      if (filtered.length > 0) {
        const firstCohort = filtered[0];
        setSelectedCohortId(firstCohort.id);
        setStartDate(firstCohort.start_date || new Date().toISOString().split('T')[0]);
      } else {
        setSelectedCohortId('');
        setStartDate(new Date().toISOString().split('T')[0]);
      }
      return;
    }

    let isMounted = true;
    async function loadCohorts() {
      setIsLoadingCohorts(true);
      try {
        const res = await fetch(`/api/admissions/cohorts?programmeId=${selectedProgrammeId}`);
        const json = await res.json();
        if (isMounted && res.ok && json.data) {
          setCohorts(json.data);
          if (json.data.length > 0) {
            const firstCohort = json.data[0];
            setSelectedCohortId(firstCohort.id);
            setStartDate(firstCohort.start_date || new Date().toISOString().split('T')[0]);
          } else {
            setSelectedCohortId('');
            setStartDate(new Date().toISOString().split('T')[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load cohorts', err);
      } finally {
        if (isMounted) setIsLoadingCohorts(false);
      }
    }

    loadCohorts();
    return () => {
      isMounted = false;
    };
  }, [selectedProgrammeId, propsCohorts, customSubmitHandler]);

  // Focus capture & restoration
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
      isSubmittingRef.current = false;

      const timer = setTimeout(() => {
        if (modalRef.current) {
          const progSelect = modalRef.current.querySelector<HTMLElement>('#enrol-prog-select');
          if (progSelect && !progSelect.hasAttribute('disabled')) {
            progSelect.focus();
          } else {
            const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
            if (focusable.length > 0) focusable[0].focus();
          }
        }
      }, 30);

      return () => {
        clearTimeout(timer);
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  // Keyboard navigation: Escape key dismissal and Tab / Shift+Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key dismissal
      if (e.key === 'Escape') {
        if (!isSubmitting && !isSubmittingRef.current) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      // Tab key focus containment
      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleProgrammeChange = (progId: string) => {
    setSelectedProgrammeId(progId);
    const prog = programmes.find((p) => p.id === progId);
    if (prog) {
      setAgreedTuitionFee(Number(prog.tuition_fee || 0));
    }
  };

  const handleCohortChange = (cohId: string) => {
    setSelectedCohortId(cohId);
    const coh = cohorts.find((c) => c.id === cohId);
    if (coh && coh.start_date) {
      setStartDate(coh.start_date);
    }
  };

  const isCurrentCohortAlreadyEnrolled = existingEnrolmentCohortIds.includes(selectedCohortId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSubmittingRef.current) return;

    setErrorMessage(null);

    if (!selectedProgrammeId) {
      setErrorMessage('Please select a programme.');
      return;
    }

    if (!selectedCohortId) {
      setErrorMessage('Please select a cohort.');
      return;
    }

    if (isCurrentCohortAlreadyEnrolled) {
      setErrorMessage('This student is already enrolled in the selected cohort.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    if (customSubmitHandler) {
      try {
        const result = await customSubmitHandler({
          studentId: student.id,
          programmeId: selectedProgrammeId,
          cohortId: selectedCohortId,
          startDate: startDate || undefined,
          agreedTuitionFee: Number(agreedTuitionFee),
        });

        if (!result.success) {
          setErrorMessage(result.error || 'Failed to create enrolment.');
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          return;
        }

        onEnrolled(result.enrolment);
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error executing simulated enrolment.';
        setErrorMessage(msg);
      } finally {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
      return;
    }

    try {
      const res = await fetch(`/api/students/${student.id}/enrol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId: selectedProgrammeId,
          cohortId: selectedCohortId,
          startDate: startDate || undefined,
          agreedTuitionFee: Number(agreedTuitionFee),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error || 'Failed to create enrolment.');
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        return;
      }

      onEnrolled();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error creating enrolment.');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const selectedProg = programmes.find((p) => p.id === selectedProgrammeId);

  return (
    <div
      className="cp-modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !isSubmittingRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-enrolment-modal-title"
    >
      <div
        ref={modalRef}
        className="cp-modal"
        style={{
          maxWidth: '600px',
          width: '92%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cp-modal-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                id="add-enrolment-modal-title"
                className="cp-modal-title"
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ color: 'var(--primary, #0284C7)' }}
                >
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
                <span>Enrol in Programme / Cohort</span>
              </h3>
              <span className="cp-pill active" style={{ fontFamily: 'var(--font-mono)' }}>
                {student.student_number}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Student: <strong style={{ color: 'var(--text-primary)' }}>{student.first_name} {student.last_name}</strong>
            </div>
          </div>
          <button
            type="button"
            className="cp-modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            style={{
              padding: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
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
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          <div
            className="cp-modal-body"
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', overflowY: 'auto' }}
          >
            <div
              style={{
                background: '#F8FAFC',
                padding: '12px 14px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                Multi-Enrolment Invariant
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Enrolling this student creates an independent{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>public.enrolments</code> record with
                canonical ID format{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>ENR-YYYY-XXXX</code>. The student
                profile is preserved without duplication.
              </p>
            </div>

            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0, fontSize: '12.5px' }}>
                {errorMessage}
              </div>
            )}

            {/* Programme Selector */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="enrol-prog-select">
                Select Programme <span style={{ color: 'var(--danger, #EF4444)' }}>*</span>
              </label>
              <select
                id="enrol-prog-select"
                value={selectedProgrammeId}
                onChange={(e) => handleProgrammeChange(e.target.value)}
                disabled={isLoadingProgrammes || isSubmitting}
                required
              >
                {isLoadingProgrammes ? (
                  <option value="">Loading programmes...</option>
                ) : programmes.length === 0 ? (
                  <option value="">No active programmes found</option>
                ) : (
                  programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — Catalogue Fee: {fmtMoney(p.tuition_fee)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Cohort Selector */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="enrol-cohort-select">
                Select Cohort <span style={{ color: 'var(--danger, #EF4444)' }}>*</span>
              </label>
              <select
                id="enrol-cohort-select"
                value={selectedCohortId}
                onChange={(e) => handleCohortChange(e.target.value)}
                disabled={isLoadingCohorts || cohorts.length === 0 || isSubmitting}
                required
              >
                {isLoadingCohorts ? (
                  <option value="">Loading cohorts...</option>
                ) : cohorts.length === 0 ? (
                  <option value="">No cohorts available for this programme</option>
                ) : (
                  cohorts.map((c) => {
                    const alreadyEnrolled = existingEnrolmentCohortIds.includes(c.id);
                    return (
                      <option key={c.id} value={c.id} disabled={alreadyEnrolled}>
                        {c.name} ({c.cohort_code}) — Starts {c.start_date || 'TBD'}
                        {alreadyEnrolled ? ' [ALREADY ENROLLED]' : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {/* Two Column: Start Date & Agreed Tuition (collapses gracefully on mobile) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enrol-start-date">Start Date</label>
                <input
                  id="enrol-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label htmlFor="enrol-tuition-fee">Agreed Tuition Fee (NGN)</label>
                <input
                  id="enrol-tuition-fee"
                  type="number"
                  min={0}
                  step={1000}
                  value={agreedTuitionFee}
                  onChange={(e) => setAgreedTuitionFee(Number(e.target.value))}
                  disabled={isSubmitting}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                {selectedProg && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                    Catalogue Standard: {fmtMoney(selectedProg.tuition_fee)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            className="cp-modal-footer"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '16px 20px',
              background: '#F8FAFC',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className="cp-btn secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cp-btn primary"
              disabled={
                isSubmitting ||
                isLoadingProgrammes ||
                !selectedProgrammeId ||
                !selectedCohortId ||
                isCurrentCohortAlreadyEnrolled
              }
            >
              {isSubmitting ? (
                <>
                  <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
                  <span>Enrolling Student...</span>
                </>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Confirm Enrolment</span>
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
