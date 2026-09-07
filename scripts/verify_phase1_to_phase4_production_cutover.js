/**
 * CLASPTEK ENTERPRISE PRODUCTION MIGRATION VERIFICATION SCRIPT
 * Target: Verify live schema deployment of Phase 1 to Phase 4 on Supabase Cloud
 * Target URL: https://logaawoigfxnisimfatf.supabase.co
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

let secretKey = '';
let publishableKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_SECRET_KEY=')) secretKey = line.split('=')[1].trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_PUBLISHABLE_KEY=')) publishableKey = line.split('=')[1].trim().replace(/['"]/g, '');
});

const SUPABASE_URL = 'https://logaawoigfxnisimfatf.supabase.co';

function request(path, apiKey, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const url = new URL(path.startsWith('http') ? path : `${SUPABASE_URL}/rest/v1/${path}`);
    const req = https.request(url, {
      method,
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function verifyDeployment() {
  console.log('================================================================================');
  console.log(' CLASPTEK PRODUCTION SCHEMA VERIFICATION: PHASE 1 THROUGH PHASE 4');
  console.log(' Target: ' + SUPABASE_URL);
  console.log('================================================================================\n');

  const requiredTables = [
    'students',
    'programmes',
    'cohorts',
    'enrolments',
    'training_sessions',
    'attendance',
    'facilitator_reports',
    'certificates'
  ];

  let passed = 0;
  let missing = 0;

  console.log('--- 1. Checking Table Schema Availability ---');
  for (const table of requiredTables) {
    const res = await request(`${table}?select=id&limit=1`, secretKey);
    if (res.status === 200) {
      console.log(`  ✔ PASS: public.${table} exists and is queryable (HTTP 200)`);
      passed++;
    } else {
      console.log(`  ✖ FAIL: public.${table} status HTTP ${res.status} (${JSON.stringify(res.data)})`);
      missing++;
    }
  }

  console.log('\n--- 2. Checking Reconciled Columns on Programmes & Enrolments ---');
  const progRes = await request('programmes?select=duration_weeks,session_count&limit=1', secretKey);
  if (progRes.status === 200) {
    console.log('  ✔ PASS: programmes.duration_weeks and session_count exist');
    passed++;
  } else {
    console.log(`  ✖ FAIL: programmes columns missing (HTTP ${progRes.status})`);
    missing++;
  }

  const enrRes = await request('enrolments?select=student_id,cohort_id,completion_status&limit=1', secretKey);
  if (enrRes.status === 200) {
    console.log('  ✔ PASS: enrolments.student_id, cohort_id, and completion_status exist');
    passed++;
  } else {
    console.log(`  ✖ FAIL: enrolments columns missing (HTTP ${enrRes.status})`);
    missing++;
  }

  console.log('\n--- 3. Checking Public RPC: verify_certificate_public ---');
  const rpcRes = await request('rpc/verify_certificate_public', publishableKey, 'POST', {
    p_cert_number: 'TEST-NONEXISTENT',
    p_token: 'TEST-TOKEN'
  });
  if (rpcRes.status === 200 && rpcRes.data && rpcRes.data.valid === false) {
    console.log('  ✔ PASS: verify_certificate_public RPC callable publicly via publishable key');
    passed++;
  } else {
    console.log(`  ✖ FAIL: verify_certificate_public RPC returned HTTP ${rpcRes.status}:`, rpcRes.data);
    missing++;
  }

  console.log('\n================================================================================');
  if (missing === 0) {
    console.log(` ALL CHECKS PASSED: ${passed}/${passed} — PRODUCTION SCHEMA IS AUTHORITATIVE!`);
  } else {
    console.log(` RESULT: ${passed} passed, ${missing} pending schema execution in Supabase Dashboard.`);
  }
  console.log('================================================================================\n');

  process.exit(missing === 0 ? 0 : 1);
}

verifyDeployment().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
