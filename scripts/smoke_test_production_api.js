/**
 * CLASPTEK PRODUCTION SERVERLESS FUNCTION SMOKE TEST
 * Target: https://app.clasptek.org
 * Validates that all 7 consolidated serverless functions and legacy rewrites
 * are active and behaving correctly on Vercel production.
 */

const https = require('https');

const BASE_URL = 'https://app.clasptek.org';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let bodyData = null;

    if (body) {
      bodyData = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = https.request(url, {
      method,
      headers: reqHeaders,
      timeout: 10000
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(rawData); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: rawData
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${path}`));
    });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runSmokeTests() {
  console.log('================================================================');
  console.log(` PRODUCTION SMOKE TEST GATE — ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Root & SPA Delivery
  await check('1. Production portal root returns HTTP 200 with HTML content', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.raw.includes('<!DOCTYPE html>')) throw new Error('Response does not contain HTML doctype');
  });

  // 2. Google OAuth Callback (Dedicated Function: api/auth/google/callback.js)
  await check('2. GET /api/auth/google/callback?error=access_denied redirects (302)', async () => {
    const res = await request('GET', '/api/auth/google/callback?error=access_denied');
    if (res.status !== 302) throw new Error(`Expected 302, got ${res.status}`);
    const loc = res.headers.location || '';
    if (!loc.includes('access_denied')) throw new Error(`Unexpected Location: ${loc}`);
  });

  // 3. Admin Consolidated Endpoints (api/admin.js)
  await check('3. POST /api/admin/provision-user rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/admin/provision-user', { email: 'smoke@clasptek.org' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('4. POST /api/admin/delete-personnel rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/admin/delete-personnel', { personnelId: 'pers_test' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 4. Google Auth Consolidated Endpoints (api/auth/google/auth.js)
  await check('5. POST /api/auth/google/start rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/auth/google/start', {});
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('6. GET /api/auth/google/status rejects unauthenticated with 401', async () => {
    const res = await request('GET', '/api/auth/google/status');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('7. POST /api/auth/google/disconnect rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/auth/google/disconnect', {});
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('8. POST /api/auth/google/verify-repository rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/auth/google/verify-repository', {});
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 5. Dedicated Meeting Endpoints
  await check('9. POST /api/meetings/create rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/meetings/create', { title: 'Smoke Meeting' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('10. POST /api/meetings/join rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/meetings/join', { meetingId: 'mtg_smoke' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('11. POST /api/meetings/upload-recording rejects unauthenticated with 401', async () => {
    const res = await request('POST', '/api/meetings/upload-recording', { meetingId: 'mtg_smoke' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 6. Consolidated Meetings Endpoints (api/meetings/action.js)
  await check('12. POST /api/meetings/action rejects unauthenticated host action with 401', async () => {
    const res = await request('POST', '/api/meetings/action', { action: 'MUTE_PARTICIPANT' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check('13. POST /api/meetings/leave computes session duration successfully (200)', async () => {
    const joinTime = new Date(Date.now() - 60000).toISOString();
    const leaveTime = new Date().toISOString();
    const res = await request('POST', '/api/meetings/leave', {
      meetingId: 'mtg_smoke_leave',
      participantSessionId: 'sess_smoke_123',
      joinedAt: joinTime,
      leftAt: leaveTime
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.raw}`);
    if (!res.data || res.data.success !== true) throw new Error('Missing success: true in leave response');
    if (typeof res.data.durationSeconds !== 'number') throw new Error('Missing durationSeconds');
  });

  await check('14. GET /api/meetings/status returns room descriptor (200)', async () => {
    const res = await request('GET', '/api/meetings/status?publicId=room_smoke_test');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.raw}`);
    if (!res.data || res.data.success !== true) throw new Error('Missing success: true in status response');
    if (res.data.roomId !== 'room_smoke_test') throw new Error(`Expected roomId room_smoke_test, got ${res.data.roomId}`);
  });

  await check('15. POST /api/meetings/chat broadcasts text message successfully (201)', async () => {
    const res = await request('POST', '/api/meetings/chat', {
      meetingId: 'mtg_smoke_chat',
      user: { id: 'usr_smoke', name: 'Smoke Tester', role: 'STUDENT' },
      message: 'Smoke test message from CI/CD pipeline'
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.raw}`);
    if (!res.data || res.data.success !== true) throw new Error('Missing success: true in chat response');
    if (!res.data.message || res.data.message.senderRole !== 'STUDENT') throw new Error('Invalid chat message structure');
  });

  console.log('\n================================================================');
  console.log(` PRODUCTION SMOKE TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch(err => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});
