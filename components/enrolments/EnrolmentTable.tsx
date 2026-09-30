/**
 * components/enrolments/EnrolmentTable.tsx — Phase 4
 * Exact legacy Clasptek 9-column Course Enrolment Register Table.
 * Reference: index.html lines 26531–26550
 */

'use client';

import React from 'react';
import type { Enrolment } from '@/types/academics';

interface EnrolmentTableProps {
  enrolments: Enrolment[];
  onSelectEnrolment?: (enrolment: Enrolment) => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function EnrolmentTable({ enrolments, onSelectEnrolment }: EnrolmentTableProps) {
  if (enrolments.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">📝</div>
        <div className="cp-empty-title">No enrolments match criteria</div>
        <div className="cp-empty-desc">
          Enroll students from Student Directory or adjust filter parameters.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop & Tablet Table */}
      <div className="cp-table-wrap cp-table-desktop">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Enrolment #</th>
              <th>Student</th>
              <th>Programme &amp; Cohort</th>
              <th style={{ textAlign: 'right' }}>Agreed Tuition</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Attendance</th>
              <th className="cp-col-secondary">Completion</th>
              <th className="cp-col-tertiary">Credential</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {enrolments.map((en) => {
              const att = Number(en.completion_attendance_pct || 0);
              return (
                <tr key={en.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                    {en.enrolment_number || 'ENR-—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {en.student_name}
                    {en.student_email && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {en.student_email}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{en.programme_name || 'General'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{en.cohort_name}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                    {fmtMoney(en.agreed_tuition_fee)}
                  </td>
                  <td className="cp-col-secondary" style={{ textAlign: 'center', fontSize: '12px' }}>
                    <span
                      className={`cp-pill ${att >= 80 ? 'paid' : att > 0 ? 'active' : 'draft'}`}
                      style={{ fontWeight: 700 }}
                    >
                      {att}%
                    </span>
                  </td>
                  <td className="cp-col-secondary">
                    <span
                      className={`cp-pill ${
                        en.completion_status === 'COMPLETED'
                          ? 'paid'
                          : en.completion_status === 'IN_PROGRESS'
                          ? 'active'
                          : 'draft'
                      }`}
                    >
                      {en.completion_status || 'NOT_ELIGIBLE'}
                    </span>
                  </td>
                  <td className="cp-col-tertiary">
                    {en.certificate_issued ? (
                      <span className="cp-pill paid" title={en.certificate_number || 'Issued'}>
                        🎓 {en.certificate_number || 'CERTIFIED'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`cp-pill ${
                        en.status === 'ACTIVE'
                          ? 'active'
                          : en.status === 'COMPLETED'
                          ? 'paid'
                          : en.status === 'CONFIRMED'
                          ? 'category-pill'
                          : 'draft'
                      }`}
                    >
                      {en.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={() => onSelectEnrolment && onSelectEnrolment(en)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile">
        {enrolments.map((en) => {
          const att = Number(en.completion_attendance_pct || 0);
          return (
            <div
              key={en.id}
              className="cp-mobile-record-card"
              onClick={() => onSelectEnrolment && onSelectEnrolment(en)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectEnrolment && onSelectEnrolment(en)}
              aria-label={`View enrolment for ${en.student_name}`}
            >
              <div className="cp-mobile-record-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {en.student_name}
                  </h4>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {en.programme_name || 'General'} &bull; {en.cohort_name}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
                  }}
                >
                  {en.enrolment_number || 'ENR-—'}
                </span>
              </div>

              <div className="cp-mobile-record-grid">
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Status</span>
                  <div>
                    <span
                      className={`cp-pill ${
                        en.status === 'ACTIVE'
                          ? 'active'
                          : en.status === 'COMPLETED'
                          ? 'paid'
                          : en.status === 'CONFIRMED'
                          ? 'category-pill'
                          : 'draft'
                      }`}
                    >
                      {en.status}
                    </span>
                  </div>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Tuition Fee</span>
                  <span className="cp-mobile-record-value" style={{ color: 'var(--primary)' }}>
                    {fmtMoney(en.agreed_tuition_fee)}
                  </span>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Attendance</span>
                  <div>
                    <span
                      className={`cp-pill ${att >= 80 ? 'paid' : att > 0 ? 'active' : 'draft'}`}
                      style={{ fontWeight: 700, fontSize: '10.5px' }}
                    >
                      {att}%
                    </span>
                  </div>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Credential</span>
                  <span className="cp-mobile-record-value" style={{ fontSize: '11.5px', fontWeight: 500 }}>
                    {en.certificate_issued ? '🎓 Certified' : '—'}
                  </span>
                </div>
              </div>

              <div className="cp-mobile-record-actions">
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectEnrolment) onSelectEnrolment(en);
                  }}
                  style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                >
                  View Enrolment
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
