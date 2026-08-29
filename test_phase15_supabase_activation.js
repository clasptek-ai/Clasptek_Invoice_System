/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 15 Automated Certification Suite: Production Supabase Activation, Authentication Repair & Live Data Migration
 * 
 * 100+ Assertions across 10 Operational Categories
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
    console.log(`  ✔ PASS [Test ${totalTests}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL [Test ${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    innerHTML: '',
    value: '',
    style: {},
    className: '',
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    querySelector: () => createMockElement(),
    querySelectorAll: () => []
  };
}

function createTestHarness(mockFetchHandler) {
  const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not extract script block from clasptek_invoice_system.html');
  }

  const scriptCode = scriptMatch[1];
  const storageMap = {};

  const mockLocalStorage = {
    getItem: (key) => storageMap[key] || null,
    setItem: (key, val) => { storageMap[key] = String(val); },
    removeItem: (key) => { delete storageMap[key]; },
    clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
  };

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
      table: () => {}
    },
    window: {
      localStorage: mockLocalStorage,
      location: { reload: () => {} },
      addEventListener: () => {}
    },
    document: {
      getElementById: (id) => createMockElement(),
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: createMockElement('body')
    },
    localStorage: mockLocalStorage,
    fetch: async (url, options) => {
      if (mockFetchHandler) {
        return await mockFetchHandler(url, options);
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [],
        text: async () => '[]'
      };
    },
    Date: Date,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    JSON: JSON,
    URL: URL,
    Buffer: Buffer,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    module: { exports: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  return {
    app: sandbox.module.exports,
    storage: storageMap,
    setMockFetch: (fn) => {
      sandbox.fetch = fn;
    }
  };
}

async function runPhase15ActivationTests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 15: PRODUCTION SUPABASE ACTIVATION, AUTH REPAIR & MIGRATION CERTIFICATION');
  console.log('========================================================================================\n');

  let currentFetchHandler = null;
  const harness = createTestHarness(async (url, opts) => {
    if (currentFetchHandler) return await currentFetchHandler(url, opts);
    return { ok: true, status: 200, json: async () => [] };
  });
  const app = harness.app;

  // ---------------------------------------------------------------------------
  // CATEGORY 1: CONFIGURATION RESOLUTION & SECRET SHIELD
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Configuration Resolution & Secret Shield ---');

  assert(typeof app.resolveSupabaseConfiguration === 'function', 'resolveSupabaseConfiguration is exported');
  assert(typeof app.validateSupabasePublicKey === 'function', 'validateSupabasePublicKey is exported');
  assert(typeof app.maskSecretKey === 'function', 'maskSecretKey is exported');

  // Verify Canonical Constants
  assert(app.CANONICAL_SUPABASE_PROJECT_REF === 'logaawoigfxnisimfatf', 'Canonical Project Ref is logaawoigfxnisimfatf');
  assert(app.CANONICAL_SUPABASE_REST_ENDPOINT === 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/', 'Canonical REST endpoint matches production URL');

  // URL Format and Host Verification
  const validConfig = app.resolveSupabaseConfiguration();
  assert(validConfig.endpoint.includes('logaawoigfxnisimfatf'), 'Resolved endpoint points to canonical project');
  assert(validConfig.isExpectedProject === true, 'isExpectedProject is true for canonical project');

  // Masking format: ****...xxxx
  const testKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6MTk5OTk5OTk5OX0.testKey1234';
  const masked = app.maskSecretKey(testKey);
  assert(masked.startsWith('eyJhbGci...****...'), 'maskSecretKey masks the middle of the JWT');
  assert(masked.endsWith('1234'), 'maskSecretKey displays trailing 4 characters');
  assert(!masked.includes('eyJyb2xlIjoiYW5vbi'), 'maskSecretKey never exposes the payload');

  // Rejection of Server-Side Secrets
  const secretKeyRes = app.validateSupabasePublicKey('sbp_super_secret_management_key_123');
  assert(secretKeyRes.isSecretKey === true, 'Rejects sbp_ personal access tokens');
  assert(secretKeyRes.isValid === false, 'Flags server key as invalid for browser use');

  const pgConnRes = app.validateSupabasePublicKey('postgres://postgres:password123@db.supabase.co:5432/postgres');
  assert(pgConnRes.isSecretKey === true, 'Rejects plaintext postgres:// connection strings');
  assert(pgConnRes.isValid === false, 'Flags database connection string as invalid for browser client');

  // Rejection of Service Role Key
  const b64ServiceRole = Buffer.from(JSON.stringify({ role: 'service_role', ref: 'logaawoigfxnisimfatf' })).toString('base64');
  const serviceRoleJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64ServiceRole}.sig`;
  const srvRes = app.validateSupabasePublicKey(serviceRoleJwt);
  assert(srvRes.isServiceRole === true, 'Decodes JWT and flags isServiceRole === true');
  assert(srvRes.isValid === false, 'Rejects service_role key in frontend client');

  // Empty and Malformed Key
  const emptyKeyRes = app.validateSupabasePublicKey('');
  assert(emptyKeyRes.present === false, 'Flags empty key as present: false');
  assert(emptyKeyRes.isValid === false, 'Empty key isValid is false');

  const malformedKeyRes = app.validateSupabasePublicKey('short');
  assert(malformedKeyRes.isFormatValid === false, 'Short key isFormatValid is false');

  // ---------------------------------------------------------------------------
  // CATEGORY 2: AUTHENTICATION & SESSION ARCHITECTURE
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Authentication & Session Architecture ---');

  assert(typeof app.supabaseAuth === 'object', 'supabaseAuth client is exported');
  assert(typeof app.supabaseAuth.signInWithPassword === 'function', 'signInWithPassword method exists');
  assert(typeof app.supabaseAuth.signOut === 'function', 'signOut method exists');
  assert(typeof app.supabaseAuth.getSession === 'function', 'getSession method exists');

  // Unauthenticated Headers
  app.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJsb2dhYXdvaWdmeG5pc2ltZmF0ZiIsInJvbGUiOiJhbm9uIn0.sample_anon_key';
  app.state.auth = { isAuthenticated: false, user: null, token: null, supabaseJwt: null };
  const unauthHeaders = app.supabaseClient.getHeaders();
  assert(unauthHeaders['apikey'] !== undefined, 'Unauthenticated request attaches apikey header');
  assert(unauthHeaders['Authorization'] === undefined || !unauthHeaders['Authorization'].includes('sess_'), 'Unauthenticated request does not attach invalid Authorization Bearer');
  assert(unauthHeaders['Content-Type'] === 'application/json', 'Content-Type is application/json');

  // Authenticated Session Headers
  const userJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJsb2dhYXdvaWdmeG5pc2ltZmF0ZiIsInN1YiI6InVzcl8xMjMifQ.sig123';
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_123', name: 'Dr. Test Admin', role: 'Super Admin', tenant_id: 'clasptek_main' },
    supabaseJwt: userJwt
  };
  const authHeaders = app.supabaseClient.getHeaders();
  assert(authHeaders['Authorization'] === `Bearer ${userJwt}`, 'Authenticated request uses user accessToken in Authorization header');

  // Internal Local Session Token Isolation
  app.state.auth.supabaseJwt = null;
  app.state.auth.token = 'sess_local_browser_token_abc';
  const shieldedHeaders = app.supabaseClient.getHeaders();
  assert(shieldedHeaders['Authorization'] !== 'Bearer sess_local_browser_token_abc', 'Local session tokens (sess_...) are NEVER sent to PostgREST');

  // ---------------------------------------------------------------------------
  // CATEGORY 3: SUPABASE_ERROR_CLASS & STRUCTURED DB RETURNS
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: SUPABASE_ERROR_CLASS & Structured DB Returns ---');

  assert(typeof app.SUPABASE_ERROR_CLASS === 'object', 'SUPABASE_ERROR_CLASS enum is exported');
  const requiredErrClasses = [
    'NOT_CONFIGURED', 'INVALID_ENDPOINT', 'INVALID_PUBLIC_KEY',
    'AUTHENTICATION_FAILED', 'SESSION_EXPIRED', 'RLS_DENIED',
    'TABLE_NOT_FOUND', 'SCHEMA_MISMATCH', 'NETWORK_ERROR',
    'POSTGRES_ERROR', 'EMPTY_DATABASE', 'DATABASE_CONNECTED', 'DATABASE_RECONCILED'
  ];
  requiredErrClasses.forEach(cls => {
    assert(app.SUPABASE_ERROR_CLASS[cls] === cls, `SUPABASE_ERROR_CLASS defines ${cls}`);
  });

  // Configure test credentials
  app.state.supabase = {
    endpoint: app.CANONICAL_SUPABASE_REST_ENDPOINT,
    anonKey: 'test_anon_key_for_phase15_activation_suite'
  };

  // Test structured error return on 401
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  const res401 = await app.supabaseClient.from('programmes').select('*');
  assert(res401.ok === false, 'Query returns ok === false on 401');
  assert(res401.data === null, 'Query returns data === null on 401');
  assert(res401.records === null, 'Query returns records === null (NEVER []) on 401');
  assert(res401.errorClass === app.SUPABASE_ERROR_CLASS.AUTHENTICATION_FAILED, 'Query errorClass is AUTHENTICATION_FAILED on 401');
  assert(res401.status === 401, 'Query status is 401');

  // Test structured error return on 403 (RLS)
  currentFetchHandler = async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    json: async () => ({ message: 'Permission denied' })
  });

  const res403 = await app.supabaseClient.from('programmes').select('*');
  assert(res403.ok === false, 'Query returns ok === false on 403');
  assert(res403.records === null, 'Query returns records === null on 403');
  assert(res403.errorClass === app.SUPABASE_ERROR_CLASS.RLS_DENIED, 'Query errorClass is RLS_DENIED on 403');

  // Test structured error return on 404 (Missing Table)
  currentFetchHandler = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: async () => ({ message: 'Relation does not exist' })
  });

  const res404 = await app.supabaseClient.from('programmes').select('*');
  assert(res404.ok === false, 'Query returns ok === false on 404');
  assert(res404.errorClass === app.SUPABASE_ERROR_CLASS.TABLE_NOT_FOUND, 'Query errorClass is TABLE_NOT_FOUND on 404');

  // Test structured error return on 500 (PostgreSQL server error)
  currentFetchHandler = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ message: 'Database connection failed' })
  });

  const res500 = await app.supabaseClient.from('programmes').select('*');
  assert(res500.ok === false, 'Query returns ok === false on 500');
  assert(res500.errorClass === app.SUPABASE_ERROR_CLASS.POSTGRES_ERROR, 'Query errorClass is POSTGRES_ERROR on 500');

  // Test network failure handling
  currentFetchHandler = async () => {
    throw new Error('Failed to fetch (Network offline)');
  };

  const resNet = await app.supabaseClient.from('programmes').select('*');
  assert(resNet.ok === false, 'Query returns ok === false on network failure');
  assert(resNet.errorClass === app.SUPABASE_ERROR_CLASS.NETWORK_ERROR, 'Query errorClass is NETWORK_ERROR on network disconnect');

  // ---------------------------------------------------------------------------
  // CATEGORY 4: CONNECTION DIAGNOSTIC ENGINE (diagnoseSupabaseProductionConnection)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Connection Diagnostic Engine (diagnoseSupabaseProductionConnection) ---');

  assert(typeof app.diagnoseSupabaseProductionConnection === 'function', 'diagnoseSupabaseProductionConnection is exported');

  // Test diagnostic sequence on 401 Unauthorized
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin', name: 'Dr. Test Admin', role: 'Super Admin', tenant_id: 'clasptek_main' }
  };

  const diag401 = await app.diagnoseSupabaseProductionConnection();
  assert(diag401.urlValidation.isValid === true, 'Step 1: URL validation passes');
  assert(diag401.projectIdentity.isMatch === true, 'Step 2: Project identity matches logaawoigfxnisimfatf');
  assert(diag401.projectIdentity.display === 'Project: VERIFIED', 'Step 2: Project display is Project: VERIFIED');
  assert(diag401.apiKeyClassification.classification === 'VALID FORMAT', 'Step 3: Key format classified');
  assert(diag401.apiKeyClassification.display.startsWith('Public Key: ****'), 'Step 3: Masked public key display format');
  assert(diag401.authSession.sessionPresent === true, 'Step 4: Auth session inspected');
  assert(diag401.authSession.role === 'Super Admin', 'Step 4: User role identified');
  assert(diag401.authSession.tenant === 'clasptek_main', 'Step 4: Tenant identified');
  assert(diag401.postgrestProbe.connected === false, 'Step 5: Probe connected is false on 401');
  assert(diag401.postgrestProbe.databaseState === 'AUTHENTICATION_ERROR', 'Step 5: databaseState is AUTHENTICATION_ERROR on 401');
  assert(diag401.postgrestProbe.httpStatus === 401, 'Step 5: httpStatus is 401');
  assert(diag401.rlsVerification.status === 'AUTHENTICATION FAILURE', 'Step 6: RLS status reflects AUTHENTICATION FAILURE on 401');
  assert(typeof diag401.latencyMs === 'number' && diag401.latencyMs >= 0, 'Diagnostic measures execution latency in ms');

  // Test diagnostic sequence on successful connection with empty table
  currentFetchHandler = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => []
    };
  };

  const diagSuccessEmpty = await app.diagnoseSupabaseProductionConnection();
  assert(diagSuccessEmpty.postgrestProbe.connected === true, 'Probe reports connected === true on 200 OK');
  assert(diagSuccessEmpty.postgrestProbe.databaseState === 'DB_CONNECTED_EMPTY', 'Empty table diagnosed as DB_CONNECTED_EMPTY');
  assert(diagSuccessEmpty.rlsVerification.status === 'EMPTY TABLE', 'RLS status diagnosed as EMPTY TABLE');
  assert(diagSuccessEmpty.rlsVerification.verified === true, 'RLS verified flag is true');

  // Test diagnostic sequence on successful connection with populated table
  currentFetchHandler = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'PRG-001', name: 'Executive AI Masterclass' }]
    };
  };

  const diagSuccessData = await app.diagnoseSupabaseProductionConnection();
  assert(diagSuccessData.postgrestProbe.databaseState === 'DATABASE_CONNECTED', 'Populated table diagnosed as DATABASE_CONNECTED');
  assert(diagSuccessData.rlsVerification.status === 'VERIFIED', 'RLS verified');

  // ---------------------------------------------------------------------------
  // CATEGORY 5: PRODUCTION DATABASE SCHEMA VERIFICATION (33 Tables)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Production Database Schema Verification (33 Tables) ---');

  assert(Array.isArray(app.REQUIRED_PRODUCTION_TABLES), 'REQUIRED_PRODUCTION_TABLES is exported as an array');
  assert(app.REQUIRED_PRODUCTION_TABLES.length === 33, 'Defines exactly 33 required production tables');

  const checkTableList = [
    'finance_settings', 'payment_accounts', 'programmes', 'personnel', 'customers',
    'enquiries', 'enrolments', 'invoices', 'invoice_items', 'payments', 'receipts',
    'expenses', 'direct_income', 'budgets', 'budget_lines', 'payslips',
    'facilitator_sessions', 'customer_timeline', 'collection_actions', 'finance_audit_log',
    'management_alerts', 'crm_stage_history', 'bank_reconciliations', 'bank_reconciliation_items',
    'financial_adjustments', 'management_metrics', 'cash_flow_forecasts', 'customer_segments',
    'approval_thresholds', 'report_snapshots', 'schema_versions', 'idempotency_keys', 'system_diagnostics'
  ];
  checkTableList.forEach(tbl => {
    assert(app.REQUIRED_PRODUCTION_TABLES.includes(tbl), `Requires table ${tbl}`);
  });

  assert(typeof app.verifyProductionSchema === 'function', 'verifyProductionSchema is exported');

  // Simulate all 33 tables present
  currentFetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => []
  });

  const schemaAllPass = await app.verifyProductionSchema();
  assert(schemaAllPass.requiredTables === 33, 'Reports 33 required tables');
  assert(schemaAllPass.existingTables === 33, 'Reports 33 existing tables');
  assert(schemaAllPass.missingTables.length === 0, 'Zero missing tables');
  assert(schemaAllPass.compatible === true, 'Schema is compatible');
  assert(schemaAllPass.status === 'SCHEMA COMPATIBLE', 'Status is SCHEMA COMPATIBLE');

  // Simulate missing tables (e.g. 404 on idempotency_keys)
  currentFetchHandler = async (url) => {
    if (url.includes('idempotency_keys')) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const schemaMissing = await app.verifyProductionSchema();
  assert(schemaMissing.compatible === false, 'CRITICAL: Schema fails compatibility when a table is missing');
  assert(schemaMissing.missingTables.includes('idempotency_keys'), 'Identifies missing table idempotency_keys');
  assert(schemaMissing.status === 'SCHEMA INCOMPATIBLE', 'Status is SCHEMA INCOMPATIBLE');

  // ---------------------------------------------------------------------------
  // CATEGORY 6: ZERO-DATA-LOSS & FALSE EMPTY DETECTION GUARDS
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Zero-Data-Loss & False Empty Detection Guards ---');

  // In-memory data seeded
  app.state.invoices = [{ id: 'INV-PROD-001', grandTotal: 250000, clientName: 'Dr. Alabi' }];
  app.state.payments = [{ id: 'PAY-PROD-001', amountPaid: 250000 }];
  app.state.customers = [{ id: 'CUST-PROD-001', name: 'Dr. Alabi' }];

  // Simulate HTTP 401 error on loadAll
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  await app.loadAll();

  assert(app.state.invoices.length === 1, 'CRITICAL: Invoices are NOT set to [] on 401 error');
  assert(app.state.invoices[0].id === 'INV-PROD-001', 'Existing invoice preserved intact');
  assert(app.state.payments.length === 1, 'CRITICAL: Payments are NOT set to [] on 401 error');
  assert(app.state.customers.length === 1, 'CRITICAL: Customers are NOT set to [] on 401 error');
  assert(app.state.connectionError.includes('Existing business data has not been modified') || app.state.connectionError.includes('No financial data has been changed'), 'Explicit safety guarantee in connectionError');

  // Verification that inspectProductionDatabase reports hasErrors and isEmpty === false on 401
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  const inspect401 = await app.inspectProductionDatabase();
  assert(inspect401.isEmpty === false, 'CRITICAL: inspectProductionDatabase reports isEmpty: false on 401 error');
  assert(inspect401.hasErrors === true, 'inspectProductionDatabase reports hasErrors: true on 401 error');

  // ---------------------------------------------------------------------------
  // CATEGORY 7: PRODUCTION RLS & MULTI-TENANT ISOLATION MATRIX
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Production RLS & Multi-Tenant Isolation Matrix ---');

  assert(typeof app.verifyProductionRlsMatrix === 'function', 'verifyProductionRlsMatrix is exported');
  const rlsMatrix = await app.verifyProductionRlsMatrix();
  assert(rlsMatrix.tenantIsolation.passed === true, 'Tenant isolation check passed');
  assert(rlsMatrix.roleIsolation.passed === true, 'Role isolation check passed');
  assert(rlsMatrix.selfServiceIsolation.passed === true, 'Facilitator self-service isolation check passed');
  assert(rlsMatrix.financialIsolation.passed === true, 'Financial ledgers isolation check passed');
  assert(rlsMatrix.overallPassed === true, 'Overall RLS matrix check passed');

  // ---------------------------------------------------------------------------
  // CATEGORY 8: SAFE PRODUCTION MIGRATION ENGINE & GATING
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 8: Safe Production Migration Engine & Gating ---');

  // Gate check: Migration must throw when authority state is API_KEY_INVALID
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  let didCatch401Migration = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didCatch401Migration = true;
    assert(err.message.includes('Migration locked'), 'Migration throws Migration locked on API_KEY_INVALID');
  }
  assert(didCatch401Migration === true, 'Migration strictly prevented while API key is invalid');

  // Gate check: Migration must throw when authority state is DATABASE_UNAVAILABLE
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.DATABASE_UNAVAILABLE;
  let didCatch500Migration = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didCatch500Migration = true;
    assert(err.message.includes('Migration locked'), 'Migration throws Migration locked on DATABASE_UNAVAILABLE');
  }
  assert(didCatch500Migration === true, 'Migration strictly prevented while database is unavailable');

  // Gate check: Migration must throw when authority state is RLS_AUTHORIZATION_FAILED
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.RLS_AUTHORIZATION_FAILED;
  let didCatchRlsMigration = false;
  try {
    await app.migrateLegacyDataToPostgres();
  } catch (err) {
    didCatchRlsMigration = true;
    assert(err.message.includes('Migration locked'), 'Migration throws Migration locked on RLS failure');
  }
  assert(didCatchRlsMigration === true, 'Migration strictly prevented while RLS is denied');

  // ---------------------------------------------------------------------------
  // CATEGORY 9: AUTHORITATIVE MODE ACTIVATION GATE (14 GATES)
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 9: Authoritative Mode Activation Gate (14 Gates) ---');

  assert(typeof app.activatePostgresAuthoritativeMode === 'function', 'activatePostgresAuthoritativeMode is exported');

  // Test 1: Authoritative mode activation MUST FAIL on HTTP 401
  currentFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' })
  });

  let didBlockAuthOn401 = false;
  try {
    await app.activatePostgresAuthoritativeMode();
  } catch (err) {
    didBlockAuthOn401 = true;
    assert(err.message.includes('Authoritative Mode Activation Failed'), 'Activation fails when PostgREST returns 401');
  }
  assert(didBlockAuthOn401 === true, 'CRITICAL: Authoritative mode strictly blocked on 401 Unauthorized');
  assert(app.state.databaseAuthorityState !== app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'Authority state is NOT set to AUTHORITATIVE on 401');

  // Test 2: Authoritative mode activation MUST FAIL when schema is incomplete
  currentFetchHandler = async (url) => {
    if (url.includes('finance_audit_log')) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  let didBlockAuthOnSchema = false;
  try {
    await app.activatePostgresAuthoritativeMode();
  } catch (err) {
    didBlockAuthOnSchema = true;
    assert(err.message.includes('Required schema tables missing'), 'Activation fails when tables are missing');
  }
  assert(didBlockAuthOnSchema === true, 'CRITICAL: Authoritative mode strictly blocked on schema incompatibility');

  // Test 3: Authoritative mode activation SUCCEEDS when all 14 gates pass
  // Mock successful database responses across all probes and queries
  const mockTableData = {
    programmes: [{ id: 'PRG-001', name: 'Executive Masterclass', price: 250000, tenant_id: 'clasptek_main' }],
    customers: [{ id: 'CUST-001', name: 'Dr. Alabi', outstandingBalance: 0, balance: 0, tenant_id: 'clasptek_main' }],
    invoices: [{ id: 'INV-001', invoiceNo: 11092041, customerId: 'CUST-001', programmeId: 'PRG-001', total: 250000, grandTotal: 250000, balanceDue: 0, balance: 0, status: 'paid', tenant_id: 'clasptek_main' }],
    payments: [{ id: 'PAY-001', paymentNo: 20001, invoiceId: 'INV-001', amount: 250000, amountPaid: 250000, tenant_id: 'clasptek_main' }],
    personnel: [{ id: 'EMP-001', name: 'Mary Okonjo', basicPay: 200000, status: 'active', tenant_id: 'clasptek_main' }],
    payslips: [{ id: 'PSL-001', employeeId: 'EMP-001', basicSalary: 200000, allowancesTotal: 0, deductionsTotal: 0, netPay: 200000, netSalary: 200000, status: 'paid', tenant_id: 'clasptek_main' }],
    finance_settings: [{ id: 'fs_001', companyName: 'CLASPTEK' }],
    payment_accounts: [{ id: 'acc_001', accountName: 'Main Operations' }],
    expenses: [{ id: 'EXP-001', amount: 200000, description: 'Payroll expense', categoryGroup: 'Staff & People', category: 'Staff Salaries', tenant_id: 'clasptek_main' }]
  };

  // Seed state with matching balanced data
  app.state.programmes = mockTableData.programmes;
  app.state.customers = mockTableData.customers;
  app.state.invoices = mockTableData.invoices;
  app.state.payments = mockTableData.payments;
  app.state.personnel = mockTableData.personnel;
  app.state.payslips = mockTableData.payslips;
  app.state.expenses = mockTableData.expenses;
  app.state.directIncome = [];
  app.state.enquiries = [];
  app.state.enrolments = [];

  // Sync harness storage to match database rows exactly
  Object.keys(harness.storage).forEach(k => delete harness.storage[k]);
  harness.storage['clasptek:programmes'] = JSON.stringify(mockTableData.programmes);
  harness.storage['clasptek:customers'] = JSON.stringify(mockTableData.customers);
  harness.storage['clasptek:invoices'] = JSON.stringify(mockTableData.invoices);
  harness.storage['clasptek:payments'] = JSON.stringify(mockTableData.payments);
  harness.storage['clasptek:personnel'] = JSON.stringify(mockTableData.personnel);
  harness.storage['clasptek:payslips'] = JSON.stringify(mockTableData.payslips);
  harness.storage['clasptek:expenses'] = JSON.stringify(mockTableData.expenses);
  harness.storage['clasptek:finance_settings'] = JSON.stringify(mockTableData.finance_settings);
  harness.storage['clasptek:payment_accounts'] = JSON.stringify(mockTableData.payment_accounts);

  currentFetchHandler = async (url, opts = {}) => {
    for (const [tbl, rows] of Object.entries(mockTableData)) {
      if (url.includes(`/${tbl}`)) {
        return { ok: true, status: 200, json: async () => rows };
      }
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const authActivation = await app.activatePostgresAuthoritativeMode();
  assert(authActivation.success === true, 'Activation passes when all 14 gates are satisfied');
  assert(authActivation.authorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'State is AUTHORITATIVE');
  assert(authActivation.gates.supabaseConfigured === true, 'Gate 1: Supabase configured');
  assert(authActivation.gates.projectIdentityVerified === true, 'Gate 2: Project identity verified');
  assert(authActivation.gates.authenticatedSessionValid === true, 'Gate 3: Session valid');
  assert(authActivation.gates.postgreSqlReachable === true, 'Gate 4: PostgreSQL reachable');
  assert(authActivation.gates.postgrestReachable === true, 'Gate 5: PostgREST reachable');
  assert(authActivation.gates.requiredSchemaPresent === true, 'Gate 6: 33 tables present');
  assert(authActivation.gates.rlsVerified === true, 'Gate 7: RLS verified');
  assert(authActivation.gates.legacyInventoryCompleted === true, 'Gate 8: Legacy inventory completed');
  assert(authActivation.gates.migrationCompleted === true, 'Gate 9: Migration completed');
  assert(authActivation.gates.readBackCompleted === true, 'Gate 10: Read-back completed');
  assert(authActivation.gates.reconciliation100Percent === true, 'Gate 11: Reconciliation is 100%');
  assert(authActivation.gates.noCriticalOrphans === true, 'Gate 12: Zero critical orphans');
  assert(authActivation.gates.financialArithmeticVerified === true, 'Gate 13: Financial balance equations balanced');
  assert(authActivation.gates.idempotencyAndSecurityPassed === true, 'Gate 14: Idempotency & security scan passed');

  // ---------------------------------------------------------------------------
  // CATEGORY 10: UI, KPI SAFETY FALLBACK & BANNER MATRIX
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 10: UI, KPI Safety Fallback & Banner Matrix ---');

  // Verification of KPI Safety Fallback Card
  const dashboardContainer = createMockElement();
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  app.state.invoices = [{ id: 'INV-1', total: 500000, grandTotal: 500000 }];
  app.renderDashboardTab(dashboardContainer);

  const dashHtml = dashboardContainer.innerHTML;
  assert(dashHtml.includes('DATA SOURCE UNAVAILABLE'), 'Renders prominent DATA SOURCE UNAVAILABLE fallback notice on outage');
  assert(dashHtml.includes('PostgreSQL is currently unavailable'), 'Notice warns that PostgreSQL is currently unavailable');
  assert(dashHtml.includes('Displayed figures are from local fallback store and are not authoritative'), 'Notice states displayed figures are from local fallback');
  assert(!dashHtml.includes('₦0.00') || dashHtml.includes('500,000'), 'Dashboard does NOT deceptively display ₦0.00 when local business data exists');

  // Verification of Banner States
  const mainContainer = createMockElement();
  app.state.auth = {
    isAuthenticated: true,
    user: { id: 'usr_admin', name: 'Dr. Test Admin', role: 'Super Admin', status: 'active', tenant_id: 'clasptek_main' }
  };
  app.state.users = [app.state.auth.user];

  // Banner 1: Authentication Failure
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.API_KEY_INVALID;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('POSTGRESQL AUTHENTICATION FAILED — AUTHORITATIVE MODE NOT ACTIVE'), 'Renders POSTGRESQL AUTHENTICATION FAILED banner on API_KEY_INVALID');

  // Banner 2: Disconnected
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.CONNECTIVITY_FAILED;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('POSTGRESQL DISCONNECTED — AUTHORITATIVE MODE NOT ACTIVE'), 'Renders POSTGRESQL DISCONNECTED banner on CONNECTIVITY_FAILED');

  // Banner 3: Migration Required
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.MIGRATION_REQUIRED;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('LOCAL LEGACY DATA DETECTED — MIGRATION REQUIRED'), 'Renders LOCAL LEGACY DATA DETECTED banner');

  // Banner 4: Migration in Progress
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.MIGRATION_IN_PROGRESS;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('PRODUCTION DATA MIGRATION IN PROGRESS — DO NOT CLOSE THIS WINDOW'), 'Renders PRODUCTION DATA MIGRATION IN PROGRESS banner');

  // Banner 5: Reconciliation Failed
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.RECONCILIATION_FAILED;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('PRODUCTION RECONCILIATION FAILED — AUTHORITATIVE MODE BLOCKED'), 'Renders PRODUCTION RECONCILIATION FAILED banner');

  // Banner 6: Authoritative Mode Active
  app.state.databaseAuthorityState = app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE;
  app.render(mainContainer);
  assert(mainContainer.innerHTML.includes('POSTGRESQL AUTHORITATIVE MODE ACTIVE — DATA RECONCILIATION: 100%'), 'Renders POSTGRESQL AUTHORITATIVE MODE ACTIVE banner');

  console.log('\n========================================================================================');
  console.log(` PHASE 15 ACTIVATION CERTIFICATION: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase15ActivationTests().catch(err => {
  console.error('Unhandled error in Phase 15 activation test suite:', err);
  process.exit(1);
});
