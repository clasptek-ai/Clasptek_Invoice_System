/**
 * components/cohorts/ClassRosterModal.tsx — Phase C328
 * Class Roster Modal for Facilitators & Academic Admins
 *
 * Displays enrolled students for a specific assigned cohort.
 * Adheres strictly to cp-* CSS tokens, SVG icons, and responsive design.
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { EnrolmentStudentInfo } from '@/types/training';

interface ClassRosterModalProps {
  isOpen: boolean;
  cohortId: string | null;
  cohortCode?: string;
  cohortName?: string;
  onClose: () => void;
}

export function ClassRosterModal({
  isOpen,
  cohortId,
  cohortCode,
  cohortName,
  onClose,
}: ClassRosterModalProps) {
  const [students, setStudents] = useState<EnrolmentStudentInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !cohortId) {
      setStudents([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/training/cohorts/${cohortId}/roster`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setStudents(json.students || []);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load class roster';
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, cohortId]);

  if (!isOpen) return null;

  return (
    <div
      className="cp-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="cp-card cp-modal-content"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Class Roster &middot; {cohortCode || 'Cohort'}
            </div>
            {cohortName && (
              <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                {cohortName}
              </div>
            )}
          </div>
          <button
            type="button"
            className="cp-btn sm secondary"
            onClick={onClose}
            style={{ padding: '6px 10px', minWidth: 'auto', border: 'none', background: '#F1F5F9' }}
            aria-label="Close modal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748B', fontSize: '13.5px' }}>
              Loading enrolled students roster...
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '6px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '13px',
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && students.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748B' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                No students enrolled in this cohort yet.
              </div>
              <div style={{ fontSize: '12.5px' }}>
                Enrolments will appear here once registered by academic admissions.
              </div>
            </div>
          )}

          {!loading && !error && students.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                Enrolled Students ({students.length})
              </div>
              <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Student Name</th>
                      <th style={{ textAlign: 'left' }}>Student Number</th>
                      <th style={{ textAlign: 'left' }}>Email</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, idx) => (
                      <tr key={s.enrolmentId || idx}>
                        <td style={{ fontWeight: 600, color: '#0F172A' }}>
                          {s.studentName || 'Student'}
                        </td>
                        <td style={{ fontFamily: 'monospace', color: '#475569', fontSize: '12px' }}>
                          {s.studentNumber || s.enrolmentNumber || '—'}
                        </td>
                        <td style={{ color: '#64748B', fontSize: '12.5px' }}>
                          {s.studentEmail || '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="cp-pill paid"
                            style={{ fontSize: '10.5px', textTransform: 'uppercase' }}
                          >
                            {s.status || 'ACTIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Authoritative class roster &middot; Read-only academic record
          </div>
          <button
            type="button"
            className="cp-btn sm secondary"
            onClick={onClose}
            style={{ fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

