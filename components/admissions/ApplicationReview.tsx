/**
 * components/admissions/ApplicationReview.tsx — Phase 3 & 9G
 * Application review panel displaying identity confidence, match notes,
 * review reason, and status progression actions.
 * Uses genuine .cp-* design system styles.
 */

'use client';

import { useState } from 'react';
import type { IntakeApplication, ApplicationStatus } from '@/types/admissions';
import { StatusBadge } from '@/components/admissions/StatusBadge';

interface ApplicationReviewProps {
  application: IntakeApplication;
  onStatusChange: (newStatus: ApplicationStatus) => Promise<void>;
}

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Identity Resolution Section */}
      <div className="cp-card" style={{ padding: '16px', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Identity &amp; CRM Resolution
            </h4>
          </div>
          <span className={`cp-pill ${confidence === 'HIGH' ? 'success' : confidence === 'AMBIGUOUS' ? 'warning' : 'neutral'}`}>
            Confidence: {confidence}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Matched Student ID</span>
            {application.matched_student_id ? (
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text-primary)', background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {application.matched_student_id}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>None (New Student)</span>
            )}
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Linked Enquiry ID</span>
            {application.enquiry_id ? (
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text-primary)', background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {application.enquiry_id}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Direct Application</span>
            )}
          </div>

          {application.enrolment_id && (
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Active Enrolment ID</span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--success)', background: 'var(--success-bg)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--success-border)' }}>
                {application.enrolment_id}
              </span>
            </div>
          )}
        </div>

        {/* Review reason / Match notes */}
        {(application.review_reason || application.match_notes) && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            {application.review_reason && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '10px', color: '#92400E' }}>
                <span style={{ fontWeight: 700, display: 'block', marginBottom: '2px' }}>Flagged Reason:</span>
                <p style={{ margin: 0 }}>{application.review_reason}</p>
              </div>
            )}
            {application.match_notes && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '10px', color: '#1E40AF' }}>
                <span style={{ fontWeight: 700, display: 'block', marginBottom: '2px' }}>System Matching Notes:</span>
                <p style={{ margin: 0 }}>{application.match_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Actions */}
      {!isConverted ? (
        <div className="cp-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Application Progression
            </h4>
            <StatusBadge status={application.status} />
          </div>

          {error && (
            <div role="alert" className="cp-alert error" style={{ marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {application.status !== 'QUALIFIED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('QUALIFIED')}
                className="cp-btn sm primary"
              >
                Mark as Qualified
              </button>
            )}

            {application.status !== 'MATCHED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('MATCHED')}
                className="cp-btn sm secondary"
              >
                Mark as Matched
              </button>
            )}

            {application.status !== 'REVIEW_REQUIRED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('REVIEW_REQUIRED')}
                className="cp-btn sm secondary"
              >
                Request Review
              </button>
            )}

            {application.status !== 'REJECTED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('REJECTED')}
                className="cp-btn sm danger"
                style={{ marginLeft: 'auto' }}
              >
                Reject
              </button>
            )}

            {application.status !== 'CANCELLED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatus('CANCELLED')}
                className="cp-btn sm secondary"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="cp-alert success" style={{ margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800 }}>✓</span>
            <div>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Enrolment Converted</div>
              <div style={{ fontSize: '12px', marginTop: '2px' }}>This application has been successfully converted into an active student record.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
