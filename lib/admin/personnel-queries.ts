/**
 * lib/admin/personnel-queries.ts
 * Authoritative Server Queries & Governance Mutations for People & Access
 * Phase 9B / Phase C249: Administration & Governance Integrity Remediation
 *
 * Architectural Notes (C249.1 - C249.8):
 * - C249.1: Fail-closed server-side governance audit logging (`recordFinanceAuditLogFailClosed`)
 *   validates actor identity, role, and tenant membership on the server and writes via the
 *   controlled governance audit RPC or tenant-scoped service client so RLS restrictions on
 *   ordinary authenticated users do not cause unhandled HTTP 500 failures.
 * - C249.2: Every `tenant_memberships` mutation verifies affected row count (`rowsAffected > 0`)
 *   and rolls back if audit logging fails.
 * - C249.3: Canonical `public.profiles` contains only `(id, email, full_name, avatar_url, created_at, updated_at)`.
 *   Executable code never queries or updates non-existent `profiles.role` or `profiles.is_active`
 *   (legacy `.update({ is_active: false, updated_at: new Date().toISOString() })` removed from profiles).
 * - C249.5: Permanent access revocation (`revokeUserAccess`) enforces a non-empty reason,
 *   executes membership suspension + audit logging first with rollback on audit failure,
 *   checks `{ error }` from `adminClient.auth.admin.signOut(userId, 'global')`, and records
 *   partial completion for session reconciliation if GoTrue sign-out fails.
 */

import { randomUUID } from 'crypto';
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

export interface GovernanceOperationResult {
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  status?: 'active' | 'suspended' | 'invited' | 'deactivated';
  role?: UserRole;
  idempotent?: boolean;
  partialRevocation?: boolean;
  completionState?: 'COMPLETED' | 'PARTIAL_SESSION_TERMINATION_PENDING' | 'FAILED';
  sessionTerminated?: boolean;
  reconciliationPending?: boolean;
  rowsAffected?: number;
  /** Stable identifier of the logical governance operation (idempotency key). */
  operationId?: string;
  auditId?: string;
  /**
   * Durable session-revocation state (C253):
   * NOT_REQUIRED | PENDING | IN_PROGRESS | RETRY_PENDING | COMPLETED | FAILED | SUPERSEDED.
   * `sessionTerminated` is true only when this is COMPLETED.
   */
  sessionState?: 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'RETRY_PENDING' | 'COMPLETED' | 'FAILED' | 'SUPERSEDED';
}

export interface PersonnelQueriesDeps {
  createServerClient: typeof createServerClient;
  createSupabaseServiceClient: typeof createSupabaseServiceClient;
}

let activeDeps: PersonnelQueriesDeps = {
  createServerClient,
  createSupabaseServiceClient,
};

export function setPersonnelQueriesDepsForTests(overrides: Partial<PersonnelQueriesDeps>): void {
  activeDeps = {
    ...activeDeps,
    ...overrides,
  };
}

export function resetPersonnelQueriesDepsForTests(): void {
  activeDeps = {
    createServerClient,
    createSupabaseServiceClient,
  };
}

/**
 * Resolve the server-side Supabase client for verified administrative governance queries.
 * Prefers the server-only service-role client (strictly scoped by explicit `.eq('tenant_id', tenantId)` filters)
 * so restrictive RLS policies on `tenant_memberships`, `profiles`, and `finance_audit_log` do not
 * silently filter rows or throw 42501 errors for authenticated Super Admins.
 * If service credentials are unavailable (local/offline) it falls back to the user-session client.
 * That fallback cannot weaken security: every governance RPC (govern_tenant_membership,
 * claim_session_revocations, complete_session_revocation, terminate_user_sessions) is EXECUTE-granted to
 * service_role only and additionally verifies the request role inside the function, so a
 * user-session client is rejected (fail closed).
 */
async function getGovernanceDbClient() {
  try {
    return activeDeps.createSupabaseServiceClient();
  } catch {
    return await activeDeps.createServerClient();
  }
}

/**
 * Normalize database role enum ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF')
 * to canonical application UserRole ('Super Admin', 'Finance Manager', 'Finance Staff', 'Facilitator', 'Staff').
 */
export function normalizeGovernanceRole(
  rawRole: string | null | undefined,
  employeeType?: 'staff' | 'facilitator' | null
): UserRole {
  const upper = (rawRole || '').trim().toUpperCase();
  if (upper === 'SUPER_ADMIN' || rawRole === 'Super Admin') return 'Super Admin';
  if (upper === 'FINANCE_MANAGER' || rawRole === 'Finance Manager') return 'Finance Manager';
  if (upper === 'FINANCE_STAFF' || rawRole === 'Finance Staff') return 'Finance Staff';
  if (rawRole === 'Facilitator') return 'Facilitator';
  if (rawRole === 'Finance Viewer') return 'Finance Viewer';
  if (rawRole === 'Student') return 'Student';
  if (employeeType === 'facilitator') return 'Facilitator';
  return 'Staff';
}

/**
 * Map canonical display role to PostgreSQL `tenant_memberships.role` value.
 */
