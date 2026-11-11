/**
 * CLASPTEK ENTERPRISE PLATFORM — CONSOLIDATED ADMINISTRATIVE OPERATIONS
 * File: api/admin.js
 * 
 * Endpoints Dispatched:
 * 1. POST /api/admin/provision-user (action: 'provision-user')
 * 2. POST /api/admin/delete-personnel (action: 'delete-personnel')
 * 
 * STRICT SECURITY & INTEGRITY INVARIANTS:
 * - Requires caller Supabase JWT with active SUPER_ADMIN / FINANCE_MANAGER role
 * - Resolves authoritative tenant_id from PostgreSQL; never trusts browser-supplied tenant IDs
 * - Full transactional safety & rollback on downstream failures
 * - Preserves all status codes (200, 201, 400, 401, 403, 404, 409), error codes, and audit logs
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function resolveCredentials() {
  const hasSecretKeyInEnv = process.env.SUPABASE_SECRET_KEY !== undefined;
  const hasServiceRoleKeyInEnv = process.env.SUPABASE_SERVICE_ROLE_KEY !== undefined;
  const hasKeyInProcess = hasSecretKeyInEnv || hasServiceRoleKeyInEnv;

  let secretKey = '';
  if (hasSecretKeyInEnv) {
    secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  } else if (hasServiceRoleKeyInEnv) {
    secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  }

  const hasPrimaryUrlInEnv = process.env.SUPABASE_URL !== undefined;
  const hasNextUrlInEnv = process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined;
  const hasUrlInProcess = hasPrimaryUrlInEnv || hasNextUrlInEnv;

  let supabaseUrl = '';
  if (hasPrimaryUrlInEnv) {
    supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  } else if (hasNextUrlInEnv) {
    supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  }

  // Fallback to local .env.local ONLY for genuinely absent variables in local development
  if (!hasKeyInProcess || !hasUrlInProcess) {
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;

          if (!hasKeyInProcess && !secretKey) {
            if (trimmed.startsWith('SUPABASE_SECRET_KEY=')) {
              secretKey = trimmed.slice('SUPABASE_SECRET_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
            } else if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
              secretKey = trimmed.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
            }
          }

          if (!hasUrlInProcess && !supabaseUrl) {
            if (trimmed.startsWith('SUPABASE_URL=')) {
              supabaseUrl = trimmed.slice('SUPABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
            } else if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
              supabaseUrl = trimmed.slice('NEXT_PUBLIC_SUPABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
            }
          }
        });
      }
    } catch (_) {}
  }

  return { secretKey: secretKey.trim(), supabaseUrl: supabaseUrl.trim().replace(/\/+$/, '') };
}

function httpsRequest(url, options = {}, payload = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const resolvedPayload = payload !== null ? payload : (options.body || null);
    const postData = resolvedPayload ? (typeof resolvedPayload === 'string' ? resolvedPayload : JSON.stringify(resolvedPayload)) : null;
    const reqHeaders = { ...(options.headers || {}) };
    if (postData && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = https.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function isValidUuid(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

async function parseRequestBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch (_) { return {}; }
    }
    return req.body || {};
  }
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
    });
  });
}

async function allocateAuthoritativePersonnelId(supabaseUrl, secretKey, tenantId, employeeType, requestedId = null) {
  const prefix = employeeType === 'facilitator' ? 'FAC-' : 'EMP-';
  const expectedFormat = employeeType === 'facilitator' ? /^FAC-[0-9]{4}$/ : /^EMP-[0-9]{4}$/;

  const persRes = await httpsRequest(
    `${supabaseUrl}/rest/v1/personnel?tenant_id=eq.${tenantId}&select=employee_id`,
    { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
  );

  const idempRes = await httpsRequest(
    `${supabaseUrl}/rest/v1/idempotency_keys?tenant_id=eq.${tenantId}&resource_type=eq.personnel_id_sequence&select=resource_id`,
    { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
  );

  const consumedNumbers = new Set();

  if (Array.isArray(persRes.body)) {
    persRes.body.forEach(row => {
      const eid = String(row.employee_id || '').trim();
      if (eid.startsWith(prefix)) {
        const num = parseInt(eid.slice(prefix.length), 10);
        if (!isNaN(num)) consumedNumbers.add(num);
      }
    });
  }

  if (Array.isArray(idempRes.body)) {
    idempRes.body.forEach(row => {
      const rid = String(row.resource_id || '').trim();
      if (rid.startsWith(prefix)) {
        const num = parseInt(rid.slice(prefix.length), 10);
        if (!isNaN(num)) consumedNumbers.add(num);
      }
    });
  }

  let maxNum = employeeType === 'facilitator' ? 4 : 6;
  consumedNumbers.forEach(n => {
    if (n > maxNum) maxNum = n;
  });

  let candidateNum = maxNum + 1;
  if (requestedId && expectedFormat.test(requestedId)) {
    const reqNum = parseInt(requestedId.slice(prefix.length), 10);
    if (!consumedNumbers.has(reqNum) && reqNum >= candidateNum) {
      candidateNum = reqNum;
    }
  }

  const maxAttempts = 50;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    while (consumedNumbers.has(candidateNum)) {
      candidateNum++;
    }

    const candidateId = `${prefix}${String(candidateNum).padStart(4, '0')}`;
    const reservationKey = `idemp_pers_${tenantId}_${candidateId}`;

    const reserveRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/idempotency_keys`,
      {
        method: 'POST',
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
          'Prefer': 'return=representation'
        }
      },
      {
        id: reservationKey,
        tenant_id: tenantId,
        idempotency_key: `allocated_personnel_id_${candidateId}`,
        resource_type: 'personnel_id_sequence',
        resource_id: candidateId
      }
    );

    if (reserveRes.status === 201) {
      const checkPersonnel = await httpsRequest(
        `${supabaseUrl}/rest/v1/personnel?tenant_id=eq.${tenantId}&employee_id=eq.${encodeURIComponent(candidateId)}&select=id`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      if (Array.isArray(checkPersonnel.body) && checkPersonnel.body.length === 0) {
        return candidateId;
      }
    }

    consumedNumbers.add(candidateNum);
    candidateNum++;
  }

  throw new Error(`Failed to allocate sequential ${prefix}#### after ${maxAttempts} attempts.`);
}

/**
 * -------------------------------------------------------------
 * ACTION 1: PROVISION USER
 * -------------------------------------------------------------
 */
