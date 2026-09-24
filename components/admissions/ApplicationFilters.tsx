/**
 * components/admissions/ApplicationFilters.tsx — Phase 3 & 9G
 * Search, status, programme, and source filter controls for the Applications list.
 * Uses genuine .cp-* design system styles.
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
          className="cp-search-input"
          aria-label="Search applications"
        />
      </div>

      {/* Status Filter */}
      <div>
        <label htmlFor="app-status-filter" className="sr-only">
          Status
        </label>
        <select
          id="app-status-filter"
          value={currentStatus || 'ALL'}
          onChange={(e) => updateParam('status', e.target.value)}
          className="cp-filter-select"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Programme Filter */}
      <div>
        <label htmlFor="app-programme-filter" className="sr-only">
          Programme
        </label>
        <select
          id="app-programme-filter"
          value={currentProgramme || ''}
          onChange={(e) => updateParam('programme', e.target.value)}
          className="cp-filter-select"
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
      <div>
        <label htmlFor="app-source-filter" className="sr-only">
          Source
        </label>
        <select
          id="app-source-filter"
          value={currentSource || 'ALL'}
          onChange={(e) => updateParam('source', e.target.value)}
          className="cp-filter-select"
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
          className="cp-btn sm secondary"
          style={{ height: '38px' }}
        >
          <span aria-hidden="true">↺</span> Reset
        </button>
      )}
    </div>
  );
}