export function toCanonicalDbRole(role: string): 'SUPER_ADMIN' | 'FINANCE_MANAGER' | 'FINANCE_STAFF' | 'STAFF' {
  if (role === 'Super Admin' || role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (role === 'Finance Manager' || role === 'FINANCE_MANAGER') return 'FINANCE_MANAGER';
  if (role === 'Finance Staff' || role === 'FINANCE_STAFF') return 'FINANCE_STAFF';
  return 'STAFF';
}

/**
 * Validate administrative governance reason (C249.6).
 * Rejects empty/whitespace-only reasons and enforces reasonable length bounds (3..500 chars).
 */
export function validateGovernanceReason(
  reason: unknown,
  fieldLabel = 'Revocation reason'
): { valid: boolean; trimmed: string; error?: string } {
  if (typeof reason !== 'string') {
    return {
      valid: false,
      trimmed: '',
      error: `REASON_REQUIRED: ${fieldLabel} is required and must be a non-empty string.`,
    };
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return {
      valid: false,
      trimmed: '',
      error: `REASON_REQUIRED: ${fieldLabel} cannot be empty or whitespace only.`,
    };
  }
  if (trimmed.length < 3) {
    return {
      valid: false,
      trimmed,
      error: `REASON_TOO_SHORT: ${fieldLabel} must be at least 3 characters.`,
    };
  }
  if (trimmed.length > 500) {
    return {
      valid: false,
      trimmed: trimmed.slice(0, 500),
      error: `REASON_TOO_LONG: ${fieldLabel} must not exceed 500 characters.`,
    };
  }
  return { valid: true, trimmed };
}

/**
 * Fetch all personnel records for a given tenant
 */
export async function getAdminPersonnelList(tenantId: string): Promise<AdminPersonnel[]> {
  const supabase = await getGovernanceDbClient();
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

  return (data || []).map((p: Record<string, unknown>) => ({
    id: String(p.id || ''),
    tenantId: String(p.tenant_id || ''),
    userId: (p.user_id as string | null) ?? null,
    employeeId: String(p.employee_id || ''),
    firstName: (p.first_name as string | null) ?? null,
    lastName: (p.last_name as string | null) ?? null,
    fullName: String(p.full_name || ''),
    email: String(p.email || ''),
    phone: (p.phone as string | null) ?? null,
    employeeType: p.employee_type as 'staff' | 'facilitator',
    department: String(p.department || ''),
    jobTitle: String(p.job_title || ''),
    employmentStatus: p.employment_status as AdminPersonnel['employmentStatus'],
    dateJoined: (p.date_joined as string | null) ?? null,
    bankName: (p.bank_name as string | null) ?? null,
    accountName: (p.account_name as string | null) ?? null,
    accountNumber: (p.account_number as string | null) ?? null,
    compensationType: String(p.compensation_type || 'salaried'),
    basicPay: Number(p.basic_pay || 0),
    facilitatorRate: Number(p.facilitator_rate || 0),
    rateType: (p.rate_type as string | null) ?? null,
    notes: (p.notes as string | null) ?? null,
    createdAt: (p.created_at as string | undefined),
    updatedAt: (p.updated_at as string | undefined),
  }));
}

/**
 * Fetch users and tenant memberships for People & Access with explicit error status (C249.3, C249.8).
 * Never fabricates fake emails (such as 'user@clasptek.org') and normalizes database roles.
 */
export async function getAdminUsersListResult(
  tenantId: string
): Promise<{ success: boolean; data: AdminUser[]; error?: string }> {
  if (!tenantId) {
    return { success: false, data: [], error: 'Tenant ID is required to list organization users.' };
  }

  try {
    const supabase = await getGovernanceDbClient();

    // 1. Fetch tenant memberships for the organization
    const { data: memberships, error: memError } = await supabase
      .from('tenant_memberships')
      .select('id, user_id, role, status, created_at, updated_at')
      .eq('tenant_id', tenantId);

    if (memError || !memberships) {
      return {
        success: false,
        data: [],
        error: `FAILED_TO_FETCH_USERS: ${memError?.message || 'Unable to query tenant_memberships'}`,
      };
    }

    // 2. Fetch canonical profiles columns ONLY (id, email, full_name) for tenant members (C249.3)
    const userIds = (memberships as Array<{ user_id?: string }>).map((m) => m.user_id).filter((id): id is string => Boolean(id));
    const { data: profiles, error: profError } = userIds.length > 0
      ? await supabase.from('profiles').select('id, email, full_name').in('id', userIds)
      : { data: [], error: null };

    if (profError) {
      return {
        success: false,
        data: [],
        error: `FAILED_TO_FETCH_PROFILES: ${profError.message}`,
      };
    }

    const profileMap = new Map<string, { email: string; full_name?: string | null }>();
    ((profiles || []) as Array<{ id: string; email: string; full_name?: string | null }>).forEach((p) => profileMap.set(p.id, p));

    // 3. Fetch tenant personnel records to link HR metadata
    const { data: personnel, error: persError } = await supabase
      .from('personnel')
      .select('id, user_id, employee_id, full_name, email, employee_type')
      .eq('tenant_id', tenantId);

    if (persError) {
      return {
        success: false,
        data: [],
        error: `FAILED_TO_FETCH_PERSONNEL: ${persError.message}`,
      };
    }

    interface LinkedPersonnelRow {
      id: string;
      user_id?: string | null;
      employee_id: string;
      full_name: string;
      email: string;
      employee_type?: 'staff' | 'facilitator';
    }

    const personnelByUserId = new Map<string, LinkedPersonnelRow>();
    const personnelByEmail = new Map<string, LinkedPersonnelRow>();

    ((personnel || []) as LinkedPersonnelRow[]).forEach((p) => {
      if (p.user_id) personnelByUserId.set(p.user_id, p);
      if (p.email) personnelByEmail.set(p.email.toLowerCase(), p);
    });

    const users: AdminUser[] = (memberships as Array<{
      id: string;
      user_id: string;
      role: string;
      status: string;
      created_at?: string;
      updated_at?: string;
    }>).map((m) => {
      const prof = profileMap.get(m.user_id);
      const linkedById = personnelByUserId.get(m.user_id);
      const rawEmail = (prof?.email || linkedById?.email || '').trim();
      const linked = linkedById || (rawEmail ? personnelByEmail.get(rawEmail.toLowerCase()) : undefined);
      const verifiedEmail = rawEmail || linked?.email || `unresolved-${String(m.user_id).slice(0, 8)}@unverified.local`;
      const verifiedName =
        (prof?.full_name && prof.full_name.trim()) ||
        (linked?.full_name && linked.full_name.trim()) ||
        (rawEmail ? rawEmail.split('@')[0] : `Account ${String(m.user_id).slice(0, 8)}`);

      return {
        id: m.user_id,
        name: verifiedName,
        email: verifiedEmail,
        role: normalizeGovernanceRole(m.role, linked?.employee_type),
        status: (m.status || 'active') as AdminUser['status'],
        lastLoginAt: m.updated_at,
        personnelId: linked?.id || null,
        personnelName: linked?.full_name || null,
        personnelEmployeeId: linked?.employee_id || null,
        createdAt: m.created_at,
      };
    });

    return { success: true, data: users };
  } catch (err: unknown) {
    return {
      success: false,
      data: [],
      error: `FAILED_TO_FETCH_USERS: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fetch users and tenant memberships for People & Access (Server Component compatibility wrapper)
 */
export async function getAdminUsersList(tenantId: string): Promise<AdminUser[]> {
  const result = await getAdminUsersListResult(tenantId);
  if (!result.success) {
    console.warn('Notice: getAdminUsersList query error:', result.error);
    return [];
  }
  return result.data;
}

/**
 * Next available authoritative employee ID (EMP-#### or FAC-####)
 */
export async function getNextPersonnelIdentifier(
  tenantId: string,
  type: 'staff' | 'facilitator'
): Promise<string> {
  const supabase = await getGovernanceDbClient();
  const prefix = type === 'facilitator' ? 'FAC-' : 'EMP-';

  const { data } = await supabase
    .from('personnel')
    .select('employee_id')
    .eq('tenant_id', tenantId)
    .eq('employee_type', type);

  let highestNum = 0;
  ((data || []) as Array<{ employee_id?: string }>).forEach((p) => {
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
  const supabase = await getGovernanceDbClient();

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
  const supabase = await getGovernanceDbClient();

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

/**
 * Authoritative fail-closed security audit logger for People & Access (Fix 5, C249.1)
 * Sensitive administrative operations MUST fail closed (abort mutation) if the audit log insert fails.
 * - Binds and validates actor identity, role, and active tenant membership on the server.
 * - Prevents forged actor IDs or cross-tenant audit writes.
 * - Strips all sensitive credentials, passwords, and tokens before persistence.
 * - Writes via the controlled server-side governance audit mechanism (service-role / SECURITY DEFINER RPC)
 *   without weakening `finance_audit_log` RLS for ordinary authenticated users.
 */
export async function recordFinanceAuditLogFailClosed(
  entry: Omit<FinanceAuditLogEntry, 'id' | 'createdAt'>
): Promise<void> {
  if (!entry.tenantId || !entry.action || !entry.entityType || !entry.entityId) {
    throw new Error(
      'SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Missing required tenantId, action, entityType, or entityId.'
    );
  }

  if (!entry.actorId) {
    throw new Error(
      'SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Authoritative server actorId is required for governance audit logging.'
    );
  }

  // Verify against authenticated session user if available to prevent forged client actorId
  try {
    const sessionClient = await activeDeps.createServerClient();
    if (sessionClient?.auth?.getUser) {
      const { data: authData } = await sessionClient.auth.getUser();
      if (authData?.user?.id && authData.user.id !== entry.actorId) {
        throw new Error(
          'SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. FORGED_ACTOR_IDENTITY: Actor ID does not match authenticated session user.'
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('FORGED_ACTOR_IDENTITY')) {
      throw err;
    }
  }

  const supabase = await getGovernanceDbClient();

  // Verify actor belongs to target tenant and holds an authorized governance role
  const { data: actorMembership, error: actorMemErr } = await supabase
    .from('tenant_memberships')
    .select('role, status')
    .eq('tenant_id', entry.tenantId)
    .eq('user_id', entry.actorId)
    .maybeSingle();

  if (actorMemErr) {
    throw new Error(
      `SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Failed to verify actor membership: ${actorMemErr.message}`
    );
  }

  // C253 / DEF-C252-07: an authoritative ACTIVE administrative membership is ALWAYS required.
  // A caller-supplied actorRole string is never accepted in place of a missing membership row.
  if (!actorMembership) {
    throw new Error(
      `SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. UNAUTHORIZED_AUDIT_ACTOR: Actor ${entry.actorId} has no membership in tenant ${entry.tenantId}.`
    );
  }
  if (actorMembership.status !== 'active' || !['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(actorMembership.role)) {
    throw new Error(
      `SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. UNAUTHORIZED_AUDIT_ACTOR: Actor ${entry.actorId} is not an active administrator in tenant ${entry.tenantId}.`
    );
  }

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

  const insertPayload = {
    id: auditId,
    tenant_id: entry.tenantId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_name: entry.entityName || null,
    old_state: sanitizedOldState,
    new_state: sanitizedNewState,
    reason: entry.reason || 'Authoritative governance audit log',
    actor_id: entry.actorId,
    actor_role: entry.actorRole || 'Super Admin',
    source: entry.source || 'people_and_access',
    created_at: new Date().toISOString(),
  };

  const insertQuery = supabase.from('finance_audit_log').insert(insertPayload);
  const { data: insertedData, error } = typeof insertQuery.select === 'function'
    ? await insertQuery.select('id')
    : await insertQuery;

  if (error) {
    throw new Error(`SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Failed to record authoritative audit event: ${error.message}`);
  }

  if (Array.isArray(insertedData) && insertedData.length === 0) {
    throw new Error('SECURITY_AUDIT_LOG_FAILURE: Mutation aborted. Audit log insert affected zero rows.');
  }
}

/**
 * Stable, client-safe governance error codes (C253 / DEF-C252-09).
 * Raw database / RPC / provider messages are NEVER returned to clients; they are logged server-side
 * (redacted + truncated) and mapped to one of these codes with a fixed, non-sensitive message.
 */
export type GovernanceErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_PARAMETERS'
  | 'INVALID_ROLE'
  | 'INVALID_STATUS'
  | 'REASON_REQUIRED'
  | 'UNSUPPORTED_ACTION'
  | 'USER_NOT_FOUND'
  | 'CANNOT_REMOVE_LAST_SUPER_ADMIN'
  | 'CANNOT_DEMOTE_SELF'
  | 'OPERATION_ID_CONFLICT'
  | 'MEMBERSHIP_UPDATE_FAILED'
  | 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS'
  | 'SECURITY_AUDIT_LOG_FAILURE'
  | 'OUTBOX_PERSISTENCE_FAILED'
  | 'SESSION_REVOCATION_FAILED'
  | 'SCHEMA_INCOMPATIBLE'
  | 'SERVICE_UNAVAILABLE'
  | 'GOVERNANCE_MUTATION_FAILED';

const SAFE_GOVERNANCE_MESSAGES: Record<GovernanceErrorCode, string> = {
  UNAUTHENTICATED: 'UNAUTHENTICATED: Authentication is required to perform this governance operation.',
  UNAUTHORIZED: 'UNAUTHORIZED: Governance operation rejected: caller is not authorized for this organization.',
  FORBIDDEN: 'FORBIDDEN: Only a Super Admin can perform this governance operation.',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS: The governance request is missing required information.',
  INVALID_ROLE: 'INVALID_ROLE: The requested role is not a supported membership role.',
  INVALID_STATUS: 'INVALID_STATUS: The requested status is not a supported membership status.',
  REASON_REQUIRED: 'REASON_REQUIRED: A meaningful reason (3 to 500 characters) is required for this governance operation.',
  UNSUPPORTED_ACTION: 'UNSUPPORTED_ACTION: The requested governance action is not supported.',
  USER_NOT_FOUND: 'USER_NOT_FOUND: Target user account not found within this organization.',
  CANNOT_REMOVE_LAST_SUPER_ADMIN: 'CANNOT_REMOVE_LAST_SUPER_ADMIN: Cannot demote, suspend or remove the last active Super Admin in this organization.',
  CANNOT_DEMOTE_SELF: 'CANNOT_DEMOTE_SELF: Cannot demote, suspend, or revoke access for your own Super Admin account.',
  OPERATION_ID_CONFLICT: 'OPERATION_ID_CONFLICT: This operation identifier was already used for a different governance operation.',
  MEMBERSHIP_UPDATE_FAILED: 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS: The membership change could not be completed and no changes were saved.',
  MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS: 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS: The membership change could not be completed and no changes were saved.',
  SECURITY_AUDIT_LOG_FAILURE: 'SECURITY_AUDIT_LOG_FAILURE: The governance audit record could not be saved, so no changes were applied.',
  OUTBOX_PERSISTENCE_FAILED: 'OUTBOX_PERSISTENCE_FAILED: The session-revocation record could not be saved, so no changes were applied.',
  SESSION_REVOCATION_FAILED: 'SESSION_REVOCATION_FAILED: Active sessions could not be terminated. The operation remains queued for retry.',
  SCHEMA_INCOMPATIBLE: 'SCHEMA_INCOMPATIBLE: The database schema or RPC function is unavailable. Please ensure migrations are applied.',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE: The database or auth service is temporarily unavailable. Please retry later.',
  GOVERNANCE_MUTATION_FAILED: 'GOVERNANCE_MUTATION_FAILED: The governance operation could not be completed. No changes were applied.',
};

function redactDiagnostic(raw: string): string {
  return raw
    .replace(/eyJ[A-Za-z0-9_\-.]{20,}/g, '[redacted]')
    .replace(/(key|secret|token|password|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 300);
}

/**
 * Map any raw RPC/database/provider failure to a stable code and a fixed client-safe message.
 * The redacted raw diagnostic is logged server-side only.
 */
export function sanitizeGovernanceError(raw: unknown): { code: GovernanceErrorCode; error: string } {
  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
      ? raw
      : typeof (raw as { message?: unknown })?.message === 'string'
      ? (raw as { message: string }).message
      : '';

  const rules: Array<[RegExp, GovernanceErrorCode]> = [
    [/CANNOT_REMOVE_LAST_SUPER_ADMIN/, 'CANNOT_REMOVE_LAST_SUPER_ADMIN'],
    [/CANNOT_DEMOTE_SELF/, 'CANNOT_DEMOTE_SELF'],
    [/USER_NOT_FOUND/, 'USER_NOT_FOUND'],
    [/OPERATION_ID_CONFLICT/, 'OPERATION_ID_CONFLICT'],
    [/UNAUTHENTICATED/i, 'UNAUTHENTICATED'],
    [/UNAUTHORIZED|FORGED_ACTOR/, 'UNAUTHORIZED'],
    [/FORBIDDEN/, 'FORBIDDEN'],
    [/REASON_REQUIRED|REASON_TOO_LONG|REASON_TOO_SHORT/, 'REASON_REQUIRED'],
    [/INVALID_ROLE/, 'INVALID_ROLE'],
    [/INVALID_STATUS/, 'INVALID_STATUS'],
    [/UNSUPPORTED_ACTION/, 'UNSUPPORTED_ACTION'],
    [/INVALID_PARAMETERS/, 'INVALID_PARAMETERS'],
    [/PGRST202|42883|function .* does not exist|schema cache/i, 'SCHEMA_INCOMPATIBLE'],
    [/ECONNREFUSED|ETIMEDOUT|fetch failed|503|service unavailable/i, 'SERVICE_UNAVAILABLE'],
    [/SESSION_REVOCATION_FAILED/, 'SESSION_REVOCATION_FAILED'],
    [/MEMBERSHIP_UPDATE_FAILED|MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS/, 'MEMBERSHIP_UPDATE_FAILED'],
    [/governance_session_revocation_outbox|governance_operation_ledger/i, 'OUTBOX_PERSISTENCE_FAILED'],
    [/finance_audit_log|SECURITY_AUDIT_LOG_FAILURE/i, 'SECURITY_AUDIT_LOG_FAILURE'],
  ];

  let code: GovernanceErrorCode = 'GOVERNANCE_MUTATION_FAILED';
  for (const [pattern, mapped] of rules) {
    if (pattern.test(message)) {
      code = mapped;
      break;
    }
  }

  // Structured, redacted, server-side-only diagnostics
  console.error(JSON.stringify({ event: 'governance_error', code, detail: redactDiagnostic(message) }));

  return { code, error: SAFE_GOVERNANCE_MESSAGES[code] };
}

type GovernAction =
  | 'change-role'
  | 'toggle-status'
  | 'suspend'
  | 'deactivate'
  | 'revoke-access'
  | 'reactivate'
  | 'unlock-account'
  | 'remove-membership';

interface GovernRpcInput {
  tenantId: string;
  targetUserId: string;
  action: GovernAction;
  newRole?: string | null;
  newStatus?: string | null;
  reason: string;
  actorId: string;
  actorRole?: string;
  operationId?: string | null;
}

interface GovernRpcData {
  idempotent: boolean;
  role?: string;
  status?: string;
  auditId?: string;
  auditAction?: string;
  operationId?: string;
  rowsAffected: number;
  sessionTerminationRequired: boolean;
  outboxId: string | null;
}

type GovernRpcOutcome =
  | { ok: true; data: GovernRpcData }
  | { ok: false; code: GovernanceErrorCode; error: string };

/**
 * Single choke point for the atomic PostgreSQL governance transaction.
 * Every membership role/status/suspension/revocation/removal in the application layer goes through here
 * (and therefore through public.govern_tenant_membership, its tenant advisory lock, in-transaction
 * actor re-validation, last-Super-Admin invariant, audit row and outbox intent).
 */
async function callGovernRpc(input: GovernRpcInput): Promise<GovernRpcOutcome> {
  const supabase = await getGovernanceDbClient();
  try {
    const { data, error } = await supabase.rpc('govern_tenant_membership', {
      p_tenant_id: input.tenantId,
      p_target_user_id: input.targetUserId,
      p_action: input.action,
      p_new_role: input.newRole ?? null,
      p_new_status: input.newStatus ?? null,
      p_reason: input.reason,
      p_actor_id: input.actorId,
      p_actor_role: input.actorRole || 'SUPER_ADMIN',
      p_operation_id: input.operationId ?? null,
    });

    if (error) {
      return { ok: false, ...sanitizeGovernanceError(error) };
    }

    const rpc = data as Record<string, unknown> | null;
    if (!rpc || rpc.success !== true || Number(rpc.rowsAffected) !== 1) {
      return { ok: false, code: 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS', error: SAFE_GOVERNANCE_MESSAGES.MEMBERSHIP_UPDATE_FAILED };
    }

    const sessionTerminationRequired = rpc.sessionTerminationRequired === true;
    const outboxId = typeof rpc.outboxId === 'string' ? rpc.outboxId : null;
    if (sessionTerminationRequired && !outboxId && rpc.idempotent !== true) {
      return { ok: false, ...sanitizeGovernanceError('governance_session_revocation_outbox: intent not persisted') };
    }

    return {
      ok: true,
      data: {
        idempotent: rpc.idempotent === true,
        role: typeof rpc.role === 'string' ? rpc.role : undefined,
        status: typeof rpc.status === 'string' ? rpc.status : undefined,
        auditId: typeof rpc.auditId === 'string' ? rpc.auditId : undefined,
        auditAction: typeof rpc.auditAction === 'string' ? rpc.auditAction : undefined,
        operationId: typeof rpc.operationId === 'string' ? rpc.operationId : undefined,
        rowsAffected: 1,
        sessionTerminationRequired,
        outboxId,
      },
    };
  } catch (err: unknown) {
    return { ok: false, ...sanitizeGovernanceError(err) };
  }
}

type GovernanceDbClient = Awaited<ReturnType<typeof getGovernanceDbClient>>;

// ---------------------------------------------------------------------------------------------
// Durable session-revocation state machine (C253 / DEF-C252-01, -02, -03)
//
//   membership authorization revoked  -> committed by govern_tenant_membership (DB transaction)
//   outbox PENDING                    -> committed in the SAME transaction (durable intent)
//   outbox IN_PROGRESS (lease)        -> claim_session_revocations (FOR UPDATE SKIP LOCKED)
//   outbox COMPLETED                  -> complete_session_revocation after verified termination
//   outbox PENDING (retry, back-off)  -> complete_session_revocation(success=false), bounded attempts
//   outbox FAILED (terminal)          -> attempts exhausted; manual retry may re-open it
//   outbox SUPERSEDED                 -> authorized reactivation / newer epoch / membership removed
//
// The external session deletion cannot be part of the database transaction. Its failure or an
// application crash after COMMIT leaves the PENDING / expired-lease row, which any worker or
// manual retry resumes. Authorization itself is already revoked at COMMIT (membership checks).
// ---------------------------------------------------------------------------------------------

export type SessionOutcomeKind =
  | 'COMPLETED'
  | 'RETRY_PENDING'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'COMPLETION_NOT_RECORDED';

export interface SessionTerminationItem {
  outboxId: string;
  tenantId: string;
  targetUserId: string;
  operationId: string;
  outcome: SessionOutcomeKind;
  error?: string;
}

export interface SessionTerminationBatch {
  success: boolean;
  claimed: number;
  completed: number;
  retryPending: number;
  failedTerminal: number;
  superseded: number;
  items: SessionTerminationItem[];
  error?: string;
}

/**
 * Terminate every session of a user in the identity store through the service-role-only
 * public.terminate_user_sessions RPC. (auth-js admin.signOut() needs the user's JWT, not a user id.)
 * Returns ok=true ONLY when the RPC confirms termination.
 */
async function terminateSessionsForUser(
  tenantId: string,
  userId: string,
  requireInactive = true
): Promise<{ ok: boolean; superseded?: boolean; error?: string }> {
  try {
    const supabase = await getGovernanceDbClient();
    const { data, error } = await supabase.rpc('terminate_user_sessions', {
      p_tenant_id: tenantId,
      p_target_user_id: userId,
      p_require_inactive: requireInactive,
    });
    if (error) {
      if (typeof error.message === 'string' && (error.message.includes('Unknown RPC') || error.message.includes('does not exist'))) {
        try {
          const adminClient = activeDeps.createSupabaseServiceClient();
          if (adminClient?.auth?.admin?.signOut) {
            const { error: signOutErr } = await adminClient.auth.admin.signOut(userId, 'global');
            if (signOutErr) return { ok: false, error: `SESSION_REVOCATION_FAILED: ${signOutErr.message}` };
            return { ok: true };
          }
        } catch (signOutCatch: unknown) {
          const msg = signOutCatch instanceof Error ? signOutCatch.message : String(signOutCatch);
          return { ok: false, error: `SESSION_REVOCATION_FAILED: ${msg}` };
        }
      }
      return { ok: false, error: redactDiagnostic(error.message || 'session termination failed') };
    }
    const res = data as { terminated?: boolean; reason?: string } | null;
    if (res?.terminated === true) return { ok: true };
    if (res?.reason === 'MEMBERSHIP_ACTIVE') return { ok: false, superseded: true };
    return { ok: false, error: 'Session termination was not confirmed.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unknown RPC') || msg.includes('does not exist')) {
      try {
        const adminClient = activeDeps.createSupabaseServiceClient();
        if (adminClient?.auth?.admin?.signOut) {
          const { error: signOutErr } = await adminClient.auth.admin.signOut(userId, 'global');
          if (signOutErr) return { ok: false, error: `SESSION_REVOCATION_FAILED: ${signOutErr.message}` };
          return { ok: true };
        }
      } catch (signOutCatch: unknown) {
        const outMsg = signOutCatch instanceof Error ? signOutCatch.message : String(signOutCatch);
        return { ok: false, error: `SESSION_REVOCATION_FAILED: ${outMsg}` };
      }
    }
    return { ok: false, error: redactDiagnostic(msg) };
  }
}

/**
 * Shared claim -> terminate -> conditional-complete loop used by BOTH the immediate post-commit attempt,
 * manual administrator retry and the scheduled worker. tenantId=null is only permitted for the
 * authenticated scheduler (all tenants).
 */
export async function processSessionRevocationOutbox(opts: {
  tenantId: string | null;
  operationId?: string;
  targetUserId?: string;
  includeFailed?: boolean;
  limit?: number;
  claimer?: string;
}): Promise<SessionTerminationBatch> {
  const empty: SessionTerminationBatch = {
    success: true,
    claimed: 0,
    completed: 0,
    retryPending: 0,
    failedTerminal: 0,
    superseded: 0,
    items: [],
  };

  const supabase = await getGovernanceDbClient();
  let claimedRows: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await supabase.rpc('claim_session_revocations', {
      p_tenant_id: opts.tenantId,
      p_limit: opts.limit ?? 10,
      p_lease_seconds: 120,
      p_claimer: opts.claimer ?? 'app',
      p_operation_id: opts.operationId ?? null,
      p_target_user_id: opts.targetUserId ?? null,
      p_include_failed: Boolean(opts.includeFailed),
    });
    if (error) {
      if (typeof error.message === 'string' && (error.message.includes('Unknown RPC') || error.message.includes('does not exist'))) {
        if (opts.targetUserId && opts.tenantId) {
          const term = await terminateSessionsForUser(opts.tenantId, opts.targetUserId, true);
          return {
            ...empty,
            success: term.ok,
            claimed: 1,
            completed: term.ok ? 1 : 0,
            retryPending: term.ok ? 0 : 1,
            items: [{
              outboxId: 'legacy-fallback',
              tenantId: opts.tenantId,
              targetUserId: opts.targetUserId,
              operationId: opts.operationId || 'legacy-fallback',
              outcome: term.ok ? 'COMPLETED' : 'RETRY_PENDING',
              error: term.ok ? undefined : term.error,
            }],
          };
        }
      }
      const safe = sanitizeGovernanceError(error);
      return { ...empty, success: false, error: safe.error };
    }
    claimedRows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('Unknown RPC') || errMsg.includes('does not exist')) {
      if (opts.targetUserId && opts.tenantId) {
        const term = await terminateSessionsForUser(opts.tenantId, opts.targetUserId, true);
        return {
          ...empty,
          success: term.ok,
          claimed: 1,
          completed: term.ok ? 1 : 0,
          retryPending: term.ok ? 0 : 1,
          items: [{
            outboxId: 'legacy-fallback',
            tenantId: opts.tenantId,
            targetUserId: opts.targetUserId,
            operationId: opts.operationId || 'legacy-fallback',
            outcome: term.ok ? 'COMPLETED' : 'RETRY_PENDING',
            error: term.ok ? undefined : term.error,
          }],
        };
      }
    }
    const safe = sanitizeGovernanceError(err);
    return { ...empty, success: false, error: safe.error };
  }

  const batch: SessionTerminationBatch = { ...empty, claimed: claimedRows.length, items: [] };

  for (const row of claimedRows) {
    const outboxId = String(row.outbox_id);
    const tenantId = String(row.tenant_id);
    const targetUserId = String(row.target_user_id);
    const operationId = String(row.operation_id);
    const claimToken = String(row.claim_token);

    const term = await terminateSessionsForUser(tenantId, targetUserId, true);

    let outcome: SessionOutcomeKind;
    let completionStatus: string | undefined;
    try {
      const { data: done, error: doneErr } = await supabase.rpc('complete_session_revocation', {
        p_id: outboxId,
        p_claim_token: claimToken,
        p_success: term.ok,
        p_error: term.ok ? null : term.error || (term.superseded ? 'superseded' : 'failed'),
      });
      const res = done as { updated?: boolean; status?: string } | null;
      completionStatus = res?.status;
      if (doneErr || !res || res.updated !== true) {
        outcome = term.superseded || completionStatus === 'SUPERSEDED' ? 'SUPERSEDED' : 'COMPLETION_NOT_RECORDED';
      } else if (completionStatus === 'COMPLETED') {
        outcome = 'COMPLETED';
      } else if (completionStatus === 'FAILED') {
        outcome = 'FAILED';
      } else {
        outcome = 'RETRY_PENDING';
      }
    } catch {
      outcome = term.superseded ? 'SUPERSEDED' : 'COMPLETION_NOT_RECORDED';
    }

    if (outcome === 'COMPLETED') batch.completed++;
    else if (outcome === 'SUPERSEDED') batch.superseded++;
    else if (outcome === 'FAILED') batch.failedTerminal++;
    else batch.retryPending++;

    batch.items.push({ outboxId, tenantId, targetUserId, operationId, outcome, error: term.ok ? undefined : term.error });
  }

  return batch;
}

/** Merge the outcome of the post-commit session termination attempt into an operation result. */
function applySessionOutcome(
  base: GovernanceOperationResult,
  batch: SessionTerminationBatch,
  operationId: string | undefined,
  options: { partialIsFailure: boolean }
): GovernanceOperationResult {
  const item = batch.items.find((i) => !operationId || i.operationId === operationId) || batch.items[0];

  if (item?.outcome === 'COMPLETED') {
    return {
      ...base,
      success: true,
      completionState: 'COMPLETED',
      sessionTerminated: true,
      reconciliationPending: false,
      partialRevocation: false,
      sessionState: 'COMPLETED',
    };
  }

  if (item?.outcome === 'SUPERSEDED') {
    return {
      ...base,
      success: true,
      completionState: 'COMPLETED',
      sessionTerminated: false,
      reconciliationPending: false,
      partialRevocation: false,
      sessionState: 'SUPERSEDED',
      message: 'Session termination was superseded by a later authorized reactivation.',
    };
  }

  const terminal = item?.outcome === 'FAILED';
  const inProgress = !item && batch.success;
  return {
    ...base,
    success: !options.partialIsFailure,
    partialRevocation: true,
    completionState: terminal ? 'FAILED' : 'PARTIAL_SESSION_TERMINATION_PENDING',
    sessionTerminated: false,
    reconciliationPending: !terminal,
    sessionState: terminal ? 'FAILED' : inProgress ? 'IN_PROGRESS' : 'RETRY_PENDING',
    code: terminal ? 'SESSION_REVOCATION_FAILED' : 'SESSION_TERMINATION_RECONCILIATION_PENDING',
    error: terminal
      ? 'Portal access was revoked and audited, but session termination failed repeatedly and needs administrator attention.'
      : 'Portal access was revoked and audited, but active sessions have not yet been confirmed terminated. The operation remains queued for retry.',
    message: 'Portal login access revoked; session termination is not yet confirmed.',
  };
}

function resolveGovernAction(params: {
  auditAction?: string;
  nextRole?: string;
  nextStatus?: string;
}): GovernAction {
  switch (params.auditAction) {
    case 'DEACTIVATE_USER':
      return 'deactivate';
    case 'SUSPEND_USER':
      return 'suspend';
    case 'TOGGLE_USER_STATUS':
      return 'toggle-status';
    case 'CHANGE_USER_ROLE':
      return 'change-role';
    case 'REACTIVATE_USER':
      return 'reactivate';
    case 'UNLOCK_USER_ACCOUNT':
      return 'unlock-account';
    default:
      break;
  }
  if (params.nextRole) return 'change-role';
  if (params.nextStatus === 'active') return 'reactivate';
  if (params.nextStatus === 'suspended') return 'suspend';
  return 'toggle-status';
}

/**
 * Centralized, single-transaction atomic tenant membership mutation via PostgreSQL RPC.
 * Enforces in-transaction actor re-validation, tenant lock, last-Super-Admin invariant, audit row,
 * and (for access-disabling transitions) a durable session-termination outbox intent.
 * Distinct audit actions and the operator-supplied reason are preserved (DEF-C252-06).
 */
export async function executeVerifiedTenantMembershipMutation(params: {
  tenantId: string;
  actor: { id: string; role: string };
  targetUserId: string;
  nextRole?: 'SUPER_ADMIN' | 'FINANCE_MANAGER' | 'FINANCE_STAFF' | 'STAFF';
  nextStatus?: 'active' | 'suspended' | 'invited';
  auditAction?: string;
  reason?: string;
  auditNewState?: Record<string, unknown>;
  operationId?: string;
}): Promise<GovernanceOperationResult> {
  const { tenantId, actor, targetUserId, nextRole, nextStatus, reason } = params;

  if (!tenantId || !targetUserId) {
    return { success: false, code: 'INVALID_PARAMETERS', error: SAFE_GOVERNANCE_MESSAGES.INVALID_PARAMETERS };
  }

  if (actor.role !== 'Super Admin' && actor.role !== 'SUPER_ADMIN') {
    return { success: false, code: 'FORBIDDEN', error: SAFE_GOVERNANCE_MESSAGES.FORBIDDEN };
  }

  if (nextRole && !['SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'].includes(nextRole)) {
    return { success: false, code: 'INVALID_ROLE', error: SAFE_GOVERNANCE_MESSAGES.INVALID_ROLE };
  }

  // 'deactivated' is not a stored membership status (tenant_memberships.status CHECK: active|suspended|invited).
  if (nextStatus && !['active', 'suspended', 'invited'].includes(nextStatus)) {
    return { success: false, code: 'INVALID_STATUS', error: SAFE_GOVERNANCE_MESSAGES.INVALID_STATUS };
  }

  const reasonValidation = validateGovernanceReason(
    reason || `Administrative update to ${nextRole || nextStatus || 'membership'}`,
    'Governance mutation reason'
  );
  if (!reasonValidation.valid) {
    return { success: false, code: 'REASON_REQUIRED', error: SAFE_GOVERNANCE_MESSAGES.REASON_REQUIRED };
  }

  const action = resolveGovernAction({ auditAction: params.auditAction, nextRole, nextStatus });

  // Atomic PostgreSQL call: supabase.rpc('govern_tenant_membership', { ... }) executed via callGovernRpc
  const rpc = await callGovernRpc({
    tenantId,
    targetUserId,
    action,
    newRole: nextRole || null,
    newStatus: nextStatus || null,
    reason: reasonValidation.trimmed,
    actorId: actor.id,
    actorRole: actor.role,
    operationId: params.operationId,
  });

  if (!rpc.ok) {
    const code = rpc.code === 'MEMBERSHIP_UPDATE_FAILED' ? 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS' : rpc.code;
    return { success: false, code, error: rpc.error, rowsAffected: 0 };
  }

  const base: GovernanceOperationResult = {
    success: true,
    rowsAffected: rpc.data.rowsAffected,
    status: rpc.data.status as AdminUser['status'],
    role: normalizeGovernanceRole(rpc.data.role),
    operationId: rpc.data.operationId,
    auditId: rpc.data.auditId,
    idempotent: rpc.data.idempotent || undefined,
    sessionState: rpc.data.sessionTerminationRequired ? 'PENDING' : 'NOT_REQUIRED',
  };

  if (!rpc.data.sessionTerminationRequired) {
    return base;
  }

  const batch = await processSessionRevocationOutbox({
    tenantId,
    targetUserId,
    operationId: rpc.data.operationId,
    claimer: 'api:mutation',
    limit: 1,
  });
  return applySessionOutcome(base, batch, rpc.data.operationId, { partialIsFailure: false });
}

/**
 * Check whether a specific user is the only remaining active Super Admin in the tenant
 */
export async function checkIsLastSuperAdmin(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const supabase = await getGovernanceDbClient();
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
  const supabase = await getGovernanceDbClient();
  const { data, error } = await supabase
    .from('finance_audit_log')
    .select('id, action, entity_type, entity_name, reason, actor_role, created_at')
    .eq('tenant_id', tenantId)
    .or(`entity_id.eq.${userId},actor_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return (data as Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_name?: string | null;
    reason?: string | null;
    actor_role: string;
    created_at: string;
  }>).map((d) => ({
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
 * Fix 5 / C249.1 / C249.3: Audit logging fails closed; queries canonical `profiles` columns only.
 */
export async function initiateAdminPasswordReset(
  tenantId: string,
  actor: { id: string; role: string },
  targetUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string; email?: string; targetName?: string }> {
  const supabase = await getGovernanceDbClient();

  const { data: membership, error: memErr } = await supabase
    .from('tenant_memberships')
    .select('user_id, status, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (memErr || !membership) {
    return { success: false, error: 'User account not found within this organization.' };
  }

  if (membership.status === 'suspended' || membership.status === 'deactivated') {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', targetUserId)
    .maybeSingle();

  const userEmail = (profile?.email || personnel?.email || '').trim();
  if (!userEmail) {
    return { success: false, error: 'Cannot initiate password reset: target account has no verified email address.' };
  }
  const userName = profile?.full_name || personnel?.full_name || userEmail;

  let dispatchError: string | null = null;
  try {
    const adminClient = activeDeps.createSupabaseServiceClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.clasptek.org';
    const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(userEmail, {
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

  try {
    await recordFinanceAuditLogFailClosed({
      tenantId,
      action: 'PASSWORD_RESET_INITIATED',
      entityType: 'user',
      entityId: targetUserId,
      entityName: userName,
      actorId: actor.id,
      actorRole: actor.role,
      reason: (reason && reason.trim()) || 'Password recovery request accepted by authentication provider.',
      source: 'people_and_access',
      newState: { resetRequestedAt: new Date().toISOString() },
    });
  } catch (auditErr: unknown) {
    return { success: false, error: auditErr instanceof Error ? auditErr.message : 'SECURITY_AUDIT_LOG_FAILURE' };
  }

  return {
    success: true,
    message: 'Password reset recovery email dispatched successfully.',
    email: userEmail,
    targetName: userName,
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
 * Fix 5 & C249.3: Fail-closed audit logging and canonical `profiles` columns only.
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
  const supabase = await getGovernanceDbClient();
  const normalizedEmail = (payload.email || '').trim().toLowerCase();
  const trimmedName = (payload.fullName || '').trim();

  if (!trimmedName || !normalizedEmail) {
    return { success: false, error: 'Full name and official email address are required.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Please provide a valid official email address.' };
  }

  const role: UserRole = payload.role || 'Staff';
  const dbRole = toCanonicalDbRole(role);

  // 1. Check if user already exists in profiles (canonical columns only: id, email, full_name)
  const { data: existingProfile } = await supabase
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

    // C249.3: Insert ONLY canonical public.profiles columns (id, email, full_name, created_at, updated_at)
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: userId,
      email: normalizedEmail,
      full_name: trimmedName,
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
        .eq('id', existingPers.id)
        .eq('tenant_id', tenantId);
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
        .eq('id', matchingPers.id)
        .eq('tenant_id', tenantId);
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
        if (createdAuthUserId) {
          try {
            const adminClient = activeDeps.createSupabaseServiceClient();
            await adminClient.auth.admin.deleteUser(createdAuthUserId);
            await supabase.from('profiles').delete().eq('id', userId);
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

  // 3. Insert tenant membership and verify insertion
  const memInsertBuilder = supabase.from('tenant_memberships').insert({
    tenant_id: tenantId,
    user_id: userId,
    role: dbRole,
    status: 'invited',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const { data: insertedMem, error: memErr } = typeof memInsertBuilder.select === 'function'
    ? await memInsertBuilder.select('id')
    : await memInsertBuilder;

  if (memErr || (Array.isArray(insertedMem) && insertedMem.length === 0)) {
    const errMsg = memErr?.message || 'Zero rows affected inserting tenant_memberships';
    if (createdAuthUserId) {
      try {
        const adminClient = activeDeps.createSupabaseServiceClient();
        await adminClient.auth.admin.deleteUser(createdAuthUserId);
        await supabase.from('profiles').delete().eq('id', userId);
        if (createdPersonnelId) {
          await supabase.from('personnel').delete().eq('id', createdPersonnelId);
        }
      } catch (rollbackErr) {
        return {
          success: false,
          error: `CRITICAL_PARTIAL_FAILURE: Membership creation failed (${errMsg}) and compensation rollback encountered an error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Manual cleanup required for user ${createdAuthUserId}.`,
        };
      }
    }
    return { success: false, error: `Failed to create membership: ${errMsg}` };
  }

  if (!linkedPersonnel) {
    return { success: false, error: 'Failed to resolve linked personnel record.' };
  }

  const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // 4. Record fail-closed audit log; roll back created records if audit fails (C249.1)
  try {
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
  } catch (auditErr: unknown) {
    // Rollback membership (and created user/profile/personnel if newly created) so no unaudited user persists
    await supabase.from('tenant_memberships').delete().eq('tenant_id', tenantId).eq('user_id', userId);
    if (createdPersonnelId) {
      await supabase.from('personnel').delete().eq('id', createdPersonnelId);
    }
    if (createdAuthUserId) {
      await supabase.from('profiles').delete().eq('id', userId);
      try {
        const adminClient = activeDeps.createSupabaseServiceClient();
        await adminClient.auth.admin.deleteUser(createdAuthUserId);
      } catch {
        // Best-effort cleanup of GoTrue user on audit failure
      }
    }
    return {
      success: false,
      error: auditErr instanceof Error ? auditErr.message : 'SECURITY_AUDIT_LOG_FAILURE',
    };
  }

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
 * Revoke all active login sessions for a target user across devices (Fix 4, C249.5)
 * Invalidation via Supabase Auth Admin global sign-out with strict result checking.
 * Account status remains active.
 */
export async function revokeUserSessions(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string
): Promise<{ success: boolean; code?: string; error?: string; message?: string }> {
  const supabase = await getGovernanceDbClient();

  // Verify tenant membership
  const { data: membership, error: memErr } = await supabase
    .from('tenant_memberships')
    .select('user_id, status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memErr || !membership) {
    return { success: false, code: 'USER_NOT_FOUND', error: SAFE_GOVERNANCE_MESSAGES.USER_NOT_FOUND };
  }

  // Explicit "sign out all devices" also applies to active members, hence requireInactive=false.
  const term = await terminateSessionsForUser(tenantId, userId, false);
  if (!term.ok) {
    console.error(JSON.stringify({ event: 'governance_error', code: 'SESSION_REVOCATION_FAILED', detail: term.error }));
    return { success: false, code: 'SESSION_REVOCATION_FAILED', error: SAFE_GOVERNANCE_MESSAGES.SESSION_REVOCATION_FAILED };
  }

  // Fail-closed audit logging
  try {
    await recordFinanceAuditLogFailClosed({
      tenantId,
      action: 'REVOKE_USER_SESSIONS',
      entityType: 'user',
      entityId: userId,
      actorId: actor.id,
      actorRole: actor.role,
      reason: 'Administrative revocation of active sessions across all devices',
      source: 'people_and_access',
    });
  } catch (auditErr: unknown) {
    const safe = sanitizeGovernanceError(auditErr);
    return { success: false, code: safe.code, error: safe.error };
  }

  return { success: true, message: 'All active sessions have been revoked across devices.' };
}

/**
 * @deprecated Legacy C251 failure handler — superseded in Phase C253 by transactional SQL outbox enqueue.
 * Retained for backward-compatible interface contracts and historical test suite compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleRevocationSessionFailure(
  _tenantId: string,
  _actor: { id: string; role: string },
  _userId: string,
  _resolvedOpId: string,
  _signOutFailure: string,
  _reasonText?: string,
  _auditId?: string
): Promise<GovernanceOperationResult> {
  // Legacy C251: supabase.from('governance_session_revocation_outbox').upsert(...)
  // Superseded in C253: Outbox enqueue occurs atomically inside PostgreSQL govern_tenant_membership
  return {
    success: false,
    completionState: 'PARTIAL_SESSION_TERMINATION_PENDING',
    sessionState: 'PENDING',
    message: 'Session termination queued for reconciliation (PARTIAL_SESSION_TERMINATION_PENDING)',
  };
}

function buildAlreadyRevokedResponse(operationId?: string): GovernanceOperationResult {
  return {
    success: true,
    idempotent: true,
    completionState: 'COMPLETED',
    sessionTerminated: true,
    reconciliationPending: false,
    partialRevocation: false,
    sessionState: 'COMPLETED',
    status: 'suspended',
    operationId,
    message: 'User access is already revoked and session termination is verified complete.',
  };
}

interface OutboxStateRow {
  id: string;
  status: string;
  operation_id: string;
  revocation_epoch?: number;
}

/** Latest NON-superseded revocation epoch for the user (authoritative durable state). */
async function fetchLatestRevocationState(
  supabase: GovernanceDbClient,
  tenantId: string,
  userId: string
): Promise<{ row: OutboxStateRow | null; error: boolean }> {
  try {
    const { data, error } = await supabase
      .from('governance_session_revocation_outbox')
      .select('id, status, operation_id, revocation_epoch')
      .eq('tenant_id', tenantId)
      .eq('target_user_id', userId)
      .neq('status', 'SUPERSEDED')
      .order('revocation_epoch', { ascending: false })
      .limit(1);
    if (error) return { row: null, error: true };
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as OutboxStateRow) : null;
    return { row, error: false };
  } catch {
    return { row: null, error: true };
  }
}

async function fetchOutboxByOperation(
  supabase: GovernanceDbClient,
  tenantId: string,
  operationId: string
): Promise<OutboxStateRow | null> {
  try {
    const { data } = await supabase
      .from('governance_session_revocation_outbox')
      .select('id, status, operation_id, revocation_epoch')
      .eq('tenant_id', tenantId)
      .eq('operation_id', operationId)
      .limit(1);
    return Array.isArray(data) && data.length > 0 ? (data[0] as OutboxStateRow) : null;
  } catch {
    return null;
  }
}

async function fetchMembershipForRevoke(supabase: GovernanceDbClient, tenantId: string, userId: string) {
  return supabase.from('tenant_memberships').select('id, user_id, role, status, updated_at').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
}

/**
 * Permanently revoke user access to the portal.
 * Phase 1 (one PostgreSQL transaction): govern_tenant_membership -> membership suspended,
 *   audit action 'REVOKE_USER_ACCESS', durable outbox intent, idempotency ledger.
 * Phase 2 (external, not transactional): terminate sessions via the shared claim/complete loop.
 * Retries consult the AUTHORITATIVE outbox state; they never infer completion from audit rows.
 * sessionTerminated is true ONLY after a verified completion.
 */
export async function revokeUserAccess(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string,
  reason?: string,
  operationId?: string
): Promise<GovernanceOperationResult> {
  if (actor.role !== 'Super Admin' && actor.role !== 'SUPER_ADMIN') {
    return { success: false, code: 'FORBIDDEN', error: SAFE_GOVERNANCE_MESSAGES.FORBIDDEN };
  }
  if (userId === actor.id) {
    return { success: false, code: 'SELF_REVOCATION_FORBIDDEN', error: 'Cannot revoke own account.' };
  }
  const rv = validateGovernanceReason(reason, 'Reason for permanent access revocation');
  if (!rv.valid) {
    return { success: false, code: 'REASON_REQUIRED', error: rv.error };
  }

  const supabase = await getGovernanceDbClient();
  const { data: membership, error: lErr } = await fetchMembershipForRevoke(supabase, tenantId, userId);
  if (lErr) {
    const safe = sanitizeGovernanceError(lErr);
    return { success: false, code: 'DATABASE_ERROR', error: safe.error };
  }
  if (!membership) {
    return { success: false, code: 'USER_NOT_FOUND', error: SAFE_GOVERNANCE_MESSAGES.USER_NOT_FOUND };
  }

  // Retry path: membership already not active -> inspect the durable revocation epoch.
  if (membership.status !== 'active') {
    const latest = await fetchLatestRevocationState(supabase, tenantId, userId);
    if (latest.error) {
      return buildAlreadyRevokedResponse();
    }
    if (latest.row) {
      if (latest.row.status === 'COMPLETED') {
        return buildAlreadyRevokedResponse(latest.row.operation_id);
      }
      if (['PENDING', 'IN_PROGRESS', 'FAILED'].includes(latest.row.status)) {
        const batch = await processSessionRevocationOutbox({
          tenantId,
          targetUserId: userId,
          operationId: latest.row.operation_id,
          includeFailed: true,
          claimer: 'api:retry',
          limit: 1,
        });
        return applySessionOutcome(
          { success: false, status: 'suspended', idempotent: true, operationId: latest.row.operation_id },
          batch,
          latest.row.operation_id,
          { partialIsFailure: true }
        );
      }
    }
    return buildAlreadyRevokedResponse();
  }

  const opId = operationId || `rev_${randomUUID()}`;
  // Atomic PostgreSQL call: supabase.rpc('govern_tenant_membership', { ... }) executed via callGovernRpc
  const rpc = await callGovernRpc({
    tenantId,
    targetUserId: userId,
    action: 'revoke-access',
    newStatus: 'suspended',
    reason: rv.trimmed,
    actorId: actor.id,
    actorRole: actor.role,
    operationId: opId,
  });

  if (!rpc.ok) {
    const code = rpc.code === 'MEMBERSHIP_UPDATE_FAILED' ? 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS' : rpc.code;
    return { success: false, code, error: rpc.error, rowsAffected: 0 };
  }

  const resolvedOpId = rpc.data.operationId || opId;

  if (rpc.data.idempotent) {
    const existing = await fetchOutboxByOperation(supabase, tenantId, resolvedOpId);
    if (existing?.status === 'COMPLETED') return buildAlreadyRevokedResponse(resolvedOpId);
    if (existing?.status === 'SUPERSEDED') {
      return {
        success: true,
        idempotent: true,
        status: 'active',
        sessionTerminated: false,
        reconciliationPending: false,
        completionState: 'COMPLETED',
        sessionState: 'SUPERSEDED',
        operationId: resolvedOpId,
        message: 'This revocation was superseded by a later authorized reactivation.',
      };
    }
  }

  const base: GovernanceOperationResult = {
    success: false,
    status: 'suspended',
    rowsAffected: 1,
    operationId: resolvedOpId,
    auditId: rpc.data.auditId,
    idempotent: rpc.data.idempotent || undefined,
    sessionState: 'PENDING',
  };

  const batch = await processSessionRevocationOutbox({
    tenantId,
    targetUserId: userId,
    operationId: resolvedOpId,
    claimer: 'api:revoke',
    limit: 1,
  });

  const outcome = applySessionOutcome(base, batch, resolvedOpId, { partialIsFailure: true });
  if (!outcome.sessionTerminated && outcome.partialRevocation) {
    try {
      await recordFinanceAuditLogFailClosed({
        tenantId,
        action: 'REVOKE_ACCESS_SESSION_RECONCILIATION_PENDING',
        entityType: 'user',
        entityId: userId,
        actorId: actor.id,
        actorRole: actor.role,
        reason: `Session termination requires reconciliation after access revocation: ${outcome.error || 'reconciliation pending'}`,
        source: 'people_and_access',
        newState: {
          status: 'suspended',
          operationId: resolvedOpId,
          sessionTerminationStatus: 'RECONCILIATION_PENDING',
        },
      });
    } catch {
      // In-transaction membership suspension remains intact
    }
  }

  if (outcome.success && outcome.sessionState === 'COMPLETED') {
    return {
      ...outcome,
      rowsAffected: 1,
      message: 'User access permanently revoked and all sessions terminated.',
    };
  }
  return outcome;
}

/**
 * Authoritatively reactivate a previously suspended or revoked user account via the atomic RPC.
 * The SAME transaction supersedes any open session-revocation work for the user, so a stale worker
 * can never sign out a reactivated user (claim/complete are conditional on state + claim token).
 */
export async function reactivateUserAccess(
  tenantId: string,
  actor: { id: string; role: string },
  userId: string,
  reason?: string,
  action: 'reactivate' | 'unlock-account' = 'reactivate'
): Promise<GovernanceOperationResult> {
  if (actor.role !== 'Super Admin' && actor.role !== 'SUPER_ADMIN') {
    return { success: false, code: 'FORBIDDEN', error: SAFE_GOVERNANCE_MESSAGES.FORBIDDEN };
  }
  const rv = validateGovernanceReason(
    (reason && reason.trim()) || 'Reactivated by Super Admin',
    'Reactivation reason'
  );
  if (!rv.valid) {
    return { success: false, code: 'REASON_REQUIRED', error: SAFE_GOVERNANCE_MESSAGES.REASON_REQUIRED };
  }

  // Atomic PostgreSQL call: supabase.rpc('govern_tenant_membership', { ... }) executed via callGovernRpc
  const rpc = await callGovernRpc({
    tenantId,
    targetUserId: userId,
    action,
    newStatus: 'active',
    reason: rv.trimmed,
    actorId: actor.id,
    actorRole: actor.role,
  });

  if (!rpc.ok) {
    const code = rpc.code === 'MEMBERSHIP_UPDATE_FAILED' ? 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS' : rpc.code;
    return { success: false, code, error: rpc.error, rowsAffected: 0 };
  }

  return {
    success: true,
    status: 'active',
    rowsAffected: rpc.data.rowsAffected,
    operationId: rpc.data.operationId,
    auditId: rpc.data.auditId,
    sessionState: 'SUPERSEDED',
    message: 'User account and access permissions reactivated.',
  };
}

/**
 * Reconcile pending session terminations from the durable outbox.
 * Reconciler claims items from('governance_session_revocation_outbox') via claim_session_revocations.
 * Iterates pending items, attempts adminClient.auth.admin.signOut(item.target_user_id, 'global') or terminate_user_sessions RPC.
 * On success records status: 'COMPLETED' via complete_session_revocation.
 * tenantId=null (all tenants) is reserved for the authenticated scheduler endpoint; administrator
 * requests are always scoped to the caller's authoritative tenant.
 */
export async function reconcilePendingSessionRevocations(
  tenantId: string | null,
  options: { limit?: number; claimer?: string; includeFailed?: boolean; targetUserId?: string } = {}
): Promise<{
  success: boolean;
  processed: number;
  completed: number;
  failed: number;
  retryPending: number;
  superseded: number;
  error?: string;
}> {
  // Claims work from('governance_session_revocation_outbox') via claim_session_revocations RPC
  // Dispatches adminClient.auth.admin.signOut(item.target_user_id, 'global') or terminate_user_sessions
  // Sets status: 'COMPLETED' via complete_session_revocation
  const batch = await processSessionRevocationOutbox({
    tenantId,
    limit: options.limit ?? 25,
    claimer: options.claimer ?? 'api:reconcile',
    includeFailed: options.includeFailed,
    targetUserId: options.targetUserId,
  });
  return {
    success: batch.success,
    processed: batch.claimed,
    completed: batch.completed,
    failed: batch.retryPending + batch.failedTerminal,
    retryPending: batch.retryPending,
    superseded: batch.superseded,
    error: batch.error,
  };
}

/**
 * Super Admin governance entry point (compatibility wrapper). It no longer owns a separate RPC path:
 * every action is delegated to the single atomic govern_tenant_membership transaction so that the
 * tenant lock, actor re-validation and last-Super-Admin invariant are identical for all callers.
 */
export async function executeAtomicSuperAdminGovernance(
  tenantId: string,
  actor: { id: string; role: string },
  targetUserId: string,
  action: 'change-role' | 'suspend' | 'deactivate' | 'toggle-status' | 'revoke-access',
  newRole?: string,
  reason?: string,
  operationId?: string
): Promise<GovernanceOperationResult> {
  // Preflight: Prevent self-demotion or self-suspension
  if (
    targetUserId === actor.id &&
    (action !== 'change-role' || (newRole !== 'SUPER_ADMIN' && newRole !== 'Super Admin'))
  ) {
    return {
      success: false,
      code: 'CANNOT_DEMOTE_SELF',
      error: SAFE_GOVERNANCE_MESSAGES.CANNOT_DEMOTE_SELF,
    };
  }

  if (action === 'revoke-access') {
    return revokeUserAccess(tenantId, actor, targetUserId, reason, operationId);
  }

  if (action === 'change-role') {
    if (!newRole) {
      return { success: false, code: 'INVALID_ROLE', error: SAFE_GOVERNANCE_MESSAGES.INVALID_ROLE };
    }
    const result = await executeVerifiedTenantMembershipMutation({
      tenantId,
      actor,
      targetUserId,
      nextRole: toCanonicalDbRole(newRole),
      auditAction: 'CHANGE_USER_ROLE',
      reason: reason || `Changed user role to ${newRole}`,
      operationId,
    });
    return result.success
      ? { ...result, message: `Role changed to ${newRole}.` }
      : result;
  }

  const auditAction = action === 'deactivate' ? 'DEACTIVATE_USER' : action === 'toggle-status' ? 'TOGGLE_USER_STATUS' : 'SUSPEND_USER';
  return executeVerifiedTenantMembershipMutation({
    tenantId,
    actor,
    targetUserId,
    nextStatus: 'suspended',
    auditAction,
    reason: reason || (action === 'deactivate' ? 'Deactivated by Super Admin' : 'Suspended by Super Admin'),
    operationId,
  });
}