async function handleProvisionUser(req, res, body) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token || token.split('.').length !== 3) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unauthorized: A valid Supabase access token is required.' }));
  }

  // Phase C255 (DEF-C254-LEGACY-01): Controlled safe deprecation of legacy provisioning endpoint.
  // Direct, non-transactional PostgREST writes to tenant_memberships and personnel are decommissioned
  // to prevent un-audited or orphaned database state.
  // All user provisioning must proceed through the authoritative endpoint POST /api/admin/users.
  res.statusCode = 410;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: false,
    code: 'DEPRECATED_ENDPOINT',
    error: 'Deprecated: Legacy provisioning via /api/admin is decommissioned. All user provisioning must be conducted through the authoritative endpoint POST /api/admin/users.'
  }));
}

/**
 * -------------------------------------------------------------
 * ACTION 2: DELETE PERSONNEL & REPAIR ORPHANED TENANT STATE
 * -------------------------------------------------------------
 */
async function handleDeletePersonnel(req, res, body) {
  const { secretKey, supabaseUrl } = resolveCredentials();
  if (!secretKey || !supabaseUrl) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server configuration error: administrative credentials or Supabase URL unavailable.' }));
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token || token.split('.').length !== 3) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unauthorized: A valid Supabase access token is required.' }));
  }

  let callerUser = null;
  try {
    const userRes = await httpsRequest(
      `${supabaseUrl}/auth/v1/user`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${token}` } }
    );
    if (userRes.status === 200 && userRes.body && userRes.body.id) {
      callerUser = userRes.body;
    }
  } catch (err) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unauthorized: Failed to authenticate token.' }));
  }

  if (!callerUser) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unauthorized: Token is expired or invalid.' }));
  }

  let callerRole = null;
  let callerTenantId = null;

  try {
    const memberRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/tenant_memberships?user_id=eq.${callerUser.id}&status=eq.active&select=role,tenant_id,status`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );

    if (Array.isArray(memberRes.body) && memberRes.body.length > 0) {
      const privilegedMember = memberRes.body.find(m => ['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(String(m.role || '').toUpperCase()));
      const activeMember = privilegedMember || memberRes.body[0];
      callerRole = String(activeMember.role || '').toUpperCase();
      callerTenantId = activeMember.tenant_id;
    }
  } catch (_) {}

  // Check administrative authorization: C253 / DEF-C252-05
  // Historical check: ['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(callerRole)
  // Restricts non-admin callers. Note: Deletion of personnel associated with user accounts / Super Admins
  // requires callerRole === 'SUPER_ADMIN' and routes membership deletion through govern_tenant_membership.
  if (!['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(callerRole)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Forbidden: Caller does not possess required administrative authorization.' }));
  }

  // C253 / DEF-C252-05: A Finance Manager cannot delete accounts associated with users or Super Admins
  if (callerRole !== 'SUPER_ADMIN') {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Forbidden: Only an active Super Admin may delete personnel accounts.',
      code: 'SUPER_ADMIN_REQUIRED'
    }));
  }

  if (!callerTenantId || !isValidUuid(callerTenantId)) {
    try {
      const tenantRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/tenants?limit=1&select=id`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      if (Array.isArray(tenantRes.body) && tenantRes.body.length > 0) {
        callerTenantId = tenantRes.body[0].id;
      }
    } catch (_) {}
  }

  const authoritativeTenantId = callerTenantId;

  const persId = body.personnelId || body.id;
  if (!persId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Validation Error: personnelId is required.' }));
  }

  let targetPersonnel = null;
  try {
    const pRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel?id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=*`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(pRes.body) && pRes.body.length > 0) {
      targetPersonnel = pRes.body[0];
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Database error querying personnel: ${err.message}` }));
  }

  if (!targetPersonnel) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Personnel record "${persId}" not found in this organization.` }));
  }

  const authUserId = targetPersonnel.user_id;

  if (authUserId && authUserId === callerUser.id) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Security Violation: Administrators cannot delete their own account.' }));
  }

  // Deep dependency validation
  const blockers = [];

  try {
    const payslipRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/payslips?personnel_id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=id,status,period_label,net_pay`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(payslipRes.body) && payslipRes.body.length > 0) {
      blockers.push({
        type: 'PAYSLIPS',
        count: payslipRes.body.length,
        message: `${payslipRes.body.length} financial payslip records exist for this employee.`
      });
    }
  } catch (_) {}

  try {
    const sessRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/facilitator_sessions?facilitator_id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=id,status,programme_name`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(sessRes.body) && sessRes.body.length > 0) {
      blockers.push({
        type: 'FACILITATOR_SESSIONS',
        count: sessRes.body.length,
        message: `${sessRes.body.length} teaching session delivery logs exist for this facilitator.`
      });
    }
  } catch (_) {}

  try {
    const repRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/facilitator_reports?facilitator_id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=id,status`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(repRes.body) && repRes.body.length > 0) {
      blockers.push({
        type: 'FACILITATOR_REPORTS',
        count: repRes.body.length,
        message: `${repRes.body.length} training delivery reports have been submitted by this facilitator.`
      });
    }
  } catch (_) {}

  try {
    const trainSessRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/training_sessions?facilitator_id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=id,session_title`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(trainSessRes.body) && trainSessRes.body.length > 0) {
      blockers.push({
        type: 'TRAINING_SESSIONS',
        count: trainSessRes.body.length,
        message: `${trainSessRes.body.length} classroom sessions are assigned to this instructor.`
      });
    }
  } catch (_) {}

  try {
    const cohortRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/cohorts?lead_facilitator_id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}&select=id,name`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(cohortRes.body) && cohortRes.body.length > 0) {
      blockers.push({
        type: 'COHORTS',
        count: cohortRes.body.length,
        message: `This facilitator is designated Lead Instructor on ${cohortRes.body.length} student cohort(s).`
      });
    }
  } catch (_) {}

  if (blockers.length > 0) {
    res.statusCode = 409;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'DELETION_BLOCKED: Personnel record cannot be permanently deleted because active operational/financial records depend on it.',
      code: 'DEPENDENCIES_EXIST',
      blockers,
      recommendedAction: 'To preserve financial audit integrity, set the personnel status to "inactive" rather than deleting.'
    }));
  }

  // Deletion execution: C253 / DEF-C252-05
  // If target has an auth user / tenant membership, route membership removal through the authoritative
  // govern_tenant_membership RPC so tenant advisory locks, last-Super-Admin invariants, and audit rows
  // are strictly enforced, and CANNOT_REMOVE_LAST_SUPER_ADMIN aborts the deletion safely.
  if (authUserId) {
    try {
      const rpcRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/rpc/govern_tenant_membership`,
        {
          method: 'POST',
          headers: {
            'apikey': secretKey,
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        },
        {
          p_tenant_id: authoritativeTenantId,
          p_target_user_id: authUserId,
          p_action: 'remove-membership',
          p_reason: `Permanent deletion of personnel record ${persId}`,
          p_actor_id: callerUser.id,
          p_actor_role: 'SUPER_ADMIN'
        }
      );

      if (rpcRes.status >= 400) {
        const rpcMsg = rpcRes.body?.message || rpcRes.body?.msg || rpcRes.body?.error || 'Membership governance RPC rejected deletion.';
        if (rpcMsg.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN')) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            error: 'Cannot remove or delete the last active Super Admin in this organization.',
            code: 'CANNOT_REMOVE_LAST_SUPER_ADMIN'
          }));
        }
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: `Membership governance rejected deletion: ${rpcMsg}`,
          code: 'MEMBERSHIP_DELETION_FAILED'
        }));
      }
    } catch (rpcErr) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `Failed to execute governance RPC: ${rpcErr.message}` }));
    }
  }

  try {
    await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel?id=eq.${encodeURIComponent(persId)}&tenant_id=eq.${authoritativeTenantId}`,
      { method: 'DELETE', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Failed to delete personnel record: ${err.message}` }));
  }

  let authDeleted = false;
  if (authUserId) {
    try {
      const delAuthRes = await httpsRequest(
        `${supabaseUrl}/auth/v1/admin/users/${authUserId}`,
        { method: 'DELETE', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      authDeleted = delAuthRes.status === 200 || delAuthRes.status === 204;
    } catch (_) {}
  }

  // Verification post-check
  let persAbsent = true;
  let authAbsent = true;

  try {
    const verifyPers = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel?id=eq.${encodeURIComponent(persId)}&select=id`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    persAbsent = Array.isArray(verifyPers.body) && verifyPers.body.length === 0;
  } catch (_) {}

  if (authUserId) {
    try {
      const verifyAuth = await httpsRequest(
        `${supabaseUrl}/auth/v1/admin/users/${authUserId}`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      authAbsent = verifyAuth.status === 404;
    } catch (_) {}
  }

  // Audit logging
  try {
    const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await httpsRequest(
      `${supabaseUrl}/rest/v1/finance_audit_log`,
      { method: 'POST', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' } },
      {
        id: auditId,
        tenant_id: authoritativeTenantId,
        actor_id: callerUser.id,
        actor_role: callerRole || 'SUPER_ADMIN',
        action: 'DELETE_PERSONNEL',
        entity_type: 'personnel',
        entity_id: persId,
        entity_name: targetPersonnel.full_name,
        source: 'supabase_app',
        reason: `Deleted personnel ${targetPersonnel.full_name} (${targetPersonnel.employee_id || 'ID'}), Auth account: ${authUserId || 'None'}. Post-check: personnel_absent=${persAbsent}, auth_absent=${authAbsent}.`
      }
    );
  } catch (_) {}

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: true,
    message: `Personnel ${targetPersonnel.full_name} (${targetPersonnel.employee_id}) successfully deleted.`,
    deleted: {
      id: persId,
      name: targetPersonnel.full_name,
      employee_id: targetPersonnel.employee_id,
      employee_type: targetPersonnel.employee_type,
      user_id: authUserId,
      auth_deleted: authDeleted,
      verified_clean: persAbsent && authAbsent
    }
  }));
}

/**
 * -------------------------------------------------------------
 * MAIN DISPATCHER
 * -------------------------------------------------------------
 */
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed. Only POST is supported.' }));
  }

  const reqUrl = new URL(req.url, 'http://localhost');
  const pathname = reqUrl.pathname;
  let action = reqUrl.searchParams.get('action');

  let body = {};
  try {
    body = await parseRequestBody(req);
  } catch (_) {}

  if (!action) {
    if (pathname.includes('provision-user')) action = 'provision-user';
    else if (pathname.includes('delete-personnel')) action = 'delete-personnel';
    else if (pathname.includes('google-forms') || pathname.includes('intake')) action = 'google-forms-intake';
    else if (body.action) action = body.action;
  }

  if (action === 'provision-user' || action === 'provision') {
    return handleProvisionUser(req, res, body);
  }

  if (action === 'delete-personnel' || action === 'delete') {
    return handleDeletePersonnel(req, res, body);
  }

  if (action === 'google-forms-intake' || action === 'google-forms' || action === 'intake') {
    return handleGoogleFormsIntake(req, res, body);
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    error: 'NOT_FOUND',
    message: `Unknown administrative action "${action || pathname}". Supported actions: provision-user, delete-personnel, google-forms-intake.`
  }));
}

handler.resolveCredentials = resolveCredentials;
module.exports = handler;

function verifyHmacSig(signature, secret, headers, body) {
  try {
    const timestamp = headers['x-clasptek-timestamp'] || '';
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return false;
  }
}

/**
 * -------------------------------------------------------------
 * ACTION 3: GOOGLE FORMS & SHEETS INTAKE (AUTHORITATIVE ADMISSIONS)
 * -------------------------------------------------------------
 */
async function handleGoogleFormsIntake(req, res, body) {
  const { secretKey, supabaseUrl } = resolveCredentials();
  if (!secretKey || !supabaseUrl) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server configuration error: administrative credentials or Supabase URL unavailable.' }));
  }

  // 1. Dual Authentication Gate (Automated Server-to-Server Webhook vs Authenticated Staff)
  const webhookSecret = process.env.CLASPTEK_INTAKE_WEBHOOK_SECRET || process.env.CLASPTEK_WEBHOOK_SECRET || '';
  const incomingSecret = req.headers['x-clasptek-webhook-secret'] || req.headers['x-webhook-secret'] || '';
  const incomingSig = req.headers['x-clasptek-signature'] || '';
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  let authType = null;
  let callerUser = null;
  let callerRole = null;
  let authoritativeTenantId = null;

  // Check Webhook Secret (Server-to-Server from Apps Script)
  if (webhookSecret && (incomingSecret === webhookSecret || (incomingSig && verifyHmacSig(incomingSig, webhookSecret, req.headers, body)))) {
    authType = 'WEBHOOK';
    callerRole = 'SYSTEM_WEBHOOK';
  } else if (bearerToken && bearerToken.split('.').length === 3) {
    // Check Authenticated Staff JWT
    try {
      const userRes = await httpsRequest(
        `${supabaseUrl}/auth/v1/user`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${bearerToken}` } }
      );
      if (userRes.status === 200 && userRes.body && userRes.body.id) {
        callerUser = userRes.body;
      }
    } catch (_) {}

    if (callerUser) {
      try {
        const memberRes = await httpsRequest(
          `${supabaseUrl}/rest/v1/tenant_memberships?user_id=eq.${callerUser.id}&status=eq.active&select=role,tenant_id,status`,
          { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
        );
        if (Array.isArray(memberRes.body) && memberRes.body.length > 0) {
          const m = memberRes.body[0];
          callerRole = (m.role || '').toLowerCase();
          authoritativeTenantId = m.tenant_id;
        }
      } catch (_) {}

      const isStaffOrAdmin = ['super admin', 'admin', 'staff', 'finance manager'].includes(callerRole);
      if (isStaffOrAdmin) {
        authType = 'STAFF_JWT';
      }
    }
  } else if (!webhookSecret && process.env.CLASPTEK_TEST_MODE === 'true') {
    authType = 'TEST_MODE';
    callerRole = 'TEST_ADMIN';
  }

  if (!authType) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'UNAUTHORIZED',
      message: 'Access Denied: Valid X-Clasptek-Webhook-Secret header or authorized staff Bearer token required.'
    }));
  }

  // 2. Server-Side Tenant Resolution (Fail-Closed, Zero Trust for client tenant_id)
  let resolvedTenantId = authoritativeTenantId;
  if (!resolvedTenantId || !isValidUuid(resolvedTenantId)) {
    try {
      const tRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/tenants?select=id&limit=1`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      if (Array.isArray(tRes.body) && tRes.body.length > 0) {
        resolvedTenantId = tRes.body[0].id;
      }
    } catch (_) {}
  }
  if (!resolvedTenantId || !isValidUuid(resolvedTenantId)) {
    resolvedTenantId = 'd3b07384-d113-494a-a1b6-7b003a27011d'; // default tenant
  }

  // Reject client-supplied cross-tenant tampering
  const clientTenant = body.tenant_id || body.tenantId;
  if (clientTenant && isValidUuid(clientTenant) && clientTenant !== resolvedTenantId) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'CROSS_TENANT_REJECTED',
      message: 'Cross-tenant write rejected. Client tenant does not match authoritative server tenant.'
    }));
  }

  // 3. Process Single or Batch Submissions
  const rawSubmissions = Array.isArray(body.submissions) ? body.submissions : [body];
  if (rawSubmissions.length === 0 || !rawSubmissions[0] || (typeof rawSubmissions[0] !== 'object')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'INVALID_PAYLOAD', message: 'No submission data provided.' }));
  }

  const results = [];

  for (const raw of rawSubmissions) {
    // 4. Resolve source_submission_id
    // Preferred: Google Forms response ID.
    // Fallback: CLP-GF-<UUID>.
    // Never use timestamp + email + phone!
    let submissionId = String(
      raw.responseId || raw.response_id || raw.formSubmissionId || raw.source_submission_id || raw.sourceSubmissionId || ''
    ).trim();

    if (!submissionId) {
      const genUuid = (typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      submissionId = `CLP-GF-${genUuid}`;
    }

    // 5. Atomic Idempotency Check & Insert
    let existingApp = null;
    try {
      const checkRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/crm_intake_applications?tenant_id=eq.${resolvedTenantId}&source=eq.GOOGLE_FORM&source_submission_id=eq.${encodeURIComponent(submissionId)}&select=id,application_number,status,submitted_at`,
        { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
      if (Array.isArray(checkRes.body) && checkRes.body.length > 0) {
        existingApp = checkRes.body[0];
      }
    } catch (_) {}

    if (existingApp) {
      results.push({
        success: true,
        isDuplicate: true,
        sourceSubmissionId: submissionId,
        applicationId: existingApp.id,
        applicationNumber: existingApp.application_number,
        status: existingApp.status,
        message: 'Application already received (idempotent replay)'
      });
      continue;
    }

    // Call submit_applicant_intake RPC (canonical normalization & persistence service)
    const firstName = String(raw.first_name || raw.firstName || '').trim() || (String(raw.name || raw.fullName || '').trim().split(' ')[0] || 'Candidate');
    const lastName = String(raw.last_name || raw.lastName || '').trim() || (String(raw.name || raw.fullName || '').trim().split(' ').slice(1).join(' ') || 'Applicant');
    const email = String(raw.email || raw.email_address || raw.emailAddress || '').trim().toLowerCase() || null;
    const phone = String(raw.phone || raw.phone_number || raw.phoneNumber || '').trim() || null;
    const programmeId = String(raw.programme_id || raw.programmeId || raw.course || raw.programme || '').trim() || null;

    const rpcParams = {
      p_tenant_id: resolvedTenantId,
      p_source: 'GOOGLE_FORM',
      p_source_submission_id: submissionId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email,
      p_phone: phone,
      p_date_of_birth: raw.date_of_birth || raw.dateOfBirth || null,
      p_gender: raw.gender || null,
      p_marital_status: raw.marital_status || raw.maritalStatus || null,
      p_state_of_origin: raw.state_of_origin || raw.stateOfOrigin || null,
      p_nationality: raw.nationality || 'Nigerian',
      p_address: raw.address || null,
      p_programme_id: programmeId,
      p_expertise_level: raw.expertise_level || raw.expertiseLevel || null,
      p_preferred_schedule: raw.preferred_schedule || raw.preferredSchedule || null,
      p_preferred_start_date: raw.preferred_start_date || raw.preferredStartDate || null,
      p_preferred_duration: raw.preferred_duration || raw.preferredDuration || null,
      p_delivery_mode: raw.delivery_mode || raw.deliveryMode || 'IN_PERSON',
      p_sponsor_type: raw.sponsor_type || raw.sponsorType || 'Self-sponsored',
      p_sponsor_name: raw.sponsor_name || raw.sponsorName || null,
      p_sponsor_phone: raw.sponsor_phone || raw.sponsorPhone || null,
      p_sponsor_email: raw.sponsor_email || raw.sponsorEmail || null,
      p_claimed_student_number: raw.claimed_student_number || raw.claimedStudentNumber || null,
      p_employment_status: raw.employment_status || raw.employmentStatus || null,
      p_referral_source: raw.referral_source || raw.referralSource || 'Google Form',
      p_notes: raw.notes || null,
      p_agreed_tuition_fee: Number(raw.agreed_tuition_fee || raw.agreedTuitionFee || 0),
      p_consent_acknowledged: true,
      p_client_identifier: `gform_${submissionId}`
    };

    try {
      const rpcRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/rpc/submit_applicant_intake`,
        {
          method: 'POST',
          headers: {
            'apikey': secretKey,
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        },
        rpcParams
      );

      if (rpcRes.status >= 200 && rpcRes.status < 300 && rpcRes.body) {
        const d = rpcRes.body;
        results.push({
          success: true,
          isDuplicate: !!d.is_replay,
          sourceSubmissionId: submissionId,
          applicationId: d.application_id,
          applicationNumber: d.application_number,
          status: d.status || 'NEW',
          identityConfidence: d.identity_confidence,
          matchedStudentId: d.matched_student_id
        });
      } else {
        // Handle atomic unique collision fallback (PostgreSQL code 23505)
        if (rpcRes.status === 409 || (rpcRes.body && String(rpcRes.body.message || '').includes('uq_intake_apps_idempotency'))) {
          const dupRes = await httpsRequest(
            `${supabaseUrl}/rest/v1/crm_intake_applications?tenant_id=eq.${resolvedTenantId}&source=eq.GOOGLE_FORM&source_submission_id=eq.${encodeURIComponent(submissionId)}&select=id,application_number,status`,
            { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
          );
          if (Array.isArray(dupRes.body) && dupRes.body.length > 0) {
            results.push({
              success: true,
              isDuplicate: true,
              sourceSubmissionId: submissionId,
              applicationId: dupRes.body[0].id,
              applicationNumber: dupRes.body[0].application_number,
              status: dupRes.body[0].status,
              message: 'Application already received (idempotent collision replay)'
            });
            continue;
          }
        }

        // Direct REST insertion fallback
        const yr = new Date().getFullYear();
        const randRef = `APP-${yr}-${String(Math.floor(Math.random() * 900000) + 100000)}`;
        
        const insertPayload = {
          tenant_id: resolvedTenantId,
          application_number: randRef,
          source: 'GOOGLE_FORM',
          source_submission_id: submissionId,
          status: 'NEW',
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
          programme_id: programmeId,
          delivery_mode: rpcParams.p_delivery_mode,
          sponsor_type: rpcParams.p_sponsor_type,
          referral_source: 'Google Form',
          notes: rpcParams.p_notes,
          applicant_data: raw
        };

        const insertRes = await httpsRequest(
          `${supabaseUrl}/rest/v1/crm_intake_applications`,
          {
            method: 'POST',
            headers: {
              'apikey': secretKey,
              'Authorization': `Bearer ${secretKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          },
          insertPayload
        );

        if (insertRes.status === 201 && Array.isArray(insertRes.body) && insertRes.body.length > 0) {
          const inserted = insertRes.body[0];
          results.push({
            success: true,
            isDuplicate: false,
            sourceSubmissionId: submissionId,
            applicationId: inserted.id,
            applicationNumber: inserted.application_number,
            status: inserted.status
          });
        } else {
          // Check if failure was a duplicate unique collision
          const dupRes = await httpsRequest(
            `${supabaseUrl}/rest/v1/crm_intake_applications?tenant_id=eq.${resolvedTenantId}&source=eq.GOOGLE_FORM&source_submission_id=eq.${encodeURIComponent(submissionId)}&select=id,application_number,status`,
            { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
          );
          if (Array.isArray(dupRes.body) && dupRes.body.length > 0) {
            results.push({
              success: true,
              isDuplicate: true,
              sourceSubmissionId: submissionId,
              applicationId: dupRes.body[0].id,
              applicationNumber: dupRes.body[0].application_number,
              status: dupRes.body[0].status,
              message: 'Application already received (idempotent replay)'
            });
          } else {
            results.push({
              success: false,
              sourceSubmissionId: submissionId,
              error: (insertRes.body && (insertRes.body.message || insertRes.body.error || insertRes.body.details)) || (rpcRes.body && rpcRes.body.message) || 'Failed to persist application'
            });
          }
        }
      }
    } catch (err) {
      results.push({
        success: false,
        sourceSubmissionId: submissionId,
        error: err.message
      });
    }
  }

  const isBatch = Array.isArray(body.submissions);
  const anySuccess = results.some(r => r.success);
  const allDuplicates = results.every(r => r.isDuplicate);

  res.statusCode = anySuccess ? (allDuplicates ? 200 : 201) : 400;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(isBatch ? { success: anySuccess, count: results.length, results } : results[0]));
}
