/**
 * components/admissions/ApplicationDrawer.tsx — Phase 3
 * Comprehensive slide-in dossier drawer for an intake application.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { IntakeApplication, ApplicationStatus, ConversionResult } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';
import { ApplicationReview } from './ApplicationReview';
import { ConversionPanel } from './ConversionPanel';
import { CONVERTIBLE_STATUSES } from '@/types/admissions';

interface ApplicationDrawerProps {
  application: IntakeApplication | null;
  onClose: () => void;
  onStatusChange: (applicationId: string, newStatus: ApplicationStatus) => Promise<void>;
  onConverted: (result: ConversionResult) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function ApplicationDrawer({
  application,
  onClose,
  onStatusChange,
  onConverted,
}: ApplicationDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (application) {
      closeButtonRef.current?.focus();
    }
  }, [application]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!application) return null;

  const isConvertible = CONVERTIBLE_STATUSES.includes(application.status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200/80 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-900 shadow-xs">
                {application.application_number}
              </span>
              <StatusBadge status={application.status} />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                Submitted {formatDate(application.submitted_at)}
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Applicant Quick Header */}
            <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/40 rounded-xl p-4 border border-blue-100 flex items-center justify-between">
              <div>
                <h3 id="drawer-title" className="text-lg font-bold text-gray-900">
                  {application.first_name} {application.last_name}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-600 mt-1">
                  {application.email && <span>✉ {application.email}</span>}
                  {application.phone && <span>📞 {application.phone}</span>}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                  Source
                </span>
                <span className="text-xs font-medium text-gray-800">
                  {application.source}
                </span>
              </div>
            </div>

            {/* Conversion Panel (if eligible) */}
            {isConvertible && (
              <ConversionPanel
                application={application}
                onConverted={onConverted}
              />
            )}

            {/* Review & Lifecycle Actions */}
            <ApplicationReview
              application={application}
              onStatusChange={(newStatus) => onStatusChange(application.id, newStatus)}
            />

            {/* Section 1: Programme & Preferences */}
            <div className="bg-white rounded-xl border border-gray-200/80 p-4 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>📚</span> Programme & Preferences
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Programme</span>
                  <span className="font-medium text-gray-900">{application.programme_name || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Delivery Mode</span>
                  <span className="font-medium text-gray-900">{application.delivery_mode || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Preferred Schedule</span>
                  <span className="font-medium text-gray-900">{application.preferred_schedule || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Expertise Level</span>
                  <span className="font-medium text-gray-900">{application.expertise_level || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Target Start Date</span>
                  <span className="font-medium text-gray-900">{formatDate(application.preferred_start_date)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Agreed Fee</span>
                  <span className="font-mono font-bold text-gray-900">
                    NGN {Number(application.agreed_tuition_fee || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Personal Dossier */}
            <div className="bg-white rounded-xl border border-gray-200/80 p-4 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>👤</span> Personal Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Date of Birth</span>
                  <span className="font-medium text-gray-900">{formatDate(application.date_of_birth)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Gender</span>
                  <span className="font-medium text-gray-900">{application.gender || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Marital Status</span>
                  <span className="font-medium text-gray-900">{application.marital_status || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">State of Origin</span>
                  <span className="font-medium text-gray-900">{application.state_of_origin || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Nationality</span>
                  <span className="font-medium text-gray-900">{application.nationality || 'Nigeria'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Employment</span>
                  <span className="font-medium text-gray-900">{application.employment_status || '—'}</span>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-gray-400 block mb-0.5">Residential Address</span>
                  <span className="font-medium text-gray-900">{application.address || '—'}</span>
                </div>
              </div>
            </div>

            {/* Section 3: Sponsorship & Background */}
            <div className="bg-white rounded-xl border border-gray-200/80 p-4 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>🤝</span> Sponsorship & Referral
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Sponsor Type</span>
                  <span className="font-medium text-gray-900">{application.sponsor_type || 'Self'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Sponsor Name</span>
                  <span className="font-medium text-gray-900">{application.sponsor_name || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Sponsor Contact</span>
                  <span className="font-medium text-gray-900">
                    {application.sponsor_phone || application.sponsor_email || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Referral Source</span>
                  <span className="font-medium text-gray-900">{application.referral_source || '—'}</span>
                </div>
              </div>
              {application.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-400 block text-xs mb-1">Applicant Notes:</span>
                  <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    {application.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Section 4: Immutable Raw Submission Snapshot */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔒</span> Immutable Submission Snapshot (applicant_data)
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  Trigger-Enforced
                </span>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                  View Raw JSON Payload
                </summary>
                <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(application.applicant_data || {}, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
