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
  EnquiryFinancials,
  EnquiryBillingStatus,
  EnquiryInvoiceSummary,
  AdmissionsTimelineEvent,
} from '@/types/admissions';
import { ENQUIRY_BILLING_STATUS_LABELS } from '@/types/admissions';

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
    .in('status', ['PLANNING', 'UPCOMING', 'IN_PROGRESS'])
    .order('start_date', { ascending: true });

  if (error) {
    console.error('[admissions/getCohortsByProgramme]', error.message);
    return [];
  }
  return (data ?? []) as CohortOption[];
}

// ─── Enquiries ───────────────────────────────────────────────────────────────

/**
 * Reconciles authoritative invoices and payments for an enquiry.
 */
function computeEnquiryFinancials(
  enquiry: { id: string; student_name: string; email: string | null; phone: string | null; notes: string | null },
  invoices: Array<Record<string, unknown>>,
  payments: Array<Record<string, unknown>>
): EnquiryFinancials {
  const cleanEmail = enquiry.email?.trim().toLowerCase() || null;
  const cleanPhone = enquiry.phone?.replace(/\D/g, '') || null;
  const cleanName = enquiry.student_name.trim().toLowerCase();

  // Reconcile invoices linked to this enquiry
  const matchedInvoices = invoices.filter((inv) => {
    // 1. Direct explicit link via source 'ENQUIRY:<id>'
    if (inv.source === `ENQUIRY:${enquiry.id}`) return true;

    // 2. Direct explicit link via installment_details [{ enquiry_id: '<id>' }]
    if (Array.isArray(inv.installment_details)) {
      const hasEnquiryId = (inv.installment_details as Array<{ enquiry_id?: string }>).some(
        (d) => d?.enquiry_id === enquiry.id
      );
      if (hasEnquiryId) return true;
    }

    // 3. Customer identity link: student_email matching enquiry.email
    if (cleanEmail && inv.student_email && String(inv.student_email).trim().toLowerCase() === cleanEmail) {
      return true;
    }

    // 4. Phone match (normalized digits)
    if (cleanPhone && inv.student_phone) {
      const invPhone = String(inv.student_phone).replace(/\D/g, '');
      if (invPhone && (invPhone === cleanPhone || invPhone.endsWith(cleanPhone) || cleanPhone.endsWith(invPhone))) {
        return true;
      }
    }

    // 5. Name match fallback if exact name matches
    if (inv.student_name && String(inv.student_name).trim().toLowerCase() === cleanName) {
      return true;
    }

    return false;
  });

  // Filter out voided and cancelled invoices
  const validInvoices = matchedInvoices.filter(
    (inv) => inv.status !== 'voided' && inv.status !== 'cancelled'
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  let totalInvoiced = 0;
  let totalPaid = 0;
  let hasOverdue = false;

  const invoiceSummaries: EnquiryInvoiceSummary[] = validInvoices.map((inv) => {
    const invPayments = payments.filter((p) => p.invoice_id === inv.id);
    const paidForInv = invPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const invTotal = Number(inv.total_amount || 0);
    const invBal = Math.max(0, invTotal - paidForInv);

    totalInvoiced += invTotal;
    totalPaid += paidForInv;

    let computedStatus = String(inv.status || 'unpaid');
    if (paidForInv >= invTotal && invTotal > 0) {
      computedStatus = 'paid';
    } else if (invBal > 0 && inv.due_date && String(inv.due_date) < todayStr) {
      computedStatus = 'overdue';
      hasOverdue = true;
    } else if (paidForInv > 0) {
      computedStatus = 'partial';
    } else {
      computedStatus = 'unpaid';
    }

    return {
      id: String(inv.id),
      invoiceNo: Number(inv.invoice_no || 0),
      invoiceDisplayNo: String(inv.invoice_display_no || `INV-${inv.id}`),
      totalAmount: invTotal,
      paidAmount: paidForInv,
      balanceAmount: invBal,
      status: computedStatus,
      dueDate: String(inv.due_date || ''),
      invoiceDate: String(inv.invoice_date || ''),
      createdAt: String(inv.created_at || ''),
    };
  });

  const balanceDue = Math.max(0, totalInvoiced - totalPaid);

  let billingStatus: EnquiryBillingStatus = 'NOT_INVOICED';

  if (validInvoices.length === 0) {
    const noteText = (enquiry.notes || '').toLowerCase();
    if (noteText.includes('invoice request') || noteText.includes('request invoice') || noteText.includes('requested invoice')) {
      billingStatus = 'INVOICE_REQUESTED';
    } else {
      billingStatus = 'NOT_INVOICED';
    }
  } else if (totalInvoiced > 0 && totalPaid >= totalInvoiced) {
    billingStatus = 'PAID';
  } else if (totalPaid > 0) {
    billingStatus = 'PARTIALLY_PAID';
  } else if (hasOverdue) {
    billingStatus = 'OVERDUE';
  } else {
    billingStatus = 'INVOICED';
  }

  return {
    billingStatus,
    billingStatusLabel: ENQUIRY_BILLING_STATUS_LABELS[billingStatus],
    totalInvoiced,
    amountPaid: totalPaid,
    balanceDue,
    invoicesCount: validInvoices.length,
    invoices: invoiceSummaries,
  };
}

/**
 * Get paginated enquiries with optional filters and authoritative financial summaries.
 * RLS: enquiries_tenant_select — returns only the authenticated user's tenant records.
 */
export async function getEnquiries(
  filters: Partial<EnquiryFilters> = {}
): Promise<{ data: Enquiry[]; count: number; error: string | null }> {
  const supabase = await createServerClient();
  const { search = '', status = 'all', page = 1, pageSize = PAGE_SIZE } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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

  const rawRows = data ?? [];

  // Reconcile invoices, payments, and linked students for tenant enquiries
  let invoices: Array<Record<string, unknown>> = [];
  let payments: Array<Record<string, unknown>> = [];
  let tenantStudents: Array<Record<string, unknown>> = [];
  let matchedApps: Array<Record<string, unknown>> = [];

  const programmeMap = new Map<string, string>();

  if (rawRows.length > 0) {
    const tenantId = (rawRows[0] as { tenant_id?: string }).tenant_id;
    if (tenantId) {
      const enqIds = rawRows.map((r) => String(r.id));
      const [invRes, payRes, stuRes, appRes, progRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('tenant_id', tenantId),
        supabase.from('payments').select('*').eq('tenant_id', tenantId),
        supabase.from('students').select('id, student_number, metadata').eq('tenant_id', tenantId),
        supabase.from('crm_intake_applications').select('enquiry_id, matched_student_id').in('enquiry_id', enqIds),
        supabase.from('programmes').select('id, name'),
      ]);
      invoices = invRes.data || [];
      payments = payRes.data || [];
      tenantStudents = stuRes.data || [];
      matchedApps = appRes.data || [];

      (progRes.data || []).forEach((p: { id: string; name: string }) => {
        if (p.id && p.name) programmeMap.set(p.id, p.name);
      });
    }
  }

  // Flatten joined programme name and attach reconciled financial summary
  const rows = rawRows.map((row: Record<string, unknown>) => {
    const rawProg = row.programmes;
    const prog = Array.isArray(rawProg) ? rawProg[0] : (rawProg as { name?: string } | null);
    const resolvedProgName =
      prog?.name || (row.programme_id ? programmeMap.get(String(row.programme_id)) : null) || null;
    const enqObj = {
      ...row,
      programme_name: resolvedProgName,
      programmes: undefined,
    } as unknown as Enquiry;

    const financials = computeEnquiryFinancials(
      {
        id: enqObj.id,
        student_name: enqObj.student_name,
        email: enqObj.email,
        phone: enqObj.phone,
        notes: enqObj.notes,
      },
      invoices,
      payments
    );

    // Resolve linked Student
    let linkedStudent = tenantStudents.find((s) => {
      const sMeta = (s.metadata as Record<string, unknown>) || {};
      return sMeta.enquiry_id === enqObj.id;
    });
    if (!linkedStudent) {
      const appMatch = matchedApps.find((a) => a.enquiry_id === enqObj.id && a.matched_student_id);
      if (appMatch) {
        linkedStudent = tenantStudents.find((s) => s.id === appMatch.matched_student_id);
      }
    }

    return {
      ...enqObj,
      financials,
      is_registered_student: Boolean(linkedStudent),
      linked_student_id: linkedStudent ? String(linkedStudent.id) : null,
      linked_student_number: linkedStudent ? String(linkedStudent.student_number) : null,
    };
  });

  return { data: rows, count: count ?? 0, error: null };
}

