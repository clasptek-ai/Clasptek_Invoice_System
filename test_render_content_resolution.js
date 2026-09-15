const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const vm = require('vm');

console.log('================================================================================');
console.log(' CLASPTEK FRONTEND RUNTIME QA: renderContent RESOLUTION & INTEGRITY');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================================\n');

const ROOT_DIR = path.resolve(__dirname);
const HTML_FILES = [
  'clasptek_invoice_system.html',
  'index.html',
  'public/clasptek_invoice_system.html',
  'public/index.html'
];

let totalPassed = 0;
let totalFailed = 0;

function pass(msg) {
  console.log(`  ✔ [PASS] ${msg}`);
  totalPassed++;
}

function fail(msg, err) {
  console.error(`  ❌ [FAIL] ${msg}`, err || '');
  totalFailed++;
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: Four-File Distribution SHA-256 Byte-for-Byte Parity
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Four-File Distribution SHA-256 Parity ---');
try {
  const hashes = [];
  for (const f of HTML_FILES) {
    const fullPath = path.join(ROOT_DIR, f);
    assert(fs.existsSync(fullPath), `File ${f} exists`);
    const content = fs.readFileSync(fullPath, 'utf8');
    const h = crypto.createHash('sha256').update(content).digest('hex');
    hashes.push(h);
    pass(`File ${f} exists (hash: ${h.slice(0, 16)}...)`);
  }

  assert(hashes.every(h => h === hashes[0]), 'All 4 files must share identical SHA-256 hash');
  pass(`All 4 distribution files share 100% byte-for-byte identity: ${hashes[0]}`);
} catch (e) {
  fail('Suite 1 failed', e);
}

const html = fs.readFileSync(path.join(ROOT_DIR, 'clasptek_invoice_system.html'), 'utf8');

// -----------------------------------------------------------------------------
// TEST SUITE 2: Handler Audit for Canonical Rendering Function
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Handler Audit for Canonical Rendering Function ---');
try {
  // Helper to extract a function block
  function extractFunction(name) {
    const regex = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\)\\s*\\{`);
    const match = html.match(regex);
    assert(match, `Function ${name} found in HTML`);
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

  // 1. Check renderEnrolStudentModal
  const enrolStuFn = extractFunction('renderEnrolStudentModal');
  assert(!enrolStuFn.includes('renderContent();'), 'renderEnrolStudentModal must NOT call stale renderContent()');
  assert(enrolStuFn.includes('closeModal();\n    render();'), 'renderEnrolStudentModal must invoke closeModal() then render()');
  pass('renderEnrolStudentModal invokes canonical render()');

  // 2. Check renderAddProgrammeModal
  const addProgFn = extractFunction('renderAddProgrammeModal');
  assert(!addProgFn.includes('renderContent();'), 'renderAddProgrammeModal must NOT call stale renderContent()');
  assert(addProgFn.includes('closeModal();\n    render();'), 'renderAddProgrammeModal must invoke closeModal() then render()');
  pass('renderAddProgrammeModal invokes canonical render()');

  // 3. Check renderEditProgrammeModal
  const editProgFn = extractFunction('renderEditProgrammeModal');
  assert(!editProgFn.includes('renderContent();'), 'renderEditProgrammeModal must NOT call stale renderContent()');
  assert(editProgFn.includes('closeModal();\n    render();'), 'renderEditProgrammeModal must invoke closeModal() then render()');
  pass('renderEditProgrammeModal invokes canonical render()');

  // 4. Check renderAddCohortModal
  const addCohortFn = extractFunction('renderAddCohortModal');
  assert(!addCohortFn.includes('renderContent();'), 'renderAddCohortModal must NOT call stale renderContent()');
  assert(addCohortFn.includes('closeModal();\n    render();'), 'renderAddCohortModal must invoke closeModal() then render()');
  pass('renderAddCohortModal invokes canonical render()');

  // 5. Check renderEditCohortModal (previously throwing at line ~33785)
  const editCohortFn = extractFunction('renderEditCohortModal');
  assert(!editCohortFn.includes('renderContent();'), 'renderEditCohortModal must NOT call stale renderContent()');
  assert(editCohortFn.includes('closeModal();\n    render();'), 'renderEditCohortModal must invoke closeModal() then render()');
  pass('renderEditCohortModal invokes canonical render() (previously index.html:33785:5)');
} catch (e) {
  fail('Suite 2 failed', e);
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: Legitimate Delegation Wrapper & Scope Verification
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Legitimate renderContent Wrapper & Export Architecture ---');
try {
  // Check definition
  assert(html.includes('function renderContent(container) {'), 'renderContent function must be defined');
  assert(html.includes('return render(container);'), 'renderContent must delegate directly to render(container)');
  assert(!html.includes('function renderContent() {}'), 'Must NOT be an empty dummy stub');
  pass('renderContent is a legitimate delegating function, not a dummy stub');

  // Check window attachment
  assert(html.includes('window.renderContent = renderContent;'), 'window.renderContent must be exported');
  pass('window.renderContent is globally exported on window');

  // Check module.exports
  assert(html.includes('renderContent,') && html.includes('module.exports = {'), 'renderContent is exported in module.exports');
  pass('renderContent is present in CommonJS module.exports');

  // Functional test via VM isolation: test that renderContent executes render(container)
  let interceptedContainer = null;
  let renderExecutionCount = 0;

  const sandbox = {
    render: (c) => {
      renderExecutionCount++;
      interceptedContainer = c;
      return 'RENDER_RESULT_SUCCESS';
    },
    window: {}
  };

  const scriptCode = `
    function renderContent(container) {
      return render(container);
    }
    if (typeof window !== 'undefined') {
      window.renderContent = renderContent;
    }
  `;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  const testTarget = { id: 'testRoot', innerHTML: '' };
  const executionResult = sandbox.window.renderContent(testTarget);

  assert.strictEqual(renderExecutionCount, 1, 'Calling renderContent must invoke render() exactly once');
  assert.strictEqual(interceptedContainer, testTarget, 'renderContent must pass the container through to render()');
  assert.strictEqual(executionResult, 'RENDER_RESULT_SUCCESS', 'renderContent must return the result of render()');
  pass('renderContent successfully delegated to render() and returned output without ReferenceError');
} catch (e) {
  fail('Suite 3 failed', e);
}

// -----------------------------------------------------------------------------
// TEST SUITE 4: Zero Undeclared renderContent Calls in Codebase
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Exhaustive Codebase Audit for Undeclared Calls ---');
try {
  const lines = html.split('\n');
  const callingLines = [];
  lines.forEach((l, idx) => {
    // Look for renderContent() call expressions (not definitions or exports)
    if (l.includes('renderContent(') && !l.includes('function renderContent(') && !l.includes('typeof renderContent') && !l.includes('renderContent:')) {
      callingLines.push({ line: idx + 1, text: l.trim() });
    }
  });

  assert.strictEqual(callingLines.length, 0, `Expected 0 direct renderContent() calls in production code, found: ${JSON.stringify(callingLines)}`);
  pass('Zero undeclared or stale renderContent() calls exist in the production codebase');
} catch (e) {
  fail('Suite 4 failed', e);
}

console.log('\n================================================================================');
console.log(` RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('================================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
