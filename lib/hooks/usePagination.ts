/**
 * lib/hooks/usePagination.ts
 * Standard client-side pagination hook implementing the Clasptek pagination standard:
 *  - Default page size: 25 (Options: 10, 25, 50, 100)
 *  - Reset to page 1 on filter/search dependency change
 *  - Calculates slice range, total pages, and handles page size transitions safely.
 */

'use client';

import { useState, useMemo, useEffect } from 'react';

export interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  resetDeps?: unknown[];
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
) {
  const { initialPage = 1, initialPageSize = 25, resetDeps = [] } = options;

  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // Reset to page 1 whenever search, filters, or dependencies change
  useEffect(() => {
    setCurrentPage(1);
  }, resetDeps);

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Ensure currentPage doesn't exceed totalPages when items or pageSize changes
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    const fromIndex = (safeCurrentPage - 1) * pageSize;
    const toIndex = fromIndex + pageSize;
    return items.slice(fromIndex, toIndex);
  }, [items, safeCurrentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    // Calculate new total pages with the new page size
    const newTotalPages = Math.max(1, Math.ceil(totalCount / newPageSize));
    if (safeCurrentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  };

  return {
    currentPage: safeCurrentPage,
    pageSize,
    totalCount,
    totalRecords: totalCount,
    totalPages,
    paginatedItems,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
  };
}
