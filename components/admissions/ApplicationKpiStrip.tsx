/**
 * components/admissions/ApplicationKpiStrip.tsx — Phase 3
 * KPI metric strip for the Applications management page.
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
  color: string;
  badgeBg: string;
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
      color: 'border-slate-400 text-slate-800',
      badgeBg: 'bg-slate-100 text-slate-700',
      statusFilter: 'ALL',
      icon: '📊',
    },
    {
      label: 'Active Pipeline',
      count: getCount(['NEW', 'REVIEW_REQUIRED', 'MATCHED', 'QUALIFIED']),
      color: 'border-blue-500 text-blue-700',
      badgeBg: 'bg-blue-50 text-blue-700',
      statusFilter: 'ALL',
      icon: '⚡',
    },
    {
      label: 'Needs Review',
      count: getCount(['REVIEW_REQUIRED']),
      color: 'border-amber-500 text-amber-700',
      badgeBg: 'bg-amber-50 text-amber-700',
      statusFilter: 'REVIEW_REQUIRED',
      icon: '⚠️',
    },
    {
      label: 'Ready / Qualified',
      count: getCount(['QUALIFIED', 'MATCHED']),
      color: 'border-indigo-500 text-indigo-700',
      badgeBg: 'bg-indigo-50 text-indigo-700',
      statusFilter: 'QUALIFIED',
      icon: '🎯',
    },
    {
      label: 'Converted',
      count: getCount(['CONVERTED']),
      color: 'border-emerald-500 text-emerald-700',
      badgeBg: 'bg-emerald-50 text-emerald-700',
      statusFilter: 'CONVERTED',
      icon: '🎓',
    },
    {
      label: 'Rejected / Cancelled',
      count: getCount(['REJECTED', 'CANCELLED']),
      color: 'border-rose-400 text-rose-700',
      badgeBg: 'bg-rose-50 text-rose-700',
      statusFilter: 'REJECTED',
      icon: '🚫',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {cards.map((card) => {
        const isSelected = activeStatus === card.statusFilter && card.statusFilter !== 'ALL';
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => onStatusFilter?.(card.statusFilter)}
            className={`bg-white rounded-xl border-l-4 ${card.color} shadow-sm p-3.5 text-left transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
              isSelected ? 'ring-2 ring-blue-500 shadow-md bg-blue-50/20' : ''
            }`}
            aria-label={`Filter by ${card.label}: ${card.count} applications`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-base" aria-hidden="true">{card.icon}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${card.badgeBg}`}>
                {card.label}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-2xl font-extrabold tracking-tight ${card.color.split(' ')[1]}`}>
                {card.count}
              </span>
              <span className="text-[11px] text-gray-400">
                {total > 0 ? `${Math.round((card.count / total) * 100)}%` : '0%'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
