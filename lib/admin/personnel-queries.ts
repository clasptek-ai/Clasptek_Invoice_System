/**
 * lib/admin/personnel-queries.ts
 * Authoritative Server Queries & Governance Mutations for People & Access
 * Phase 9B: Administration & Governance Module Migration
 */

import { createServerClient } from '@/lib/supabase/server';
import { recordFinanceAuditLog } from '@/lib/finance/queries';
import { UserRole } from '@/types/auth';

export interface AdminPersonnel {
  id: string;
  tenantId: string;
  userId?: string | null;
  employeeId: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  employeeType: 'staff' | 'facilitator';
  department: string;
  jobTitle: string;
  employmentStatus: 'active' | 'on_leave' | 'suspended' | 'deactivated' | 'terminated';
  dateJoined?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  compensationType: string;
  basicPay: number;
  facilitatorRate?: number;
  rateType?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'invited' | 'deactivated';
  lastLoginAt?: string | null;
  personnelId?: string | null;
  personnelName?: string | null;
  personnelEmployeeId?: string | null;
  invitationToken?: string | null;
  createdAt?: string;
}

/**
 * Fetch all personnel records for a given tenant
 */
export async function getAdminPersonnelList(tenantId: string): Promise<AdminPersonnel[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('full_name', { ascending: true })
    .order('employee_id', { ascending: true });

  if (error) {
    console.error('Error fetching admin personnel:', error.message);
    return [];
  }

  return (data || []).map((p) => ({
    id: p.id,
    tenantId: p.tenant_id,
    userId: p.user_id,
    employeeId: p.employee_id,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    employeeType: p.employee_type as 'staff' | 'facilitator',
    department: p.department,
    jobTitle: p.job_title,
    employmentStatus: p.employment_status as AdminPersonnel['employmentStatus'],
    dateJoined: p.date_joined,
    bankName: p.bank_name,
    accountName: p.account_name,
    accountNumber: p.account_number,
    compensationType: p.compensation_type || 'salaried',
    basicPay: Number(p.basic_pay || 0),
    facilitatorRate: Number(p.facilitator_rate || 0),
    rateType: p.rate_type,
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * Fetch users and tenant memberships for People & Access
 */
export async function getAdminUsersList(tenantId: string): Promise<AdminUser[]> {
  const supabase = await createServerClient();

  // Fetch tenant memberships with associated profiles
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('id, user_id, role, status, created_at, updated_at')
    .eq('tenant_id', tenantId);

  if (error || !memberships) {
    console.warn('Notice: tenant_memberships query:', error?.message);
    return [];
  }

  // Fetch profiles for these users
  const userIds = memberships.map((m) => m.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, email, full_name').in('id', userIds)
    : { data: [] };

  const profileMap = new Map<string, { email: string; full_name?: string | null }>();
  (profiles || []).forEach((p) => profileMap.set(p.id, p));

  // Fetch personnel to link
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, user_id, employee_id, full_name, email')
    .eq('tenant_id', tenantId);

  const personnelByUserId = new Map<string, { id: string; employee_id: string; full_name: string }>();
  const personnelByEmail = new Map<string, { id: string; employee_id: string; full_name: string }>();

  (personnel || []).forEach((p) => {
    if (p.user_id) personnelByUserId.set(p.user_id, p);
    if (p.email) personnelByEmail.set(p.email.toLowerCase(), p);
  });

  return memberships.map((m) => {
    const prof = profileMap.get(m.user_id);
    const email = prof?.email || 'user@clasptek.org';
    const linked = personnelByUserId.get(m.user_id) || personnelByEmail.get(email.toLowerCase());

    return {
      id: m.user_id,
      name: prof?.full_name || linked?.full_name || email.split('@')[0],
      email,
      role: m.role as UserRole,
      status: m.status as AdminUser['status'],
      lastLoginAt: m.updated_at,
      personnelId: linked?.id || null,
      personnelName: linked?.full_name || null,
      personnelEmployeeId: linked?.employee_id || null,
      createdAt: m.created_at,
    };
  });
}

/**
 * Next available authoritative employee ID (EMP-#### or FAC-####)
 */
export async function getNextPersonnelIdentifier(
  tenantId: string,
  type: 'staff' | 'facilitator'
): Promise<string> {
  const supabase = await createServerClient();
  const prefix = type === 'facilitator' ? 'FAC-' : 'EMP-';

  const { data } = await supabase
    .from('personnel')
    .select('employee_id')
    .eq('tenant_id', tenantId)
    .eq('employee_type', type);

  let highestNum = 0;
  (data || []).forEach((p) => {
    const id = p.employee_id || '';
    if (id.startsWith(prefix)) {
      const numPart = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > highestNum) {
        highestNum = numPart;
      }
    }
  });

  const nextNum = highestNum + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Create a new personnel record with server-side validation and audit logging
 */
export async function createPersonnelRecord(
  tenantId: string,
  actor: { id: string; role: string },
  payload: {
    fullName: string;
    email: string;
    phone?: string;
    employeeType: 'staff' | 'facilitator';
    department: string;
    jobTitle: string;
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    compensationType?: string;
    basicPay?: number;
    facilitatorRate?: number;
    notes?: string;
  }
): Promise<{ success: boolean; data?: AdminPersonnel; error?: string }> {
  const supabase = await createServerClient();

  if (!payload.fullName || !payload.email || !payload.department || !payload.jobTitle) {
    return { success: false, error: 'Full name, email, department, and role are required.' };
  }

  // Allocate authoritative employee ID
  const employeeId = await getNextPersonnelIdentifier(tenantId, payload.employeeType);
  const id = `pers_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

  const newRecord = {
    id,
    tenant_id: tenantId,
    employee_id: employeeId,
    full_name: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone?.trim() || null,
    employee_type: payload.employeeType,
    department: payload.department.trim(),
    job_title: payload.jobTitle.trim(),
    employment_status: 'active',
    date_joined: new Date().toISOString().slice(0, 10),
    bank_name: payload.bankName?.trim() || 'GTBank',
    account_name: payload.accountName?.trim() || payload.fullName.trim(),
    account_number: payload.accountNumber?.trim() || null,
    compensation_type: payload.compensationType || (payload.employeeType === 'facilitator' ? 'per_session' : 'salaried'),
    basic_pay: payload.basicPay || 0,
    facilitator_rate: payload.facilitatorRate || 0,
    notes: payload.notes?.trim() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('personnel').insert(newRecord);
  if (error) {
    return { success: false, error: error.message };
  }

  // Log authoritative audit event
  await recordFinanceAuditLog({
    tenantId,
    action: 'CREATE_PERSONNEL',
    entityType: 'personnel',
    entityId: id,
    entityName: payload.fullName,
    actorId: actor.id,
    actorRole: actor.role,
    reason: `Provisioned ${payload.employeeType} record ${employeeId}`,
    source: 'people_and_access',
    newState: newRecord,
  });

  return {
    success: true,
    data: {
      id,
      tenantId,
      employeeId,
      fullName: newRecord.full_name,
      email: newRecord.email,
      phone: newRecord.phone,
      employeeType: newRecord.employee_type as 'staff' | 'facilitator',
      department: newRecord.department,
      jobTitle: newRecord.job_title,
      employmentStatus: 'active',
      dateJoined: newRecord.date_joined,
      bankName: newRecord.bank_name,
      accountName: newRecord.account_name,
      accountNumber: newRecord.account_number,
      compensationType: newRecord.compensation_type,
      basicPay: newRecord.basic_pay,
      facilitatorRate: newRecord.facilitator_rate,
      notes: newRecord.notes,
    },
  };
}

/**
 * Update personnel record with audit trail
 */
export async function updatePersonnelRecord(
  tenantId: string,
  personnelId: string,
  actor: { id: string; role: string },
  payload: Partial<AdminPersonnel>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('personnel')
    .select('*')
    .eq('id', personnelId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: 'Personnel record not found' };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.fullName) updates.full_name = payload.fullName.trim();
  if (payload.email) updates.email = payload.email.trim().toLowerCase();
  if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
  if (payload.department) updates.department = payload.department.trim();
  if (payload.jobTitle) updates.job_title = payload.jobTitle.trim();
  if (payload.bankName !== undefined) updates.bank_name = payload.bankName?.trim() || null;
  if (payload.accountName !== undefined) updates.account_name = payload.accountName?.trim() || null;
  if (payload.accountNumber !== undefined) updates.account_number = payload.accountNumber?.trim() || null;
  if (payload.basicPay !== undefined) updates.basic_pay = payload.basicPay;
  if (payload.facilitatorRate !== undefined) updates.facilitator_rate = payload.facilitatorRate;
  if (payload.employmentStatus) updates.employment_status = payload.employmentStatus;
  if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

  const { error: updateErr } = await supabase
    .from('personnel')
    .update(updates)
    .eq('id', personnelId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'UPDATE_PERSONNEL',
    entityType: 'personnel',
    entityId: personnelId,
    entityName: payload.fullName || existing.full_name,
    actorId: actor.id,
    actorRole: actor.role,
    reason: `Updated personnel profile information for ${existing.employee_id}`,
    source: 'people_and_access',
    oldState: existing,
    newState: updates,
  });

  return { success: true };
}
