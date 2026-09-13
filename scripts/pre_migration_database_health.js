/**
 * PRE-MIGRATION DATABASE HEALTH & AUDIT SNAPSHOT
 */
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let secretKey = '';
let anonKey = '';
envFile.split('\n').forEach(l => {
  const line = l.trim();
  if (line.startsWith('SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  if (line.startsWith('SUPABASE_SECRET_KEY=')) secretKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
});

const url = 'https://logaawoigfxnisimfatf.supabase.co';

async function q(endpoint, apiKey = secretKey) {
  try {
    const res = await fetch(url + endpoint, {
      headers: {
        'apikey': apiKey,
        'Authorization': 'Bearer ' + apiKey,
        'Prefer': 'count=exact'
      }
    });
    const contentRange = res.headers.get('content-range');
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    let count = null;
    if (contentRange) {
      const parts = contentRange.split('/');
      if (parts[1]) count = parseInt(parts[1], 10);
    } else if (Array.isArray(data)) {
      count = data.length;
    }
    return { status: res.status, count, data };
  } catch (err) {
    return { error: err.message };
  }
}

async function captureSnapshot() {
  console.log('========================================================================');
  console.log(' CLASPTEK PRE-MIGRATION DATABASE HEALTH & AUDIT SNAPSHOT');
  console.log(' Timestamp:', new Date().toISOString());
  console.log(' Target:', url);
  console.log('========================================================================\n');

  // Check PostgREST and connectivity
  const tRes = await q('/rest/v1/tenants?select=*');
  console.log('1. Connectivity & Tenants:', tRes.status === 200 ? 'PASS' : 'FAIL', `(Count: ${tRes.count})`);

  const tables = [
    'tenants',
    'tenant_memberships',
    'programmes',
    'cohorts',
    'students',
    'enrolments',
    'training_sessions',
    'attendance',
    'facilitator_sessions',
    'facilitator_reports',
    'certificates',
    'invoices',
    'payments',
    'receipts',
    'expenses',
    'finance_audit_log'
  ];

  console.log('\n2. Table Counts (Exact):');
  const counts = {};
  for (const tbl of tables) {
    const res = await q(`/rest/v1/${tbl}?select=id`);
    counts[tbl] = res.count !== null ? res.count : (res.status === 200 ? 0 : 'ERROR ' + res.status);
    console.log(`   - ${tbl.padEnd(25)}: ${counts[tbl]}`);
  }

  // Check programmes in DB
  const pRes = await q('/rest/v1/programmes?select=id,code,name,status,tenant_id');
  console.log('\n3. Authoritative Programmes in DB:');
  console.log(pRes.data);

  // Check enrolments in DB
  const eRes = await q('/rest/v1/enrolments?select=id,student_name,programme_id,cohort_id,status,completion_status');
  console.log('\n4. Authoritative Enrolments in DB:');
  console.log(eRes.data);

  // Check certificates in DB
  const cRes = await q('/rest/v1/certificates?select=id,certificate_number,student_name_snapshot,programme_name_snapshot,status');
  console.log('\n5. Authoritative Certificates in DB:');
  console.log(cRes.data);

  const snapshot = {
    timestamp: new Date().toISOString(),
    url,
    counts,
    programmes: pRes.data,
    enrolments: eRes.data,
    certificates: cRes.data
  };

  fs.writeFileSync(path.join(__dirname, '..', 'scratch', 'pre_migration_snapshot.json'), JSON.stringify(snapshot, null, 2));
  console.log('\n✔ Pre-migration snapshot saved to scratch/pre_migration_snapshot.json');
}

captureSnapshot().catch(console.error);
