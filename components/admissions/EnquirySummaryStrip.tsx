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
  icon: React.ReactNode;
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
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--info, #0284C7)' }} aria-hidden="true">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
    },
    {
      label: 'Contacted / Interested',
      count: count(['CONTACTED', 'INTERESTED']),
      statusFilter: 'CONTACTED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary, #14213D)' }} aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
    },
    {
      label: 'Invoice Requested / Issued',
      count: count(['INVOICE_REQUESTED', 'INVOICE_ISSUED']),
      statusFilter: 'INVOICE_REQUESTED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--interactive, #1D4ED8)' }} aria-hidden="true">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'Enrolled',
      count: count(['ENROLLED']),
      statusFilter: 'ENROLLED',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success, #059669)' }} aria-hidden="true">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      ),
    },
    {
      label: 'Lost',
      count: count(['LOST']),
      statusFilter: 'LOST',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--danger, #DC2626)' }} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
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
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>{card.icon}</span>
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
