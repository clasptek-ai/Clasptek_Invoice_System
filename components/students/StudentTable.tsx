/**
 * components/students/StudentTable.tsx — Phase 4
 * Exact legacy Clasptek 11-column Student & Client Directory Table.
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
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Student / Client Name</th>
            <th>Student ID</th>
            <th>Programmes</th>
            <th>Contact</th>
            <th style={{ textAlign: 'right' }}>Total Invoiced</th>
            <th style={{ textAlign: 'right' }}>Total Paid</th>
            <th style={{ textAlign: 'right' }}>Outstanding Balance</th>
            <th>Enrolment</th>
            <th>Financial Status</th>
            <th>Training Status</th>
            <th style={{ textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {students.map((acc) => (
            <tr key={acc.id}>
              <td
                style={{ fontWeight: 700, color: 'var(--primary, #0F172A)', cursor: 'pointer' }}
                onClick={() => onOpenProfile(acc.id)}
              >
                {acc.name}
                {acc.parent_name && (
                  <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted, #64748B)' }}>
                    Parent: {acc.parent_name}
                  </div>
                )}
              </td>
              <td>
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
              <td>{acc.programmes_list}</td>
              <td>
                {acc.phone || 'N/A'}
                <br />
                <span style={{ color: 'var(--text-muted, #64748B)', fontSize: '11px' }}>
                  {acc.email || 'N/A'}
                </span>
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(acc.total_invoiced)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success, #16A34A)' }}>
                {fmtMoney(acc.total_paid)}
              </td>
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 700,
                  color: acc.balance > 0 ? 'var(--warning, #D97706)' : 'var(--success, #16A34A)',
                }}
              >
                {fmtMoney(acc.balance)}
              </td>
              <td>
                {acc.is_enrolled ? (
                  <span className="cp-pill active">ENROLLED</span>
                ) : (
                  <span className="cp-pill draft">NOT ENROLLED</span>
                )}
              </td>
              <td>
                <span className={`cp-pill ${acc.financial_status.toLowerCase()}`}>
                  {acc.status_display}
                </span>
              </td>
              <td>
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
                    title="View Student Profile"
                  >
                    👤 Profile
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary btnEditStudent"
                    onClick={() => (onEditStudent ? onEditStudent(acc.id) : onOpenProfile(acc.id))}
                    title="Edit Student"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary btnOpenCust360"
                    onClick={() => (onOpen360 ? onOpen360(acc.id) : onOpenProfile(acc.id))}
                    title="Customer 360° View"
                  >
                    👤 360°
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
