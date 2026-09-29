/**
 * components/programmes/ProgrammeTable.tsx — Phase 4
 * Exact legacy Clasptek 9-column Academic Programmes Table.
 * Reference: index.html lines 26071–26105
 */

'use client';

import React from 'react';
import type { Programme } from '../../types/academics';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';

interface ProgrammeTableProps {
  programmes: Programme[];
  onEdit?: (programme: Programme) => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function ProgrammeTable({ programmes, onEdit }: ProgrammeTableProps) {
  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedProgrammes,
    setPage,
    setPageSize,
  } = usePagination(programmes, {
    initialPageSize: 25,
    resetDeps: [programmes],
  });

  if (programmes.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">🎓</div>
        <div className="cp-empty-title">No programmes catalogued</div>
        <div className="cp-empty-desc">Add Clasptek coaching and tech training programmes.</div>
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
              <th>Code</th>
              <th>Programme Name</th>
              <th>Category</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Duration / Sessions</th>
              <th style={{ textAlign: 'right' }}>Standard Tuition</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Max Discount</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Installments</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProgrammes.map((p) => (
              <tr key={p.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {p.code || p.id}
                </td>
                <td style={{ fontWeight: 700, color: 'var(--primary)', maxWidth: '240px' }} title={p.name}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                </td>
                <td>
                  <span className="cp-pill category-pill">
                    {p.metadata?.category || 'Academic'}
                  </span>
                </td>
                <td className="cp-col-secondary" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {p.duration_weeks ? `${p.duration_weeks} wks` : '—'} &middot;{' '}
                  {p.session_count ? `${p.session_count} sessions` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                  {fmtMoney(p.tuition_fee)}
                </td>
                <td className="cp-col-secondary" style={{ textAlign: 'center', fontSize: '12px' }}>
                  {p.max_discount_pct || 0}%
                </td>
                <td className="cp-col-secondary" style={{ textAlign: 'center', fontSize: '11px' }}>
                  {p.allow_installments !== false ? (
                    <span className="cp-pill paid">
                      {p.installment_first_pct || 50}% / {p.installment_second_pct || 50}%
                    </span>
                  ) : (
                    <span className="cp-pill draft">Full Only</span>
                  )}
                </td>
                <td>
                  <span className={`cp-pill ${(p.status || 'active') === 'active' ? 'active' : 'draft'}`}>
                    {(p.status || 'active').toUpperCase()}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => onEdit && onEdit(p)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile">
        {paginatedProgrammes.map((p) => (
          <div
            key={p.id}
            className="cp-mobile-record-card"
            onClick={() => onEdit && onEdit(p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onEdit && onEdit(p)}
            aria-label={`View programme ${p.name}`}
          >
            <div className="cp-mobile-record-header">
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {p.name}
                </h4>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {p.duration_weeks ? `${p.duration_weeks} wks` : '—'} &bull; {p.session_count ? `${p.session_count} sessions` : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  {p.code || 'PRG-—'}
                </span>
                <span className={`cp-pill ${(p.status || 'active') === 'active' ? 'active' : 'draft'}`} style={{ fontSize: '10px' }}>
                  {(p.status || 'active').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="cp-mobile-record-grid">
              <div className="cp-mobile-record-field">
                <span className="cp-mobile-record-label">Tuition Fee</span>
                <span className="cp-mobile-record-value" style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 800 }}>
                  {fmtMoney(p.tuition_fee)}
                </span>
              </div>
              <div className="cp-mobile-record-field">
                <span className="cp-mobile-record-label">Category</span>
                <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                  {p.metadata?.category || 'Academic'}
                </span>
              </div>
            </div>

            <div className="cp-mobile-record-actions">
              <button
                type="button"
                className="cp-btn sm secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEdit) onEdit(p);
                }}
                style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
              >
                Edit Programme
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Standard Pagination */}
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalRecords={programmes.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        entityLabel="programmes"
      />
    </>
  );
}
