/**
 * types/tracking.ts — Type definitions for Applicant Status & Admissions Portal
 * Phase 9E: User Workspaces Migration
 */

export interface PublicApplicantTracking {
  success: boolean;
  message?: string;
  application?: {
    id: string;
    application_number: string;
    candidate_name: string;
    programme_name: string;
    delivery_mode: string;
    preferred_schedule: string;
    submitted_at: string;
    preferred_start_date?: string | null;
    raw_status: 'NEW' | 'REVIEW_REQUIRED' | 'MATCHED' | 'QUALIFIED' | 'CONVERTED' | 'REJECTED' | 'CANCELLED';
    public_status: 'RECEIVED' | 'UNDER_REVIEW' | 'QUALIFIED' | 'ENROLLED' | 'REJECTED';
    status_label: string;
    status_description: string;
    required_documents: Array<{ name: string; status: 'PENDING' | 'VERIFIED' }>;
    admissions_contact: {
      email: string;
      phone: string;
      office: string;
    };
  };
}
