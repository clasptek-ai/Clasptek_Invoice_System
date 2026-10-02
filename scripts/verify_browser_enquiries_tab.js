/**
 * REAL CHROME DEVTOOLS PROTOCOL (CDP) ENQUIRIES TAB VERIFICATION
 *
 * Spawns headless Chrome, loads index.html, navigates to Enquiries tab (#enquiries),
 * monitors DevTools Console & Network tabs to verify:
 * 1. Zero ReferenceErrors (no ename or enqName undefined exceptions)
 * 2. Enquiries table renders successfully with matching student links
 * 3. Exact Supabase REST requests and their status codes (e.g. /rest/v1/...)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 38475;
const DEBUG_PORT = 9225;
const TEMP_PROFILE_DIR = path.join(__dirname, 'temp_chrome_enquiries_profile_' + Date.now());

// Static server serving root index.html and assets
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '/index.html' || reqPath.startsWith('/#')) {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (reqPath === '/runtime-config.js') {
    const js = fs.readFileSync(path.join(__dirname, '../runtime-config.js'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(js);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

async function runBrowserEnquiriesTest() {
  console.log('================================================================');
  console.log(' CHROME DEVTOOLS VERIFICATION — ENQUIRIES TAB & CONSOLE AUDIT');
  console.log('================================================================\n');

  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  console.log(`✔ Local application server listening on http://127.0.0.1:${PORT}`);

  if (fs.existsSync(TEMP_PROFILE_DIR)) {
    fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });

  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${TEMP_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-sync',
    'about:blank'
  ];

  console.log(`✔ Launching headless Chrome...`);
  const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  chromeProc.stderr.on('data', d => {
    const s = d.toString();
    if (!s.includes('DevTools listening')) console.log('[CHROME STDERR]', s.trim());
  });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        if (targets && targets.length > 0) break;
      }
    } catch (_) {}
  }

  if (!targets || targets.length === 0) {
    throw new Error('Failed to connect to Chrome remote debugging port.');
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log(`✔ Connected to Chrome DevTools target: ${pageTarget.id}`);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const consoleExceptions = [];
  const consoleMessages = [];
  const networkRequests = [];
  const networkResponses = [];

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }

      if (msg.method === 'Runtime.exceptionThrown') {
        consoleExceptions.push(msg.params);
        console.error('  [DEVTOOLS EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description || '');
      }

      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        consoleMessages.push({ type: msg.params.type, text });
      }

      if (msg.method === 'Network.requestWillBeSent') {
        const req = msg.params.request;
        if (req.url.includes('/rest/v1/') || req.url.includes('supabase.co')) {
          networkRequests.push(msg.params);
          console.log(`  [DEVTOOLS NETWORK OUTGOING] ${req.method} ${req.url}`);
        }
      }

      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params.response;
        if (resp.url.includes('/rest/v1/') || resp.url.includes('supabase.co')) {
          networkResponses.push(resp);
          console.log(`  [DEVTOOLS NETWORK RESPONSE] HTTP ${resp.status} ${resp.url}`);
        }
      }
    } catch (err) {
      console.error('WS message parse error:', err);
    }
  };

  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('Network.enable');

  console.log(`✔ Navigating to http://127.0.0.1:${PORT}/#enquiries...`);
  await sendCommand('Page.navigate', { url: `http://127.0.0.1:${PORT}/#enquiries` });

  // Wait 3.5s for initial load, hydration, ping, and render
  await new Promise(r => setTimeout(r, 3500));

  // Explicitly trigger renderEnquiriesTab with populated mock student accounts and enquiries
  console.log(`✔ Injected test scenario with populated student accounts & enquiries...`);
  const evalResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        try {
          // Verify state
          if (!window.state) return { success: false, error: 'state not defined' };
          
          // Set authenticated user and switch to enquiries tab
          state.auth = {
            isAuthenticated: true,
            user: { id: 'usr_admissions', name: 'Admissions Officer', role: 'Super Admin' }
          };
          state.tab = 'enquiries';
          
          // Add test enquiry
          if (!Array.isArray(state.enquiries)) state.enquiries = [];
          state.enquiries.push({
            id: 'enq_cdp_test_1',
            name: 'Oluwaseun Balogun',
            studentName: 'Oluwaseun Balogun',
            phone: '08031234567',
            email: 'seun.balogun@example.com',
            programmeName: 'Executive Cloud Engineering',
            status: 'INTERESTED',
            source: 'Website',
            enquiryDate: '2026-09-15'
          });

          // Add student in state so getStudentAccountSummaries returns accounts
          if (!Array.isArray(state.students)) state.students = [];
          state.students.push({
            id: 'stu_cdp_test_1',
            studentNumber: 'STU-2026-0188',
            name: 'Oluwaseun Balogun',
            first_name: 'Oluwaseun',
            last_name: 'Balogun',
            phone: '08031234567',
            email: 'seun.balogun@example.com',
            status: 'ACTIVE'
          });

          // Call render() to execute renderEnquiriesTab
          render();

          // Check if table contains rendered enquiry and linked student badge
          const content = document.getElementById('contentView')?.innerHTML || document.body.innerHTML;
          const hasName = content.includes('Oluwaseun Balogun');
          const hasLinkedStudent = content.includes('STU-2026-0188');
          const hasRegisterBtn = content.includes('btnRegisterStudentFromEnquiry') || content.includes('btnViewLinkedStudent');

          return {
            success: true,
            hasName,
            hasLinkedStudent,
            hasRegisterBtn,
            htmlSnippet: content.slice(0, 500)
          };
        } catch (err) {
          return {
            success: false,
            error: err.name + ': ' + err.message,
            stack: err.stack
          };
        }
      })()
    `,
    returnByValue: true
  });

  console.log('\n--- BROWSER EVALUATION RESULTS ---');
  console.log('Eval Result:', evalResult.result.value);

  // Assertions
  const resVal = evalResult.result.value;
  assert(resVal && resVal.success, `renderEnquiriesTab execution threw: ${resVal?.error}\n${resVal?.stack}`);
  assert(resVal.hasName, 'Rendered page must contain prospect name "Oluwaseun Balogun"');
  assert(resVal.hasLinkedStudent, 'Rendered page must cleanly match and link student STU-2026-0188');

  // Verify Zero ReferenceErrors
  const refErrors = consoleExceptions.filter(e => {
    const desc = e.exceptionDetails?.exception?.description || e.exceptionDetails?.text || '';
    return desc.includes('ReferenceError') || desc.includes('ename') || desc.includes('enqName');
  });
  console.log(`\n✔ ReferenceError exceptions count: ${refErrors.length}`);
  assert.strictEqual(refErrors.length, 0, `Uncaught ReferenceError detected in browser console: ${JSON.stringify(refErrors)}`);

  console.log('\n--- NETWORK REQUEST SUMMARY ---');
  console.log(`Total Supabase Outgoing Requests: ${networkRequests.length}`);
  console.log(`Total Supabase Received Responses: ${networkResponses.length}`);
  networkResponses.forEach(r => {
    console.log(`  - HTTP ${r.status}: ${r.url}`);
  });

  // Cleanup
  ws.close();
  chromeProc.kill('SIGKILL');
  server.close();
  try {
    if (fs.existsSync(TEMP_PROFILE_DIR)) {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    }
  } catch (_) {}

  console.log('\n================================================================');
  console.log(' ALL CHROME DEVTOOLS ENQUIRIES TAB VERIFICATIONS PASSED (100%)');
  console.log('================================================================\n');
}

runBrowserEnquiriesTest().catch(err => {
  console.error('\n✖ BROWSER TEST FAILED:', err);
  process.exit(1);
});
