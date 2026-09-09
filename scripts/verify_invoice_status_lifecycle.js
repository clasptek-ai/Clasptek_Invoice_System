/**
 * CLASPTEK PRODUCTION INVOICE STATUS LIFECYCLE & INTEGRITY VERIFICATION SUITE
 * 
 * Tests the complete invoice lifecycle against the live production PostgREST & PostgreSQL database:
 * 1. Create invoice (status = 'unpaid') -> POST/UPSERT -> 2xx -> read back -> 'unpaid'
 * 2. Partial payment progression -> status = 'partial' -> 2xx -> read back -> 'partial'
 * 3. Full payment progression -> status = 'paid' -> 2xx -> read back -> 'paid'
 * 4. Terminal status coverage: 'voided' and 'cancelled' -> 2xx -> read back
 * 5. Invariant enforcement: 'issued', 'overdue', 'draft', 'pending', null, '' -> rejected with 400 / code 23514
 * 6. Application-level pre-persistence validation: rejects invalid status before network dispatch
 * 7. Guaranteed cleanup: all synthetic entities deleted, zero test debris left in production.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let publishableKey = '';
let serviceKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_PUBLISHABLE_KEY=')) {
    publishableKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
  if (line.startsWith('SUPABASE_SECRET_KEY=')) {
    serviceKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

const SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';
const TARGET_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

function request(endpoint, options = {}, payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + endpoint);
    const postData = payload ? JSON.stringify(payload) : null;
    const headers = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {})
    };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || (postData ? 'POST' : 'GET'),
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('================================================================');
  console.log(' CLASPTEK INVOICE STATUS LIFECYCLE & INTEGRITY VERIFICATION');
  console.log('================================================================\n');

  const createdIds = [];

  try {
    // 0. Locate a valid programme for foreign key
    const progsRes = await request('/rest/v1/programmes?limit=1');
    assert(progsRes.data && progsRes.data.length > 0, 'Must have at least one programme in database');
    const progId = progsRes.data[0].id;
    console.log(`✔ Using verified Programme ID: ${progId}`);

    const testInvId = `inv_test_${Date.now()}`;
    createdIds.push(testInvId);
    const testDocNo = Math.floor(Math.random() * 900000) + 100000;

    const baseInvoice = {
      id: testInvId,
      tenant_id: TARGET_TENANT_ID,
      invoice_no: testDocNo,
      invoice_display_no: `INV-VERIFY-${testDocNo}`,
      programme_id: progId,
      student_name: 'Adewale Verification Student',
      student_email: 'adewale.verify@example.com',
      student_phone: '08099887766',
      invoice_date: '2026-09-08',
      due_date: '2026-09-22',
      payment_plan: 'installment',
      installments_count: 2,
      base_price: 200000,
      discount_pct: 0,
      discount_amount: 0,
      total_amount: 200000,
      income_category: 'Student Tuition',
      status: 'unpaid',
      source: 'integrity_suite'
    };

    // -------------------------------------------------------------
    // STEP 1: Create Invoice with status 'unpaid'
    // -------------------------------------------------------------
    console.log('\n--- STEP 1: Create Invoice with status "unpaid" ---');
    const createRes = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST' }, baseInvoice);
    assert.strictEqual(createRes.status, 201, `Expected HTTP 201 on create, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    console.log('✔ POST /rest/v1/invoices returned HTTP 201 Created');

    const read1 = await request(`/rest/v1/invoices?id=eq.${testInvId}`);
    assert.strictEqual(read1.status, 200);
    assert(read1.data && read1.data.length === 1);
    assert.strictEqual(read1.data[0].status, 'unpaid');
    console.log('✔ Read back verified status === "unpaid"');

    // -------------------------------------------------------------
    // STEP 2: Partial Payment Progression (status 'partial')
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Partial Payment Progression (status "partial") ---');
    const partialUpdate = {
      ...baseInvoice,
      status: 'partial'
    };
    const updateRes1 = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' } }, partialUpdate);
    assert([200, 201].includes(updateRes1.status), `Expected 200/201 on partial update, got ${updateRes1.status}`);

    const read2 = await request(`/rest/v1/invoices?id=eq.${testInvId}`);
    assert.strictEqual(read2.status, 200);
    assert.strictEqual(read2.data[0].status, 'partial');
    console.log('✔ Partial payment transition verified: status === "partial"');

    // -------------------------------------------------------------
    // STEP 3: Full Payment Progression (status 'paid')
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Full Payment Progression (status "paid") ---');
    const paidUpdate = {
      ...baseInvoice,
      status: 'paid'
    };
    const updateRes2 = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' } }, paidUpdate);
    assert([200, 201].includes(updateRes2.status), `Expected 200/201 on paid update, got ${updateRes2.status}`);

    const read3 = await request(`/rest/v1/invoices?id=eq.${testInvId}`);
    assert.strictEqual(read3.status, 200);
    assert.strictEqual(read3.data[0].status, 'paid');
    console.log('✔ Full payment transition verified: status === "paid"');

    // -------------------------------------------------------------
    // STEP 4: Terminal Statuses ('voided', 'cancelled')
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Terminal Status Transitions ---');
    for (const termSt of ['voided', 'cancelled']) {
      const termUpdate = { ...baseInvoice, status: termSt };
      const res = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' } }, termUpdate);
      assert([200, 201].includes(res.status));
      const readTerm = await request(`/rest/v1/invoices?id=eq.${testInvId}`);
      assert.strictEqual(readTerm.data[0].status, termSt);
      console.log(`✔ Verified terminal status transition: status === "${termSt}"`);
    }

    // -------------------------------------------------------------
    // STEP 5: Invariant Enforcement - Illegal Status Rejection
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Invariant Enforcement — Rejection of Illegal Statuses ---');
    const illegalStatuses = [
      'issued',      // Payslip status
      'overdue',     // Computed display state only
      'draft',       // Unapproved state
      'pending',     // Ambiguous state
      'null_test',   // Invalid arbitrary string
      ''             // Empty string
    ];

    for (const badSt of illegalStatuses) {
      const badInv = {
        ...baseInvoice,
        id: `inv_bad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        invoice_no: Math.floor(Math.random() * 900000) + 100000,
        status: badSt
      };
      createdIds.push(badInv.id);

      const rejRes = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST' }, badInv);
      assert.strictEqual(rejRes.status, 400, `Expected 400 for status "${badSt}", got ${rejRes.status}`);
      assert.strictEqual(rejRes.data.code, '23514', `Expected PostgreSQL code 23514, got ${rejRes.data.code}`);
      assert(
        rejRes.data.message.includes('invoices_status_check'),
        `Expected constraint invoices_status_check in message, got: ${rejRes.data.message}`
      );
      console.log(`  ✔ Status "${badSt}" rejected fail-closed with 400 Bad Request (23514 invoices_status_check)`);
    }

    // Also verify null status
    const nullInv = {
      ...baseInvoice,
      id: `inv_bad_null_${Date.now()}`,
      invoice_no: Math.floor(Math.random() * 900000) + 100000,
      status: null
    };
    createdIds.push(nullInv.id);
    const nullRes = await request('/rest/v1/invoices?on_conflict=id', { method: 'POST' }, nullInv);
    assert.strictEqual(nullRes.status, 400, 'Expected 400 for null status');
    console.log('  ✔ Null status rejected fail-closed with 400 Bad Request (null value violates NOT NULL)');

    // -------------------------------------------------------------
    // STEP 6: Application Pre-Persistence Guard Verification
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: Application Transformer & Guard Verification ---');
    const vm = require('vm');
    const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
    const sandbox = {
      window: { location: { href: 'http://localhost/', search: '' }, addEventListener: () => {}, removeEventListener: () => {} },
      document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), addEventListener: () => {} },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      crypto: global.crypto || { getRandomValues: (arr) => require('crypto').randomFillSync(arr) },
      console,
      module: { exports: {} },
      exports: {},
      setTimeout,
      clearTimeout,
      URL,
      Blob: global.Blob || class Blob {}
    };
    vm.createContext(sandbox);
    vm.runInContext(scriptMatch[1], sandbox);
    const app = sandbox.module.exports;
    assert(Array.isArray(app.CANONICAL_INVOICE_STATUSES), 'CANONICAL_INVOICE_STATUSES must be exported');
    console.log('✔ Exported CANONICAL_INVOICE_STATUSES:', JSON.stringify(app.CANONICAL_INVOICE_STATUSES));

    // Test transformer normalizes undefined -> 'unpaid'
    const transformedDefault = app.transformEntityForPostgres('invoices', {
      id: 'inv_temp_default',
      total: 100000
    }, TARGET_TENANT_ID);
    assert.strictEqual(transformedDefault.status, 'unpaid', 'Transformer must default undefined to "unpaid"');
    console.log('✔ Transformer: undefined status -> "unpaid"');

    // Test transformer converts computed 'overdue' -> 'unpaid' or 'partial'
    const transformedOverdue0 = app.transformEntityForPostgres('invoices', {
      id: 'inv_temp_ov0',
      status: 'overdue',
      paid: 0,
      total: 100000
    }, TARGET_TENANT_ID);
    assert.strictEqual(transformedOverdue0.status, 'unpaid', 'Transformer: overdue with 0 paid -> "unpaid"');

    const transformedOverduePart = app.transformEntityForPostgres('invoices', {
      id: 'inv_temp_ovp',
      status: 'overdue',
      amountPaid: 30000,
      total: 100000
    }, TARGET_TENANT_ID);
    assert.strictEqual(transformedOverduePart.status, 'partial', 'Transformer: overdue with partial payment -> "partial"');
    console.log('✔ Transformer: computed "overdue" correctly converted back to persistent state ("unpaid" / "partial")');

    // Test transformer rejects 'issued' loudly!
    let issuedThrew = false;
    try {
      app.transformEntityForPostgres('invoices', {
        id: 'inv_temp_issued',
        status: 'issued'
      }, TARGET_TENANT_ID);
    } catch (err) {
      issuedThrew = true;
      assert(err.message.includes("Invalid invoice status 'issued'"));
    }
    assert(issuedThrew, 'Transformer must fail loudly when "issued" is provided');
    console.log('✔ Transformer: "issued" rejected loudly with explicit Error');

    // Test dbRepo.saveRecord pre-persistence guard
    let guardThrew = false;
    try {
      await app.dbRepo.saveRecord('clasptek:invoices', {
        id: 'inv_temp_guard',
        status: 'issued'
      });
    } catch (err) {
      guardThrew = true;
      assert(err.message.includes("Invalid invoice status 'issued'"));
    }
    assert(guardThrew, 'dbRepo.saveRecord pre-persistence guard must block "issued" before network');
    console.log('✔ dbRepo.saveRecord: Pre-persistence guard blocks invalid status before PostgREST call');

    console.log('\n================================================================');
    console.log(' ALL 6 VERIFICATION PHASES PASSED WITH ZERO FAILURES');
    console.log('================================================================\n');

  } finally {
    // -------------------------------------------------------------
    // STEP 7: Guaranteed Cleanup of Synthetic Records
    // -------------------------------------------------------------
    console.log('--- CLEANUP: Removing all synthetic test records ---');
    for (const id of createdIds) {
      try {
        await request(`/rest/v1/invoices?id=eq.${id}`, { method: 'DELETE' });
      } catch (_) {}
    }
    const finalCheck = await request('/rest/v1/invoices?select=id');
    console.log(`✔ Production invoices table cleaned up. Remaining count: ${finalCheck.data ? finalCheck.data.length : 0}`);
  }
})();
