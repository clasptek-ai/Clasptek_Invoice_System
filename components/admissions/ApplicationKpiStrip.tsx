/**
 * components/admissions/ApplicationKpiStrip.tsx — Phase 3 & 9G
 * KPI metric strip for the Applications management page.
 * Uses genuine .cp-kpi-grid and .cp-kpi-card design system classes.
 */

'use client';

import type { IntakeApplication, ApplicationStatus } from '@/types/admissions';

interface ApplicationKpiStripProps {
  applications: IntakeApplication[];
  totalCount: number;
  statusCounts?: Record<string, number>;
  onStatusFilter?: (status: string) => void;
  activeStatus?: string;
}

interface KpiCard {
  label: string;
  count: number;
  statusFilter: string;
  icon: React.ReactNode;
}

export function ApplicationKpiStrip({
  applications,
  totalCount,
  statusCounts,
  onStatusFilter,
  activeStatus,
}: ApplicationKpiStripProps) {
  // Use aggregated counts if available, otherwise compute from local list
  const getCount = (statuses: ApplicationStatus[]) => {
    if (statusCounts && Object.keys(statusCounts).length > 0) {
      return statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);
    }
    return applications.filter((a) => statuses.includes(a.status)).length;
  };

  const total = statusCounts && Object.keys(statusCounts).length > 0
    ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
    : totalCount || applications.length;

  const cards: KpiCard[] = [
    {
      label: 'Total Intake',
      count: total,
      statusFilter: 'ALL',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary, #14213D)' }} aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      label: 'Active Pipeline',
      count: getCount(['NEW', 'REVIEW_REQUIRED', 'MATCHED', 'QUALIFIED']),
      statusFilter: 'ALL',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--interactive, #1D4ED8)' }} aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      label: 'Needs Review',
      count: getCount(['REVIEW_REQUIRED']),
      statusFilter: 'REVIEW_REQUIRED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--warning, #D97706)' }} aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      label: 'Ready / Qualified',
      count: getCount(['QUALIFIED', 'MATCHED']),
      statusFilter: 'QUALIFIED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--info, #0284C7)' }} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      label: 'Converted',
      count: getCount(['CONVERTED']),
      statusFilter: 'CONVERTED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success, #059669)' }} aria-hidden="true">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      ),
    },
    {
      label: 'Rejected / Cancelled',
      count: getCount(['REJECTED', 'CANCELLED']),
      statusFilter: 'REJECTED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--danger, #DC2626)' }} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      ),
    },
  ];

  return (
    <div className="cp-kpi-grid" style={{ marginBottom: '20px' }}>
      {cards.map((card) => {
        const isSelected = activeStatus === card.statusFilter && card.statusFilter !== 'ALL';
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => onStatusFilter?.(card.statusFilter)}
            className={`cp-kpi-card ${isSelected ? 'active' : ''}`}
            style={isSelected ? { borderColor: 'var(--interactive)', boxShadow: '0 0 0 2px rgba(2, 132, 199, 0.25)', background: 'var(--surface-1)' } : undefined}
            aria-label={`Filter by ${card.label}: ${card.count} applications`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>{card.icon}</span>
              <span className="cp-kpi-label">{card.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="cp-kpi-val" style={{ color: 'var(--text-primary, #0F172A)' }}>
                {card.count}
              </span>
              <span className="cp-kpi-sub">
                {total > 0 ? `${Math.round((card.count / total) * 100)}%` : '0%'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
