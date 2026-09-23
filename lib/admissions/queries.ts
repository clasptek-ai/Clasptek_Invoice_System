/**
 * lib/admissions/queries.ts — Phase 3: Server-side Admissions Data Access
 *
 * All functions use lib/supabase/server.ts and run exclusively on the server.
 * Tenant isolation is enforced by Supabase RLS — queries do not need to manually
 * filter by tenant_id (RLS handles this), but explicit tenant filtering is added
 * for defence-in-depth on any query that bypasses RLS via service-role.
 *
 * For browser-facing queries (authenticated user context), the anon/user client
 * is used so RLS applies. For the public apply form, the service-role client is
 * used in the Server Action only.
 */

import { createServerClient } from '@/lib/supabase/server';
import type {
  Enquiry,
  EnquiryFilters,
  IntakeApplication,
  ApplicationFilters,
  ProgrammeOption,
  CohortOption,
  EnquiryStatus,
  ApplicationStatus,
} from '@/types/admissions';

const PAGE_SIZE = 25;

// ─── Programmes ─────────────────────────────────────────────────────────────

/**
 * Get active programmes (for dropdowns / filters).
 * RLS: programmes are readable by all authenticated users.
 */
export async function getProgrammes(): Promise<ProgrammeOption[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('programmes')
    .select('id, code, name, tuition_fee, status')
    .order('name', { ascending: true });

  if (error) {
    console.error('[admissions/getProgrammes]', error.message);
    return [];
  }
  return (data ?? []) as ProgrammeOption[];
}

/**
 * Get active programmes only (for public /apply form).
 * Returns programmes where status = 'active' (case-insensitive, matches DB).
 */
export async function getActiveProgrammes(): Promise<ProgrammeOption[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('programmes')
    .select('id, code, name, tuition_fee, status')
    .ilike('status', 'active')
    .order('name', { ascending: true });

  if (error) {
    console.error('[admissions/getActiveProgrammes]', error.message);
    return [];
  }
  return (data ?? []) as ProgrammeOption[];
}

// ─── Cohorts ─────────────────────────────────────────────────────────────────

/**
 * Get cohorts for a given programme (for conversion panel selector).
 */
export async function getCohortsByProgramme(programmeId: string): Promise<CohortOption[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, cohort_code, name, programme_id, start_date, status')
    .eq('programme_id', programmeId)
    .in('status', ['UPCOMING', 'ACTIVE', 'OPEN'])
    .order('start_date', { ascending: true });

  if (error) {
    console.error('[admissions/getCohortsByProgramme]', error.message);
    return [];
  }
  return (data ?? []) as CohortOption[];
}

// ─── Enquiries ───────────────────────────────────────────────────────────────

/**
 * Get paginated enquiries with optional filters.
 * RLS: enquiries_tenant_select — returns only the authenticated user's tenant records.
 */
