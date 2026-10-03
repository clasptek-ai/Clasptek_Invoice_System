/**
 * components/programmes/ProgrammeTable.tsx — Phase 4
 * Academic Programmes Catalogue Table with data-management controls:
 * - Multi-row selection & select-all
 * - Action buttons: Edit and Deactivate
 * - Responsive desktop/tablet table and mobile cards
 */

'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Programme } from '@/types/academics';
import { Pagination } from '@/components/tables/Pagination';

interface ProgrammeTableProps {
  programmes: Programme[];
  onEdit?: (programme: Programme) => void;
  onDeactivateProgramme?: (programme: Programme) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  canEdit?: boolean;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function ProgrammeTable({
  programmes,
  onEdit,
  onDeactivateProgramme,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false,
  canEdit = true,
}: ProgrammeTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const paginatedProgrammes = useMemo(() => {
    const from = (currentPage - 1) * pageSize;
    return programmes.slice(from, from + pageSize);
  }, [programmes, currentPage, pageSize]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = paginatedProgrammes.filter((p) => selectedIds.has(p.id)).length;
      const isIndeterminate = selectedCount > 0 && selectedCount < paginatedProgrammes.length;
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIds, paginatedProgrammes]);

  if (programmes.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">🎓</div>
        <div className="cp-empty-title">No programmes configured</div>
        <div className="cp-empty-desc">Add Clasptek coaching and tech training programmes.</div>
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
                    aria-label="Select all visible programmes"
                    style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                  />
                </th>
              )}
              <th>Code</th>
              <th>Programme Name</th>
              <th>Category</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Duration / Sessions</th>
              <th style={{ textAlign: 'right' }}>Standard Tuition</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Max Discount</th>
              <th className="cp-col-secondary" style={{ textAlign: 'center' }}>Installments</th>
              <th>Status</th>
              <th style={{ textAlign: 'center', minWidth: '110px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProgrammes.map((p) => {
              const isChecked = selectedIds.has(p.id);

              return (
                <tr
                  key={p.id}
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
                        onChange={() => onToggleSelect(p.id)}
                        aria-label={`Select ${p.name}`}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </td>
                  )}

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
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={() => onEdit && onEdit(p)}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Edit
                      </button>
                      {canEdit && onDeactivateProgramme && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={() => onDeactivateProgramme(p)}
                          style={{ padding: '3px 6px', fontSize: '11px', color: '#DC2626' }}
                          title="Deactivate Programme"
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
        {paginatedProgrammes.map((p) => {
          const isChecked = selectedIds.has(p.id);

          return (
            <div
              key={p.id}
              className="cp-mobile-record-card"
              style={{
                border: isChecked ? '1px solid #3B82F6' : undefined,
                backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.03)' : undefined,
              }}
            >
              <div className="cp-mobile-record-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(p.id)}
                      aria-label={`Select ${p.name}`}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                  )}
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {p.name}
                    </h4>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {p.duration_weeks ? `${p.duration_weeks} wks` : '—'} &bull; {p.session_count ? `${p.session_count} sessions` : '—'}
                    </div>
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

              <div className="cp-mobile-record-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' }}>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tuition Fee</span>
                  <span className="cp-mobile-record-value" style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 800, display: 'block' }}>
                    {fmtMoney(p.tuition_fee)}
                  </span>
                </div>
                <div className="cp-mobile-record-field">
                  <span className="cp-mobile-record-label" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Category</span>
                  <span className="cp-mobile-record-value" style={{ fontWeight: 600, display: 'block', fontSize: '12px' }}>
                    {p.metadata?.category || 'Academic'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={() => onEdit && onEdit(p)}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                >
                  Edit
                </button>
                {canEdit && onDeactivateProgramme && (
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => onDeactivateProgramme(p)}
                    style={{ padding: '2px 6px', fontSize: '11px', color: '#DC2626' }}
                  >
                    🛑 Deactivate
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
        totalCount={programmes.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        entityLabel="programmes"
      />
    </>
  );
}
