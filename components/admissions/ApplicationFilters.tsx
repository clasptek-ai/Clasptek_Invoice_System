/**
 * components/admissions/ApplicationFilters.tsx — Phase 3
 * Search, status, programme, and source filter controls for the Applications list.
 */

'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { ProgrammeOption } from '@/types/admissions';

const APPLICATION_STATUSES = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'REVIEW_REQUIRED', label: 'Review Required' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const APPLICATION_SOURCES = [
  { value: 'ALL', label: 'All Sources' },
  { value: 'WEB_INTAKE', label: 'Web Form' },
  { value: 'GOOGLE_FORM', label: 'Google Forms' },
  { value: 'STAFF_ENTRY', label: 'Staff Entry' },
  { value: 'PORTAL', label: 'Applicant Portal' },
];

interface ApplicationFiltersProps {
  currentSearch: string;
  currentStatus: string;
  currentProgramme: string;
  currentSource: string;
  programmes: ProgrammeOption[];
}

export function ApplicationFilters({
  currentSearch,
  currentStatus,
  currentProgramme,
  currentSource,
  programmes,
}: ApplicationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL' && value !== '') {
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

  const handleReset = useCallback(() => {
    startTransition(() => {
      router.push(pathname);
    });
  }, [router, pathname]);

  const hasActiveFilters = Boolean(
    currentSearch ||
      (currentStatus && currentStatus !== 'ALL') ||
      currentProgramme ||
      (currentSource && currentSource !== 'ALL')
  );

  return (
    <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm mb-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
      {/* Search */}
      <div className="flex-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          id="app-search"
          name="app-search"
          placeholder="Search by app #, name, email, phone..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const val = e.target.value;
            clearTimeout((window as typeof window & { __appSearchTimer?: ReturnType<typeof setTimeout> }).__appSearchTimer);
            (window as typeof window & { __appSearchTimer?: ReturnType<typeof setTimeout> }).__appSearchTimer = setTimeout(() => {
              updateParam('search', val);
            }, 350);
          }}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50/50 hover:bg-white transition-colors"
          aria-label="Search applications"
        />
      </div>

      {/* Status Filter */}
      <div className="w-full sm:w-44">
        <label htmlFor="app-status-filter" className="sr-only">
          Status
        </label>
        <select
          id="app-status-filter"
          value={currentStatus || 'ALL'}
          onChange={(e) => updateParam('status', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50/50 hover:bg-white transition-colors"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Programme Filter */}
      <div className="w-full sm:w-48">
        <label htmlFor="app-programme-filter" className="sr-only">
          Programme
        </label>
        <select
          id="app-programme-filter"
          value={currentProgramme || ''}
          onChange={(e) => updateParam('programme', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50/50 hover:bg-white transition-colors truncate"
        >
          <option value="">All Programmes</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Source Filter */}
      <div className="w-full sm:w-40">
        <label htmlFor="app-source-filter" className="sr-only">
          Source
        </label>
        <select
          id="app-source-filter"
          value={currentSource || 'ALL'}
          onChange={(e) => updateParam('source', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50/50 hover:bg-white transition-colors"
        >
          {APPLICATION_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reset Button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap self-stretch sm:self-auto flex items-center justify-center gap-1"
        >
          <span aria-hidden="true">↺</span> Reset
        </button>
      )}
    </div>
  );
}
