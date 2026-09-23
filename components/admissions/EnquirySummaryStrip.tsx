/**
 * components/admissions/EnquirySummaryStrip.tsx — Phase 3
 * KPI cards for the Enquiries page using DB-authoritative statuses.
 */

'use client';

import type { Enquiry } from '@/types/admissions';

interface EnquirySummaryStripProps {
  enquiries: Enquiry[];
  onStatusFilter?: (status: string) => void;
}

interface KpiCard {
  label: string;
  count: number;
  color: string;
  statusFilter: string;
  icon: string;
}

export function EnquirySummaryStrip({ enquiries, onStatusFilter }: EnquirySummaryStripProps) {
  const total = enquiries.length;

  const count = (statuses: string[]) =>
    enquiries.filter((e) => statuses.includes(e.status)).length;

  const cards: KpiCard[] = [
    {
      label: 'New Leads',
      count: count(['NEW']),
      color: 'border-blue-400 text-blue-700',
      statusFilter: 'NEW',
      icon: '📥',
    },
    {
      label: 'Contacted / Interested',
      count: count(['CONTACTED', 'INTERESTED']),
      color: 'border-indigo-400 text-indigo-700',
      statusFilter: 'CONTACTED',
      icon: '📞',
    },
    {
      label: 'Applied / Offered',
      count: count(['APPLIED', 'OFFERED']),
      color: 'border-amber-400 text-amber-700',
      statusFilter: 'APPLIED',
      icon: '📋',
    },
    {
      label: 'Enrolled',
      count: count(['ENROLLED']),
      color: 'border-emerald-400 text-emerald-700',
      statusFilter: 'ENROLLED',
      icon: '🎓',
    },
    {
      label: 'Lost',
      count: count(['LOST']),
      color: 'border-gray-300 text-gray-500',
      statusFilter: 'LOST',
      icon: '❌',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={() => onStatusFilter?.(card.statusFilter)}
          className={`bg-white rounded-xl border-l-4 ${card.color} shadow-sm px-4 py-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400`}
          aria-label={`Filter by ${card.label}: ${card.count} records`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base" aria-hidden="true">{card.icon}</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className={`text-2xl font-bold ${card.color.split(' ')[1]}`}>{card.count}</span>
            <span className="text-xs text-gray-400">of {total}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
