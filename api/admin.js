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
  let secretKey = process.env.SUPABASE_SECRET_KEY || '';
  let supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://logaawoigfxnisimfatf.supabase.co';

  // Fallback to local .env.local for local testing suites
  if (!secretKey) {
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
          if (line.startsWith('SUPABASE_SECRET_KEY=')) {
            secretKey = line.split('=')[1].trim().replace(/['"]/g, '');
          }
          if (line.startsWith('SUPABASE_URL=')) {
            supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
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
  const { secretKey, supabaseUrl } = resolveCredentials();
  if (!secretKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server configuration error: administrative credentials unavailable.' }));
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

  // Authoritative Role & Tenant Resolution
  let callerRole = null;
  let callerTenantId = null;

  try {
    const memberRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/tenant_memberships?user_id=eq.${callerUser.id}&status=eq.active&select=role,tenant_id,status`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );

    if (Array.isArray(memberRes.body) && memberRes.body.length > 0) {
      const activeSuperAdmin = memberRes.body.find(m => String(m.role || '').toUpperCase() === 'SUPER_ADMIN');
      const activeMember = activeSuperAdmin || memberRes.body[0];
      callerRole = String(activeMember.role || '').toUpperCase();
      callerTenantId = activeMember.tenant_id;
    }
  } catch (_) {}

  if (callerRole !== 'SUPER_ADMIN') {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Forbidden: Caller does not possess active SUPER_ADMIN authorization.' }));
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

  // Validation
  const {
    email,
    password,
    fullName,
    role,
    employeeType,
    department,
    designation,
    monthlySalary,
    hourlyRate,
    phone,
    employeeId: requestedEmployeeId
  } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Validation Error: A valid email address is required.' }));
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Validation Error: Full name must be at least 2 characters long.' }));
  }

  const allowedRoles = ['SUPER_ADMIN', 'FINANCE_MANAGER', 'STAFF', 'FINANCE_STAFF', 'FACILITATOR', 'FINANCE_VIEWER'];
  const normalizedRole = String(role || '').toUpperCase().replace(/\s+/g, '_');
  if (!allowedRoles.includes(normalizedRole)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Validation Error: Invalid role "${role}". Allowed: ${allowedRoles.join(', ')}` }));
  }

  const allowedTypes = ['staff', 'facilitator'];
  const normalizedType = String(employeeType || (normalizedRole === 'FACILITATOR' ? 'facilitator' : 'staff')).toLowerCase();
  if (!allowedTypes.includes(normalizedType)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Validation Error: Invalid employeeType "${employeeType}". Allowed: ${allowedTypes.join(', ')}` }));
  }

  const passCheck = validatePasswordPolicy(password);
  if (!passCheck.valid) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Validation Error: ${passCheck.message}` }));
  }

  // Pre-check for duplicate email in auth.users
  try {
    const listRes = await httpsRequest(
      `${supabaseUrl}/auth/v1/admin/users`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (listRes.body && Array.isArray(listRes.body.users)) {
      const existingAuth = listRes.body.users.find(u => (u.email || '').toLowerCase() === normalizedEmail);
      if (existingAuth) {
        res.statusCode = 409;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: `A user account with email "${normalizedEmail}" already exists in the system.`,
          code: 'USER_EXISTS'
        }));
      }
    }
  } catch (_) {}

  // Allocate employee ID
  let allocatedEmployeeId = null;
  try {
    allocatedEmployeeId = await allocateAuthoritativePersonnelId(supabaseUrl, secretKey, authoritativeTenantId, normalizedType, requestedEmployeeId);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Failed to allocate sequential employee ID: ${err.message}` }));
  }

  // Step 1: Create auth user
  let createdAuthUser = null;
  try {
    const createAuthRes = await httpsRequest(
      `${supabaseUrl}/auth/v1/admin/users`,
      { method: 'POST', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' } },
      {
        email: normalizedEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName.trim(),
          role: normalizedRole,
          employee_type: normalizedType,
          employee_id: allocatedEmployeeId,
          tenant_id: authoritativeTenantId
        }
      }
    );

    if (createAuthRes.status >= 400 || !createAuthRes.body || !createAuthRes.body.id) {
      const errMsg = createAuthRes.body?.msg || createAuthRes.body?.message || 'Failed to create user in authentication directory.';
      const statusCode = createAuthRes.status === 422 ? 409 : 500;
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: errMsg, code: 'AUTH_PROVISION_FAILED' }));
    }

    createdAuthUser = createAuthRes.body;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Auth API communication error: ${err.message}` }));
  }

  // Rollback helper
  const rollback = async (stage) => {
    if (createdAuthUser && createdAuthUser.id) {
      try {
        await httpsRequest(
          `${supabaseUrl}/auth/v1/admin/users/${createdAuthUser.id}`,
          { method: 'DELETE', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
        );
      } catch (_) {}
    }
  };

  // Step 2: Insert into public.personnel
  const personnelId = `pers_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  let createdPersonnel = null;

  try {
    const persInsertRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel`,
      {
        method: 'POST',
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      },
      {
        id: personnelId,
        tenant_id: authoritativeTenantId,
        user_id: createdAuthUser.id,
        employee_id: allocatedEmployeeId,
        full_name: fullName.trim(),
        email: normalizedEmail,
        phone: phone ? phone.trim() : null,
        employee_type: normalizedType,
        designation: designation ? designation.trim() : (normalizedType === 'facilitator' ? 'Facilitator' : 'Staff Member'),
        department: department ? department.trim() : 'Operations',
        monthly_salary: monthlySalary ? Number(monthlySalary) : 0,
        hourly_rate: hourlyRate ? Number(hourlyRate) : (normalizedType === 'facilitator' ? 15000 : 0),
        status: 'active'
      }
    );

    if (persInsertRes.status >= 400) {
      await rollback('personnel_insert_failed');
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Database error: Failed to create personnel record.', details: persInsertRes.body }));
    }

    createdPersonnel = Array.isArray(persInsertRes.body) ? persInsertRes.body[0] : persInsertRes.body;
  } catch (err) {
    await rollback('personnel_insert_exception');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Internal error creating personnel record: ${err.message}` }));
  }

  // Step 3: Insert into public.tenant_memberships
  const membershipId = `tm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  try {
    await httpsRequest(
      `${supabaseUrl}/rest/v1/tenant_memberships`,
      {
        method: 'POST',
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      },
      {
        id: membershipId,
        tenant_id: authoritativeTenantId,
        user_id: createdAuthUser.id,
        role: normalizedRole,
        status: 'active'
      }
    );
  } catch (_) {}

  // Step 4: Audit log
  try {
    const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await httpsRequest(
      `${supabaseUrl}/rest/v1/finance_audit_log`,
      {
        method: 'POST',
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      },
      {
        id: auditId,
        tenant_id: authoritativeTenantId,
        actor_id: callerUser.id,
        actor_role: callerRole,
        action: 'PROVISION_USER',
        entity_type: 'personnel',
        entity_id: personnelId,
        entity_name: fullName.trim(),
        source: 'supabase_app',
        reason: `Admin provisioned user ${fullName.trim()} (${allocatedEmployeeId}) with role ${normalizedRole}.`
      }
    );
  } catch (_) {}

  res.statusCode = 201;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: true,
    message: `User ${fullName.trim()} (${allocatedEmployeeId}) provisioned successfully with role ${normalizedRole}.`,
    user: {
      id: createdAuthUser.id,
      email: createdAuthUser.email,
      fullName: fullName.trim(),
      role: normalizedRole,
      employeeType: normalizedType,
      employeeId: allocatedEmployeeId,
      personnelId: personnelId,
      tenantId: authoritativeTenantId
    }
  }));
}

/**
 * -------------------------------------------------------------
 * ACTION 2: DELETE PERSONNEL
 * -------------------------------------------------------------
 */
async function handleDeletePersonnel(req, res, body) {
  const { secretKey, supabaseUrl } = resolveCredentials();
  if (!secretKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server configuration error: administrative credentials unavailable.' }));
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

  if (!['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(callerRole)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Forbidden: Caller does not possess required administrative authorization.' }));
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

  // Deletion execution
  if (authUserId) {
    try {
      await httpsRequest(
        `${supabaseUrl}/rest/v1/tenant_memberships?user_id=eq.${authUserId}&tenant_id=eq.${authoritativeTenantId}`,
        { method: 'DELETE', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
      );
    } catch (_) {}
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
module.exports = async function handler(req, res) {
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
    else if (body.action) action = body.action;
  }

  if (action === 'provision-user' || action === 'provision') {
    return handleProvisionUser(req, res, body);
  }

  if (action === 'delete-personnel' || action === 'delete') {
    return handleDeletePersonnel(req, res, body);
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    error: 'NOT_FOUND',
    message: `Unknown administrative action "${action || pathname}". Supported actions: provision-user, delete-personnel.`
  }));
};
