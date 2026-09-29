/**
 * types/admissions.ts — Phase 3: Admissions & CRM Domain Types
 *
 * All types are derived from the authoritative database schema:
 *   public.enquiries           (11 columns)
 *   public.crm_intake_applications (28 columns)
 *   public.crm_intake_counters
 *
 * DB-authoritative enquiry statuses (from CHECK constraint):
 *   NEW, CONTACTED, INTERESTED, INVOICE_REQUESTED, INVOICE_ISSUED, ENROLLED, LOST
 *
 * Operational Enquiry Lifecycle:
 *   NEW -> CONTACTED -> INTERESTED -> INVOICE_REQUESTED -> INVOICE_ISSUED -> ENROLLED -> LOST
 */

// ─── Enquiry (public.enquiries — 11 columns) ────────────────────────────────

export type EnquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'INVOICE_REQUESTED'
  | 'INVOICE_ISSUED'
  | 'ENROLLED'
  | 'LOST';

export interface Enquiry {
  id: string;
  tenant_id: string;
  /** DB column is student_name — legacy JS used name / studentName */
  student_name: string;
  email: string | null;
  phone: string | null;
  programme_id: string | null;
  source: string | null;
  status: EnquiryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from programmes table (not a DB column on enquiries) */
  programme_name?: string | null;
  /** Reconciled authoritative financial summary */
  financials?: EnquiryFinancials;
  /** Authoritative Student registration linkage */
  is_registered_student?: boolean;
  linked_student_id?: string | null;
  linked_student_number?: string | null;
}

// ─── Financial Status & Admissions History Types ──────────────────────────────

export type EnquiryBillingStatus =
  | 'NOT_INVOICED'
  | 'INVOICE_REQUESTED'
  | 'INVOICED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE';

export const ENQUIRY_BILLING_STATUS_LABELS: Record<EnquiryBillingStatus, string> = {
  NOT_INVOICED: 'Not Invoiced',
  INVOICE_REQUESTED: 'Invoice Requested',
  INVOICED: 'Invoiced',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
};

export interface EnquiryInvoiceSummary {
  id: string;
  invoiceNo: number;
  invoiceDisplayNo: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  dueDate: string;
  invoiceDate: string;
  createdAt: string;
}

export interface EnquiryFinancials {
  billingStatus: EnquiryBillingStatus;
  billingStatusLabel: string;
  totalInvoiced: number;
  amountPaid: number;
  balanceDue: number;
  invoicesCount: number;
  invoices: EnquiryInvoiceSummary[];
}

export interface AdmissionsTimelineEvent {
  id: string;
  date: string;
  activityType: string;
  staffName: string;
  description: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  relatedReference?: string | null;
  timestamp: number;
}

/** Allowed forward transitions per status */
export const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['INTERESTED', 'LOST'],
  INTERESTED: ['INVOICE_REQUESTED', 'LOST'],
  INVOICE_REQUESTED: ['INVOICE_ISSUED', 'LOST'],
  INVOICE_ISSUED: ['ENROLLED', 'LOST'],
  ENROLLED: [],
  LOST: ['CONTACTED'],
};

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New Lead',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  INVOICE_REQUESTED: 'Invoice Requested',
  INVOICE_ISSUED: 'Invoice Issued',
  ENROLLED: 'Enrolled',
  LOST: 'Lost',
};

// ─── Application (public.crm_intake_applications — 28 columns) ─────────────

export type ApplicationStatus =
  | 'NEW'
  | 'REVIEW_REQUIRED'
  | 'MATCHED'
  | 'QUALIFIED'
  | 'CONVERTED'
  | 'REJECTED'
  | 'CANCELLED';

export type ApplicationSource =
  | 'WEB_INTAKE'
  | 'GOOGLE_FORM'
  | 'STAFF_ENTRY'
  | 'PORTAL';

export type DeliveryMode = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

export type IdentityConfidence = 'HIGH' | 'AMBIGUOUS' | 'NONE';

