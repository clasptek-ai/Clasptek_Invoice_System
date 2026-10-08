/**
 * lib/supabase/health.ts — Genuine PostgreSQL & PostgREST Health Diagnostics
 *
 * Faithfully implements the multi-stage health diagnostic probe from the original
 * Clasptek implementation (clasptek_invoice_system.html: probeAuthenticatedPostgrest
 * and diagnoseSupabaseProductionConnection).
 *
 * Invariants:
 * 1. ZERO exposure of service-role keys — uses only the public anon client.
 * 2. Distinguishes genuine states:
 *    - POSTGRESQL ACTIVE: Authenticated session valid, tenant resolved via RPC, authorized read succeeds.
 *    - CONNECTING: Initial health probe in progress.
 *    - AUTH REQUIRED: No authenticated session, or authentication rejected (HTTP 401).
 *    - RLS RESTRICTED: Tenant context unestablished or missing membership (HTTP 403 / tenant = null).
 *    - POSTGRESQL UNREACHABLE: Network unreachable / endpoint down.
 *    - DATABASE ERROR: Unexpected query error or server failure (e.g. policy recursion, 500).
 *    - MIGRATION REQUIRED: Canonical schema tables missing (HTTP 404).
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type PostgresStatus =
  | 'CONNECTING'
  | 'POSTGRESQL_ACTIVE'
  | 'AUTH_REQUIRED'
  | 'RLS_RESTRICTED'
  | 'POSTGRESQL_UNREACHABLE'
  | 'DATABASE_ERROR'
  | 'MIGRATION_REQUIRED';

export interface DatabaseHealthDiagnostic {
  status: PostgresStatus;
  statusLabel: string;
  dotClass: 'connected' | 'warning' | 'fallback';
  latencyMs: number | null;
  lastSuccessfulRead: string | null;
  httpStatus: number | null;
  tenantId: string | null;
  projectRef: string;
  errorDetails: string | null;
  probeTimestamp: string;
}

export const CANONICAL_PROJECT_REF = 'logaawoigfxnisimfatf';

export const INITIAL_DIAGNOSTIC_STATE: DatabaseHealthDiagnostic = {
  status: 'CONNECTING',
  statusLabel: '🟡 CONNECTING...',
  dotClass: 'warning',
  latencyMs: null,
  lastSuccessfulRead: null,
  httpStatus: null,
  tenantId: null,
  projectRef: CANONICAL_PROJECT_REF,
  errorDetails: null,
  probeTimestamp: new Date().toISOString(),
};

/**
 * Runs an asynchronous, non-destructive health probe against Supabase PostgREST & PostgreSQL.
 */
