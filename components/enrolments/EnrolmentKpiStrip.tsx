/**
 * components/enrolments/EnrolmentKpiStrip.tsx — Phase 4
 * Exact legacy Clasptek 4-card KPI strip.
 * Reference: index.html lines 26471–26492
 */

'use client';

import React from 'react';
import type { Enrolment } from '@/types/academics';

interface EnrolmentKpiStripProps {
  enrolments: Enrolment[];
  totalCount: number;
}

export function EnrolmentKpiStrip({ enrolments, totalCount }: EnrolmentKpiStripProps) {
  const activeCount = enrolments.filter((e) => e.status === 'ACTIVE').length;
  const confirmedCount = enrolments.filter((e) => e.status === 'CONFIRMED').length;
  const completedCount = enrolments.filter((e) => e.status === 'COMPLETED').length;

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
        <div className="cp-kpi-label">Total Enrolments</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--primary)' }}>
          {totalCount}
        </div>
        <div className="cp-kpi-sub">Across All Cohorts</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Active Training</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--success)' }}>
          {activeCount}
        </div>
        <div className="cp-kpi-sub">Currently Attending Sessions</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Confirmed Registrations</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--accent)' }}>
          {confirmedCount}
        </div>
        <div className="cp-kpi-sub">Seats Locked &amp; Ready</div>
      </div>
      <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
        <div className="cp-kpi-label">Completed Training</div>
        <div className="cp-kpi-val" style={{ fontSize: '20px', color: 'var(--primary)' }}>
          {completedCount}
        </div>
        <div className="cp-kpi-sub">Graduated Candidates</div>
      </div>
    </div>
  );
}
