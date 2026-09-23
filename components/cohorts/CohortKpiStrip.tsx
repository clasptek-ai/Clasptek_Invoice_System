/**
 * components/cohorts/CohortKpiStrip.tsx — Phase 4
 * Exact legacy Clasptek 4-card Cohorts KPI strip.
 * Reference: index.html lines 26254–26275
 */

'use client';

import React from 'react';
import type { Cohort } from '@/types/academics';

interface CohortKpiStripProps {
  cohorts: Cohort[];
}

export function CohortKpiStrip({ cohorts }: CohortKpiStripProps) {
  const activeCount = cohorts.filter((c) => c.status === 'IN_PROGRESS').length;
  const upcomingCount = cohorts.filter((c) => c.status === 'UPCOMING').length;
  const completedCount = cohorts.filter((c) => c.status === 'COMPLETED').length;

  const totalSeats = cohorts.reduce((sum, c) => sum + Number(c.capacity || 25), 0);
  const enrolledSeats = cohorts.reduce((sum, c) => sum + Number(c.enrolled_count || 0), 0);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '18px',
      }}
    >
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Total Cohorts</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--primary)' }}>
          {cohorts.length}
        </div>
        <div className="cp-kpi-sub">{totalSeats} Total Seats Across Catalog</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Active / In Progress</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--success)' }}>
          {activeCount}
        </div>
        <div className="cp-kpi-sub">Currently Delivering Training</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Upcoming Cohorts</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--accent)' }}>
          {upcomingCount}
        </div>
        <div className="cp-kpi-sub">Admissions &amp; Enrolment Open</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Total Enrolled Seats</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--primary)' }}>
          {enrolledSeats}
        </div>
        <div className="cp-kpi-sub">{completedCount} Completed Cohorts</div>
      </div>
    </div>
  );
}
