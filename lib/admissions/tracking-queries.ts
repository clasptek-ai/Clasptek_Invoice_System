/**
 * lib/admissions/tracking-queries.ts — Public Applicant Status Tracking Engine
 * Phase 9E: User Workspaces Migration
 *
 * Implements anti-enumeration security: identical generic error on not-found or credential mismatch.
 * Strictly sanitizes output: exposes zero internal staff notes, scoring, or cross-tenant data.
 */

import { createServerClient } from '@/lib/supabase/server';
import type { PublicApplicantTracking } from '@/types/tracking';

const GENERIC_NOT_FOUND_MSG =
  'Application could not be found or verified with the provided details. Please check your reference number and contact information.';

interface TrackParams {
  applicationNumber: string;
  credential: string;
  tenantId?: string;
}

export async function trackApplicantApplication({
  applicationNumber,
  credential,
}: TrackParams): Promise<PublicApplicantTracking> {
  const normRef = String(applicationNumber || '').trim().toUpperCase();
  const rawCred = String(credential || '').trim();
  const normCred = rawCred.toLowerCase();
  const normPhoneDigits = rawCred.replace(/\D/g, '');

  if (!normRef || !rawCred) {
    return { success: false, message: GENERIC_NOT_FOUND_MSG };
  }

  const supabase = await createServerClient();

  // Query application by application_number
  const { data: app, error } = await supabase
    .from('crm_intake_applications')
    .select(`
      id,
      tenant_id,
      application_number,
      status,
      first_name,
      last_name,
      email,
      phone,
      programme_id,
      delivery_mode,
      preferred_schedule,
      preferred_start_date,
      submitted_at,
      created_at
    `)
    .ilike('application_number', normRef)
    .maybeSingle();

  // Anti-enumeration: return identical error if not found
  if (error || !app) {
    return { success: false, message: GENERIC_NOT_FOUND_MSG };
  }

  // Verify credential against applicant email OR phone
  const appEmail = String(app.email || '').trim().toLowerCase();
  const appPhoneDigits = String(app.phone || '').replace(/\D/g, '');

  const emailMatches = Boolean(appEmail && appEmail === normCred);
  const last8App = appPhoneDigits.slice(-8);
  const last8Input = normPhoneDigits.slice(-8);
  const phoneMatches = Boolean(
    normPhoneDigits.length >= 7 &&
      (appPhoneDigits === normPhoneDigits ||
        appPhoneDigits.endsWith(normPhoneDigits) ||
        normPhoneDigits.endsWith(appPhoneDigits) ||
        (normPhoneDigits.length >= 8 && appPhoneDigits.length >= 8 && last8App === last8Input))
  );

  if (!emailMatches && !phoneMatches) {
    // Identical error prevents username/ref enumeration (Zero Oracle Leakage)
    return { success: false, message: GENERIC_NOT_FOUND_MSG };
  }

  // Resolve programme name
  let programmeName = 'Vocational Training Programme';
  if (app.programme_id) {
    const { data: prog } = await supabase
      .from('programmes')
      .select('name')
      .eq('id', app.programme_id)
      .maybeSingle();

    if (prog?.name) {
      programmeName = prog.name;
    }
  }

  // Status mapping
  const rawStatus = (app.status || 'NEW').toUpperCase() as
    | 'NEW'
    | 'REVIEW_REQUIRED'
    | 'MATCHED'
    | 'QUALIFIED'
    | 'CONVERTED'
    | 'REJECTED'
    | 'CANCELLED';

  let publicStatus: 'RECEIVED' | 'UNDER_REVIEW' | 'QUALIFIED' | 'ENROLLED' | 'REJECTED' = 'RECEIVED';
  let statusLabel = 'Application Received';
  let statusDescription = 'Your application has been received and registered in our admissions intake queue.';

  if (rawStatus === 'NEW') {
    publicStatus = 'RECEIVED';
    statusLabel = 'Application Received';
    statusDescription = 'Your application has been received and registered in our admissions intake queue.';
  } else if (rawStatus === 'REVIEW_REQUIRED' || rawStatus === 'MATCHED') {
    publicStatus = 'UNDER_REVIEW';
    statusLabel = 'Under Admissions Review';
    statusDescription = 'Admissions is reviewing your background qualifications and schedule availability.';
  } else if (rawStatus === 'QUALIFIED') {
    publicStatus = 'QUALIFIED';
    statusLabel = 'Application Approved / Qualified';
    statusDescription = 'Congratulations! Your application has been approved. Enrolment processing is underway.';
  } else if (rawStatus === 'CONVERTED') {
    publicStatus = 'ENROLLED';
    statusLabel = 'Enrolment Confirmed / Enrolled';
    statusDescription = 'You are officially enrolled. Please check your email or contact admissions for schedule induction.';
  } else if (rawStatus === 'REJECTED' || rawStatus === 'CANCELLED') {
    publicStatus = 'REJECTED';
    statusLabel = 'Application Closed';
    statusDescription = 'Your application for this intake cycle is closed. Please contact admissions for reapplication options.';
  }

  const candidateName = `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Candidate';

  return {
    success: true,
    application: {
      id: app.id,
      application_number: app.application_number,
      candidate_name: candidateName,
      programme_name: programmeName,
      delivery_mode: app.delivery_mode || 'ONLINE',
      preferred_schedule: app.preferred_schedule || 'Weekend Intensive',
      submitted_at: app.submitted_at || app.created_at,
      preferred_start_date: app.preferred_start_date || null,
      raw_status: rawStatus,
      public_status: publicStatus,
      status_label: statusLabel,
      status_description: statusDescription,
      required_documents: [
        { name: 'Government-Issued Photo ID', status: 'PENDING' },
        { name: 'Highest Academic / Professional Qualification', status: 'PENDING' },
        { name: 'Proof of Identity / Address', status: 'PENDING' },
      ],
      admissions_contact: {
        email: 'admissions@clasptek.org',
        phone: '+234 (0) 800 CLASPTEK',
        office: 'Clasptek Vocational Training Admissions Office',
      },
    },
  };
}
