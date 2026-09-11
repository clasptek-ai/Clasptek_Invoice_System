/**
 * CLASPTEK PRODUCTION — ENQUIRIES TAB RESILIENCE & CRM WORKFLOW VERIFICATION SUITE
 * 
 * Tests:
 * 1. Empty enquiries array.
 * 2. Normal complete enquiry.
 * 3. Missing `name`.
 * 4. Missing `student_name`.
 * 5. null email.
 * 6. null phone.
 * 7. undefined programmeName.
 * 8. undefined status.
 * 9. numeric phone.
 * 10. mixed valid/invalid enquiries.
 * 11. case-insensitive search.
 * 12. trimming behavior.
 * 13. PostgreSQL `student_name` → application `name`.
 * 14. PostgreSQL `student_name` → application `studentName`.
 * 15. programme_id → programmeName resolution where programme exists.
 * 16. missing programme resolution.
 * 17. financial-status calculation with missing names.
 * 18. next-action calculation with missing names.
 * 19. zero PostgreSQL enquiry rows.
 * 20. tenant isolation.
 * 21. four-file SHA-256 parity verification.
 * 22. favicon existence / valid asset verification.
 * 23. Exact production reproduction: Gbenga Ogunsakin & Balogun Monday rows.
 * 24. fmtDate robust parsing of ISO timestamps, TIMESTAMPTZ, and dates; never Invalid Date.
 * 25. fmtEnquiryLoggedDate renders valid localized date/time, and Logged date unavailable fallback.
 * 26. formatWhatsAppUrl formats Nigerian telephone numbers safely (07086188424 -> 2347086188424).
 * 27. formatPhoneUrl and formatEmailUrl handle valid and missing channels safely.
 * 28. Prospect Journey renders Balogun Monday (#9106) with correct identification and contacts.
 * 29. Prospect Journey header renders valid timestamp and never contains Invalid Date.
 * 30. Contact prospect next action keeps drawer open and reveals in-drawer Contact & Follow-up panel.
 * 31. In-drawer panel provides all canonical contact methods and interaction outcomes.
 * 32. Direct contact action links point to stored details and disable missing channels safely.
 * 33. Stage safety invariant: saving follow-up without explicit progression preserves existing stage.
 * 34. Explicit stage progression to INTERESTED and INVOICE_REQUESTED updates status only when selected.
 * 35. Structured interaction is appended to timeline and note is appended to authoritative notes.
 * 36. Authoritative database persistence: dbRepo.saveRecord is called and audit log recorded.
 * 37. Re-rendering drawer shows newly saved interaction at the very top of Admissions & Follow-up History.
 * 38. Financial isolation: contact actions have ZERO effect on invoices, payments, totals, or balances.
 * 39. Defensive normalization: null/undefined optional enquiry fields do not crash drawer rendering.
 * 40. Table-row Contact Prospect button opens enquiryDetail with showContactForm: true.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('================================================================================');
console.log(' CLASPTEK ENQUIRIES TAB RESILIENCE & CRM PROSPECT JOURNEY SUITE');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================================\n');

// Load index.html for DOM/Script extraction
const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract key functions from index.html
function extractFunction(name) {
  const funcRegex = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\)\\s*\\{`);
  const match = html.match(funcRegex);
  if (!match) throw new Error(`Function ${name} not found in index.html`);
  const startIndex = match.index;
  const bodyStartIndex = startIndex + match[0].length - 1;
  let braceCount = 1;
  let inString = false;
  let stringChar = '';
  for (let i = bodyStartIndex + 1; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (char === stringChar && html[i - 1] !== '\\') inString = false;
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return html.substring(startIndex, i + 1);
        }
      }
    }
  }
  throw new Error(`Could not find end of function ${name}`);
}

// Build mock DOM elements
function createMockElement(id = '') {
  const listeners = {};
  return {
    id,
    dataset: {},
    value: '',
    style: {},
    disabled: false,
    textContent: '',
    innerHTML: '',
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    click: async () => {
      if (listeners['click']) {
        const fns = [...listeners['click']];
        for (const fn of fns) {
          await fn();
        }
      }
    },
    focus: () => {},
    scrollIntoView: () => {},
    querySelectorAll: () => []
  };
}

const mockElements = {};
function getOrCreateMockElement(id) {
  if (!mockElements[id]) mockElements[id] = createMockElement(id);
  return mockElements[id];
}

function createMockContainer(id = '') {
  const el = createMockElement(id);
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(val) {
      _html = val;
      for (const k in mockElements) {
        delete mockElements[k];
      }
    }
  });
  return el;
}

const mockDocument = {
  getElementById: (id) => getOrCreateMockElement(id),
  querySelectorAll: () => []
};

// Evaluate environment in context
const transformEntityFromPostgresCode = extractFunction('transformEntityFromPostgres');
const transformEntityForPostgresCode = extractFunction('transformEntityForPostgres');
const getEnquiryFinancialStatusCode = extractFunction('getEnquiryFinancialStatus');
const getEnquiryNextActionCode = extractFunction('getEnquiryNextAction');
const renderEnquiriesTabCode = extractFunction('renderEnquiriesTab');
const fmtDateCode = extractFunction('fmtDate');
const fmtEnquiryLoggedDateCode = extractFunction('fmtEnquiryLoggedDate');
const formatWhatsAppUrlCode = extractFunction('formatWhatsAppUrl');
const formatPhoneUrlCode = extractFunction('formatPhoneUrl');
const formatEmailUrlCode = extractFunction('formatEmailUrl');
const renderEnquiryDetailModalCode = extractFunction('renderEnquiryDetailModal');

const contextCode = `
  const state = {
    filters: { enquirySearch: '', enquiryStatus: 'all' },
    enquiries: [],
    invoices: [],
    payments: [],
    enrolments: [],
    programmes: [
      { id: 'prog_1788900434260_uujj7', name: 'Executive Cloud Engineering' },
      { id: 'prog_cyber_101', name: 'Cybersecurity Operations' }
    ],
    counters: { enquiry: 1001 },
    modal: null,
    auth: { user: { name: 'Admissions Officer' } }
  };

  const document = mockDocument;
  function escapeHtml(s) { 
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function canRecord() { return true; }
  function exportToCSV() {}
  let lastModalOpened = null;
  function openModal(type, data = {}) {
    lastModalOpened = { type, data };
    state.modal = { type, data };
  }
  let closeModalCalled = false;
  function closeModal() {
    closeModalCalled = true;
    state.modal = null;
  }
  function render() {}
  function safeRound(n) { return Math.round(n * 100) / 100; }
  function fmtMoney(n) {
    const v = safeRound(n);
    const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-\\u20a6' : '\\u20a6') + absFormatted;
  }
  function invoiceBalance(inv) { return { total: inv.total || 0, paid: inv.amountPaid || 0, balance: (inv.total || 0) - (inv.amountPaid || 0) }; }

  const STORE_KEY_ENQUIRIES = 'clasptek_enquiries';
  const STORE_KEY_INVOICES = 'clasptek:invoices';
  const STORE_KEY_PAYMENTS = 'clasptek:payments';
  let allSavedDbRecords = [];
  let lastSavedDbRecord = null;
  let lastAuditLog = null;
  let simulateAuditFailure = false;
  const dbRepo = {
    async saveRecord(storeKey, record) {
      const entry = { storeKey, record: JSON.parse(JSON.stringify(record)) };
      lastSavedDbRecord = entry;
      allSavedDbRecords.push(entry);
      return record;
    }
  };
  async function safeSet(key, val) { return true; }
  async function logAudit(action, entity, id, desc, oldVal, newVal) {
    if (simulateAuditFailure) {
      throw new Error('RLS 403: new row violates row-level security policy for table "finance_audit_log"');
    }
    lastAuditLog = { action, entity, id, desc, oldVal, newVal };
    return true;
  }

  ${fmtDateCode}
  ${fmtEnquiryLoggedDateCode}
  ${formatWhatsAppUrlCode}
  ${formatPhoneUrlCode}
  ${formatEmailUrlCode}
  ${transformEntityFromPostgresCode}
  ${transformEntityForPostgresCode}
  ${getEnquiryFinancialStatusCode}
  ${getEnquiryNextActionCode}
  ${renderEnquiriesTabCode}
  ${renderEnquiryDetailModalCode}

  ({
    state,
    fmtDate,
    fmtEnquiryLoggedDate,
    formatWhatsAppUrl,
    formatPhoneUrl,
    formatEmailUrl,
    transformEntityFromPostgres,
    transformEntityForPostgres,
    getEnquiryFinancialStatus,
    getEnquiryNextAction,
    renderEnquiriesTab,
    renderEnquiryDetailModal,
    openModal,
    closeModal,
    getLastModalOpened: () => lastModalOpened,
    getCloseModalCalled: () => closeModalCalled,
    resetCloseModalCalled: () => { closeModalCalled = false; },
    getLastSavedDbRecord: () => lastSavedDbRecord,
    getAllSavedDbRecords: () => allSavedDbRecords,
    clearSavedDbRecords: () => { allSavedDbRecords = []; lastSavedDbRecord = null; },
    getLastAuditLog: () => lastAuditLog,
    setSimulateAuditFailure: (val) => { simulateAuditFailure = Boolean(val); },
    mockElements,
    getMockElement: (id) => getOrCreateMockElement(id)
  });
`;

const app = eval(contextCode);

let passed = 0;
let total = 0;

async function runTest(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✔ [PASS ${total.toString().padStart(2, '0')}] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL ${total.toString().padStart(2, '0')}] ${desc}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

async function runAllSuites() {

// ----------------------------------------------------
// 1. Empty enquiries array
// ----------------------------------------------------
runTest('1. Empty enquiries array renders professional empty state without crashing', () => {
  app.state.enquiries = [];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('No enquiries match your filter'), 'Should render empty state message');
});

// ----------------------------------------------------
// 2. Normal complete enquiry
// ----------------------------------------------------
runTest('2. Normal complete enquiry renders with all expected fields', () => {
  app.state.enquiries = [{
    id: 'enq_101',
    name: 'Ada Lovelace',
    email: 'ada@computing.org',
    phone: '08012345678',
    programmeName: 'Executive Cloud Engineering',
    source: 'Website',
    status: 'NEW',
    enquiryDate: '2026-09-01'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Ada Lovelace'), 'Should render name');
  assert(container.innerHTML.includes('08012345678'), 'Should render phone');
  assert(container.innerHTML.includes('Executive Cloud Engineering'), 'Should render programme');
});

// ----------------------------------------------------
// 3. Missing name is safely resolved to studentName or fallback
// ----------------------------------------------------
runTest('3. Missing name is safely resolved to studentName or fallback', () => {
  app.state.enquiries = [{
    id: 'enq_102',
    studentName: 'Charles Babbage',
    phone: '08099998888',
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Charles Babbage'), 'Should render studentName as name');
});

// ----------------------------------------------------
// 4. Missing both name and studentName displays Unnamed Prospect without throwing
// ----------------------------------------------------
runTest('4. Missing both name and studentName displays Unnamed Prospect without throwing', () => {
  app.state.enquiries = [{
    id: 'enq_103',
    phone: '08011112222',
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Unnamed Prospect'), 'Should render fallback');
});

// ----------------------------------------------------
// 5. null email does not crash renderer or search
// ----------------------------------------------------
runTest('5. null email does not crash renderer or search', () => {
  app.state.enquiries = [{
    id: 'enq_104',
    name: 'Grace Hopper',
    email: null,
    phone: '08033334444',
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.state.filters.enquirySearch = 'Grace';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Grace Hopper'), 'Should filter safely');
  app.state.filters.enquirySearch = '';
});

// ----------------------------------------------------
// 6. null phone does not crash renderer or search
// ----------------------------------------------------
runTest('6. null phone does not crash renderer or search', () => {
  app.state.enquiries = [{
    id: 'enq_105',
    name: 'Alan Turing',
    email: 'alan@bletchley.uk',
    phone: null,
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.state.filters.enquirySearch = 'alan';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Alan Turing'), 'Should filter safely');
  app.state.filters.enquirySearch = '';
});

// ----------------------------------------------------
// 7. undefined programmeName falls back to General Tech Programme
// ----------------------------------------------------
runTest('7. undefined programmeName falls back to General Tech Programme', () => {
  app.state.enquiries = [{
    id: 'enq_106',
    name: 'Katherine Johnson',
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('General Tech Programme'), 'Should display fallback programme');
});

// ----------------------------------------------------
// 8. undefined status defaults to NEW without throwing toLowerCase()
// ----------------------------------------------------
runTest('8. undefined status defaults to NEW without throwing toLowerCase()', () => {
  app.state.enquiries = [{
    id: 'enq_107',
    name: 'Margaret Hamilton',
    status: undefined
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Margaret Hamilton'), 'Should render without status error');
  assert(container.innerHTML.includes('NEW'), 'Should default status to NEW');
});

// ----------------------------------------------------
// 9. numeric phone is coerced safely without type errors
// ----------------------------------------------------
runTest('9. numeric phone is coerced safely without type errors', () => {
  app.state.enquiries = [{
    id: 'enq_108',
    name: 'Tim Berners-Lee',
    phone: 7086188424,
    status: 'NEW'
  }];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.state.filters.enquirySearch = '70861';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Tim Berners-Lee'), 'Should search numeric phone');
  app.state.filters.enquirySearch = '';
});

// ----------------------------------------------------
// 10. Mixed array of valid, partial, and null records does not crash renderer
// ----------------------------------------------------
runTest('10. Mixed array of valid, partial, and null records does not crash renderer', () => {
  app.state.enquiries = [
    { id: 'enq_a', name: 'Valid User', email: 'v@u.com', phone: '0800', status: 'NEW' },
    { id: 'enq_b', name: undefined, email: null, phone: null, status: null },
    null,
    undefined,
    { id: 'enq_c', studentName: 'Alias User', status: 'INTERESTED' }
  ];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Valid User'), 'Valid user rendered');
  assert(container.innerHTML.includes('Alias User'), 'Alias user rendered');
});

// ----------------------------------------------------
// 11. Search operates case-insensitively across name, phone, email, programme
// ----------------------------------------------------
runTest('11. Search operates case-insensitively across name, phone, email, programme', () => {
  app.state.enquiries = [
    { id: 'enq_1', name: 'John Doe', email: 'JD@TEST.COM', phone: '08098765432', programmeName: 'Cybersecurity' }
  ];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  
  app.state.filters.enquirySearch = 'john';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('John Doe'), 'Matches lowercase query against name');

  app.state.filters.enquirySearch = 'jd@test';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('John Doe'), 'Matches query against uppercase email');

  app.state.filters.enquirySearch = 'CYBER';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('John Doe'), 'Matches uppercase query against programme');
  app.state.filters.enquirySearch = '';
});

// ----------------------------------------------------
// 12. Whitespace-padded search query trims safely without failing matches
// ----------------------------------------------------
runTest('12. Whitespace-padded search query trims safely without failing matches', () => {
  app.state.enquiries = [
    { id: 'enq_2', name: 'Alice Walker', status: 'NEW' }
  ];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.state.filters.enquirySearch = '   alice   ';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Alice Walker'), 'Matches padded search');
  app.state.filters.enquirySearch = '';
});

// ----------------------------------------------------
// 13. transformEntityFromPostgres maps student_name to name
// ----------------------------------------------------
runTest('13. transformEntityFromPostgres maps student_name to name', () => {
  const pgRow = {
    id: 'enq_pg_1',
    student_name: 'Postgres Prospect',
    email: 'pg@clasptek.org',
    created_at: '2026-09-09T10:00:00.000Z'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.name, 'Postgres Prospect');
});

// ----------------------------------------------------
// 14. transformEntityFromPostgres maps student_name to studentName alias
// ----------------------------------------------------
runTest('14. transformEntityFromPostgres maps student_name to studentName alias', () => {
  const pgRow = {
    id: 'enq_pg_2',
    student_name: 'Postgres Alias',
    created_at: '2026-09-09T10:00:00.000Z'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.studentName, 'Postgres Alias');
});

// ----------------------------------------------------
// 15. programme_id is resolved to canonical programmeName from state.programmes
// ----------------------------------------------------
runTest('15. programme_id is resolved to canonical programmeName from state.programmes', () => {
  const pgRow = {
    id: 'enq_pg_3',
    student_name: 'Candidate A',
    programme_id: 'prog_1788900434260_uujj7'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.programmeName, 'Executive Cloud Engineering');
});

// ----------------------------------------------------
// 16. Unresolvable programme_id does not throw and defaults cleanly
// ----------------------------------------------------
runTest('16. Unresolvable programme_id does not throw and defaults cleanly', () => {
  const pgRow = {
    id: 'enq_pg_4',
    student_name: 'Candidate B',
    programme_id: 'prog_non_existent'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.programmeName, '');
});

// ----------------------------------------------------
// 17. getEnquiryFinancialStatus handles null/undefined names without crashing
// ----------------------------------------------------
runTest('17. getEnquiryFinancialStatus handles null/undefined names without crashing', () => {
  const fin1 = app.getEnquiryFinancialStatus(null);
  assert.strictEqual(fin1.status, 'NO_INVOICE');
  const fin2 = app.getEnquiryFinancialStatus({ id: 'enq_no_name' });
  assert.strictEqual(fin2.status, 'NO_INVOICE');
});

// ----------------------------------------------------
// 18. getEnquiryNextAction handles null/undefined names without crashing
// ----------------------------------------------------
runTest('18. getEnquiryNextAction handles null/undefined names without crashing', () => {
  const act1 = app.getEnquiryNextAction(null);
  assert.strictEqual(act1.action, 'view');
  const act2 = app.getEnquiryNextAction({ id: 'enq_no_name', status: 'NEW' });
  assert.strictEqual(act2.action, 'contact');
});

// ----------------------------------------------------
// 19. Zero PostgreSQL enquiry rows hydrated produces empty array without error
// ----------------------------------------------------
runTest('19. Zero PostgreSQL enquiry rows hydrated produces empty array without error', () => {
  const rawRows = [];
  const transformed = rawRows.map(r => app.transformEntityFromPostgres('enquiries', r));
  assert.deepStrictEqual(transformed, []);
});

// ----------------------------------------------------
// 20. tenantId is preserved on transformed enquiries
// ----------------------------------------------------
runTest('20. tenantId is preserved on transformed enquiries', () => {
  const pgRow = {
    id: 'enq_pg_5',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Tenant User'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.tenantId, 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6');
});

// ----------------------------------------------------
// 21. 100% SHA-256 byte parity across all 4 production distribution files
// ----------------------------------------------------
runTest('21. 100% SHA-256 byte parity across all 4 production distribution files', () => {
  const files = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'clasptek_invoice_system.html'),
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'public', 'clasptek_invoice_system.html')
  ];

  const hashes = files.map(f => {
    const data = fs.readFileSync(f);
    return crypto.createHash('sha256').update(data).digest('hex');
  });

  const unique = new Set(hashes);
  assert.strictEqual(unique.size, 1, `All 4 files must have identical SHA-256 hashes, found ${unique.size}: ${hashes.join(', ')}`);
});

// ----------------------------------------------------
// 22. Favicon assets exist in public/ and root and link is present in head
// ----------------------------------------------------
runTest('22. Favicon assets exist in public/ and root and link is present in head', () => {
  const publicFavicon = path.join(__dirname, 'public', 'favicon.ico');
  const rootFavicon = path.join(__dirname, 'favicon.ico');
  assert(fs.existsSync(publicFavicon), 'public/favicon.ico must exist');
  assert(fs.existsSync(rootFavicon), 'favicon.ico must exist in root');
  assert(fs.statSync(publicFavicon).size > 0, 'public/favicon.ico must not be empty');
  assert(html.includes('<link rel="icon"'), 'index.html must include link rel="icon"');
});

// ----------------------------------------------------
// 23. EXACT PRODUCTION REPRODUCTION: Gbenga Ogunsakin & Balogun Monday rows render cleanly
// ----------------------------------------------------
runTest('23. EXACT PRODUCTION REPRODUCTION: Gbenga Ogunsakin & Balogun Monday rows render cleanly', () => {
  const prodRows = [
    {
      id: 'enq_1788950346131',
      tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      student_name: 'Gbenga Ogunsakin',
      email: null,
      phone: '07086188424',
      programme_id: 'prog_1788900434260_uujj7',
      source: 'Website',
      status: 'NEW',
      notes: 'He is a good boy. He is willing to start tomorrow',
      created_at: '2026-09-09T10:39:06.131+00:00',
      updated_at: '2026-09-09T10:39:06.131+00:00'
    },
    {
      id: 'enq_1789046129106',
      tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      student_name: 'Balogun Monday',
      email: 'balogunmonday@gmail.com',
      phone: '07086188424',
      programme_id: 'prog_1788900434260_uujj7',
      source: 'Website',
      status: 'NEW',
      notes: 'His is interested',
      created_at: '2026-09-10T13:15:29.106+00:00',
      updated_at: '2026-09-10T13:15:29.11+00:00'
    }
  ];

  const transformed = prodRows.map(r => app.transformEntityFromPostgres('enquiries', r));
  assert.strictEqual(transformed[0].name, 'Gbenga Ogunsakin');
  assert.strictEqual(transformed[0].email, '');
  assert.strictEqual(transformed[0].programmeName, 'Executive Cloud Engineering');
  assert.strictEqual(transformed[1].name, 'Balogun Monday');
  assert.strictEqual(transformed[1].programmeName, 'Executive Cloud Engineering');

  app.state.enquiries = transformed;
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);

  assert(container.innerHTML.includes('Gbenga Ogunsakin'), 'Gbenga Ogunsakin must render');
  assert(container.innerHTML.includes('Balogun Monday'), 'Balogun Monday must render');
  assert(container.innerHTML.includes('Executive Cloud Engineering'), 'Resolved programme must render');
  assert(container.innerHTML.includes('07086188424'), 'Phone number must render');
  assert(container.innerHTML.includes('Contact Prospect'), 'Next action Contact Prospect must render');
});

// ----------------------------------------------------
// 24. fmtDate robust parsing of ISO timestamps, TIMESTAMPTZ, and dates; never Invalid Date
// ----------------------------------------------------
runTest('24. fmtDate robust parsing of ISO timestamps, TIMESTAMPTZ, and dates; never Invalid Date', () => {
  const isoVal = '2026-09-10T13:15:29.106+00:00';
  const formatted = app.fmtDate(isoVal);
  assert(!formatted.includes('Invalid Date'), 'Must not evaluate to Invalid Date');
  assert(formatted.includes('2026'), 'Must contain year 2026');
  assert(formatted.includes('10'), 'Must contain day 10');

  // Test other valid formats
  assert(app.fmtDate('2026-09-10').includes('2026'), 'Handles YYYY-MM-DD');
  assert(app.fmtDate(new Date('2026-09-10')).includes('2026'), 'Handles Date object');
  assert(app.fmtDate(1789046129106).includes('2026'), 'Handles numeric timestamp');
});

// ----------------------------------------------------
// 25. fmtEnquiryLoggedDate renders valid localized date/time, and Logged date unavailable fallback
// ----------------------------------------------------
runTest('25. fmtEnquiryLoggedDate renders valid localized date/time, and Logged date unavailable fallback', () => {
  const ts = '2026-09-10T13:15:29.106+00:00';
  const res = app.fmtEnquiryLoggedDate(ts);
  assert(res.startsWith('Logged '), 'Must start with Logged');
  assert(!res.includes('Invalid Date'), 'Must never output Invalid Date');
  assert(res.includes('2026'), 'Must contain year 2026');

  // Test fallback cases
  assert.strictEqual(app.fmtEnquiryLoggedDate(null), 'Logged date unavailable');
  assert.strictEqual(app.fmtEnquiryLoggedDate(undefined), 'Logged date unavailable');
  assert.strictEqual(app.fmtEnquiryLoggedDate(''), 'Logged date unavailable');
  assert.strictEqual(app.fmtEnquiryLoggedDate('Invalid Date'), 'Logged date unavailable');
  assert.strictEqual(app.fmtEnquiryLoggedDate('nonsense_string'), 'Logged date unavailable');
});

// ----------------------------------------------------
// 26. formatWhatsAppUrl formats Nigerian telephone numbers safely
// ----------------------------------------------------
runTest('26. formatWhatsAppUrl formats Nigerian telephone numbers safely (07086188424 -> 2347086188424)', () => {
  assert.strictEqual(app.formatWhatsAppUrl('07086188424'), 'https://wa.me/2347086188424');
  assert.strictEqual(app.formatWhatsAppUrl('+234 708 618 8424'), 'https://wa.me/2347086188424');
  assert.strictEqual(app.formatWhatsAppUrl('2347086188424'), 'https://wa.me/2347086188424');
  assert.strictEqual(app.formatWhatsAppUrl(null), '');
  assert.strictEqual(app.formatWhatsAppUrl(''), '');
});

// ----------------------------------------------------
// 27. formatPhoneUrl and formatEmailUrl handle valid and missing channels safely
// ----------------------------------------------------
runTest('27. formatPhoneUrl and formatEmailUrl handle valid and missing channels safely', () => {
  assert.strictEqual(app.formatPhoneUrl('07086188424'), 'tel:07086188424');
  assert.strictEqual(app.formatPhoneUrl(''), '');
  assert.strictEqual(app.formatPhoneUrl(null), '');

  assert.strictEqual(app.formatEmailUrl('balogunmonday@gmail.com'), 'mailto:balogunmonday@gmail.com');
  assert.strictEqual(app.formatEmailUrl(''), '');
  assert.strictEqual(app.formatEmailUrl(null), '');
});

// ----------------------------------------------------
// 28. Prospect Journey renders Balogun Monday (#9106) with correct identification and contacts
// ----------------------------------------------------
runTest('28. Prospect Journey renders Balogun Monday (#9106) with correct identification and contacts', () => {
  const balogunEnquiry = {
    id: 'enq_1789046129106',
    enquiryNo: '9106',
    name: 'Balogun Monday',
    email: 'balogunmonday@gmail.com',
    phone: '07086188424',
    programmeName: 'Cybersecurity',
    source: 'Website',
    status: 'NEW',
    enquiryDate: '2026-09-10T13:15:29.106+00:00'
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, balogunEnquiry);

  assert(container.innerHTML.includes('Balogun Monday'), 'Should render Balogun Monday');
  assert(container.innerHTML.includes('9106'), 'Should render enquiry reference 9106');
  assert(container.innerHTML.includes('Cybersecurity'), 'Should render programme Cybersecurity');
  assert(container.innerHTML.includes('07086188424'), 'Should render phone 07086188424');
  assert(container.innerHTML.includes('balogunmonday@gmail.com'), 'Should render email balogunmonday@gmail.com');
});

// ----------------------------------------------------
// 29. Prospect Journey header renders valid timestamp and never contains Invalid Date
// ----------------------------------------------------
runTest('29. Prospect Journey header renders valid timestamp and never contains Invalid Date', () => {
  const balogunEnquiry = {
    id: 'enq_1789046129106',
    enquiryNo: '9106',
    name: 'Balogun Monday',
    enquiryDate: '2026-09-10T13:15:29.106+00:00'
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, balogunEnquiry);

  assert(!container.innerHTML.includes('Invalid Date'), 'Must NOT contain Invalid Date');
  assert(container.innerHTML.includes('Logged '), 'Header must contain Logged timestamp');
});

// ----------------------------------------------------
// 30. Contact prospect next action keeps drawer open and reveals in-drawer Contact & Follow-up panel
// ----------------------------------------------------
await runTest('30. Contact prospect next action keeps drawer open and reveals in-drawer Contact & Follow-up panel', async () => {
  const balogunEnquiry = {
    id: 'enq_1789046129106',
    name: 'Balogun Monday',
    status: 'NEW',
    phone: '07086188424',
    email: 'balogunmonday@gmail.com'
  };

  const container = createMockElement('drawerContainer');
  app.resetCloseModalCalled();
  app.renderEnquiryDetailModal(container, balogunEnquiry);

  const btnNextAct = app.getMockElement('btnDrawerNextAct');
  assert(btnNextAct, 'btnDrawerNextAct must exist');

  // Trigger click on "Contact Prospect" button
  await btnNextAct.click();

  // Invariant 1: closeModal must NOT have been called
  assert.strictEqual(app.getCloseModalCalled(), false, 'Contact prospect must NOT call closeModal()');

  // Invariant 2: In-drawer panel is made visible
  const panel = app.getMockElement('contactFollowUpPanel');
  assert.strictEqual(panel.style.display, 'block', 'Contact & Follow-up panel must be displayed');
});

// ----------------------------------------------------
// 31. In-drawer panel provides all canonical contact methods and interaction outcomes
// ----------------------------------------------------
await runTest('31. In-drawer panel provides all canonical contact methods and interaction outcomes', () => {
  const balogunEnquiry = {
    id: 'enq_1789046129106',
    name: 'Balogun Monday',
    status: 'NEW'
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, balogunEnquiry);

  // Check canonical contact methods
  const methods = ['WhatsApp', 'Phone Call', 'Email', 'In-Person Consultation', 'Online Video Meeting'];
  methods.forEach(m => {
    assert(container.innerHTML.includes(`value="${m}"`), `Canonical method ${m} must be an option`);
  });

  // Check canonical outcomes
  const outcomes = [
    'Contacted — Interested',
    'Contacted — Needs More Information',
    'No Response',
    'Follow Up Later',
    'Not Interested',
    'Wrong Number'
  ];
  outcomes.forEach(o => {
    assert(container.innerHTML.includes(`value="${o}"`), `Canonical outcome ${o} must be an option`);
  });
});

// ----------------------------------------------------
// 32. Direct contact action links point to stored details and disable missing channels safely
// ----------------------------------------------------
await runTest('32. Direct contact action links point to stored details and disable missing channels safely', () => {
  const completeEnq = {
    id: 'enq_1',
    name: 'Balogun Monday',
    phone: '07086188424',
    email: 'balogunmonday@gmail.com',
    status: 'NEW'
  };
  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, completeEnq);

  assert(container.innerHTML.includes('https://wa.me/2347086188424'), 'WhatsApp action link formatted');
  assert(container.innerHTML.includes('tel:07086188424'), 'Phone action link formatted');
  assert(container.innerHTML.includes('mailto:balogunmonday@gmail.com'), 'Email action link formatted');

  // Missing phone / email enquiry
  const missingEnq = { id: 'enq_2', name: 'No Contact', phone: null, email: null, status: 'NEW' };
  app.renderEnquiryDetailModal(container, missingEnq);

  assert(container.innerHTML.includes('WhatsApp (Unavailable)'), 'Missing phone disables WhatsApp');
  assert(container.innerHTML.includes('Phone (Unavailable)'), 'Missing phone disables Phone');
  assert(container.innerHTML.includes('Email (Unavailable)'), 'Missing email disables Email');
});

// ----------------------------------------------------
// 33. Stage safety invariant: saving follow-up without explicit progression preserves existing stage
// ----------------------------------------------------
await runTest('33. Stage safety invariant: saving follow-up without explicit progression preserves existing stage', async () => {
  const enq = {
    id: 'enq_stage_test',
    name: 'Balogun Monday',
    status: 'NEW',
    notes: 'Initial enquiry',
    timeline: []
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enq);

  // Mock form inputs with no stage change (Keep Current Stage)
  app.getMockElement('fupMethod').value = 'WhatsApp';
  app.getMockElement('fupOutcome').value = 'Contacted — Interested';
  app.getMockElement('fupNotes').value = 'Candidate expressed excitement for curriculum';
  app.getMockElement('fupNextDate').value = '2026-09-15';
  app.getMockElement('fupStageSelect').value = ''; // Keep Current Stage

  const btnSave = app.getMockElement('btnSaveFollowUp');
  await btnSave.click();

  // Check persisted record
  const saved = app.getLastSavedDbRecord();
  assert(saved && saved.record, 'Record must be saved to DB');
  assert.strictEqual(saved.record.status, 'NEW', 'Status must remain NEW when user did not choose stage progression');
});

// ----------------------------------------------------
// 34. Explicit stage progression to INTERESTED and INVOICE_REQUESTED updates status only when selected
// ----------------------------------------------------
await runTest('34. Explicit stage progression to INTERESTED and INVOICE_REQUESTED updates status only when selected', async () => {
  const enq = {
    id: 'enq_stage_prog',
    name: 'Balogun Monday',
    status: 'NEW',
    timeline: []
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enq);

  // Test 1: Advance to INTERESTED
  app.getMockElement('fupMethod').value = 'Phone Call';
  app.getMockElement('fupOutcome').value = 'Contacted — Interested';
  app.getMockElement('fupStageSelect').value = 'INTERESTED';
  await app.getMockElement('btnSaveFollowUp').click();

  let saved = app.getLastSavedDbRecord();
  assert.strictEqual(saved.record.status, 'INTERESTED', 'Status must advance to INTERESTED');

  // Test 2: Advance to INVOICE_REQUESTED
  app.getMockElement('fupStageSelect').value = 'INVOICE_REQUESTED';
  await app.getMockElement('btnSaveFollowUp').click();

  saved = app.getLastSavedDbRecord();
  assert.strictEqual(saved.record.status, 'INVOICE_REQUESTED', 'Status must advance to INVOICE_REQUESTED');
});

// ----------------------------------------------------
// 35. Structured interaction is appended to timeline and note is appended to authoritative notes
// ----------------------------------------------------
await runTest('35. Structured interaction is appended to timeline and note is appended to authoritative notes', async () => {
  const existingTimeline = [{ stage: 'NEW', note: 'Created in portal', timestamp: '2026-09-10T10:00:00Z', actor: 'System' }];
  const enq = {
    id: 'enq_timeline_test',
    name: 'Balogun Monday',
    status: 'NEW',
    notes: 'Prior notes',
    timeline: [...existingTimeline]
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enq);

  app.getMockElement('fupMethod').value = 'WhatsApp';
  app.getMockElement('fupOutcome').value = 'Contacted — Needs More Information';
  app.getMockElement('fupNotes').value = 'Asked for installment schedule';
  app.getMockElement('fupNextDate').value = '2026-09-16';
  app.getMockElement('fupStageSelect').value = '';

  await app.getMockElement('btnSaveFollowUp').click();

  const saved = app.getLastSavedDbRecord();
  assert.strictEqual(saved.record.timeline.length, 2, 'Timeline must have 2 entries');
  assert.strictEqual(saved.record.timeline[0].note, 'Created in portal', 'Existing timeline entry preserved');
  assert.strictEqual(saved.record.timeline[1].method, 'WhatsApp', 'New interaction method recorded');
  assert.strictEqual(saved.record.timeline[1].outcome, 'Contacted — Needs More Information', 'Outcome recorded');
  assert.strictEqual(saved.record.timeline[1].nextFollowUp, '2026-09-16', 'Next follow-up recorded');

  // Notes field appended
  assert(saved.record.notes.includes('Prior notes'), 'Prior notes must not be deleted');
  assert(saved.record.notes.includes('Asked for installment schedule'), 'New notes must be appended');
});

// ----------------------------------------------------
// 36. Authoritative database persistence: dbRepo.saveRecord is called and audit log recorded
// ----------------------------------------------------
await runTest('36. Authoritative database persistence: dbRepo.saveRecord is called and audit log recorded', async () => {
  const enq = { id: 'enq_auth_test', name: 'Balogun Monday', status: 'NEW', timeline: [] };
  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enq);

  app.getMockElement('fupMethod').value = 'Email';
  app.getMockElement('fupOutcome').value = 'No Response';
  await app.getMockElement('btnSaveFollowUp').click();

  const saved = app.getLastSavedDbRecord();
  assert.strictEqual(saved.storeKey, 'clasptek_enquiries', 'Must persist to clasptek_enquiries');

  const audit = app.getLastAuditLog();
  assert(audit, 'Audit log must be recorded');
  assert.strictEqual(audit.action, 'LOG_ENQUIRY_FOLLOWUP', 'Audit action must be LOG_ENQUIRY_FOLLOWUP');
  assert.strictEqual(audit.id, 'enq_auth_test', 'Audit record ID matches');
});

// ----------------------------------------------------
// 37. Re-rendering drawer shows newly saved interaction at the very top of Admissions & Follow-up History
// ----------------------------------------------------
await runTest('37. Re-rendering drawer shows newly saved interaction at the very top of Admissions & Follow-up History', () => {
  const enqWithHistory = {
    id: 'enq_hist_order',
    name: 'Balogun Monday',
    status: 'NEW',
    timeline: [
      { stage: 'NEW', note: 'First contact in history', timestamp: '2026-09-08T09:00:00Z', actor: 'Staff A' },
      { stage: 'NEW', method: 'WhatsApp', outcome: 'Contacted — Interested', note: 'Brand new interaction at top', timestamp: '2026-09-11T11:00:00Z', actor: 'Staff B' }
    ]
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enqWithHistory);

  const idxNewest = container.innerHTML.indexOf('Brand new interaction at top');
  const idxOldest = container.innerHTML.indexOf('First contact in history');
  assert(idxNewest < idxOldest, 'Newest interaction must appear before oldest in HTML (top of history)');
});

// ----------------------------------------------------
// 38. Financial isolation: contact actions have ZERO effect on invoices, payments, totals, or balances
// ----------------------------------------------------
await runTest('38. Financial isolation: contact actions have ZERO effect on invoices, payments, totals, or balances', async () => {
  const initialInvoiceCount = app.state.invoices.length;
  const enq = {
    id: 'enq_fin_safe',
    name: 'Balogun Monday',
    status: 'NEW',
    timeline: []
  };

  const container = createMockElement('drawerContainer');
  app.renderEnquiryDetailModal(container, enq);

  // Execute save follow-up
  app.getMockElement('fupMethod').value = 'Phone Call';
  app.getMockElement('fupOutcome').value = 'Contacted — Interested';
  await app.getMockElement('btnSaveFollowUp').click();

  // Invariant 1: No invoice created
  assert.strictEqual(app.state.invoices.length, initialInvoiceCount, 'Zero invoices created');

  // Invariant 2: Financial calculation unchanged
  const fin = app.getEnquiryFinancialStatus(enq);
  assert.strictEqual(fin.status, 'NO_INVOICE', 'Financial status must remain NO_INVOICE');
  assert.strictEqual(fin.total, 0, 'Total invoiced must remain 0');
  assert.strictEqual(fin.paid, 0, 'Amount paid must remain 0');
  assert.strictEqual(fin.balance, 0, 'Balance must remain 0');
});

// ----------------------------------------------------
// 39. Defensive normalization: null/undefined optional enquiry fields do not crash drawer rendering
// ----------------------------------------------------
await runTest('39. Defensive normalization: null/undefined optional enquiry fields do not crash drawer rendering', () => {
  const minimalEnquiry = {
    id: 'enq_minimal',
    name: undefined,
    studentName: null,
    phone: null,
    email: undefined,
    programmeName: null,
    source: undefined,
    assignedStaff: null,
    notes: null,
    timeline: null,
    status: undefined,
    enquiryDate: null,
    createdAt: null
  };

  const container = createMockElement('drawerContainer');
  // Must not throw TypeError
  app.renderEnquiryDetailModal(container, minimalEnquiry);
  assert(container.innerHTML.includes('Prospective Student'), 'Safely renders fallback name');
  assert(container.innerHTML.includes('General Tech Programme'), 'Safely renders fallback programme');
  assert(container.innerHTML.includes('Logged date unavailable'), 'Safely renders fallback logged date');
  assert(!container.innerHTML.includes('Invalid Date'), 'Must NOT contain Invalid Date');
});

// ----------------------------------------------------
// 40. Table-row Contact Prospect button opens enquiryDetail with showContactForm: true
// ----------------------------------------------------
await runTest('40. Table-row Contact Prospect button opens enquiryDetail with showContactForm: true', () => {
  const enq = {
    id: 'enq_row_click',
    name: 'Balogun Monday',
    status: 'NEW'
  };
  app.state.enquiries = [enq];

  let nextActionClickListener = null;
  const mockTableContainer = {
    innerHTML: '',
    querySelectorAll: (sel) => {
      if (sel === '.btnNextAction') {
        return [{
          dataset: { id: 'enq_row_click', action: 'contact' },
          addEventListener: (evt, fn) => {
            if (evt === 'click') nextActionClickListener = fn;
          }
        }];
      }
      return [];
    }
  };

  app.renderEnquiriesTab(mockTableContainer);
  assert(typeof nextActionClickListener === 'function', 'btnNextAction click listener must be attached');

  // Trigger click on table action
  nextActionClickListener();

  const lastOpened = app.getLastModalOpened();
  assert(lastOpened, 'Modal must have been opened');
  assert.strictEqual(lastOpened.type, 'enquiryDetail', 'Modal type must be enquiryDetail');
  assert.strictEqual(lastOpened.data.enquiry.id, 'enq_row_click', 'Must pass clicked enquiry');
  assert.strictEqual(lastOpened.data.showContactForm, true, 'showContactForm must be true');
});

await runTest('41. Contact follow-up save dispatches ZERO calls to invoices repository and zero invoice mutations', async () => {
  app.clearSavedDbRecords();
  const enq = {
    id: 'enq_fin_iso_test',
    studentName: 'Balogun Monday',
    status: 'NEW',
    notes: 'Existing notes',
    timeline: []
  };
  app.state.enquiries = [enq];
  const invoicesCountBefore = app.state.invoices.length;

  const container = createMockContainer('modalContainer');
  app.renderEnquiryDetailModal(container, enq, { showContactForm: true });

  const btnSave = app.getMockElement('btnSaveFollowUp');
  app.getMockElement('fupMethod').value = 'WhatsApp';
  app.getMockElement('fupOutcome').value = 'Contacted — Interested';
  app.getMockElement('fupNotes').value = 'Discussed syllabus';

  await btnSave.click();

  const allSaved = app.getAllSavedDbRecords();
  const invoiceSaves = allSaved.filter(s => s.storeKey === 'clasptek:invoices' || s.storeKey === 'invoices');
  assert.strictEqual(invoiceSaves.length, 0, 'Zero invoice saves must occur during Contact Follow-up');
  assert.strictEqual(app.state.invoices.length, invoicesCountBefore, 'Invoices count in state must not change');
  assert.strictEqual(allSaved.length, 1, 'Exactly one saveRecord call must occur');
  assert.strictEqual(allSaved[0].storeKey, 'clasptek_enquiries', 'Save call must be on STORE_KEY_ENQUIRIES only');
});

await runTest('42. Contact follow-up save dispatches ZERO calls to payments repository and zero payment mutations', async () => {
  app.clearSavedDbRecords();
  const enq = {
    id: 'enq_fin_iso_test_2',
    studentName: 'Balogun Monday',
    status: 'NEW',
    notes: 'Existing notes',
    timeline: []
  };
  app.state.enquiries = [enq];
  const paymentsCountBefore = app.state.payments.length;

  const container = createMockContainer('modalContainer');
  app.renderEnquiryDetailModal(container, enq, { showContactForm: true });

  const btnSave = app.getMockElement('btnSaveFollowUp');
  await btnSave.click();

  const allSaved = app.getAllSavedDbRecords();
  const paymentSaves = allSaved.filter(s => s.storeKey === 'clasptek:payments' || s.storeKey === 'payments');
  assert.strictEqual(paymentSaves.length, 0, 'Zero payment saves must occur during Contact Follow-up');
  assert.strictEqual(app.state.payments.length, paymentsCountBefore, 'Payments count in state must not change');
});

await runTest('43. Financial state for Balogun Monday remains bit-identical (Billing Status: No Invoice, Total: ₦0.00, Paid: ₦0.00, Balance: ₦0.00)', async () => {
  const enq = {
    id: 'enq_1789046129106',
    name: 'Balogun Monday',
    studentName: 'Balogun Monday',
    phone: '08023456789',
    programme: 'Cybersecurity Operations',
    status: 'NEW'
  };
  const finBefore = app.getEnquiryFinancialStatus(enq);
  assert.strictEqual(finBefore.label, 'No Invoice');
  assert.strictEqual(finBefore.total, 0);
  assert.strictEqual(finBefore.paid, 0);
  assert.strictEqual(finBefore.balance, 0);

  const container = createMockContainer('modalContainer');
  app.renderEnquiryDetailModal(container, enq, { showContactForm: true });
  await app.getMockElement('btnSaveFollowUp').click();

  const finAfter = app.getEnquiryFinancialStatus(enq);
  assert.deepStrictEqual(finAfter, finBefore, 'Financial status must remain exactly identical');
});

await runTest('44. transformEntityForPostgres maps INVOICE_REQUESTED to APPLIED and INVOICE_ISSUED to OFFERED for enquiries_status_check', async () => {
  const tenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

  const enqInvReq = { id: 'enq_1', status: 'INVOICE_REQUESTED', studentName: 'Alice' };
  const pgInvReq = app.transformEntityForPostgres('enquiries', enqInvReq, tenantId);
  assert.strictEqual(pgInvReq.status, 'APPLIED', 'INVOICE_REQUESTED must map to APPLIED for PostgreSQL');

  const enqInvIss = { id: 'enq_2', status: 'INVOICE_ISSUED', studentName: 'Bob' };
  const pgInvIss = app.transformEntityForPostgres('enquiries', enqInvIss, tenantId);
  assert.strictEqual(pgInvIss.status, 'OFFERED', 'INVOICE_ISSUED must map to OFFERED for PostgreSQL');

  const enqUnknown = { id: 'enq_3', status: 'bogus_status', studentName: 'Charlie' };
  const pgUnknown = app.transformEntityForPostgres('enquiries', enqUnknown, tenantId);
  assert.strictEqual(pgUnknown.status, 'NEW', 'Unrecognized status must safely default to NEW');

  const enqStandard = { id: 'enq_4', status: 'INTERESTED', studentName: 'David' };
  const pgStandard = app.transformEntityForPostgres('enquiries', enqStandard, tenantId);
  assert.strictEqual(pgStandard.status, 'INTERESTED', 'Valid status must be preserved');
});

await runTest('45. transformEntityFromPostgres maps APPLIED to INVOICE_REQUESTED and OFFERED to INVOICE_ISSUED', async () => {
  const rowApplied = { id: 'enq_row_1', status: 'APPLIED', student_name: 'Alice' };
  const appApplied = app.transformEntityFromPostgres('enquiries', rowApplied);
  assert.strictEqual(appApplied.status, 'INVOICE_REQUESTED', 'APPLIED in DB must map to INVOICE_REQUESTED in app');

  const rowOffered = { id: 'enq_row_2', status: 'OFFERED', student_name: 'Bob' };
  const appOffered = app.transformEntityFromPostgres('enquiries', rowOffered);
  assert.strictEqual(appOffered.status, 'INVOICE_ISSUED', 'OFFERED in DB must map to INVOICE_ISSUED in app');
});

await runTest('46. dbRepo.saveRecord disambiguates error 23514: enquiries reports enquiry status and NEVER invoice save error', async () => {
  // Inspect index.html implementation directly to verify constraint error scoping
  const saveRecordMatch = html.match(/async saveRecord\s*\([\s\S]*?\}\s*\},/);
  assert(saveRecordMatch, 'Must find dbRepo.saveRecord in index.html');
  const code = saveRecordMatch[0];

  assert(code.includes("tableName === 'invoices' && (error.code === '23514'"), 'Invoice constraint must be guarded by tableName === invoices');
  assert(code.includes("tableName === 'enquiries' && (error.code === '23514'"), 'Enquiry constraint must be guarded by tableName === enquiries');
  assert(!code.includes("} else if (error && (error.code === '23514' || (error.message && error.message.includes('invoices_status_check'))))"), 'Global unguarded 23514 matching must NOT exist');
});

await runTest('47. Non-blocking audit failure: when enquiry DB save succeeds and audit fails, follow-up persists successfully', async () => {
  app.setSimulateAuditFailure(true);
  const enq = {
    id: 'enq_audit_resilience_test',
    studentName: 'Balogun Monday',
    status: 'NEW',
    notes: 'Existing notes',
    timeline: []
  };
  app.state.enquiries = [enq];

  const container = createMockContainer('modalContainer');
  app.renderEnquiryDetailModal(container, enq, { showContactForm: true });

  const btnSave = app.getMockElement('btnSaveFollowUp');
  app.getMockElement('fupMethod').value = 'Phone Call';
  app.getMockElement('fupOutcome').value = 'Contacted — Interested';
  app.getMockElement('fupNotes').value = 'Prospect confirmed interest';

  // Should succeed without throwing and without claiming failure
  await btnSave.click();

  const lastSaved = app.getLastSavedDbRecord();
  assert(lastSaved, 'Enquiry record must have been saved to dbRepo');
  assert.strictEqual(lastSaved.storeKey, 'clasptek_enquiries');
  assert(lastSaved.record.notes.includes('Prospect confirmed interest'), 'Saved enquiry notes must include follow-up note');

  // Verify drawer re-rendered with success message and no persistence error
  assert(container.innerHTML.includes('Follow-up interaction logged and saved successfully.'), 'Re-rendered drawer must display success message');
  assert(!container.innerHTML.includes('Failed to persist follow-up'), 'Error banner must not be present');

  app.setSimulateAuditFailure(false);
});

console.log('\n================================================================================');
console.log(` RESULTS: ${passed}/${total} TESTS PASSED (${total - passed} FAILURES)`);
console.log('================================================================================\n');

if (passed !== total) {
  process.exit(1);
}
}

runAllSuites().catch(err => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
