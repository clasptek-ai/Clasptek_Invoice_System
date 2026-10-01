/**
 * app/cohorts/CohortsPageClient.tsx — Phase 4
 * Client Component for Cohorts & Schedules.
 * Matches legacy index.html lines 26236–26360.
 */

'use client';

import React, { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Cohort, Programme } from '@/types/academics';
import { CohortKpiStrip } from '@/components/cohorts/CohortKpiStrip';
import { CohortFilters } from '@/components/cohorts/CohortFilters';
import { CohortTable } from '@/components/cohorts/CohortTable';

interface CohortsPageClientProps {
  initialCohorts: Cohort[];
  programmes: Programme[];
  currentSearch: string;
  currentProg: string;
  currentStatus: string;
}

export function CohortsPageClient({
  initialCohorts,
  programmes,
  currentSearch,
  currentProg,
  currentStatus,
}: CohortsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handleFilterUpdate = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      startTransition(() => router.push(`/cohorts?${params.toString()}`));
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
            <span aria-hidden="true">📅</span> Cohorts &amp; Schedules
          </h1>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
            Authoritative cohort scheduling, seat capacity management, assigned lead facilitators, and training progression.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <a
            href="/enquiries"
            className="cp-btn sm secondary"
            id="btnScheduleTrainingSessionMain"
            style={{ fontWeight: 600, textDecoration: 'none' }}
          >
            Enquiries &amp; Leads
          </a>
          <a
            href="/apply"
            className="cp-btn sm primary"
            id="btnAddNewCohortBtn"
            style={{ fontWeight: 700, textDecoration: 'none' }}
          >
            + Add New Cohort
          </a>
        </div>
      </div>

      {/* Top KPI Grid */}
      <CohortKpiStrip cohorts={initialCohorts} />

      {/* Main Table Card */}
      <div className="cp-card">
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 800 }}>
              🏛️ Scheduled Training Cohorts
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Real-time seat occupancy, delivery schedules, and cohort management.
            </div>
          </div>

          {/* Filter Controls */}
          <CohortFilters
            currentSearch={currentSearch}
            currentProg={currentProg}
            currentStatus={currentStatus}
            programmes={programmes}
            onSearchChange={(val) => handleFilterUpdate('search', val)}
            onProgChange={(val) => handleFilterUpdate('prog', val)}
            onStatusChange={(val) => handleFilterUpdate('status', val)}
          />
        </div>

        {/* Scheduling Table */}
        <CohortTable cohorts={initialCohorts} />
      </div>
    </div>
  );
}
