/**
 * components/programmes/ProgrammeTable.tsx — Phase 4
 * Exact legacy Clasptek 9-column Academic Programmes Table.
 * Reference: index.html lines 26071–26105
 */

'use client';

import React from 'react';
import type { Programme } from '@/types/academics';

interface ProgrammeTableProps {
  programmes: Programme[];
  onEdit?: (programme: Programme) => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

export function ProgrammeTable({ programmes, onEdit }: ProgrammeTableProps) {
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
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Programme Name</th>
            <th>Category</th>
            <th style={{ textAlign: 'center' }}>Duration / Sessions</th>
            <th style={{ textAlign: 'right' }}>Standard Tuition</th>
            <th style={{ textAlign: 'center' }}>Max Discount</th>
            <th style={{ textAlign: 'center' }}>Installments</th>
            <th>Status</th>
            <th style={{ textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {programmes.map((p) => (
            <tr key={p.id}>
              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {p.code || p.id}
              </td>
              <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {p.name}
              </td>
              <td>
                <span className="cp-pill category-pill">
                  {p.metadata?.category || 'Academic'}
                </span>
              </td>
              <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {p.duration_weeks ? `${p.duration_weeks} wks` : '—'} &middot;{' '}
                {p.session_count ? `${p.session_count} sessions` : '—'}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                {fmtMoney(p.tuition_fee)}
              </td>
              <td style={{ textAlign: 'center', fontSize: '12px' }}>
                {p.max_discount_pct || 0}%
              </td>
              <td style={{ textAlign: 'center', fontSize: '11px' }}>
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
  );
}
