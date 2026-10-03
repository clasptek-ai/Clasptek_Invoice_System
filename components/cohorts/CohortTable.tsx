/**
 * components/cohorts/CohortTable.tsx — Phase 4
 * Scheduled Cohorts Table with data-management controls:
 * - Multi-row selection & select-all
 * - Capacity indicators & delivery badges
 * - Action buttons: Details and Close / Archive Cohort
 * - Responsive desktop/tablet table and mobile cards
 */

'use client';

import React, { useRef, useEffect } from 'react';
import type { Cohort } from '@/types/academics';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';

interface CohortTableProps {
  cohorts: Cohort[];
  onSelectCohort?: (cohort: Cohort) => void;
  onCloseCohort?: (cohort: Cohort) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  canEdit?: boolean;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function CohortTable({
  cohorts,
  onSelectCohort,
  onCloseCohort,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false,
  canEdit = true,
}: CohortTableProps) {
  const {
    paginatedItems: paginatedCohorts,
    currentPage,
    pageSize,
    totalRecords,
    onPageChange,
    onPageSizeChange,
  } = usePagination<Cohort>(cohorts, {
    initialPageSize: 25,
    resetDeps: [cohorts],
  });

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = paginatedCohorts.filter((c) => selectedIds.has(c.id)).length;
      const isIndeterminate = selectedCount > 0 && selectedCount < paginatedCohorts.length;
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIds, paginatedCohorts]);

  if (cohorts.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">📅</div>
        <div className="cp-empty-title">No cohorts scheduled yet</div>
        <div className="cp-empty-desc">Create scheduled cohorts to enroll students into training programs.</div>
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
                    aria-label="Select all visible cohorts"
                    style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                  />
                </th>
              )}
              <th>Cohort Code</th>
              <th>Programme</th>
              <th>Dates</th>
              <th className="cp-col-secondary">Delivery</th>
              <th className="cp-col-secondary">Lead Facilitator</th>
              <th style={{ textAlign: 'center' }}>Capacity &amp; Seats</th>
              <th>Status</th>
              <th style={{ textAlign: 'center', minWidth: '110px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCohorts.map((c) => {
              const enrolled = c.enrolled_count || 0;
              const cap = Number(c.capacity || 25);
              const isFull = c.is_full ?? (enrolled >= cap);
              const pct = c.percentage_full ?? (cap > 0 ? Math.round((enrolled / cap) * 100) : 0);
              const isChecked = selectedIds.has(c.id);

              return (
                <tr
                  key={c.id}
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
                        onChange={() => onToggleSelect(c.id)}
                        aria-label={`Select ${c.cohort_code}`}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </td>
                  )}

                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {c.cohort_code || c.id}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.programme_name || 'Not specified'}</td>
                  <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {fmtDate(c.start_date)} &rarr; {fmtDate(c.end_date)}
                  </td>
                  <td className="cp-col-secondary">
                    <span className="cp-pill category-pill">
                      {c.delivery_mode || 'IN_PERSON'}
                    </span>
                  </td>
                  <td className="cp-col-secondary" style={{ fontSize: '12.5px' }}>
                    {c.lead_facilitator_name || (
                      <span style={{ color: 'var(--text-secondary)' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`cp-pill ${isFull ? 'danger' : 'paid'}`} style={{ fontWeight: 700 }}>
                      {enrolled} / {cap} ({pct}%)
                    </span>
                  </td>
                  <td>
                    <span
                      className={`cp-pill ${
                        c.status === 'IN_PROGRESS'
                          ? 'active'
                          : c.status === 'COMPLETED'
                          ? 'paid'
                          : c.status === 'CANCELLED'
                          ? 'draft'
                          : 'category-pill'
                      }`}
                    >
                      {c.status || 'UPCOMING'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={() => onSelectCohort && onSelectCohort(c)}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Details
                      </button>
                      {canEdit && onCloseCohort && c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={() => onCloseCohort(c)}
                          style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                          title="Close / Complete Cohort"
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
        {paginatedCohorts.map((c) => {
          const enrolled = c.enrolled_count || 0;
          const cap = Number(c.capacity || 25);
          const isFull = c.is_full ?? (enrolled >= cap);
          const isChecked = selectedIds.has(c.id);

          return (
            <div
              key={c.id}
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
                      onChange={() => onToggleSelect(c.id)}
                      aria-label={`Select ${c.cohort_code}`}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                  )}
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px', color: 'var(--primary)' }}>
                      {c.cohort_code || c.id}
                    </span>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {c.name}
                    </div>
                  </div>
                </div>
                <span className={`cp-pill ${c.status === 'IN_PROGRESS' ? 'active' : 'draft'}`}>
                  {c.status || 'UPCOMING'}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>{c.programme_name || 'Not specified'}</strong> &middot; {c.delivery_mode || 'IN_PERSON'}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '8px' }}>
                <span>Dates: {fmtDate(c.start_date)} &rarr; {fmtDate(c.end_date)}</span>
                <span className={`cp-pill ${isFull ? 'danger' : 'paid'}`}>
                  {enrolled} / {cap} seats
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={() => onSelectCohort && onSelectCohort(c)}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  Details
                </button>
                {canEdit && onCloseCohort && c.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => onCloseCohort(c)}
                    style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                  >
                    🛑 Close
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalRecords={totalRecords}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        entityLabel="cohorts"
      />

    </>
  );
}
