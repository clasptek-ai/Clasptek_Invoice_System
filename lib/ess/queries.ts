/**
 * lib/ess/queries.ts — Business query layer for Employee Self-Service (ESS)
 * Phase 9E: User Workspaces Migration
 *
 * Strictly enforces authoritative tenant isolation and employee ownership.
 * Disallows cross-employee and cross-tenant data access.
 */

import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import type { EmployeeProfile, EmployeePayslip, PayrollQuery, EmployeeSession } from '@/types/ess';

// ─── HELPER: RESOLVE PERSONNEL FOR SESSION ─────────────────────────────────────
export async function getAuthoritativePersonnel() {
  const session = await getAuthoritativeSession();
  if (!session || !session.user) {
    throw new Error('UNAUTHORIZED');
  }

  const supabase = await createServerClient();
  const tenantId = session.tenantId;
  const userId = session.user.id;
  const userEmail = session.user.email?.toLowerCase().trim();
  const userName = (session.user.user_metadata?.full_name as string) || (session.user.user_metadata?.name as string) || session.user.email || 'Clasptek Personnel';

  // Find personnel record by user_id first, then by email within tenant
  const { data: byUser, error: errUser } = await supabase
    .from('personnel')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (byUser && !errUser) {
    return { session, personnel: byUser, tenantId, userName };
  }

  if (userEmail) {
    const { data: byEmail, error: errEmail } = await supabase
      .from('personnel')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('email', userEmail)
      .maybeSingle();

    if (byEmail && !errEmail) {
      return { session, personnel: byEmail, tenantId, userName };
    }
  }

  // If no personnel record found, synthesize an employee profile from session data
  const fallbackPersonnel = {
    id: `pers_${userId.slice(0, 12)}`,
    tenant_id: tenantId,
    user_id: userId,
    employee_id: 'EMP-' + userId.slice(0, 6).toUpperCase(),
    first_name: userName.split(' ')[0] || 'Employee',
    last_name: userName.split(' ').slice(1).join(' ') || '',
    full_name: userName,
    email: userEmail || '',
    phone: '',
    employee_type: session.user.role === 'Facilitator' ? 'facilitator' : 'staff',
    department: 'Operations',
    job_title: session.user.role,
    employment_status: 'active',
    date_joined: null,
    bank_name: 'Guaranty Trust Bank (GTBank)',
    account_name: userName || 'Clasptek Personnel',
    account_number: '••••••••••',
    compensation_type: 'salaried',
    basic_pay: 0,
    facilitator_rate: 0,
    rate_type: 'session',
    notes: null
  };

  return { session, personnel: fallbackPersonnel, tenantId, userName };
}

// ─── 1. GET EMPLOYEE PROFILE ───────────────────────────────────────────────────
export async function getEmployeeProfile(): Promise<EmployeeProfile> {
  const { session, personnel, tenantId, userName } = await getAuthoritativePersonnel();

  return {
    id: personnel.id,
    tenantId: tenantId,
    userId: personnel.user_id || session.user.id,
    employeeId: personnel.employee_id || 'EMP-0001',
    name: personnel.full_name || `${personnel.first_name || ''} ${personnel.last_name || ''}`.trim() || userName,
    firstName: personnel.first_name || userName.split(' ')[0] || '',
    lastName: personnel.last_name || '',
    email: personnel.email || session.user.email,
    phone: personnel.phone || '',
    employeeType: (personnel.employee_type || 'staff') as 'staff' | 'facilitator',
    department: personnel.department || 'Academics',
    jobTitle: personnel.job_title || session.role,
    employmentStatus: (personnel.employment_status || 'active') as EmployeeProfile['employmentStatus'],
    dateJoined: personnel.date_joined || null,
    bankName: personnel.bank_name || 'Guaranty Trust Bank (GTBank)',
    accountName: personnel.account_name || personnel.full_name || userName,
    accountNumber: personnel.account_number || '',
    compensationType: (personnel.compensation_type || 'salaried') as EmployeeProfile['compensationType'],
    basicPay: Number(personnel.basic_pay || 0),
    facilitatorRate: Number(personnel.facilitator_rate || 0),
    rateType: personnel.rate_type || 'session',
    notes: personnel.notes || null,
  };
}

