/**
 * components/tables/TableSelectionBar.tsx
 * Canonical portal-wide multi-row selection toolbar.
 * Strictly adheres to Clasptek cp-* visual tokens and responsive conventions.
 */

'use client';

import React from 'react';

export interface TableSelectionBarProps {
  selectedCount: number;
  totalVisibleCount?: number;
  entityLabel?: string;
  onClearSelection: () => void;
  onSelectAllVisible?: () => void;
  isAllSelected?: boolean;
  children?: React.ReactNode;
}

export function TableSelectionBar({
  selectedCount,
  totalVisibleCount,
  entityLabel = 'record',
  onClearSelection,
  onSelectAllVisible,
  isAllSelected: _isAllSelected,
  children,
}: TableSelectionBarProps) {
  if (selectedCount <= 0) return null;

  const pluralLabel = selectedCount === 1 ? entityLabel : `${entityLabel}s`;

  return (
    <div
      className="cp-selection-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        backgroundColor: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: '8px',
        marginBottom: '14px',
        flexWrap: 'wrap',
        gap: '10px',
        animation: 'fadeIn 0.2s ease-in-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1E40AF', fontWeight: 600 }}>
        <span>☑️</span>
        <span>
          <strong>{selectedCount}</strong> {pluralLabel} selected
          {totalVisibleCount !== undefined && totalVisibleCount > selectedCount && (
            <span style={{ fontWeight: 400, color: '#3B82F6', marginLeft: '6px' }}>
              (of {totalVisibleCount} visible)
            </span>
          )}
        </span>
        {onSelectAllVisible && totalVisibleCount && selectedCount < totalVisibleCount && (
          <button
            type="button"
            onClick={onSelectAllVisible}
            className="cp-btn sm secondary"
            style={{
              fontSize: '11.5px',
              padding: '2px 8px',
              background: '#FFFFFF',
              border: '1px solid #93C5FD',
              color: '#1D4ED8',
              marginLeft: '4px',
              cursor: 'pointer',
            }}
          >
            Select All {totalVisibleCount} Visible
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onClearSelection}
          className="cp-btn sm secondary"
          style={{ fontSize: '12px', padding: '4px 10px', cursor: 'pointer' }}
        >
          Clear Selection
        </button>
        {children}
      </div>
    </div>
  );
}
