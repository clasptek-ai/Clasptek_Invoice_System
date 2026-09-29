/**
 * components/admissions/StatusBadge.tsx — Phase 3 & 9G
 * Semantic colour badges for EnquiryStatus and ApplicationStatus.
 * Uses genuine .cp-pill CSS classes from the authoritative Clasptek design system.
 */

'use client';

import type { EnquiryStatus, ApplicationStatus } from '@/types/admissions';

type AnyStatus = EnquiryStatus | ApplicationStatus | string;

interface StatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  INVOICE_REQUESTED: 'Invoice Requested',
  INVOICE_ISSUED: 'Invoice Issued',
  APPLIED: 'Applied',
  OFFERED: 'Offered',
  ENROLLED: 'Enrolled',
  LOST: 'Lost',
  REVIEW_REQUIRED: 'Review Required',
  MATCHED: 'Matched',
  QUALIFIED: 'Qualified',
  CONVERTED: 'Converted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const pillClass = status.toLowerCase().replace(/[\s-]+/g, '_');

  return (
    <span className={`cp-pill ${pillClass} ${className}`.trim()}>
      {label}
    </span>
  );
}
