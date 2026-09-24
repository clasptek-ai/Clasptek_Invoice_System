/**
 * lib/audit/queries.ts
 * Authoritative Server Queries for Immutable Audit Log
 * Phase 9B: Administration & Governance Module Migration
 */

import { createServerClient } from '@/lib/supabase/server';

export interface AuditRecord {
  id: string;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string | null;
  actorId?: string | null;
  actorRole: string;
  reason?: string | null;
  source: string;
  createdAt: string;
}

export async function getAuditLogs(
  tenantId: string,
  limit: number = 100
): Promise<AuditRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('finance_audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching audit logs:', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
  }));
}
