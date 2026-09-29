/**
 * components/admissions/ConversionPanel.tsx — Phase 2 & 9G
 * Decoupled Conversion panel shown when an application is MATCHED or QUALIFIED.
 *
 * CRITICAL REQUIREMENTS:
 * - Option 1: Create Student Only (public.students + 0 enrolments)
 * - Option 2: Create Student & Enrol in Cohort (public.students + public.enrolments)
 * - Invariant: STUDENT CREATED ≠ ENROLMENT CREATED
 * - Authoritative RPC convert_intake_application execution
 * - Clean UI with clear explanations and unambiguous status feedback
 */

'use client';

import { useState, useEffect } from 'react';
import type { IntakeApplication, CohortOption, ConversionResult } from '@/types/admissions';

interface ConversionPanelProps {
  application: IntakeApplication;
  onConverted: (result: ConversionResult) => void;
}

type ConversionMode = 'STUDENT_ONLY' | 'STUDENT_AND_COHORT';


export function ConversionPanel({ application, onConverted }: ConversionPanelProps) {
  const [mode, setMode] = useState<ConversionMode>('STUDENT_ONLY');
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [fee, setFee] = useState<number>(application.agreed_tuition_fee || 0);
  const [isLoadingCohorts, setIsLoadingCohorts] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  // Fetch cohorts when programme_id is present
  useEffect(() => {
    if (!application.programme_id) return;
    let isCancelled = false;

    async function loadCohorts() {
      setIsLoadingCohorts(true);
      try {
        const res = await fetch(`/api/admissions/cohorts?programmeId=${application.programme_id}`);
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json.data) {
            setCohorts(json.data);
            if (json.data.length > 0) {
              setSelectedCohortId(json.data[0].id);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load cohorts', e);
      } finally {
        if (!isCancelled) setIsLoadingCohorts(false);
      }
    }

    loadCohorts();
    return () => {
      isCancelled = true;
    };
  }, [application.programme_id]);

  const handleConvert = async () => {
    setIsConverting(true);
    setError(null);

    try {
      const payload: { cohort_id?: string | null; approved_tuition_fee?: number } = {};

      if (mode === 'STUDENT_AND_COHORT') {
        if (!selectedCohortId) {
          throw new Error('Please select an active cohort to enrol into.');
        }
        payload.cohort_id = selectedCohortId;
        payload.approved_tuition_fee = Number(fee) || application.agreed_tuition_fee || 0;
      } else {
        // Mode: STUDENT_ONLY
        payload.cohort_id = null;
      }

      const res = await fetch(`/api/admissions/applications/${application.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Conversion failed');
      }

      setResult(data.result);
      onConverted(data.result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  if (result) {
    const isEnrolled = Boolean(result.enrolment_number);

    return (
      <div className="cp-alert success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '15px' }}>
            {isEnrolled ? 'Student & Enrolment Created Successfully!' : 'Student Record Created Successfully (0 Enrolments)'}
          </h4>
        </div>

        <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.4 }}>
          Application <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{result.application_number}</span> has been converted to an authoritative institutional student record.
          {!isEnrolled && ' The student has zero enrolments and is registered as ACTIVE. Enrolment into a cohort can be assigned at any time from the Student Directory.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%', background: '#FFFFFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Student Number:</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
              {result.student_number}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Enrolment Status:</span>
            {isEnrolled ? (
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, fontSize: '13px', color: 'var(--primary)' }}>
                {result.enrolment_number}
              </span>
            ) : (
              <span className="cp-pill draft" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}>
                Not Yet Enrolled (0 Enrolments)
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-card" style={{ padding: '18px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--interactive, #1D4ED8)' }} aria-hidden="true">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
          <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Convert Application to Student
          </h4>
        </div>
        <span className="cp-pill info" style={{ fontSize: '10.5px' }}>
          Decoupled Conversion
        </span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        Choose whether to register the student record immediately with 0 enrolments, or simultaneously assign an initial cohort enrolment.
      </p>

      {error && (
        <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      {/* Conversion Options Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setMode('STUDENT_ONLY')}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: `2px solid ${mode === 'STUDENT_ONLY' ? 'var(--primary, #0F172A)' : 'var(--border, #E2E8F0)'}`,
            background: mode === 'STUDENT_ONLY' ? '#FFFFFF' : '#F1F5F9',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', color: mode === 'STUDENT_ONLY' ? 'var(--primary, #0F172A)' : 'var(--text-secondary)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Option 1: Create Student Only</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
            Creates student record with <strong>0 enrolments</strong>. Cohort enrolment can be added anytime.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode('STUDENT_AND_COHORT')}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: `2px solid ${mode === 'STUDENT_AND_COHORT' ? 'var(--primary, #0F172A)' : 'var(--border, #E2E8F0)'}`,
            background: mode === 'STUDENT_AND_COHORT' ? '#FFFFFF' : '#F1F5F9',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', color: mode === 'STUDENT_AND_COHORT' ? 'var(--primary, #0F172A)' : 'var(--text-secondary)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            <span>Option 2: Student + Enrolment</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
            Creates student record AND enrols into selected cohort with canonical enrolment ID.
          </div>
        </button>
      </div>

      {/* Option 2 Fields (Cohort & Tuition) */}
      {mode === 'STUDENT_AND_COHORT' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: '#FFFFFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          {/* Cohort selection */}
          <div className="cp-field" style={{ margin: 0 }}>
            <label htmlFor="cohort-select">Assign Cohort <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select
              id="cohort-select"
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
              disabled={isLoadingCohorts || cohorts.length === 0}
              required
            >
              {cohorts.length === 0 ? (
                <option value="">{isLoadingCohorts ? 'Loading cohorts...' : 'No upcoming cohorts found'}</option>
              ) : (
                cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cohort_code}) — Starts {c.start_date || 'TBD'}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Tuition fee */}
          <div className="cp-field" style={{ margin: 0 }}>
            <label htmlFor="approved-fee">Approved Tuition Fee (NGN)</label>
            <input
              id="approved-fee"
              type="number"
              min={0}
              step={1000}
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
            />
          </div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '14px' }}>ℹ️</span>
            <span>
              Invariant enforced: <strong>Student Created ≠ Enrolment Created</strong>. This application will become an active student in the Student Directory with status <span className="cp-pill active" style={{ padding: '2px 6px', fontSize: '11px' }}>ACTIVE</span> and enrolment state <span className="cp-pill draft" style={{ padding: '2px 6px', fontSize: '11px' }}>Not yet enrolled</span>.
            </span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div style={{ paddingTop: '2px' }}>
        <button
          type="button"
          disabled={isConverting || (mode === 'STUDENT_AND_COHORT' && (!selectedCohortId || cohorts.length === 0))}
          onClick={handleConvert}
          className="cp-btn primary"
          style={{ width: '100%', padding: '10px 16px', fontSize: '13px' }}
        >
          {isConverting ? (
            <>
              <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
              <span>Executing Conversion...</span>
            </>
          ) : mode === 'STUDENT_ONLY' ? (
            <>
              <span>✓</span>
              <span>Confirm &amp; Create Student Only (0 Enrolments)</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>Confirm &amp; Create Student + Cohort Enrolment</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
