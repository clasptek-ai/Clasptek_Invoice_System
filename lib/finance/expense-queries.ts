/**
 * lib/finance/expense-queries.ts — Authoritative Server Queries for Operational & Programme Expenses
 * Phase 9C: Finance Completion & Financial Operations Migration
 *
 * Implements:
 * - 10 Authoritative Accounting Taxonomies & validation
 * - Financial Period Lock enforcement (isPeriodLocked)
 * - Row-Level Security & Multi-tenant isolation
 * - Immutable financial audit logging into `finance_audit_log`
 */

import { createServerClient } from '@/lib/supabase/server';
import { getFinanceTenantId, recordFinanceAuditLog } from '@/lib/finance/queries';
import { getFinancialPeriodStatus } from '@/lib/controls/queries';
import type { Expense, ExpenseStatus, PaymentMethod } from '@/types/finance';

import {
  AUTHORITATIVE_EXPENSE_TAXONOMY,
  getAuthoritativeExpenseGroups,
  getAuthoritativeExpenseCategories,
  isValidExpenseClassification,
} from './taxonomy';

export {
  AUTHORITATIVE_EXPENSE_TAXONOMY,
  getAuthoritativeExpenseGroups,
  getAuthoritativeExpenseCategories,
  isValidExpenseClassification,
};

export interface ExpenseFilters {
  search?: string;
  group?: string;
  department?: string;
  status?: string;
  period?: string;
}

export async function getExpenses(
  tenantId?: string,
  filters?: ExpenseFilters
): Promise<Expense[]> {
  const resolvedTenant = tenantId || (await getFinanceTenantId());
  const supabase = await createServerClient();

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', resolvedTenant)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.group) {
    query = query.eq('category_group', filters.group);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching expenses:', error.message);
    return [];
  }

  let results: Expense[] = (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    categoryGroup: row.category_group,
    subCategory: row.sub_category,
    amount: Number(row.amount || 0),
    expenseDate: row.expense_date,
    description: row.description,
    beneficiary: row.beneficiary,
    paymentMethod: row.payment_method as PaymentMethod,
    reference: row.reference,
    programmeId: row.programme_id,
    status: row.status as ExpenseStatus,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    cancelledReason: row.cancelled_reason,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    source: row.source || 'supabase_app',
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    results = results.filter((e) => {
      const descMatch = (e.description || '').toLowerCase().includes(q);
      const benMatch = (e.beneficiary || '').toLowerCase().includes(q);
      const catMatch = (e.subCategory || '').toLowerCase().includes(q);
      const grpMatch = (e.categoryGroup || '').toLowerCase().includes(q);
      const refMatch = (e.reference || '').toLowerCase().includes(q);
      return descMatch || benMatch || catMatch || grpMatch || refMatch;
    });
  }

  if (filters?.period) {
    results = results.filter((e) => (e.expenseDate || '').startsWith(filters.period!));
  }

  return results;
}

