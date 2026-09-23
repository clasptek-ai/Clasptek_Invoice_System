/**
 * components/enrolments/EnrolmentFilters.tsx — Phase 4
 * Search, cohort, and status filters matching legacy index.html lines 26503–26519.
 */

'use client';

import React from 'react';
import type { Cohort } from '@/types/academics';

interface EnrolmentFiltersProps {
  currentSearch: string;
  currentCohort: string;
  currentStatus: string;
  cohorts: Cohort[];
  onSearchChange: (val: string) => void;
  onCohortChange: (val: string) => void;
  onStatusChange: (val: string) => void;
}

export function EnrolmentFilters({
  currentSearch,
  currentCohort,
  currentStatus,
  cohorts,
  onSearchChange,
  onCohortChange,
  onStatusChange,
}: EnrolmentFiltersProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
      <input
        type="text"
        id="enrolSearchInput"
        className="cp-input"
        style={{ width: '220px', fontSize: '12px' }}
        placeholder="Search student or enrolment..."
        value={currentSearch}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        id="enrolCohortFilter"
        className="cp-input"
        style={{ fontSize: '12px', minWidth: '160px' }}
        value={currentCohort}
        onChange={(e) => onCohortChange(e.target.value)}
      >
        <option value="ALL">All Cohorts</option>
        {cohorts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.cohort_code || c.id} &mdash; {c.name}
          </option>
        ))}
      </select>
      <select
        id="enrolStatusFilter"
        className="cp-input"
        style={{ fontSize: '12px' }}
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="ALL">All Statuses</option>
        <option value="PENDING_PAYMENT">Pending Payment</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        <option value="DEFERRED">Deferred</option>
        <option value="WITHDRAWN">Withdrawn</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
    </div>
  );
}
