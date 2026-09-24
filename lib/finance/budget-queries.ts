/**
 * lib/finance/budget-queries.ts — Authoritative Server Queries for Budgets & Variance Planning
 * Phase 9C: Finance Completion & Financial Operations Migration
 *
 * Implements:
 * - Budget Envelopes (`financial_budgets`) & Line Items (`budget_lines`)
 * - Live Variance calculation (Budgeted - Actual)
 * - Utilization percentage with over-budget & near-limit thresholds
 * - Transaction drill-down against actual expenses
 * - Immutable financial audit logging into `finance_audit_log`
 */

import { createServerClient } from '@/lib/supabase/server';
import { getFinanceTenantId, recordFinanceAuditLog } from '@/lib/finance/queries';
import type {
  BudgetVsActualSummary,
  BudgetVsActualCategory,
} from '@/types/finance';

function safeRound(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export async function getBudgetVsActual(
  tenantId?: string,
  periodKey?: string
): Promise<BudgetVsActualSummary> {
  const resolvedTenant = tenantId || (await getFinanceTenantId());
  const supabase = await createServerClient();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const targetPeriod = periodKey || currentMonth;
  const financialYear = targetPeriod.slice(0, 4);

  const [, budgetLinesRes, legacyBudgetsRes, expensesRes] = await Promise.all([
    supabase
      .from('financial_budgets')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .eq('period_key', targetPeriod),
    supabase
      .from('budget_lines')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .eq('month_key', targetPeriod),
    supabase
      .from('budgets')
      .select('*')
      .eq('tenant_id', resolvedTenant),
    supabase
      .from('expenses')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .in('status', ['recorded', 'approved', 'paid']),
  ]);

  const categoryMap: Record<string, {
    category: string;
    department: string;
    budgetAmount: number;
    actualAmount: number;
    subCategories: Record<string, { budgetAmount: number; actualAmount: number }>;
  }> = {};

  // 1. Process legacy monthly budget limits (fallback / default envelopes)
  for (const b of legacyBudgetsRes.data || []) {
    if (!b || !b.category) continue;
    const cat = b.category;
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        category: cat,
        department: b.department || 'Operations',
        budgetAmount: 0,
        actualAmount: 0,
        subCategories: {},
      };
    }
    categoryMap[cat].budgetAmount = safeRound(
      categoryMap[cat].budgetAmount + Number(b.monthly_limit || b.amount || 0)
    );
  }

  // 2. Process explicit budget lines for this period
  for (const bl of budgetLinesRes.data || []) {
    if (!bl || !bl.category) continue;
    const cat = bl.category;
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        category: cat,
        department: 'Operations',
        budgetAmount: 0,
        actualAmount: 0,
        subCategories: {},
      };
    }
    // If budget line exists, it can override or add to the envelope
    categoryMap[cat].budgetAmount = safeRound(
      categoryMap[cat].budgetAmount + Number(bl.budget_amount || 0)
    );
    if (bl.sub_category) {
      if (!categoryMap[cat].subCategories[bl.sub_category]) {
        categoryMap[cat].subCategories[bl.sub_category] = { budgetAmount: 0, actualAmount: 0 };
      }
      categoryMap[cat].subCategories[bl.sub_category].budgetAmount = safeRound(
        categoryMap[cat].subCategories[bl.sub_category].budgetAmount + Number(bl.budget_amount || 0)
      );
    }
  }

  // 3. Process actual expenses matching this period
  for (const e of expensesRes.data || []) {
    if (!e) continue;
    const expDate = e.expense_date || e.created_at || '';
    if (!expDate.startsWith(targetPeriod)) continue;

    const cat = e.category_group || e.category || 'Other / Miscellaneous';
    const subCat = e.sub_category || '';

    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        category: cat,
        department: 'Operations',
        budgetAmount: 0,
        actualAmount: 0,
        subCategories: {},
      };
    }
    categoryMap[cat].actualAmount = safeRound(
      categoryMap[cat].actualAmount + Number(e.amount || 0)
    );
    if (subCat) {
      if (!categoryMap[cat].subCategories[subCat]) {
        categoryMap[cat].subCategories[subCat] = { budgetAmount: 0, actualAmount: 0 };
      }
      categoryMap[cat].subCategories[subCat].actualAmount = safeRound(
        categoryMap[cat].subCategories[subCat].actualAmount + Number(e.amount || 0)
      );
    }
  }

  let totalBudget = 0;
  let totalActual = 0;

  const categories: BudgetVsActualCategory[] = Object.values(categoryMap).map((c) => {
    const variance = safeRound(c.budgetAmount - c.actualAmount);
    const variancePct =
      c.budgetAmount > 0
        ? safeRound(((c.actualAmount - c.budgetAmount) / c.budgetAmount) * 100)
        : 0;
    const utilizationPct =
      c.budgetAmount > 0
        ? safeRound((c.actualAmount / c.budgetAmount) * 100)
        : c.actualAmount > 0
        ? 100
        : 0;
    const isOverBudget = c.actualAmount > c.budgetAmount;
    const isNearLimit = !isOverBudget && utilizationPct >= 80;
    const status: 'UNDER_BUDGET' | 'NEAR_LIMIT' | 'OVER_BUDGET' = isOverBudget
      ? 'OVER_BUDGET'
      : isNearLimit
      ? 'NEAR_LIMIT'
      : 'UNDER_BUDGET';

    totalBudget = safeRound(totalBudget + c.budgetAmount);
    totalActual = safeRound(totalActual + c.actualAmount);

    return {
      ...c,
      variance,
      variancePct,
      utilizationPct,
      isOverBudget,
      isNearLimit,
      status,
    };
  });

  const totalVariance = safeRound(totalBudget - totalActual);
  const overallUtilizationPct =
    totalBudget > 0 ? safeRound((totalActual / totalBudget) * 100) : 0;
  const overBudgetCategories = categories.filter((c) => c.isOverBudget);
  const nearLimitCategories = categories.filter((c) => c.isNearLimit);

  return {
    financialYear,
    periodKey: targetPeriod,
    totalBudget,
    totalActual,
    totalVariance,
    overallUtilizationPct,
    categories,
    overBudgetCategories,
    nearLimitCategories,
    hasOverspending: overBudgetCategories.length > 0,
  };
}

