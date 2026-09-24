/**
 * components/cohorts/CohortTable.tsx — Phase 4
 * Exact legacy Clasptek 8-column Cohorts & Schedules Table.
 * Reference: index.html lines 26130–26160 / 26300–26360
 */

'use client';

import React from 'react';
import type { Cohort } from '../../types/academics';

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
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Cohort Code</th>
            <th>Programme</th>
            <th>Dates</th>
            <th>Delivery</th>
            <th>Lead Facilitator</th>
            <th style={{ textAlign: 'center' }}>Capacity &amp; Seats</th>
            <th>Status</th>
            <th style={{ textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
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
                <td style={{ fontSize: '12px' }}>
                  {fmtDate(c.start_date)} &rarr; {fmtDate(c.end_date)}
                </td>
                <td>
                  <span className="cp-pill category-pill">
                    {c.delivery_mode || 'IN_PERSON'}
                  </span>
                </td>
                <td style={{ fontSize: '12.5px' }}>
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
  );
}
