'use client';

/**
 * components/students/AddEnrolmentModal.tsx — Phase 2 Feature A
 * Controlled modal for enrolling an existing student into an additional Programme / Cohort.
 *
 * CRITICAL REQUIREMENTS:
 * - Selects Programme, Cohort, Start Date, Agreed Tuition Fee
 * - Dynamic catalogue tuition fee populated from selected programme
 * - Canonical ID format ENR-YYYY-XXXX (via server mutation)
 * - Zero duplication of Student record
 * - Enforces uq_enrolments_student_cohort
 */

import React, { useState, useEffect } from 'react';
import type { Student } from '@/types/students';
import type { ProgrammeOption, CohortOption } from '@/types/admissions';

interface AddEnrolmentModalProps {
  isOpen: boolean;
  student: Student;
  existingEnrolmentCohortIds?: string[];
  onClose: () => void;
  onEnrolled: () => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function AddEnrolmentModal({
  isOpen,
  student,
  existingEnrolmentCohortIds = [],
  onClose,
  onEnrolled,
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

  // Load active programmes on mount / open
  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

  // Load cohorts whenever selected programme changes
  useEffect(() => {
    if (!selectedProgrammeId) {
      setCohorts([]);
      setSelectedCohortId('');
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
  }, [selectedProgrammeId]);

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

    setIsSubmitting(true);

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
        return;
      }

      onEnrolled();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error creating enrolment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProg = programmes.find((p) => p.id === selectedProgrammeId);

  return (
    <div className="cp-modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="cp-modal"
        style={{ maxWidth: '600px', width: '92%', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cp-modal-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 className="cp-modal-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                🎓 Enrol in Programme / Cohort
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
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Multi-Enrolment Invariant
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Enrolling this student creates an independent <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>public.enrolments</code> record with canonical ID format <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>ENR-YYYY-XXXX</code>. The student profile is preserved without duplication.
              </p>
            </div>

            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0, fontSize: '12.5px' }}>
                {errorMessage}
              </div>
            )}

            {/* Programme Selector */}
            <div className="cp-field" style={{ margin: 0 }}>
              <label htmlFor="enrol-prog-select">Select Programme <span style={{ color: 'var(--danger, #EF4444)' }}>*</span></label>
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
              <label htmlFor="enrol-cohort-select">Select Cohort <span style={{ color: 'var(--danger, #EF4444)' }}>*</span></label>
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
          <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', background: '#F8FAFC', borderTop: '1px solid var(--border)' }}>
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
              disabled={isSubmitting || isLoadingProgrammes || !selectedProgrammeId || !selectedCohortId || isCurrentCohortAlreadyEnrolled}
            >
              {isSubmitting ? (
                <>
                  <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
                  <span>Enrolling Student...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Confirm Enrolment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
