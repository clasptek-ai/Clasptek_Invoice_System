/**
 * components/students/StudentFilters.tsx — Phase 4
 * Search filter input matching legacy index.html line 24681.
 */

'use client';

import React from 'react';

interface StudentFiltersProps {
  currentSearch: string;
  currentStatus?: string;
  onSearchChange: (search: string) => void;
  onStatusChange?: (status: string) => void;
}

export function StudentFilters({
  currentSearch,
  currentStatus = 'ALL',
  onSearchChange,
  onStatusChange,
}: StudentFiltersProps) {
  return (
    <div
      className="student-filters-toolbar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '14px',
      }}
    >
      <div className="cp-field" style={{ flex: '1 1 260px', minWidth: '200px', maxWidth: '420px', margin: 0 }}>
        <input
          type="text"
          id="accountSearchInput"
          placeholder="Filter by name, student ID, phone, email, programme..."
          value={currentSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          className="cp-input"
          style={{ width: '100%', fontSize: '13px' }}
        />
      </div>

      {onStatusChange && (
        <div className="cp-field" style={{ flex: '0 1 180px', minWidth: '140px', margin: 0 }}>
          <select
            id="studentStatusFilter"
            value={currentStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="cp-input"
            style={{ width: '100%', fontSize: '13px' }}
            aria-label="Filter students by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      )}
    </div>
  );
}
