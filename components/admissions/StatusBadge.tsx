/**
 * components/admissions/StatusBadge.tsx — Phase 3
 * Semantic colour badges for EnquiryStatus and ApplicationStatus.
 * Uses CSS custom properties from the Phase 2 design system.
 */

import type { EnquiryStatus, ApplicationStatus } from '@/types/admissions';

type AnyStatus = EnquiryStatus | ApplicationStatus | string;

interface StatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  // Enquiry statuses
  NEW: 'bg-blue-50 text-blue-700 border-blue-200',
  CONTACTED: 'bg-purple-50 text-purple-700 border-purple-200',
  INTERESTED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  APPLIED: 'bg-amber-50 text-amber-700 border-amber-200',
  OFFERED: 'bg-orange-50 text-orange-700 border-orange-200',
  ENROLLED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOST: 'bg-gray-100 text-gray-500 border-gray-200',

  // Application statuses
  REVIEW_REQUIRED: 'bg-red-50 text-red-700 border-red-200',
  MATCHED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  QUALIFIED: 'bg-violet-50 text-violet-700 border-violet-200',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
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
  const styles = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border tracking-wide ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
