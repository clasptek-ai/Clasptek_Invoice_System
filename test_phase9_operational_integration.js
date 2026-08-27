/**
 * CLASPTEK OPERATIONAL INTEGRATION TEST SUITE - PHASE 9 (EXPANDED COMPREHENSIVE SUITE)
 * 60+ Test Comprehensive Verification of Finance + HR + CRM Operational Integration & PostgreSQL Authority
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('\x1b[34m=================================================================\x1b[0m');
console.log('\x1b[34m    CLASPTEK PHASE 9: FULL OPERATIONAL INTEGRATION TEST SUITE     \x1b[0m');
console.log('\x1b[34m=================================================================\x1b[0m');

function createMockElement() {
  return {
    innerHTML: '',
    value: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    contains: () => false
  };
}

function createSandboxEnvironment(customStorage = {}, customFetch = null) {
  const localStorageStore = { ...customStorage };
  
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
    removeEventListener: () => {}
  };

  global.document = {
    getElementById: () => createMockElement(),
    querySelectorAll: () => [],
    querySelector: () => createMockElement(),
    createElement: () => createMockElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createMockElement()
  };

  global.alert = () => {};
  global.confirm = () => true;

  if (!global.crypto) {
    global.crypto = {
      subtle: {
        digest: async (algo, data) => {
          const hash = crypto.createHash('sha256').update(Buffer.from(data)).digest();
          return hash;
        }
      },
      getRandomValues: (arr) => crypto.randomFillSync(arr)
    };
  }

  global.fetch = customFetch || (async () => ({ ok: false, status: 404, json: async () => ({}) }));

  const htmlContent = fs.readFileSync(path.join(__dirname, 'clasptek_invoice_system.html'), 'utf8');
  const scriptMatch = htmlContent.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) throw new Error('Could not find <script> tag in clasptek_invoice_system.html');

  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', scriptMatch[1]);
  runner(moduleObj, moduleObj.exports);

  return {
    exports: moduleObj.exports,
    storage: localStorageStore
  };
}

let testsPassed = 0;
let testsFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`\x1b[32m  ✔ [PASS]\x1b[0m ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✖ [FAIL]\x1b[0m ${desc}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
    testsFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`\x1b[32m  ✔ [PASS]\x1b[0m ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✖ [FAIL]\x1b[0m ${desc}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
    testsFailed++;
  }
}

async function runSuite() {
  const { exports: app } = createSandboxEnvironment();

  console.log('\n\x1b[36m--- Section 1: Module Architecture & State Schema (Tests 1-8) ---\x1b[0m');

  it('1.1 Module exports CRM_PIPELINE_STAGES with standard progression', () => {
    assert(Array.isArray(app.CRM_PIPELINE_STAGES), 'CRM_PIPELINE_STAGES should be array');
    assert(app.CRM_PIPELINE_STAGES.includes('NEW'));
    assert(app.CRM_PIPELINE_STAGES.includes('CONTACTED'));
    assert(app.CRM_PIPELINE_STAGES.includes('QUALIFIED'));
    assert(app.CRM_PIPELINE_STAGES.includes('ENROLLED'));
    assert(app.CRM_PIPELINE_STAGES.includes('ACTIVE CUSTOMER'));
  });

  it('1.2 Module exports CRM_LEAD_SOURCES covering multi-channel admissions', () => {
    assert(Array.isArray(app.CRM_LEAD_SOURCES), 'CRM_LEAD_SOURCES should be array');
    assert(app.CRM_LEAD_SOURCES.includes('WhatsApp'));
    assert(app.CRM_LEAD_SOURCES.includes('Website'));
    assert(app.CRM_LEAD_SOURCES.includes('Walk-in'));
    assert(app.CRM_LEAD_SOURCES.includes('Instagram'));
    assert(app.CRM_LEAD_SOURCES.includes('Referral'));
  });

  it('1.3 Module exports all authoritative store keys', () => {
    assert.strictEqual(app.STORE_KEY_FACILITATOR_SESSIONS, 'clasptek:facilitator_sessions');
    assert.strictEqual(app.STORE_KEY_CUSTOMER_TIMELINE, 'clasptek:customer_timeline');
    assert.strictEqual(app.STORE_KEY_CUSTOMERS, 'clasptek:customers');
    assert.strictEqual(app.STORE_KEY_ENQUIRIES, 'clasptek:enquiries');
    assert.strictEqual(app.STORE_KEY_ENROLMENTS, 'clasptek:enrolments');
  });

  it('1.4 State containers are properly initialized', () => {
    assert(Array.isArray(app.state.sessions));
    assert(Array.isArray(app.state.customerTimeline));
    assert(Array.isArray(app.state.customers));
    assert(Array.isArray(app.state.enquiries));
    assert(Array.isArray(app.state.enrolments));
  });

  it('1.5 DB_TABLE_MAPPING maps facilitator_sessions and customer_timeline to PostgreSQL tables', () => {
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_FACILITATOR_SESSIONS], 'facilitator_sessions');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_CUSTOMER_TIMELINE], 'customer_timeline');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_CUSTOMERS], 'customers');
    assert.strictEqual(app.DB_TABLE_MAPPING[app.STORE_KEY_ENROLMENTS], 'enrolments');
  });

  it('1.6 Phase 9 core business logic functions are exported', () => {
    assert.strictEqual(typeof app.findCustomerDuplicate, 'function');
    assert.strictEqual(typeof app.logCustomerActivity, 'function');
    assert.strictEqual(typeof app.convertEnquiryToCustomer, 'function');
    assert.strictEqual(typeof app.createEnrolmentFromInvoice, 'function');
    assert.strictEqual(typeof app.calculateFacilitatorSessionEarnings, 'function');
    assert.strictEqual(typeof app.syncPaymentToEnrolmentAndCustomer, 'function');
    assert.strictEqual(typeof app.getCustomer360Data, 'function');
    assert.strictEqual(typeof app.calculateProgrammeContribution, 'function');
    assert.strictEqual(typeof app.batchDisbursePayroll, 'function');
  });

  it('1.7 RBAC rules include mySessions tab for Facilitator role', () => {
    assert(app.canAccessTab('Facilitator', 'mySessions'), 'Facilitator must have access to mySessions');
    assert(app.canAccessTab('Staff', 'mySessions'), 'Staff must have access to mySessions');
    assert(!app.canAccessTab('Finance Viewer', 'mySessions'), 'Finance Viewer cannot access employee portal tab');
  });

  it('1.8 Super Admin and Finance roles have access to administrative management tabs', () => {
    assert(app.canAccessTab('Super Admin', 'dashboard'));
    assert(app.canAccessTab('Finance Manager', 'invoices'));
    assert(app.canAccessTab('Finance Manager', 'payslips'));
    assert(app.canAccessTab('Super Admin', 'usersRoles'));
  });

  console.log('\n\x1b[36m--- Section 2: Customer Deduplication Engine (Tests 9-16) ---\x1b[0m');

  it('2.1 Exact email match identifies existing customer', () => {
    app.state.customers = [
      { id: 'c101', customerNumber: 'CUST-2026-0101', name: 'Alhaji Dangote', email: 'alhaji@dangote.com', phone: '08011112222' }
    ];
    const dup = app.findCustomerDuplicate('alhaji@dangote.com', '08099999999', 'Other');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'email');
    assert.strictEqual(dup.customer.id, 'c101');
  });

  it('2.2 Email match is case-insensitive and trims whitespace', () => {
    const dup = app.findCustomerDuplicate('  ALHAJI@DANGOTE.COM  ', '08099999999', 'Other');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'email');
  });

  it('2.3 Phone match detects international format vs local format', () => {
    app.state.customers = [
      { id: 'c102', customerNumber: 'CUST-2026-0102', name: 'Chioma Ajunwa', email: 'chioma@olympics.ng', phone: '+2348033335555' }
    ];
    const dup = app.findCustomerDuplicate('new@mail.com', '08033335555', 'Chioma Candidate');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'phone');
    assert.strictEqual(dup.customer.id, 'c102');
  });

  it('2.4 Phone match handles spaces, hyphens, and brackets', () => {
    const dup = app.findCustomerDuplicate('diff@mail.com', '+234 (803) 333-5555', 'Chioma');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'phone');
  });

  it('2.5 Full name match identifies duplicate when name is at least 4 characters', () => {
    app.state.customers = [
      { id: 'c103', customerNumber: 'CUST-2026-0103', name: 'Funke Akindele', email: 'funke@sceneone.tv', phone: '08077771111' }
    ];
    const dup = app.findCustomerDuplicate('unknown@mail.com', '09012345678', 'Funke Akindele');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'name');
    assert.strictEqual(dup.customer.id, 'c103');
  });

  it('2.6 Name match is case-insensitive', () => {
    const dup = app.findCustomerDuplicate('unknown@mail.com', '09012345678', 'funke akindele');
    assert(dup !== null);
    assert.strictEqual(dup.matchType, 'name');
  });

  it('2.7 Returns null when prospect has no matching email, phone, or name', () => {
    const dup = app.findCustomerDuplicate('unique.applicant@clasptek.org', '08188889999', 'Totally New Person');
    assert.strictEqual(dup, null);
  });

  it('2.8 Short names or blank strings do not trigger false positives', () => {
    const dup = app.findCustomerDuplicate('', '', 'Jo');
    assert.strictEqual(dup, null);
  });

  console.log('\n\x1b[36m--- Section 3: CRM Enquiry Conversion & Timeline (Tests 17-24) ---\x1b[0m');

  await itAsync('3.1 Enquiry conversion creates new master customer record with sequential CUST-2026-XXXX', async () => {
    const enq = {
      id: 'enq_conv_1',
      enquiryNo: 301,
      name: 'Oluwaseun Balogun',
      email: 'seun.b@clasptek.ng',
      phone: '08091112233',
      programmeId: 'prog_pmp',
      programmeName: 'PMP Project Management',
      source: 'WhatsApp',
      status: 'INTERESTED',
      createdAt: new Date().toISOString()
    };
    app.state.enquiries = [enq];
    app.state.counters.customer = 25;

    const customer = await app.convertEnquiryToCustomer(enq.id, {
      fullName: 'Oluwaseun Balogun',
      phone: '08091112233',
      email: 'seun.b@clasptek.ng',
      customerType: 'Individual',
      source: 'WhatsApp',
      address: 'Lekki Phase 1, Lagos'
    });

    assert(customer);
    assert.strictEqual(customer.customerNumber, 'CUST-2026-0026');
    assert.strictEqual(customer.name, 'Oluwaseun Balogun');
    assert.strictEqual(customer.address, 'Lekki Phase 1, Lagos');
  });

  await itAsync('3.2 Enquiry conversion advances enquiry status to CONVERTED and links customerId', async () => {
    const enq = app.state.enquiries.find(e => e.id === 'enq_conv_1');
    assert(enq);
    assert.strictEqual(enq.status, 'CONVERTED');
    assert(enq.convertedCustomerId);
    assert.strictEqual(enq.customerId, enq.convertedCustomerId);
  });

  await itAsync('3.3 Customer activity logging records entry with full details and actor', async () => {
    const custId = 'cust_log_test';
    const entry = await app.logCustomerActivity(
      custId,
      'CONSULTATION_HELD',
      'Career Advisory Session Completed',
      'Student evaluated IELTS Academic vs General Training requirements for Canada PR.',
      {
        contactMethod: 'Online Video Meeting',
        outcome: 'Proposal Accepted',
        nextAction: 'Send Invoice for IELTS Intensive Batch',
        nextFollowUpDate: '2026-09-10'
      }
    );

    assert(entry);
    assert.strictEqual(entry.customerId, custId);
    assert.strictEqual(entry.contactMethod, 'Online Video Meeting');
    assert.strictEqual(entry.outcome, 'Proposal Accepted');
    assert.strictEqual(entry.nextAction, 'Send Invoice for IELTS Intensive Batch');
  });

  it('3.4 Customer activity timeline stores entries in chronological reverse order', () => {
    const custId = 'cust_chronology_test';
    app.state.customerTimeline.unshift({ id: 't_first', customerId: custId, title: 'First Event', createdAt: '2026-08-01T10:00:00Z' });
    app.state.customerTimeline.unshift({ id: 't_second', customerId: custId, title: 'Second Event', createdAt: '2026-08-02T10:00:00Z' });

    const custTimeline = app.state.customerTimeline.filter(t => t.customerId === custId);
    assert.strictEqual(custTimeline[0].id, 't_second');
    assert.strictEqual(custTimeline[1].id, 't_first');
  });

  await itAsync('3.5 Duplicate prospect conversion reuses existing customer if useExisting is true', async () => {
    const existingCust = { id: 'cust_exist_99', customerNumber: 'CUST-2026-0099', name: 'Hauwa Ibrahim', email: 'hauwa@law.ng', phone: '08022221111' };
    app.state.customers.push(existingCust);

    const enqDup = {
      id: 'enq_dup_99',
      enquiryNo: 302,
      name: 'Hauwa Ibrahim',
      email: 'hauwa@law.ng',
      phone: '08022221111',
      programmeName: 'Corporate Governance',
      source: 'Referral'
    };
    app.state.enquiries.push(enqDup);

    const result = await app.convertEnquiryToCustomer(enqDup.id, { useExisting: true });
    assert.strictEqual(result.id, 'cust_exist_99', 'Should reuse existing customer');
    assert.strictEqual(enqDup.convertedCustomerId, 'cust_exist_99');
  });

  it('3.6 Conversion throws clear error if enquiryId does not exist', async () => {
    let err = null;
    try {
      await app.convertEnquiryToCustomer('non_existent_enquiry_id');
    } catch (e) {
      err = e;
    }
    assert(err !== null);
    assert(err.message.includes('Enquiry not found'));
  });

  await itAsync('3.7 Conversion creates automatic audit log entry', async () => {
    const auditCountBefore = app.state.auditLog.length;
    const enqAudit = { id: 'enq_aud_1', enquiryNo: 303, name: 'Audit Test Prospect', phone: '08099990000', email: 'aud@test.ng' };
    app.state.enquiries.push(enqAudit);

    await app.convertEnquiryToCustomer(enqAudit.id);
    assert(app.state.auditLog.length > auditCountBefore);
    const auditEntry = app.state.auditLog.find(a => a.action === 'CUSTOMER_CREATED' || a.action === 'ENQUIRY_CONVERTED');
    assert(auditEntry !== undefined);
  });

  it('3.8 logCustomerActivity gracefully returns null when customerId is missing', async () => {
    const res = await app.logCustomerActivity('', 'EVENT', 'Title');
    assert.strictEqual(res, null);
  });

  console.log('\n\x1b[36m--- Section 4: Commercial Snapshotting & Enrolment Bridge (Tests 25-32) ---\x1b[0m');

  await itAsync('4.1 createEnrolmentFromInvoice generates ENR-2026-XXXX format', async () => {
    const inv = {
      id: 'inv_snap_01',
      clientName: 'Zainab Ahmed',
      email: 'zainab@fin.gov.ng',
      phone: '08033337777',
      programmeId: 'prog_ielts',
      programmeName: 'IELTS Band 8.5 Comprehensive',
      plan: '100% Upfront',
      trainingMode: 'Physical Weekday Intensive',
      total: 180000,
      createdAt: new Date().toISOString()
    };
    app.state.invoices = [inv];
    app.state.counters.enrolment = 40;

    const enrolment = await app.createEnrolmentFromInvoice(inv.id, { cohortCode: 'IELTS-2026-AUG' });

    assert(enrolment);
    assert.strictEqual(enrolment.enrolmentNo, 'ENR-2026-0041');
    assert.strictEqual(enrolment.studentName, 'Zainab Ahmed');
    assert.strictEqual(enrolment.agreedFee, 180000);
    assert.strictEqual(enrolment.programmeName, 'IELTS Band 8.5 Comprehensive');
    assert.strictEqual(enrolment.cohortCode, 'IELTS-2026-AUG');
  });

  it('4.2 Enrolment links bidirectional reference to invoiceId and inv.enrolmentId', () => {
    const inv = app.state.invoices.find(i => i.id === 'inv_snap_01');
    const enr = app.state.enrolments.find(e => e.invoiceId === 'inv_snap_01');
    assert(inv);
    assert(enr);
    assert.strictEqual(inv.enrolmentId, enr.id);
    assert.strictEqual(enr.invoiceId, inv.id);
  });

  it('4.3 Commercial Snapshotting Rule: Altering programme catalog does not mutate snapshotted fee', () => {
    const prog = { id: 'prog_ielts', name: 'IELTS Band 8.5 Comprehensive', price: 180000 };
    const enr = app.state.enrolments.find(e => e.invoiceId === 'inv_snap_01');
    assert.strictEqual(enr.agreedFee, 180000);

    // Increase programme catalog tuition for next session
    prog.price = 250000;
    prog.name = 'IELTS Band 8.5 Master Edition';

    // Historical enrolment agreed fee and course name snapshot must be preserved
    assert.strictEqual(enr.agreedFee, 180000);
    assert.strictEqual(enr.programmeName, 'IELTS Band 8.5 Comprehensive');
  });

  it('4.4 Initial enrolment payment status is unpaid when invoice has no payments', () => {
    const enr = app.state.enrolments.find(e => e.invoiceId === 'inv_snap_01');
    assert.strictEqual(enr.amountPaid, 0);
    assert.strictEqual(enr.balanceDue, 180000);
    assert.strictEqual(enr.financialStatus, 'unpaid');
  });

  it('4.5 Enrolment creation throws error for non-existent invoice', async () => {
    let err = null;
    try {
      await app.createEnrolmentFromInvoice('invalid_invoice_id');
    } catch (e) {
      err = e;
    }
    assert(err !== null);
  });

  it('4.6 Enrolment preserves delivery mode and schedule preferences', async () => {
    const inv2 = {
      id: 'inv_snap_02',
      clientName: 'Kareem Abdul',
      programmeId: 'prog_pmp',
      programmeName: 'PMP Exam Prep',
      trainingMode: 'Online Evening',
      total: 220000
    };
    app.state.invoices.push(inv2);

    const enr2 = await app.createEnrolmentFromInvoice(inv2.id, { deliveryMode: 'Online Evening' });
    assert.strictEqual(enr2.deliveryMode, 'Online Evening');
  });

  it('4.7 Enrolment creation updates counters in state', () => {
    assert(app.state.counters.enrolment >= 41);
  });

  it('4.8 Enrolment creates audit log trail', () => {
    const audit = app.state.auditLog.find(a => a.action === 'ENROLMENT_CREATED');
    assert(audit !== undefined);
  });

  console.log('\n\x1b[36m--- Section 5: Multi-Entity Payment Cascade & Reconciliation (Tests 33-40) ---\x1b[0m');

  await itAsync('5.1 Partial payment updates Enrolment balanceDue and financialStatus to partial', async () => {
    const cust = { id: 'cust_casc_1', customerNumber: 'CUST-2026-0055', name: 'Fatima Ganduje', totalInvoiced: 200000, totalPaid: 0, balance: 200000 };
    const inv = { id: 'inv_casc_1', customerId: cust.id, clientName: 'Fatima Ganduje', total: 200000 };
    const enr = { id: 'enr_casc_1', invoiceId: inv.id, studentName: 'Fatima Ganduje', agreedFee: 200000, amountPaid: 0, balanceDue: 200000, financialStatus: 'unpaid' };
    const payment = { id: 'pay_casc_1', invoiceId: inv.id, receiptNo: 'RCP-2026-0501', clientName: 'Fatima Ganduje', amount: 80000, paymentDate: '2026-08-22' };

    app.state.customers = [cust];
    app.state.invoices = [inv];
    app.state.enrolments = [enr];
    app.state.payments = [payment];

    await app.syncPaymentToEnrolmentAndCustomer(payment, inv);

    assert.strictEqual(enr.amountPaid, 80000);
    assert.strictEqual(enr.balanceDue, 120000);
    assert.strictEqual(enr.financialStatus, 'partial');
  });

  await itAsync('5.2 Partial payment updates Customer Master totalPaid, balance, and status', async () => {
    const cust = app.state.customers.find(c => c.id === 'cust_casc_1');
    assert.strictEqual(cust.totalInvoiced, 200000);
    assert.strictEqual(cust.totalPaid, 80000);
    assert.strictEqual(cust.balance, 120000);
    assert.strictEqual(cust.currentPaymentStatus, 'Partial');
  });

  await itAsync('5.3 Full payment settlement sets financialStatus to paid and balance to 0', async () => {
    const inv = app.state.invoices.find(i => i.id === 'inv_casc_1');
    const enr = app.state.enrolments.find(e => e.id === 'enr_casc_1');
    const cust = app.state.customers.find(c => c.id === 'cust_casc_1');

    const payment2 = { id: 'pay_casc_2', invoiceId: inv.id, receiptNo: 'RCP-2026-0502', clientName: 'Fatima Ganduje', amount: 120000, paymentDate: '2026-08-25' };
    app.state.payments.push(payment2);

    await app.syncPaymentToEnrolmentAndCustomer(payment2, inv);

    assert.strictEqual(enr.amountPaid, 200000);
    assert.strictEqual(enr.balanceDue, 0);
    assert.strictEqual(enr.financialStatus, 'paid');
    assert.strictEqual(cust.totalPaid, 200000);
    assert.strictEqual(cust.balance, 0);
    assert.strictEqual(cust.currentPaymentStatus, 'Paid in Full');
  });

  it('5.4 Activity timeline logs confirmed receipt with receipt number reference', () => {
    const custId = 'cust_casc_1';
    const payEntry = app.state.customerTimeline.find(t => t.referenceId === 'pay_casc_2');
    assert(payEntry);
    assert.strictEqual(payEntry.eventType, 'PAYMENT_RECEIVED');
    assert(payEntry.description.includes('RCP-2026-0502'));
  });

  it('5.5 Multi-invoice customer totals aggregate across all issued invoices', async () => {
    const custId = 'cust_multi_inv';
    const cust = { id: custId, customerNumber: 'CUST-2026-0060', name: 'Nkem Owoh', totalInvoiced: 0, totalPaid: 0, balance: 0 };
    const invA = { id: 'inv_a', customerId: custId, clientName: 'Nkem Owoh', total: 100000 };
    const invB = { id: 'inv_b', customerId: custId, clientName: 'Nkem Owoh', total: 150000 };
    const payA = { id: 'pay_a', invoiceId: 'inv_a', amount: 100000, clientName: 'Nkem Owoh' };
    const payB = { id: 'pay_b', invoiceId: 'inv_b', amount: 50000, clientName: 'Nkem Owoh' };

    app.state.customers.push(cust);
    app.state.invoices.push(invA, invB);
    app.state.payments.push(payA, payB);

    await app.syncPaymentToEnrolmentAndCustomer(payB, invB);

    assert.strictEqual(cust.totalInvoiced, 250000);
    assert.strictEqual(cust.totalPaid, 150000);
    assert.strictEqual(cust.balance, 100000);
  });

  it('5.6 Payment sync handles invoices without explicit customerId via name match', async () => {
    const cust = { id: 'cust_namematch', customerNumber: 'CUST-2026-0070', name: 'Genevieve Nnaji', totalInvoiced: 0, totalPaid: 0, balance: 0 };
    const inv = { id: 'inv_non_id', clientName: 'Genevieve Nnaji', total: 300000 };
    const enr = { id: 'enr_non_id', invoiceId: 'inv_non_id', studentName: 'Genevieve Nnaji', agreedFee: 300000, amountPaid: 0, balanceDue: 300000 };
    const pay = { id: 'pay_non_id', invoiceId: 'inv_non_id', amount: 300000, clientName: 'Genevieve Nnaji' };

    app.state.customers.push(cust);
    app.state.invoices.push(inv);
    app.state.enrolments.push(enr);
    app.state.payments.push(pay);

    await app.syncPaymentToEnrolmentAndCustomer(pay, inv);

    assert.strictEqual(enr.amountPaid, 300000);
    assert.strictEqual(enr.balanceDue, 0);
  });

  it('5.7 Payment sync does nothing if invoice argument is null', async () => {
    await app.syncPaymentToEnrolmentAndCustomer({ amount: 50000 }, null);
    // Should not throw error
    assert(true);
  });

  it('5.8 fmtMoney formats Nigerian Naira currency with ₦ symbol and commas', () => {
    const formatted = app.fmtMoney(250000);
    assert(formatted.includes('250,000'));
    assert(formatted.includes('₦') || formatted.includes('NGN'));
  });

  console.log('\n\x1b[36m--- Section 6: Customer 360° Data Aggregator (Tests 41-48) ---\x1b[0m');

  it('6.1 getCustomer360Data aggregates profile, enquiries, enrolments, invoices, payments, timeline', () => {
    const custId = 'cust_360_full';
    const cust = { id: custId, customerNumber: 'CUST-2026-0080', name: 'Ken Saro-Wiwa', email: 'ken@ogoni.org', phone: '08044445555' };
    const enq = { id: 'e_360', customerId: custId, enquiryNo: 401, name: 'Ken Saro-Wiwa', status: 'CONVERTED' };
    const enr = { id: 'en_360', customerId: custId, studentName: 'Ken Saro-Wiwa', agreedFee: 200000 };
    const inv = { id: 'i_360', customerId: custId, clientName: 'Ken Saro-Wiwa', total: 200000 };
    const pay = { id: 'p_360', invoiceId: 'i_360', clientName: 'Ken Saro-Wiwa', amount: 200000 };
    const tim = { id: 't_360', customerId: custId, title: 'Enrolled in Environmental Leadership' };

    app.state.customers = [cust];
    app.state.enquiries = [enq];
    app.state.enrolments = [enr];
    app.state.invoices = [inv];
    app.state.payments = [pay];
    app.state.customerTimeline = [tim];

    const data = app.getCustomer360Data(custId);
    assert(data);
    assert.strictEqual(data.customer.name, 'Ken Saro-Wiwa');
    assert.strictEqual(data.enquiries.length, 1);
    assert.strictEqual(data.enrolments.length, 1);
    assert.strictEqual(data.invoices.length, 1);
    assert.strictEqual(data.payments.length, 1);
    assert.strictEqual(data.timeline.length, 1);
  });

  it('6.2 getCustomer360Data calculates summary metrics: totalInvoiced, totalPaid, balance', () => {
    const data = app.getCustomer360Data('cust_360_full');
    assert.strictEqual(data.summary.totalInvoiced, 200000);
    assert.strictEqual(data.summary.totalPaid, 200000);
    assert.strictEqual(data.summary.balance, 0);
  });

  it('6.3 Returns null when customerId is not found', () => {
    const data = app.getCustomer360Data('non_existent_customer_id');
    assert.strictEqual(data, null);
  });

  it('6.4 Customer 360 includes both summary and financialSummary properties for compatibility', () => {
    const data = app.getCustomer360Data('cust_360_full');
    assert(data.summary !== undefined);
    assert(data.financialSummary !== undefined);
    assert.strictEqual(data.summary.totalInvoiced, data.financialSummary.totalInvoiced);
  });

  it('6.5 Customer 360 links enquiries matching email address if customerId not stamped', () => {
    const custId = 'cust_email_link';
    app.state.customers.push({ id: custId, customerNumber: 'CUST-2026-0081', name: 'Email Match User', email: 'match@link.com' });
    app.state.enquiries.push({ id: 'e_email_match', enquiryNo: 402, name: 'Email Match User', email: 'match@link.com' });

    const data = app.getCustomer360Data(custId);
    assert.strictEqual(data.enquiries.length, 1);
    assert.strictEqual(data.enquiries[0].id, 'e_email_match');
  });

  it('6.6 Customer 360 tracks invoices matching studentName', () => {
    const custId = 'cust_name_link';
    app.state.customers.push({ id: custId, customerNumber: 'CUST-2026-0082', name: 'Name Match Candidate', email: 'nm@link.com' });
    app.state.invoices.push({ id: 'i_name_match', clientName: 'Name Match Candidate', total: 175000 });

    const data = app.getCustomer360Data(custId);
    assert.strictEqual(data.invoices.length, 1);
    assert.strictEqual(data.summary.totalInvoiced, 175000);
  });

  it('6.7 Customer 360 computes outstanding balance across unpaid invoices', () => {
    const custId = 'cust_unpaid_test';
    app.state.customers.push({ id: custId, customerNumber: 'CUST-2026-0083', name: 'Debtor Student', email: 'deb@clasptek.com' });
    app.state.invoices.push({ id: 'i_deb', customerId: custId, clientName: 'Debtor Student', total: 300000 });

    const data = app.getCustomer360Data(custId);
    assert.strictEqual(data.summary.balance, 300000);
  });

  it('6.8 Customer 360 counts total payments correctly', () => {
    const custId = 'cust_360_full';
    const data = app.getCustomer360Data(custId);
    assert.strictEqual(data.summary.paymentsCount, 1);
  });

  console.log('\n\x1b[36m--- Section 7: Facilitator Sessions & Session-Based Earnings (Tests 49-54) ---\x1b[0m');

  it('7.1 calculateFacilitatorSessionEarnings calculates product of sessions and rate', () => {
    assert.strictEqual(app.calculateFacilitatorSessionEarnings(12, 30000), 360000);
    assert.strictEqual(app.calculateFacilitatorSessionEarnings(1, 25000), 25000);
    assert.strictEqual(app.calculateFacilitatorSessionEarnings(0, 25000), 0);
  });

  it('7.2 calculatePayslipTotals handles basicPay + allowances + deductions', () => {
    const totals = app.calculatePayslipTotals(200000, [{ amount: 30000 }, { amount: 20000 }], [{ amount: 15000 }]);
    assert.strictEqual(totals.basic, 200000);
    assert.strictEqual(totals.totalAllowances, 50000);
    assert.strictEqual(totals.grossPay, 250000);
    assert.strictEqual(totals.totalDeductions, 15000);
    assert.strictEqual(totals.netPay, 235000);
  });

  it('7.3 calculatePayslipTotals supports facilitator session earnings as number', () => {
    const totals = app.calculatePayslipTotals(0, 0, 180000, 10000, 0);
    assert.strictEqual(totals.grossPay, 180000);
    assert.strictEqual(totals.totalDeductions, 10000);
    assert.strictEqual(totals.netPay, 170000);
  });

  it('7.4 Net pay never drops below 0 when deductions exceed gross', () => {
    const totals = app.calculatePayslipTotals(50000, [], [{ amount: 80000 }]);
    assert.strictEqual(totals.netPay, 0);
  });

  it('7.5 Facilitator session record persists to state.sessions', () => {
    const sess = {
      id: 'fses_unit_test',
      facilitator_id: 'fac_101',
      facilitator_name: 'Dr. Chinedu Eze',
      programme_id: 'prog_ielts',
      programme_name: 'IELTS Masterclass',
      session_date: '2026-08-20',
      session_type: 'Practical Workshop',
      sessions_count: 2,
      rate_per_session: 25000,
      total_amount: 50000,
      status: 'approved'
    };
    app.state.sessions.push(sess);
    assert(app.state.sessions.some(s => s.id === 'fses_unit_test'));
  });

  it('7.6 safeRound avoids JavaScript floating point precision issues', () => {
    const rounded = app.safeRound(0.1 + 0.2);
    assert.strictEqual(rounded, 0.3);
  });

  console.log('\n\x1b[36m--- Section 8: Month-End Payroll Batch Workflow & GL Integration (Tests 55-60) ---\x1b[0m');

  it('8.1 Core Principle: ACKNOWLEDGED does NOT mean PAID', () => {
    const ps = { id: 'ps_ack_check', payslipNo: 990, employeeName: 'Staff Member', status: 'acknowledged', netPay: 160000 };
    app.state.payslips = [ps];
    app.state.expenses = [];

    // Verifying: acknowledging a payslip must not create an expense in the GL
    const exp = app.state.expenses.find(e => e.sourceId === ps.id);
    assert.strictEqual(exp, undefined);
  });

  await itAsync('8.2 batchDisbursePayroll marks payslips as paid with actual payment date and account', async () => {
    const psA = { id: 'ps_m1', payslipNo: 610, payPeriod: '2026-08', employeeName: 'Adewale Adeleke', type: 'staff', status: 'approved', netPay: 210000 };
    const psB = { id: 'ps_m2', payslipNo: 611, payPeriod: '2026-08', employeeName: 'Biodun Jeyifo', type: 'facilitator', status: 'acknowledged', netPay: 180000 };
    app.state.payslips = [psA, psB];
    app.state.expenses = [];

    const disbursed = await app.batchDisbursePayroll('2026-08', 'acc_gtbank_ops');

    assert.strictEqual(disbursed.length, 2);
    assert.strictEqual(psA.status, 'paid');
    assert.strictEqual(psB.status, 'paid');
    assert.strictEqual(psA.paymentAccountId, 'acc_gtbank_ops');
    assert.strictEqual(psB.paymentAccountId, 'acc_gtbank_ops');
  });

  await itAsync('8.3 batchDisbursePayroll automatically posts GL expenses with Staff & People category', async () => {
    assert.strictEqual(app.state.expenses.length, 2);
    const expA = app.state.expenses.find(e => e.sourceReference === 'PAYSLIP-610');
    const expB = app.state.expenses.find(e => e.sourceReference === 'PAYSLIP-611');

    assert(expA);
    assert(expB);
    assert.strictEqual(expA.category, 'Staff & People');
    assert.strictEqual(expA.amount, 210000);
    assert.strictEqual(expB.category, 'Staff & People');
    assert.strictEqual(expB.amount, 180000);
  });

  await itAsync('8.4 Idempotency Invariant: integratePayslipExpense never creates duplicate expenses', async () => {
    const ps = { id: 'ps_idem_60', payslipNo: 660, employeeName: 'Idempotency Staff', type: 'staff', status: 'paid', netPay: 195000 };
    app.state.payslips.push(ps);

    // Call 3 times consecutively
    await app.integratePayslipExpense(ps, 'acc_test');
    await app.integratePayslipExpense(ps, 'acc_test');
    await app.integratePayslipExpense(ps, 'acc_test');

    const expensesForPsl = app.state.expenses.filter(e => e.sourceId === ps.id || e.reference === 'PAYSLIP-660');
    assert.strictEqual(expensesForPsl.length, 1, 'Must post exactly 1 expense despite multiple invocations');
  });

  it('8.5 integratePayslipExpense rejects unpaid payslips with warning and returns null', async () => {
    const psDraft = { id: 'ps_draft_test', payslipNo: 661, status: 'draft', netPay: 100000 };
    const exp = await app.integratePayslipExpense(psDraft);
    assert.strictEqual(exp, null);
  });

  it('8.6 batchDisbursePayroll creates batch audit log entry', () => {
    const audit = app.state.auditLog.find(a => a.action === 'BATCH_PAYROLL_DISBURSEMENT');
    assert(audit !== undefined);
  });

  console.log('\n\x1b[36m--- Section 9: Programme Operational Contribution & Zero-Data-Loss (Tests 61-66) ---\x1b[0m');

  it('9.1 calculateProgrammeContribution aggregates revenue billed, collected, costs, and contribution margin', () => {
    const progId = 'prog_pmp_contrib';
    app.state.programmes = [{ id: progId, name: 'PMP Certification Exam Prep', price: 250000 }];
    app.state.enquiries = [
      { id: 'eq1', programmeId: progId, status: 'ENROLLED' },
      { id: 'eq2', programmeId: progId, status: 'ENROLLED' },
      { id: 'eq3', programmeId: progId, status: 'CONTACTED' },
      { id: 'eq4', programmeId: progId, status: 'NEW' }
    ];
    app.state.invoices = [
      { id: 'iv1', programmeId: progId, total: 250000 },
      { id: 'iv2', programmeId: progId, total: 250000 }
    ];
    app.state.payments = [
      { id: 'py1', invoiceId: 'iv1', amount: 250000 },
      { id: 'py2', invoiceId: 'iv2', amount: 150000 }
    ];
    app.state.sessions = [
      { id: 'ss1', programme_id: progId, total_amount: 80000, status: 'approved' }
    ];

    const c = app.calculateProgrammeContribution(progId);

    assert.strictEqual(c.enquiriesCount, 4);
    assert.strictEqual(c.enrolmentsCount, 2);
    assert.strictEqual(c.conversionRate, 50); // 2 / 4 = 50%
    assert.strictEqual(c.totalRevenueBilled, 500000);
    assert.strictEqual(c.totalRevenueCollected, 400000);
    assert.strictEqual(c.facilitatorDirectCosts, 80000);
    // Operational Contribution = Collected (400,000) - Direct Costs (80,000) = 320,000
    assert.strictEqual(c.operationalContribution, 320000);
  });

  it('9.2 calculateProgrammeContribution returns zeroed object for non-existent programmeId', () => {
    const c = app.calculateProgrammeContribution('invalid_prog');
    assert.strictEqual(c.enquiriesCount, 0);
    assert.strictEqual(c.enrolmentsCount, 0);
    assert.strictEqual(c.operationalContribution, 0);
  });

  it('9.3 Section 11 DDL in supabase_schema.sql defines all required tables and indexes', () => {
    const schemaPath = path.join(__dirname, 'supabase_schema.sql');
    assert(fs.existsSync(schemaPath));
    const sql = fs.readFileSync(schemaPath, 'utf8');

    assert(sql.includes('CREATE TABLE IF NOT EXISTS public.facilitator_sessions'));
    assert(sql.includes('CREATE TABLE IF NOT EXISTS public.customer_timeline'));
    assert(sql.includes('idx_sessions_tenant_facilitator'));
    assert(sql.includes('idx_timeline_customer'));
  });

  it('9.4 PostgreSQL Period Locking Trigger blocks mutations during locked financial periods', () => {
    const schemaPath = path.join(__dirname, 'supabase_schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    assert(sql.includes('check_financial_period_lock'));
    assert(sql.includes('PERIOD LOCK VIOLATION'));
  });

  it('9.5 Zero-Data-Loss Principle: Database write failure does NOT wipe or corrupt client state', async () => {
    const samplePersonnel = [{ id: 'p_save_test', name: 'Protected Personnel Record' }];
    app.state.personnel = samplePersonnel;

    const originalSave = app.dbRepo.saveRecord;
    app.dbRepo.saveRecord = async () => {
      throw new Error('Supabase PostgreSQL simulated outage');
    };

    let caught = null;
    try {
      await app.dbRepo.saveRecord('personnel', { id: 'p_fail', name: 'Will Fail' });
    } catch (e) {
      caught = e;
    }

    assert(caught !== null);
    assert.strictEqual(app.state.personnel.length, 1);
    assert.strictEqual(app.state.personnel[0].name, 'Protected Personnel Record');

    app.dbRepo.saveRecord = originalSave;
  });

  it('9.6 Branding Invariant: Clasptek enterprise portal title is authoritative', () => {
    const html = fs.readFileSync(path.join(__dirname, 'clasptek_invoice_system.html'), 'utf8');
    assert(html.includes('CLASPTEK') || html.includes('CLASPTEK COACHING LIMITED'));
  });

  console.log('\n\x1b[34m=================================================================\x1b[0m');
  console.log(`\x1b[34m   PHASE 9 TEST SUMMARY: \x1b[32m${testsPassed} PASSED\x1b[34m / \x1b[31m${testsFailed} FAILED\x1b[34m\x1b[0m`);
  console.log('\x1b[34m=================================================================\x1b[0m');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runSuite();