// ─── 2. GET EMPLOYEE PAYSLIPS ──────────────────────────────────────────────────
export async function getEmployeePayslips(): Promise<EmployeePayslip[]> {
  const { personnel, tenantId } = await getAuthoritativePersonnel();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('personnel_id', personnel.id)
    .order('pay_period', { ascending: false })
    .order('payslip_no', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payslips: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    payslipNo: row.payslip_no,
    payslipDisplayNo: row.payslip_display_no || `PSL-${row.payslip_no}`,
    personnelId: row.personnel_id,
    employeeName: row.employee_name,
    employeeType: row.employee_type,
    department: row.department,
    role: row.role,
    payPeriod: row.pay_period,
    payDate: row.pay_date,
    basicPay: Number(row.basic_pay || 0),
    allowances: Array.isArray(row.allowances) ? row.allowances : [],
    grossPay: Number(row.gross_pay || 0),
    deductions: Array.isArray(row.deductions) ? row.deductions : [],
    totalDeductions: Number(row.total_deductions || 0),
    netPay: Number(row.net_pay || 0),
    status: row.status,
    statementVersion: row.statement_version || 1,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgementRemarks: row.acknowledgement_remarks,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    paidAmount: Number(row.paid_amount || 0),
    actualPaymentDate: row.actual_payment_date,
    paymentMethod: row.payment_method,
    queries: Array.isArray(row.queries) ? row.queries : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ─── 3. ACKNOWLEDGE PAYSLIP ────────────────────────────────────────────────────
export async function acknowledgeEmployeePayslip(payslipId: string, remarks?: string): Promise<EmployeePayslip> {
  const { personnel, tenantId, session } = await getAuthoritativePersonnel();
  const supabase = await createServerClient();

  // Authoritative check: verify payslip belongs to caller and current tenant
  const { data: existing, error: fetchErr } = await supabase
    .from('payslips')
    .select('*')
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !existing) {
    throw new Error('PAYSLIP_NOT_FOUND');
  }

  if (existing.personnel_id !== personnel.id) {
    throw new Error('FORBIDDEN_CROSS_EMPLOYEE_ACCESS');
  }

  if (existing.status !== 'issued') {
    throw new Error(`CANNOT_ACKNOWLEDGE_STATUS_${existing.status.toUpperCase()}`);
  }

  const now = new Date().toISOString();
  const updatePayload = {
    status: 'acknowledged',
    acknowledged_at: now,
    acknowledged_by: personnel.id,
    acknowledgement_method: 'ESS_PORTAL',
    acknowledgement_remarks: remarks?.trim() || 'Acknowledged via Employee Self-Service Portal',
    updated_at: now,
  };

  const { data: updated, error: updateErr } = await supabase
    .from('payslips')
    .update(updatePayload)
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new Error(`Failed to acknowledge payslip: ${updateErr?.message}`);
  }

  // Immutable audit log
  await supabase.from('finance_audit_log').insert({
    tenant_id: tenantId,
    action: 'PAYSLIP_ACKNOWLEDGED',
    entity_type: 'payslip',
    entity_id: payslipId,
    entity_name: updated.payslip_display_no || `PSL-${updated.payslip_no}`,
    old_state: { status: existing.status },
    new_state: { status: 'acknowledged', acknowledged_at: now },
    reason: remarks || 'Confirmed by employee via Self-Service',
    actor_id: session.user.id,
    actor_role: session.user.role,
    source: 'EMPLOYEE_SELF_SERVICE',
  }).select().maybeSingle();

  return {
    ...updated,
    grossPay: Number(updated.gross_pay || 0),
    totalDeductions: Number(updated.total_deductions || 0),
    netPay: Number(updated.net_pay || 0),
    basicPay: Number(updated.basic_pay || 0),
    queries: Array.isArray(updated.queries) ? updated.queries : [],
    allowances: Array.isArray(updated.allowances) ? updated.allowances : [],
    deductions: Array.isArray(updated.deductions) ? updated.deductions : [],
  };
}

