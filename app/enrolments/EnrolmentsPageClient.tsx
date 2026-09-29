/**
 * app/enrolments/EnrolmentsPageClient.tsx — Phase 4
 * Client Component for Course Enrolments.
 * Matches legacy index.html lines 26456–26550.
 */

'use client';

import React, { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Enrolment, Cohort } from '@/types/academics';
import { EnrolmentKpiStrip } from '@/components/enrolments/EnrolmentKpiStrip';
import { EnrolmentFilters } from '@/components/enrolments/EnrolmentFilters';
import { EnrolmentTable } from '@/components/enrolments/EnrolmentTable';
import { Pagination } from '@/components/tables/Pagination';

interface EnrolmentsPageClientProps {
  initialEnrolments: Enrolment[];
  totalCount: number;
  cohorts: Cohort[];
  currentSearch: string;
  currentCohort: string;
  currentStatus: string;
  currentPage: number;
  pageSize: number;
}

export function EnrolmentsPageClient({
  initialEnrolments,
  totalCount,
  cohorts,
  currentSearch,
  currentCohort,
  currentStatus,
  currentPage,
  pageSize,
}: EnrolmentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(newPage));
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', String(newPageSize));
      params.delete('page');
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleFilterUpdate = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with Action — Exact Legacy Styling */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--primary, #0F172A)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span aria-hidden="true">📝</span> Course Enrollments
          </h1>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
            Comprehensive enrolment lifecycle management, immutable agreed tuition snapshots, and academic status tracking.
          </div>
        </div>
        <a
          href="/applications"
          className="cp-btn sm primary"
          id="btnNewEnrolmentBtn"
          style={{ fontWeight: 700, textDecoration: 'none' }}
        >
          + Enrol New Student
        </a>
      </div>

      {/* Top KPI Grid */}
      <EnrolmentKpiStrip enrolments={initialEnrolments} totalCount={totalCount} />

      {/* Main Table Card */}
      <div className="cp-card">
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 800 }}>
              📋 Course Enrollment Register
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Track status transitions, fee snapshots, attendance rates, and credentials.
            </div>
          </div>

          {/* Filter Controls */}
          <EnrolmentFilters
            currentSearch={currentSearch}
            currentCohort={currentCohort}
            currentStatus={currentStatus}
            cohorts={cohorts}
            onSearchChange={(val) => handleFilterUpdate('search', val)}
            onCohortChange={(val) => handleFilterUpdate('cohort', val)}
            onStatusChange={(val) => handleFilterUpdate('status', val)}
          />
        </div>

        {/* Register Table */}
        <EnrolmentTable enrolments={initialEnrolments} />

        {/* Standard Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          entityLabel="enrolments"
        />
      </div>
    </div>
  );
}
