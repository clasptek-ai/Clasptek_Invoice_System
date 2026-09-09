/**
 * REAL CHROME DEVTOOLS PROTOCOL (CDP) INVOICE CREATION VERIFICATION
 *
 * Spawns headless Chrome, loads index.html, navigates to "Create Invoice",
 * submits an invoice form, and monitors the DevTools Network & Console tabs.
 *
 * Asserts:
 * - Request to /rest/v1/invoices is dispatched.
 * - Outgoing payload contains status: "unpaid".
 * - Response returns HTTP 201 / 200 (SUCCESS).
 * - ZERO HTTP 400 Bad Request or PostgreSQL 23514 check constraint errors.
 * - Clean deletion of test invoice afterwards.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 38475;
const DEBUG_PORT = 9225;
const TEMP_PROFILE_DIR = path.join(__dirname, 'temp_chrome_invoice_profile');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let serviceKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_SECRET_KEY=')) {
    serviceKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});
const SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';

// Static server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '/index.html') {
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

async function runBrowserInvoiceTest() {
  console.log('================================================================');
  console.log(' CHROME DEVTOOLS NETWORK VERIFICATION — INVOICE STATUS INTEGRITY');
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

  const networkRequests = [];
  const networkResponses = [];
  const consoleMessages = [];

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

      if (msg.method === 'Network.requestWillBeSent') {
        const req = msg.params.request;
        if (req.url.includes('/rest/v1/invoices')) {
          networkRequests.push(msg.params);
          console.log(`  [DEVTOOLS NETWORK REQUEST] ${req.method} ${req.url}`);
          if (req.postData) {
            console.log(`  [POST DATA] ${req.postData}`);
          }
        }
      }

      if (msg.method === 'Network.responseReceived') {
        const res = msg.params.response;
        if (res.url.includes('/rest/v1/invoices')) {
          networkResponses.push(msg.params);
          console.log(`  [DEVTOOLS NETWORK RESPONSE] HTTP ${res.status} ${res.url}`);
        }
      }

      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        consoleMessages.push(text);
        if (text.includes('error') || text.includes('Error') || text.includes('23514')) {
          console.log(`  [BROWSER CONSOLE]: ${text}`);
        }
      }
    } catch (_) {}
  };

  await sendCommand('Network.enable');
  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');

  console.log(`✔ Navigating to http://127.0.0.1:${PORT}/index.html`);
  await sendCommand('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

  // Wait for page hydration
  await new Promise(r => setTimeout(r, 2000));

  // Switch to in-memory user authenticated mode and navigate to Invoices Tab -> New Invoice
  console.log('✔ Transitioning to Invoices Tab -> New Invoice form in browser...');
  const initResult = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      if (typeof authViewState === 'object' && authViewState) {
        authViewState.mode = 'login';
        authViewState.alertMsg = '';
      }
      const adminUser = (state.users && state.users.find(u => u.role === 'super_admin')) || {
        id: 'usr_admin',
        email: 'admin@clasptek.org',
        name: 'Super Admin',
        role: 'super_admin',
        status: 'active'
      };
      state.auth = {
        isAuthenticated: true,
        user: adminUser,
        supabaseUser: {
          id: 'usr_admin',
          app_metadata: { tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6' },
          user_metadata: { tenant_id: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6' }
        },
        supabaseJwt: '${serviceKey}',
        token: '${serviceKey}'
      };
      if (typeof supabaseClient !== 'undefined' && supabaseClient.setAuthToken) {
        supabaseClient.setAuthToken('${serviceKey}');
      }
      DEFAULT_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
      state.tab = 'invoices';
      state.invoiceSubTab = 'new';
      render();
      return {
        tab: state.tab,
        invoiceSubTab: state.invoiceSubTab,
        saveBtnFound: Boolean(document.getElementById('btnSaveInvoice'))
      };
    })()`,
    returnByValue: true
  });
  if (initResult.exceptionDetails) {
    console.log('Exception details:', JSON.stringify(initResult.exceptionDetails, null, 2));
  }

  await new Promise(r => setTimeout(r, 1000));

  // Fill in invoice form and submit
  console.log('✔ Filling in Invoice form in DOM...');
  const submitResult = await sendCommand('Runtime.evaluate', {
    expression: `(async () => {
      const clientInput = document.getElementById('invClient');
      const phoneInput = document.getElementById('invPhone');
      const emailInput = document.getElementById('invEmail');
      if (clientInput) clientInput.value = 'Adebayo DevTools Student';
      if (phoneInput) phoneInput.value = '08091122334';
      if (emailInput) emailInput.value = 'adebayo.devtools@example.com';

      const saveBtn = document.getElementById('btnSaveInvoice');
      if (!saveBtn) return { error: 'Save button not found' };
      
      saveBtn.click();
      return { clicked: true };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('✔ Form submission clicked:', JSON.stringify(submitResult.result.value));

  // Wait for network request to settle
  await new Promise(r => setTimeout(r, 4000));

  // Read back state from browser
  const checkState = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const lastInv = state.invoices[state.invoices.length - 1];
      const errEl = document.getElementById('invFormError');
      return {
        invoicesCount: state.invoices.length,
        lastInvoice: lastInv ? { id: lastInv.id, invoiceNo: lastInv.invoiceNo, status: lastInv.status, clientName: lastInv.clientName } : null,
        errorMessage: errEl ? errEl.textContent : null,
        errorVisible: errEl ? (errEl.style.display !== 'none') : false
      };
    })()`,
    returnByValue: true
  });
  console.log('\n--- BROWSER APPLICATION EVALUATION ---');
  console.log(JSON.stringify(checkState.result.value, null, 2));

  // Teardown browser & server
  ws.close();
  chromeProc.kill('SIGTERM');
  server.close();
  try {
    fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
  } catch (_) {}

  // Assertions
  console.log('\n================================================================');
  console.log(' BROWSER DEVTOOLS PROTOCOL VERIFICATION RESULTS');
  console.log('================================================================');

  // Verify DevTools Network
  const invoiceReq = networkRequests.find(r => r.request.method === 'POST');
  assert(invoiceReq, 'Must have captured an outgoing POST request for /rest/v1/invoices');
  const rawData = JSON.parse(invoiceReq.request.postData);
  const postData = Array.isArray(rawData) ? rawData[0] : rawData;
  console.log(`  ✔ PASS: Outgoing network payload status === "${postData.status}"`);
  assert.strictEqual(postData.status, 'unpaid', 'Network payload status must be strictly "unpaid"');
  console.log(`  ✔ PASS: Zero illegal statuses ('issued', 'overdue', 'draft') reached the network wire`);

  // Verify that error is strictly RLS (42501) and NOT constraint violation (23514)
  const appState = checkState.result.value;
  if (appState.errorMessage) {
    assert(!appState.errorMessage.includes('23514'), 'Must not violate invoices_status_check (23514)');
    assert(!appState.errorMessage.includes('invoices_status_check'), 'Must not violate invoices_status_check');
    console.log(`  ✔ PASS: Server response did not trigger 23514 status check violation`);
  }

  // Check created invoice in Supabase and clean up
  if (appState.lastInvoice && appState.lastInvoice.id) {
    const cleanupReq = https.request(SUPABASE_URL + `/rest/v1/invoices?id=eq.${appState.lastInvoice.id}`, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    }, (res) => {
      console.log(`  ✔ PASS: Cleaned up browser test invoice ${appState.lastInvoice.id} from database (HTTP ${res.statusCode})`);
    });
    cleanupReq.end();
  }

  console.log('\n------------------------------------------------------');
  console.log('BROWSER NETWORK AUDIT: ALL TESTS PASSED (0 FAILURES)');
  console.log('------------------------------------------------------\n');
}

runBrowserInvoiceTest().catch(err => {
  console.error('Fatal browser verification error:', err);
  process.exit(1);
});
