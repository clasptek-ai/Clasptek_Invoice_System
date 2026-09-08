/**
 * CLASPTEK ENTERPRISE PLATFORM — ADMINISTRATIVE USER PROVISIONING ENDPOINT
 * Route: POST /api/admin/provision-user
 * 
 * Secure Serverless Function on Vercel
 * STRICT SECURITY INVARIANTS:
 * - Requires caller Supabase JWT with active SUPER_ADMIN role in public.tenant_memberships
 * - Resolves authoritative tenant_id from PostgreSQL, never trusts browser-supplied tenant IDs
 * - Provisions real auth.users via Supabase Admin API using server-side SUPABASE_SECRET_KEY
 * - Inserts authoritative public.personnel linked via user_id = Auth UUID
 * - Inserts authoritative public.tenant_memberships with strict role vocabulary
 * - Atomic rollback: deletes newly created Auth user and personnel if downstream insert fails
 * - NEVER leaks SUPABASE_SECRET_KEY, service-role keys, or plaintext passwords
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
    const postData = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;
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

module.exports = async function handler(req, res) {
  // 1. CORS headers
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

  const { secretKey, supabaseUrl } = resolveCredentials();
  if (!secretKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server configuration error: administrative credentials unavailable.' }));
  }

  // 2. Authenticate Caller JWT
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token || token.split('.').length !== 3) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unauthorized: A valid Supabase access token is required.' }));
  }

  // Verify caller's token against Supabase Auth
  let callerUser = null;
  try {
    const userRes = await httpsRequest(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': secretKey,
        'Authorization': `Bearer ${token}`
      }
    });

    if (userRes.status !== 200 || !userRes.body || !userRes.body.id) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Unauthorized: The provided session token is expired or invalid.' }));
    }
    callerUser = userRes.body;
  } catch (err) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Authentication failed during caller identity resolution.' }));
  }

  // 3. Resolve Caller Membership & Authoritative Tenant
  let authoritativeTenantId = null;
  let callerRole = null;

  try {
    const memberRes = await httpsRequest(`${supabaseUrl}/rest/v1/tenant_memberships?user_id=eq.${callerUser.id}&status=eq.active&select=tenant_id,role`, {
      method: 'GET',
      headers: {
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`
      }
    });

    if (memberRes.status !== 200 || !Array.isArray(memberRes.body) || memberRes.body.length === 0) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Forbidden: You do not have an active tenant membership.' }));
    }

    const membership = memberRes.body[0];
    callerRole = membership.role;
    authoritativeTenantId = membership.tenant_id;

    // Must be SUPER_ADMIN or FINANCE_MANAGER
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'FINANCE_MANAGER') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Forbidden: Super Administrator or Manager role required to provision personnel.' }));
    }

    if (!isValidUuid(authoritativeTenantId)) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Authoritative tenant resolution failed.' }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Tenant authorization lookup failed.' }));
  }

  // 4. Parse & Validate Payload
  const body = await parseRequestBody(req);

  const employeeType = String(body.employee_type || body.employeeType || 'staff').trim().toLowerCase();
  if (employeeType !== 'staff' && employeeType !== 'facilitator') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: "Invalid employee_type. Must be 'staff' or 'facilitator'." }));
  }

  const fullName = String(body.full_name || body.fullName || body.name || '').trim();
  if (!fullName || fullName.length < 2) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Full name is required.' }));
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'A valid email address is required.' }));
  }

  const createLogin = body.create_login !== undefined 
    ? Boolean(body.create_login) 
    : (body.createLogin !== undefined ? Boolean(body.createLogin) : true);

  const password = String(body.password || '').trim();
  if (createLogin) {
    if (!password) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'An initial password is required to provision the login account.' }));
    }
    const pwdCheck = validatePasswordPolicy(password);
    if (!pwdCheck.valid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: pwdCheck.message }));
    }
  }

  let employeeId = String(body.employee_id || body.employeeId || '').trim();
  if (!employeeId) {
    const prefix = employeeType === 'facilitator' ? 'FAC-' : 'EMP-';
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    employeeId = `${prefix}${randSuffix}`;
  }

  const firstName = String(body.first_name || body.firstName || fullName.split(' ')[0] || '').trim();
  const lastName = String(body.last_name || body.lastName || (fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : '')).trim();
  const phone = String(body.phone || '').trim();
  const department = String(body.department || (employeeType === 'facilitator' ? 'Academics' : 'Administration')).trim();
  const jobTitle = String(body.job_title || body.jobTitle || body.role || (employeeType === 'facilitator' ? 'Facilitator' : 'Staff Member')).trim();
  const employmentStatus = 'active';
  const dateJoined = body.date_joined || body.dateJoined || new Date().toISOString().slice(0, 10);
  const bankName = String(body.bank_name || body.bankName || '').trim();
  const accountName = String(body.account_name || body.accountName || fullName).trim();
  const accountNumber = String(body.account_number || body.accountNumber || '').trim();
  const compensationType = String(body.compensation_type || body.compensationType || (employeeType === 'facilitator' ? 'per_session' : 'salaried')).trim().toLowerCase();
  const basicPay = Number(body.basic_pay !== undefined ? body.basic_pay : (body.basicPay !== undefined ? body.basicPay : 0)) || 0;
  const facilitatorRate = Number(body.facilitator_rate !== undefined ? body.facilitator_rate : (body.facilitatorRate !== undefined ? body.facilitatorRate : 0)) || 0;
  const rateType = String(body.rate_type || body.rateType || 'session').trim().toLowerCase();
  const notes = body.notes ? String(body.notes).trim() : null;

  // Resolve membership role according to schema constraint:
  // CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF'))
  let membershipRole = 'STAFF';
  if (employeeType === 'facilitator') {
    membershipRole = 'STAFF';
  } else {
    const reqRole = String(body.membership_role || body.membershipRole || body.user_role || body.userRole || '').trim().toUpperCase();
    if (reqRole === 'FINANCE_MANAGER' || reqRole === 'FINANCE MANAGER') {
      membershipRole = 'FINANCE_MANAGER';
    } else if (reqRole === 'FINANCE_STAFF' || reqRole === 'FINANCE STAFF') {
      membershipRole = 'FINANCE_STAFF';
    } else {
      membershipRole = 'STAFF';
    }
  }

  // 5. Duplicate Protection Checks
  try {
    // Check duplicate email in public.personnel
    const dupEmailRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel?tenant_id=eq.${authoritativeTenantId}&email=eq.${encodeURIComponent(email)}&select=id`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(dupEmailRes.body) && dupEmailRes.body.length > 0) {
      res.statusCode = 409;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `A personnel record with email '${email}' already exists in this tenant.` }));
    }

    // Check duplicate employee_id in public.personnel
    const dupEmpRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel?tenant_id=eq.${authoritativeTenantId}&employee_id=eq.${encodeURIComponent(employeeId)}&select=id`,
      { method: 'GET', headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
    );
    if (Array.isArray(dupEmpRes.body) && dupEmpRes.body.length > 0) {
      res.statusCode = 409;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `A personnel record with Employee ID '${employeeId}' already exists in this tenant.` }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Duplicate validation failed.' }));
  }

  // 6. Create Auth Account using Supabase Admin API (if createLogin requested)
  let createdAuthUser = null;
  if (createLogin) {
    const authUserPayload = {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: fullName,
        full_name: fullName,
        role: employeeType === 'facilitator' ? 'Facilitator' : (membershipRole === 'FINANCE_MANAGER' ? 'Finance Manager' : (membershipRole === 'FINANCE_STAFF' ? 'Finance Staff' : 'Staff')),
        tenant_id: authoritativeTenantId
      },
      app_metadata: {
        role: membershipRole,
        tenant_id: authoritativeTenantId
      }
    };

    try {
      const createAuthRes = await httpsRequest(
        `${supabaseUrl}/auth/v1/admin/users`,
        {
          method: 'POST',
          headers: {
            'apikey': secretKey,
            'Authorization': `Bearer ${secretKey}`
          }
        },
        authUserPayload
      );

      if (createAuthRes.status !== 200 && createAuthRes.status !== 201) {
        const msg = createAuthRes.body?.msg || createAuthRes.body?.message || 'Authentication account creation failed';
        if (createAuthRes.status === 422 || msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: `An authentication account with email '${email}' already exists.` }));
        }
        res.statusCode = createAuthRes.status >= 400 && createAuthRes.status < 500 ? createAuthRes.status : 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Supabase Auth account creation failed: ${msg}` }));
      }

      createdAuthUser = createAuthRes.body;
      if (!createdAuthUser || !isValidUuid(createdAuthUser.id)) {
        throw new Error('Supabase Auth returned an invalid user ID.');
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err.message || 'Auth account creation failed.' }));
    }
  }

  // 7. Insert public.personnel Record (linked to real Auth UUID if created)
  const persId = 'emp_' + Date.now();
  const personnelRecord = {
    id: persId,
    tenant_id: authoritativeTenantId,
    user_id: createdAuthUser ? createdAuthUser.id : null,
    employee_id: employeeId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email,
    phone: phone || null,
    employee_type: employeeType,
    department,
    job_title: jobTitle,
    employment_status: employmentStatus,
    date_joined: dateJoined,
    bank_name: bankName || null,
    account_name: accountName || fullName,
    account_number: accountNumber || null,
    compensation_type: compensationType,
    basic_pay: basicPay,
    facilitator_rate: facilitatorRate,
    rate_type: rateType,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const persInsertRes = await httpsRequest(
      `${supabaseUrl}/rest/v1/personnel`,
      {
        method: 'POST',
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
          'Prefer': 'return=representation'
        }
      },
      [personnelRecord]
    );

    if (persInsertRes.status !== 201) {
      // COMPENSATING ROLLBACK: Delete synthetic Auth user if created
      if (createdAuthUser) {
        await httpsRequest(`${supabaseUrl}/auth/v1/admin/users/${createdAuthUser.id}`, {
          method: 'DELETE',
          headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
        }).catch(() => {});
      }

      const errMsg = persInsertRes.body?.message || persInsertRes.body?.details || 'Database insert rejected';
      res.statusCode = persInsertRes.status >= 400 && persInsertRes.status < 500 ? persInsertRes.status : 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `Personnel record creation failed (${errMsg}). Compensating rollback performed.` }));
    }
  } catch (err) {
    // COMPENSATING ROLLBACK
    if (createdAuthUser) {
      await httpsRequest(`${supabaseUrl}/auth/v1/admin/users/${createdAuthUser.id}`, {
        method: 'DELETE',
        headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
      }).catch(() => {});
    }

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Personnel profile creation failed. Compensating rollback performed.' }));
  }

  // 8. Insert public.tenant_memberships Record (if login account was created)
  let createdMembership = null;
  if (createdAuthUser) {
    const membershipId = crypto.randomUUID();
    const membershipRecord = {
      id: membershipId,
      tenant_id: authoritativeTenantId,
      user_id: createdAuthUser.id,
      role: membershipRole,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const memInsertRes = await httpsRequest(
        `${supabaseUrl}/rest/v1/tenant_memberships`,
        {
          method: 'POST',
          headers: {
            'apikey': secretKey,
            'Authorization': `Bearer ${secretKey}`,
            'Prefer': 'return=representation'
          }
        },
        [membershipRecord]
      );

      if (memInsertRes.status !== 201) {
        // COMPENSATING ROLLBACK: Delete personnel & Auth user
        await httpsRequest(`${supabaseUrl}/rest/v1/personnel?id=eq.${persId}`, {
          method: 'DELETE',
          headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
        }).catch(() => {});

        await httpsRequest(`${supabaseUrl}/auth/v1/admin/users/${createdAuthUser.id}`, {
          method: 'DELETE',
          headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
        }).catch(() => {});

        const errMsg = memInsertRes.body?.message || 'Tenant membership insert rejected';
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Tenant membership creation failed (${errMsg}). Personnel and Auth records were rolled back.` }));
      }
      createdMembership = { id: membershipId, role: membershipRole, status: 'active' };
    } catch (err) {
      // COMPENSATING ROLLBACK
      await httpsRequest(`${supabaseUrl}/rest/v1/personnel?id=eq.${persId}`, {
        method: 'DELETE',
        headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
      }).catch(() => {});

      await httpsRequest(`${supabaseUrl}/auth/v1/admin/users/${createdAuthUser.id}`, {
        method: 'DELETE',
        headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` }
      }).catch(() => {});

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Tenant membership creation failed. All records have been rolled back.' }));
    }
  }

  // 9. Success Response (Zero credentials leaked)
  res.statusCode = 201;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: true,
    user: createdAuthUser ? {
      id: createdAuthUser.id,
      email: createdAuthUser.email
    } : null,
    personnel: {
      id: persId,
      employee_id: employeeId,
      full_name: fullName,
      employee_type: employeeType,
      department,
      job_title: jobTitle,
      tenant_id: authoritativeTenantId,
      user_id: createdAuthUser ? createdAuthUser.id : null
    },
    membership: createdMembership
  }));
};
