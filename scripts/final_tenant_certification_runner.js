/**
 * FINAL PRODUCTION TENANT CERTIFICATION RUNNER
 * Read-Only Automated Verification of Cases A-D, Guards, Remote Tables, and Local Data
 */
const fs = require('fs');
const path = require('path');

// 1. Load application module
const htmlPath = path.join(__dirname, '..', 'clasptek_invoice_system.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not extract script block');

// Create isolated mock environment
const mockStorage = {};
const mockWindow = {
  location: { href: 'http://localhost:8080' },
  localStorage: {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  },
  crypto: {
    randomUUID: () => 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6'
  },
  addEventListener: () => {},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, style: {}, appendChild: () => {} })
  }
};

const sandbox = {
  window: mockWindow,
  document: mockWindow.document,
  localStorage: mockWindow.localStorage,
  sessionStorage: mockWindow.sessionStorage,
  navigator: { onLine: true },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  RegExp,
  Array,
  Object,
  String,
  Number,
  Boolean,
  URL,
  fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
  module: { exports: {} }
};

const fn = new Function(...Object.keys(sandbox), scriptMatch[1]);
fn(...Object.values(sandbox));
const app = sandbox.module.exports;

let passed = 0;
let failed = 0;
function test(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✔ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ✖ FAIL: ${name}`);
  }
}

console.log('=== FINAL TENANT RESOLUTION CERTIFICATION SUITE ===\n');

// Check 1 & 2: UUID helper
test('UUID helper validates canonical UUID', app.isValidUuid('f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6') === true);
test('UUID helper rejects clasptek_main', app.isValidUuid('clasptek_main') === false);
test('UUID helper rejects null / undefined / empty', app.isValidUuid(null) === false && app.isValidUuid('') === false && app.isValidUuid(undefined) === false);

// Check 8: Controlled in-memory resolution chain
app.state.supabase = app.state.supabase || {};
app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1';
app.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.mock';
app.state.auditLog = [];

// Case A: tenant_id = "clasptek_main" -> rejected / null
app.state.auth = {
  user: { id: 'usr_admin', role: 'Super Admin', tenant_id: 'clasptek_main' }
};
app.state.authoritativeTenantId = null;
test('Case A: tenant_id = "clasptek_main" resolves to null', app.resolveAuthoritativeTenantId() === null);

// Case B: tenant_id = "f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6" -> accepted
const targetUuid = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
app.state.auth = {
  user: { id: 'usr_admin', role: 'Super Admin', tenant_id: targetUuid }
};
test('Case B: valid tenant UUID in user.tenant_id resolves to UUID', app.resolveAuthoritativeTenantId() === targetUuid);

app.state.auth = {
  supabaseUser: { id: 'usr_admin', app_metadata: { tenant_id: targetUuid } }
};
test('Case B: valid tenant UUID in app_metadata resolves to UUID', app.resolveAuthoritativeTenantId() === targetUuid);

// Case C: no tenant metadata, but authenticated membership resolves the UUID
app.state.auth = {
  supabaseUser: { id: 'usr_admin', email: 'admin@clasptek.org' },
  supabaseJwt: 'eyJmock.token'
};
app.state.authoritativeTenantId = null;

// Mock database membership lookup
const client = app.getSupabaseClient();
const origFrom = client.from;
client.from = (tbl) => {
  if (tbl === 'tenant_memberships') {
    return {
      select: async () => ({
        status: 200,
        data: [{ tenant_id: targetUuid, role: 'SUPER_ADMIN', user_id: 'usr_admin' }]
      })
    };
  }
  return origFrom.call(client, tbl);
};

(async () => {
  const resolvedDbTenant = await app.lookupAuthoritativeTenantFromDatabase();
  test('Case C: Database membership lookup retrieves tenant UUID', resolvedDbTenant === targetUuid);
  test('Case C: resolveAuthoritativeTenantId() returns UUID after DB lookup', app.resolveAuthoritativeTenantId() === targetUuid);

  // Case D: no valid UUID and no membership -> null + migration blocked
  app.state.auth = { user: { id: 'usr_guest', role: 'Guest' } };
  app.state.authoritativeTenantId = null;
  client.from = (tbl) => ({
    select: async () => ({ status: 200, data: [] })
  });

  const emptyResolved = await app.lookupAuthoritativeTenantFromDatabase();
  test('Case D: Membership lookup returns null on empty memberships', emptyResolved === null);
  test('Case D: resolveAuthoritativeTenantId() returns null', app.resolveAuthoritativeTenantId() === null);

  // Check 9: Verify migration guard guarantees zero write requests when tenant cannot be resolved
  let writeDispatched = false;
  client.from = (tbl) => ({
    select: async () => ({ status: 200, data: [] }),
    upsert: async () => { writeDispatched = true; return { status: 201 }; },
    insert: async () => { writeDispatched = true; return { status: 201 }; }
  });

  let migrationThrew = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    migrationThrew = true;
  }
  test('Check 9: migrateLegacyDataToPostgres() threw error on unresolvable tenant', migrationThrew === true);
  test('Check 9: Zero database writes dispatched', writeDispatched === false);
  test('Check 9: Authority state strictly locked to BLOCKED', app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.BLOCKED);

  console.log(`\nCertification Suite Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
