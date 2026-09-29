/**
 * components/tables/Pagination.tsx
 * Production-ready, responsive, universal Pagination component for Clasptek portal tables.
 *
 * Requirements:
 * - Default: 25 rows per page (Options: 10, 25, 50, 100)
 * - Record counter: "Showing X–Y of Z [label]"
 * - Navigation: [ Previous ] [ 1 ] [ 2 ] ... [ Next ]
 * - First/Last disabled state
 * - Page size selector: "Rows per page: [ 25 ▼ ]"
 * - Compact ellipsis for large page counts
 * - Responsive layout for mobile, tablet, desktop, and Windows 125% DPI
 * - Strictly preserves existing Clasptek cp-* visual tokens
 */

'use client';

import React from 'react';

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalCount?: number;
  totalRecords?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  entityLabel?: string;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  pageSize,
  totalCount: explicitTotalCount,
  totalRecords: explicitTotalRecords,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  entityLabel = 'records',
  disabled = false,
}: PaginationProps) {
  const totalCount = explicitTotalCount ?? explicitTotalRecords ?? 0;
  if (totalCount <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const fromRecord = (safeCurrentPage - 1) * pageSize + 1;
  const toRecord = Math.min(safeCurrentPage * pageSize, totalCount);

  // Generate page numbers with smart ellipsis
  const getPageItems = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages];
    }

    if (safeCurrentPage >= totalPages - 3) {
      return [1, 'ellipsis-start', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [
      1,
      'ellipsis-start',
      safeCurrentPage - 1,
      safeCurrentPage,
      safeCurrentPage + 1,
      'ellipsis-end',
      totalPages,
    ];
  };

  const pageItems = getPageItems();

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (onPageSizeChange && !isNaN(newSize)) {
      onPageSizeChange(newSize);
    }
  };

  return (
    <div
      className="cp-pagination-footer"
      style={{
        padding: '12px 18px',
        background: 'var(--surface-1, #f8fafc)',
        borderTop: '1px solid var(--border, #e2e8f0)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '12.5px',
        color: 'var(--text-muted, #64748b)',
      }}
      aria-label="Table pagination"
    >
      <style>{`
        .cp-pagination-nav-desktop {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .cp-pagination-nav-mobile {
          display: none;
        }
        @media (max-width: 680px) {
          .cp-pagination-footer {
            flex-direction: column;
            align-items: stretch !important;
            gap: 10px;
          }
          .cp-pagination-info-group {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
          }
          .cp-pagination-nav-desktop {
            display: none !important;
          }
          .cp-pagination-nav-mobile {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            width: 100%;
          }
        }
      `}</style>

      {/* Left: Summary text + Rows per page */}
      <div
        className="cp-pagination-info-group"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ whiteSpace: 'nowrap' }}>
          Showing{' '}
          <span style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
            {fromRecord}–{toRecord}
          </span>{' '}
          of{' '}
          <span style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
            {totalCount.toLocaleString()}
          </span>{' '}
          {entityLabel}
        </div>

        {onPageSizeChange && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <label
              htmlFor="cp-page-size-select"
              style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}
            >
              Rows per page:
            </label>
            <select
              id="cp-page-size-select"
              value={pageSize}
              onChange={handlePageSizeChange}
              disabled={disabled}
              className="cp-input"
              style={{
                height: '28px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '5px',
                background: 'var(--surface-0, #ffffff)',
                border: '1px solid var(--border, #cbd5e1)',
                color: 'var(--text-primary, #0f172a)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              aria-label="Select rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right (Desktop/Tablet): [ Previous ] [ 1 ] [ 2 ] ... [ Next ] */}
      <nav
        className="cp-pagination-nav-desktop"
        aria-label="Pagination Navigation"
      >
        <button
          type="button"
          disabled={disabled || safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          className="cp-btn sm secondary"
          style={{
            minWidth: '72px',
            padding: '3px 10px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: disabled || safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: disabled || safeCurrentPage <= 1 ? 0.5 : 1,
          }}
          aria-label="Previous page"
        >
          Previous
        </button>

        {pageItems.map((item, idx) => {
          if (typeof item === 'string') {
            return (
              <span
                key={`ellipsis-${idx}`}
                style={{
                  padding: '0 6px',
                  color: 'var(--text-muted, #94a3b8)',
                  fontWeight: 600,
                  userSelect: 'none',
                }}
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          const isCurrent = item === safeCurrentPage;
          return (
            <button
              key={item}
              type="button"
              disabled={disabled || isCurrent}
              onClick={() => onPageChange(item)}
              className={isCurrent ? 'cp-btn sm primary' : 'cp-btn sm secondary'}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '2px 8px',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: '12px',
                cursor: disabled || isCurrent ? 'default' : 'pointer',
              }}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={`Page ${item}`}
            >
              {item}
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled || safeCurrentPage >= totalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          className="cp-btn sm secondary"
          style={{
            minWidth: '60px',
            padding: '3px 10px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: disabled || safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: disabled || safeCurrentPage >= totalPages ? 0.5 : 1,
          }}
          aria-label="Next page"
        >
          Next
        </button>
      </nav>

      {/* Right (Mobile compact layout): [ ← Previous ] Page X of Y [ Next → ] */}
      <nav
        className="cp-pagination-nav-mobile"
        aria-label="Pagination Navigation Mobile"
      >
        <button
          type="button"
          disabled={disabled || safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          className="cp-btn sm secondary"
          style={{
            padding: '4px 12px',
            fontWeight: 600,
            fontSize: '12px',
            opacity: disabled || safeCurrentPage <= 1 ? 0.5 : 1,
          }}
          aria-label="Previous page"
        >
          ← Previous
        </button>

        <span
          style={{
            fontWeight: 600,
            fontSize: '12px',
            color: 'var(--text-primary, #0f172a)',
          }}
        >
          Page {safeCurrentPage} of {totalPages}
        </span>

        <button
          type="button"
          disabled={disabled || safeCurrentPage >= totalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          className="cp-btn sm secondary"
          style={{
            padding: '4px 12px',
            fontWeight: 600,
            fontSize: '12px',
            opacity: disabled || safeCurrentPage >= totalPages ? 0.5 : 1,
          }}
          aria-label="Next page"
        >
          Next →
        </button>
      </nav>
    </div>
  );
}
