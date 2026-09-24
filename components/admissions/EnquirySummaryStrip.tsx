/**
 * components/admissions/EnquirySummaryStrip.tsx — Phase 3 & 9G
 * KPI cards for the Enquiries page using DB-authoritative statuses.
 * Uses genuine .cp-kpi-grid and .cp-kpi-card design system classes.
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
      statusFilter: 'NEW',
      icon: '📥',
    },
    {
      label: 'Contacted / Interested',
      count: count(['CONTACTED', 'INTERESTED']),
      statusFilter: 'CONTACTED',
      icon: '📞',
    },
    {
      label: 'Applied / Offered',
      count: count(['APPLIED', 'OFFERED']),
      statusFilter: 'APPLIED',
      icon: '📋',
    },
    {
      label: 'Enrolled',
      count: count(['ENROLLED']),
      statusFilter: 'ENROLLED',
      icon: '🎓',
    },
    {
      label: 'Lost',
      count: count(['LOST']),
      statusFilter: 'LOST',
      icon: '❌',
    },
  ];

  return (
    <div className="cp-kpi-grid" style={{ marginBottom: '20px' }}>
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => onStatusFilter?.(card.statusFilter)}
          className="cp-kpi-card"
          aria-label={`Filter by ${card.label}: ${card.count} records`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span aria-hidden="true" style={{ fontSize: '16px' }}>{card.icon}</span>
            <span className="cp-kpi-label">{card.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="cp-kpi-val" style={{ color: 'var(--text-primary, #0F172A)' }}>
              {card.count}
            </span>
            <span className="cp-kpi-sub">of {total}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
