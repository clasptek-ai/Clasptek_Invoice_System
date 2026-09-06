const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING COMPLETE ELIMINATION OF TENANT_MEMBERSHIPS 400 ERROR ===\n');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'clasptek_invoice_system.html'), 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script> tag');

function createFreshBrowserEnv(fetchHandler) {
  const localStorageStore = {
    'clasptek:supabase_config': JSON.stringify({
      endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
      anonKey: 'test-anon-key',
      publishableKey: 'test-pub-key'
    })
  };

  global.localStorage = {
    getItem: (k) => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: (k) => { delete localStorageStore[k]; },
    clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; },
    get length() { return Object.keys(localStorageStore).length; },
    key: (i) => Object.keys(localStorageStore)[i] || null
  };

  global.window = {
    location: { href: 'http://localhost:8080/clasptek_invoice_system.html', search: '' },
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key-12345',
      SUPABASE_PUBLISHABLE_KEY: 'test-anon-key-12345'
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
  global.fetch = fetchHandler;

  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', scriptMatch[1]);
  runner(moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

(async () => {
  const networkRequests = [];

  // Scenario 1: Fresh authenticated browser session where local state.auth.user has id 'usr_sa_1'
  // and Supabase session has JWT and UUID.
  const app1 = createFreshBrowserEnv(async (url, opts = {}) => {
    const urlStr = String(url);
    networkRequests.push({ url: urlStr, method: opts.method || 'GET' });

    if (urlStr.includes('rpc/get_auth_tenant_id')) {
      return {
        ok: true,
        status: 200,
        json: async () => 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6'
      };
    }

    if (urlStr.includes('tenant_memberships')) {
      if (urlStr.includes('usr_sa_1')) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ code: '22P02', message: 'invalid input syntax for type uuid: "usr_sa_1"' })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6' }]
      };
    }

    return { ok: true, status: 200, json: async () => [] };
  });

  // Setup local authenticated user as usr_sa_1 (the exact condition reported in production)
  app1.state.auth = {
    user: {
      id: 'usr_sa_1',
      email: 'admin@clasptek.org',
      role: 'Super Admin',
      tenant_id: 'clasptek_main' // Legacy placeholder
    },
    supabaseJwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake',
    supabaseUser: {
      id: '3cd253eb-bb8b-4f01-b7d4-f07c18abc484',
      email: 'admin@clasptek.org'
    }
  };

  console.log('Test 1: Executing lookupAuthoritativeTenantFromDatabase() with local user usr_sa_1...');
  const tenant1 = await app1.lookupAuthoritativeTenantFromDatabase();
  assert.strictEqual(tenant1, 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'Authoritative tenant must be resolved');
  console.log('  ✔ Resolved authoritative tenant:', tenant1);

  // Verify network requests
  const hasBadUserId = networkRequests.some(r => r.url.includes('usr_sa_1'));
  assert.strictEqual(hasBadUserId, false, 'Network MUST NOT contain any request with user_id=eq.usr_sa_1');
  console.log('  ✔ Verified: Zero network requests generated with user_id=eq.usr_sa_1');

  const rpcRequests = networkRequests.filter(r => r.url.includes('rpc/get_auth_tenant_id'));
  assert(rpcRequests.length > 0, 'RPC get_auth_tenant_id must be invoked');
  console.log('  ✔ Verified: RPC get_auth_tenant_id used as primary authoritative source');

  const restMembershipRequests = networkRequests.filter(r => r.url.includes('tenant_memberships'));
  assert.strictEqual(restMembershipRequests.length, 0, 'tenant_memberships REST endpoint must NOT be called when RPC succeeds');
  console.log('  ✔ Verified: No redundant REST tenant_memberships query performed');

  // Scenario 2: Fallback scenario where RPC fails, but only application ID 'usr_sa_1' exists
  console.log('\nTest 2: Verifying fallback when RPC fails and ONLY application ID usr_sa_1 is available...');
  networkRequests.length = 0;

  const app2 = createFreshBrowserEnv(async (url, opts = {}) => {
    const urlStr = String(url);
    networkRequests.push({ url: urlStr, method: opts.method || 'GET' });

    if (urlStr.includes('rpc/get_auth_tenant_id')) {
      return { ok: false, status: 500, json: async () => ({}) };
    }

    if (urlStr.includes('usr_sa_1')) {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ code: '22P02', message: 'invalid input syntax for type uuid: "usr_sa_1"' })
      };
    }

    if (urlStr.includes('tenant_memberships')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6' }]
      };
    }

    return { ok: true, status: 200, json: async () => [] };
  });

  app2.state.auth = {
    user: {
      id: 'usr_sa_1',
      email: 'admin@clasptek.org',
      tenant_id: 'clasptek_main'
    }
  };

  const tenant2 = await app2.lookupAuthoritativeTenantFromDatabase();
  assert.strictEqual(tenant2, 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6');

  const hasBadUserId2 = networkRequests.some(r => r.url.includes('usr_sa_1'));
  assert.strictEqual(hasBadUserId2, false, 'Network MUST NOT contain user_id=eq.usr_sa_1 even in fallback');
  console.log('  ✔ Verified: Defensive validation prevented user_id=eq.usr_sa_1 in fallback mode');

  // Scenario 3: builder.eq query guard directly on client
  console.log('\nTest 3: Directly testing query builder guard on tenant_memberships.user_id...');
  networkRequests.length = 0;
  await app2.supabaseClient.from('tenant_memberships').select('tenant_id').eq('user_id', 'usr_sa_1');

  assert.strictEqual(networkRequests.length, 1);
  assert(!networkRequests[0].url.includes('usr_sa_1'), 'Query guard must strip non-UUID user_id filter');
  assert(!networkRequests[0].url.includes('user_id=eq'), 'Query guard must strip user_id=eq filter');
  console.log('  ✔ Verified: Query guard successfully prevented non-UUID query on tenant_memberships.user_id');

  console.log('\n========================================================================');
  console.log('✔ ALL TENANT_MEMBERSHIPS 400 DEFENSIVE VERIFICATIONS PASSED 100%');
  console.log('========================================================================\n');
})();