export async function runDatabaseHealthProbe(): Promise<DatabaseHealthDiagnostic> {
  const probeTimestamp = new Date().toISOString();

  let supabase: ReturnType<typeof getSupabaseBrowserClient>;
  try {
    supabase = getSupabaseBrowserClient();
  } catch (err: unknown) {
    return {
      status: 'POSTGRESQL_UNREACHABLE',
      statusLabel: '🔴 POSTGRESQL UNREACHABLE',
      dotClass: 'fallback',
      latencyMs: null,
      lastSuccessfulRead: null,
      httpStatus: 0,
      tenantId: null,
      projectRef: CANONICAL_PROJECT_REF,
      errorDetails: err instanceof Error ? err.message : 'Supabase browser client unavailable',
      probeTimestamp,
    };
  }

  try {
    // 1. Session verification check
    const { data: authData, error: authErr } = await supabase.auth.getSession();
    if (authErr || !authData?.session) {
      return {
        status: 'AUTH_REQUIRED',
        statusLabel: '🔴 AUTH REQUIRED',
        dotClass: 'warning',
        latencyMs: null,
        lastSuccessfulRead: null,
        httpStatus: 401,
        tenantId: null,
        projectRef: CANONICAL_PROJECT_REF,
        errorDetails: authErr?.message || 'No active authenticated session detected. Please sign in.',
        probeTimestamp,
      };
    }

    // 2. Tenant Context verification via RPC get_auth_tenant_id()
    const { data: tenantId, error: tenantErr } = await supabase.rpc('get_auth_tenant_id');
    if (tenantErr || !tenantId) {
      return {
        status: 'RLS_RESTRICTED',
        statusLabel: '🔴 RLS RESTRICTED',
        dotClass: 'warning',
        latencyMs: null,
        lastSuccessfulRead: null,
        httpStatus: 403,
        tenantId: null,
        projectRef: CANONICAL_PROJECT_REF,
        errorDetails:
          tenantErr?.message ||
          'Authenticated user has no active tenant membership. get_auth_tenant_id() returned null.',
        probeTimestamp,
      };
    }

    // 3. Authorized Benchmark Read Probe (canonical programmes table)
    const startTime = performance.now();
    const { error: progErr, status: progStatus } = await supabase
      .from('programmes')
      .select('id')
      .limit(1);
    const latencyMs = Math.round(performance.now() - startTime);

    if (progErr) {
      if (progStatus === 401) {
        return {
          status: 'AUTH_REQUIRED',
          statusLabel: '🔴 AUTH REQUIRED',
          dotClass: 'warning',
          latencyMs,
          lastSuccessfulRead: null,
          httpStatus: 401,
          tenantId,
          projectRef: CANONICAL_PROJECT_REF,
          errorDetails: progErr.message,
          probeTimestamp,
        };
      }
      if (progStatus === 403) {
        return {
          status: 'RLS_RESTRICTED',
          statusLabel: '🔴 RLS RESTRICTED',
          dotClass: 'warning',
          latencyMs,
          lastSuccessfulRead: null,
          httpStatus: 403,
          tenantId,
          projectRef: CANONICAL_PROJECT_REF,
          errorDetails: progErr.message,
          probeTimestamp,
        };
      }
      if (progStatus === 404 || progErr.code === 'PGRST205') {
        return {
          status: 'MIGRATION_REQUIRED',
          statusLabel: '🟡 MIGRATION REQUIRED',
          dotClass: 'warning',
          latencyMs,
          lastSuccessfulRead: null,
          httpStatus: 404,
          tenantId,
          projectRef: CANONICAL_PROJECT_REF,
          errorDetails: 'Required canonical table "programmes" not found in PostgreSQL schema.',
          probeTimestamp,
        };
      }
      return {
        status: 'DATABASE_ERROR',
        statusLabel: '🔴 DATABASE ERROR',
        dotClass: 'fallback',
        latencyMs,
        lastSuccessfulRead: null,
        httpStatus: progStatus || 500,
        tenantId,
        projectRef: CANONICAL_PROJECT_REF,
        errorDetails: progErr.message,
        probeTimestamp,
      };
    }

    // 4. Secondary Table Diagnostics: test relation integrity on students
    let tableDiagnosticError: string | null = null;
    const { error: stuErr } = await supabase.from('students').select('id').limit(1);
    if (stuErr) {
      tableDiagnosticError = `Table "students": ${stuErr.message}`;
    }

    if (tableDiagnosticError) {
      return {
        status: 'DATABASE_ERROR',
        statusLabel: '🔴 DATABASE ERROR',
        dotClass: 'warning',
        latencyMs,
        lastSuccessfulRead: new Date().toISOString(),
        httpStatus: 200,
        tenantId,
        projectRef: CANONICAL_PROJECT_REF,
        errorDetails: tableDiagnosticError,
        probeTimestamp,
      };
    }

    // All checks passed cleanly
    return {
      status: 'POSTGRESQL_ACTIVE',
      statusLabel: '🟢 POSTGRESQL ACTIVE',
      dotClass: 'connected',
      latencyMs,
      lastSuccessfulRead: new Date().toISOString(),
      httpStatus: 200,
      tenantId,
      projectRef: CANONICAL_PROJECT_REF,
      errorDetails: null,
      probeTimestamp,
    };
  } catch (err: unknown) {
    return {
      status: 'POSTGRESQL_UNREACHABLE',
      statusLabel: '🔴 POSTGRESQL UNREACHABLE',
      dotClass: 'fallback',
      latencyMs: null,
      lastSuccessfulRead: null,
      httpStatus: 0,
      tenantId: null,
      projectRef: CANONICAL_PROJECT_REF,
      errorDetails: err instanceof Error ? err.message : 'Network communication failure',
      probeTimestamp,
    };
  }
}
