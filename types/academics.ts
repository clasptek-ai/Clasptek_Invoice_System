/**
 * types/academics.ts — Phase 4
 * Authoritative Academic domain types matching PostgreSQL schema for:
 * public.programmes, public.cohorts, public.enrolments.
 */

export type ProgrammeStatus = 'active' | 'archived' | 'draft';

export interface ProgrammeMetadata {
  category?: string;
  [key: string]: unknown;
}

export interface Programme {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  tuition_fee: number;
  max_discount_pct: number;
  allow_installments: boolean;
  installment_first_pct: number;
  installment_second_pct: number;
  status: ProgrammeStatus;
  created_at: string;
  updated_at: string;
  duration_weeks: number | null;
  session_count: number | null;
  description: string | null;
  metadata: ProgrammeMetadata | null;
}

export type CohortStatus = 'PLANNING' | 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type DeliveryMode = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

export interface Cohort {
  id: string;
  tenant_id: string;
  programme_id: string;
  lead_facilitator_id: string | null;
  cohort_code: string;
  name: string;
  start_date: string;
  end_date: string;
  delivery_mode: DeliveryMode;
  capacity: number;
  status: CohortStatus;
  created_at: string;
  updated_at: string;
  // Augmented display fields
  programme_name?: string;
  lead_facilitator_name?: string;
  enrolled_count?: number;
  is_full?: boolean;
  percentage_full?: number;
}

export type EnrolmentStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'DEFERRED'
  | 'WITHDRAWN'
  | 'CANCELLED';

export interface Enrolment {
  id: string;
  tenant_id: string;
  enquiry_id: string | null;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  programme_id: string;
  cohort: string | null;
  status: EnrolmentStatus;
  enrolment_date: string;
  created_at: string;
  student_id: string | null;
  cohort_id: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  enrolment_number: string;
  agreed_tuition_fee: number;
  discount_amount: number;
  discount_pct: number;
  completion_date: string | null;
  completion_status: string;
  completion_verified_by: string | null;
  completion_verified_at: string | null;
  completion_notes: string | null;
  completion_attendance_pct: number | null;
  certificate_issued: boolean;
  certificate_number: string | null;
  certificate_issued_at: string | null;
  notes: string | null;
  updated_at: string;
  // Augmented display fields
  programme_name?: string;
  cohort_name?: string;
}

export interface EnrolmentFilters {
  search?: string;
  cohortId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CohortFilters {
  search?: string;
  programmeId?: string;
  status?: string;
}

export interface CapacitySummary {
  enrolledCount: number;
  capacity: number;
  isFull: boolean;
  percentageFull: number;
}