export async function getEnquiries(
  filters: Partial<EnquiryFilters> = {}
): Promise<{ data: Enquiry[]; count: number; error: string | null }> {
  const supabase = await createServerClient();
  const { search = '', status = 'all', page = 1 } = filters;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('enquiries')
    .select(
      `id, tenant_id, student_name, email, phone, programme_id, source, status, notes, created_at, updated_at,
       programmes:programme_id ( name )`,
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (search.trim()) {
    const q = search.trim();
    query = query.or(
      `student_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,notes.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[admissions/getEnquiries]', error.message);
    return { data: [], count: 0, error: error.message };
  }

  // Flatten joined programme name
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const prog = row.programmes as { name?: string } | null;
    return {
      ...row,
      programme_name: prog?.name ?? null,
      programmes: undefined,
    } as unknown as Enquiry;
  });

  return { data: rows, count: count ?? 0, error: null };
}

/**
 * Get a single enquiry by ID.
 * RLS: enquiries_tenant_select enforces tenant isolation.
 */
export async function getEnquiryById(
  id: string
): Promise<{ data: Enquiry | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('enquiries')
    .select(
      `id, tenant_id, student_name, email, phone, programme_id, source, status, notes, created_at, updated_at,
       programmes:programme_id ( name )`
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('[admissions/getEnquiryById]', error.message);
    return { data: null, error: error.message };
  }

  const prog = (data as Record<string, unknown>).programmes as { name?: string } | null;
  const row = { ...(data as Record<string, unknown>), programme_name: prog?.name ?? null, programmes: undefined } as unknown as Enquiry;
  return { data: row, error: null };
}

/**
 * Update enquiry status.
 * RLS: enquiries_tenant_update enforces tenant isolation.
 */
export async function updateEnquiryStatus(
  enquiryId: string,
  newStatus: EnquiryStatus
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from('enquiries')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', enquiryId);

  if (error) {
    console.error('[admissions/updateEnquiryStatus]', error.message);
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Append a note to an enquiry (concatenates to existing notes).
 */
export async function appendEnquiryNote(
  enquiryId: string,
  note: string
): Promise<{ error: string | null }> {
  // First read the existing notes
  const supabase = await createServerClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('enquiries')
    .select('notes')
    .eq('id', enquiryId)
    .single();

  if (fetchErr) return { error: fetchErr.message };

  const existingNotes = (existing as { notes: string | null })?.notes ?? '';
  const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const combined = existingNotes
    ? `${existingNotes}\n\n[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;

  const { error } = await supabase
    .from('enquiries')
    .update({ notes: combined, updated_at: new Date().toISOString() })
    .eq('id', enquiryId);

  if (error) {
    console.error('[admissions/appendEnquiryNote]', error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Applications ────────────────────────────────────────────────────────────

/**
 * Get paginated applications with optional filters.
 * RLS: intake_apps_select_admin_staff — staff/admin only.
 */
export async function getApplications(
  filters: Partial<ApplicationFilters> = {}
): Promise<{ data: IntakeApplication[]; count: number; error: string | null }> {
  const supabase = await createServerClient();
  const { search = '', status = 'ALL', programmeId = '', source = 'ALL', page = 1 } = filters;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('crm_intake_applications')
    .select('*, programmes:programme_id ( name )', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'ALL') {
    query = query.eq('status', status);
  }
  if (programmeId) {
    query = query.eq('programme_id', programmeId);
  }
  if (source && source !== 'ALL') {
    query = query.eq('source', source);
  }
  if (search.trim()) {
    const q = search.trim();
    query = query.or(
      `application_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[admissions/getApplications]', error.message);
    return { data: [], count: 0, error: error.message };
  }

  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const prog = row.programmes as { name?: string } | null;
    return {
      ...row,
      programme_name: prog?.name ?? null,
      programmes: undefined,
    } as unknown as IntakeApplication;
  });

  return { data: rows, count: count ?? 0, error: null };
}

/**
 * Get a single application by ID.
 * RLS: intake_apps_select_admin_staff enforces role + tenant.
 */
export async function getApplicationById(
  id: string
): Promise<{ data: IntakeApplication | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('crm_intake_applications')
    .select('*, programmes:programme_id ( name )')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[admissions/getApplicationById]', error.message);
    return { data: null, error: error.message };
  }

  const prog = (data as Record<string, unknown>).programmes as { name?: string } | null;
  const row = {
    ...(data as Record<string, unknown>),
    programme_name: prog?.name ?? null,
    programmes: undefined,
  } as unknown as IntakeApplication;
  return { data: row, error: null };
}

/**
 * Update application status (restricted transitions only).
 * The RPC convert_intake_application handles CONVERTED — do not patch that directly.
 */
export async function updateApplicationStatus(
  applicationId: string,
  newStatus: ApplicationStatus
): Promise<{ error: string | null }> {
  if (newStatus === 'CONVERTED') {
    return { error: 'Use the convert_intake_application RPC for conversion.' };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('crm_intake_applications')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    console.error('[admissions/updateApplicationStatus]', error.message);
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Get application counts per status for KPI strip.
 */
export async function getApplicationStatusCounts(): Promise<Record<string, number>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('crm_intake_applications')
    .select('status');

  if (error) {
    console.error('[admissions/getApplicationStatusCounts]', error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const s = (row as { status: string }).status;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get enquiry status counts for KPI strip.
 */
export async function getEnquiryStatusCounts(): Promise<Record<string, number>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('enquiries')
    .select('status');

  if (error) {
    console.error('[admissions/getEnquiryStatusCounts]', error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const s = (row as { status: string }).status;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}