/**
 * Get a single enquiry by ID with financial status and student link.
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

  if (error || !data) {
    if (error) console.error('[admissions/getEnquiryById]', error.message);
    return { data: null, error: error?.message || 'Enquiry not found' };
  }

  const rawData = data as Record<string, unknown>;
  const rawProg = rawData.programmes;
  const prog = Array.isArray(rawProg) ? rawProg[0] : (rawProg as { name?: string } | null);

  // Reconcile financials, programmes, and student link
  const [invRes, payRes, stuRes, appRes, progRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('tenant_id', String(rawData.tenant_id)),
    supabase.from('payments').select('*').eq('tenant_id', String(rawData.tenant_id)),
    supabase.from('students').select('id, student_number, metadata').eq('tenant_id', String(rawData.tenant_id)),
    supabase.from('crm_intake_applications').select('enquiry_id, matched_student_id').eq('enquiry_id', id).limit(1),
    supabase.from('programmes').select('id, name'),
  ]);

  const progMap = new Map<string, string>();
  (progRes.data || []).forEach((p: { id: string; name: string }) => {
    if (p.id && p.name) progMap.set(p.id, p.name);
  });

  const resolvedProgName =
    prog?.name || (rawData.programme_id ? progMap.get(String(rawData.programme_id)) : null) || null;

  const enqObj = {
    ...rawData,
    programme_name: resolvedProgName,
    programmes: undefined,
  } as unknown as Enquiry;

  const financials = computeEnquiryFinancials(
    {
      id: enqObj.id,
      student_name: enqObj.student_name,
      email: enqObj.email,
      phone: enqObj.phone,
      notes: enqObj.notes,
    },
    invRes.data || [],
    payRes.data || []
  );

  const tenantStudents = stuRes.data || [];
  let linkedStudent = tenantStudents.find((s) => {
    const sMeta = (s.metadata as Record<string, unknown>) || {};
    return sMeta.enquiry_id === enqObj.id;
  });
  if (!linkedStudent && appRes.data && appRes.data.length > 0 && appRes.data[0].matched_student_id) {
    linkedStudent = tenantStudents.find((s) => s.id === appRes.data[0].matched_student_id);
  }

  return {
    data: {
      ...enqObj,
      financials,
      is_registered_student: Boolean(linkedStudent),
      linked_student_id: linkedStudent ? String(linkedStudent.id) : null,
      linked_student_number: linkedStudent ? String(linkedStudent.student_number) : null,
    },
    error: null,
  };
}

/**
 * Get chronological admissions and follow-up history for an enquiry.
 */
