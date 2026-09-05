const fs = require('fs');
const path = require('path');
const https = require('https');
const assert = require('assert');

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
    const parsed = new URL(url);
    const req = https.request(parsed, { method: 'POST', headers }, res => {
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

(async () => {
  console.log('=== EXACT PRODUCTION REPRODUCTION TEST (EMP-0002 / pers_002) ===\n');

  // STEP 1: Login
  console.log('Step 1: Authenticating as admin@clasptek.org with Supabase Auth...');
  const authRes = await httpPost(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    'apikey': pubKey,
    'Content-Type': 'application/json'
  }, {
    email: 'admin@clasptek.org',
    password: 'AdminSecure2026!'
  });

  assert.strictEqual(authRes.status, 200, 'Auth status must be 200');
  const token = authRes.data.access_token;
  const user = authRes.data.user;
  console.log('  ✔ Step 1 Success: Logged in, user ID:', user.id);

  // Setup app environment
  const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'clasptek_invoice_system.html'), 'utf8');
  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error('Could not find <script> tag');

  function initApp() {
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

    global.alert = () => {};
    global.confirm = () => true;

    global.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      const parsed = new URL(urlStr);
      const headers = {
        'apikey': pubKey,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      };
      if (opts.body) {
        headers['Content-Length'] = Buffer.byteLength(opts.body);
      }
      return new Promise((resolve, reject) => {
        const req = https.request(parsed, { method: opts.method || 'GET', headers }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            console.log(`  [HTTP] ${opts.method || 'GET'} ${parsed.pathname}${parsed.search} -> ${res.statusCode}`);
            if (res.statusCode >= 400) {
              console.error(`  [HTTP ERROR ${res.statusCode}] on ${parsed.pathname}:`, body);
            }
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: { get: (h) => res.headers[h.toLowerCase()] },
              json: async () => { try { return JSON.parse(body); } catch(_) { return {}; } },
              text: async () => body
            });
          });
        });
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
      });
    };

    const moduleObj = { exports: {} };
    const runner = new Function('module', 'exports', scriptMatch[1]);
    runner(moduleObj, moduleObj.exports);
    return moduleObj.exports;
  }

  let app = initApp();

  // STEP 2: Open Personnel (via loadAll)
  console.log('\nStep 2: Loading Personnel Directory via loadAll()...');
  await app.loadAll();
  assert(Array.isArray(app.state.personnel), 'Personnel must be loaded');
  assert(app.state.personnel.length > 0, 'Personnel records must not be empty');
  console.log(`  ✔ Step 2 Success: Loaded ${app.state.personnel.length} personnel records`);

  // STEP 3: Edit existing Personnel record EMP-0002 / pers_002
  console.log('\nStep 3: Locating EMP-0002 / pers_002...');
  const pers2 = app.state.personnel.find(p => p.id === 'pers_002' || p.employeeId === 'EMP-02' || p.employeeId === 'EMP-0002');
  assert(pers2, 'Record pers_002 must exist');
  console.log('  ✔ Step 3 Success: Found pers_002, original department/role:', pers2.role);

  // STEP 4: Change a harmless field
  const timestamp = Date.now();
  const testAccountName = `Facilitator Lead Verif ${timestamp}`;
  pers2.accountName = testAccountName;
  console.log(`\nStep 4: Modified harmless field accountName to "${testAccountName}"`);

  // STEP 5 & 6 & 7: Click Save Changes, verify no tenant UUID error occurs, verify PostgreSQL save succeeds
  console.log('\nSteps 5, 6, 7: Executing dbRepo.saveRecord(STORE_KEY_PERSONNEL, pers2)...');
  let saveError = null;
  try {
    await app.dbRepo.saveRecord(app.STORE_KEY_PERSONNEL, pers2);
  } catch (err) {
    saveError = err;
  }

  assert.strictEqual(saveError, null, `Save must succeed without errors. Error: ${saveError?.message}`);
  console.log('  ✔ Steps 5, 6, 7 Success: Save completed without tenant UUID error. PostgreSQL save succeeded!');

  // STEP 8: Reload application
  console.log('\nStep 8: Simulating application reload...');
  app = initApp();
  await app.loadAll();
  console.log('  ✔ Step 8 Success: Application reloaded and hydrated from PostgreSQL');

  // STEP 9: Verify changed value persists
  console.log('\nStep 9: Verifying changed value persists in PostgreSQL read-back...');
  const reloadedPers2 = app.state.personnel.find(p => p.id === 'pers_002' || p.employeeId === 'EMP-02' || p.employeeId === 'EMP-0002');
  assert(reloadedPers2, 'pers_002 must exist after reload');
  assert.strictEqual(reloadedPers2.accountName, testAccountName, `Persisted accountName must match "${testAccountName}", got "${reloadedPers2.accountName}"`);
  console.log(`  ✔ Step 9 Success: Changed value persisted! accountName = "${reloadedPers2.accountName}"`);

  // STEP 10 & 11: Reopen record and verify correct tenant remains attached
  console.log('\nSteps 10 & 11: Reopening record and verifying attached tenant UUID...');
  const tenantOnRecord = reloadedPers2.tenant_id || reloadedPers2.tenantId;
  assert.strictEqual(tenantOnRecord, TARGET_TENANT_UUID, `Tenant on record must match ${TARGET_TENANT_UUID}, got ${tenantOnRecord}`);
  console.log(`  ✔ Steps 10 & 11 Success: Tenant attached to pers_002 is ${tenantOnRecord} (Verified Authoritative Tenant UUID)`);

  // Revert harmless field back to clean state
  console.log('\nCleanup: Reverting pers_002 accountName back to "Facilitator Lead"...');
  reloadedPers2.accountName = 'Facilitator Lead';
  await app.dbRepo.saveRecord(app.STORE_KEY_PERSONNEL, reloadedPers2);
  console.log('  ✔ Cleanup complete. Baseline preserved.');

  console.log('\n=============================================================');
  console.log('✔ EXACT PRODUCTION REPRODUCTION TEST: 100% PASSED & CERTIFIED');
  console.log('=============================================================\n');
})();