export interface IntakeApplication {
  id: string;
  tenant_id: string;
  application_number: string;
  source: ApplicationSource;
  source_submission_id: string;
  submitted_at: string;
  status: ApplicationStatus;

  // Applicant
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  state_of_origin: string | null;
  nationality: string | null;
  address: string | null;

  // Programme interest
  programme_id: string | null;
  expertise_level: string | null;
  preferred_schedule: string | null;
  preferred_start_date: string | null;
  preferred_duration: string | null;
  delivery_mode: DeliveryMode;

  // Sponsorship
  sponsor_type: string | null;
  sponsor_name: string | null;
  sponsor_phone: string | null;
  sponsor_email: string | null;

  // Additional
  claimed_student_number: string | null;
  employment_status: string | null;
  referral_source: string | null;
  notes: string | null;
  agreed_tuition_fee: number;
  consent_acknowledged: boolean;

  // Identity resolution & CRM linkages
  matched_student_id: string | null;
  enquiry_id: string | null;
  enrolment_id: string | null;
  identity_confidence: IdentityConfidence | null;
  match_notes: string | null;
  review_reason: string | null;

  // Immutable raw submission snapshot (trigger-enforced)
  applicant_data: Record<string, unknown>;

  created_at: string;
  updated_at: string;

  /** Joined from programmes table */
  programme_name?: string | null;
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  NEW: 'New',
  REVIEW_REQUIRED: 'Review Required',
  MATCHED: 'Matched',
  QUALIFIED: 'Qualified',
  CONVERTED: 'Converted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSource, string> = {
  WEB_INTAKE: 'Web Form',
  GOOGLE_FORM: 'Google Forms',
  STAFF_ENTRY: 'Staff Entry',
  PORTAL: 'Applicant Portal',
};

/** Statuses that allow conversion */
export const CONVERTIBLE_STATUSES: ApplicationStatus[] = ['MATCHED', 'QUALIFIED'];

// ─── Public Apply form model (5-step wizard) ────────────────────────────────

export interface ApplyFormData {
  // Step 1 — Personal
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  stateOfOrigin: string;
  address: string;

  // Step 2 — Programme
  programmeId: string;
  deliveryMode: DeliveryMode;
  preferredSchedule: string;
  preferredStartDate: string;
  expertiseLevel: string;
  agreedTuitionFee: string;
  preferredDuration: string;

  // Step 3 — Background
  employmentStatus: string;
  referralSource: string;
  claimedStudentNumber: string;
  notes: string;

  // Step 4 — Sponsorship + security
  sponsorType: string;
  sponsorName: string;
  sponsorPhone: string;
  sponsorEmail: string;
  /** Honeypot — must remain empty */
  website_url_hp: string;
  consentAcknowledged: boolean;

  // Pre-fill link from enquiry
  enquiryId: string | null;
}

// ─── Conversion ─────────────────────────────────────────────────────────────

export interface ConversionOptions {
  cohort_id?: string;
  approved_tuition_fee?: number;
}

export interface ConversionResult {
  success: boolean;
  application_id: string;
  application_number: string;
  status: 'CONVERTED';
  student_id: string;
  student_number: string;
  enrolment_id: string | null;
  enrolment_number: string | null;
}

// ─── Filter helpers ──────────────────────────────────────────────────────────

export interface EnquiryFilters {
  search: string;
  status: EnquiryStatus | 'all';
  page: number;
  pageSize?: number;
}

export interface ApplicationFilters {
  search: string;
  status: ApplicationStatus | 'ALL';
  programmeId: string;
  source: ApplicationSource | 'ALL';
  page: number;
  pageSize?: number;
}

// ─── Cohort (minimal, for conversion selector) ───────────────────────────────

export interface CohortOption {
  id: string;
  cohort_code: string;
  name: string;
  programme_id: string;
  start_date: string | null;
  status: string;
}

// ─── Programme (minimal, for filter/select) ──────────────────────────────────

export interface ProgrammeOption {
  id: string;
  code: string;
  name: string;
  tuition_fee: number;
  status: string;
}
