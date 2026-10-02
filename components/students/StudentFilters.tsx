/**
 * components/students/StudentFilters.tsx — Phase 4
 * Responsive toolbar supporting comprehensive directory filtering:
 * Search, Programme, Enrolment Status, Financial Status, and Training Status.
 */

'use client';

import React from 'react';
import type { ProgrammeOption } from '@/types/admissions';

interface StudentFiltersProps {
  currentSearch: string;
  currentStatus?: string;
  currentProgrammeId?: string;
  currentEnrolmentStatus?: string;
  currentFinancialStatus?: string;
  programmes?: ProgrammeOption[];
  onSearchChange: (search: string) => void;
  onStatusChange?: (status: string) => void;
  onProgrammeChange?: (progId: string) => void;
  onEnrolmentStatusChange?: (status: string) => void;
  onFinancialStatusChange?: (status: string) => void;
  onClearFilters?: () => void;
}

export function StudentFilters({
  currentSearch,
  currentStatus = 'ALL',
  currentProgrammeId = 'ALL',
  currentEnrolmentStatus = 'ALL',
  currentFinancialStatus = 'ALL',
  programmes = [],
  onSearchChange,
  onStatusChange,
  onProgrammeChange,
  onEnrolmentStatusChange,
  onFinancialStatusChange,
  onClearFilters,
}: StudentFiltersProps) {
  const hasActiveFilters =
    Boolean(currentSearch.trim()) ||
    currentStatus !== 'ALL' ||
    currentProgrammeId !== 'ALL' ||
    currentEnrolmentStatus !== 'ALL' ||
    currentFinancialStatus !== 'ALL';

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
      {/* Search Input */}
      <div className="cp-field" style={{ flex: '2 1 240px', minWidth: '180px', margin: 0 }}>
        <input
          type="text"
          id="accountSearchInput"
          placeholder="Search by name, student ID, phone, email..."
          value={currentSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          className="cp-input"
          style={{ width: '100%', fontSize: '13px' }}
        />
      </div>

      {/* Programme Filter */}
      {onProgrammeChange && (
        <div className="cp-field" style={{ flex: '1 1 180px', minWidth: '140px', margin: 0 }}>
          <select
            id="studentProgrammeFilter"
            value={currentProgrammeId}
            onChange={(e) => onProgrammeChange(e.target.value)}
            className="cp-input"
            style={{ width: '100%', fontSize: '13px' }}
            aria-label="Filter students by programme"
          >
            <option value="ALL">All Programmes</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Enrolment Status Filter */}
      {onEnrolmentStatusChange && (
        <div className="cp-field" style={{ flex: '1 1 150px', minWidth: '130px', margin: 0 }}>
          <select
            id="studentEnrolmentFilter"
            value={currentEnrolmentStatus}
            onChange={(e) => onEnrolmentStatusChange(e.target.value)}
            className="cp-input"
            style={{ width: '100%', fontSize: '13px' }}
            aria-label="Filter students by enrolment status"
          >
            <option value="ALL">All Enrolments</option>
            <option value="ENROLLED">Enrolled</option>
            <option value="NOT_ENROLLED">Not Enrolled</option>
          </select>
        </div>
      )}

      {/* Financial Status Filter */}
      {onFinancialStatusChange && (
        <div className="cp-field" style={{ flex: '1 1 160px', minWidth: '140px', margin: 0 }}>
          <select
            id="studentFinancialFilter"
            value={currentFinancialStatus}
            onChange={(e) => onFinancialStatusChange(e.target.value)}
            className="cp-input"
            style={{ width: '100%', fontSize: '13px' }}
            aria-label="Filter students by financial status"
          >
            <option value="ALL">All Financial</option>
            <option value="FULLY_PAID">Fully Paid</option>
            <option value="PARTIALLY_PAID">Partial Balance</option>
            <option value="UNPAID">Outstanding</option>
            <option value="NO_INVOICE">No Invoice</option>
          </select>
        </div>
      )}

      {/* Training Status Filter */}
      {onStatusChange && (
        <div className="cp-field" style={{ flex: '1 1 140px', minWidth: '120px', margin: 0 }}>
          <select
            id="studentStatusFilter"
            value={currentStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="cp-input"
            style={{ width: '100%', fontSize: '13px' }}
            aria-label="Filter students by training status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="cp-btn cp-btn-secondary"
          style={{
            fontSize: '12px',
            padding: '7px 12px',
            height: '36px',
            alignSelf: 'center',
            whiteSpace: 'nowrap',
          }}
          title="Reset all active filters"
        >
          ✕ Clear Filters
        </button>
      )}
    </div>
  );
}
