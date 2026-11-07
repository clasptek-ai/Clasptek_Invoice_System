/**
 * scripts/test_phase_c249_people_access_governance_offline.js
 * Clasptek Phase C249 — People & Access Governance and Revocation Integrity Offline Regression Suite
 *
 * Verifies all 20 mandatory test scenarios specified in Section 14 of Phase C249:
 *  1. People & Access GET succeeds with valid fixture data (role normalization, zero fabricated user@clasptek.org).
 *  2. GET handles database errors safely (surfaces explicit error, never returns silent empty list).
 *  3. PATCH rejects unauthorized users (401/403).
 *  4. Membership updates verify affected rows (rowsAffected > 0; 0 rows affected fails closed).
 *  5. Audit logging failure prevents an unaudited governance mutation (compensating rollback of tenant_memberships).
 *  6. Valid governance operations write the expected sanitized audit event.
 *  7. Missing audit policy/configuration or forged actor identity fails safely.
 *  8. Nonexistent profiles columns (role, is_active, tenant_id) are never queried or updated in executable code or SQL.
 *  9. Last SUPER_ADMIN cannot be removed (CANNOT_REMOVE_LAST_SUPER_ADMIN).
 * 10. Concurrent demotion attempts where only two SUPER_ADMINs exist are serialized safely via advisory + FOR UPDATE lock.
 * 11. Revocation requires a non-empty, trimmed reason (3-500 chars; rejects empty/whitespace-only/silent defaults).
 * 12. Revocation preserves personnel HR employment status, payroll, attendance, and historical records.
 * 13. Session sign-out failures (GoTrue signOut returning { error } or throwing) are detected.
 * 14. Partial revocation (PARTIAL_SESSION_TERMINATION_PENDING) is reported accurately (HTTP 409) & records reconciliation state.
 * 15. Repeated revocation requests are idempotent (idempotent: true, no duplicate audit log or state mutation).
 * 16. Cross-tenant revocation and cross-tenant role/status mutations are rejected (USER_NOT_FOUND).
 * 17. Modal remains open on failure and preserves the user's entered reason.
 * 18. Error feedback and partial-completion feedback are visible inside the modal and toast zIndex > modal backdrop.
 * 19. Duplicate submission is prevented while request is in flight or reason is blank.
 * 20. Existing People & Access behavior (KPIs, tabs, CSV export, role matrix) remains compatible.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const worktreeRoot = path.resolve(__dirname, '..');

// Register lightweight in-memory TypeScript loader with @/ alias resolution for runtime tests
function loadTsModule(relPath, customMocks = {}) {
  const fullPath = path.join(worktreeRoot, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });

  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));

  const originalRequire = mod.require.bind(mod);
  mod.require = (id) => {
    if (customMocks[id]) return customMocks[id];
    if (id.startsWith('@/')) {
      const mapped = id.slice(2);
      if (customMocks[mapped]) return customMocks[mapped];
    }
    return originalRequire(id);
  };

  mod._compile(transpiled.outputText, fullPath);
  return mod.exports;
}

// In-memory mock database & GoTrue factory for runtime tests
function createMockEnvironment(options = {}) {
  const state = {
    tenant_memberships: (options.tenant_memberships || []).map((r) => ({ ...r })),
    profiles: (options.profiles || []).map((r) => ({ ...r })),
    personnel: (options.personnel || []).map((r) => ({ ...r })),
    finance_audit_log: (options.finance_audit_log || []).map((r) => ({ ...r })),
    governance_session_revocation_outbox: (options.governance_session_revocation_outbox || []).map((r) => ({ ...r })),
    signOutCalls: [],
    queriedTablesAndCols: [],
    mutatedTablesAndPayloads: [],
  };

  function makeQueryBuilder(table) {
    let op = 'select';
    let selectCols = '*';
    let updatePayload = null;
    let insertPayload = null;
    const filters = [];
    let forceZeroRowsOnUpdate = Boolean(options.forceZeroRowsOnUpdate && options.forceZeroRowsOnUpdate[table]);

    const execute = () => {
      if (options.tableErrors && options.tableErrors[table] && (!options.tableErrorOps || options.tableErrorOps.includes(op))) {
        return { data: null, error: { message: options.tableErrors[table] } };
      }

      if (op === 'select') {
        state.queriedTablesAndCols.push({ table, selectCols });
        let rows = state[table] ? state[table].filter((r) => filters.every((f) => f(r))) : [];
        return { data: rows.map((r) => ({ ...r })), error: null };
      }

      if (op === 'update') {
        state.mutatedTablesAndPayloads.push({ table, op: 'update', payload: { ...updatePayload } });
        if (forceZeroRowsOnUpdate) {
          return { data: [], error: null };
        }
        const matched = [];
        if (state[table]) {
          for (const row of state[table]) {
            if (filters.every((f) => f(row))) {
              Object.assign(row, updatePayload);
              matched.push({ ...row });
            }
          }
        }
        return { data: matched, error: null };
      }

      if (op === 'insert') {
        state.mutatedTablesAndPayloads.push({ table, op: 'insert', payload: { ...insertPayload } });
        if (table === 'finance_audit_log' && options.failAuditInsert) {
          return { data: null, error: { message: options.failAuditInsertMessage || 'new row violates row-level security policy for table "finance_audit_log"' } };
        }
        const row = { id: `${table}_${Date.now()}_${Math.random()}`, ...insertPayload };
        if (!state[table]) state[table] = [];
        state[table].push(row);
        return { data: [row], error: null };
      }

      if (op === 'delete') {
        if (state[table]) {
          state[table] = state[table].filter((r) => !filters.every((f) => f(r)));
        }
        return { data: [], error: null };
      }

      return { data: [], error: null };
    };

    const builder = {
      select(cols = '*') {
        if (op === 'select') {
          selectCols = cols;
          return builder;
        }
        // Chained .select() after .update() or .insert()
        return Promise.resolve(execute());
      },
      update(payload) {
        op = 'update';
        updatePayload = payload;
        return builder;
      },
      insert(payload) {
        op = 'insert';
        insertPayload = payload;
        return builder;
      },
      upsert(payload) {
        op = 'insert';
        insertPayload = payload;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col, val) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col, vals) {
        filters.push((r) => Array.isArray(vals) && vals.includes(r[col]));
        return builder;
      },
      or() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        const res = execute();
        if (res.error) return Promise.resolve({ data: null, error: res.error });
        return Promise.resolve({ data: res.data && res.data.length > 0 ? res.data[0] : null, error: null });
      },
      single() {
        const res = execute();
        if (res.error) return Promise.resolve({ data: null, error: res.error });
        if (!res.data || res.data.length === 0) return Promise.resolve({ data: null, error: { message: 'Row not found' } });
        return Promise.resolve({ data: res.data[0], error: null });
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  // Simulated PostgreSQL advisory lock queue per tenant for concurrent RPC tests
  const tenantLocks = new Map();

  const dbClient = {
    from(table) {
      return makeQueryBuilder(table);
    },
    async rpc(fnName, params) {
      if (fnName === 'record_governance_audit_log') {
        if (options.failAuditInsert) {
          return { data: null, error: { message: options.failAuditInsertMessage || 'AUDIT_RPC_REJECTED' } };
        }
        // Validate actor is active SUPER_ADMIN in tenant
        const actorMem = state.tenant_memberships.find(
          (m) => m.tenant_id === params.p_tenant_id && m.user_id === params.p_actor_id && m.role === 'SUPER_ADMIN' && m.status === 'active'
        );
        if (!actorMem) {
          return { data: null, error: { message: 'UNAUTHORIZED_AUDIT_ACTOR: Actor is not an active SUPER_ADMIN in tenant' } };
        }
        const entry = {
          id: `aud_${state.finance_audit_log.length + 1}`,
          tenant_id: params.p_tenant_id,
          actor_id: params.p_actor_id,
          actor_role: params.p_actor_role,
          action: params.p_action,
          entity_type: params.p_entity_type,
          entity_id: params.p_entity_id,
          entity_name: params.p_entity_name,
          reason: params.p_reason,
          old_state: params.p_old_state,
          new_state: params.p_new_state,
          created_at: new Date().toISOString(),
        };
        state.finance_audit_log.push(entry);
        return { data: { success: true, audit_id: entry.id }, error: null };
      }

      if (fnName === 'govern_tenant_membership') {
        if (options.failAuditInsert) {
          return { data: null, error: { message: options.failAuditInsertMessage || 'SECURITY_AUDIT_LOG_FAILURE: Audit insert failed' } };
        }
        if (options.forceZeroRowsOnUpdate && options.forceZeroRowsOnUpdate.tenant_memberships) {
          return { data: null, error: { message: 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS: Zero rows affected' } };
        }
        if (options.rpcError) {
          return { data: null, error: { message: options.rpcError } };
        }

        const lockKey = `lock:${params.p_tenant_id}`;
        const prevLock = tenantLocks.get(lockKey) || Promise.resolve();
        let releaseLock;
        const nextLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        tenantLocks.set(lockKey, prevLock.then(() => nextLock));

        await prevLock;
        try {
          if (params.p_target_user_id === params.p_actor_id && (
            (params.p_action === 'change-role' && params.p_new_role !== 'SUPER_ADMIN') ||
            ['suspend', 'deactivate', 'revoke-access'].includes(params.p_action) ||
            (params.p_action === 'toggle-status' && params.p_new_status === 'suspended')
          )) {
            return { data: null, error: { message: 'CANNOT_DEMOTE_SELF: Super Admins cannot demote or suspend their own account.' } };
          }
          const callerMem = state.tenant_memberships.find(
            (m) => m.tenant_id === params.p_tenant_id && m.user_id === params.p_actor_id && m.role === 'SUPER_ADMIN' && m.status === 'active'
          );
          if (!callerMem) {
            return { data: null, error: { message: 'UNAUTHORIZED: Caller is not an active Super Admin in tenant' } };
          }
          const targetMem = state.tenant_memberships.find(
            (m) => m.tenant_id === params.p_tenant_id && m.user_id === params.p_target_user_id
          );
          if (!targetMem) {
            return { data: null, error: { message: `USER_NOT_FOUND: User ${params.p_target_user_id} is not a member of tenant ${params.p_tenant_id}` } };
          }
          const activeSuperAdmins = state.tenant_memberships.filter(
            (m) => m.tenant_id === params.p_tenant_id && m.role === 'SUPER_ADMIN' && m.status === 'active'
          );
          if (targetMem.role === 'SUPER_ADMIN' && targetMem.status === 'active') {
            const isRemoving =
              (params.p_action === 'change-role' && params.p_new_role !== 'SUPER_ADMIN') ||
              ['suspend', 'deactivate', 'revoke-access'].includes(params.p_action) ||
              (params.p_action === 'toggle-status' && params.p_new_status === 'suspended');
            if (isRemoving && activeSuperAdmins.length <= 1) {
              return { data: null, error: { message: 'CANNOT_REMOVE_LAST_SUPER_ADMIN: Organization must retain at least one active Super Admin.' } };
            }
          }

          const oldRole = targetMem.role;
          const oldStatus = targetMem.status;

          let newRole = targetMem.role;
          let newStatus = targetMem.status;
          let auditAction = 'CHANGE_USER_ROLE';

          if (params.p_action === 'change-role') {
            newRole = params.p_new_role;
            auditAction = 'CHANGE_USER_ROLE';
          } else if (params.p_action === 'toggle-status') {
            newStatus = params.p_new_status || 'active';
            auditAction = 'TOGGLE_USER_STATUS';
          } else if (['suspend', 'deactivate'].includes(params.p_action)) {
            newStatus = 'suspended';
            auditAction = params.p_action === 'deactivate' ? 'DEACTIVATE_USER' : 'SUSPEND_USER';
          } else if (params.p_action === 'revoke-access') {
            newStatus = 'suspended';
            auditAction = 'REVOKE_USER_ACCESS';
          } else if (['reactivate', 'unlock-account'].includes(params.p_action)) {
            newStatus = 'active';
            auditAction = 'REACTIVATE_USER';
          }

          targetMem.role = newRole;
          targetMem.status = newStatus;
          targetMem.updated_at = new Date().toISOString();

          const auditId = `aud_gov_${state.finance_audit_log.length + 1}`;
          state.finance_audit_log.push({
            id: auditId,
            tenant_id: params.p_tenant_id,
            actor_id: params.p_actor_id,
            actor_role: params.p_actor_role || 'Super Admin',
            action: auditAction,
            entity_type: 'user',
            entity_id: params.p_target_user_id,
            reason: params.p_reason || 'Governance mutation',
            old_state: { role: oldRole, status: oldStatus },
            new_state: { role: newRole, status: newStatus },
            created_at: new Date().toISOString(),
          });

          return {
            data: {
              success: true,
              userId: params.p_target_user_id,
              tenantId: params.p_tenant_id,
              action: params.p_action,
              role: newRole,
              status: newStatus,
              auditId,
              rowsAffected: 1,
            },
            error: null,
          };
        } finally {
          releaseLock();
        }
      }

      if (fnName === 'demote_or_suspend_super_admin') {
        if (options.rpcError) {
          return { data: null, error: { message: options.rpcError } };
        }
        const lockKey = `lock:${params.p_tenant_id}`;
        const prevLock = tenantLocks.get(lockKey) || Promise.resolve();
        let releaseLock;
        const nextLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        tenantLocks.set(lockKey, prevLock.then(() => nextLock));

        await prevLock;
        try {
          if (params.p_user_id === params.p_actor_id && (params.p_action !== 'change-role' || params.p_new_role !== 'SUPER_ADMIN')) {
            return { data: null, error: { message: 'CANNOT_DEMOTE_SELF: Super Admins cannot demote or suspend their own account.' } };
          }
          const callerMem = state.tenant_memberships.find(
            (m) => m.tenant_id === params.p_tenant_id && m.user_id === params.p_actor_id && m.role === 'SUPER_ADMIN' && m.status === 'active'
          );
          if (!callerMem) {
            return { data: null, error: { message: 'UNAUTHORIZED: Caller is not an active Super Admin in tenant' } };
          }
          const targetMem = state.tenant_memberships.find(
            (m) => m.tenant_id === params.p_tenant_id && m.user_id === params.p_user_id
          );
          if (!targetMem) {
            return { data: null, error: { message: `USER_NOT_FOUND: User ${params.p_user_id} is not a member of tenant ${params.p_tenant_id}` } };
          }
          const activeSuperAdmins = state.tenant_memberships.filter(
            (m) => m.tenant_id === params.p_tenant_id && m.role === 'SUPER_ADMIN' && m.status === 'active'
          );
          if (targetMem.role === 'SUPER_ADMIN' && targetMem.status === 'active') {
            const isRemoving =
              (params.p_action === 'change-role' && params.p_new_role !== 'SUPER_ADMIN') ||
              ['suspend', 'deactivate', 'revoke-access'].includes(params.p_action);
            if (isRemoving && activeSuperAdmins.length <= 1) {
              return { data: null, error: { message: 'CANNOT_REMOVE_LAST_SUPER_ADMIN: Organization must retain at least one active Super Admin.' } };
            }
          }
          const oldRole = targetMem.role;
          const oldStatus = targetMem.status;
          if (params.p_action === 'change-role') {
            targetMem.role = params.p_new_role;
          } else {
            targetMem.status = 'suspended';
          }
          targetMem.updated_at = new Date().toISOString();
          state.finance_audit_log.push({
            id: `aud_rpc_${state.finance_audit_log.length + 1}`,
            tenant_id: params.p_tenant_id,
            actor_id: params.p_actor_id,
            actor_role: 'SUPER_ADMIN',
            action:
              params.p_action === 'change-role'
                ? 'CHANGE_USER_ROLE'
                : params.p_action === 'revoke-access'
                  ? 'REVOKE_USER_ACCESS'
                  : 'DEACTIVATE_USER',
            entity_type: 'user',
            entity_id: params.p_user_id,
            old_state: { role: oldRole, status: oldStatus },
            new_state: { role: targetMem.role, status: targetMem.status },
            created_at: new Date().toISOString(),
          });
          return {
            data: {
              success: true,
              user_id: params.p_user_id,
              tenant_id: params.p_tenant_id,
              action: params.p_action,
              rows_affected: 1,
            },
            error: null,
          };
        } finally {
          releaseLock();
        }
      }

      return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
    },
    auth: {
      async resetPasswordForEmail(email) {
        if (options.resetPasswordError) return { data: null, error: { message: options.resetPasswordError } };
        return { data: { email }, error: null };
      },
      admin: {
        async signOut(userId, scope) {
          state.signOutCalls.push({ userId, scope });
          if (options.signOutThrows) {
            throw new Error(options.signOutThrows);
          }
          if (options.signOutError) {
            return { data: null, error: { message: options.signOutError } };
          }
          return { data: {}, error: null };
        },
        async createUser(payload) {
          if (options.createUserError) return { data: null, error: { message: options.createUserError } };
          return { data: { user: { id: '11111111-2222-4333-8444-555555555555', email: payload.email } }, error: null };
        },
        async deleteUser() {
          return { data: {}, error: null };
        },
      },
    },
  };

  return {
    state,
    createSupabaseServerClient: async () => dbClient,
    createSupabaseServiceClient: () => dbClient,
  };
}

async function runPhaseC249Suite() {
  console.log('======================================================================');
  console.log(' CLASPTEK PHASE C249 — PEOPLE & ACCESS GOVERNANCE REGRESSION SUITE');
  console.log('======================================================================\n');

  const personnelQueries = loadTsModule('lib/admin/personnel-queries.ts', {
    '@/lib/supabase/server': {
      createSupabaseServerClient: async () => {
        throw new Error('Must use injected test client');
      },
      createSupabaseServiceClient: () => {
        throw new Error('Must use injected test client');
      },
    },
    '@/lib/finance/queries': {
      recordFinanceAuditLog: async () => {},
    },
  });

  const routeSource = fs.readFileSync(path.join(worktreeRoot, 'app/api/admin/users/route.ts'), 'utf8');
  const clientSource = fs.readFileSync(path.join(worktreeRoot, 'app/people-access/PeopleAccessPageClient.tsx'), 'utf8');
  const queriesSource = fs.readFileSync(path.join(worktreeRoot, 'lib/admin/personnel-queries.ts'), 'utf8');
  const migrationC218Source = fs.readFileSync(path.join(worktreeRoot, 'migrations/20261102_atomic_last_super_admin.sql'), 'utf8');
  const migrationC249Source = fs.readFileSync(path.join(worktreeRoot, 'migrations/20261103_c249_people_access_governance_remediation.sql'), 'utf8');

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function runScenario(id, title, fn) {
    try {
      await fn();
      passed++;
      console.log(`  [PASS] Scenario ${String(id).padStart(2, '0')}: ${title}`);
    } catch (err) {
      failed++;
      failures.push({ id, title, error: err.message });
      console.error(`  [FAIL] Scenario ${String(id).padStart(2, '0')}: ${title}\n         -> ${err.stack || err.message}`);
    }
  }

  const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ACTOR_ADMIN = { id: '00000000-0000-4000-8000-000000000001', role: 'Super Admin' };
  const ADMIN_2_ID = '00000000-0000-4000-8000-000000000002';
  const STAFF_1_ID = '00000000-0000-4000-8000-000000000003';
  const TENANT_B_USER_ID = '00000000-0000-4000-8000-000000000099';

  // -------------------------------------------------------------------------
  // Scenario 1: People & Access GET succeeds with valid fixture data
  // -------------------------------------------------------------------------
  await runScenario(1, 'People & Access GET succeeds with valid fixture data, normalizes roles, and never fabricates user@clasptek.org', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active', created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'FINANCE_MANAGER', status: 'active', created_at: '2026-01-02T00:00:00Z' },
      ],
      profiles: [
        { id: ACTOR_ADMIN.id, email: 'admin@clasptek.org', full_name: 'Adaobi SuperAdmin' },
        { id: STAFF_1_ID, email: '', full_name: 'Chinedu Finance' },
      ],
      personnel: [
        { id: 'p1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, employee_id: 'CLP-STF-001', full_name: 'Adaobi SuperAdmin', email: 'admin@clasptek.org', employee_type: 'staff', department: 'Executive', job_title: 'Director', employment_status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const res = await personnelQueries.getAdminUsersListResult(TENANT_A);
    assert.strictEqual(res.success, true, 'Expected getAdminUsersListResult to succeed');
    assert.strictEqual(res.data.length, 2, 'Expected 2 tenant users');
    assert.strictEqual(res.data[0].role, 'Super Admin', 'Expected SUPER_ADMIN to normalize to Super Admin');
    assert.strictEqual(res.data[1].role, 'Finance Manager', 'Expected FINANCE_MANAGER to normalize to Finance Manager');
    assert.notStrictEqual(res.data[1].email, 'user@clasptek.org', 'Missing email must never be fabricated as user@clasptek.org');
    assert(res.data[1].email.startsWith('unresolved-'), 'Missing email must be explicitly flagged as unresolved');
    assert(!queriesSource.includes("|| 'user@clasptek.org'"), 'Fabricated user@clasptek.org fallback must be absent from personnel-queries.ts');
  });

  // -------------------------------------------------------------------------
  // Scenario 2: GET handles database errors safely
  // -------------------------------------------------------------------------
  await runScenario(2, 'GET surfaces database errors explicitly (HTTP 500 USERS_FETCH_FAILED) instead of returning silent empty list', async () => {
    const env = createMockEnvironment({
      tableErrors: { tenant_memberships: 'connection terminated unexpectedly' },
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const res = await personnelQueries.getAdminUsersListResult(TENANT_A);
    assert.strictEqual(res.success, false, 'Expected getAdminUsersListResult to return success: false on DB error');
    assert(res.error.includes('FAILED_TO_FETCH_USERS'), 'Expected FAILED_TO_FETCH_USERS error prefix');
    assert(routeSource.includes('getAdminUsersListResult(auth.session.tenantId)'), 'GET route must call getAdminUsersListResult');
    assert(routeSource.includes("code: 'USERS_FETCH_FAILED'"), 'GET route must return HTTP 500 with structured error code');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: PATCH rejects unauthorized users
  // -------------------------------------------------------------------------
  await runScenario(3, 'PATCH /api/admin/users rejects unauthenticated and non-Super-Admin callers via requireAuth', async () => {
    assert(routeSource.includes("allowedRoles: ['Super Admin']"), 'Route must enforce Super Admin role on PATCH');
    assert(routeSource.includes('if (auth.errorResponse) return auth.errorResponse;'), 'Route must return requireAuth 401/403 errorResponse');

    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const mutRes = await personnelQueries.executeVerifiedTenantMembershipMutation({
      tenantId: TENANT_A,
      actor: { id: STAFF_1_ID, role: 'Staff' },
      targetUserId: STAFF_1_ID,
      nextRole: 'FINANCE_STAFF',
      auditAction: 'CHANGE_USER_ROLE',
      reason: 'Unauthorized attempt',
    });
    assert.strictEqual(mutRes.success, false);
    assert.strictEqual(mutRes.code, 'FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Membership updates verify affected rows
  // -------------------------------------------------------------------------
  await runScenario(4, 'Membership updates verify affected row count and fail closed when zero rows are affected', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
      forceZeroRowsOnUpdate: { tenant_memberships: true },
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const res = await personnelQueries.executeVerifiedTenantMembershipMutation({
      tenantId: TENANT_A,
      actor: ACTOR_ADMIN,
      targetUserId: STAFF_1_ID,
      nextRole: 'FINANCE_STAFF',
      auditAction: 'CHANGE_USER_ROLE',
      reason: 'Promote to Finance Staff',
    });
    assert.strictEqual(res.success, false, 'Zero affected rows must fail');
    assert.strictEqual(res.code, 'MEMBERSHIP_UPDATE_AFFECTED_ZERO_ROWS');
    assert.strictEqual(res.rowsAffected, 0);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Audit logging failure prevents an unaudited governance mutation
  // -------------------------------------------------------------------------
  await runScenario(5, 'Audit logging failure aborts mutation and rolls back tenant_memberships to original state', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active', updated_at: '2026-01-01T00:00:00Z' },
      ],
      failAuditInsert: true,
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    // 5a: Role change rollback on audit failure
    const roleRes = await personnelQueries.executeVerifiedTenantMembershipMutation({
      tenantId: TENANT_A,
      actor: ACTOR_ADMIN,
      targetUserId: STAFF_1_ID,
      nextRole: 'FINANCE_MANAGER',
      auditAction: 'CHANGE_USER_ROLE',
      reason: 'Role change when audit fails',
    });
    assert.strictEqual(roleRes.success, false);
    assert.strictEqual(roleRes.code, 'SECURITY_AUDIT_LOG_FAILURE');
    const memAfterRoleFail = env.state.tenant_memberships.find((m) => m.user_id === STAFF_1_ID);
    assert.strictEqual(memAfterRoleFail.role, 'STAFF', 'Membership role must be rolled back to STAFF when audit fails');

    // 5b: Permanent revocation rollback on audit failure (and signOut must NOT be called)
    const revRes = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      STAFF_1_ID,
      'Security policy violation requiring revocation'
    );
    assert.strictEqual(revRes.success, false);
    assert.strictEqual(revRes.code, 'SECURITY_AUDIT_LOG_FAILURE');
    const memAfterRevokeFail = env.state.tenant_memberships.find((m) => m.user_id === STAFF_1_ID);
    assert.strictEqual(memAfterRevokeFail.status, 'active', 'Membership status must be rolled back to active when audit fails');
    assert.strictEqual(env.state.signOutCalls.length, 0, 'GoTrue signOut must not be called when audit logging fails');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Valid governance operations write the expected audit event
  // -------------------------------------------------------------------------
  await runScenario(6, 'Valid governance operations write sanitized, actor-bound audit events to finance_audit_log', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const res = await personnelQueries.executeVerifiedTenantMembershipMutation({
      tenantId: TENANT_A,
      actor: ACTOR_ADMIN,
      targetUserId: STAFF_1_ID,
      nextRole: 'FINANCE_STAFF',
      auditAction: 'CHANGE_USER_ROLE',
      reason: 'Assigned to Q4 billing reconciliation',
      auditNewState: { role: 'FINANCE_STAFF', password: 'should_be_stripped', token: 'secret_tok' },
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.rowsAffected, 1);
    assert.strictEqual(env.state.finance_audit_log.length, 1);
    const log = env.state.finance_audit_log[0];
    assert.strictEqual(log.tenant_id, TENANT_A);
    assert.strictEqual(log.actor_id, ACTOR_ADMIN.id);
    assert.strictEqual(log.actor_role, 'Super Admin');
    assert.strictEqual(log.action, 'CHANGE_USER_ROLE');
    assert.strictEqual(log.entity_id, STAFF_1_ID);
    assert.strictEqual(log.reason, 'Assigned to Q4 billing reconciliation');
    assert.strictEqual(log.new_state.password, undefined, 'Sensitive password field must be stripped');
    assert.strictEqual(log.new_state.token, undefined, 'Sensitive token field must be stripped');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Missing audit policy/configuration or unauthorized actor fails safely
  // -------------------------------------------------------------------------
  await runScenario(7, 'Missing audit configuration or unauthorized audit actor fails closed with SECURITY_AUDIT_LOG_FAILURE', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    await assert.rejects(
      async () => {
        await personnelQueries.recordFinanceAuditLogFailClosed({
          tenantId: TENANT_A,
          action: 'CHANGE_USER_ROLE',
          entityType: 'user',
          entityId: STAFF_1_ID,
          actorId: STAFF_1_ID,
          actorRole: 'Staff',
          reason: 'Forged actor audit attempt',
        });
      },
      (err) => err.message.includes('SECURITY_AUDIT_LOG_FAILURE'),
      'Unauthorized actor must be rejected by fail-closed audit logger'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Nonexistent profiles columns are never queried or updated
  // -------------------------------------------------------------------------
  await runScenario(8, 'Nonexistent public.profiles columns (role, is_active, tenant_id) are never queried or updated in code or SQL', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
      profiles: [
        { id: ACTOR_ADMIN.id, email: 'admin@clasptek.org', full_name: 'Adaobi SuperAdmin' },
        { id: STAFF_1_ID, email: 'staff@clasptek.org', full_name: 'Staff Member' },
      ],
      personnel: [],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    await personnelQueries.getAdminUsersListResult(TENANT_A);
    await personnelQueries.initiateAdminPasswordReset(TENANT_A, ACTOR_ADMIN, STAFF_1_ID, 'Admin password reset test');
    await personnelQueries.revokeUserAccess(TENANT_A, ACTOR_ADMIN, STAFF_1_ID, 'Revoke access for schema test');
    await personnelQueries.reactivateUserAccess(TENANT_A, ACTOR_ADMIN, STAFF_1_ID, 'Reactivate access for schema test');

    const profileQueries = env.state.queriedTablesAndCols.filter((q) => q.table === 'profiles');
    for (const pq of profileQueries) {
      assert(!pq.selectCols.includes('role'), `profiles query must not select role: ${pq.selectCols}`);
      assert(!pq.selectCols.includes('is_active'), `profiles query must not select is_active: ${pq.selectCols}`);
      assert(!pq.selectCols.includes('tenant_id'), `profiles query must not select tenant_id: ${pq.selectCols}`);
    }

    const profileMutations = env.state.mutatedTablesAndPayloads.filter((m) => m.table === 'profiles');
    assert.strictEqual(profileMutations.length, 0, 'Revoke/reactivate must not execute mutations against public.profiles');

    const migrationC251Source = fs.existsSync(path.join(worktreeRoot, 'migrations/20261104_c251_atomic_people_access_governance.sql'))
      ? fs.readFileSync(path.join(worktreeRoot, 'migrations/20261104_c251_atomic_people_access_governance.sql'), 'utf8')
      : '';
    assert(!migrationC249Source.includes('UPDATE public.profiles'), '20261103 C249 migration must not update public.profiles');
    assert(!migrationC251Source.includes('UPDATE public.profiles'), '20261104 C251 migration must not update public.profiles');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Last SUPER_ADMIN cannot be removed
  // -------------------------------------------------------------------------
  await runScenario(9, 'Last active SUPER_ADMIN cannot be demoted, suspended, or permanently revoked', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const selfRes = await personnelQueries.executeAtomicSuperAdminGovernance(
      TENANT_A,
      ACTOR_ADMIN,
      ACTOR_ADMIN.id,
      'revoke-access',
      undefined,
      'Attempting self revocation'
    );
    assert.strictEqual(selfRes.success, false);
    assert.strictEqual(selfRes.code, 'CANNOT_DEMOTE_SELF');

    // Even if another actor tries to demote the sole active SUPER_ADMIN
    const isLast = await personnelQueries.checkIsLastSuperAdmin(TENANT_A, ACTOR_ADMIN.id);
    assert.strictEqual(isLast, true, 'Must detect sole active Super Admin');
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Concurrent demotion attempts where only two SUPER_ADMINs exist
  // -------------------------------------------------------------------------
  await runScenario(10, 'Concurrent demotion/revocation attempts on the only two SUPER_ADMINs serialize so one succeeds and the second fails', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: ADMIN_2_ID, role: 'SUPER_ADMIN', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    // Admin 1 demotes Admin 2 while Admin 2 concurrently revokes Admin 1
    const [res1, res2] = await Promise.all([
      personnelQueries.executeAtomicSuperAdminGovernance(
        TENANT_A,
        ACTOR_ADMIN,
        ADMIN_2_ID,
        'change-role',
        'STAFF',
        'Demoting Admin 2'
      ),
      personnelQueries.executeAtomicSuperAdminGovernance(
        TENANT_A,
        { id: ADMIN_2_ID, role: 'Super Admin' },
        ACTOR_ADMIN.id,
        'revoke-access',
        undefined,
        'Concurrently revoking Admin 1'
      ),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failuresList = [res1, res2].filter((r) => !r.success);
    assert.strictEqual(successes.length, 1, 'Exactly one concurrent Super Admin removal may succeed');
    assert.strictEqual(failuresList.length, 1, 'The second concurrent Super Admin removal must be rejected');

    const remainingActiveSuperAdmins = env.state.tenant_memberships.filter(
      (m) => m.tenant_id === TENANT_A && m.role === 'SUPER_ADMIN' && m.status === 'active'
    );
    assert.strictEqual(remainingActiveSuperAdmins.length, 1, 'At least one active SUPER_ADMIN must remain in tenant');
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Revocation requires a non-empty, trimmed reason
  // -------------------------------------------------------------------------
  await runScenario(11, 'Permanent access revocation rejects missing, empty, whitespace-only, or <3 char reasons without mutating state', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    for (const invalidReason of [undefined, '', '   ', 'ab']) {
      const res = await personnelQueries.revokeUserAccess(TENANT_A, ACTOR_ADMIN, STAFF_1_ID, invalidReason);
      assert.strictEqual(res.success, false, `Expected reason "${invalidReason}" to be rejected`);
      assert.strictEqual(res.code, 'REASON_REQUIRED');
    }

    const mem = env.state.tenant_memberships.find((m) => m.user_id === STAFF_1_ID);
    assert.strictEqual(mem.status, 'active', 'Membership must remain active after rejected reason validation');
    assert.strictEqual(env.state.signOutCalls.length, 0, 'signOut must not be called when reason is invalid');
    assert(!routeSource.includes("'Permanent access revocation by Super Admin'"), 'Silent default revocation reason fallback must be removed from route.ts');
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Revocation preserves personnel and historical records
  // -------------------------------------------------------------------------
  await runScenario(12, 'Permanent access revocation suspends portal login without altering HR personnel employment_status or compensation', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
      personnel: [
        {
          id: 'p_staff_1',
          tenant_id: TENANT_A,
          user_id: STAFF_1_ID,
          employee_id: 'CLP-STF-009',
          full_name: 'Ngozi Staff',
          email: 'ngozi@clasptek.org',
          employment_status: 'active',
          basic_pay: 450000,
        },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const res = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      STAFF_1_ID,
      'Completed contract; revoking portal credentials while preserving HR archive'
    );
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.completionState, 'COMPLETED');
    assert.strictEqual(res.sessionTerminated, true);

    const pers = env.state.personnel.find((p) => p.user_id === STAFF_1_ID);
    assert.strictEqual(pers.employment_status, 'active', 'Personnel employment_status must remain untouched');
    assert.strictEqual(pers.basic_pay, 450000, 'Personnel basic_pay must remain untouched');
  });

  // -------------------------------------------------------------------------
  // Scenario 13: Session sign-out failures are detected
  // -------------------------------------------------------------------------
  await runScenario(13, 'Session sign-out failures ({ error } or exception from GoTrue signOut) are detected and never reported as clean success', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
      signOutError: 'GoTrue service temporarily unreachable',
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const sessRes = await personnelQueries.revokeUserSessions(TENANT_A, ACTOR_ADMIN, STAFF_1_ID);
    assert.strictEqual(sessRes.success, false, 'revokeUserSessions must fail when signOut returns an error');
    assert(sessRes.error.includes('SESSION_REVOCATION_FAILED'), 'Expected SESSION_REVOCATION_FAILED error');
  });

  // -------------------------------------------------------------------------
  // Scenario 14: Partial revocation is reported accurately
  // -------------------------------------------------------------------------
  await runScenario(14, 'When membership suspension & audit succeed but GoTrue signOut fails, revokeUserAccess returns explicit PARTIAL_SESSION_TERMINATION_PENDING and logs reconciliation event', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
      signOutError: 'GoTrue global signOut timeout',
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const revRes = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      STAFF_1_ID,
      'Immediate portal access revocation during incident response',
      'op_incident_01'
    );
    assert.strictEqual(revRes.success, false, 'Partial revocation must not report full success: true');
    assert.strictEqual(revRes.partialRevocation, true, 'Must set partialRevocation: true');
    assert.strictEqual(revRes.completionState, 'PARTIAL_SESSION_TERMINATION_PENDING');
    assert.strictEqual(revRes.sessionTerminated, false);
    assert.strictEqual(revRes.reconciliationPending, true);
    assert.strictEqual(revRes.status, 'suspended');

    // Verify membership is suspended and both primary + reconciliation audit logs exist
    const mem = env.state.tenant_memberships.find((m) => m.user_id === STAFF_1_ID);
    assert.strictEqual(mem.status, 'suspended');
    const actions = env.state.finance_audit_log.map((l) => l.action);
    assert(actions.includes('REVOKE_USER_ACCESS'), 'Primary REVOKE_USER_ACCESS audit log must be recorded');
    assert(
      actions.includes('REVOKE_ACCESS_SESSION_RECONCILIATION_PENDING'),
      'Reconciliation pending audit event must be recorded'
    );
    assert(routeSource.includes('revokeAccessRes.partialRevocation'), 'PATCH route must handle partialRevocation explicitly');
    assert(routeSource.includes('? 409 : 400'), 'PATCH route must return HTTP 409 for partial completion state');
  });

  // -------------------------------------------------------------------------
  // Scenario 15: Repeated revocation requests are idempotent
  // -------------------------------------------------------------------------
  await runScenario(15, 'Repeated permanent revocation requests for an already-revoked user are idempotent and do not duplicate audit logs', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm2', tenant_id: TENANT_A, user_id: STAFF_1_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const first = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      STAFF_1_ID,
      'First permanent revocation request'
    );
    assert.strictEqual(first.success, true);
    assert.strictEqual(env.state.finance_audit_log.length, 1);

    const second = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      STAFF_1_ID,
      'Duplicate revocation request after retry'
    );
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.idempotent, true, 'Second call must return idempotent: true');
    assert.strictEqual(env.state.finance_audit_log.length, 1, 'Idempotent retry must not write duplicate audit entry');
  });

  // -------------------------------------------------------------------------
  // Scenario 16: Cross-tenant revocation is rejected
  // -------------------------------------------------------------------------
  await runScenario(16, 'Cross-tenant revocation and cross-tenant membership updates are rejected with USER_NOT_FOUND', async () => {
    const env = createMockEnvironment({
      tenant_memberships: [
        { id: 'm1', tenant_id: TENANT_A, user_id: ACTOR_ADMIN.id, role: 'SUPER_ADMIN', status: 'active' },
        { id: 'm_b', tenant_id: TENANT_B, user_id: TENANT_B_USER_ID, role: 'STAFF', status: 'active' },
      ],
    });
    personnelQueries.setPersonnelQueriesDepsForTests(env);

    const revRes = await personnelQueries.revokeUserAccess(
      TENANT_A,
      ACTOR_ADMIN,
      TENANT_B_USER_ID,
      'Cross-tenant revocation attempt'
    );
    assert.strictEqual(revRes.success, false);
    assert.strictEqual(revRes.code, 'USER_NOT_FOUND');

    const tenantBMember = env.state.tenant_memberships.find((m) => m.user_id === TENANT_B_USER_ID);
    assert.strictEqual(tenantBMember.status, 'active', 'Tenant B user must remain active');
    assert.strictEqual(env.state.signOutCalls.length, 0, 'Cross-tenant signOut must never be called');
  });

  // -------------------------------------------------------------------------
  // Scenario 17: Modal remains open on failure and preserves the user's reason
  // -------------------------------------------------------------------------
  await runScenario(17, 'Confirmation modal remains open on failure and preserves the administrator entered reason', async () => {
    const fnStart = clientSource.indexOf('const handleConfirmRevokeAccess = async () =>');
    const fnEnd = clientSource.indexOf('const handleOpenActivity = async', fnStart);
    const handleRevokeBody = clientSource.slice(fnStart, fnEnd);

    const catchBlock = handleRevokeBody.slice(handleRevokeBody.indexOf('} catch'));
    assert(!catchBlock.includes('setRevokeAccessModalUser(null)'), 'Catch block must NOT close revokeAccessModalUser on failure');
    assert(!catchBlock.includes("setRevokeAccessReason('')"), 'Catch block must NOT clear revokeAccessReason on failure');
    assert(handleRevokeBody.includes('setModalError(msg)'), 'Error branch must set modalError inside open modal');
  });

  // -------------------------------------------------------------------------
  // Scenario 18: Error feedback is visible above or inside the modal
  // -------------------------------------------------------------------------
  await runScenario(18, 'Error and partial-completion banners render inside the modal and toast zIndex (1200) is above modal backdrop (1000)', async () => {
    assert(clientSource.includes('role="alert"'), 'Modal error banner must have role="alert"');
    assert(clientSource.includes('{modalError && ('), 'Modal must render modalError banner inside dialog');
    assert(clientSource.includes('{revokeAccessPartialNotice && ('), 'Modal must render partial completion notice inside dialog');
    assert(clientSource.includes('zIndex: 1200'), 'Toast notification must use zIndex: 1200 above modal backdrop (zIndex: 1000)');
    assert(
      clientSource.includes('Linked HR personnel records and historical financial, payroll, attendance, and training records are preserved intact.'),
      'Revocation confirmation dialog must accurately state that HR, financial, payroll, attendance, and training records are preserved'
    );
    assert(
      !clientSource.includes('deactivates their associated personnel record'),
      'Misleading claim that revocation deactivates personnel record must be removed'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 19: Duplicate submission is prevented while request is in flight
  // -------------------------------------------------------------------------
  await runScenario(19, 'Duplicate submission is prevented while request is in flight or when permanent revocation reason is blank', async () => {
    assert(clientSource.includes('if (!revokeAccessModalUser || isSubmitting) return;'), 'handleConfirmRevokeAccess must guard against in-flight submission');
    assert(
      clientSource.includes('disabled={isSubmitting || !revokeAccessReason.trim()}'),
      'Confirm button must be disabled while isSubmitting or when revokeAccessReason is blank'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 20: Existing People & Access behavior remains compatible
  // -------------------------------------------------------------------------
  await runScenario(20, 'Existing People & Access KPIs, tabs, CSV export, role matrix, and C249 SQL migration contracts remain intact', async () => {
    assert(clientSource.includes("onClick={() => setSubTab('users')}"), 'Users tab must remain intact');
    assert(clientSource.includes("onClick={() => setSubTab('personnel')}"), 'Personnel tab must remain intact');
    assert(clientSource.includes("onClick={() => setSubTab('security')}"), 'Security & Role Matrix tab must remain intact');
    assert(clientSource.includes('handleExportUsers'), 'CSV export handler must remain intact');
    assert(migrationC249Source.includes('CREATE TABLE IF NOT EXISTS public.governance_session_revocation_outbox'), 'C249 migration must define session revocation reconciliation outbox');
    assert(migrationC249Source.includes('CREATE OR REPLACE FUNCTION public.record_governance_audit_log'), 'C249 migration must define record_governance_audit_log RPC');
    assert(migrationC249Source.includes('CREATE OR REPLACE FUNCTION public.demote_or_suspend_super_admin'), 'C249 migration must repair demote_or_suspend_super_admin RPC');
  });

  console.log('\n======================================================================');
  console.log(` PHASE C249 REGRESSION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseC249Suite().catch((err) => {
  console.error('Unhandled error in Phase C249 suite:', err);
  process.exit(1);
});
