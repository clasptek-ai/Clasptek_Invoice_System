/**
 * components/students/StudentTable.tsx — Phase 4 & Responsive Section 13
 * Responsive 11-column Student & Client Directory Table with Mobile Card Stack.
 * Reference: index.html lines 24694–24727
 */

'use client';

import React from 'react';
import type { StudentSummary } from '@/types/students';

interface StudentTableProps {
  students: StudentSummary[];
  onOpenProfile: (studentId: string) => void;
  onEditStudent?: (studentId: string) => void;
  onOpen360?: (studentId: string) => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function StudentTable({
  students,
  onOpenProfile,
  onEditStudent,
  onOpen360,
}: StudentTableProps) {
  if (students.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">👥</div>
        <div className="cp-empty-title">No students or clients found</div>
        <div className="cp-empty-desc">
          Click &ldquo;+ Add Student&rdquo; above to register a new student or adjust your search filter.
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 850px) {
          .student-table-desktop { display: none !important; }
          .student-cards-mobile { display: flex !important; flex-direction: column; gap: 10px; }
        }
        @media (min-width: 851px) {
          .student-table-desktop { display: block !important; }
          .student-cards-mobile { display: none !important; }
        }
      `}</style>

      {/* Desktop & Tablet Table (Scrolls within its own container, never causes whole-page overflow) */}
      <div className="cp-table-wrap cp-table-desktop student-table-desktop" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="cp-table">
          <thead>
            <tr>
              <th style={{ minWidth: '140px', maxWidth: '200px' }}>Student / Client Name</th>
              <th style={{ width: '90px' }}>Student ID</th>
              <th style={{ minWidth: '120px', maxWidth: '170px' }}>Programmes</th>
              <th className="cp-col-secondary">Contact</th>
              <th className="cp-col-secondary" style={{ textAlign: 'right' }}>Total Invoiced</th>
              <th className="cp-col-secondary" style={{ textAlign: 'right' }}>Total Paid</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Outstanding Balance</th>
              <th className="cp-col-tertiary">Enrolment</th>
              <th>Financial Status</th>
              <th className="cp-col-secondary">Training Status</th>
              <th style={{ textAlign: 'center', minWidth: '130px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {students.map((acc) => (
              <tr key={acc.id}>
                <td
                  style={{
                    fontWeight: 700,
                    color: 'var(--primary, #0F172A)',
                    cursor: 'pointer',
                    maxWidth: '200px',
                  }}
                  onClick={() => onOpenProfile(acc.id)}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={acc.name}>
                    {acc.name}
                  </div>
                  {acc.parent_name && (
                    <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted, #64748B)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Parent: {acc.parent_name}
                    </div>
                  )}
                  {acc.email && (
                    <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted, #64748B)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.email}
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {acc.student_number ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 700,
                        color: 'var(--primary, #0F172A)',
                        fontSize: '12px',
                      }}
                    >
                      {acc.student_number}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted, #64748B)', fontSize: '11px' }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    maxWidth: 170,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={acc.programmes_list || '—'}
                >
                  {acc.programmes_list || '—'}
                </td>
                <td className="cp-col-secondary">
                  {acc.phone || 'N/A'}
                  <br />
                  <span style={{ color: 'var(--text-muted, #64748B)', fontSize: '11px' }}>
                    {acc.email || 'N/A'}
                  </span>
                </td>
                <td className="cp-col-secondary" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(acc.total_invoiced)}</td>
                <td className="cp-col-secondary" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success, #16A34A)' }}>
                  {fmtMoney(acc.total_paid)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: acc.balance > 0 ? 'var(--warning, #D97706)' : 'var(--success, #16A34A)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtMoney(acc.balance)}
                </td>
                <td className="cp-col-tertiary">
                  {acc.is_enrolled ? (
                    <span className="cp-pill active">Enrolled</span>
                  ) : (
                    <span
                      className="cp-pill draft"
                      style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}
                    >
                      Not yet enrolled
                    </span>
                  )}
                </td>
                <td>
                  <span className={`cp-pill ${acc.financial_status.toLowerCase()}`}>
                    {acc.status_display}
                  </span>
                </td>
                <td className="cp-col-secondary">
                  <span
                    className={`cp-pill ${
                      acc.training_status === 'ACTIVE'
                        ? 'active'
                        : acc.training_status === 'COMPLETED'
                        ? 'paid'
                        : 'draft'
                    }`}
                  >
                    {acc.training_status || 'ACTIVE'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div
                    className="cp-action-group"
                    style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'nowrap' }}
                  >
                    <button
                      type="button"
                      className="cp-btn sm secondary btnOpenProfile"
                      onClick={() => onOpenProfile(acc.id)}
                      title="View Student Dossier & Profile"
                      style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 600 }}
                    >
                      👤 Profile
                    </button>
                    <button
                      type="button"
                      className="cp-btn sm secondary btnEditStudent"
                      onClick={() => (onEditStudent ? onEditStudent(acc.id) : onOpenProfile(acc.id))}
                      title="Edit Student"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      className="cp-btn sm secondary btnOpenCust360 cp-col-tertiary"
                      onClick={() => (onOpen360 ? onOpen360(acc.id) : onOpenProfile(acc.id))}
                      title="Customer 360° View"
                      style={{ padding: '4px 6px', fontSize: '12px' }}
                    >
                      360°
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack (Natural responsive presentation on phone & tablet portrait screens) */}
      <div className="cp-cards-mobile student-cards-mobile" style={{ gap: '10px' }}>
        {students.map((acc) => (
          <div
            key={acc.id}
            className="cp-card"
            style={{
              padding: '14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
            onClick={() => onOpenProfile(acc.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpenProfile(acc.id)}
            aria-label={`View dossier for ${acc.name}`}
          >
            {/* Header: Name & Student ID */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #0F172A)' }}>
                  {acc.name}
                </h4>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {acc.programmes_list}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 800,
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--surface-2, #F1F5F9)',
                    border: '1px solid var(--border, #E2E8F0)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {acc.student_number || 'STU-—'}
                </span>
                {acc.is_enrolled ? (
                  <span className="cp-pill active" style={{ fontSize: '10.5px' }}>Enrolled</span>
                ) : (
                  <span className="cp-pill draft" style={{ fontSize: '10.5px' }}>Not yet enrolled</span>
                )}
              </div>
            </div>

            {/* Financial Summary Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))',
                gap: '8px',
                background: 'var(--surface-1, #F8FAFC)',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>Invoiced</span>
                <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(acc.total_invoiced)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>Paid</span>
                <strong style={{ color: 'var(--success, #059669)' }}>{fmtMoney(acc.total_paid)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>Balance</span>
                <strong style={{ color: acc.balance > 0 ? 'var(--warning, #D97706)' : 'var(--success, #059669)' }}>
                  {fmtMoney(acc.balance)}
                </strong>
              </div>
            </div>

            {/* Footer with Contact and Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {acc.phone || acc.email || 'No contact on file'}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenProfile(acc.id);
                  }}
                  style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 600 }}
                >
                  👤 Dossier
                </button>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEditStudent) onEditStudent(acc.id);
                    else onOpenProfile(acc.id);
                  }}
                  style={{ padding: '4px 8px', fontSize: '11.5px' }}
                >
                  ✏️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