// ─── 4. RAISE PAYROLL QUERY ────────────────────────────────────────────────────
export async function raiseEmployeePayrollQuery(
  payslipId: string,
  queryData: { queryReason: string; queryComment: string }
): Promise<PayrollQuery> {
  const { personnel, tenantId, session } = await getAuthoritativePersonnel();
  const supabase = await createServerClient();

  if (!queryData.queryReason?.trim() || !queryData.queryComment?.trim()) {
    throw new Error('MISSING_QUERY_FIELDS');
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('payslips')
    .select('*')
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !existing) {
    throw new Error('PAYSLIP_NOT_FOUND');
  }

  if (existing.personnel_id !== personnel.id) {
    throw new Error('FORBIDDEN_CROSS_EMPLOYEE_ACCESS');
  }

  const currentQueries: PayrollQuery[] = Array.isArray(existing.queries) ? existing.queries : [];
  const now = new Date().toISOString();
  const newQuery: PayrollQuery = {
    id: `qry_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    payslipId,
    payslipNo: existing.payslip_no,
    payPeriod: existing.pay_period,
    queryReason: queryData.queryReason.trim(),
    queryComment: queryData.queryComment.trim(),
    status: 'open',
    createdAt: now,
  };

  const updatedQueries = [...currentQueries, newQuery];

  const { error: updateErr } = await supabase
    .from('payslips')
    .update({ queries: updatedQueries, updated_at: now })
    .eq('id', payslipId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    throw new Error(`Failed to submit query: ${updateErr.message}`);
  }

  // Audit log
  await supabase.from('finance_audit_log').insert({
    tenant_id: tenantId,
    action: 'PAYSLIP_QUERY_RAISED',
    entity_type: 'payslip',
    entity_id: payslipId,
    entity_name: existing.payslip_display_no || `PSL-${existing.payslip_no}`,
    old_state: { queriesCount: currentQueries.length },
    new_state: { queriesCount: updatedQueries.length, latestQueryId: newQuery.id },
    reason: `${queryData.queryReason}: ${queryData.queryComment}`,
    actor_id: session.user.id,
    actor_role: session.user.role,
    source: 'EMPLOYEE_SELF_SERVICE',
  }).select().maybeSingle();

  return newQuery;
}

// ─── 5. GET EMPLOYEE QUERIES ───────────────────────────────────────────────────
export async function getEmployeeQueries(): Promise<PayrollQuery[]> {
  const payslips = await getEmployeePayslips();
  const queries: PayrollQuery[] = [];

  for (const ps of payslips) {
    if (Array.isArray(ps.queries)) {
      for (const q of ps.queries) {
        queries.push({
          ...q,
          payslipId: ps.id,
          payslipNo: ps.payslipNo,
          payPeriod: ps.payPeriod,
        });
      }
    }
  }

  return queries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── 6. GET EMPLOYEE SESSIONS ──────────────────────────────────────────────────
export async function getEmployeeSessions(): Promise<EmployeeSession[]> {
  const { personnel, tenantId } = await getAuthoritativePersonnel();
  const supabase = await createServerClient();

  // Find cohorts where caller is lead facilitator
  const { data: assignedCohorts } = await supabase
    .from('cohorts')
    .select('id, cohort_code, name, programme_id')
    .eq('tenant_id', tenantId)
    .eq('lead_facilitator_id', personnel.id);

  const cohortIds = (assignedCohorts || []).map((c) => c.id);

  // Fetch training sessions assigned to facilitator directly or via cohort lead
  const { data: sessions, error } = await supabase
    .from('training_sessions')
    .select(`
      id,
      cohort_id,
      facilitator_id,
      session_number,
      session_title,
      notes,
      session_date,
      start_time,
      end_time,
      delivery_mode,
      location,
      status
    `)
    .eq('tenant_id', tenantId)
    .neq('status', 'CANCELLED')
    .order('session_date', { ascending: true })
    .order('session_number', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch sessions: ${error.message}`);
  }

  // Filter to sessions matching personnel.id or cohortIds
  const filtered = (sessions || []).filter(
    (s) => s.facilitator_id === personnel.id || cohortIds.includes(s.cohort_id)
  );

  // Fetch programmes for names
  const { data: programmes } = await supabase
    .from('programmes')
    .select('id, name')
    .eq('tenant_id', tenantId);

  const progMap = new Map((programmes || []).map((p) => [p.id, p.name]));
  const cohortMap = new Map((assignedCohorts || []).map((c) => [c.id, c]));

  return filtered.map((s) => {
    const cohort = cohortMap.get(s.cohort_id);
    const progName = cohort ? progMap.get(cohort.programme_id) || 'Vocational Training' : 'Vocational Training';

    return {
      id: s.id,
      cohortId: s.cohort_id,
      cohortCode: cohort?.cohort_code || 'COH-GEN',
      cohortName: cohort?.name || 'Assigned Cohort',
      programmeId: cohort?.programme_id || '',
      programmeName: progName,
      sessionNumber: s.session_number || 1,
      sessionTitle: s.session_title || 'Classroom Instruction',
      sessionDescription: s.notes || undefined,
      sessionDate: s.session_date,
      startTime: s.start_time || '09:00:00',
      endTime: s.end_time || '11:00:00',
      deliveryMode: (s.delivery_mode || 'IN_PERSON') as EmployeeSession['deliveryMode'],
      location: s.location || null,
      status: s.status as EmployeeSession['status'],
    };
  });
}
