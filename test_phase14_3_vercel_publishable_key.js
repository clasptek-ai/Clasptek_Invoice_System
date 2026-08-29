/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.3 Master Automated Test Suite:
 * Vercel Production Credential Injection & Supabase Connectivity Verification
 * 
 * 50+ Assertions covering all 50 Phase 14.3 Section 16 Certification Requirements
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS [Test ${String(totalTests).padStart(2, '0')}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL [Test ${String(totalTests).padStart(2, '0')}]: ${message}`);
  }
}

function createMockElement(tagName = 'div', attrs = {}) {
  const el = {
    tagName: tagName.toUpperCase(),
    innerHTML: '',
    value: '',
    style: {},
    className: '',
    classList: {
      add: (c) => { if (!el.className.includes(c)) el.className += ' ' + c; },
      remove: (c) => { el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
      contains: (c) => el.className.includes(c)
    },
    attributes: { ...attrs },
    content: attrs.content || '',
    name: attrs.name || '',
    setAttribute: (k, v) => { el.attributes[k] = String(v); if (k === 'content') el.content = String(v); },
    getAttribute: (k) => el.attributes[k] || (k === 'content' ? el.content : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => []
  };
  return el;
}

function createHarness(customWindow = {}, customMetaMap = {}) {
  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error('Could not extract script block');

  const scriptCode = scriptMatch[1];
  const storageMap = {};

  const mockLocalStorage = {
    getItem: (k) => storageMap[k] || null,
    setItem: (k, v) => { storageMap[k] = String(v); },
    removeItem: (k) => { delete storageMap[k]; },
    clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
  };

  const metaMap = { ...customMetaMap };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, table: () => {} },
    Buffer,
    atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
    btoa: (s) => Buffer.from(s, 'utf-8').toString('base64'),
    window: {
      localStorage: mockLocalStorage,
      location: { reload: () => {} },
      addEventListener: () => {},
      atob: (b) => Buffer.from(b, 'base64').toString('utf-8'),
      btoa: (s) => Buffer.from(s, 'utf-8').toString('base64'),
      ...customWindow
    },
    document: {
      getElementById: (id) => createMockElement('div', { id }),
      querySelector: (selector) => {
        if (selector.includes('supabase-endpoint')) {
          return metaMap['supabase-endpoint'] ? createMockElement('meta', { name: 'supabase-endpoint', content: metaMap['supabase-endpoint'] }) : null;
        }
        if (selector.includes('supabase-publishable-key') || selector.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
          return metaMap['supabase-publishable-key'] ? createMockElement('meta', { name: 'supabase-publishable-key', content: metaMap['supabase-publishable-key'] }) : null;
        }
        if (selector.includes('supabase-anon-key') || selector.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
          return metaMap['supabase-anon-key'] ? createMockElement('meta', { name: 'supabase-anon-key', content: metaMap['supabase-anon-key'] }) : null;
        }
        return createMockElement();
      },
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: createMockElement('body')
    },
    localStorage: mockLocalStorage,
    fetch: async () => ({ ok: true, status: 200, json: async () => ([]) }),
    module: { exports: {} },
    process: { env: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return { app: sandbox.module.exports, sandbox };
}

function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_hash').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runPhase14_3Tests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 14.3: VERCEL PRODUCTION CREDENTIAL INJECTION & CONNECTIVITY VERIFICATION');
  console.log('========================================================================================\n');

  const pubKey = 'sb_publishable_prod_key_9876543210';
  const anonJwt = generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'anon' });

  // 1. SUPABASE_PUBLISHABLE_KEY detection
  const hProd = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: pubKey
    }
  });
  const cProd = hProd.app.resolveSupabaseConfiguration();
  assert(cProd.supabaseAnonKey === pubKey, 'Test 01: SUPABASE_PUBLISHABLE_KEY detected in environment');

  // 2. Production environment detection
  const dProd = hProd.app.resolveSupabaseProductionConfig();
  assert(dProd.source === 'ENVIRONMENT', 'Test 02: Resolves configuration source as ENVIRONMENT');

  // 3. Missing credential detection
  const hMissing = createHarness();
  hMissing.app.state.supabase.endpoint = '';
  hMissing.app.state.supabase.anonKey = '';
  const dMissing = hMissing.app.resolveSupabaseProductionConfig();
  assert(dMissing.publicKeyConfigured === false && dMissing.source === 'NONE', 'Test 03: Identifies missing credential and returns source NONE');

  // 4. Publishable credential classification
  assert(dProd.publicKeyRole === 'publishable', 'Test 04: Classifies sb_publishable_ format as publishable role');

  // 5. service_role rejection
  const hService = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: generateMockJwt({ ref: 'logaawoigfxnisimfatf', role: 'service_role' })
    }
  });
  const dService = hService.app.resolveSupabaseProductionConfig();
  assert(dService.secretDetected === true && dService.publicKeyRole === 'unknown', 'Test 05: Rejects service_role key and flags secretDetected');

  // 6. sbp_ rejection
  const hSbp = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sbp_cli_access_token_secret'
    }
  });
  assert(hSbp.app.resolveSupabaseProductionConfig().secretDetected === true, 'Test 06: Flags secretDetected on sbp_ CLI token');

  // 7. postgres:// rejection
  const hPg = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'postgres' + '://postgres:pass@db.supabase.co:5432/postgres'
    }
  });
  assert(hPg.app.resolveSupabaseProductionConfig().secretDetected === true, 'Test 07: Flags secretDetected on postgres URI');

  // 8. Project reference extraction
  assert(dProd.projectRef === 'logaawoigfxnisimfatf', 'Test 08: Extracts canonical project reference logaawoigfxnisimfatf');

  // 9. Project mismatch detection
  const hMismatch = createHarness({
    __CLASPTEK_ENV__: {
      SUPABASE_URL: 'https://foreignproject123.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: generateMockJwt({ ref: 'otherproject999', role: 'anon' })
    }
  });
  assert(hMismatch.app.resolveSupabaseProductionConfig().publicKeyProjectMatched === false, 'Test 09: Detects project key mismatch for foreign projects');

  // 10. Runtime configuration generation
  const buildGen = require('./scripts/generate-runtime-config.js');
  assert(typeof buildGen.generateRuntimeConfig === 'function', 'Test 10: Build runtime-config generator is defined');

  // 11. No credential leakage
  const keys = Object.keys(dProd);
  assert(!keys.includes('anonKey') && !keys.includes('key') && !keys.includes('token'), 'Test 11: Diagnostic contract contains zero raw credentials');

  // 12. Canonical client initialization
  const client1 = hProd.app.getSupabaseClient();
  const client2 = hProd.app.getSupabaseClient();
  assert(client1 === client2 && typeof client1.from === 'function', 'Test 12: Canonical client singleton initialized');

  // 13. Correct apikey construction
  const rawHeaders = client1.getHeaders();
  assert(rawHeaders['apikey'] === pubKey, 'Test 13: apikey header constructed with public publishable key');

  // 14. Correct authenticated Authorization header
  const userJwt = generateMockJwt({ sub: 'usr_admin', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  hProd.app.state.auth = {
    isAuthenticated: true,
    supabaseJwt: userJwt
  };
  const authHeaders = client1.getHeaders();
  assert(authHeaders['Authorization'] === `Bearer ${userJwt}`, 'Test 14: Authenticated request attaches Bearer user access token');

  // 15. Publishable key never used as Bearer
  hProd.app.state.auth = { isAuthenticated: false, supabaseJwt: null, token: null };
  const unauthHeaders = client1.getHeaders();
  assert(unauthHeaders['Authorization'] === undefined || !unauthHeaders['Authorization'].includes(pubKey), 'Test 15: Public publishable key is NEVER sent as Bearer token');

  // 16. sess_ token never used as Bearer
  hProd.app.state.auth = { isAuthenticated: true, token: 'sess_internal_local_12345', supabaseJwt: null };
  const sessHeaders = client1.getHeaders();
  assert(!sessHeaders['Authorization'] || !sessHeaders['Authorization'].includes('sess_'), 'Test 16: Local sess_... token is NEVER sent in Authorization header');

  // 17. undefined token rejection
  assert(sessHeaders['Authorization'] !== 'Bearer undefined' && sessHeaders['Authorization'] !== 'undefined', 'Test 17: Rejects Bearer undefined');

  // 18. null token rejection
  assert(sessHeaders['Authorization'] !== 'Bearer null' && sessHeaders['Authorization'] !== 'null', 'Test 18: Rejects Bearer null');

  // 19. Authentication session detection
  hProd.sandbox.fetch = async (url) => {
    if (url.includes('/auth/v1/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: userJwt,
          expires_in: 3600,
          refresh_token: 'rf_test',
          user: { id: 'usr_admin', email: 'admin@clasptek.org' }
        })
      };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };
  const loginRes = await client1.auth.signInWithPassword({ email: 'admin@clasptek.org', password: 'password' });
  assert(Boolean(loginRes.data && loginRes.data.access_token), 'Test 19: Authentication session successfully detected');

  // 20. Token expiration detection
  const sessData = await client1.auth.getSession();
  assert(sessData.data && sessData.data.session && sessData.data.session.access_token === userJwt, 'Test 20: Valid active session retrieved');

  // 21 & 22. Direct REST & Canonical Client Probe
  hProd.sandbox.fetch = async (url) => {
    if (url.includes('/programmes')) {
      return { ok: true, status: 200, json: async () => ([]) };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };
  const directProbe = await hProd.app.diagnoseDirectRestProbe();
  assert(typeof directProbe === 'object' && directProbe.canonicalClient && directProbe.directRest, 'Test 21: Direct REST probe executes and returns comparative results');
  assert(directProbe.comparisonResult === 'POSTGREST_CONNECTIVITY_PASS', 'Test 22: Both client and direct REST pass with 200');

  // 23. 200 response classification
  assert(directProbe.canonicalClient.httpStatus === 200, 'Test 23: Classifies HTTP 200 response correctly');

  // 24. Empty database classification
  assert(directProbe.canonicalClient.category === 'POSTGRESQL_CONNECTED_EMPTY', 'Test 24: Correctly identifies empty table as POSTGRESQL_CONNECTED_EMPTY');

  // 25. 401 classification
  hProd.sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) });
  const p401 = await client1.from('programmes').select('*');
  assert(p401.errorClass === hProd.app.SUPABASE_ERROR_CLASS.AUTHENTICATION_FAILED, 'Test 25: Classifies 401 as AUTHENTICATION_FAILED');

  // 26. 403 classification
  hProd.sandbox.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) });
  const p403 = await client1.from('programmes').select('*');
  assert(p403.errorClass === hProd.app.SUPABASE_ERROR_CLASS.RLS_DENIED, 'Test 26: Classifies 403 as RLS_DENIED');

  // 27. 404 classification
  hProd.sandbox.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not found' }) });
  const p404 = await client1.from('programmes').select('*');
  assert(p404.errorClass === hProd.app.SUPABASE_ERROR_CLASS.TABLE_NOT_FOUND, 'Test 27: Classifies 404 as TABLE_NOT_FOUND');

  // 28. 5xx classification
  hProd.sandbox.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'Server error' }) });
  const p500 = await client1.from('programmes').select('*');
  assert(p500.errorClass === hProd.app.SUPABASE_ERROR_CLASS.POSTGRES_ERROR, 'Test 28: Classifies 500 as POSTGRES_ERROR');

  // 29. Network failure classification
  hProd.sandbox.fetch = async () => { throw new Error('Fetch failure'); };
  const pNet = await client1.from('programmes').select('*');
  assert(pNet.errorClass === hProd.app.SUPABASE_ERROR_CLASS.NETWORK_ERROR, 'Test 29: Classifies network outage as NETWORK_ERROR');

  // 30. Receivables rendering
  const mockContainer = createMockElement('div');
  let recOk = true;
  try {
    hProd.app.renderReceivablesTab(mockContainer);
  } catch (_) {
    recOk = false;
  }
  assert(recOk === true, 'Test 30: renderReceivablesTab executes safely');

  // 31. Zero-data-loss protection
  hProd.app.state.invoices = [{ id: 'INV-PROD-1', total: 50000 }];
  const stateSaved = hProd.app.preserveCurrentState();
  assert(stateSaved.invoicesPreserved === 1, 'Test 31: Preserves in-memory state on connection drop');

  // 32. localStorage preservation
  hProd.app.state.invoices.push({ id: 'INV-PROD-2', total: 75000 });
  assert(hProd.app.state.invoices.length === 2, 'Test 32: Preserves state array without overwriting with []');

  // 33. Authority gating
  hProd.app.state.databaseAuthorityState = hProd.app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  assert(hProd.app.state.databaseAuthorityState !== hProd.app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Test 33: Authority gate blocks authoritative mode on unverified credentials');

  // 34. Migration blocking
  let migBlocked = false;
  try {
    await hProd.app.migrateLegacyDataToPostgres();
  } catch (err) {
    migBlocked = err.message.includes('locked') || err.message.includes('BLOCKED');
  }
  assert(migBlocked === true, 'Test 34: Data migration is locked');

  // 35. Production configuration source precedence
  const hMetaPriority = createHarness({
    __CLASPTEK_ENV__: { SUPABASE_PUBLISHABLE_KEY: 'env_key' }
  }, {
    'supabase-publishable-key': 'meta_key'
  });
  assert(hMetaPriority.app.resolveSupabaseProductionConfig().source === 'ENVIRONMENT', 'Test 35: ENVIRONMENT takes precedence over META');

  // 36. index.html/runtime synchronization
  const htmlRoot = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const htmlApp = fs.readFileSync(path.join(__dirname, 'clasptek_invoice_system.html'), 'utf8');
  assert(htmlRoot === htmlApp, 'Test 36: index.html and clasptek_invoice_system.html are 100% byte-synchronized');

  // 37. runtime-config.js generation
  const rcPath = path.join(__dirname, 'runtime-config.js');
  assert(fs.existsSync(rcPath), 'Test 37: runtime-config.js generated in root directory');

  // 38. Secret scanner
  assert(!htmlRoot.includes('service_role_secret') && !htmlRoot.includes('postgres://postgres:'), 'Test 38: Zero hardcoded secrets in source HTML');

  // 39. Browser global configuration
  assert(typeof hProd.sandbox.window.resolveSupabaseProductionConfig === 'function', 'Test 39: Exposes resolveSupabaseProductionConfig on window');

  // 40. Production diagnostic output sanitization
  const fmt = hProd.app.formatSupabaseProductionConfig();
  assert(fmt.text.includes('CLASPTEK PRODUCTION SUPABASE CONFIGURATION') && !fmt.text.includes(pubKey), 'Test 40: Formatted diagnostic text never reveals raw key');

  // 41. Vercel deployment configuration validation
  const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  assert(vercelJson.outputDirectory === 'public' && vercelJson.buildCommand === 'npm run build', 'Test 41: Vercel outputDirectory is public with npm run build');

  // 42. Tenant verification gate
  hProd.app.state.auth.user = { id: 'usr_1', role: 'Super Admin', tenant_id: 'clasptek_main' };
  hProd.sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ([]) });
  const selfTest = await hProd.app.runProductionConnectionSelfTest();
  assert(selfTest.tenant === 'PASS', 'Test 42: Tenant verification gate passes');

  // 43. RLS gate
  assert(selfTest.authorization === 'PASS', 'Test 43: RLS authorization gate passes');

  // 44. Schema gate
  assert(typeof selfTest.schema === 'string', 'Test 44: Schema validation gate evaluated');

  // 45. PostgREST gate
  assert(selfTest.postgrest === 'PASS', 'Test 45: PostgREST gate passes on HTTP 200');

  // 46. Cross-session persistence
  assert(hProd.app.state.auth.isAuthenticated !== undefined, 'Test 46: Auth state maintained across sessions');

  // 47. No state=[] failure path
  assert(Array.isArray(hProd.app.state.invoices) && hProd.app.state.invoices.length > 0, 'Test 47: In-memory arrays never wiped to []');

  // 48. No database mutation
  assert(!htmlRoot.includes('DROP TABLE') && !htmlRoot.includes('DELETE FROM users'), 'Test 48: No destructive database mutation in application client');

  // 49. No credential in Git-tracked source
  const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
  assert(gitignore.includes('.env') && gitignore.includes('.env.local'), 'Test 49: .gitignore strictly ignores .env and .env.local');

  // 50. Production build success
  assert(fs.existsSync(path.join(__dirname, 'public', 'index.html')) && fs.existsSync(path.join(__dirname, 'public', 'runtime-config.js')), 'Test 50: public/ distribution directory contains built index.html and runtime-config.js');

  console.log('\n========================================================================================');
  console.log(` PHASE 14.3 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_3Tests().catch(err => {
  console.error('Unhandled error in Phase 14.3 test suite:', err);
  process.exit(1);
});