export async function createExpense(
  tenantId: string,
  actor: { id?: string; name?: string; role?: string },
  data: {
    categoryGroup: string;
    subCategory: string;
    amount: number;
    expenseDate: string;
    description: string;
    beneficiary: string;
    paymentMethod: PaymentMethod;
    reference?: string;
    programmeId?: string;
  }
): Promise<{ success: boolean; expense?: Expense; error?: string; locked?: boolean }> {
  const periodMonth = (data.expenseDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const periodStatus = await getFinancialPeriodStatus(tenantId, periodMonth);

  if (periodStatus.status === 'locked' || periodStatus.status === 'closed') {
    return {
      success: false,
      locked: true,
      error: `Financial Period ${periodMonth} is locked. Modifications and new expense entries are prohibited.`,
    };
  }

  if (data.amount <= 0) {
    return { success: false, error: 'Expense amount must be greater than zero.' };
  }

  if (!data.categoryGroup || !data.subCategory) {
    return { success: false, error: 'Category group and subcategory are required.' };
  }

  if (!isValidExpenseClassification(data.categoryGroup, data.subCategory)) {
    return {
      success: false,
      error: `Invalid taxonomy classification: "${data.subCategory}" does not belong to group "${data.categoryGroup}".`,
    };
  }

  const supabase = await createServerClient();
  const expenseId = `exp_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const now = new Date().toISOString();

  const insertPayload = {
    id: expenseId,
    tenant_id: tenantId,
    category_group: data.categoryGroup,
    sub_category: data.subCategory,
    amount: Number(data.amount),
    expense_date: data.expenseDate,
    description: data.description,
    beneficiary: data.beneficiary,
    payment_method: data.paymentMethod,
    reference: data.reference || null,
    programme_id: data.programmeId || null,
    status: 'recorded',
    source: 'nextjs_app',
    created_at: now,
    created_by: actor.id || null,
  };

  const { error } = await supabase.from('expenses').insert(insertPayload);
  if (error) {
    return { success: false, error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'RECORD_EXPENSE',
    entityType: 'expense',
    entityId: expenseId,
    entityName: data.description,
    actorId: actor.id || null,
    actorRole: actor.role || 'Staff',
    reason: `Expense logged for ₦${Number(data.amount).toLocaleString()} to ${data.beneficiary}`,
    newState: insertPayload as unknown as Record<string, unknown>,
    source: 'nextjs_finance_app',
  });

  return {
    success: true,
    expense: {
      id: expenseId,
      tenantId,
      categoryGroup: data.categoryGroup,
      subCategory: data.subCategory,
      amount: Number(data.amount),
      expenseDate: data.expenseDate,
      description: data.description,
      beneficiary: data.beneficiary,
      paymentMethod: data.paymentMethod,
      reference: data.reference,
      programmeId: data.programmeId,
      status: 'recorded',
      source: 'nextjs_app',
      createdAt: now,
      createdBy: actor.id || null,
    },
  };
}

export async function approveExpense(
  tenantId: string,
  actor: { id?: string; name?: string; role?: string },
  expenseId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient();

  const { data: exp, error: fetchErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !exp) {
    return { success: false, error: 'Expense not found or access denied.' };
  }

  const periodMonth = (exp.expense_date || '').slice(0, 7);
  const periodStatus = await getFinancialPeriodStatus(tenantId, periodMonth);
  if (periodStatus.status === 'locked' || periodStatus.status === 'closed') {
    return { success: false, error: `Cannot approve expense: Period ${periodMonth} is locked.` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'approved',
      approved_by: actor.id || null,
      approved_at: now,
    })
    .eq('id', expenseId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'APPROVE_EXPENSE',
    entityType: 'expense',
    entityId: expenseId,
    entityName: exp.description,
    oldState: { status: exp.status },
    newState: { status: 'approved', approved_at: now },
    actorId: actor.id || null,
    actorRole: actor.role || 'Manager',
    reason: `Expense approved by ${actor.name || 'Manager'}`,
    source: 'nextjs_finance_app',
  });

  return { success: true };
}

export async function cancelExpense(
  tenantId: string,
  actor: { id?: string; name?: string; role?: string },
  expenseId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient();

  const { data: exp, error: fetchErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !exp) {
    return { success: false, error: 'Expense not found or access denied.' };
  }

  const periodMonth = (exp.expense_date || '').slice(0, 7);
  const periodStatus = await getFinancialPeriodStatus(tenantId, periodMonth);
  if (periodStatus.status === 'locked' || periodStatus.status === 'closed') {
    return { success: false, error: `Cannot cancel expense: Period ${periodMonth} is locked.` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'cancelled',
      cancelled_reason: reason || 'Cancelled by staff',
      cancelled_by: actor.id || null,
      cancelled_at: now,
    })
    .eq('id', expenseId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'CANCEL_EXPENSE',
    entityType: 'expense',
    entityId: expenseId,
    entityName: exp.description,
    oldState: { status: exp.status },
    newState: { status: 'cancelled', cancelled_reason: reason },
    actorId: actor.id || null,
    actorRole: actor.role || 'Staff',
    reason: `Expense cancelled: ${reason}`,
    source: 'nextjs_finance_app',
  });

  return { success: true };
}
