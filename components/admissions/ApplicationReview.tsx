/**
 * components/admissions/ApplicationReview.tsx — Phase 3
 * Application review panel displaying identity confidence, match notes,
 * review reason, and status progression actions.
 */

'use client';

import { useState } from 'react';
import type { IntakeApplication, ApplicationStatus } from '@/types/admissions';
import { StatusBadge } from '@/components/admissions/StatusBadge';

interface ApplicationReviewProps {
  application: IntakeApplication;
  onStatusChange: (newStatus: ApplicationStatus) => Promise<void>;
}

const CONFIDENCE_STYLES = {
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AMBIGUOUS: 'bg-amber-50 text-amber-700 border-amber-200',
  NONE: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function ApplicationReview({ application, onStatusChange }: ApplicationReviewProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatus = async (status: ApplicationStatus) => {
    setIsUpdating(true);
    setError(null);
    try {
      await onStatusChange(status);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const isConverted = application.status === 'CONVERTED';
  const confidence = application.identity_confidence || 'NONE';
  const confidenceStyle = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.NONE;

  return (
    <div className="space-y-4">
      {/* Identity Resolution Section */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🔍</span>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Identity & CRM Resolution
            </h4>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${confidenceStyle}`}>
            Confidence: {confidence}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">Matched Student ID</span>
            {application.matched_student_id ? (
              <span className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {application.matched_student_id}
              </span>
            ) : (
              <span className="text-slate-500 italic">None (New Student)</span>
            )}
          </div>

          <div>
            <span className="text-slate-400 block mb-0.5">Linked Enquiry ID</span>
            {application.enquiry_id ? (
              <span className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {application.enquiry_id}
              </span>
            ) : (
              <span className="text-slate-500 italic">Direct Application</span>
            )}
          </div>

          {application.enrolment_id && (
            <div className="sm:col-span-2">
              <span className="text-slate-400 block mb-0.5">Active Enrolment ID</span>
              <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {application.enrolment_id}
              </span>
            </div>
          )}
        </div>

        {/* Review reason / Match notes */}
        {(application.review_reason || application.match_notes) && (
          <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2 text-xs">
            {application.review_reason && (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-2.5 text-amber-900">
                <span className="font-semibold block mb-0.5">Flagged Reason:</span>
                <p>{application.review_reason}</p>
              </div>
            )}
            {application.match_notes && (
              <div className="bg-blue-50/60 border border-blue-200/60 rounded-lg p-2.5 text-blue-900">
                <span className="font-semibold block mb-0.5">System Matching Notes:</span>
                <p>{application.match_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Actions */}
      {!isConverted ? (
        <div className="bg-white border border-gray-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Application Progression
            </h4>
            <StatusBadge status={application.status} />
          </div>

          {error && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {application.status !== 'QUALIFIED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('QUALIFIED')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
              >
                Mark as Qualified
              </button>
            )}

            {application.status !== 'MATCHED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('MATCHED')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
              >
                Mark as Matched
              </button>
            )}

            {application.status !== 'REVIEW_REQUIRED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('REVIEW_REQUIRED')}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                Request Review
              </button>
            )}

            {application.status !== 'REJECTED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('REJECTED')}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors ml-auto"
              >
                Reject
              </button>
            )}

            {application.status !== 'CANCELLED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('CANCELLED')}
                className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
            ✓
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
              Enrolment Converted
            </h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              This application has been successfully converted into an active student record.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
