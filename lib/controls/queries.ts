/**
 * lib/controls/queries.ts
 * Authoritative Server Queries for Financial Controls & Governance
 * Phase 9B: Administration & Governance Module Migration
 */

import { createServerClient } from '@/lib/supabase/server';
import { recordFinanceAuditLog } from '@/lib/finance/queries';

export interface FinancePeriodInfo {
  period: string; // e.g. "2026-09"
  status: 'open' | 'locked' | 'closed';
  lockedAt?: string | null;
  lockedBy?: string | null;
  notes?: string | null;
}

export interface FinancialApprovalTier {
  tier: number;
  name: string;
  thresholdMax: number | null;
  approverRole: string;
  description: string;
}

/**
 * Get period status for the specified or current month
 */
export async function getFinancialPeriodStatus(
  tenantId: string,
  periodMonth?: string
): Promise<FinancePeriodInfo> {
  const period = periodMonth || new Date().toISOString().slice(0, 7);
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('finance_periods')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period', period)
    .maybeSingle();

  if (error || !data) {
    return {
      period,
      status: 'open',
      lockedAt: null,
      lockedBy: null,
    };
  }

  return {
    period: data.period,
    status: data.status as 'open' | 'locked' | 'closed',
    lockedAt: data.locked_at,
    lockedBy: data.locked_by,
    notes: data.notes,
  };
}

/**
 * Toggle period lock state (open <-> locked) strictly guarded to Super Admin
 */
export async function toggleFinancialPeriodLock(
  tenantId: string,
  actor: { id: string; role: string },
  periodMonth: string,
  notes?: string
): Promise<{ success: boolean; newStatus: 'open' | 'locked'; error?: string }> {
  const supabase = await createServerClient();
  const current = await getFinancialPeriodStatus(tenantId, periodMonth);
  const newStatus: 'open' | 'locked' = current.status === 'locked' ? 'open' : 'locked';

  const periodId = `per_${tenantId.slice(0, 8)}_${periodMonth.replace('-', '')}`;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('finance_periods')
    .upsert({
      id: periodId,
      tenant_id: tenantId,
      period: periodMonth,
      status: newStatus,
      locked_at: newStatus === 'locked' ? now : null,
      locked_by: newStatus === 'locked' ? actor.id : null,
      notes: notes || null,
      updated_at: now,
    }, { onConflict: 'tenant_id,period' });

  if (error) {
    return { success: false, newStatus: current.status as 'open' | 'locked', error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'PERIOD_LOCK_TOGGLE',
    entityType: 'finance_period',
    entityId: periodMonth,
    entityName: `Period ${periodMonth}`,
    actorId: actor.id,
    actorRole: actor.role,
    reason: `Accounting period status changed to ${newStatus.toUpperCase()}`,
    source: 'financial_controls',
    newState: { period: periodMonth, status: newStatus },
  });

  return { success: true, newStatus };
}