export async function getEnquiryHistory(
  enquiryId: string,
  enquiryNotes?: string | null
): Promise<AdmissionsTimelineEvent[]> {
  const supabase = await createServerClient();

  const [timelineRes, stageRes] = await Promise.all([
    supabase
      .from('customer_timeline')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('crm_stage_history')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: false }),
  ]);

  const events: AdmissionsTimelineEvent[] = [];

  // 1. customer_timeline events
  for (const item of (timelineRes.data || [])) {
    const rawDate = item.created_at;
    let formattedDate = '—';
    let ts = Date.now();
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        ts = d.getTime();
        formattedDate = d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      }
    } catch {}

    events.push({
      id: item.id,
      date: formattedDate,
      activityType: item.event_type || 'Interaction',
      staffName: item.actor_name || 'Staff',
      description: item.description || item.title || 'Admissions Interaction',
      relatedReference: item.reference_id || null,
      timestamp: ts,
    });
  }

  // 2. crm_stage_history events
  for (const stage of (stageRes.data || [])) {
    const rawDate = stage.created_at;
    let formattedDate = '—';
    let ts = Date.now();
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        ts = d.getTime();
        formattedDate = d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      }
    } catch {}

    events.push({
      id: stage.id,
      date: formattedDate,
      activityType: 'Stage Transition',
      staffName: stage.actor_name || 'System',
      description: stage.reason || `Stage changed from ${stage.from_stage || 'START'} to ${stage.to_stage}`,
      previousStatus: stage.from_stage,
      newStatus: stage.to_stage,
      timestamp: ts,
    });
  }

  // 3. Parse timestamped notes from enquiry.notes (e.g. "[24/09/2026, 14:30] ...")
  if (enquiryNotes) {
    const noteBlocks = enquiryNotes.split('\n\n').filter(Boolean);
    for (let idx = 0; idx < noteBlocks.length; idx++) {
      const block = noteBlocks[idx].trim();
      const timeMatch = block.match(/^\[(.*?)\]\s*([\s\S]*)$/);
      if (timeMatch) {
        const dateStr = timeMatch[1];
        const content = timeMatch[2];
        let parsedTime = Date.now() - (noteBlocks.length - idx) * 60000;
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) parsedTime = d.getTime();
        } catch {}

        events.push({
          id: `note_${enquiryId}_${idx}`,
          date: dateStr,
          activityType: 'Follow-up Note',
          staffName: 'Admissions Staff',
          description: content || block,
          timestamp: parsedTime,
        });
      }
    }
  }

  // Sort chronological descending (latest first)
  events.sort((a, b) => b.timestamp - a.timestamp);

  return events;
}

