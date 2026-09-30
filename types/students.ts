/**
 * types/students.ts — Phase 4
 * Authoritative Student domain types matching PostgreSQL schema for public.students.
 */

export type StudentStatus = 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'WITHDRAWN';

export interface StudentAuditTrailEntry {
  id: string;
  timestamp: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  field: string;
  previous_value: unknown;
  new_value: unknown;
  reason: string;
}

export type DeduplicationMatchConfidence =
  | 'EXACT_ID'
  | 'EXACT_EMAIL'
  | 'EXACT_PHONE'
  | 'EMAIL_LASTNAME'
  | 'PHONE_LASTNAME'
  | 'NAME_ONLY'
  | 'NONE';

export interface DeduplicationMatchResult {
  confidence: DeduplicationMatchConfidence;
  isAmbiguous: boolean;
  matchedStudent: Student | null;
  matchReason: string;
}

export interface StudentMetadata {
  source?: string;
  middleName?: string | null;
  rawFullName?: string | null;
  dateOfBirth?: string | null;
  maritalStatus?: string | null;
  stateOfOrigin?: string | null;
  state?: string | null;
  location?: string | null;
  alternativePhone?: string | null;
  secondaryPhone?: string | null;
  phone2?: string | null;
  nationality?: string | null;
  religion?: string | null;
  hasSponsor?: boolean | string | null;
  sponsorName?: string | null;
  sponsorType?: string | null;
  sponsorEmail?: string | null;
  sponsorPhone?: string | null;
  sponsor?: {
    hasSponsor: boolean;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  registeredAt?: string | null;
  registrationDate?: string | null;
  expertiseLevel?: string | null;
  referralSource?: string | null;
  employmentStatus?: string | null;
  preferredSchedule?: string | null;
  emergencyContactRelationship?: string | null;
  enquiry_id?: string | null;
  notes?: string | null;
  audit_trail?: StudentAuditTrailEntry[];
  [key: string]: unknown;
}

export interface Student {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  user_id: string | null;
  student_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: StudentStatus;
  metadata: StudentMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface StudentSummary {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  address: string | null;
  parent_name: string | null;
  programmes_list: string;
  total_invoiced: number;
  total_paid: number;
  balance: number;
  is_enrolled: boolean;
  financial_status: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NO_INVOICE';
  training_status: StudentStatus;
  status_display: string;
}

export interface StudentFilters {
  search?: string;
  status?: string;
  programmeId?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentDossierInvoice {
  id: string;
  invoice_number: string;
  amount: number;
  balance: number;
  status: string;
  issue_date: string;
}

export interface StudentDossierPayment {
  id: string;
  receipt_number: string;
  amount: number;
  payment_date: string;
  method: string;
}

export interface StudentDossierEnrolment {
  id: string;
  enrolment_number: string;
  programme_name: string;
  cohort_name: string;
  status: string;
  agreed_tuition_fee: number;
  enrolment_date: string;
  attendance_pct: number;
  certificate_issued: boolean;
  certificate_number: string | null;
}

export interface StudentDossier {
  student: Student;
  corporateSponsor?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  enrolments: StudentDossierEnrolment[];
  invoices: StudentDossierInvoice[];
  payments: StudentDossierPayment[];
  totalInvoiced: number;
  totalPaid: number;
  balanceDue: number;
}
