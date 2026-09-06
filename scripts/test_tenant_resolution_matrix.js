const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TARGET_TENANT_UUID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

// Read clasptek_invoice_system.html
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'clasptek_invoice_system.html'), 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script> tag');

function createFreshEnv() {
  const localStorageStore = {};
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
      SUPABASE_ANON_KEY: 'test_anon_key_long_enough',
      SUPABASE_PUBLISHABLE_KEY: 'test_anon_key_long_enough'
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

  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', scriptMatch[1]);
  runner(moduleObj, moduleObj.exports);
  const app = moduleObj.exports;
  app.state.supabase = {
    endpoint: 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/',
    anonKey: 'test_anon_key_long_enough'
  };
  return { app, storage: localStorageStore };
}

(async () => {
  console.log('=== RUNNING TENANT RESOLUTION MATRIX TESTS ===\n');

  let passed = 0;
  let failed = 0;

  async function it(desc, fn) {
    try {
      await fn();
      console.log(`  ✔ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ FAIL: ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // Test 1: In-memory Supabase user app_metadata
  await it('Resolves from state.auth.supabaseUser.app_metadata.tenant_id', () => {
    const { app } = createFreshEnv();
    app.state.auth = {
      supabaseUser: {
        id: 'usr_1',
        app_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
    assert.strictEqual(app.state.authoritativeTenantId, TARGET_TENANT_UUID);
  });

  // Test 2: In-memory Supabase user user_metadata
  await it('Resolves from state.auth.supabaseUser.user_metadata.tenant_id', () => {
    const { app } = createFreshEnv();
    app.state.auth = {
      supabaseUser: {
        id: 'usr_1',
        user_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
  });

  // Test 3: In-memory JWT payload decoding
  await it('Resolves from JWT payload in state.auth.supabaseJwt', () => {
    const { app } = createFreshEnv();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      sub: 'usr_1',
      app_metadata: { tenant_id: TARGET_TENANT_UUID }
    })).toString('base64');
    const jwt = `${header}.${payload}.signature`;

    app.state.auth = {
      supabaseJwt: jwt
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
  });

  // Test 4: Rejects 'clasptek_main' even if local user has it
  await it('Never returns "clasptek_main" and falls through when user.tenant_id is "clasptek_main"', () => {
    const { app } = createFreshEnv();
    app.state.auth = {
      user: {
        id: 'admin_local',
        email: 'admin@clasptek.org',
        tenant_id: 'clasptek_main' // legacy non-UUID
      },
      supabaseUser: {
        id: 'usr_1',
        app_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
    assert.notStrictEqual(resolved, 'clasptek_main');
  });

  // Test 5: Rejects invalid format or non-UUID strings
  await it('Rejects non-UUID string values', () => {
    const { app } = createFreshEnv();
    app.state.auth = {
      user: {
        tenant_id: 'invalid-string-not-uuid'
      }
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, null);
  });

  // Test 6: Rejects null / undefined
  await it('Returns null when no authoritative tenant UUID is present', () => {
    const { app } = createFreshEnv();
    app.state.auth = {
      user: {
        id: 'test_user',
        tenant_id: null
      }
    };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, null);
  });

  // Test 7: Resolves from localStorage clasptek:supabase_session
  await it('Resolves from localStorage "clasptek:supabase_session"', () => {
    const { app, storage } = createFreshEnv();
    storage['clasptek:supabase_session'] = JSON.stringify({
      access_token: 'fake_jwt',
      user: {
        id: 'usr_stored',
        app_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    });
    app.state.auth = { user: { id: 'admin_local', tenant_id: 'clasptek_main' } };

    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
  });

  // Test 8: Resolves from localStorage sb-*-auth-token
  await it('Resolves from localStorage "sb-*-auth-token" Supabase standard key', () => {
    const { app, storage } = createFreshEnv();
    storage['sb-logaawoigfxnisimfatf-auth-token'] = JSON.stringify({
      user: {
        id: 'usr_sb',
        app_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    });
    app.state.auth = { user: { id: 'admin_local', tenant_id: 'clasptek_main' } };

    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
  });

  // Test 9: dbRepo.saveRecord safety guard rejects null tenant
  await it('dbRepo.saveRecord safety guard throws when tenantId is null and database is authoritative', async () => {
    const { app } = createFreshEnv();
    app.state.databaseAuthorityState = 'AUTHORITATIVE';
    app.state.auth = { user: { id: 'usr_1', email: 'test@clasptek.org' } };
    let threw = false;
    try {
      await app.dbRepo.saveRecord('clasptek:personnel', { id: 'p_test', name: 'Test' });
    } catch (err) {
      threw = true;
      assert(err.message.includes("Cannot save to PostgreSQL: Invalid or non-authoritative tenant UUID ('null')"));
    }
    assert.strictEqual(threw, true);
  });

  // Test 10: dbRepo.saveRecord safety guard rejects 'clasptek_main'
  await it('dbRepo.saveRecord safety guard throws when tenantId is "clasptek_main"', async () => {
    const { app } = createFreshEnv();
    app.state.databaseAuthorityState = 'AUTHORITATIVE';
    app.state.auth = { user: { id: 'usr_1', email: 'test@clasptek.org', tenant_id: 'clasptek_main' } };
    let threw = false;
    try {
      await app.dbRepo.saveRecord('clasptek:personnel', { id: 'p_test', name: 'Test' });
    } catch (err) {
      threw = true;
      assert(err.message.includes("Cannot save to PostgreSQL: Invalid or non-authoritative tenant UUID ('null')"));
    }
    assert.strictEqual(threw, true);
  });

  // Test 11: Candidate record ALONE cannot grant authority when user has no authenticated tenant association
  await it('Candidate record alone cannot grant authority without authenticated tenant association', () => {
    const { app } = createFreshEnv();
    app.state.auth = { user: { id: 'admin_local', tenant_id: 'clasptek_main' } };
    const candidateRecord = { id: 'pers_001', name: 'Admin', tenant_id: TARGET_TENANT_UUID };
    const resolved = app.resolveAuthoritativeTenantId(candidateRecord);
    // Must return null because there is no authenticated or authoritative tenant association!
    assert.strictEqual(resolved, null);
  });

  // Test 12: Resolves from state.financeSettings.tenant_id (Hydrated RLS-scoped state)
  await it('Resolves from state.financeSettings.tenant_id (Hydrated RLS-scoped state)', () => {
    const { app } = createFreshEnv();
    app.state.auth = { user: { id: 'admin_local', tenant_id: 'clasptek_main' } };
    app.state.financeSettings = { id: 'fset_1', companyName: 'Clasptek', tenant_id: TARGET_TENANT_UUID };
    const resolved = app.resolveAuthoritativeTenantId();
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
    assert.strictEqual(app.state.authoritativeTenantId, TARGET_TENANT_UUID);
  });

  // Test 13: Candidate record with matching tenant UUID is accepted when authorized tenant exists
  await it('Candidate record with matching tenant UUID is accepted when authorized tenant is established', () => {
    const { app } = createFreshEnv();
    app.state.authoritativeTenantId = TARGET_TENANT_UUID;
    const candidateRecord = { id: 'pers_001', name: 'Admin', tenant_id: TARGET_TENANT_UUID };
    const resolved = app.resolveAuthoritativeTenantId(candidateRecord);
    assert.strictEqual(resolved, TARGET_TENANT_UUID);
  });

  // Test 14: Candidate record with conflicting tenant UUID throws cross-tenant write rejected error (fail-closed)
  await it('Candidate record with conflicting tenant UUID throws cross-tenant write rejected error', () => {
    const { app } = createFreshEnv();
    app.state.authoritativeTenantId = TARGET_TENANT_UUID;
    const candidateRecord = { id: 'pers_001', name: 'Admin', tenant_id: '11111111-2222-3333-4444-555555555555' };
    assert.throws(
      () => app.resolveAuthoritativeTenantId(candidateRecord),
      /Cross-tenant write rejected/
    );
  });

  // Test 15: Cross-Tenant Negative Test: User A in Tenant A cannot save a record belonging to Tenant B
  await it('CROSS-TENANT NEGATIVE TEST: dbRepo.saveRecord rejects write when candidate record has another tenant UUID', async () => {
    const { app } = createFreshEnv();
    app.state.databaseAuthorityState = 'AUTHORITATIVE';
    app.state.auth = {
      supabaseUser: {
        id: 'user_a',
        app_metadata: { tenant_id: TARGET_TENANT_UUID }
      }
    };
    app.state.authoritativeTenantId = TARGET_TENANT_UUID;

    const attackerRecord = {
      id: 'pers_malicious',
      name: 'Cross Tenant Attacker',
      tenant_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' // Tenant B
    };

    let threw = false;
    let errorMessage = '';
    try {
      await app.dbRepo.saveRecord('clasptek:personnel', attackerRecord);
    } catch (err) {
      threw = true;
      errorMessage = err.message;
    }
    assert.strictEqual(threw, true);
    assert(errorMessage.includes('Cross-tenant write rejected'), `Expected cross-tenant write rejected message, got: ${errorMessage}`);
  });

  // Test 16: Invalid UUID test matrix: null, undefined, '', 'null', 'clasptek_main', 'random-string', '123', malformed UUID
  await it('Invalid UUID test matrix: rejects all non-canonical and malformed representations', () => {
    const { app } = createFreshEnv();
    const invalidValues = [
      null,
      undefined,
      '',
      'null',
      'undefined',
      'clasptek_main',
      'random-string',
      '123',
      'f70d5788-b4ae-4425-a5d4-b7b7d0f01ffX', // invalid hex char
      'f70d5788-b4ae-4425-a5d4', // truncated
      '{f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6}' // curly braces
    ];

    for (const val of invalidValues) {
      assert.strictEqual(app.isValidUuid(val), false, `Expected isValidUuid("${val}") to be false`);

      app.state.auth = { user: { id: 'usr_inv', tenant_id: val } };
      app.state.authoritativeTenantId = null;
      const res = app.resolveAuthoritativeTenantId();
      assert.strictEqual(res, null, `Expected resolveAuthoritativeTenantId() with "${val}" to return null`);
    }
  });

  // Test 17: Candidate record with legacy 'clasptek_main' or null is stamped with authoritative tenant UUID
  await it('Legacy or unset tenant_id in candidate record is safely stamped with authoritative tenant UUID', async () => {
    const { app } = createFreshEnv();
    app.state.databaseAuthorityState = 'AUTHORITATIVE';
    app.state.authoritativeTenantId = TARGET_TENANT_UUID;

    let savedPayload = null;
    app.supabaseClient.from = (table) => ({
      upsert: async (payload) => {
        savedPayload = payload;
        return { data: [payload], error: null };
      }
    });

    const newRecord = { id: 'p_new', name: 'New Staff', tenant_id: 'clasptek_main' };
    await app.dbRepo.saveRecord('clasptek:personnel', newRecord);

    assert.strictEqual(savedPayload.tenant_id, TARGET_TENANT_UUID);
    assert.strictEqual(newRecord.tenant_id, TARGET_TENANT_UUID);
  });

  // Test 18: lookupAuthoritativeTenantFromDatabase() invokes RPC get_auth_tenant_id first
  await it('lookupAuthoritativeTenantFromDatabase() invokes RPC get_auth_tenant_id first without calling tenant_memberships REST', async () => {
    const { app } = createFreshEnv();
    app.state.auth = { user: { id: 'usr_sa_1', email: 'admin@clasptek.org', tenant_id: 'clasptek_main' } };
    app.state.authoritativeTenantId = null;

    let rpcCalled = false;
    let restMembershipsCalled = false;

    app.supabaseClient.rpc = async (fn) => {
      if (fn === 'get_auth_tenant_id') {
        rpcCalled = true;
        return { status: 200, data: TARGET_TENANT_UUID };
      }
      return { status: 404, data: null };
    };

    const origFrom = app.supabaseClient.from;
    app.supabaseClient.from = (table) => {
      if (table === 'tenant_memberships') {
        restMembershipsCalled = true;
      }
      return origFrom.call(app.supabaseClient, table);
    };

    const res = await app.lookupAuthoritativeTenantFromDatabase();
    assert.strictEqual(res, TARGET_TENANT_UUID);
    assert.strictEqual(rpcCalled, true, 'RPC get_auth_tenant_id must be invoked');
    assert.strictEqual(restMembershipsCalled, false, 'tenant_memberships REST endpoint must NOT be called when RPC succeeds');
  });

  // Test 19: Defensive validation: application ID 'usr_sa_1' is NEVER sent to tenant_memberships.user_id filter
  await it('Defensive validation: application ID usr_sa_1 is NEVER sent as tenant_memberships.user_id filter', async () => {
    const { app } = createFreshEnv();
    app.state.auth = { user: { id: 'usr_sa_1', email: 'admin@clasptek.org', tenant_id: 'clasptek_main' } };
    app.state.authoritativeTenantId = null;

    // RPC fails, forcing fallback
    app.supabaseClient.rpc = async () => ({ status: 500, data: null });

    let capturedUserIdFilter = null;
    app.supabaseClient.from = (table) => {
      if (table === 'tenant_memberships') {
        return {
          select: () => {
            const b = {
              eq: (col, val) => {
                if (col === 'user_id') capturedUserIdFilter = val;
                return b;
              },
              then: (cb) => Promise.resolve({ status: 200, data: [{ tenant_id: TARGET_TENANT_UUID }] }).then(cb),
              catch: () => b
            };
            return b;
          }
        };
      }
      return { select: () => ({ eq: () => ({}) }) };
    };

    const res = await app.lookupAuthoritativeTenantFromDatabase();
    assert.strictEqual(capturedUserIdFilter, null, 'Must NOT construct user_id filter with usr_sa_1');
    assert.strictEqual(res, TARGET_TENANT_UUID);
  });

  // Test 20: Query Guard in builder.eq refuses to construct user_id filter for non-UUID values on tenant_memberships
  await it('Query Guard in builder.eq refuses to construct user_id filter for non-UUID on tenant_memberships', async () => {
    const { app } = createFreshEnv();
    let urlBuilt = '';
    global.fetch = async (url) => {
      urlBuilt = String(url);
      return { ok: true, status: 200, json: async () => [] };
    };

    await app.supabaseClient.from('tenant_memberships').select('tenant_id').eq('user_id', 'usr_sa_1');
    assert(!urlBuilt.includes('usr_sa_1'), `URL must not contain "usr_sa_1", got: ${urlBuilt}`);
    assert(!urlBuilt.includes('user_id=eq'), `URL must not contain "user_id=eq", got: ${urlBuilt}`);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✔ ALL TENANT RESOLUTION MATRIX TESTS PASSED PERFECTLY!\n');
  }
})();
