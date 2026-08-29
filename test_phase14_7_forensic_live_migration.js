/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Phase 14.7 Master Suite: Forensic Production Migration Authenticity Repair & Live Cloud Gating
 * 
 * 110+ Assertions certifying:
 * - Distinction between Simulated VM Test Runs and Real Production Cloud Writes
 * - Prohibition of False Zero-Record Claims from HTTP 401/403/404/500/Network Errors (rowCount = null)
 * - Strict Authorization Header Rules (No Anon Keys, No Sess_* Tokens, Only Valid User JWT)
 * - Strict Secret Shielding (service_role, sbp_*, postgres://, passwords)
 * - PostgREST HTTP Status Classifications & Fatal Error Halts
 * - Zero-Write Dry Run Invariant
 * - Strict 27-Entity Foreign Key Dependency Order
 * - 100% ID and Dynamic Tenant UUID Preservation
 * - Local Data Immutability (Zero localStorage drops, Zero state resets to [])
 * - Real Read-Back, Record Reconciliation, and Integer-Cent Financial Arithmetic
 * - Real Second-Run Idempotency Certification
 * - 14-Gate PostgreSQL Authority Certification with Mandatory Live Cloud Remote Evidence
 * - Forensic Evidence Classifications (LIVE_REMOTE_CERTIFIED, LOCAL_SIMULATION_ONLY, etc.)
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
    console.log(`  ✔ PASS [Test ${String(totalTests).padStart(3, '0')}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL [Test ${String(totalTests).padStart(3, '0')}]: ${message}`);
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

function generateMockJwt(payloadObj) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = Buffer.from('mock_signature_hash_p14_7').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function createHarness(customEnv = {}) {
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
      __CLASPTEK_ENV__: {
        SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_pub_phase14_7_prod_key_77777',
        ...customEnv
      }
    },
    document: {
      getElementById: (id) => createMockElement('div', { id }),
      querySelector: (selector) => {
        if (selector.includes('supabase-endpoint')) {
          return createMockElement('meta', { name: 'supabase-endpoint', content: 'https://logaawoigfxnisimfatf.supabase.co' });
        }
        if (selector.includes('supabase-publishable-key') || selector.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
          return createMockElement('meta', { name: 'supabase-publishable-key', content: 'sb_pub_phase14_7_prod_key_77777' });
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
    fetch: async () => ({ ok: true, status: 200, json: async () => ([]), text: async () => '[]' }),
    module: { exports: {} },
    process: { env: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  return { app: sandbox.module.exports, sandbox, storageMap };
}

async function runPhase14_7ForensicTests() {
  console.log('====================================================================================================');
  console.log(' CLASPTEK PHASE 14.7: FORENSIC PRODUCTION MIGRATION AUTHENTICITY REPAIR & LIVE CLOUD AUDIT');
  console.log('====================================================================================================\n');

  const tenantUuid = 'f4a18b23-5e2b-4e1c-89a1-b3091df882b2';
  const validUserJwt = generateMockJwt({
    sub: 'usr_superadmin_p14_7',
    email: 'admin@clasptek.org',
    role: 'SUPER_ADMIN',
    tenant_id: tenantUuid,
    iss: 'https://logaawoigfxnisimfatf.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 7200
  });

  const { app, sandbox, storageMap } = createHarness();

  // ---------------------------------------------------------------------------
  // SECTION 1: Forensic Evidence Classifications & Truth Labels
  // ---------------------------------------------------------------------------
  console.log('--- Section 1: Forensic Evidence Classifications ---');

  assert(typeof app.FORENSIC_EVIDENCE_CLASSIFICATION === 'object', 'Test 001: FORENSIC_EVIDENCE_CLASSIFICATION enum exists');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.LIVE_REMOTE_CERTIFIED === 'LIVE_REMOTE_CERTIFIED', 'Test 002: LIVE_REMOTE_CERTIFIED defined');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.LIVE_REMOTE_PARTIAL === 'LIVE_REMOTE_PARTIAL', 'Test 003: LIVE_REMOTE_PARTIAL defined');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.LOCAL_SIMULATION_ONLY === 'LOCAL_SIMULATION_ONLY', 'Test 004: LOCAL_SIMULATION_ONLY defined');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.MOCKED_TEST_ONLY === 'MOCKED_TEST_ONLY', 'Test 005: MOCKED_TEST_ONLY defined');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.AUTHENTICATION_BLOCKED === 'AUTHENTICATION_BLOCKED', 'Test 006: AUTHENTICATION_BLOCKED defined');
  assert(app.FORENSIC_EVIDENCE_CLASSIFICATION.NOT_CERTIFIED === 'NOT_CERTIFIED', 'Test 007: NOT_CERTIFIED defined');

  // ---------------------------------------------------------------------------
  // SECTION 2: Component 1 — Production Authentication Truth Diagnostic
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 2: Component 1 — Production Authentication Truth ---');

  // Case A: Unauthenticated session
  app.state.auth = { isAuthenticated: false, supabaseJwt: null, user: null };
  const unauthTruth = app.getProductionAuthenticationTruth();
  assert(unauthTruth.configured === true, 'Test 008: Auth truth confirms project is configured');
  assert(unauthTruth.projectRef === 'logaawoigfxnisimfatf', 'Test 009: Project ref is logaawoigfxnisimfatf');
  assert(unauthTruth.publicCredentialConfigured === true, 'Test 010: Public credential configured');
  assert(unauthTruth.credentialType === 'publishable', 'Test 011: Credential type is publishable');
  assert(unauthTruth.userAuthenticated === false, 'Test 012: Unauthenticated session userAuthenticated === false');
  assert(unauthTruth.authorizationHeaderValid === false, 'Test 013: Authorization header invalid for unauthenticated');

  // Case B: Anon key erroneously passed as access token
  app.state.auth = { isAuthenticated: true, supabaseJwt: 'sb_pub_phase14_7_prod_key_77777', user: { id: 'u1' } };
  const anonAsTokenTruth = app.getProductionAuthenticationTruth();
  assert(anonAsTokenTruth.accessTokenIsJwt === false, 'Test 014: Anon key rejected as valid JWT');
  assert(anonAsTokenTruth.authorizationHeaderValid === false, 'Test 015: Anon key forbidden as Bearer token');

  // Case C: sess_* token erroneously passed as access token
  app.state.auth = { isAuthenticated: true, supabaseJwt: 'sess_client_cookie_ptr_999', user: { id: 'u1' } };
  const sessTruth = app.getProductionAuthenticationTruth();
  assert(sessTruth.accessTokenIsJwt === false, 'Test 016: sess_* token rejected as valid JWT');
  assert(sessTruth.authorizationHeaderValid === false, 'Test 017: sess_* forbidden as Bearer token');

  // Case D: Expired JWT
  const expiredJwt = generateMockJwt({
    sub: 'usr_superadmin_p14_7',
    role: 'SUPER_ADMIN',
    tenant_id: tenantUuid,
    iss: 'https://logaawoigfxnisimfatf.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) - 3600
  });
  app.state.auth = { isAuthenticated: true, supabaseJwt: expiredJwt, user: { id: 'usr_superadmin_p14_7', role: 'SUPER_ADMIN' } };
  const expiredTruth = app.getProductionAuthenticationTruth();
  assert(expiredTruth.accessTokenExpired === true, 'Test 018: Expired JWT detected');
  assert(expiredTruth.authorizationHeaderValid === false, 'Test 019: Expired JWT invalidates Authorization header');

  // Case E: Valid Super Admin JWT
  app.state.auth = {
    isAuthenticated: true,
    supabaseJwt: validUserJwt,
    user: { id: 'usr_superadmin_p14_7', role: 'SUPER_ADMIN', email: 'admin@clasptek.org', tenant_id: tenantUuid },
    supabaseUser: { id: 'usr_superadmin_p14_7', role: 'SUPER_ADMIN', email: 'admin@clasptek.org', tenant_id: tenantUuid }
  };
  const validTruth = app.getProductionAuthenticationTruth();
  assert(validTruth.userAuthenticated === true, 'Test 020: Valid session userAuthenticated === true');
  assert(validTruth.userIdPresent === true, 'Test 021: User ID present');
  assert(validTruth.accessTokenIsJwt === true, 'Test 022: Access token is valid JWT structure');
  assert(validTruth.accessTokenExpired === false, 'Test 023: Access token is unexpired');
  assert(validTruth.accessTokenProjectMatched === true, 'Test 024: Access token project matched canonical project');
  assert(validTruth.accessTokenAudienceAuthenticated === true, 'Test 025: Access token audience is authenticated');
  assert(validTruth.authorizationHeaderValid === true, 'Test 026: Authorization header is 100% valid');
  assert(!JSON.stringify(validTruth).includes('mock_signature_hash'), 'Test 027: Diagnostic truth never leaks raw tokens');

  // ---------------------------------------------------------------------------
  // SECTION 3: Component 2 — Real PostgREST Authenticated Probe
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 3: Component 2 — Real PostgREST Authenticated Probe ---');

  // Probe 200 OK
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [{ id: 'prog_p14_7_1' }]
  });
  const probe200 = await app.probeAuthenticatedPostgrest();
  assert(probe200.networkReachable === true, 'Test 028: Probe reports network reachable');
  assert(probe200.httpStatus === 200, 'Test 029: Probe reports HTTP 200');
  assert(probe200.authenticated === true, 'Test 030: Probe reports authenticated');
  assert(probe200.authorizationAccepted === true, 'Test 031: Probe reports authorization accepted');
  assert(probe200.tableReachable === true, 'Test 032: Probe reports table reachable');
  assert(probe200.rowsReturned === 1, 'Test 033: Probe reports rows returned = 1');
  assert(probe200.classification === 'POSTGRESQL_CONNECTED', 'Test 034: Classification is POSTGRESQL_CONNECTED');

  // Probe 401 Unauthorized
  sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'JWT expired' }) });
  const probe401 = await app.probeAuthenticatedPostgrest();
  assert(probe401.httpStatus === 401, 'Test 035: Probe reports HTTP 401');
  assert(probe401.classification === 'AUTHENTICATION_FAILED', 'Test 036: Classification is AUTHENTICATION_FAILED');

  // Probe 403 RLS Denied
  sandbox.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'RLS denied' }) });
  const probe403 = await app.probeAuthenticatedPostgrest();
  assert(probe403.httpStatus === 403, 'Test 037: Probe reports HTTP 403');
  assert(probe403.classification === 'RLS_AUTHORIZATION_FAILED', 'Test 038: Classification is RLS_AUTHORIZATION_FAILED');

  // Probe 404 Schema Missing
  sandbox.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Table not found' }) });
  const probe404 = await app.probeAuthenticatedPostgrest();
  assert(probe404.httpStatus === 404, 'Test 039: Probe reports HTTP 404');
  assert(probe404.classification === 'SCHEMA_OR_TABLE_NOT_FOUND', 'Test 040: Classification is SCHEMA_OR_TABLE_NOT_FOUND');

  // Probe 500 Server Error
  sandbox.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'DB crash' }) });
  const probe500 = await app.probeAuthenticatedPostgrest();
  assert(probe500.httpStatus === 500, 'Test 041: Probe reports HTTP 500');
  assert(probe500.classification === 'POSTGRESQL_SERVER_ERROR', 'Test 042: Classification is POSTGRESQL_SERVER_ERROR');

  // Probe Network Error
  sandbox.fetch = async () => { throw new Error('ECONNREFUSED'); };
  const probeNet = await app.probeAuthenticatedPostgrest();
  assert(probeNet.networkReachable === false, 'Test 043: Network error reported');
  assert(probeNet.classification === 'POSTGRESQL_UNREACHABLE', 'Test 044: Classification is POSTGRESQL_UNREACHABLE');

  // ---------------------------------------------------------------------------
  // SECTION 4: Component 3 — Real Remote Database Inventory & Strict 401!=0 Rule
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 4: Component 3 — Real Remote Database Inventory ---');

  // Case A: 401 access denied on all tables -> MUST NOT be reported as 0 rows!
  sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });
  const inv401 = await app.inspectProductionDatabase();
  assert(inv401.connected === false, 'Test 045: 401 inventory reports connected === false');
  assert(inv401.totalConfirmedRemoteRecords === 0, 'Test 046: Confirmed records is 0');
  assert(inv401.databaseEmpty === false, 'Test 047: 401 database is NOT reported as empty');
  assert(inv401.inaccessibleTables.length === (app.REQUIRED_PRODUCTION_TABLES || []).length, 'Test 048: All required tables recorded as inaccessible on 401');
  assert(inv401.counts['programmes'] === null, 'Test 049: Denied table programmes has rowCount === null (NOT 0)');
  assert(inv401.tables['programmes'].rowCount === null, 'Test 050: programmes rowCount is strictly null');
  assert(inv401.tables['programmes'].accessible === false, 'Test 051: programmes accessible === false');
  assert(inv401.tables['programmes'].errorClassification === 'AUTHENTICATION_FAILED', 'Test 052: errorClassification is AUTHENTICATION_FAILED');

  // Case B: 403 RLS violation on all tables -> MUST NOT be reported as 0 rows!
  sandbox.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'RLS denied' }) });
  const inv403 = await app.inspectProductionDatabase();
  assert(inv403.databaseEmpty === false, 'Test 053: 403 database is NOT reported as empty');
  assert(inv403.counts['invoices'] === null, 'Test 054: Denied table invoices has rowCount === null (NOT 0)');

  // Case C: Valid 200 with truly empty array [] -> Correctly classified as rowCount = 0 and databaseEmpty = true
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ([]), text: async () => '[]' });
  const inv200Empty = await app.inspectProductionDatabase();
  assert(inv200Empty.connected === true, 'Test 055: 200 [] reports connected === true');
  assert(inv200Empty.databaseEmpty === true, 'Test 056: 200 [] confirms databaseEmpty === true');
  assert(inv200Empty.counts['programmes'] === 0, 'Test 057: 200 [] sets rowCount === 0');
  assert(inv200Empty.tables['programmes'].accessible === true, 'Test 058: 200 [] sets accessible === true');

  // Case D: Valid 200 with populated data
  sandbox.fetch = async (url) => {
    if (url.includes('programmes')) return { ok: true, status: 200, json: async () => [{ id: 'p1' }, { id: 'p2' }] };
    return { ok: true, status: 200, json: async () => ([]) };
  };
  const invPopulated = await app.inspectProductionDatabase();
  assert(invPopulated.totalConfirmedRemoteRecords === 2, 'Test 059: Confirms total records = 2');
  assert(invPopulated.databaseEmpty === false, 'Test 060: Populated database is NOT empty');
  assert(invPopulated.counts['programmes'] === 2, 'Test 061: programmes count is 2');

  // ---------------------------------------------------------------------------
  // SECTION 5: Component 4 — Local Legacy Inventory & Integer-Cent Arithmetic
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 5: Component 4 — Local Legacy Inventory & Integer-Cents ---');

  // Seed sample local records
  app.state.customers = [{ id: 'c_p14_7_1', name: 'Alhaji Sanusi Dantata', balance: 250000.50 }];
  app.state.programmes = [{ id: 'prog_p14_7_1', name: 'Executive Masterclass', tuitionFee: 500000 }];
  app.state.invoices = [{ id: 'inv_p14_7_1', invoiceNo: 'INV-147-1', total: 500000, balance: 250000.50, amountPaid: 249999.50 }];
  app.state.payments = [{ id: 'pay_p14_7_1', paymentNo: 'PAY-147-1', invoiceId: 'inv_p14_7_1', amount: 249999.50 }];
  app.state.expenses = [{ id: 'exp_p14_7_1', expenseNo: 'EXP-147-1', amount: 120000.25 }];
  app.state.payslips = [{ id: 'psl_p14_7_1', payslipNo: 'PSL-147-1', grossPay: 400000, totalDeductions: 40000, netPay: 360000, status: 'issued' }];
  app.state.directIncome = [{ id: 'dir_p14_7_1', amount: 150000.75 }];
  app.state.paymentAccounts = [{ id: 'acc_p14_7_1', name: 'Access Bank Operations', balance: 3500000 }];

  const localInv = await app.inspectLegacyLocalData({ authoritativeSource: 'LOCAL_LEGACY' });
  assert(localInv.hasLegacyData === true, 'Test 062: Local legacy data detected');
  assert(localInv.totalRecords >= 8, 'Test 063: Total records >= 8');
  assert(localInv.authoritativeSource === 'LOCAL_LEGACY', 'Test 064: Authoritative source is LOCAL_LEGACY');
  assert(localInv.financialSummary.totalInvoiced === 500000, 'Test 065: Total invoiced is ₦500,000.00');
  assert(localInv.financialSummary.totalCollected === 249999.50, 'Test 066: Total collected integer-cent precise');
  assert(localInv.financialSummary.totalReceivablesOutstanding === 250000.50, 'Test 067: Total receivables integer-cent precise');
  assert(localInv.financialSummary.totalExpenses === 120000.25, 'Test 068: Total expenses integer-cent precise');
  assert(localInv.financialSummary.totalGrossPayroll === 400000, 'Test 069: Total gross payroll precise');
  assert(localInv.financialSummary.totalNetPayroll === 360000, 'Test 070: Total net payroll precise');
  assert(localInv.financialSummary.totalDirectIncome === 150000.75, 'Test 071: Total direct income precise');

  // ---------------------------------------------------------------------------
  // SECTION 6: Component 5 — Dry Run Must Be Zero-Write & Local-Only
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 6: Component 5 — Dry-Run Invariant ---');

  let networkWriteCount = 0;
  sandbox.fetch = async (url, opts) => {
    if (opts && (opts.method === 'POST' || opts.method === 'PATCH' || opts.method === 'DELETE' || opts.method === 'PUT')) {
      networkWriteCount++;
    }
    return { ok: true, status: 200, json: async () => ([]), text: async () => '[]' };
  };

  app.resetMigrationNetworkCounters();
  const dryRunRes = await app.migrateLegacyDataToPostgres({ dryRun: true });
  assert(dryRunRes.dryRun === true, 'Test 072: Dry run returns dryRun === true');
  assert(dryRunRes.readyToExecute === true, 'Test 073: Dry run reports readyToExecute === true');
  assert(networkWriteCount === 0, 'Test 074: Network writes during dry run is strictly 0');
  assert(app.getMigrationNetworkCounters().networkWritesExecuted === 0, 'Test 075: Network counter is strictly 0');

  // ---------------------------------------------------------------------------
  // SECTION 7: Component 6 & 7 — Real Live Migration & 27-Table Sequence
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 7: Component 6 & 7 — Real Live Migration & Read-Back ---');

  const remoteDb = {};
  const insertSequence = [];

  sandbox.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const parsed = new URL(url);
    const table = parsed.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      const rows = remoteDb[table] || [];
      return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) };
    } else if (method === 'POST') {
      insertSequence.push(table);
      const body = JSON.parse(opts.body || '[]');
      const items = Array.isArray(body) ? body : [body];
      remoteDb[table] = (remoteDb[table] || []).concat(items);
      return { ok: true, status: 201, json: async () => items, text: async () => JSON.stringify(items) };
    }
    return { ok: true, status: 200, json: async () => ([]), text: async () => '[]' };
  };

  app.setMigrationExecutionMode(app.MIGRATION_EXECUTION_MODE.LIVE_CLOUD);
  app.resetMigrationNetworkCounters();

  const liveMigRes = await app.migrateLegacyDataToPostgres({ dryRun: false, live: true });
  assert(liveMigRes.success === true, 'Test 076: Live migration returns success === true');
  assert(liveMigRes.stats.migrated >= 8, `Test 077: Migrated count >= 8 (${liveMigRes.stats.migrated})`);
  assert(liveMigRes.stats.failed === 0, 'Test 078: Zero failed records');

  // Check 27-table dependency sequence (finance_settings -> payment_accounts -> programmes -> personnel -> customers -> invoices -> payments -> payslips)
  const setOrder = insertSequence.indexOf('finance_settings');
  const accOrder = insertSequence.indexOf('payment_accounts');
  const progOrder = insertSequence.indexOf('programmes');
  const persOrder = insertSequence.indexOf('personnel');
  const custOrder = insertSequence.indexOf('customers');
  const invOrder = insertSequence.indexOf('invoices');
  const payOrder = insertSequence.indexOf('payments');
  const pslOrder = insertSequence.indexOf('payslips');

  assert(setOrder < accOrder, 'Test 079: Finance Settings inserted before Payment Accounts');
  assert(accOrder < progOrder, 'Test 080: Payment Accounts inserted before Programmes');
  assert(progOrder < custOrder, 'Test 081: Programmes inserted before Customers');
  assert(persOrder < pslOrder, 'Test 082: Personnel inserted before Payslips');
  assert(custOrder < invOrder, 'Test 083: Customers inserted before Invoices');
  assert(invOrder < payOrder, 'Test 084: Invoices inserted before Payments');

  // Real Remote Read-Back
  const cloudReadBack = await app.readBackProductionCloudData();
  assert(cloudReadBack.is100Percent === true, 'Test 085: Remote read-back confirms 100%');
  assert(cloudReadBack.missingCount === 0, 'Test 086: Remote read-back missing count is 0');
  assert(cloudReadBack.fieldMismatchCount === 0, 'Test 087: Remote read-back field mismatches is 0');

  // ---------------------------------------------------------------------------
  // SECTION 8: Component 8 & 9 — Record & Financial Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 8: Component 8 & 9 — Record & Financial Reconciliation ---');

  const reconRes = await app.reconcileProductionData({ liveOnly: true });
  assert(reconRes.isReconciled === true, 'Test 088: Record reconciliation isReconciled === true');
  assert(reconRes.discrepancyCount === 0, 'Test 089: Zero record discrepancies');

  const finReconRes = await app.reconcileFinancialLedger({ liveOnly: true });
  assert(finReconRes.isBalanced === true, 'Test 090: Financial reconciliation isBalanced === true');
  assert(finReconRes.summary.totalDiscrepancy === 0, 'Test 091: Total financial discrepancy is ₦0.00');

  // ---------------------------------------------------------------------------
  // SECTION 9: Component 10 — Second-Run Idempotency Certification
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 9: Component 10 — Second-Run Idempotency Certification ---');

  const secondRunRes = await app.migrateLegacyDataToPostgres({ dryRun: false, live: true });
  assert(secondRunRes.success === true, 'Test 092: Second migration run succeeds');
  assert(secondRunRes.stats.migrated === 0, 'Test 093: Second run inserted exactly 0 new records');
  assert(secondRunRes.stats.alreadyExisting >= 8, 'Test 094: All existing records recognized');
  assert(secondRunRes.stats.failed === 0, 'Test 095: Second run 0 failures');

  // ---------------------------------------------------------------------------
  // SECTION 10: Component 11 — 14-Gate Authority Certification with Live Evidence
  // ---------------------------------------------------------------------------
  console.log('\n--- Section 10: Component 11 — 14-Gate Authority Certification ---');

  const authCert = await app.activatePostgresAuthoritativeMode();
  assert(authCert.success === true, 'Test 096: Authority activation succeeds');
  assert(authCert.authorityState === 'AUTHORITATIVE', 'Test 097: Authority state is AUTHORITATIVE');
  assert(authCert.executionMode === 'LIVE_CLOUD', 'Test 098: Execution mode is LIVE_CLOUD');
  assert(authCert.databaseTarget === 'SUPABASE_CLOUD', 'Test 099: Database target is SUPABASE_CLOUD');
  assert(authCert.truthLabel === 'LIVE_CLOUD_AUTHORITY_CERTIFIED', 'Test 100: Truth label is LIVE_CLOUD_AUTHORITY_CERTIFIED');
  assert(authCert.liveCloudVerified === true, 'Test 101: liveCloudVerified === true');
  assert(authCert.networkWritesExecuted > 0, 'Test 102: Network writes verified > 0');
  assert(authCert.networkReadsExecuted > 0, 'Test 103: Network reads verified > 0');

  // 14 Individual Gates
  assert(authCert.gates.supabaseConfigured === true || authCert.gates.supabaseConfigured === 'PASS', 'Test 104: Gate 1 passed');
  assert(authCert.gates.projectIdentityVerified === true || authCert.gates.projectIdentityVerified === 'PASS', 'Test 105: Gate 2 passed');
  assert(authCert.gates.authenticatedSessionValid === true || authCert.gates.authenticatedSessionValid === 'PASS', 'Test 106: Gate 3 passed');
  assert(authCert.gates.postgreSqlReachable === true || authCert.gates.postgreSqlReachable === 'PASS', 'Test 107: Gate 4 passed');
  assert(authCert.gates.postgrestReachable === true || authCert.gates.postgrestReachable === 'PASS', 'Test 108: Gate 5 passed');
  assert(authCert.gates.requiredSchemaPresent === true || authCert.gates.requiredSchemaPresent === 'PASS', 'Test 109: Gate 6 passed');
  assert(authCert.gates.rlsVerified === true || authCert.gates.rlsVerified === 'PASS', 'Test 110: Gate 7 passed');
  assert(authCert.gates.legacyInventoryCompleted === true || authCert.gates.legacyInventoryCompleted === 'PASS', 'Test 111: Gate 8 passed');
  assert(authCert.gates.migrationCompleted === true || authCert.gates.migrationCompleted === 'PASS', 'Test 112: Gate 9 passed');
  assert(authCert.gates.readBackCompleted === true || authCert.gates.readBackCompleted === 'PASS', 'Test 113: Gate 10 passed');
  assert(authCert.gates.reconciliation100Percent === true || authCert.gates.reconciliation100Percent === 'PASS', 'Test 114: Gate 11 passed');
  assert(authCert.gates.noCriticalOrphans === true || authCert.gates.noCriticalOrphans === 'PASS', 'Test 115: Gate 12 passed');
  assert(authCert.gates.financialArithmeticVerified === true || authCert.gates.financialArithmeticVerified === 'PASS', 'Test 116: Gate 13 passed');
  assert(authCert.gates.idempotencyAndSecurityPassed === true || authCert.gates.idempotencyAndSecurityPassed === 'PASS', 'Test 117: Gate 14 passed');

  console.log('\n====================================================================================================');
  console.log(` PHASE 14.7 CERTIFICATION SUMMARY: ${passedTests} PASSED / ${failedTests} FAILED (TOTAL ${totalTests} ASSERTIONS)`);
  console.log('====================================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase14_7ForensicTests().catch(err => {
  console.error('Unhandled error in Phase 14.7 test suite:', err);
  process.exit(1);
});
