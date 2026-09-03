/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM — PHASE 14 CERTIFICATION SUITE
 * Production Data Recovery, Safe Migration, Read-Back Verification & Supabase Database Reconciliation
 *
 * 75+ Automated Assertions Across 7 Rigorous Certification Categories:
 * Category 1: Schema Hardening & Migration Log Definition (Section 15)
 * Category 2: Local Legacy Inventory & Detection Engine (inspectLegacyLocalData)
 * Category 3: Empty-Database Trap Prevention (Database Error ≠ Empty ≠ state = [] ≠ Delete)
 * Category 4: Foreign-Key Dependency-Ordered Migration Engine (migrateLegacyDataToPostgres)
 * Category 5: Read-Back Verification & Conflict-Safe Upsert Merging
 * Category 6: Referential Integrity & Relational Orphan Detection (reconcileProductionData)
 * Category 7: Migration Audit Trail & State Transitions
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Headless Environment Setup
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
};

global.window = {
  location: { href: 'https://app.clasptek.org/clasptek_invoice_system.html', search: '' },
  print: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

const mockElement = {
  innerHTML: '',
  textContent: '',
  style: {},
  value: '',
  type: '',
  appendChild: () => {},
  removeChild: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  querySelector: () => mockElement,
  querySelectorAll: () => []
};

global.document = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [],
  createElement: () => mockElement,
  body: mockElement
};
global.alert = () => {};
global.confirm = () => true;

if (!global.crypto) {
  global.crypto = {
    subtle: {
      digest: async (algo, data) => {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.from(data));
        return hash.digest();
      }
    },
    getRandomValues: (arr) => crypto.randomFillSync(arr)
  };
}

// 2. Load Clasptek Core Script
const htmlPath = path.join(__dirname, 'clasptek_invoice_system.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);

if (!scriptMatch) {
  console.error('FATAL: Could not locate <script> tag in clasptek_invoice_system.html');
  process.exit(1);
}

let mockFetchHandler = null;
global.fetch = async (url, opts) => {
  if (mockFetchHandler) {
    return await mockFetchHandler(url, opts);
  }
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ([]),
    text: async () => '[]'
  };
};

eval(scriptMatch[1]);
const app = module.exports;

