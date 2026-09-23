/**
 * components/admissions/ConversionPanel.tsx — Phase 3
 * Conversion panel shown when an application is MATCHED or QUALIFIED.
 * Executes convert_intake_application RPC via the server API endpoint.
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2.5 text-emerald-800">
          <span className="text-xl">🎉</span>
          <h4 className="font-bold text-sm">Conversion Complete!</h4>
        </div>
        <p className="text-xs text-emerald-700">
          Application <span className="font-mono font-bold">{result.application_number}</span> has been converted to an active student record.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-lg border border-emerald-100">
          <div>
            <span className="text-gray-400 block">Student Number:</span>
            <span className="font-mono font-bold text-gray-900">{result.student_number}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Enrolment Number:</span>
            <span className="font-mono font-bold text-gray-900">{result.enrolment_number || 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/60 border border-indigo-100 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">🎓</span>
          <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
            Convert to Enrolled Student
          </h4>
        </div>
        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-100/60 px-2 py-0.5 rounded">
          RPC: convert_intake_application
        </span>
      </div>

      <p className="text-xs text-indigo-900/80 leading-relaxed">
        Converting this application will create a formal student record, active enrolment, and write an immutable audit log entry.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Cohort selection */}
        <div>
          <label htmlFor="cohort-select" className="block font-semibold text-gray-700 mb-1">
            Assign Cohort
          </label>
          <select
            id="cohort-select"
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            disabled={isLoadingCohorts || cohorts.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        <div>
          <label htmlFor="approved-fee" className="block font-semibold text-gray-700 mb-1">
            Approved Tuition Fee (NGN)
          </label>
          <input
            id="approved-fee"
            type="number"
            min={0}
            step={1000}
            value={fee}
            onChange={(e) => setFee(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          disabled={isConverting}
          onClick={handleConvert}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isConverting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Executing Conversion RPC...</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>Confirm & Convert Application</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
