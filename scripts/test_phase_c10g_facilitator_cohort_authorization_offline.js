/**
 * scripts/test_phase_c10g_facilitator_cohort_authorization_offline.js
 * Phase C10G — offline test of POST /api/meetings/create facilitator cohort authorization.
 *
 * Runs the REAL route handler against an in-memory fake database and injected mocks. It verifies the
 * route's logic (which filters it applies and how it responds). It does NOT prove live database or
 * RLS enforcement.
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { makeNextServerMock, makeRequest, loadWithMocks, makeFakeDb } = require('./_c10g_route_harness');

const T1 = 'tenant-1';
const T2 = 'tenant-2';

const tables = {
  personnel: [
    { id: 'pF1', user_id: 'u-f1', tenant_id: T1 },
    { id: 'pF2', user_id: 'u-f2', tenant_id: T1 },
    { id: 'pF3', user_id: 'u-f3', tenant_id: T1 }, // facilitator leading no cohort
    { id: 'pB', user_id: 'u-b', tenant_id: T2 },
  ],
  cohorts: [
    { id: 'cA', tenant_id: T1, lead_facilitator_id: 'pF1' },
    { id: 'cB', tenant_id: T1, lead_facilitator_id: 'pF2' },
    { id: 'cNone', tenant_id: T1, lead_facilitator_id: null },
    { id: 'cX', tenant_id: T2, lead_facilitator_id: 'pB' },
  ],
  training_sessions: [
    { id: 'sDirect', tenant_id: T1, cohort_id: 'cB', facilitator_id: 'pF1' }, // directly assigned to pF1
    { id: 'sOfA', tenant_id: T1, cohort_id: 'cA', facilitator_id: null },
    { id: 'sOfB', tenant_id: T1, cohort_id: 'cB', facilitator_id: 'pF2' },
    { id: 'sOrphan', tenant_id: T1, cohort_id: null, facilitator_id: 'pF2' },
    { id: 'sX', tenant_id: T2, cohort_id: 'cX', facilitator_id: 'pB' },
  ],
};

let currentSession = null;
let db = null;
let saved = [];
let roomCalls = 0;

function freshState(session) {
  currentSession = session;
  db = makeFakeDb(tables);
  saved = [];
  roomCalls = 0;
}

const route = loadWithMocks('app/api/meetings/create/route.ts', {
  'next/server': makeNextServerMock(),
  '@/lib/auth/server': { getAuthoritativeSession: async () => currentSession },
  '@/lib/supabase/server': { createServerClient: async () => db.client },
  '@/lib/meetings/sfu': {
    getSFUService: () => ({ createRoom: async () => { roomCalls++; return { ok: true }; } }),
  },
  '@/lib/meetings/queries': { saveMeetingRecord: async (m) => { saved.push(m); } },
});

const sess = (role, userId, tenantId = T1) => ({ user: { id: userId }, role, tenantId });
const post = async (body) => route.POST(makeRequest({ title: 'Synthetic Class', ...body }));

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log(`  PASS: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name}\n     ${e.message}`); process.exitCode = 1; }
}

(async () => {
  console.log('=== C10G: Facilitator cohort authorization (offline, in-memory fake DB) ===');

  await test('assigned cohort: facilitator may schedule; server-resolved facilitator id stored', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const res = await post({ cohortId: 'cA' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].cohortId, 'cA');
    assert.strictEqual(saved[0].facilitatorId, 'pF1');
    assert.strictEqual(roomCalls, 1);
  });

  await test('unassigned cohort (same tenant, led by another facilitator): 403, nothing created', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const res = await post({ cohortId: 'cB' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'COHORT_NOT_ASSIGNED');
    assert.strictEqual(saved.length, 0);
    assert.strictEqual(roomCalls, 0, 'No LiveKit room may be created for a denied request');
  });

  await test('missing assignment (cohort has no lead facilitator): 403', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const res = await post({ cohortId: 'cNone' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(saved.length, 0);
  });

  await test('facilitator who leads no cohort is denied for every cohort', async () => {
    for (const c of ['cA', 'cB', 'cNone']) {
      freshState(sess('Facilitator', 'u-f3'));
      const res = await post({ cohortId: c });
      assert.strictEqual(res.status, 403, `cohort ${c}`);
    }
  });

  await test('cross-tenant cohort: denied with a response identical to a non-existent cohort (no leak)', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const cross = await post({ cohortId: 'cX' });
    freshState(sess('Facilitator', 'u-f1'));
    const missing = await post({ cohortId: 'does-not-exist' });
    freshState(sess('Facilitator', 'u-f1'));
    const unassigned = await post({ cohortId: 'cB' });
    assert.strictEqual(cross.status, 403);
    assert.deepStrictEqual(cross.body, missing.body);
    assert.deepStrictEqual(cross.body, unassigned.body);
    assert.strictEqual(saved.length, 0);
  });

  await test('client-supplied facilitatorId / tenantId are ignored for facilitators', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const denied = await post({ cohortId: 'cB', facilitatorId: 'pF2', tenantId: T1 });
    assert.strictEqual(denied.status, 403, 'claiming to be the cohort lead must not help');
    freshState(sess('Facilitator', 'u-f1'));
    const ok = await post({ cohortId: 'cA', facilitatorId: 'pF2', tenantId: T2 });
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(saved[0].facilitatorId, 'pF1');
    assert.strictEqual(saved[0].tenantId, T1);
  });

  await test('the cohort query actually applies tenant and lead_facilitator filters (facilitator)', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    await post({ cohortId: 'cA' });
    const q = db.queryLog.find((x) => x.table === 'cohorts');
    assert.ok(q, 'cohorts must be queried');
    const flat = JSON.stringify(q.filters);
    assert.ok(flat.includes('["tenant_id","tenant-1"]'), 'tenant filter missing');
    assert.ok(flat.includes('["lead_facilitator_id","pF1"]'), 'assignment filter missing');
  });

  await test('facilitator without a personnel profile: 403 INVALID_FACILITATOR', async () => {
    freshState(sess('Facilitator', 'u-unknown'));
    const res = await post({ cohortId: 'cA' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'INVALID_FACILITATOR');
  });

  await test('facilitator personnel from another tenant is not resolved', async () => {
    freshState(sess('Facilitator', 'u-b', T1)); // u-b belongs to tenant-2
    const res = await post({ cohortId: 'cA' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'INVALID_FACILITATOR');
  });

  await test('training session: directly assigned or led-cohort allowed; other facilitator\'s denied', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    assert.strictEqual((await post({ trainingSessionId: 'sDirect' })).status, 201);
    freshState(sess('Facilitator', 'u-f1'));
    assert.strictEqual((await post({ trainingSessionId: 'sOfA' })).status, 201);
    freshState(sess('Facilitator', 'u-f1'));
    const denied = await post({ trainingSessionId: 'sOfB' });
    assert.strictEqual(denied.status, 403);
    freshState(sess('Facilitator', 'u-f1'));
    assert.strictEqual((await post({ trainingSessionId: 'sOrphan' })).status, 403);
    freshState(sess('Facilitator', 'u-f1'));
    assert.strictEqual((await post({ trainingSessionId: 'sX' })).status, 403, 'cross-tenant session');
  });

  await test('meeting without cohort/session remains allowed for a facilitator (existing behaviour preserved)', async () => {
    freshState(sess('Facilitator', 'u-f1'));
    const res = await post({});
    assert.strictEqual(res.status, 201);
    assert.strictEqual(saved[0].cohortId, null);
    assert.strictEqual(saved[0].facilitatorId, 'pF1');
  });

  await test('privileged roles keep existing behaviour: Super Admin and Finance Manager may use any tenant cohort', async () => {
    for (const role of ['Super Admin', 'Finance Manager']) {
      freshState(sess(role, 'u-admin'));
      const res = await post({ cohortId: 'cB', facilitatorId: 'pF2' });
      assert.strictEqual(res.status, 201, role);
      assert.strictEqual(saved[0].cohortId, 'cB');
      assert.strictEqual(saved[0].facilitatorId, 'pF2');
    }
  });

  await test('privileged roles: cross-tenant / missing cohort still rejected with 400 INVALID_COHORT', async () => {
    for (const c of ['cX', 'nope']) {
      freshState(sess('Super Admin', 'u-admin'));
      const res = await post({ cohortId: c });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'INVALID_COHORT');
    }
  });

  await test('privileged roles: lead_facilitator filter is NOT applied (no behaviour change)', async () => {
    freshState(sess('Super Admin', 'u-admin'));
    await post({ cohortId: 'cB' });
    const q = db.queryLog.find((x) => x.table === 'cohorts');
    assert.ok(!JSON.stringify(q.filters).includes('lead_facilitator_id'));
  });

  await test('unauthorised role: 403; unauthenticated: 401', async () => {
    freshState(sess('Staff', 'u-staff'));
    assert.strictEqual((await post({ cohortId: 'cA' })).status, 403);
    freshState(null);
    assert.strictEqual((await post({ cohortId: 'cA' })).status, 401);
  });

  await test('provider rule unchanged: google_meet creation rejected with PROVIDER_UNSUPPORTED', async () => {
    freshState(sess('Super Admin', 'u-admin'));
    const res = await post({ provider: 'google_meet' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'PROVIDER_UNSUPPORTED');
    freshState(sess('Super Admin', 'u-admin'));
    assert.strictEqual((await post({ googleMeetUrl: 'https://meet.google.com/abc-defg-hij' })).status, 400);
    assert.strictEqual(roomCalls, 0);
  });

  console.log(`\nResult: ${passed}/${total} passed`);
  console.log('Limitation: in-memory fake DB; live Supabase/RLS enforcement is NOT verified by this suite.');
  if (passed !== total) process.exitCode = 1;
})();
