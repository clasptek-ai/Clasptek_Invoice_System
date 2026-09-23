/**
 * components/students/StudentFilters.tsx — Phase 4
 * Search filter input matching legacy index.html line 24681.
 */

'use client';

import React from 'react';

interface StudentFiltersProps {
  currentSearch: string;
  onSearchChange: (search: string) => void;
}

export function StudentFilters({ currentSearch, onSearchChange }: StudentFiltersProps) {
  return (
    <div className="cp-field" style={{ maxWidth: '360px', marginBottom: '14px' }}>
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
  );
}
