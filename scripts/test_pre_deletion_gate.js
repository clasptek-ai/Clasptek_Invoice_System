// scripts/test_pre_deletion_gate.js
// Verification of consolidated endpoints, rewrites, and compatibility before deleting legacy files

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log('PHASE 2.4: PRE-DELETION VERIFICATION GATE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json || data });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runGate() {
  console.log('--- GATE 1: Replacement Consolidated Functions Exist ---');
  check(fs.existsSync(path.join(__dirname, '../api/admin.js')), 'api/admin.js exists');
  check(fs.existsSync(path.join(__dirname, '../api/auth/google/auth.js')), 'api/auth/google/auth.js exists');
  check(fs.existsSync(path.join(__dirname, '../api/meetings/action.js')), 'api/meetings/action.js exists');
  check(fs.existsSync(path.join(__dirname, '../api/_lib/google-oauth-config.js')), 'api/_lib/google-oauth-config.js exists');
  check(fs.existsSync(path.join(__dirname, '../api/_lib/sfu-adapter.js')), 'api/_lib/sfu-adapter.js exists');

  console.log('\n--- GATE 2: Dedicated Handlers Remain Independent ---');
  check(fs.existsSync(path.join(__dirname, '../api/auth/google/callback.js')), 'api/auth/google/callback.js remains dedicated');
  check(fs.existsSync(path.join(__dirname, '../api/meetings/create.js')), 'api/meetings/create.js remains dedicated');
  check(fs.existsSync(path.join(__dirname, '../api/meetings/join.js')), 'api/meetings/join.js remains dedicated');
  check(fs.existsSync(path.join(__dirname, '../api/meetings/upload-recording.js')), 'api/meetings/upload-recording.js remains dedicated');

  console.log('\n--- GATE 3: Vercel.json Rewrites Integrity ---');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  const rewriteSources = vercelJson.rewrites.map(r => r.source);
  const requiredRewrites = [
    '/api/admin/provision-user',
    '/api/admin/delete-personnel',
    '/api/auth/google/start',
    '/api/auth/google/status',
    '/api/auth/google/disconnect',
    '/api/auth/google/verify-repository',
    '/api/meetings/leave',
    '/api/meetings/status',
    '/api/meetings/chat'
  ];
  requiredRewrites.forEach(rw => {
    check(rewriteSources.includes(rw), `vercel.json rewrites include ${rw}`);
  });

  console.log('\n--- GATE 4: HTTP Endpoint Compatibility Over Dev Server (Port 3000) ---');
  try {
    // 1. Google OAuth Callback
    const cbRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/google/callback?error=access_denied',
      method: 'GET'
    });
    check(cbRes.statusCode === 302 && cbRes.headers.location && cbRes.headers.location.includes('access_denied'), 'GET /api/auth/google/callback?error=access_denied returns 302 redirect');

    // 2. Admin Provision User
    const provRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/provision-user',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'test@example.com' });
    check(provRes.statusCode === 401 && provRes.body.error.includes('Unauthorized'), 'POST /api/admin/provision-user returns 401 Unauthorized when unauthenticated');

    // 3. Admin Delete Personnel
    const delRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/delete-personnel',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { personnelId: 'pers_test' });
    check(delRes.statusCode === 401 && delRes.body.error.includes('Unauthorized'), 'POST /api/admin/delete-personnel returns 401 Unauthorized when unauthenticated');

    // 4. Google Auth Start
    const startRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/google/start',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { connection_type: 'TENANT_CENTRAL' });
    check(startRes.statusCode === 401 && startRes.body.error === 'UNAUTHORIZED', 'POST /api/auth/google/start returns 401 UNAUTHORIZED when unauthenticated');

    // 5. Google Auth Status
    const statusRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/google/status?connection_type=TENANT_CENTRAL',
      method: 'GET'
    });
    check(statusRes.statusCode === 401 && statusRes.body.error === 'UNAUTHORIZED', 'GET /api/auth/google/status returns 401 UNAUTHORIZED when unauthenticated');

    // 6. Google Auth Disconnect
    const disRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/google/disconnect',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { connection_type: 'TENANT_CENTRAL' });
    check(disRes.statusCode === 401 && disRes.body.error === 'UNAUTHORIZED', 'POST /api/auth/google/disconnect returns 401 UNAUTHORIZED when unauthenticated');

    // 7. Google Auth Verify Repository
    const verRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/google/verify-repository',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { connection_type: 'TENANT_CENTRAL' });
    check(verRes.statusCode === 401 && verRes.body.error === 'UNAUTHORIZED', 'POST /api/auth/google/verify-repository returns 401 UNAUTHORIZED when unauthenticated');

    // 8. Meeting Leave
    const leaveRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/leave',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { meetingId: 'mtg_test', joinedAt: new Date(Date.now() - 60000).toISOString() });
    check(leaveRes.statusCode === 200 && leaveRes.body.success === true && leaveRes.body.durationSeconds >= 59, 'POST /api/meetings/leave computes session duration successfully');

    // 9. Meeting Status
    const mtgStatusRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/status?publicId=mtg-test-room',
      method: 'GET'
    });
    check(mtgStatusRes.statusCode === 200 && mtgStatusRes.body.success === true, 'GET /api/meetings/status returns 200 with room descriptor');

    // 10. Meeting Chat
    const chatRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { meetingId: 'mtg_test', message: 'Hello from test suite', user: { id: 'usr_1', role: 'STUDENT' } });
    check(chatRes.statusCode === 201 && chatRes.body.success === true && chatRes.body.message.message === 'Hello from test suite', 'POST /api/meetings/chat broadcasts text message successfully');

    // 11. Meeting Action
    const actRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/action',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'MUTE_PARTICIPANT', meetingId: 'mtg_test' });
    check(actRes.statusCode === 401, 'POST /api/meetings/action rejects unauthenticated caller with 401');

    // 12. Meeting Create
    const createRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/create',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { title: 'Test Meeting' });
    check(createRes.statusCode === 401, 'POST /api/meetings/create rejects unauthenticated caller with 401');

    // 13. Meeting Join
    const joinRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/meetings/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { meetingId: 'mtg_test' });
    check(joinRes.statusCode === 401, 'POST /api/meetings/join rejects unauthenticated caller with 401');

  } catch (netErr) {
    check(false, `Local server HTTP request failed: ${netErr.message}`);
  }

  console.log('\n================================================================');
  console.log(`PRE-DELETION GATE RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('PRE-DELETION GATE FAILED! DO NOT DELETE LEGACY FUNCTIONS.');
    process.exit(1);
  } else {
    console.log('PRE-DELETION GATE PASSED! APPROVED TO PROCEED WITH CLEANUP.');
    process.exit(0);
  }
}

runGate();
