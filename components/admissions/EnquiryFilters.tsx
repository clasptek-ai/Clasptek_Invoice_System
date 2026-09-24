/**
 * components/admissions/EnquiryFilters.tsx — Phase 3 & 9G
 * Search + status filter bar for the Enquiries list.
 * Uses genuine .cp-* design system styles.
 */

'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const ENQUIRY_STATUSES: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'ENROLLED', label: 'Enrolled' },
  { value: 'LOST', label: 'Lost' },
];

interface EnquiryFiltersProps {
  currentSearch: string;
  currentStatus: string;
}

export function EnquiryFilters({ currentSearch, currentStatus }: EnquiryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all' && value !== '') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page'); // reset pagination on filter change
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="cp-filter-bar">
      {/* Search */}
      <div className="cp-search-wrap">
        <span className="cp-search-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          id="enquiry-search"
          name="enquiry-search"
          placeholder="Search by name, email, phone, programme..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const val = e.target.value;
            // Debounce: wait until user stops typing for 400ms
            clearTimeout((window as typeof window & { __enqSearchTimer?: ReturnType<typeof setTimeout> }).__enqSearchTimer);
            (window as typeof window & { __enqSearchTimer?: ReturnType<typeof setTimeout> }).__enqSearchTimer = setTimeout(() => {
              updateParam('search', val);
            }, 400);
          }}
          className="cp-search-input"
          aria-label="Search enquiries"
        />
      </div>

      {/* Status */}
      <div>
        <label htmlFor="enquiry-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="enquiry-status-filter"
          defaultValue={currentStatus || 'all'}
          onChange={(e) => updateParam('status', e.target.value)}
          className="cp-filter-select"
        >
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
