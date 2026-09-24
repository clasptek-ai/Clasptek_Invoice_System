/**
 * components/admissions/ApplicationDrawer.tsx — Phase 3 & 9G
 * Comprehensive slide-in dossier drawer for an intake application.
 * Uses genuine .cp-drawer and .cp-* design system styles.
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
    <div className="cp-drawer-overlay" onClick={onClose} aria-hidden="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="cp-drawer large"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cp-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '13px', background: 'var(--surface-0)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              {application.application_number}
            </span>
            <StatusBadge status={application.status} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Submitted {formatDate(application.submitted_at)}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="cp-drawer-close"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="cp-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Applicant Quick Header */}
          <div className="cp-card" style={{ padding: '16px', background: 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 id="drawer-title" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {application.first_name} {application.last_name}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {application.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    {application.email}
                  </span>
                )}
                {application.phone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                    {application.phone}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                Source
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
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
          <div className="cp-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Programme &amp; Preferences
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Programme</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.programme_name || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Delivery Mode</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.delivery_mode || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Preferred Schedule</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.preferred_schedule || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Expertise Level</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.expertise_level || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Target Start Date</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(application.preferred_start_date)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Agreed Fee</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  NGN {Number(application.agreed_tuition_fee || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Personal Dossier */}
          <div className="cp-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Personal Information
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Date of Birth</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(application.date_of_birth)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Gender</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.gender || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Marital Status</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.marital_status || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>State of Origin</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.state_of_origin || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Nationality</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.nationality || 'Nigeria'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Employment</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.employment_status || '—'}</span>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Residential Address</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.address || '—'}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Sponsorship & Background */}
          <div className="cp-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Sponsorship &amp; Referral
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Sponsor Type</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.sponsor_type || 'Self'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Sponsor Name</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.sponsor_name || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Sponsor Contact</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {application.sponsor_phone || application.sponsor_email || '—'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Referral Source</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{application.referral_source || '—'}</span>
              </div>
            </div>
            {application.notes && (
              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Applicant Notes:</span>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', background: 'var(--surface-1)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  {application.notes}
                </p>
              </div>
            )}
          </div>

          {/* Section 4: Immutable Raw Submission Snapshot */}
          <div className="cp-card" style={{ padding: '16px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Immutable Submission Snapshot (applicant_data)
              </h4>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                Trigger-Enforced
              </span>
            </div>
            <details style={{ fontSize: '12px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--interactive, #0284C7)', fontWeight: 600 }}>
                View Raw JSON Payload
              </summary>
              <pre style={{ marginTop: '8px', padding: '12px', background: '#0F172A', color: '#F8FAFC', borderRadius: '6px', fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', overflowX: 'auto', maxHeight: '180px' }}>
                {JSON.stringify(application.applicant_data || {}, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
