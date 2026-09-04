const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_TENANT_UUID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
const SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';

// Load publishable key from .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let pubKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_PUBLISHABLE_KEY=')) {
    pubKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('=== VERIFYING ACTUAL APPLICATION READ & WRITE PATH ===\n');

  // 1. Authenticate with Super Admin
  const authRes = await httpPost(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    'apikey': pubKey,
    'Content-Type': 'application/json'
  }, {
    email: 'admin@clasptek.org',
    password: 'AdminSecure2026!'
  });

  if (authRes.status !== 200 || !authRes.data?.access_token) {
    console.error('Super Admin auth failed');
    process.exit(1);
  }

  const token = authRes.data.access_token;
  const user = authRes.data.user;
  console.log('1. Authenticated User:', user.email);
  console.log('   App Metadata Tenant ID:', user.app_metadata?.tenant_id);
  console.log('   User ID:', user.id);

  // 2. Setup sandbox with the real HTML application code
  const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'clasptek_invoice_system.html'), 'utf8');
  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error('Could not find <script> tag');

  const localStorageStore = {
    'clasptek:supabase_config': JSON.stringify({
      endpoint: `${SUPABASE_URL}/rest/v1/`,
      anonKey: pubKey,
      publishableKey: pubKey
    }),
    'clasptek:supabase_session': JSON.stringify(authRes.data),
    'clasptek:auth_session': JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        role: 'SUPER_ADMIN',
        tenant_id: TARGET_TENANT_UUID
      },
      token: token,
      supabaseJwt: token,
      supabaseSession: authRes.data,
      supabaseUser: user
    })
  };

  global.localStorage = {
    getItem: (k) => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: (k) => { delete localStorageStore[k]; },
    clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
  };

  global.window = {
    location: { href: 'http://localhost:8080/clasptek_invoice_system.html', search: '' },
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    __CLASPTEK_ENV__: {
      SUPABASE_URL,
      SUPABASE_ANON_KEY: pubKey,
      SUPABASE_PUBLISHABLE_KEY: pubKey
    }
  };

  global.document = {
    getElementById: () => ({ addEventListener: () => {}, style: {}, innerHTML: '', value: '' }),
    querySelectorAll: () => [],
    querySelector: () => ({ addEventListener: () => {}, style: {}, innerHTML: '', value: '' }),
    createElement: () => ({ addEventListener: () => {}, style: {}, innerHTML: '' }),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { classList: { add: () => {}, remove: () => {} } }
  };

  global.alert = (msg) => console.log('ALERT:', msg);
  global.confirm = () => true;

  // Real fetch implementation hitting Supabase
  global.fetch = async (url, opts = {}) => {
    const urlStr = String(url);
    const headers = {
      'apikey': pubKey,
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    };
    if (opts.method === 'POST') {
      return new Promise((resolve) => {
        const req = https.request(urlStr, { method: 'POST', headers }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: { get: (h) => res.headers[h.toLowerCase()] },
              json: async () => { try { return JSON.parse(body); } catch(_) { return {}; } },
              text: async () => body
            });
          });
        });
        if (opts.body) req.write(opts.body);
        req.end();
      });
    } else {
      return new Promise((resolve) => {
        const req = https.request(urlStr, { method: opts.method || 'GET', headers }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: { get: (h) => res.headers[h.toLowerCase()] },
              json: async () => { try { return JSON.parse(body); } catch(_) { return {}; } },
              text: async () => body
            });
          });
        });
        req.end();
      });
    }
  };

  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', scriptMatch[1]);
  runner(moduleObj, moduleObj.exports);
  const app = moduleObj.exports;

  // 3. Test resolveAuthoritativeTenantId
  console.log('\n2. Authoritative Tenant Resolution:');
  const resolvedTenant = app.resolveAuthoritativeTenantId();
  console.log('   Resolved Tenant ID:', resolvedTenant);
  console.log('   Matches Certified Target UUID:', resolvedTenant === TARGET_TENANT_UUID);

  // 4. Test Application loadAll() - The Actual Read Path
  console.log('\n3. Executing Application loadAll()...');
  await app.loadAll();

  console.log('   state.databaseAuthorityState:', app.state.databaseAuthorityState);
  console.log('   state.diagnosticState:', app.state.diagnosticState);
  console.log('   state.connectionError:', app.state.connectionError);
  console.log('   state.personnel count:', app.state.personnel ? app.state.personnel.length : 0);
  console.log('   state.financeSettings:', app.state.financeSettings ? app.state.financeSettings.companyName : 'none');
  console.log('   state.auditLog count:', app.state.auditLog ? app.state.auditLog.length : 0);

  // 5. Inspect personnel records
  console.log('\n4. Inspecting Loaded Personnel Records:');
  app.state.personnel.forEach(p => {
    console.log(`   - ${p.id} | ${p.employeeId} | ${p.name} | ${p.type} | ${p.role} | Bank: ${p.bankName} | Acc: ${p.accountNumber}`);
  });

  // 6. Test Personnel Save Path (EMP-0002 / pers_002)
  console.log('\n5. Testing Personnel Save Operation for pers_002:');
  const pers2 = app.state.personnel.find(p => p.id === 'pers_002' || p.employeeId === 'EMP-0002');
  if (!pers2) {
    console.error('pers_002 not found in state.personnel');
  } else {
    console.log('   Original pers_002 record:', {
      id: pers2.id,
      employeeId: pers2.employeeId,
      name: pers2.name,
      bankName: pers2.bankName,
      accountName: pers2.accountName,
      accountNumber: pers2.accountNumber,
      basicPay: pers2.basicPay
    });

    try {
      await app.dbRepo.saveRecord(app.STORE_KEY_PERSONNEL, pers2);
      console.log('   ✔ dbRepo.saveRecord SUCCEEDED with HTTP 200/201 (No PGRST204!)');
    } catch (saveErr) {
      console.error('   ✖ dbRepo.saveRecord FAILED:', saveErr.message);
    }
  }

  // 7. Verify final PostgreSQL row counts
  console.log('\n6. Verifying Final Cloud Row Counts:');
  const countHeaders = {
    'apikey': pubKey,
    'Authorization': `Bearer ${token}`,
    'Prefer': 'count=exact'
  };

  const fsetRes = await httpGet(`${SUPABASE_URL}/rest/v1/finance_settings?select=*`, countHeaders);
  const persRes = await httpGet(`${SUPABASE_URL}/rest/v1/personnel?select=*`, countHeaders);
  const auditRes = await httpGet(`${SUPABASE_URL}/rest/v1/finance_audit_log?select=*`, countHeaders);

  const fsetCount = fsetRes.headers['content-range'] ? fsetRes.headers['content-range'].split('/')[1] : fsetRes.data?.length;
  const persCount = persRes.headers['content-range'] ? persRes.headers['content-range'].split('/')[1] : persRes.data?.length;
  const auditCount = auditRes.headers['content-range'] ? auditRes.headers['content-range'].split('/')[1] : auditRes.data?.length;

  console.log(`   finance_settings: ${fsetCount} (expected 1)`);
  console.log(`   personnel:        ${persCount} (expected 5)`);
  console.log(`   finance_audit_log:${auditCount} (expected 31)`);
  const total = Number(fsetCount) + Number(persCount) + Number(auditCount);
  console.log(`   TOTAL RECORDS:    ${total} (expected 37)`);

  if (total === 37 && Number(fsetCount) === 1 && Number(persCount) === 5 && Number(auditCount) === 31) {
    console.log('\n✔ DATABASE DATASET FULLY VERIFIED (37/37 records intact)');
  } else {
    console.error('\n✖ COUNT MISMATCH DETECTED');
  }
})();
