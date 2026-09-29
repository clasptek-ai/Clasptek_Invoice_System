/**
 * components/cohorts/CohortFilters.tsx — Phase 4
 * Search, Programme filter, and Status filter matching legacy index.html lines 26286–26299.
 */

'use client';

import React from 'react';
import type { Programme } from '../../types/academics';

interface CohortFiltersProps {
  currentSearch: string;
  currentProg: string;
  currentStatus: string;
  programmes: Programme[];
  onSearchChange: (val: string) => void;
  onProgChange: (val: string) => void;
  onStatusChange: (val: string) => void;
}

export function CohortFilters({
  currentSearch,
  currentProg,
  currentStatus,
  programmes,
  onSearchChange,
  onProgChange,
  onStatusChange,
}: CohortFiltersProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
      <input
        type="text"
        id="cohortSearchInput"
        className="cp-input"
        style={{ width: '180px', fontSize: '12px' }}
        placeholder="Search cohorts..."
        value={currentSearch}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        id="cohortProgFilter"
        className="cp-input"
        style={{ fontSize: '12px' }}
        value={currentProg}
        onChange={(e) => onProgChange(e.target.value)}
      >
        <option value="ALL">All Programmes</option>
        {programmes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        id="cohortStatusFilter"
        className="cp-input"
        style={{ fontSize: '12px' }}
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="ALL">All Statuses</option>
        <option value="UPCOMING">Upcoming</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
    </div>
  );
}
