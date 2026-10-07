'use client';

/**
 * components/tables/SortableHeader.tsx
 * Accessible sortable table header component conforming to Clasptek UI design language.
 */

import React from 'react';

export interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort?: string;
  currentOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder = 'asc',
  onSort,
  align = 'left',
  style,
  className = '',
}: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      scope="col"
      className={className}
      onClick={() => onSort?.(field)}
      style={{
        cursor: onSort ? 'pointer' : 'default',
        userSelect: 'none',
        textAlign: align,
        whiteSpace: 'nowrap',
        ...style,
      }}
      title={onSort ? `Sort by ${label} (${isActive && currentOrder === 'asc' ? 'descending' : 'ascending'})` : undefined}
      aria-sort={isActive ? (currentOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          width: '100%',
        }}
      >
        <span>{label}</span>
        {onSort && (
          <span
            aria-hidden="true"
            style={{
              fontSize: '10px',
              lineHeight: 1,
              color: isActive ? 'var(--primary, #0F172A)' : '#94A3B8',
              fontWeight: isActive ? 800 : 400,
            }}
          >
            {isActive ? (currentOrder === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        )}
      </div>
    </th>
  );
}
