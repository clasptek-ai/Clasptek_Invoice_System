/**
 * components/cohorts/CohortTable.tsx — Phase 4
 * Exact legacy Clasptek 8-column Cohorts & Schedules Table.
 * Reference: index.html lines 26130–26160 / 26300–26360
 */

'use client';

import React from 'react';
import type { Cohort } from '../../types/academics';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';

interface CohortTableProps {
  cohorts: Cohort[];
  onSelectCohort?: (cohort: Cohort) => void;
}

function fmtDate(iso: string | null): string {
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

export function CohortTable({ cohorts, onSelectCohort }: CohortTableProps) {
  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedCohorts,
    setPage,
    setPageSize,
  } = usePagination(cohorts, {
    initialPageSize: 25,
    resetDeps: [cohorts],
  });

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
      <div className="cp-table-wrap cp-table-desktop">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Cohort Code</th>
              <th>Programme</th>
              <th>Dates</th>
              <th className="cp-col-secondary">Delivery</th>
              <th className="cp-col-secondary">Lead Facilitator</th>
              <th style={{ textAlign: 'center' }}>Capacity &amp; Seats</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCohorts.map((c) => {
              const enrolled = c.enrolled_count || 0;
              const cap = Number(c.capacity || 25);
              const isFull = c.is_full ?? (enrolled >= cap);
              const pct = c.percentage_full ?? (cap > 0 ? Math.round((enrolled / cap) * 100) : 0);

              return (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {c.cohort_code || c.id}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.programme_name || 'General'}</td>
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
                          : 'draft'
                      }`}
                    >
                      {c.status || 'UPCOMING'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={() => onSelectCohort && onSelectCohort(c)}
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
        {paginatedCohorts.map((c) => {
          const enrolled = c.enrolled_count || 0;
          const cap = Number(c.capacity || 25);
          const isFull = c.is_full ?? (enrolled >= cap);
          const pct = c.percentage_full ?? (cap > 0 ? Math.round((enrolled / cap) * 100) : 0);

          return (
            <div
              key={c.id}
              className="cp-mobile-record-card"
              onClick={() => onSelectCohort && onSelectCohort(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectCohort && onSelectCohort(c)}
              aria-label={`View cohort ${c.cohort_code || c.name}`}
            >
              <div className="cp-mobile-record-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {c.programme_name || 'General Training'}
                  </h4>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {c.lead_facilitator_name ? `Facilitator: ${c.lead_facilitator_name}` : 'Unassigned'}
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
                  }}
                >
                  {c.cohort_code || 'COH-—'}
                </span>
              </div>

              <div className="cp-mobile-record-grid">
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Status</span>
                  <div>
                    <span
                      className={`cp-pill ${
                        c.status === 'IN_PROGRESS'
                          ? 'active'
                          : c.status === 'COMPLETED'
                          ? 'paid'
                          : 'draft'
                      }`}
                    >
                      {c.status || 'UPCOMING'}
                    </span>
                  </div>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Enrolment Capacity</span>
                  <div>
                    <span className={`cp-pill ${isFull ? 'danger' : 'paid'}`} style={{ fontWeight: 700, fontSize: '10.5px' }}>
                      {enrolled} / {cap} ({pct}%)
                    </span>
                  </div>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Schedule Dates</span>
                  <span className="cp-mobile-record-value" style={{ fontSize: '11.5px', fontWeight: 400 }}>
                    {fmtDate(c.start_date)} &rarr; {fmtDate(c.end_date)}
                  </span>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label">Mode</span>
                  <span className="cp-mobile-record-value" style={{ fontSize: '11.5px', fontWeight: 400 }}>
                    {c.delivery_mode || 'IN_PERSON'}
                  </span>
                </div>
              </div>

              <div className="cp-mobile-record-actions">
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectCohort) onSelectCohort(c);
                  }}
                  style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                >
                  View Cohort Details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Standard Pagination */}
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalRecords={cohorts.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        entityLabel="cohorts"
      />
    </>
  );
}
