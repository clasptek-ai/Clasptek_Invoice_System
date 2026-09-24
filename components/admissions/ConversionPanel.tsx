/**
 * components/admissions/ConversionPanel.tsx — Phase 3 & 9G
 * Conversion panel shown when an application is MATCHED or QUALIFIED.
 * Executes convert_intake_application RPC via the server API endpoint.
 * Uses genuine .cp-* design system classes.
 */

'use client';

import { useState, useEffect } from 'react';
import type { IntakeApplication, CohortOption, ConversionResult } from '@/types/admissions';

interface ConversionPanelProps {
  application: IntakeApplication;
  onConverted: (result: ConversionResult) => void;
}

export function ConversionPanel({ application, onConverted }: ConversionPanelProps) {
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
      const res = await fetch(`/api/admissions/applications/${application.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohort_id: selectedCohortId || undefined,
          approved_tuition_fee: Number(fee) || application.agreed_tuition_fee,
        }),
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
    return (
      <div className="cp-alert success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🎉</span>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>Conversion Complete!</h4>
        </div>
        <p style={{ margin: 0, fontSize: '12px' }}>
          Application <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{result.application_number}</span> has been converted to an active student record.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%', background: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Student Number:</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>{result.student_number}</span>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Enrolment Number:</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>{result.enrolment_number || 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-card" style={{ padding: '16px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-hidden="true" style={{ fontSize: '16px' }}>🎓</span>
          <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Convert to Enrolled Student
          </h4>
        </div>
        <span className="cp-pill info">
          RPC: convert_intake_application
        </span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        Converting this application will create a formal student record, active enrolment, and write an immutable audit log entry.
      </p>

      {error && (
        <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {/* Cohort selection */}
        <div className="cp-field" style={{ margin: 0 }}>
          <label htmlFor="cohort-select">Assign Cohort</label>
          <select
            id="cohort-select"
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            disabled={isLoadingCohorts || cohorts.length === 0}
          >
            {cohorts.length === 0 ? (
              <option value="">{isLoadingCohorts ? 'Loading cohorts...' : 'No upcoming cohorts found'}</option>
            ) : (
              cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.cohort_code})
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

      <div style={{ paddingTop: '4px' }}>
        <button
          type="button"
          disabled={isConverting}
          onClick={handleConvert}
          className="cp-btn primary"
          style={{ width: '100%' }}
        >
          {isConverting ? (
            <>
              <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
              <span>Executing Conversion RPC...</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>Confirm &amp; Convert Application</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