/**
 * Update enquiry status.
 * RLS: enquiries_tenant_update enforces tenant isolation.
 */
export async function updateEnquiryStatus(
  enquiryId: string,
  newStatus: EnquiryStatus,
  options?: { actorName?: string; reason?: string; customerId?: string | null }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();

  // Read current enquiry to capture previous stage and tenant_id
  const { data: current } = await supabase
    .from('enquiries')
    .select('id, status, tenant_id')
    .eq('id', enquiryId)
    .single();

  const { error } = await supabase
    .from('enquiries')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', enquiryId);

  if (error) {
    console.error('[admissions/updateEnquiryStatus]', error.message);
    return { error: error.message };
  }

  // Record stage transition in crm_stage_history
  if (current && current.tenant_id && current.status !== newStatus) {
    try {
      const stageHistoryId = `crm_sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('crm_stage_history').insert({
        id: stageHistoryId,
        tenant_id: current.tenant_id,
        enquiry_id: enquiryId,
        customer_id: options?.customerId || null,
        from_stage: current.status,
        to_stage: newStatus,
        actor_name: options?.actorName || 'Staff',
        reason: options?.reason || `Stage updated to ${newStatus}`,
      });
    } catch (err) {
      console.warn('[admissions/updateEnquiryStatus] crm_stage_history write warning:', err);
    }
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

export interface CreateEnquiryInput {
  student_name: string;
  email?: string | null;
  phone?: string | null;
  programme_id?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: EnquiryStatus;
  tenant_id?: string | null;
}

/**
 * Create a new enquiry.
 * Enforces tenant_id from authoritative user session.
 * Generates authoritative ID matching public.enquiries schema (id TEXT PRIMARY KEY NOT NULL).
 */
export async function createEnquiry(
  input: CreateEnquiryInput
): Promise<{ data: Enquiry | null; error: string | null }> {
  const supabase = await createServerClient();

  let tenantId = input.tenant_id;
  if (!tenantId) {
    const { getAuthoritativeSession } = await import('@/lib/auth/server');
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return { data: null, error: 'Unauthorized: No active session' };
    }
    tenantId = session.tenantId;
  }

  if (!tenantId) {
    return { data: null, error: 'User does not belong to a valid tenant' };
  }

  // Generate authoritative unique ID for public.enquiries
  const enquiryId = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const newRecord = {
    id: enquiryId,
    tenant_id: tenantId,
    student_name: input.student_name.trim(),
    email: input.email ? input.email.trim() : null,
    phone: input.phone ? input.phone.trim() : null,
    programme_id: input.programme_id || null,
    source: input.source || 'Direct',
    notes: input.notes ? input.notes.trim() : null,
    status: input.status || 'NEW',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('enquiries')
    .insert(newRecord)
    .select(
      `id, tenant_id, student_name, email, phone, programme_id, source, status, notes, created_at, updated_at,
       programmes:programme_id ( name )`
    )
    .single();

  if (error) {
    console.error('[admissions/createEnquiry]', error.message);
    return { data: null, error: error.message };
  }

  const prog = (data as Record<string, unknown>).programmes as { name?: string } | null;
  const row = {
    ...(data as Record<string, unknown>),
    programme_name: prog?.name ?? null,
    programmes: undefined,
  } as unknown as Enquiry;

  return { data: row, error: null };
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
  const { search = '', status = 'ALL', programmeId = '', source = 'ALL', page = 1, pageSize = 25 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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
