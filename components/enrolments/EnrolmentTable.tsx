/**
 * components/enrolments/EnrolmentTable.tsx — Phase 4
 * Course Enrolment Register Table with data management controls:
 * - Multi-row selection & select-all
 * - Attendance & Completion status badges
 * - Action buttons: Details, Edit Status, Withdraw / Deactivate
 * - Responsive desktop/tablet table and mobile cards
 */

'use client';

import React, { useRef, useEffect } from 'react';
import type { Enrolment } from '@/types/academics';
import { SortableHeader } from '@/components/tables/SortableHeader';

interface EnrolmentTableProps {
  enrolments: Enrolment[];
  onSelectEnrolment?: (enrolment: Enrolment) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  onEditStatus?: (enrolment: Enrolment) => void;
  onWithdrawEnrolment?: (enrolment: Enrolment) => void;
  canEdit?: boolean;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function EnrolmentTable({
  enrolments,
  onSelectEnrolment,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false,
  onEditStatus,
  onWithdrawEnrolment,
  canEdit = true,
  sortField,
  sortOrder,
  onSort,
}: EnrolmentTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = enrolments.filter((e) => selectedIds.has(e.id)).length;
      const isIndeterminate = selectedCount > 0 && selectedCount < enrolments.length;
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIds, enrolments]);

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
      <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="cp-table">
          <thead>
            <tr>
              {onToggleSelect && (
                <th style={{ width: '42px', textAlign: 'center', padding: '8px' }}>
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all visible enrolments"
                    style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                  />
                </th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Enrolment #"
                  field="enrolment_number"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              ) : (
                <th>Enrolment #</th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Student"
                  field="student_name"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              ) : (
                <th>Student</th>
              )}
              <th>Programme &amp; Cohort</th>
              {onSort ? (
                <SortableHeader
                  label="Agreed Tuition"
                  field="tuition_fee"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  align="right"
                />
              ) : (
                <th style={{ textAlign: 'right' }}>Agreed Tuition</th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Attendance"
                  field="attendance"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  align="center"
                  className="cp-col-secondary"
                />
              ) : (
                <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Attendance</th>
              )}
              {onSort ? (
                <SortableHeader
                  label="Completion"
                  field="completion"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  className="cp-col-secondary"
                />
              ) : (
                <th className="cp-col-secondary">Completion</th>
              )}
              <th className="cp-col-tertiary">Credential</th>
              {onSort ? (
                <SortableHeader
                  label="Status"
                  field="status"
                  currentSort={sortField}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              ) : (
                <th>Status</th>
              )}
              <th style={{ textAlign: 'center', minWidth: '130px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {enrolments.map((en) => {
              const att = Number(en.completion_attendance_pct || 0);
              const isChecked = selectedIds.has(en.id);

              return (
                <tr
                  key={en.id}
                  style={{
                    backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.05)' : undefined,
                  }}
                >
                  {/* Checkbox */}
                  {onToggleSelect && (
                    <td
                      style={{ textAlign: 'center', width: '42px', padding: '8px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSelect(en.id)}
                        aria-label={`Select ${en.enrolment_number}`}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </td>
                  )}

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
                    <div style={{ fontWeight: 600 }}>{en.programme_name || 'Not specified'}</div>
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
                          : en.status === 'WITHDRAWN' || en.status === 'CANCELLED'
                          ? 'draft'
                          : 'category-pill'
                      }`}
                    >
                      {en.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={() => onSelectEnrolment && onSelectEnrolment(en)}
                        style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600 }}
                      >
                        Details
                      </button>
                      {canEdit && onEditStatus && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={() => onEditStatus(en)}
                          style={{ padding: '3px 6px', fontSize: '11px' }}
                          title="Change Enrolment Status"
                        >
                          ✏️
                        </button>
                      )}
                      {canEdit && onWithdrawEnrolment && en.status !== 'WITHDRAWN' && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={() => onWithdrawEnrolment(en)}
                          style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                          title="Withdraw Enrolment"
                        >
                          🛑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {enrolments.map((en) => {
          const att = Number(en.completion_attendance_pct || 0);
          const isChecked = selectedIds.has(en.id);

          return (
            <div
              key={en.id}
              className="cp-card"
              style={{
                padding: '14px',
                border: isChecked ? '1px solid #3B82F6' : undefined,
                backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.03)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(en.id)}
                      aria-label={`Select ${en.enrolment_number}`}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                  )}
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px', color: 'var(--primary)' }}>
                      {en.enrolment_number || 'ENR-—'}
                    </span>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {en.student_name}
                    </div>
                  </div>
                </div>
                <span className={`cp-pill ${en.status === 'ACTIVE' ? 'active' : 'draft'}`}>
                  {en.status}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>{en.programme_name || 'Not specified'}</strong> &middot; {en.cohort_name}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '8px' }}>
                <span>Agreed: <strong>{fmtMoney(en.agreed_tuition_fee)}</strong></span>
                <span>Attendance: <strong>{att}%</strong></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={() => onSelectEnrolment && onSelectEnrolment(en)}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  Details
                </button>
                {canEdit && onEditStatus && (
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => onEditStatus(en)}
                    style={{ padding: '3px 6px', fontSize: '11px' }}
                  >
                    ✏️
                  </button>
                )}
                {canEdit && onWithdrawEnrolment && en.status !== 'WITHDRAWN' && (
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => onWithdrawEnrolment(en)}
                    style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                  >
                    🛑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