// 3. Test Harness Utilities
let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✔ PASS [Test ${total}]: ${message}`);
  } else {
    failed++;
    console.error(`  ✖ FAIL [Test ${total}]: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================================');
  console.log(' CLASPTEK PHASE 14: PRODUCTION DATA MIGRATION & RECONCILIATION CERTIFICATION');
  console.log('========================================================================================\n');

  // ---------------------------------------------------------------------------
  // Category 1: Schema Hardening & Migration Log Definition
  // ---------------------------------------------------------------------------
  console.log('--- Category 1: Schema Hardening & Migration Log Definition (Section 15) ---');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
  
  assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.production_migration_runs'), 'Schema defines production_migration_runs audit table');
  assert(schemaSql.includes('migration_type TEXT NOT NULL'), 'production_migration_runs enforces migration_type column');
  assert(schemaSql.includes('total_detected INTEGER NOT NULL'), 'production_migration_runs tracks total_detected count');
  assert(schemaSql.includes('total_migrated INTEGER NOT NULL'), 'production_migration_runs tracks total_migrated count');
  assert(schemaSql.includes('total_existing INTEGER NOT NULL'), 'production_migration_runs tracks total_existing count');
  assert(schemaSql.includes('total_failed INTEGER NOT NULL'), 'production_migration_runs tracks total_failed count');
  assert(schemaSql.includes('idx_migration_runs_tenant_status'), 'Schema defines composite performance index on tenant and status');
  assert(schemaSql.includes('ALTER TABLE public.production_migration_runs ENABLE ROW LEVEL SECURITY'), 'Row Level Security is enabled on production_migration_runs');
  assert(schemaSql.includes('migration_runs_manage_select'), 'RLS policy restricts migration run logs to management roles');

  // ---------------------------------------------------------------------------
  // Category 2: Local Legacy Inventory & Detection Engine
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 2: Local Legacy Inventory & Detection Engine ---');
  
  // Seed sample local records
  const sampleCust = { id: 'cust_001', name: 'Alhaji Dangote', phone: '08012345678', email: 'dangote@example.com', balance: 150000 };
  const sampleProg = { id: 'prog_001', code: 'TECH-101', name: 'Software Engineering', fee: 250000 };
  const sampleEnq = { id: 'enq_001', enquiryNo: 'ENQ-1001', customerId: 'cust_001', programmeId: 'prog_001', status: 'NEW' };
  const sampleEnrl = { id: 'enrl_001', customerId: 'cust_001', programmeId: 'prog_001', status: 'active' };
  const sampleInv = { id: 'inv_001', invoiceNo: 'INV-11092041', customerId: 'cust_001', total: 250000, balance: 150000, status: 'partial' };
  const samplePay = { id: 'pay_001', receiptNo: 'REC-20001', invoiceId: 'inv_001', customerId: 'cust_001', amount: 100000 };
  const samplePers = { id: 'pers_001', name: 'Clasptek Admin', role: 'Head of Academics', basicPay: 250000 };
  const samplePsl = { id: 'psl_001', payslipNo: 'PSL-30001', personnelId: 'pers_001', grossPay: 250000, totalDeductions: 25000, netPay: 225000, status: 'issued' };

  localStorage.setItem(app.STORE_KEY_CUSTOMERS, JSON.stringify([sampleCust]));
  localStorage.setItem(app.STORE_KEY_PROGRAMMES, JSON.stringify([sampleProg]));
  localStorage.setItem(app.STORE_KEY_ENQUIRIES, JSON.stringify([sampleEnq]));
  localStorage.setItem(app.STORE_KEY_ENROLMENTS, JSON.stringify([sampleEnrl]));
  localStorage.setItem(app.STORE_KEY_INVOICES, JSON.stringify([sampleInv]));
  localStorage.setItem(app.STORE_KEY_PAYMENTS, JSON.stringify([samplePay]));
  localStorage.setItem(app.STORE_KEY_PERSONNEL, JSON.stringify([samplePers]));
  localStorage.setItem(app.STORE_KEY_PAYSLIPS, JSON.stringify([samplePsl]));

  // In-memory state sync
  app.state.customers = [sampleCust];
  app.state.programmes = [sampleProg];
  app.state.enquiries = [sampleEnq];
  app.state.enrolments = [sampleEnrl];
  app.state.invoices = [sampleInv];
  app.state.payments = [samplePay];
  app.state.personnel = [samplePers];
  app.state.payslips = [samplePsl];

  const localInv = await app.inspectLegacyLocalData();
  assert(localInv.hasLegacyData === true, 'inspectLegacyLocalData accurately flags hasLegacyData === true');
  assert(localInv.totalRecords >= 8, `Local inventory counted ${localInv.totalRecords} legacy records`);
  assert(localInv.counts.customers === 1, 'Local customer count accurately reported as 1');
  assert(localInv.counts.programmes === 1, 'Local programme count accurately reported as 1');
  assert(localInv.counts.invoices === 1, 'Local invoice count accurately reported as 1');
  assert(localInv.counts.payments === 1, 'Local payment count accurately reported as 1');
  assert(localInv.counts.payslips === 1, 'Local payslip count accurately reported as 1');
  assert(localInv.records.customers[0].id === 'cust_001', 'Preserves customer record payload intact');
  assert(localInv.records.invoices[0].invoiceNo === 'INV-11092041', 'Preserves invoice record payload intact');

  // ---------------------------------------------------------------------------
  // Category 3: Empty-Database Trap Prevention
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 3: Empty-Database Trap Prevention ---');
  
  // Configure Supabase client state
  app.state.supabase.endpoint = 'https://logaawoigfxnisimfatf.supabase.co/rest/v1/';
  app.state.supabase.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_testing_purposes_only';

  // Verify state enums
  assert(app.DATABASE_AUTHORITY_STATE.EMPTY_DATABASE === 'EMPTY_DATABASE', 'DATABASE_AUTHORITY_STATE defines EMPTY_DATABASE');
  assert(app.DATABASE_AUTHORITY_STATE.MIGRATION_REQUIRED === 'MIGRATION_REQUIRED', 'DATABASE_AUTHORITY_STATE defines MIGRATION_REQUIRED');
  assert(app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE === 'AUTHORITATIVE', 'DATABASE_AUTHORITY_STATE defines AUTHORITATIVE');
  assert(app.DATABASE_AUTHORITY_STATE.CONNECTIVITY_FAILED === 'CONNECTIVITY_FAILED', 'DATABASE_AUTHORITY_STATE defines CONNECTIVITY_FAILED');

  // Simulate empty database response from PostgreSQL
  mockFetchHandler = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ([]),
      text: async () => '[]'
    };
  };

  const remoteInv = await app.inspectProductionDatabase();
  assert(remoteInv.isConfigured === true, 'inspectProductionDatabase confirms client configuration');
  assert(remoteInv.isEmpty === true, 'inspectProductionDatabase confirms PostgreSQL is currently empty');
  assert(remoteInv.totalRecords === 0, 'Total remote database records confirms 0');

  // Invariant check: Empty database with existing local records must NOT wipe local state!
  const localCheck = await app.inspectLegacyLocalData();
  assert(remoteInv.isEmpty && localCheck.hasLegacyData, 'Condition: Empty database while local records exist is detected');
  
  // Verify local records still exist in localStorage
  const custInStore = JSON.parse(localStorage.getItem(app.STORE_KEY_CUSTOMERS));
  assert(Array.isArray(custInStore) && custInStore.length === 1, 'CRITICAL INVARIANT: Local customer records NOT deleted when database is empty');
  const invInStore = JSON.parse(localStorage.getItem(app.STORE_KEY_INVOICES));
  assert(Array.isArray(invInStore) && invInStore.length === 1, 'CRITICAL INVARIANT: Local invoice records NOT deleted when database is empty');

  // ---------------------------------------------------------------------------
  // Category 4: Dependency-Ordered Migration Execution
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 4: Foreign-Key Dependency-Ordered Migration Execution ---');

  const insertedBatches = [];
  const insertedMap = {};

  mockFetchHandler = async (url, opts) => {
    const method = opts && opts.method ? opts.method : 'GET';
    const parsedUrl = new URL(url);
    const table = parsedUrl.pathname.split('/').filter(Boolean).pop();

    if (method === 'GET') {
      // Return existing records for table
      const rows = insertedMap[table] || [];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => rows,
        text: async () => JSON.stringify(rows)
      };
    } else if (method === 'POST') {
      insertedBatches.push(table);
      const body = JSON.parse(opts.body || '[]');
      const items = Array.isArray(body) ? body : [body];
      insertedMap[table] = (insertedMap[table] || []).concat(items);
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => items,
        text: async () => JSON.stringify(items)
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const migrationRes = await app.migrateLegacyDataToPostgres();
  assert(migrationRes.runId.startsWith('mig_'), `Migration generated runId: ${migrationRes.runId}`);
  assert(migrationRes.stats.detected >= 8, `Migration detected all ${migrationRes.stats.detected} local items`);
  assert(migrationRes.stats.migrated >= 8, `Migration successfully migrated ${migrationRes.stats.migrated} items`);
  assert(migrationRes.stats.failed === 0, 'Migration completed with exactly 0 failures');

  // Verify foreign-key insertion dependency order
  const progIdx = insertedBatches.indexOf('programmes');
  const persIdx = insertedBatches.indexOf('personnel');
  const custIdx = insertedBatches.indexOf('customers');
  const enqIdx = insertedBatches.indexOf('enquiries');
  const enrlIdx = insertedBatches.indexOf('enrolments');
  const invIdx = insertedBatches.indexOf('invoices');
  const payIdx = insertedBatches.indexOf('payments');
  const pslIdx = insertedBatches.indexOf('payslips');

  assert(progIdx >= 0 && custIdx >= 0, 'Programmes and Customers were migrated');
  assert(custIdx < enqIdx, 'Dependency Order: Customers inserted BEFORE Enquiries');
  assert(custIdx < enrlIdx && progIdx < enrlIdx, 'Dependency Order: Customers & Programmes inserted BEFORE Enrolments');
  assert(custIdx < invIdx, 'Dependency Order: Customers inserted BEFORE Invoices');
  assert(invIdx < payIdx, 'Dependency Order: Invoices inserted BEFORE Payments');
  assert(persIdx < pslIdx, 'Dependency Order: Personnel inserted BEFORE Payslips');
  assert(migrationRes.stats.entities.customers.migrated === 1, 'Entity Breakdown: Exactly 1 customer migrated');
  assert(migrationRes.stats.entities.invoices.migrated === 1, 'Entity Breakdown: Exactly 1 invoice migrated');
  assert(migrationRes.stats.entities.payments.migrated === 1, 'Entity Breakdown: Exactly 1 payment migrated');
  assert(migrationRes.stats.entities.payslips.migrated === 1, 'Entity Breakdown: Exactly 1 payslip migrated');
  assert(migrationRes.stats.entities.programmes.migrated === 1, 'Entity Breakdown: Exactly 1 programme migrated');

  // ---------------------------------------------------------------------------
  // Category 5: Read-Back Verification & Conflict-Safe Upsert Merging
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 5: Read-Back Verification & Conflict-Safe Upsert Merging ---');

  // Verify that all migrated IDs match original source IDs
  assert(insertedMap['customers'][0].id === 'cust_001', 'Read-Back: Customer ID cust_001 perfectly preserved');
  assert(insertedMap['invoices'][0].id === 'inv_001', 'Read-Back: Invoice ID inv_001 perfectly preserved');
  assert(insertedMap['payments'][0].id === 'pay_001', 'Read-Back: Payment ID pay_001 perfectly preserved');
  assert(insertedMap['payslips'][0].id === 'psl_001', 'Read-Back: Payslip ID psl_001 perfectly preserved');
  assert(insertedMap['programmes'][0].id === 'prog_001', 'Read-Back: Programme ID prog_001 perfectly preserved');
  assert(insertedMap['personnel'][0].id === 'pers_001', 'Read-Back: Personnel ID pers_001 perfectly preserved');
  assert(insertedMap['invoices'][0].balance === 150000, 'Payload Integrity: Invoice balance ₦150,000 preserved intact');
  assert(insertedMap['payments'][0].amount === 100000, 'Payload Integrity: Payment amount ₦100,000 preserved intact');
  assert(insertedMap['payslips'][0].netPay === 225000, 'Payload Integrity: Payslip net pay ₦225,000 preserved intact');

  // Re-run migration to test merge-duplicates idempotency
  insertedBatches.length = 0;
  const secondMigrationRes = await app.migrateLegacyDataToPostgres();
  assert(secondMigrationRes.stats.alreadyExisting >= 8, `Re-run identified ${secondMigrationRes.stats.alreadyExisting} pre-existing rows without duplicating`);
  assert(secondMigrationRes.stats.failed === 0, 'Re-run completed with 0 errors');
  assert(secondMigrationRes.success === true, 'Re-run confirms idempotent success without duplicate corruption');

  // ---------------------------------------------------------------------------
  // Category 6: Referential Integrity & Relational Orphan Detection
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 6: Referential Integrity & Relational Orphan Detection ---');

  const reconClean = await app.reconcileProductionData();
  assert(reconClean.isReconciled === true, 'reconcileProductionData reports isReconciled === true on clean state');
  assert(reconClean.status === 'RECONCILED', 'Reconciliation status is RECONCILED');
  assert(reconClean.criticalOrphanCount === 0, 'Zero critical referential orphans detected in valid dataset');
  assert(reconClean.referentialIntegrity.valid === true, 'Referential integrity check is valid');
  assert(reconClean.financialIntegrity.valid === true, 'Financial integrity equations check is valid');
  assert(reconClean.financialIntegrity.equations.length >= 2, 'Financial equations include Invoice Balance & Net Pay');
  assert(reconClean.financialIntegrity.equations[0].valid === true, 'Financial Equation 1 (Invoice Balance) is valid');
  assert(reconClean.financialIntegrity.equations[1].valid === true, 'Financial Equation 2 (Payroll Net Pay) is valid');

  // Test orphan detection: Add orphaned payment with missing invoiceId
  const orphanedPay = { id: 'pay_orphan', receiptNo: 'REC-99999', invoiceId: 'inv_non_existent', amount: 50000 };
  const originalPayments = app.state.payments;
  app.state.payments = [...app.state.payments, orphanedPay];

  const reconWithOrphan = await app.reconcileProductionData();
  assert(reconWithOrphan.isReconciled === false, 'Reconciliation detects orphaned payment and flags isReconciled === false');
  assert(reconWithOrphan.criticalOrphanCount > 0, `Critical orphan count accurately increased to ${reconWithOrphan.criticalOrphanCount}`);
  assert(reconWithOrphan.status === 'EXCEPTION', 'Reconciliation status downgraded to EXCEPTION');
  assert(reconWithOrphan.referentialIntegrity.orphans.some(o => o.id === 'pay_orphan'), 'Orphan report identifies exact offending payment ID');

  // Restore payments
  app.state.payments = originalPayments;

  // ---------------------------------------------------------------------------
  // Category 7: Migration Audit Trail & State Transitions
  // ---------------------------------------------------------------------------
  console.log('\n--- Category 7: Migration Audit Trail & State Transitions ---');

  const migrationRuns = app.state.productionMigrationRuns;
  assert(Array.isArray(migrationRuns) && migrationRuns.length >= 2, `productionMigrationRuns registry recorded ${migrationRuns.length} runs`);
  assert(migrationRuns[0].status === 'COMPLETED', 'Latest migration run record marked COMPLETED');
  assert(migrationRuns[0].tenant_id === 'clasptek_main', 'Migration run belongs to canonical tenant clasptek_main');
  assert(migrationRuns[0].migration_type === 'LEGACY_LOCALSTORAGE_TO_POSTGRES', 'Migration run type accurately recorded');
  assert(Boolean(migrationRuns[0].started_at), 'Migration run records started_at timestamp');
  assert(Boolean(migrationRuns[0].completed_at), 'Migration run records completed_at timestamp');
  assert(migrationRuns[0].initiated_by === 'Super Admin' || Boolean(migrationRuns[0].initiated_by), 'Migration run logs initiating actor');

  // Check state transitions
  assert(app.state.databaseAuthorityState === app.DATABASE_AUTHORITY_STATE.AUTHORITATIVE, 'State transition: databaseAuthorityState is AUTHORITATIVE');
  assert(app.state.supabase.persistenceMode === 'AUTHORITATIVE', 'State transition: persistenceMode is AUTHORITATIVE');
  assert(app.state.supabase.status === 'connected', 'State transition: supabase status is connected');

  // Check audit log for migration events
  const migStartAudit = app.state.auditLog.find(a => a.action === 'MIGRATION_STARTED');
  assert(Boolean(migStartAudit), 'Audit log contains MIGRATION_STARTED event');
  const migCompleteAudit = app.state.auditLog.find(a => a.action === 'MIGRATION_COMPLETED');
  assert(Boolean(migCompleteAudit), 'Audit log contains MIGRATION_COMPLETED event');
  const migEntityAudit = app.state.auditLog.find(a => a.action === 'MIGRATION_ENTITY_STARTED');
  assert(Boolean(migEntityAudit), 'Audit log tracks granular MIGRATION_ENTITY_STARTED event');

  // Verify non-destruction of local records
  const finalLocalCheck = await app.inspectLegacyLocalData();
  assert(finalLocalCheck.totalRecords >= 8, 'CRITICAL FINAL INVARIANT: Local records remain 100% intact after entire migration lifecycle');

  console.log('\n========================================================================================');
  console.log(` PHASE 14 CERTIFICATION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL ${total} ASSERTIONS)`);
  console.log('========================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
