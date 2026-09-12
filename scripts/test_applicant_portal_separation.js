/**
 * CLASPTEK ENTERPRISE PLATFORM
 * Automated Test Suite: Professional Intake & Applicant Portal Separation
 * 
 * Verifies all 10 Acceptance Tests:
 * Test 1: + New Application opens fresh intake entry form
 * Test 2: Applicant Portal opens tracking/status portal and NOT the application-entry form
 * Test 3: Valid application lookup returns only sanitized applicant-safe information
 * Test 4: Invalid lookup returns the generic error without revealing record existence
 * Test 5: Staff application-management queue remains functional
 * Test 6: Existing application detail/dossier review remains functional
 * Test 7: Multiple applications for one candidate do not collide or overwrite
 * Test 8: Tenant isolation is preserved
 * Test 9: No internal notes, IDs, confidence scores, tenant IDs, or internal JSON are leaked
 * Test 10: The three experiences are distinct in route, component, purpose, and UI
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    failCount++;
    console.error(`  ✖ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passCount++;
  console.log(`  ✔ PASS: ${message}`);
}

function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (key) => (store[key] !== undefined ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

function loadSandbox() {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const matches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const scriptContent = matches[matches.length - 1][1];

  const mockStorage = createMockLocalStorage();
  const elements = {};

  function makeMockElement(id = '', tag = 'div') {
    return {
      id,
      tagName: tag.toUpperCase(),
      innerHTML: '',
      innerText: '',
      value: '',
      checked: false,
      disabled: false,
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      dataset: {},
      listeners: {},
      addEventListener: function(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      querySelector: function(sel) {
        if (sel.startsWith('#')) {
          const sId = sel.substring(1);
          if (!elements[sId]) elements[sId] = makeMockElement(sId);
          return elements[sId];
        }
        return makeMockElement('', sel);
      },
      querySelectorAll: function() {
        return [];
      }
    };
  }

  const sandbox = {
    require: require,
    Buffer: Buffer,
    window: {
      addEventListener: () => {},
      location: { reload: () => {}, href: 'http://localhost' },
      print: () => {},
      document: {
        getElementById: (id) => {
          if (!elements[id]) elements[id] = makeMockElement(id);
          return elements[id];
        },
        createElement: (tag) => makeMockElement('', tag),
        querySelector: (sel) => {
          if (sel.startsWith('#')) {
            const sId = sel.substring(1);
            if (!elements[sId]) elements[sId] = makeMockElement(sId);
            return elements[sId];
          }
          return makeMockElement('', sel);
        },
        querySelectorAll: () => [],
        body: makeMockElement('body', 'body')
      },
      localStorage: mockStorage
    },
    document: {
      getElementById: (id) => {
        if (!elements[id]) elements[id] = makeMockElement(id);
        return elements[id];
      },
      createElement: (tag) => makeMockElement('', tag),
      querySelector: (sel) => {
        if (sel.startsWith('#')) {
          const sId = sel.substring(1);
          if (!elements[sId]) elements[sId] = makeMockElement(sId);
          return elements[sId];
        }
        return makeMockElement('', sel);
      },
      querySelectorAll: () => [],
      body: makeMockElement('body', 'body')
    },
    localStorage: mockStorage,
    setTimeout: (fn, d) => setTimeout(fn, d),
    clearTimeout: (id) => clearTimeout(id),
    console: console,
    navigator: { clipboard: { writeText: () => Promise.resolve() } }
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  return { sandbox, elements };
}

async function runAcceptanceTests() {
  console.log('=================================================================');
  console.log('CLASPTEK SEPARATION ACCEPTANCE SUITE: APPLICANT PORTAL & INTAKE');
  console.log('=================================================================\n');

  const { sandbox, elements } = loadSandbox();
  const app = sandbox.window;
  const state = app.state;

  // Setup minimal initial tenant and catalogue
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  state.authoritativeTenantId = DEFAULT_TENANT_ID;
  state.programmes = [
    { id: 'prog-hvac-01', code: 'HVAC-01', name: 'Commercial Air Conditioning & Refrigeration', tuitionFee: 250000, status: 'ACTIVE', tenantId: DEFAULT_TENANT_ID },
    { id: 'prog-solar-01', code: 'SOLAR-01', name: 'Solar PV & Inverter Systems Installation', tuitionFee: 180000, status: 'ACTIVE', tenantId: DEFAULT_TENANT_ID }
  ];
  state.intakeApplications = [];
  state.students = [];
  state.enrolments = [];

  // ---------------------------------------------------------------------------
  // TEST 1: + New Application opens fresh intake entry form
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: + New Application ---');
  state.tab = 'apply';
  const mockApplyContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  app.renderApplicantIntakePortal(mockApplyContainer);
  assert(mockApplyContainer.innerHTML.includes('New Candidate Application'), 'renderApplicantIntakePortal displays "New Candidate Application" banner');
  assert(mockApplyContainer.innerHTML.includes('Section A — Personal Information'), 'Contains Section A Personal Info form fields');
  assert(mockApplyContainer.innerHTML.includes('Section B — Training Interest'), 'Contains Section B Course Selection fields');
  assert(mockApplyContainer.innerHTML.includes('clasptekIntakeForm'), 'Contains authoritative intake submission form');
  assert(!mockApplyContainer.innerHTML.includes('Applicant Status &amp; Admissions Portal'), 'Intake form does NOT render applicant tracking portal');

  // ---------------------------------------------------------------------------
  // TEST 2: Applicant Portal opens tracking/status portal and NOT the intake form
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Applicant Portal Route & View ---');
  state.tab = 'applicantPortal';
  const mockTrackingContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  app.renderApplicantTrackingPortal(mockTrackingContainer);
  assert(mockTrackingContainer.innerHTML.includes('Applicant Status &amp; Admissions Portal'), 'renderApplicantTrackingPortal displays Admissions Portal header');
  assert(mockTrackingContainer.innerHTML.includes('Check Application Status'), 'Contains "Check Application Status" button');
  assert(mockTrackingContainer.innerHTML.includes('applicantLookupForm'), 'Contains lookup form with reference and credential fields');
  assert(!mockTrackingContainer.innerHTML.includes('Section A — Personal Information'), 'Tracking portal does NOT contain Section A intake fields');
  assert(!mockTrackingContainer.innerHTML.includes('Section B — Training Interest'), 'Tracking portal does NOT contain Section B intake fields');

  // ---------------------------------------------------------------------------
  // TEST 3 & 4: Valid Lookup vs Invalid Lookup (Anti-Enumeration & Zero Oracle)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3 & 4: Applicant Lookup & Anti-Enumeration ---');
  // Submit an application first
  const intakePayload = {
    firstName: 'Victor',
    lastName: 'Chukwuma',
    email: 'victor.chukwuma@example.com',
    phone: '+2348039998877',
    programmeId: 'prog-hvac-01',
    preferredSchedule: 'WEEKDAY',
    deliveryMode: 'IN_PERSON',
    consentAcknowledged: true
  };
  const submitResult = await app.submitAuthoritativeApplication(intakePayload, 'WEB_INTAKE');
  assert(submitResult.success === true, 'Application submitted successfully');
  const validAppNum = submitResult.applicationNumber;
  assert(validAppNum.startsWith('APP-'), `Valid application number generated: ${validAppNum}`);

  // Test 3: Valid lookup with matching email
  const validLookupEmail = await app.lookupApplicantTrackingInfo(validAppNum, 'victor.chukwuma@example.com');
  assert(validLookupEmail.success === true, 'Valid lookup with email returns success: true');
  assert(validLookupEmail.application.application_number === validAppNum, 'Returns correct application number');
  assert(validLookupEmail.application.candidate_name === 'Victor C.', 'Masks candidate surname (Victor C.)');
  assert(validLookupEmail.application.programme_name === 'Commercial Air Conditioning & Refrigeration', 'Returns resolved programme name');
  assert(validLookupEmail.application.status_label === 'Application Received', 'Maps NEW status to "Application Received"');
  assert(Array.isArray(validLookupEmail.application.required_documents), 'Provides read-only required documents list');
  assert(validLookupEmail.application.admissions_contact?.email === 'admissions@clasptek.com', 'Provides admissions contact details');

  // Test 3b: Valid lookup with matching phone digits
  const validLookupPhone = await app.lookupApplicantTrackingInfo(validAppNum, '08039998877');
  assert(validLookupPhone.success === true, 'Valid lookup with phone digits returns success: true');

  // Test 4: Invalid lookup combinations (Anti-Enumeration: Must return identical generic message)
  const EXPECTED_GENERIC_MSG = 'Application could not be found or verified with the provided details. Please check your reference number and contact information.';

  const invalidAppRef = await app.lookupApplicantTrackingInfo('APP-2026-999999', 'victor.chukwuma@example.com');
  assert(invalidAppRef.success === false, 'Invalid reference returns success: false');
  assert(invalidAppRef.message === EXPECTED_GENERIC_MSG, 'Non-existent reference returns generic message');

  const mismatchedCred = await app.lookupApplicantTrackingInfo(validAppNum, 'wrong.email@example.com');
  assert(mismatchedCred.success === false, 'Mismatched credential returns success: false');
  assert(mismatchedCred.message === EXPECTED_GENERIC_MSG, 'Mismatched credential returns identical generic message (Zero Oracle Leakage)');

  const emptyCred = await app.lookupApplicantTrackingInfo(validAppNum, '');
  assert(emptyCred.success === false && emptyCred.message === EXPECTED_GENERIC_MSG, 'Empty credential returns identical generic message');

  // ---------------------------------------------------------------------------
  // TEST 5 & 6: Staff Management Workspace & Application Review
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5 & 6: Staff Management Workspace ---');
  state.tab = 'applications';
  const mockStaffContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  app.renderApplicationsTab(mockStaffContainer);
  assert(mockStaffContainer.innerHTML.includes('Professional Intake &amp; Applicant Management'), 'Staff workspace title rendered');
  assert(mockStaffContainer.innerHTML.includes('btnOpenApplicantPortal'), 'Contains "🌐 Applicant Portal" navigation button');
  assert(mockStaffContainer.innerHTML.includes('btnEnterStaffApplication'), 'Contains "+ New Application" button');
  assert(mockStaffContainer.innerHTML.includes(validAppNum), 'Staff queue lists ingested application number');
  assert(mockStaffContainer.innerHTML.includes('Dossier / Review'), 'Staff queue provides Dossier / Review action');

  // Check detail modal can open for the application
  const existingRecord = state.intakeApplications.find(a => a.applicationNumber === validAppNum);
  assert(Boolean(existingRecord), 'Application record present in state.intakeApplications');
  const mockModalContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  app.renderApplicationDetailModal(mockModalContainer, existingRecord);
  assert(mockModalContainer.innerHTML.includes('Application Dossier:'), 'Staff detail modal renders full application dossier');
  assert(mockModalContainer.innerHTML.includes('victor.chukwuma@example.com'), 'Staff dossier displays unmasked applicant contact details');

  // ---------------------------------------------------------------------------
  // TEST 7: Multiple applications for one candidate do not collide or overwrite
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Multiple Applications Independence ---');
  const secondIntakePayload = {
    firstName: 'Victor',
    lastName: 'Chukwuma',
    email: 'victor.chukwuma@example.com',
    phone: '+2348039998877',
    programmeId: 'prog-solar-01',
    preferredSchedule: 'WEEKEND',
    deliveryMode: 'HYBRID',
    consentAcknowledged: true
  };
  const secondResult = await app.submitAuthoritativeApplication(secondIntakePayload, 'WEB_INTAKE');
  assert(secondResult.success === true, 'Second application submitted successfully');
  const secondAppNum = secondResult.applicationNumber;
  assert(secondAppNum !== validAppNum, `Second application assigned distinct reference: ${secondAppNum}`);

  const appsForVictor = state.intakeApplications.filter(a => a.email === 'victor.chukwuma@example.com');
  assert(appsForVictor.length === 2, 'Two distinct application records coexist for Victor Chukwuma');

  // Lookup each application independently
  const trackFirst = await app.lookupApplicantTrackingInfo(validAppNum, 'victor.chukwuma@example.com');
  const trackSecond = await app.lookupApplicantTrackingInfo(secondAppNum, 'victor.chukwuma@example.com');
  assert(trackFirst.application.programme_name === 'Commercial Air Conditioning & Refrigeration', 'First application tracks HVAC');
  assert(trackSecond.application.programme_name === 'Solar PV & Inverter Systems Installation', 'Second application tracks Solar PV');

  // ---------------------------------------------------------------------------
  // TEST 8: Tenant Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Tenant Isolation ---');
  const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';
  state.authoritativeTenantId = TENANT_B_ID;
  const crossTenantLookup = await app.lookupApplicantTrackingInfo(validAppNum, 'victor.chukwuma@example.com');
  assert(crossTenantLookup.success === false, 'Tenant B lookup for Tenant A application rejected');
  assert(crossTenantLookup.message === EXPECTED_GENERIC_MSG, 'Cross-tenant lookup produces identical generic error');
  state.authoritativeTenantId = DEFAULT_TENANT_ID; // restore

  // ---------------------------------------------------------------------------
  // TEST 9: Zero Oracle Leakage (No internal metadata exposed to applicant)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Applicant Data Sanitization ---');
  const sanitizedApp = trackFirst.application;
  assert(sanitizedApp.identity_confidence === undefined, 'identity_confidence is NOT leaked');
  assert(sanitizedApp.matched_student_id === undefined, 'matched_student_id is NOT leaked');
  assert(sanitizedApp.review_reason === undefined, 'review_reason is NOT leaked');
  assert(sanitizedApp.match_notes === undefined, 'match_notes is NOT leaked');
  assert(sanitizedApp.tenant_id === undefined, 'tenant_id is NOT leaked');
  assert(sanitizedApp.source_submission_id === undefined, 'source_submission_id is NOT leaked');
  assert(sanitizedApp.applicant_data === undefined, 'applicant_data internal JSON is NOT leaked');

  // ---------------------------------------------------------------------------
  // TEST 10: Three Distinct Experiences (Route, Component, Purpose, UI)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Structural Distinction Across All 3 Experiences ---');
  assert(typeof app.renderApplicantIntakePortal === 'function', 'Experience 1: renderApplicantIntakePortal is a dedicated function');
  assert(typeof app.renderApplicantTrackingPortal === 'function', 'Experience 2: renderApplicantTrackingPortal is a dedicated function');
  assert(typeof app.renderApplicationsTab === 'function', 'Experience 3: renderApplicationsTab is a dedicated function');
  assert(app.renderApplicantIntakePortal !== app.renderApplicantTrackingPortal, 'Experience 1 ≠ Experience 2 (Distinct components)');
  assert(app.renderApplicantIntakePortal !== app.renderApplicationsTab, 'Experience 1 ≠ Experience 3 (Distinct components)');
  assert(app.renderApplicantTrackingPortal !== app.renderApplicationsTab, 'Experience 2 ≠ Experience 3 (Distinct components)');

  console.log('\n=================================================================');
  console.log(`ALL ACCEPTANCE TESTS PASSED: ${passCount} / ${passCount} (100% SUCCESS)`);
  console.log('=================================================================\n');
}

runAcceptanceTests().catch(err => {
  console.error('\n✖ TEST SUITE ABORTED WITH ERROR:', err);
  process.exit(1);
});
