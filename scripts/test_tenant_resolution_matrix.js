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

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✔ ALL TENANT RESOLUTION MATRIX TESTS PASSED PERFECTLY!\n');
  }
})();
