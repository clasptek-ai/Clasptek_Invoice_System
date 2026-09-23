/**
 * app/apply/actions.ts — Phase 3
 * Server Action for Public Intake Application submission.
 * Enforces honeypot check, payload validation, and executes the authoritative
 * submit_applicant_intake RPC using the service client.
 */

'use server';

import crypto from 'crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { ApplyFormData } from '@/types/admissions';

export interface SubmitApplicationResult {
  success: boolean;
  applicationNumber?: string;
  status?: string;
  message?: string;
  error?: string;
}

export async function submitApplication(data: ApplyFormData): Promise<SubmitApplicationResult> {
  // 1. Anti-Bot Honeypot Gate
  if (data.website_url_hp && data.website_url_hp.trim() !== '') {
    // Silent success response for automated scrapers / spam bots
    return {
      success: true,
      applicationNumber: 'APP-2026-000000',
      status: 'RECEIVED',
      message: 'Application received successfully',
    };
  }

  // 2. Strict Input Validation
  if (!data.firstName?.trim() || !data.lastName?.trim()) {
    return { success: false, error: 'First name and Last name are required.' };
  }
  if (!data.email?.trim() && !data.phone?.trim()) {
    return { success: false, error: 'At least one contact method (email or phone) is required.' };
  }
  if (!data.consentAcknowledged) {
    return { success: false, error: 'You must confirm that the information provided is accurate.' };
  }

  // 3. Prepare parameters for submit_applicant_intake RPC
  const submissionId = crypto.randomUUID();
  const agreedFee = parseFloat(data.agreedTuitionFee) || 0;

  const rpcParams = {
    p_source: 'WEB_INTAKE',
    p_source_submission_id: submissionId,
    p_first_name: data.firstName.trim(),
    p_last_name: data.lastName.trim(),
    p_email: data.email?.trim() || null,
    p_phone: data.phone?.trim() || null,
    p_date_of_birth: data.dateOfBirth || null,
    p_gender: data.gender || null,
    p_marital_status: data.maritalStatus || null,
    p_state_of_origin: data.stateOfOrigin || null,
    p_nationality: 'Nigerian',
    p_address: data.address?.trim() || null,
    p_programme_id: data.programmeId || null,
    p_expertise_level: data.expertiseLevel || null,
    p_preferred_schedule: data.preferredSchedule || null,
    p_preferred_start_date: data.preferredStartDate || null,
    p_preferred_duration: data.preferredDuration || null,
    p_delivery_mode: data.deliveryMode || 'IN_PERSON',
    p_sponsor_type: data.sponsorType || 'Self-sponsored',
    p_sponsor_name: data.sponsorName?.trim() || null,
    p_sponsor_phone: data.sponsorPhone?.trim() || null,
    p_sponsor_email: data.sponsorEmail?.trim() || null,
    p_claimed_student_number: data.claimedStudentNumber?.trim() || null,
    p_employment_status: data.employmentStatus || null,
    p_referral_source: data.referralSource || null,
    p_notes: data.notes?.trim() || null,
    p_agreed_tuition_fee: agreedFee,
    p_consent_acknowledged: Boolean(data.consentAcknowledged),
    p_honeypot: null,
  };

  try {
    const supabase = await createSupabaseServiceClient();
    const { data: result, error } = await supabase.rpc('submit_applicant_intake', rpcParams);

    if (error) {
      console.error('[submitApplication RPC error]', error);
      return { success: false, error: error.message };
    }

    const res = result as {
      success?: boolean;
      application_number?: string;
      status?: string;
      message?: string;
    };

    return {
      success: true,
      applicationNumber: res?.application_number,
      status: res?.status || 'RECEIVED',
      message: res?.message || 'Your application has been received successfully.',
    };
  } catch (err: unknown) {
    console.error('[submitApplication exception]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}
