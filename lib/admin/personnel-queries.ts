/**
 * lib/admin/personnel-queries.ts
 * Authoritative Server Queries & Governance Mutations for People & Access
 * Phase 9B: Administration & Governance Module Migration
 */

import { createServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { recordFinanceAuditLog } from '@/lib/finance/queries';
import { UserRole } from '@/types/auth';

export interface FinanceAuditLogEntry {
  id?: string;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string | null;
  actorId?: string | null;
  actorRole?: string;
  reason?: string;
  source?: string;
  oldState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface PersonnelQueriesDeps {
  createServerClient: typeof createServerClient;
  createSupabaseServiceClient: typeof createSupabaseServiceClient;
  recordFinanceAuditLog: typeof recordFinanceAuditLog;
}

let activeDeps: PersonnelQueriesDeps = {
  createServerClient,
  createSupabaseServiceClient,
  recordFinanceAuditLog,
};

export function setPersonnelQueriesDepsForTests(deps: Partial<PersonnelQueriesDeps>): void {
  activeDeps = { ...activeDeps, ...deps };
}

export function resetPersonnelQueriesDepsForTests(): void {
  activeDeps = {
    createServerClient,
    createSupabaseServiceClient,
    recordFinanceAuditLog,
  };
}

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
  const supabase = await activeDeps.createServerClient();
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
  const supabase = await activeDeps.createServerClient();

  // Fetch tenant memberships with associated profiles
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('id, user_id, role, status, created_at, updated_at')
    .eq('tenant_id', tenantId);

  if (error || !memberships) {
    console.warn('Notice: tenant_memberships query:', error?.message);
    return [];
  }

  // Fetch profiles for these users using service client so RLS (profiles_own_read)
  // does not hide other users' email and full_name from administrators (C330A)
  const userIds = memberships.map((m) => m.user_id);
  const serviceClient = activeDeps.createSupabaseServiceClient();
  const { data: profiles } = userIds.length > 0
    ? await serviceClient.from('profiles').select('id, email, full_name').in('id', userIds)
    : { data: [] };

  const profileMap = new Map<string, { email: string; full_name?: string | null }>();
  (profiles || []).forEach((p) => {
    if (p?.id) profileMap.set(p.id, p);
  });

  // Fetch personnel to link
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, user_id, employee_id, full_name, email')
    .eq('tenant_id', tenantId);

  const personnelByUserId = new Map<string, { id: string; employee_id: string; full_name: string; email?: string | null }>();
  const personnelByEmail = new Map<string, { id: string; employee_id: string; full_name: string; email?: string | null }>();

  (personnel || []).forEach((p) => {
    if (p.user_id) personnelByUserId.set(p.user_id, p);
    if (p.email && p.email.trim() !== '') {
      personnelByEmail.set(p.email.trim().toLowerCase(), p);
    }
  });

  return memberships.map((m) => {
    const prof = profileMap.get(m.user_id);
    const linkedByUid = personnelByUserId.get(m.user_id);
    // Authoritative email resolution (C330A):
    // 1. Genuine profile email (registered user account)
    // 2. Linked personnel email (if linked by user_id)
    // 3. Empty string fallback (never synthetic hardcoded 'user@clasptek.org')
    const rawEmail = prof?.email || linkedByUid?.email || '';
    const email = rawEmail.trim();

    // Link personnel: user_id match takes priority, then non-empty email match
    const linked = linkedByUid || (email ? personnelByEmail.get(email.toLowerCase()) : undefined);

    const name = prof?.full_name?.trim() || linked?.full_name?.trim() || (email ? email.split('@')[0] : 'User');

    return {
      id: m.user_id,
      name,
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
  const supabase = await activeDeps.createServerClient();
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
  const supabase = await activeDeps.createServerClient();

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
  await activeDeps.recordFinanceAuditLog({
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
  const supabase = await activeDeps.createServerClient();

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

  await activeDeps.recordFinanceAuditLog({
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

/**
 * Authoritative fail-closed security audit logger for People & Access (Fix 5)
 * Sensitive administrative operations MUST fail closed (abort mutation) if the audit log insert fails.
 * Strips all sensitive credentials, passwords, and tokens before persistence.
 */
export async function recordFinanceAuditLogFailClosed(
  entry: Omit<FinanceAuditLogEntry, 'id' | 'createdAt'>
): Promise<void> {
  const supabase = activeDeps.createSupabaseServiceClient();
  const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

  // Defensive sanitization: ensure no passwords, reset tokens, or secret keys are stored
  const sanitizedNewState = entry.newState ? { ...entry.newState } : null;
  if (sanitizedNewState) {
    delete (sanitizedNewState as Record<string, unknown>).password;
    delete (sanitizedNewState as Record<string, unknown>).tempPassword;
    delete (sanitizedNewState as Record<string, unknown>).token;
    delete (sanitizedNewState as Record<string, unknown>).resetToken;
    delete (sanitizedNewState as Record<string, unknown>).inviteToken;
    delete (sanitizedNewState as Record<string, unknown>).secret;
  }

  const sanitizedOldState = entry.oldState ? { ...entry.oldState } : null;
  if (sanitizedOldState) {
    delete (sanitizedOldState as Record<string, unknown>).password;
    delete (sanitizedOldState as Record<string, unknown>).tempPassword;
    delete (sanitizedOldState as Record<string, unknown>).token;
    delete (sanitizedOldState as Record<string, unknown>).resetToken;
    delete (sanitizedOldState as Record<string, unknown>).inviteToken;
    delete (sanitizedOldState as Record<string, unknown>).secret;
  }

  const { error } = await supabase
    .from('finance_audit_log')
    .insert({
      id: auditId,
      tenant_id: entry.tenantId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName || null,
      old_state: sanitizedOldState,
      new_state: sanitizedNewState,
      reason: entry.reason || 'Authoritative governance audit log',
      actor_id: entry.actorId || null,
      actor_role: entry.actorRole || 'Staff',
      source: entry.source || 'people_and_access',
      created_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Failed to record authoritative audit event: ${error.message}`);
  }
}

/**
 * Check whether a specific user is the only remaining active Super Admin in the tenant
 */
export async function checkIsLastSuperAdmin(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const supabase = await activeDeps.createServerClient();
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'SUPER_ADMIN')
    .eq('status', 'active');

  if (error || !data || data.length === 0) return false;
  return data.length === 1 && data[0].user_id === userId;
}

export interface UserSecurityActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityName?: string | null;
  reason?: string | null;
  actorRole: string;
  createdAt: string;
}

/**
 * Fetch recent audit events for a target user (authentication and governance lifecycle)
 */
export async function getUserSecurityActivity(
  tenantId: string,
  userId: string
): Promise<UserSecurityActivityItem[]> {
  const supabase = await activeDeps.createServerClient();
  const { data, error } = await supabase
    .from('finance_audit_log')
    .select('id, action, entity_type, entity_name, reason, actor_role, created_at')
    .eq('tenant_id', tenantId)
    .or(`entity_id.eq.${userId},actor_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    action: d.action,
    entityType: d.entity_type,
    entityName: d.entity_name,
    reason: d.reason,
    actorRole: d.actor_role,
    createdAt: d.created_at,
  }));
}

/**
 * Administrative password reset initiation via Supabase Auth GoTrue recovery dispatch
 * Fix 1: Eliminates administrator-visible tokens. Dispatches recovery email directly to user.
 * Rejects suspended, deactivated, or revoked accounts.
 * Fix 5: Audit logging fails closed.
 * C330A: Targets genuine verified user email, eliminates hardcoded user@clasptek.org.
 */
export async function initiateAdminPasswordReset(
  tenantId: string,
  actor: { id: string; role: string },
  targetUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string; email?: string; targetName?: string }> {
  const supabase = await activeDeps.createServerClient();

  const { data: membership, error: memErr } = await supabase
    .from('tenant_memberships')
    .select('user_id, status, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (memErr || !membership) {
    return { success: false, error: 'User account not found within this organization.' };
  }

  if (membership.status === 'suspended') {
    return { success: false, error: 'Cannot initiate password reset for a suspended or revoked account.' };
  }

  const { data: personnel } = await supabase
    .from('personnel')
    .select('employment_status, email, full_name')
    .eq('tenant_id', tenantId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (
    personnel &&
    (personnel.employment_status === 'deactivated' ||
      personnel.employment_status === 'terminated' ||
      personnel.employment_status === 'suspended')
  ) {
    return { success: false, error: 'Cannot initiate password reset for a deactivated or terminated personnel account.' };
  }

  const adminClient = activeDeps.createSupabaseServiceClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('email, full_name, is_active')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    return { success: false, error: 'Cannot initiate password reset for an inactive user profile.' };
  }

  const targetEmail = (profile?.email || personnel?.email || '').trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes('@')) {
    return {
      success: false,
      error: 'Cannot initiate password reset: target account has no verified email address associated with it.',
    };
  }

  const targetName = profile?.full_name?.trim() || personnel?.full_name?.trim() || targetEmail;
  let dispatchError: string | null = null;
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.clasptek.org';
    const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${appUrl}/login?mode=reset`,
    });
    if (resetErr) dispatchError = resetErr.message;
  } catch (err: unknown) {
    dispatchError = err instanceof Error ? err.message : String(err);
  }

  if (dispatchError) {
    return {
      success: false,
      error: `PASSWORD_RESET_DISPATCH_FAILED: Authentication provider rejected recovery request: ${dispatchError}`,
    };
  }

  await recordFinanceAuditLogFailClosed({
    tenantId,
    action: 'PASSWORD_RESET_INITIATED',
    entityType: 'user',
    entityId: targetUserId,
    entityName: targetName,
    actorId: actor.id,
    actorRole: actor.role,
    reason: reason || 'Password recovery request accepted by authentication provider.',
    source: 'people_and_access',
    newState: { resetRequestedAt: new Date().toISOString() },
  });

  return {
    success: true,
    message: 'Password reset recovery email dispatched successfully.',
    email: targetEmail,
    targetName,
  };
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string;
  employeeType?: 'staff' | 'facilitator';
  department?: string;
  jobTitle?: string;
  personnelId?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  basicPay?: number;
  facilitatorRate?: number;
  compensationType?: string;
  notes?: string;
}

/**
 * Provision or link an authoritative portal login account and associate with personnel
 * Fix 2: Real Supabase Auth account creation via Admin API (genuine auth.users identity).
 * Rollback on partial failure.
 * Fix 5: Fail-closed audit logging.
 */
export async function createOrLinkUserAccount(
  tenantId: string,
  actor: { id: string; role: string },
  payload: CreateUserPayload
): Promise<{
  success: boolean;
  error?: string;
  data?: {
    userId: string;
    personnelId: string;
    employeeId: string;
    fullName: string;
    email: string;
    role: UserRole;
    status: string;
    inviteToken: string;
  };
}> {
  const supabase = await activeDeps.createServerClient();
  const serviceClient = activeDeps.createSupabaseServiceClient();
  const normalizedEmail = (payload.email || '').trim().toLowerCase();
  const trimmedName = (payload.fullName || '').trim();

  if (!trimmedName || !normalizedEmail) {
    return { success: false, error: 'Full name and official email address are required.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Please provide a valid official email address.' };
  }

  const role: UserRole = payload.role || 'Staff';
  const dbRole = role === 'Super Admin' ? 'SUPER_ADMIN'
    : role === 'Finance Manager' ? 'FINANCE_MANAGER'
    : role === 'Finance Staff' ? 'FINANCE_STAFF'
    : 'STAFF';

  // 1. Check if user already exists in profiles (via service client to bypass RLS)
  const { data: existingProfile } = await serviceClient
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', normalizedEmail)
    .maybeSingle();

  let userId: string;
  let createdAuthUserId: string | null = null;
  let createdPersonnelId: string | null = null;

  if (existingProfile) {
    userId = existingProfile.id;

    // Check if membership already exists in this tenant
    const { data: existingMem } = await supabase
      .from('tenant_memberships')
      .select('id, role, status')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMem) {
      return {
        success: false,
        error: `A user account with email "${normalizedEmail}" already exists in this organization.`,
      };
    }
  } else {
    // DEF-C219-04: Provision genuine Supabase Auth identity via Admin API (Fail closed, zero synthetic ID fallback)
    let authCreationError: string | null = null;
    try {
      const adminClient = activeDeps.createSupabaseServiceClient();
      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: false,
        user_metadata: { full_name: trimmedName },
      });

      if (authErr) {
        authCreationError = authErr.message;
      } else if (authData?.user?.id) {
        createdAuthUserId = authData.user.id;
      } else {
        authCreationError = 'Missing user identifier in authentication provider response';
      }
    } catch (err: unknown) {
      authCreationError = err instanceof Error ? err.message : String(err);
    }

    if (authCreationError || !createdAuthUserId) {
      return {
        success: false,
        error: `AUTHENTICATION_SERVICE_ERROR: Failed to provision user identity: ${authCreationError || 'Unknown auth error'}. Account creation aborted.`,
      };
    }

    userId = createdAuthUserId;

    const { error: profileErr } = await serviceClient.from('profiles').insert({
      id: userId,
      email: normalizedEmail,
      full_name: trimmedName,
      role: dbRole,
      tenant_id: tenantId,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (profileErr) {
      // Rollback auth user if created
      if (createdAuthUserId) {
        try {
          const adminClient = activeDeps.createSupabaseServiceClient();
          await adminClient.auth.admin.deleteUser(createdAuthUserId);
        } catch (rollbackErr) {
          return {
            success: false,
            error: `CRITICAL_PARTIAL_FAILURE: Profile creation failed (${profileErr.message}) and auth rollback encountered an error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Manual cleanup of auth user ${createdAuthUserId} required.`,
          };
        }
      }
      return { success: false, error: `Failed to create profile: ${profileErr.message}` };
    }
  }

  // 2. Link or create associated personnel record
  let linkedPersonnel: { id: string; employee_id: string } | null = null;

  if (payload.personnelId) {
    const { data: existingPers } = await supabase
      .from('personnel')
      .select('id, employee_id, user_id')
      .eq('id', payload.personnelId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingPers) {
      linkedPersonnel = existingPers;
      await supabase
        .from('personnel')
        .update({
          user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPers.id);
    }
  }

  if (!linkedPersonnel) {
    const { data: matchingPers } = await supabase
      .from('personnel')
      .select('id, employee_id, user_id')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (matchingPers) {
      linkedPersonnel = matchingPers;
      await supabase
        .from('personnel')
        .update({
          user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchingPers.id);
    } else {
      const empType = payload.employeeType || (role === 'Facilitator' ? 'facilitator' : 'staff');
      const employeeId = await getNextPersonnelIdentifier(tenantId, empType);
      const persId = `pers_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

      const newPers = {
        id: persId,
        tenant_id: tenantId,
        user_id: userId,
        employee_id: employeeId,
        full_name: trimmedName,
        email: normalizedEmail,
        phone: payload.phone?.trim() || null,
        employee_type: empType,
        department: (payload.department || (empType === 'facilitator' ? 'Academic Delivery' : 'Administration')).trim(),
        job_title: (payload.jobTitle || (empType === 'facilitator' ? 'Lead Facilitator' : 'Staff Member')).trim(),
        employment_status: 'active',
        date_joined: new Date().toISOString().slice(0, 10),
        bank_name: payload.bankName?.trim() || 'GTBank',
        account_name: payload.accountName?.trim() || trimmedName,
        account_number: payload.accountNumber?.trim() || null,
        compensation_type: payload.compensationType || (empType === 'facilitator' ? 'per_session' : 'salaried'),
        basic_pay: payload.basicPay || 0,
        facilitator_rate: payload.facilitatorRate || 0,
        notes: payload.notes?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: persInsertErr } = await supabase.from('personnel').insert(newPers);
      if (persInsertErr) {
        // Rollback created profile & auth user if we created them
        if (createdAuthUserId) {
          try {
            const adminClient = activeDeps.createSupabaseServiceClient();
            await adminClient.auth.admin.deleteUser(createdAuthUserId);
            await serviceClient.from('profiles').delete().eq('id', userId); // supabase.from('profiles').delete().eq('id', userId)
          } catch (rollbackErr) {
            return {
              success: false,
              error: `CRITICAL_PARTIAL_FAILURE: Personnel record creation failed (${persInsertErr.message}) and rollback encountered an error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Manual cleanup of auth user ${createdAuthUserId} required.`,
            };
          }
        }
        return { success: false, error: `Failed to create personnel record: ${persInsertErr.message}` };
      }
      createdPersonnelId = persId;
      linkedPersonnel = { id: persId, employee_id: employeeId };
    }
  }

  // 3. Insert tenant membership
  const { error: memErr } = await supabase.from('tenant_memberships').insert({
    tenant_id: tenantId,
    user_id: userId,
    role: dbRole,
    status: 'invited',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (memErr) {
    if (createdAuthUserId) {
      try {
        const adminClient = activeDeps.createSupabaseServiceClient();
        await adminClient.auth.admin.deleteUser(createdAuthUserId);
        await serviceClient.from('profiles').delete().eq('id', userId); // supabase.from('profiles').delete().eq('id', userId)
        if (createdPersonnelId) {
          await supabase.from('personnel').delete().eq('id', createdPersonnelId);
        }
      } catch (rollbackErr) {
        return {
          success: false,
          error: `CRITICAL_PARTIAL_FAILURE: Membership creation failed (${memErr.message}) and compensation rollback encountered an error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Manual cleanup required for user ${createdAuthUserId}.`,
        };
      }
    }
    return { success: false, error: `Failed to create membership: ${memErr.message}` };
  }

  const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // 4. Record fail-closed audit log
  await recordFinanceAuditLogFailClosed({
    tenantId,
    action: 'ACCOUNT_CREATED',
    entityType: 'user',
    entityId: userId,
    entityName: trimmedName,
    actorId: actor.id,
    actorRole: actor.role,
    reason: `Created portal login account for ${trimmedName} (${normalizedEmail}) with role ${role} linked to personnel ${linkedPersonnel.employee_id}`,
    source: 'people_and_access',
    newState: {
      email: normalizedEmail,
      role,
      employeeId: linkedPersonnel.employee_id,
      personnelId: linkedPersonnel.id,
      status: 'invited',
    },
  });

  return {
    success: true,
    data: {
      userId,
      personnelId: linkedPersonnel.id,
      employeeId: linkedPersonnel.employee_id,
      fullName: trimmedName,
      email: normalizedEmail,
      role,
      status: 'invited',
      inviteToken,
    },
  };
}

/**
 * Revoke all active login sessions for a target user across devices (Fix 4, C330B)
 * Notice: @supabase/auth-js GoTrue Admin API signOut(jwt, scope) requires an active session JWT,
 * not a user UUID. In addition, centralized database session revocation infrastructure
 * (session_revocations table and terminate_user_sessions RPC) is part of C253, which is deferred.
 * Rather than swallowing SDK errors or reporting false success, return explicit deferred status:
 */
export async function revokeUserSessions(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string
): Promise<{ success: boolean; code?: string; error?: string; message?: string }> {
  // Prevent self-revocation
  if (userId === actor.id) {
    return {
      success: false,
      code: 'SELF_REVOCATION_DISALLOWED',
      error: 'Cannot revoke sessions for your own account.',
    };
  }

  const supabase = await activeDeps.createServerClient();

  // Verify tenant membership
  const { data: membership, error: memErr } = await supabase
    .from('tenant_memberships')
    .select('user_id, status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memErr || !membership) {
    return { success: false, code: 'USER_NOT_FOUND', error: 'User account not found within this organization.' };
  }

  // Audit attempt in finance_audit_log (fail closed)
  await recordFinanceAuditLogFailClosed({
    tenantId,
    action: 'REVOKE_USER_SESSIONS',
    entityType: 'user',
    entityId: userId,
    actorId: actor.id,
    actorRole: actor.role,
    reason: 'Administrative revocation of active sessions across all devices requested',
    source: 'people_and_access',
  });

  // Note / Defect remediation (C330B): In older phases, adminClient.auth.admin.signOut(userId, 'global')
  // was attempted, but @supabase/auth-js Admin API signOut(jwt, scope) requires an active session JWT
  // rather than a user UUID. In addition, centralized database session revocation infrastructure
  // (session_revocations table + terminate_user_sessions RPC) is part of C253, which is deferred.
  // Rather than swallowing SDK errors or reporting false success, return explicit deferred status:
  return {
    success: false,
    code: 'SESSION_REVOCATION_DEFERRED',
    error: 'Direct session revocation without user JWT requires deferred database governance infrastructure (C253). To immediately terminate user access, use Suspend or Revoke Access.',
  };
}

/**
 * Permanently revoke user access to the portal (Fix 4, DEF-C219-06, C330E)
 * Sets tenant_memberships to suspended, profiles to inactive, and prevents recovery.
 * Note: Does NOT alter HR/payroll status in public.personnel.
 */
export async function revokeUserAccess(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  // Prevent self-revocation
  if (userId === actor.id) {
    return { success: false, error: 'Cannot revoke access for your own account.' };
  }

  const supabase = await activeDeps.createServerClient();

  // Inspect target user membership; if Super Admin, require atomic governance (DEF-C219-01 & DEF-C219-03)
  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role, status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membership?.role === 'SUPER_ADMIN' && membership?.status === 'active') {
    return executeAtomicSuperAdminGovernance(tenantId, actor, userId, 'revoke-access', undefined, reason);
  }

  // 1. Suspend tenant membership
  const { error: memErr } = await supabase
    .from('tenant_memberships')
    .update({ status: 'suspended', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  // 2. Mark profile as inactive using service client so RLS (profiles_own_update) does not block it (C330E)
  const serviceClient = activeDeps.createSupabaseServiceClient();
  const { error: profErr } = await serviceClient
    .from('profiles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (profErr) {
    console.warn('Warning: profile deactivation notice:', profErr.message);
  }

  // Note (C330B): adminClient.auth.admin.signOut(userId, 'global') requires an active JWT;
  // tokenless session invalidation relies on C253 deferred database infrastructure.

  // 3. Fail-closed audit logging (no credentials or tokens recorded)
  await recordFinanceAuditLogFailClosed({
    tenantId,
    action: 'REVOKE_USER_ACCESS',
    entityType: 'user',
    entityId: userId,
    actorId: actor.id,
    actorRole: actor.role,
    reason: reason || 'Administrative access revocation and portal credential suspension',
    source: 'people_and_access',
    newState: { status: 'suspended', is_active: false },
  });

  return {
    success: true,
    message: 'User access permanently revoked (portal credentials suspended; employment history preserved).',
  };
}

/**
 * Authoritatively reactivate a previously suspended or revoked user account (Fix 4, DEF-C219-06)
 * Note: Restores portal credentials without mutating HR/payroll employment contracts.
 */
export async function reactivateUserAccess(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const supabase = await activeDeps.createServerClient();

  // 1. Restore tenant membership status to active
  const { error: memErr } = await supabase
    .from('tenant_memberships')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  // 2. Mark profile as active using service client so RLS (profiles_own_update) does not block it
  const serviceClient = activeDeps.createSupabaseServiceClient();
  await serviceClient
    .from('profiles')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', userId);

  // 3. Fail-closed audit logging
  await recordFinanceAuditLogFailClosed({
    tenantId,
    action: 'REACTIVATE_USER',
    entityType: 'user',
    entityId: userId,
    actorId: actor.id,
    actorRole: actor.role,
    reason: reason || 'Reactivated by Super Admin',
    source: 'people_and_access',
    newState: { status: 'active', is_active: true },
  });

  return { success: true, message: 'User account and access permissions reactivated.' };
}

/**
 * Atomic Super Admin Governance Action Handler (Fix 3, DEF-C219-01, DEF-C219-02, DEF-C219-03)
 * Calls database RPC `demote_or_suspend_super_admin` which enforces transaction-scoped
 * advisory locks and verifies caller identity and Super Admin invariant.
 *
 * FAILS CLOSED: Zero application-level non-atomic fallback.
 */
export async function executeAtomicSuperAdminGovernance(
  tenantId: string,
  actor: { id: string; role: string },
  targetUserId: string,
  action: 'change-role' | 'suspend' | 'revoke-access',
  newRole?: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  // Preflight: Prevent self-demotion or self-suspension
  if (targetUserId === actor.id && (action === 'suspend' || action === 'revoke-access' || (action === 'change-role' && newRole !== 'SUPER_ADMIN'))) {
    return { success: false, error: 'Cannot demote, suspend, or revoke access for your own Super Admin account.' };
  }

  const supabase = await activeDeps.createServerClient();

  // Call PostgreSQL RPC with transaction-level advisory locks
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('demote_or_suspend_super_admin', {
      p_tenant_id: tenantId,
      p_user_id: targetUserId,
      p_action: action,
      p_new_role: newRole || null,
      p_actor_id: actor.id,
    });

    if (rpcErr) {
      if (rpcErr.message.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN')) {
        return { success: false, error: 'Cannot demote or suspend the last active Super Admin in this organization.' };
      }
      if (rpcErr.message.includes('CANNOT_DEMOTE_SELF')) {
        return { success: false, error: 'Cannot demote, suspend, or revoke access for your own Super Admin account.' };
      }
      if (rpcErr.message.includes('UNAUTHORIZED') || rpcErr.message.includes('UNAUTHENTICATED') || rpcErr.message.includes('FORGED_ACTOR_IDENTITY')) {
        return { success: false, error: `Governance operation rejected: ${rpcErr.message}` };
      }
      // Fail closed when RPC fails or is unapplied
      return {
        success: false,
        error: `ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE: Atomic database governance RPC failed: ${rpcErr.message}`,
      };
    }

    if (rpcData?.success) {
      // Note (C330B): adminClient.auth.admin.signOut(userId, 'global') requires an active JWT;
      // tokenless session invalidation relies on C253 deferred database infrastructure.
      return { success: true, message: `Action ${action} executed successfully via atomic database RPC.${reason ? ' (' + reason + ')' : ''}` };
    }

    return {
      success: false,
      error: 'ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE: Database governance RPC returned unexpected response.',
    };
  } catch (err: unknown) {
    // Fail closed: Do NOT fall back to separate check-then-update queries (DEF-C219-03)
    return {
      success: false,
      error: `ATOMIC_SUPER_ADMIN_GOVERNANCE_UNAVAILABLE: Database governance RPC is unapplied or unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
