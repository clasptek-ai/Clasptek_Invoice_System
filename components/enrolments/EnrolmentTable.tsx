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
          Enroll students from Candidate Applications or adjust filter parameters.
        </div>
      </div>
    );
  }

  return (
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Enrolment #</th>
            <th>Student</th>
            <th>Programme &amp; Cohort</th>
            <th style={{ textAlign: 'right' }}>Agreed Tuition</th>
            <th style={{ textAlign: 'center' }}>Attendance</th>
            <th>Completion</th>
            <th>Credential</th>
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
                <td style={{ textAlign: 'center', fontSize: '12px' }}>
                  <span
                    className={`cp-pill ${att >= 80 ? 'paid' : att > 0 ? 'active' : 'draft'}`}
                    style={{ fontWeight: 700 }}
                  >
                    {att}%
                  </span>
                </td>
                <td>
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
                <td>
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
  );
}
