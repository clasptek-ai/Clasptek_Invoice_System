/**
 * components/admissions/EnquiryFilters.tsx — Phase 3
 * Search + status filter bar for the Enquiries list.
 * Uses URL search params for shareable / bookmarkable filters.
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
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      {/* Search */}
      <div className="flex-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true">
          🔍
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
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
          aria-label="Search enquiries"
        />
      </div>

      {/* Status */}
      <div className="w-full sm:w-52">
        <label htmlFor="enquiry-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="enquiry-status-filter"
          defaultValue={currentStatus || 'all'}
          onChange={(e) => updateParam('status', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
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
