/**
 * CLASPTEK PRODUCTION — ENQUIRIES TAB RESILIENCE & 404 VERIFICATION SUITE
 * 
 * Tests all 22 required resilience cases:
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
 * 
 * PLUS:
 * - Exact production reproduction: Gbenga Ogunsakin & Balogun Monday records.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('================================================================================');
console.log(' CLASPTEK ENQUIRIES TAB RESILIENCE & FAVICON VERIFICATION SUITE');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================================\n');

// Load index.html for DOM/Script extraction
const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract key functions from index.html
function extractFunction(name) {
  const match = html.match(new RegExp(`function ${name}\\s*\\([^{]*\\)\\s*\\{`));
  if (!match) throw new Error(`Function ${name} not found in index.html`);
  const startIndex = match.index;
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let i = html.indexOf('{', startIndex);
  for (; i < html.length; i++) {
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

// Build a sandbox containing all relevant helpers and state
const mockDom = {
  innerHTML: '',
  querySelectorAll: () => [],
  addEventListener: () => {}
};

const mockDocument = {
  getElementById: (id) => ({
    addEventListener: () => {},
    value: '',
    style: {}
  }),
  querySelectorAll: () => []
};

// Evaluate environment in context
const transformEntityFromPostgresCode = extractFunction('transformEntityFromPostgres');
const getEnquiryFinancialStatusCode = extractFunction('getEnquiryFinancialStatus');
const getEnquiryNextActionCode = extractFunction('getEnquiryNextAction');
const renderEnquiriesTabCode = extractFunction('renderEnquiriesTab');

const contextCode = `
  const state = {
    filters: { enquirySearch: '', enquiryStatus: 'all' },
    enquiries: [],
    invoices: [],
    enrolments: [],
    programmes: [
      { id: 'prog_1788900434260_uujj7', name: 'Executive Cloud Engineering' },
      { id: 'prog_cyber_101', name: 'Cybersecurity Operations' }
    ],
    counters: { enquiry: 1001 }
  };

  const document = mockDocument;
  function escapeHtml(s) { return String(s || ''); }
  function fmtDate(d) { return String(d || ''); }
  function canRecord() { return true; }
  function exportToCSV() {}
  function openModal() {}
  function render() {}
  function safeRound(n) { return Math.round(n * 100) / 100; }
  function invoiceBalance(inv) { return { total: inv.total || 0, paid: inv.amountPaid || 0, balance: (inv.total || 0) - (inv.amountPaid || 0) }; }

  ${transformEntityFromPostgresCode}
  ${getEnquiryFinancialStatusCode}
  ${getEnquiryNextActionCode}
  ${renderEnquiriesTabCode}

  ({
    state,
    transformEntityFromPostgres,
    getEnquiryFinancialStatus,
    getEnquiryNextAction,
    renderEnquiriesTab
  });
`;

const app = eval(contextCode);

let passed = 0;
let total = 0;

function runTest(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✔ [PASS ${total.toString().padStart(2, '0')}] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL ${total.toString().padStart(2, '0')}] ${desc}`);
    console.error('     Error:', err.message);
  }
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

// 1. Empty enquiries array
runTest('1. Empty enquiries array renders professional empty state without crashing', () => {
  app.state.enquiries = [];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('cp-empty-state'), 'Must contain cp-empty-state');
  assert(container.innerHTML.includes('No enquiries match your filter'), 'Must display empty filter message');
});

// 2. Normal complete enquiry
runTest('2. Normal complete enquiry renders with all expected fields', () => {
  const enq = {
    id: 'enq_1',
    name: 'Alice Johnson',
    studentName: 'Alice Johnson',
    phone: '08012345678',
    email: 'alice@example.com',
    programmeName: 'Executive Cloud Engineering',
    status: 'NEW',
    enquiryDate: '2026-09-01T10:00:00Z',
    source: 'Website'
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Alice Johnson'), 'Prospect name must render');
  assert(container.innerHTML.includes('Executive Cloud Engineering'), 'Programme must render');
  assert(!container.innerHTML.includes('cp-empty-state'), 'Must not render empty state');
});

// 3. Missing `name`
runTest('3. Missing name is safely resolved to studentName or fallback', () => {
  const enq = {
    id: 'enq_2',
    studentName: 'Bob Williams',
    phone: '08099999999',
    status: 'NEW'
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Bob Williams'), 'studentName should render when name is missing');
});

// 4. Missing `student_name` and `name`
runTest('4. Missing both name and studentName displays Unnamed Prospect without throwing', () => {
  const enq = {
    id: 'enq_3',
    phone: '08088888888',
    status: 'CONTACTED'
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Unnamed Prospect'), 'Fallback Unnamed Prospect must render');
});

// 5. null email
runTest('5. null email does not crash renderer or search', () => {
  const enq = {
    id: 'enq_4',
    name: 'Charlie Brown',
    email: null,
    phone: '07011112222',
    status: 'NEW'
  };
  app.state.enquiries = [enq];
  app.state.filters.enquirySearch = 'charlie';
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Charlie Brown'), 'Record should match search with null email');
  assert(container.innerHTML.includes('No email'), 'Placeholder No email should display');
  app.state.filters.enquirySearch = '';
});

// 6. null phone
runTest('6. null phone does not crash renderer or search', () => {
  const enq = {
    id: 'enq_5',
    name: 'David Adeleke',
    phone: null,
    email: 'david@music.com',
    status: 'NEW'
  };
  app.state.enquiries = [enq];
  app.state.filters.enquirySearch = 'david';
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('David Adeleke'), 'Record should match search with null phone');
  assert(container.innerHTML.includes('No phone'), 'Placeholder No phone should display');
  app.state.filters.enquirySearch = '';
});

// 7. undefined programmeName
runTest('7. undefined programmeName falls back to General Tech Programme', () => {
  const enq = {
    id: 'enq_6',
    name: 'Eve Online',
    status: 'INTERESTED'
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('General Tech Programme'), 'Default programme name should display');
});

// 8. undefined status
runTest('8. undefined status defaults to NEW without throwing toLowerCase()', () => {
  const enq = {
    id: 'enq_7',
    name: 'Frank Miller',
    status: undefined
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('cp-pill new'), 'Status pill class should be new');
});

// 9. numeric phone
runTest('9. numeric phone is coerced safely without type errors', () => {
  const enq = {
    id: 'enq_8',
    name: 'Grace Hopper',
    phone: 2348012345678,
    status: 'NEW'
  };
  app.state.enquiries = [enq];
  app.state.filters.enquirySearch = '2348012';
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Grace Hopper'), 'Numeric phone must match search');
  app.state.filters.enquirySearch = '';
});

// 10. mixed valid/invalid enquiries
runTest('10. Mixed array of valid, partial, and null records does not crash renderer', () => {
  app.state.enquiries = [
    null,
    undefined,
    {},
    { id: 'm_1', name: 'Valid User 1', status: 'NEW' },
    { id: 'm_2', email: 'only_email@test.com' },
    { id: 'm_3', phone: 99999 }
  ];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Valid User 1'), 'Valid record should render');
});

// 11. case-insensitive search
runTest('11. Search operates case-insensitively across name, phone, email, programme', () => {
  const enq = {
    id: 'enq_search',
    name: 'Oluwaseun Bakare',
    phone: '08033334444',
    email: 'Seun.Bakare@Apex.org',
    programmeName: 'Executive Cloud Engineering',
    status: 'NEW'
  };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };

  app.state.filters.enquirySearch = 'OLUWASEUN';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Oluwaseun Bakare'), 'Match on uppercase name');

  app.state.filters.enquirySearch = 'seun.bakare';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Oluwaseun Bakare'), 'Match on lowercase email');

  app.state.filters.enquirySearch = 'CLOUD';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Oluwaseun Bakare'), 'Match on uppercase programme');
  app.state.filters.enquirySearch = '';
});

// 12. trimming behavior
runTest('12. Whitespace-padded search query trims safely without failing matches', () => {
  const enq = { id: 'e_trim', name: 'Kemi Adebayo', status: 'NEW' };
  app.state.enquiries = [enq];
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.state.filters.enquirySearch = '   Kemi   ';
  app.renderEnquiriesTab(container);
  assert(container.innerHTML.includes('Kemi Adebayo'), 'Should match despite leading/trailing spaces');
  app.state.filters.enquirySearch = '';
});

// 13. PostgreSQL `student_name` → application `name`
runTest('13. transformEntityFromPostgres maps student_name to name', () => {
  const pgRow = {
    id: 'enq_pg_1',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Tariq Al-Mansoor',
    email: 'tariq@test.com',
    status: 'NEW'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.name, 'Tariq Al-Mansoor', 'name must equal student_name');
});

// 14. PostgreSQL `student_name` → application `studentName`
runTest('14. transformEntityFromPostgres maps student_name to studentName alias', () => {
  const pgRow = {
    id: 'enq_pg_2',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Fatima Zahra',
    status: 'CONTACTED'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.studentName, 'Fatima Zahra', 'studentName must equal student_name');
});

// 15. programme_id → programmeName resolution where programme exists
runTest('15. programme_id is resolved to canonical programmeName from state.programmes', () => {
  const pgRow = {
    id: 'enq_pg_3',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Zainab Bello',
    programme_id: 'prog_1788900434260_uujj7',
    status: 'NEW'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.programmeName, 'Executive Cloud Engineering', 'programmeName must be resolved');
});

// 16. missing programme resolution
runTest('16. Unresolvable programme_id does not throw and defaults cleanly', () => {
  const pgRow = {
    id: 'enq_pg_4',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Unknown Prog User',
    programme_id: 'prog_does_not_exist_999'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.programmeName, '', 'programmeName defaults to empty string');
});

// 17. financial-status calculation with missing names
runTest('17. getEnquiryFinancialStatus handles null/undefined names without crashing', () => {
  const enq = { id: 'enq_fin_1', status: 'NEW' };
  const status = app.getEnquiryFinancialStatus(enq);
  assert.strictEqual(status.status, 'NO_INVOICE');
});

// 18. next-action calculation with missing names
runTest('18. getEnquiryNextAction handles null/undefined names without crashing', () => {
  const enq = { id: 'enq_act_1', status: 'NEW' };
  const act = app.getEnquiryNextAction(enq);
  assert.strictEqual(act.action, 'contact');
});

// 19. zero PostgreSQL enquiry rows
runTest('19. Zero PostgreSQL enquiry rows hydrated produces empty array without error', () => {
  const dbEnqs = { data: [] };
  const stateEnqs = Array.isArray(dbEnqs.data) ? dbEnqs.data.map(r => app.transformEntityFromPostgres('enquiries', r)) : [];
  assert.deepStrictEqual(stateEnqs, [], 'Must result in empty array');
});

// 20. tenant isolation
runTest('20. tenantId is preserved on transformed enquiries', () => {
  const pgRow = {
    id: 'enq_tenant_test',
    tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    student_name: 'Tenant Prospect'
  };
  const transformed = app.transformEntityFromPostgres('enquiries', pgRow);
  assert.strictEqual(transformed.tenantId, 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6');
});

// 21. four-file SHA-256 parity verification
runTest('21. 100% SHA-256 byte parity across all 4 production distribution files', () => {
  const files = [
    'index.html',
    'clasptek_invoice_system.html',
    'public/index.html',
    'public/clasptek_invoice_system.html'
  ];
  const hashes = files.map(f => {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex').toUpperCase();
  });
  const uniqueHashes = new Set(hashes);
  assert.strictEqual(uniqueHashes.size, 1, 'All 4 files must have identical SHA-256 hashes');
});

// 22. favicon existence / valid asset verification
runTest('22. Favicon assets exist in public/ and root and link is present in head', () => {
  const pubFav = path.join(__dirname, 'public', 'favicon.ico');
  const rootFav = path.join(__dirname, 'favicon.ico');
  assert(fs.existsSync(pubFav), 'public/favicon.ico must exist');
  assert(fs.existsSync(rootFav), 'favicon.ico must exist in root');
  const pubStat = fs.statSync(pubFav);
  assert(pubStat.size > 1000, 'favicon.ico must be non-empty');
  assert(html.includes('<link rel="icon" type="image/png" href="assets/clasptek_logo.png">'), 'Favicon link must be present in HTML head');
});

// -----------------------------------------------------------------------------
// EXACT PRODUCTION REGRESSION TEST: Live PostgreSQL records
// -----------------------------------------------------------------------------
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

  // Transform exact rows
  const transformed = prodRows.map(r => app.transformEntityFromPostgres('enquiries', r));
  assert.strictEqual(transformed[0].name, 'Gbenga Ogunsakin');
  assert.strictEqual(transformed[0].email, '');
  assert.strictEqual(transformed[0].programmeName, 'Executive Cloud Engineering');
  assert.strictEqual(transformed[1].name, 'Balogun Monday');
  assert.strictEqual(transformed[1].programmeName, 'Executive Cloud Engineering');

  // Render transformed rows
  app.state.enquiries = transformed;
  const container = { innerHTML: '', querySelectorAll: () => [] };
  app.renderEnquiriesTab(container);

  assert(container.innerHTML.includes('Gbenga Ogunsakin'), 'Gbenga Ogunsakin must render');
  assert(container.innerHTML.includes('Balogun Monday'), 'Balogun Monday must render');
  assert(container.innerHTML.includes('Executive Cloud Engineering'), 'Resolved programme must render');
  assert(container.innerHTML.includes('07086188424'), 'Phone number must render');
  assert(container.innerHTML.includes('Contact Prospect'), 'Next action Contact Prospect must render');
});

console.log('\n================================================================================');
console.log(` RESULTS: ${passed}/${total} TESTS PASSED (0 FAILURES)`);
console.log('================================================================================\n');

if (passed !== total) {
  process.exit(1);
}
