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
  icon: string;
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
      icon: '📊',
    },
    {
      label: 'Active Pipeline',
      count: getCount(['NEW', 'REVIEW_REQUIRED', 'MATCHED', 'QUALIFIED']),
      statusFilter: 'ALL',
      icon: '⚡',
    },
    {
      label: 'Needs Review',
      count: getCount(['REVIEW_REQUIRED']),
      statusFilter: 'REVIEW_REQUIRED',
      icon: '⚠️',
    },
    {
      label: 'Ready / Qualified',
      count: getCount(['QUALIFIED', 'MATCHED']),
      statusFilter: 'QUALIFIED',
      icon: '🎯',
    },
    {
      label: 'Converted',
      count: getCount(['CONVERTED']),
      statusFilter: 'CONVERTED',
      icon: '🎓',
    },
    {
      label: 'Rejected / Cancelled',
      count: getCount(['REJECTED', 'CANCELLED']),
      statusFilter: 'REJECTED',
      icon: '🚫',
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
              <span aria-hidden="true" style={{ fontSize: '16px' }}>{card.icon}</span>
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
