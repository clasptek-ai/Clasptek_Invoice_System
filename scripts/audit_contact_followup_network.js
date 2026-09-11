/**
 * CLASPTEK CONTACT FOLLOW-UP NETWORK ISOLATION AUDIT
 * 
 * Intercepts all network traffic via Chrome DevTools Protocol (CDP) during:
 * Open Balogun Monday (#9106)
 * -> Click Contact Prospect
 * -> Enter test follow-up note
 * -> Click Save Follow-up
 * 
 * Asserts:
 * - Requests to /rest/v1/invoices === 0
 * - Requests to /rest/v1/payments === 0
 * - Zero HTTP 409 errors
 * - Zero HTTP 400 errors
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 16000 + Math.floor(Math.random() * 3000);
const TEMP_PROFILE = path.join(__dirname, 'temp_cdp_net_audit_' + Date.now());

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let adminPassword = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('ADMIN_PASSWORD=')) {
    adminPassword = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

async function runNetworkAudit() {
  console.log('========================================================================================');
  console.log(' CLASPTEK CONTACT FOLLOW-UP NETWORK ISOLATION AUDIT');
  console.log(' Target URL: https://app.clasptek.org/');
  console.log(' Timestamp:  ' + new Date().toISOString());
  console.log('========================================================================================\n');

  if (fs.existsSync(TEMP_PROFILE)) fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  fs.mkdirSync(TEMP_PROFILE, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--remote-allow-origins=*',
    '--user-data-dir=' + TEMP_PROFILE,
    'about:blank'
  ]);

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        if (targets && targets.length) break;
      }
    } catch (_) {}
  }
  assert(targets && targets.length, 'Connected to Chrome CDP');

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const outgoingRequests = [];
  const incomingResponses = [];
  const consoleMessages = [];

  ws.onmessage = (event) => {
    try {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
        return;
      }
      if (m.method === 'Network.requestWillBeSent') {
        outgoingRequests.push(m.params.request);
      }
      if (m.method === 'Network.responseReceived') {
        incomingResponses.push(m.params.response);
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map(a => (a.value !== undefined ? a.value : a.description)).join(' ');
        consoleMessages.push({ type: m.params.type, text });
      }
    } catch (_) {}
  };

  await new Promise(r => ws.onopen = r);
  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[CDP] Navigating to https://app.clasptek.org/...');
  await send('Page.navigate', { url: 'https://app.clasptek.org/' });

  // Wait for document ready and login inputs
  console.log('[CDP] Waiting for login form...');
  let loginRes = { result: { value: { success: false } } };
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    loginRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const emailInput = document.getElementById('loginEmail') || document.querySelector('input[type="email"]');
        const pwdInput = document.getElementById('loginPassword') || document.querySelector('input[type="password"]');
        const submitBtn = document.getElementById('btnSignIn') || document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign In'));

        if (!emailInput || !pwdInput || !submitBtn) {
          return { success: false, reason: 'Inputs not found' };
        }
        emailInput.value = 'admin@clasptek.org';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        pwdInput.value = '${adminPassword}';
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
        pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
        submitBtn.click();
        return { success: true };
      })()`,
      returnByValue: true
    });
    if (loginRes.result && loginRes.result.value && loginRes.result.value.success) {
      break;
    }
  }
  console.log('[CDP] Login result:', loginRes.result.value);

  // Wait for auth & dashboard load
  console.log('[CDP] Waiting for dashboard hydration...');
  let appReady = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const authState = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          isAuth: window.state && window.state.auth && window.state.auth.isAuthenticated,
          enqCount: (window.state && window.state.enquiries) ? window.state.enquiries.length : 0
        };
      })()`,
      returnByValue: true
    });
    if (authState.result.value.isAuth && authState.result.value.enqCount > 0) {
      console.log('[CDP] App loaded with authoritative data:', authState.result.value);
      appReady = true;
      break;
    }
  }
  assert(appReady, 'Application state must be fully authenticated and hydrated');

  // Switch to Enquiries tab
  console.log('[CDP] Switching to Enquiries tab...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const enqTab = document.querySelector('[data-tab="enquiries"]');
      if (enqTab) enqTab.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Clear tracked network traffic before starting the Contact Follow-up workflow
  outgoingRequests.length = 0;
  incomingResponses.length = 0;

  // Open Balogun Monday (#9106)
  console.log('[CDP] Opening Balogun Monday (#9106) Prospect Journey drawer...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const rowBtn = document.querySelector('.btnOpenEnquiryDetail[data-id="enq_1789046129106"]');
      if (rowBtn) rowBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click Contact Prospect to reveal follow-up panel
  console.log('[CDP] Clicking Contact Prospect...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const contactBtn = document.getElementById('btnDrawerNextAct');
      if (contactBtn) contactBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  // Fill in follow-up notes
  console.log('[CDP] Entering follow-up interaction details...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const notes = document.getElementById('fupNotes');
      if (notes) notes.value = 'CDP Network Isolation Verification Test - ' + new Date().toISOString();
      const method = document.getElementById('fupMethod');
      if (method) method.value = 'Phone Call';
      const outcome = document.getElementById('fupOutcome');
      if (outcome) outcome.value = 'Contacted — Interested';
    })()`
  });

  // Snapshot financial state before click
  const finBefore = await send('Runtime.evaluate', {
    expression: `(() => {
      const enq = state.enquiries.find(e => e.id === 'enq_1789046129106');
      return {
        financial: getEnquiryFinancialStatus(enq),
        invoicesCount: state.invoices.length,
        paymentsCount: state.payments.length
      };
    })()`,
    returnByValue: true
  });
  console.log('[CDP] Financial State Before Save:', JSON.stringify(finBefore.result.value, null, 2));

  // Click Save Follow-up
  console.log('[CDP] Clicking Save Follow-up (#btnSaveFollowUp)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const saveBtn = document.getElementById('btnSaveFollowUp');
      if (saveBtn) saveBtn.click();
    })()`
  });

  // Wait 5 seconds for network activity to settle
  console.log('[CDP] Waiting 5 seconds for network activity to settle...');
  await new Promise(r => setTimeout(r, 5000));

  // Snapshot financial state after click
  const finAfter = await send('Runtime.evaluate', {
    expression: `(() => {
      const enq = state.enquiries.find(e => e.id === 'enq_1789046129106');
      return {
        financial: getEnquiryFinancialStatus(enq),
        invoicesCount: state.invoices.length,
        paymentsCount: state.payments.length
      };
    })()`,
    returnByValue: true
  });
  console.log('[CDP] Financial State After Save:', JSON.stringify(finAfter.result.value, null, 2));

  // Analyze network traffic during follow-up save
  console.log('\n========================================================================================');
  console.log(' NETWORK TRAFFIC ANALYSIS DURING CONTACT FOLLOW-UP SAVE');
  console.log('========================================================================================');

  const invoiceReqs = outgoingRequests.filter(r => r.url.includes('/rest/v1/invoices'));
  const paymentReqs = outgoingRequests.filter(r => r.url.includes('/rest/v1/payments'));
  const enquiryReqs = outgoingRequests.filter(r => r.url.includes('/rest/v1/enquiries'));
  const auditReqs = outgoingRequests.filter(r => r.url.includes('/rest/v1/finance_audit_log'));

  const status400s = incomingResponses.filter(r => r.status === 400);
  const status403s = incomingResponses.filter(r => r.status === 403);
  const status409s = incomingResponses.filter(r => r.status === 409);

  console.log(`- Outgoing /rest/v1/enquiries requests:   ${enquiryReqs.length}`);
  console.log(`- Outgoing /rest/v1/invoices requests:    ${invoiceReqs.length} (MUST BE 0)`);
  console.log(`- Outgoing /rest/v1/payments requests:    ${paymentReqs.length} (MUST BE 0)`);
  console.log(`- Outgoing /rest/v1/finance_audit_log:    ${auditReqs.length}`);
  console.log(`- HTTP 400 Bad Request responses:        ${status400s.length} (MUST BE 0)`);
  console.log(`- HTTP 403 Forbidden responses:          ${status403s.length}`);
  console.log(`- HTTP 409 Conflict responses:           ${status409s.length} (MUST BE 0)`);

  if (invoiceReqs.length > 0) {
    console.error('FAIL: Detected invoice requests:', JSON.stringify(invoiceReqs, null, 2));
  }
  if (status409s.length > 0) {
    console.error('FAIL: Detected 409 responses:', JSON.stringify(status409s, null, 2));
  }
  if (status400s.length > 0) {
    console.error('FAIL: Detected 400 responses:', JSON.stringify(status400s, null, 2));
  }

  // Strict assertions
  assert.strictEqual(invoiceReqs.length, 0, 'Zero requests to /rest/v1/invoices allowed during Contact Follow-up');
  assert.strictEqual(paymentReqs.length, 0, 'Zero requests to /rest/v1/payments allowed during Contact Follow-up');
  assert.strictEqual(status409s.length, 0, 'Zero HTTP 409 responses allowed during Contact Follow-up');
  assert.strictEqual(status400s.length, 0, 'Zero HTTP 400 responses allowed during Contact Follow-up');
  assert.deepStrictEqual(finAfter.result.value, finBefore.result.value, 'Financial status must remain exactly identical');

  console.log('\n✔ ALL NETWORK-LEVEL FINANCIAL ISOLATION INVARIANTS CERTIFIED');

  // Teardown
  try { ws.close(); } catch (_) {}
  try { chromeProc.kill('SIGKILL'); } catch (_) {}
  try { fs.rmSync(TEMP_PROFILE, { recursive: true, force: true }); } catch (_) {}
}

runNetworkAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