export async function setBudgetAllocation(
  tenantId: string,
  actor: { id?: string; name?: string; role?: string },
  data: {
    category: string;
    subCategory?: string;
    periodKey: string;
    budgetAmount: number;
    department?: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (data.budgetAmount <= 0) {
    return { success: false, error: 'Budget allocation amount must be greater than zero.' };
  }

  if (!data.category || !data.periodKey) {
    return { success: false, error: 'Category and period key are required.' };
  }

  const supabase = await createServerClient();
  const financialYear = data.periodKey.slice(0, 4);
  const budgetId = `fbdg_${tenantId.slice(0, 8)}_${data.periodKey.replace('-', '')}`;
  const now = new Date().toISOString();

  // 1. Ensure financial_budget envelope exists
  const { error: fbdgErr } = await supabase
    .from('financial_budgets')
    .upsert(
      {
        id: budgetId,
        tenant_id: tenantId,
        financial_year: financialYear,
        period_type: 'monthly',
        period_key: data.periodKey,
        department: data.department || 'Operations',
        total_budget_amount: data.budgetAmount,
        allocated_by: actor.name || 'Finance Manager',
        status: 'active',
        updated_at: now,
      },
      { onConflict: 'id' }
    );

  if (fbdgErr) {
    console.error('Error creating financial_budget envelope:', fbdgErr.message);
  }

  // 2. Insert or update budget line
  const lineId = `bln_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const { error: lineErr } = await supabase.from('budget_lines').insert({
    id: lineId,
    tenant_id: tenantId,
    budget_id: budgetId,
    category: data.category,
    sub_category: data.subCategory || null,
    month_key: data.periodKey,
    budget_amount: Number(data.budgetAmount),
    actual_amount: 0,
    variance: Number(data.budgetAmount),
    notes: data.notes || null,
    created_at: now,
    updated_at: now,
  });

  if (lineErr) {
    return { success: false, error: lineErr.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'SET_BUDGET_ALLOCATION',
    entityType: 'finance_settings',
    entityId: lineId,
    entityName: `Budget: ${data.category} (${data.periodKey})`,
    actorId: actor.id || null,
    actorRole: actor.role || 'Manager',
    reason: `Budget allocated: ₦${Number(data.budgetAmount).toLocaleString()} for ${data.category}`,
    newState: data as unknown as Record<string, unknown>,
    source: 'nextjs_finance_app',
  });

  return { success: true };
}

export async function getBudgetTransactions(
  tenantId: string,
  category: string,
  periodKey?: string
) {
  const supabase = await createServerClient();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const targetPeriod = periodKey || currentMonth;

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['recorded', 'approved', 'paid'])
    .order('expense_date', { ascending: false });

  if (error) {
    console.error('Error fetching budget transactions:', error.message);
    return [];
  }

  return (data || [])
    .filter((e) => {
      const matchCat =
        !category ||
        (e.category_group || '').toLowerCase() === category.toLowerCase() ||
        (e.sub_category || '').toLowerCase() === category.toLowerCase();
      const expDate = e.expense_date || e.created_at || '';
      const matchPeriod = !targetPeriod || expDate.startsWith(targetPeriod);
      return matchCat && matchPeriod;
    })
    .map((e) => ({
      id: e.id,
      date: e.expense_date,
      category: e.category_group,
      subCategory: e.sub_category,
      beneficiary: e.beneficiary,
      amount: Number(e.amount || 0),
      description: e.description,
      status: e.status,
    }));
}
