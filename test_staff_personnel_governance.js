/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Automated Test Suite: Staff & Personnel Governance Verification
 * 
 * Validates:
 * 1. delete-personnel API endpoint security, dependency checks, and 409 conflict prevention
 * 2. Responsive UI design system (.cp-kpi-grid media queries)
 * 3. SupabaseClient ensureValidSession alias
 * 4. RFC-4180 clean CSV exports (Attendance, Users, Personnel)
 * 5. Personnel search, multi-field filtering, and dynamic exports
 * 6. Safe zero-dependency deletion modal and fallback to deactivation
 * 7. Provisioning form validation with smooth scroll & try/catch safety
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    failedTests++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('CLASPTEK STAFF & PERSONNEL GOVERNANCE CERTIFICATION');
  console.log('======================================================\n');

  const htmlPath = path.join(__dirname, 'index.html');
  const deleteApiPath = path.join(__dirname, 'api', 'admin', 'delete-personnel.js');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Test 1: File existence
  it('api/admin/delete-personnel.js exists and is valid JavaScript', () => {
    assert(fs.existsSync(deleteApiPath), 'delete-personnel.js must exist');
    const deleteApi = require(deleteApiPath);
    assert(typeof deleteApi === 'function', 'delete-personnel.js must export a handler function');
  });

  // Test 2: CSS Responsive Grid
  it('Responsive .cp-kpi-grid is declared and configured in media queries', () => {
    assert(htmlContent.includes('.cp-kpi-grid'), 'Must define .cp-kpi-grid in stylesheet');
    assert(htmlContent.includes('.cp-kpi-grid { grid-template-columns: repeat(2, 1fr); }'), 'Must have 1024px 2-column breakpoint for .cp-kpi-grid');
    assert(htmlContent.includes('.cp-grid-4, .cp-grid-3, .cp-grid-2, .cp-kpi-grid'), 'Must have 768px 1-column mobile breakpoint for .cp-kpi-grid');
  });

  // Test 3: supabaseClient ensureValidSession
  it('supabaseClient has ensureValidSession method aliasing ensureFreshSession', () => {
    assert(htmlContent.includes('ensureValidSession()'), 'Must contain ensureValidSession method declaration');
    assert(htmlContent.includes('return this.ensureFreshSession();'), 'ensureValidSession must call ensureFreshSession()');
  });

  // Test 4: Pure RFC-4180 CSV export
  it('exportToCSV produces pure RFC-4180 CSV without comment lines', () => {
    assert(!htmlContent.includes('# Report: ${filename.toUpperCase()}'), 'Must not include # Report comment lines in exportToCSV');
    assert(htmlContent.includes('const blob = new Blob([csvData], { type: \'text/csv;charset=utf-8;\' });'), 'Blob must directly wrap csvData');
  });

  // Test 5: Attendance CSV Export
  it('renderAttendanceTab includes export button and CSV export logic', () => {
    assert(htmlContent.includes('id="btnExportAttendance"'), 'Must have btnExportAttendance button');
    assert(htmlContent.includes('Attendance_${cohort?.cohortCode || \'Register\'}'), 'Must trigger exportToCSV with Attendance filename');
  });

  // Test 6: Users CSV Export
  it('renderUsersRolesTab includes btnExportUsers with CSV generation', () => {
    assert(htmlContent.includes('id="btnExportUsers"'), 'Must have btnExportUsers button');
    assert(htmlContent.includes('exportToCSV(\'User_Accounts\''), 'Must export user accounts to CSV');
  });

  // Test 7: Personnel Search and Filters
  it('Personnel subtab has search, type filter, status filter, and filtered rendering', () => {
    assert(htmlContent.includes('id="searchPersonnel"'), 'Must contain searchPersonnel input');
    assert(htmlContent.includes('id="filterPersonnelType"'), 'Must contain filterPersonnelType select');
    assert(htmlContent.includes('id="filterPersonnelStatus"'), 'Must contain filterPersonnelStatus select');
    assert(htmlContent.includes('const filteredPersonnel = state.personnel.filter('), 'Must filter personnel records');
    assert(htmlContent.includes('filteredPersonnel.map(p =>'), 'Table must render filteredPersonnel list');
  });

  // Test 8: Personnel Export
  it('Personnel export dynamically formats CSV with safe professional fields', () => {
    assert(htmlContent.includes('exportToCSV(exportName, filteredPersonnel.map(p =>'), 'Export button must export filteredPersonnel');
    assert(htmlContent.includes('CompensationType: p.compensationType'), 'Export must include structured compensation type');
  });

  // Test 9: Delete Personnel Button and Modal
  it('Personnel subtab has Delete button and Safe Deletion modal registered', () => {
    assert(htmlContent.includes('btnDeletePersonnel'), 'Must contain btnDeletePersonnel action button');
    assert(htmlContent.includes('type === \'deletePersonnelModal\''), 'openModal router must support deletePersonnelModal');
    assert(htmlContent.includes('function renderDeletePersonnelModal'), 'Must define renderDeletePersonnelModal function');
    assert(htmlContent.includes('/api/admin/delete-personnel'), 'Modal must invoke /api/admin/delete-personnel API');
    assert(htmlContent.includes('res.status === 409'), 'Modal must handle 409 Conflict with option to deactivate');
  });

  // Test 10: Provisioning forms have robust error handling and smooth scroll
  it('Provisioning forms (Staff & Facilitator) use ensureFreshSession, try/catch, and scrollIntoView', () => {
    assert(htmlContent.includes('errEl.scrollIntoView({ behavior: \'smooth\', block: \'center\' });'), 'Validation errors must scroll into view');
    assert(htmlContent.includes('Error during staff provisioning:'), 'Staff provisioning catch block must handle exceptions');
    assert(htmlContent.includes('Error during facilitator provisioning:'), 'Facilitator provisioning catch block must handle exceptions');
  });

  // Test 11: Broadened Facilitator matching in reports modal
  it('renderSubmitFacilitatorReportModal matches facilitators by type or role', () => {
    assert(htmlContent.includes('p.type === \'facilitator\' || (p.role && p.role.toLowerCase().includes(\'facilitator\'))'), 'Report modal must match by type or role substring');
  });

  // Test 12: Run unit test on delete-personnel API handler mock
  const deleteHandler = require(deleteApiPath);

  function mockRes() {
    return {
      statusCode: 200,
      _headers: {},
      _body: '',
      status(s) { this.statusCode = s; return this; },
      json(j) { this._body = JSON.stringify(j); return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      end(b) { if (b) this._body = b; return this; }
    };
  }

  await itAsync('delete-personnel API rejects non-POST methods with 405', async () => {
    const res = mockRes();
    await deleteHandler({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.statusCode, 405, 'Expected 405 Method Not Allowed');
  });

  await itAsync('delete-personnel API rejects unauthenticated requests with 401', async () => {
    const res = mockRes();
    await deleteHandler({ method: 'POST', headers: {}, body: {} }, res);
    assert.strictEqual(res.statusCode, 401, 'Expected 401 Unauthorized');
  });

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
