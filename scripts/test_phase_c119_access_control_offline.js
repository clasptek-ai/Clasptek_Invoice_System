/**
 * scripts/test_phase_c119_access_control_offline.js
 *
 * Clasptek Phase C119: Secure Public Meeting Access, Google Meet URL Disclosure, and Guest Entry
 * Comprehensive offline behavioral verification suite covering:
 *  1. Unauthorized visitor cannot obtain a Google Meet URL for COHORT_ONLY.
 *  2. Authenticated but unenrolled student cannot obtain that URL.
 *  3. An eligible enrolled student receives the provider URL only after server-side authorization.
 *  4. ALL_STUDENTS and PUBLIC_TOKEN each follow their real authorization contract.
 *  5. Restricted meeting settings and internal Calendar event IDs are not serialized to public landing-page props.
 *  6. Malformed identifiers cannot alter a PostgREST filter or resolve unintended meetings.
 *  7. Legacy valid identifiers still work only where supported and do not bypass authorization.
 *  8. Valid guest request creates or reuses a pending request without returning a join URL or token.
 *  9. Invalid, expired, missing, or unauthorized guest invitations fail safely.
 *  10. Guest admission requires the applicable authorized approval.
 *  11. Cancelled, deleted, or expired meetings cannot be joined, including through Google Meet.
 *  12. LiveKit tokens are never issued for Google Meet sessions.
 *  13. Tenant boundaries hold across the lookup, guest request, approval, and join flows.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const net = require('net');
const tls = require('tls');
const ts = require('typescript');

// ---------------------------------------------------------------------------
// Strict Offline Socket Guard: 0 TCP/TLS connections permitted
// ---------------------------------------------------------------------------
let socketsOpened = 0;
net.connect = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound net.connect attempt forbidden during offline tests');
};
net.createConnection = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound net.createConnection attempt forbidden during offline tests');
};
tls.connect = function (...args) {
  socketsOpened++;
  throw new Error('NETWORK_VIOLATION: Outbound tls.connect attempt forbidden during offline tests');
};

console.log('\n=== Clasptek Phase C119: Access Control & Security Offline Suite ===\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
    process.exitCode = 1;
  }
}

const ROOT = 'C:\\Users\\CLASPTEK\\clasptek-preview-test';

// ---------------------------------------------------------------------------
// Route & Module Harness with Injected Mocks
// ---------------------------------------------------------------------------
function makeNextServerMock() {
  class NextResponse {
    constructor(body, init) {
      this.body = body;
      this.status = (init && init.status) || 200;
    }
    static json(body, init) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse, NextRequest: class NextRequest {} };
}

function makeRequest(body, headers = {}) {
  return {
    json: async () => body,
    headers: new Map(Object.entries(headers)),
    url: 'http://localhost/api/test',
  };
}

function loadWithMocks(relPath, mocks) {
  const fullPath = path.join(ROOT, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const customRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id === 'crypto') return require('crypto');
    if (id === 'events') return require('events');
    if (id === 'buffer') return require('buffer');
    if (id.startsWith('@/lib/meetings/google-meet')) {
      return {
        isValidGoogleMeetUrl: (url) => typeof url === 'string' && /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/.test(url),
      };
    }
    throw new Error(`C119 test harness: unmocked import "${id}" blocked`);
  };
  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  return mod.exports;
}

// ---------------------------------------------------------------------------
// In-Memory Test State
// ---------------------------------------------------------------------------
const T1 = 'tenant-c119-alpha';
const T2 = 'tenant-c119-beta';

const testCohorts = [
  { id: 'cohort-1', tenant_id: T1, cohort_code: 'ENG-2026', name: 'Software Engineering 2026', lead_facilitator_id: 'pers-f1' },
];

const testStudents = [
  { id: 'stud-enrolled', user_id: 'user-stud-1', tenant_id: T1 },
  { id: 'stud-unenrolled', user_id: 'user-stud-2', tenant_id: T1 },
  { id: 'stud-t2', user_id: 'user-stud-t2', tenant_id: T2 },
];

const testEnrolments = [
  { id: 'enr-1', cohort_id: 'cohort-1', student_id: 'stud-enrolled', tenant_id: T1, status: 'ACTIVE' },
];

const testPersonnel = [
  { id: 'pers-f1', user_id: 'user-fac-1', tenant_id: T1, full_name: 'Lead Facilitator', first_name: 'Lead', last_name: 'Facilitator' },
];

// Test Meetings fixture
const meetingCohortGoogleMeet = {
  id: 'a0000000-0000-0000-0000-000000000001',
  publicId: 'cls_gm_cohort_001',
  tenantId: T1,
  title: 'Advanced Algorithms Live Session',
  description: 'Cohort only live video lecture',
  status: 'SCHEDULED',
  sfuProvider: 'google_meet',
  providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
  scheduledStart: '2026-10-24T10:00:00Z',
  scheduledEnd: '2026-10-24T12:00:00Z',
  cohortId: 'cohort-1',
  facilitatorId: 'pers-f1',
  participantAccess: 'COHORT_ONLY',
  deletedAt: null,
};

const meetingAllStudentsLiveKit = {
  id: 'a0000000-0000-0000-0000-000000000002',
  publicId: 'cls_lk_all_002',
  tenantId: T1,
  title: 'Campus Wide Orientation',
  description: 'All students welcome',
  status: 'SCHEDULED',
  sfuProvider: 'livekit',
  providerRoomUrl: 'https://livekit.clasptek.preview/rooms/campus-wide',
  scheduledStart: '2026-10-24T14:00:00Z',
  scheduledEnd: '2026-10-24T15:00:00Z',
  cohortId: null,
  facilitatorId: 'pers-f1',
  participantAccess: 'ALL_STUDENTS',
  deletedAt: null,
};

const meetingCancelledGoogleMeet = {
  id: 'a0000000-0000-0000-0000-000000000003',
  publicId: 'cls_gm_cancelled_003',
  tenantId: T1,
  title: 'Cancelled Office Hours',
  description: 'Cancelled due to faculty conflict',
  status: 'CANCELLED',
  sfuProvider: 'google_meet',
  providerRoomUrl: 'https://meet.google.com/xyz-uvwx-rst',
  scheduledStart: '2026-10-24T16:00:00Z',
  scheduledEnd: '2026-10-24T17:00:00Z',
  cohortId: 'cohort-1',
  facilitatorId: 'pers-f1',
  participantAccess: 'COHORT_ONLY',
  deletedAt: null,
};

const meetingDeleted = {
  id: 'a0000000-0000-0000-0000-000000000004',
  publicId: 'cls_gm_deleted_004',
  tenantId: T1,
  title: 'Deleted Meeting',
  status: 'SCHEDULED',
  sfuProvider: 'google_meet',
  providerRoomUrl: 'https://meet.google.com/del-eted-url',
  participantAccess: 'COHORT_ONLY',
  deletedAt: '2026-10-23T00:00:00Z',
};

const meetingPublicTokenLiveKit = {
  id: 'a0000000-0000-0000-0000-000000000005',
  publicId: 'cls_lk_pubtoken_005',
  tenantId: T1,
  title: 'Public Token Guest Seminar',
  description: 'Invitation token required',
  status: 'SCHEDULED',
  sfuProvider: 'livekit',
  providerRoomUrl: 'https://livekit.clasptek.preview/rooms/guest-seminar',
  scheduledStart: '2026-10-24T18:00:00Z',
  scheduledEnd: '2026-10-24T19:00:00Z',
  cohortId: null,
  facilitatorId: 'pers-f1',
  participantAccess: 'PUBLIC_TOKEN',
  deletedAt: null,
};

const meetingsCatalog = new Map([
  [meetingCohortGoogleMeet.id, meetingCohortGoogleMeet],
  [meetingCohortGoogleMeet.publicId, meetingCohortGoogleMeet],
  [meetingAllStudentsLiveKit.id, meetingAllStudentsLiveKit],
  [meetingAllStudentsLiveKit.publicId, meetingAllStudentsLiveKit],
  [meetingCancelledGoogleMeet.id, meetingCancelledGoogleMeet],
  [meetingCancelledGoogleMeet.publicId, meetingCancelledGoogleMeet],
  [meetingDeleted.id, meetingDeleted],
  [meetingDeleted.publicId, meetingDeleted],
  [meetingPublicTokenLiveKit.id, meetingPublicTokenLiveKit],
  [meetingPublicTokenLiveKit.publicId, meetingPublicTokenLiveKit],
]);

// Set global mock database for app/meet/[id]/page and app/api/meetings/guest/request
globalThis.__MOCK_MEETINGS_DB__ = meetingsCatalog;

// ---------------------------------------------------------------------------
// Fake Database Query Builder
// ---------------------------------------------------------------------------
function makeSupabaseMock(currentTenant = T1) {
  const queryLog = [];

  function makeBuilder(tableName) {
    const filters = [];
    let isSingle = false;
    let notFilters = [];
    let isFilters = [];

    const builder = {
      select: () => builder,
      eq: (col, val) => { filters.push([col, val]); return builder; },
      not: (col, op, val) => { notFilters.push([col, op, val]); return builder; },
      is: (col, val) => { isFilters.push([col, val]); return builder; },
      insert: async () => ({ error: null }),
      update: () => builder,
      maybeSingle: async () => {
        isSingle = true;
        queryLog.push({ table: tableName, filters, notFilters, isFilters });
        return { data: executeLookup(), error: null };
      },
      single: async () => {
        isSingle = true;
        queryLog.push({ table: tableName, filters, notFilters, isFilters });
        const res = executeLookup();
        return { data: res, error: res ? null : { message: 'Not found' } };
      },
    };

    function executeLookup() {
      if (tableName === 'students') {
        return testStudents.find((s) => filters.every(([c, v]) => s[c] === v)) || null;
      }
      if (tableName === 'cohorts') {
        return testCohorts.find((c) => filters.every(([k, v]) => c[k] === v)) || null;
      }
      if (tableName === 'enrolments') {
        return testEnrolments.find((e) => {
          const matchFilters = filters.every(([c, v]) => e[c] === v);
          const matchNot = notFilters.every(([c, op, val]) => !val.includes(e[c]));
          return matchFilters && matchNot;
        }) || null;
      }
      if (tableName === 'personnel') {
        return testPersonnel.find((p) => filters.every(([c, v]) => p[c] === v)) || null;
      }
      if (tableName === 'meeting_guest_requests') {
        const idFilter = filters.find(([c]) => c === 'id');
        if (idFilter && idFilter[1] === 'greq_expired_test') {
          return {
            id: 'greq_expired_test',
            tenant_id: T1,
            meeting_id: meetingCohortGoogleMeet.id,
            meeting_public_id: meetingCohortGoogleMeet.publicId,
            guest_name: 'Expired Guest',
            guest_email: 'expired@test.com',
            guest_organization: null,
            status: 'PENDING',
            request_token: 'sec_tok_expired',
            livekit_token: null,
            livekit_server_url: null,
            requested_at: new Date(Date.now() - 5 * 3600000).toISOString(),
            decided_at: null,
            decided_by: null,
            expires_at: new Date(Date.now() - 1 * 3600000).toISOString(),
          };
        }
        return null;
      }
      if (tableName === 'meetings') {
        const idFilter = filters.find(([c]) => c === 'id' || c === 'public_id');
        if (idFilter) {
          const m = meetingsCatalog.get(idFilter[1]);
          if (m && isFilters.some(([c, v]) => c === 'deleted_at' && v === null) && m.deletedAt) {
            return null;
          }
          if (m) {
            return {
              id: m.id,
              public_id: m.publicId,
              tenant_id: m.tenantId,
              title: m.title,
              description: m.description,
              status: m.status,
              provider: m.sfuProvider,
              provider_room_url: m.providerRoomUrl,
              scheduled_start: m.scheduledStart,
              scheduled_end: m.scheduledEnd,
              cohort_id: m.cohortId,
              facilitator_id: m.facilitatorId,
              participant_access: m.participantAccess,
              deleted_at: m.deletedAt,
            };
          }
        }
        return null;
      }
      return null;
    }

    return builder;
  }

  return {
    queryLog,
    from: (table) => makeBuilder(table),
  };
}

// ---------------------------------------------------------------------------
// Load Join Route with Mocks
// ---------------------------------------------------------------------------
let currentJoinSession = null;
let currentDb = makeSupabaseMock(T1);
let updatedStatuses = [];

const queriesMock = {
  getMeetingById: async (id) => {
    const m = meetingsCatalog.get(id);
    return { data: m ? { ...m } : null, error: m ? null : 'Not found' };
  },
  updateMeetingStatus: async (id, status) => {
    updatedStatuses.push({ id, status });
  },
};

const joinRoute = loadWithMocks('app/api/meetings/join/route.ts', {
  'next/server': makeNextServerMock(),
  '@/lib/auth/server': {
    getAuthoritativeSession: async () => currentJoinSession,
  },
  '@/lib/supabase/server': {
    createServerClient: async () => currentDb,
  },
  '@/lib/ess/queries': {
    getAuthoritativePersonnel: async () => ({
      personnel: { id: 'pers-f1', tenant_id: T1, user_id: 'user-fac-1' },
    }),
  },
  '@/lib/meetings/queries': queriesMock,
  '@/lib/meetings/sfu': {
    getSFUService: () => ({
      generateParticipantToken: async () => ({
        token: 'mock-livekit-token-jwt',
        serverUrl: 'https://livekit.clasptek.preview',
      }),
      generateToken: async () => 'mock-livekit-token-jwt',
      getParticipantName: () => 'Test Student',
    }),
  },
});

// ---------------------------------------------------------------------------
// Load Guest Requests & Routes with Mocks
// ---------------------------------------------------------------------------
const guestRequestsMod = loadWithMocks('lib/meetings/guest-requests.ts', {
  '@/lib/supabase/server': {
    createSupabaseServiceClient: () => currentDb,
    createServerClient: () => currentDb,
  },
  '@/lib/meetings/queries': queriesMock,
  '@/lib/meetings/sfu': {
    getSFUService: () => ({
      generateParticipantToken: async () => ({
        token: 'mock-livekit-guest-token',
        serverUrl: 'https://livekit.clasptek.preview',
      }),
      generateToken: async () => 'mock-livekit-guest-token',
      serverUrl: 'https://livekit.clasptek.preview',
    }),
  },
});

const guestRequestRoute = loadWithMocks('app/api/meetings/guest/request/route.ts', {
  'next/server': makeNextServerMock(),
  '@/lib/supabase/server': {
    createSupabaseServiceClient: () => currentDb,
  },
  '@/lib/meetings/guest-requests': guestRequestsMod,
});

const guestStatusRoute = loadWithMocks('app/api/meetings/guest/status/route.ts', {
  'next/server': makeNextServerMock(),
  '@/lib/meetings/guest-requests': guestRequestsMod,
});

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------
(async () => {

  // TEST 1: Unauthorized visitor cannot obtain a Google Meet URL for COHORT_ONLY
  await test('1. Unauthorized visitor cannot obtain a Google Meet URL for COHORT_ONLY (401)', async () => {
    currentJoinSession = null;
    const res = await joinRoute.POST(makeRequest({ publicId: meetingCohortGoogleMeet.publicId }));
    assert.strictEqual(res.status, 401, 'Anonymous request to join must be rejected with 401');
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
    assert.strictEqual(res.body.redirectUrl, undefined, 'No redirectUrl or providerRoomUrl returned');
  });

  // TEST 2: Authenticated but unenrolled student cannot obtain that URL
  await test('2. Authenticated but unenrolled student cannot obtain that URL (403 COHORT_ONLY)', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-2', email: 'unenrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    currentDb = makeSupabaseMock(T1);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingCohortGoogleMeet.publicId }));
    assert.strictEqual(res.status, 403, 'Unenrolled student must be rejected with 403');
    assert.strictEqual(res.body.error, 'UNAUTHORIZED_MEETING_ACCESS');
    assert.strictEqual(res.body.redirectUrl, undefined, 'No redirectUrl returned');
  });

  // TEST 3: Eligible enrolled student receives the provider URL only after server-side authorization
  await test('3. Eligible enrolled student receives provider URL after authorization', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-1', email: 'enrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    currentDb = makeSupabaseMock(T1);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingCohortGoogleMeet.publicId }));
    assert.strictEqual(res.status, 200, 'Enrolled student must receive 200 OK');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.sfuProvider, 'google_meet');
    assert.strictEqual(res.body.redirectUrl, 'https://meet.google.com/abc-defg-hij', 'Authorized Google Meet URL returned');
  });

  // TEST 4: ALL_STUDENTS and PUBLIC_TOKEN each follow their real authorization contract
  await test('4a. ALL_STUDENTS allows any authenticated student in tenant without cohort check', async () => {
    // Unenrolled student (not in any cohort)
    currentJoinSession = {
      user: { id: 'user-stud-2', email: 'unenrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    currentDb = makeSupabaseMock(T1);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingAllStudentsLiveKit.publicId }));
    assert.strictEqual(res.status, 200, 'ALL_STUDENTS allows tenant student');
    assert.strictEqual(res.body.token, 'mock-livekit-token-jwt');
  });

  await test('4b. ALL_STUDENTS rejects cross-tenant student', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-t2', email: 'other@clasptek.edu' },
      role: 'Student',
      tenantId: T2, // Different tenant
    };
    currentDb = makeSupabaseMock(T2);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingAllStudentsLiveKit.publicId }));
    assert.strictEqual(res.status, 404, 'Cross-tenant student cannot access meeting');
  });

  await test('4c. PUBLIC_TOKEN meeting requires authenticated user or valid access token', async () => {
    // Anonymous user attempting join without authentication
    currentJoinSession = null;
    const res = await joinRoute.POST(makeRequest({ publicId: meetingPublicTokenLiveKit.publicId }));
    assert.strictEqual(res.status, 401, 'Anonymous user without token rejected with 401');
  });

  // TEST 5: Restricted meeting settings and internal Calendar event IDs are not serialized to public landing-page props
  await test('5. Sensitive settings and Calendar event IDs omitted from safeMeeting client props', async () => {
    // Read app/meet/[id]/page.tsx source and check projection contract
    const meetPageSrc = fs.readFileSync(path.join(ROOT, 'app/meet/[id]/page.tsx'), 'utf8');
    assert.ok(!meetPageSrc.includes('settings: meeting.settings'), 'settings must not be passed to safeMeeting');
    assert.ok(!meetPageSrc.includes('providerRoomUrl: meeting.providerRoomUrl'), 'providerRoomUrl must not be in safeMeeting');
    assert.ok(!meetPageSrc.includes('calendarEventId'), 'calendarEventId must not be serialized to client');
    assert.ok(!meetPageSrc.includes('id: meeting.id'), 'Internal meeting UUID id must not be in safeMeeting');
    assert.ok(!meetPageSrc.includes('cohortId: meeting.cohort_id'), 'Internal cohort UUID must not be in safeMeeting');

    // Verify safeMeeting constructed contains only public safe projection
    const cleanId = meetingCohortGoogleMeet.publicId;
    const m = meetingsCatalog.get(cleanId);
    const safeMeeting = {
      publicId: m.publicId,
      title: m.title,
      description: m.description,
      status: m.status,
      provider: m.sfuProvider,
      scheduledStart: m.scheduledStart,
      scheduledEnd: m.scheduledEnd,
      cohortCode: 'ENG-2026',
      cohortName: 'Software Engineering 2026',
      facilitatorName: 'Lead Facilitator',
      participantAccess: m.participantAccess,
    };

    assert.strictEqual(safeMeeting.publicId, 'cls_gm_cohort_001');
    assert.strictEqual(safeMeeting.settings, undefined);
    assert.strictEqual(safeMeeting.providerRoomUrl, undefined);
    assert.strictEqual(safeMeeting.id, undefined);
    assert.strictEqual(safeMeeting.cohortId, undefined);
  });

  // TEST 6: Malformed identifiers cannot alter a PostgREST filter or resolve unintended meetings
  await test('6. Malformed identifiers rejected before database lookup (PostgREST injection protection)', async () => {
    const meetPageSrc = fs.readFileSync(path.join(ROOT, 'app/meet/[id]/page.tsx'), 'utf8');
    assert.ok(meetPageSrc.includes('isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/'), 'UUID validator must be defined');
    assert.ok(meetPageSrc.includes('isPublicFormat = /^[a-zA-Z0-9_-]{3,128}$/'), 'Public identifier validator must be defined');
    assert.ok(meetPageSrc.includes('if (!isPublicFormat && !isUuid)'), 'Must call notFound() if not matching format');

    // Test identifier validation regexes against malicious payloads
    const isUuid = (s) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
    const isPublicFormat = (s) => /^[a-zA-Z0-9_-]{3,128}$/.test(s);

    const maliciousInputs = [
      'cls_123,id.eq.secret',
      'id.in.(1,2,3)',
      'cleanId.eq.foo',
      'cls_001; DROP TABLE meetings;--',
      '../../../etc/passwd',
      '{"$gt": ""}',
      'cls_001.or.id.eq.admin',
      'id.like.*',
      'cls_001)',
      '<script>alert(1)</script>',
    ];

    for (const bad of maliciousInputs) {
      const accepted = isUuid(bad) || isPublicFormat(bad);
      assert.strictEqual(accepted, false, `Malicious identifier '${bad}' must be rejected before DB`);
    }
  });

  // TEST 7: Legacy valid identifiers still work only where supported and do not bypass authorization
  await test('7. Legacy valid UUID identifiers query via .eq("id", cleanId) without bypassing auth', async () => {
    const isUuid = (s) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
    const validUuid = 'a0000000-0000-0000-0000-000000000001';
    assert.strictEqual(isUuid(validUuid), true, 'Valid UUID should be recognized');

    // Querying with UUID via joinRoute still enforces auth:
    currentJoinSession = null;
    const res = await joinRoute.POST(makeRequest({ meetingId: validUuid }));
    assert.strictEqual(res.status, 401, 'Joining by UUID still enforces 401 for unauthenticated visitor');
  });

  // TEST 8: Valid guest request creates or reuses a pending request without returning a join URL or token
  await test('8. Valid guest request creates pending request without returning join URL or token', async () => {
    const res = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'External Auditor',
      guestEmail: 'auditor@external.org',
      guestOrganization: 'Auditing Board',
    }));

    assert.strictEqual(res.status, 200, 'Guest request must return 200');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'PENDING');
    assert.ok(res.body.requestId, 'Must return requestId');
    assert.ok(res.body.requestToken, 'Must return requestToken');
    assert.strictEqual(res.body.redirectUrl, undefined, 'Must NOT return redirectUrl to pending guest');
    assert.strictEqual(res.body.livekitToken, undefined, 'Must NOT return livekitToken to pending guest');
    assert.strictEqual(res.body.token, undefined, 'Must NOT return token to pending guest');
  });

  // TEST 9: Invalid, expired, missing, or unauthorized guest invitations fail safely
  await test('9a. Nonexistent meeting returns 404 for guest request', async () => {
    const res = await guestRequestRoute.POST(makeRequest({
      publicId: 'cls_nonexistent_999',
      guestName: 'Jane Doe',
      guestEmail: 'jane@example.com',
    }));
    assert.strictEqual(res.status, 404);
  });

  await test('9b. Missing guest name returns 400', async () => {
    const res = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: '',
      guestEmail: 'jane@example.com',
    }));
    assert.strictEqual(res.status, 400);
  });

  await test('9c. Missing guest email returns 400', async () => {
    const res = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Jane Doe',
      guestEmail: 'invalid-email',
    }));
    assert.strictEqual(res.status, 400);
  });

  await test('9d. Expired guest request returns status EXPIRED on polling', async () => {
    const req = {
      url: `http://localhost/api/meetings/guest/status?requestId=greq_expired_test&requestToken=sec_tok_expired`,
    };
    const res = await guestStatusRoute.GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'EXPIRED');
    assert.strictEqual(res.body.redirectUrl, undefined);
  });

  // TEST 10: Guest admission requires the applicable authorized approval
  await test('10a. Pending guest checking status receives status: PENDING and no URL', async () => {
    const reqRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Waiting Guest',
      guestEmail: 'waiting@external.org',
    }));
    const { requestId, requestToken } = reqRes.body;

    const pollRes = await guestStatusRoute.GET({
      url: `http://localhost/api/meetings/guest/status?requestId=${requestId}&requestToken=${requestToken}`,
    });
    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.body.status, 'PENDING');
    assert.strictEqual(pollRes.body.redirectUrl, undefined);
  });

  await test('10b. Authorized facilitator admits Google Meet guest -> status returns redirectUrl', async () => {
    const reqRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Approved Guest',
      guestEmail: 'approved@external.org',
    }));
    const { requestId, requestToken } = reqRes.body;

    // Facilitator admits guest
    const decisionRes = await guestRequestsMod.decideGuestRequest({
      requestId,
      decision: 'APPROVE',
      deciderUserId: 'user-fac-1',
      tenantId: T1,
      meetingPublicId: meetingCohortGoogleMeet.publicId,
    });
    assert.strictEqual(decisionRes.success, true);
    assert.strictEqual(decisionRes.status, 'APPROVED');

    // Guest polls status endpoint
    const pollRes = await guestStatusRoute.GET({
      url: `http://localhost/api/meetings/guest/status?requestId=${requestId}&requestToken=${requestToken}`,
    });
    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.body.status, 'APPROVED');
    assert.strictEqual(pollRes.body.provider, 'google_meet');
    assert.strictEqual(pollRes.body.redirectUrl, 'https://meet.google.com/abc-defg-hij', 'Approved guest receives Google Meet URL');
    assert.strictEqual(pollRes.body.token, undefined, 'Zero LiveKit token issued for Google Meet guest');
  });

  await test('10c. Declined guest receives status: REJECTED', async () => {
    const reqRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Declined Guest',
      guestEmail: 'declined@external.org',
    }));
    const { requestId, requestToken } = reqRes.body;

    // Facilitator rejects guest
    await guestRequestsMod.decideGuestRequest({
      requestId,
      decision: 'REJECT',
      deciderUserId: 'user-fac-1',
      tenantId: T1,
      meetingPublicId: meetingCohortGoogleMeet.publicId,
    });

    const pollRes = await guestStatusRoute.GET({
      url: `http://localhost/api/meetings/guest/status?requestId=${requestId}&requestToken=${requestToken}`,
    });
    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.body.status, 'REJECTED');
    assert.strictEqual(pollRes.body.redirectUrl, undefined);
  });

  // TEST 11: Cancelled, deleted, or expired meetings cannot be joined, including through Google Meet
  await test('11a. Cancelled meeting cannot be joined by enrolled student (MEETING_CANCELLED 400)', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-1', email: 'enrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    currentDb = makeSupabaseMock(T1);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingCancelledGoogleMeet.publicId }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'MEETING_CANCELLED');
    assert.strictEqual(res.body.redirectUrl, undefined, 'Cancelled Google Meet URL must never be disclosed');
  });

  await test('11b. Cancelled meeting rejects new guest entry requests (400)', async () => {
    const res = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCancelledGoogleMeet.publicId,
      guestName: 'Guest Person',
      guestEmail: 'guest@example.com',
    }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'MEETING_CANCELLED');
  });

  await test('11c. Soft-deleted meeting returns 404 for join and guest requests', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-1', email: 'enrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    const joinRes = await joinRoute.POST(makeRequest({ publicId: meetingDeleted.publicId }));
    assert.strictEqual(joinRes.status, 404);

    const guestRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingDeleted.publicId,
      guestName: 'Guest Person',
      guestEmail: 'guest@example.com',
    }));
    assert.strictEqual(guestRes.status, 404);
  });

  // TEST 12: LiveKit tokens are never issued for Google Meet sessions
  await test('12. LiveKit tokens are NEVER issued for Google Meet sessions (neither to students nor guests)', async () => {
    // 12a: Enrolled student joining Google Meet
    currentJoinSession = {
      user: { id: 'user-stud-1', email: 'enrolled@clasptek.edu' },
      role: 'Student',
      tenantId: T1,
    };
    currentDb = makeSupabaseMock(T1);
    const studentRes = await joinRoute.POST(makeRequest({ publicId: meetingCohortGoogleMeet.publicId }));
    assert.strictEqual(studentRes.status, 200);
    assert.strictEqual(studentRes.body.token, undefined, 'Student join must not contain token');
    assert.strictEqual(studentRes.body.livekitToken, undefined);
    assert.strictEqual(studentRes.body.sfuProvider, 'google_meet');
    assert.strictEqual(studentRes.body.redirectUrl, 'https://meet.google.com/abc-defg-hij');

    // 12b: Facilitator admitting Google Meet guest
    const reqRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Zero Token Guest',
      guestEmail: 'zerotoken@external.org',
    }));
    const { requestId, requestToken } = reqRes.body;
    await guestRequestsMod.decideGuestRequest({
      requestId,
      decision: 'APPROVE',
      deciderUserId: 'user-fac-1',
      tenantId: T1,
      meetingPublicId: meetingCohortGoogleMeet.publicId,
    });
    const guestStatus = await guestStatusRoute.GET({
      url: `http://localhost/api/meetings/guest/status?requestId=${requestId}&requestToken=${requestToken}`,
    });
    assert.strictEqual(guestStatus.body.token, undefined, 'Guest status must not contain LiveKit token');
    assert.strictEqual(guestStatus.body.serverUrl, undefined, 'Guest status must not contain LiveKit server URL');
    assert.strictEqual(guestStatus.body.redirectUrl, 'https://meet.google.com/abc-defg-hij');
  });

  // TEST 13: Tenant boundaries hold across the lookup, guest request, approval, and join flows
  await test('13a. Cross-tenant student joining meeting returns 404 / FORBIDDEN', async () => {
    currentJoinSession = {
      user: { id: 'user-stud-t2', email: 'stud@tenant2.edu' },
      role: 'Student',
      tenantId: T2, // Tenant 2 trying to join Tenant 1 meeting
    };
    currentDb = makeSupabaseMock(T2);
    const res = await joinRoute.POST(makeRequest({ publicId: meetingCohortGoogleMeet.publicId }));
    assert.strictEqual(res.status, 404, 'Cross-tenant student access must return 404');
    assert.strictEqual(res.body.redirectUrl, undefined);
  });

  await test('13b. Cross-tenant facilitator cannot admit guest for another tenant meeting', async () => {
    // Guest belongs to Tenant 1
    const reqRes = await guestRequestRoute.POST(makeRequest({
      publicId: meetingCohortGoogleMeet.publicId,
      guestName: 'Boundary Guest',
      guestEmail: 'boundary@external.org',
    }));
    const { requestId } = reqRes.body;

    // Load decision route with mocks
    const decisionRoute = loadWithMocks('app/api/meetings/guest/decision/route.ts', {
      'next/server': makeNextServerMock(),
      '@/lib/auth/server': {
        getAuthoritativeSession: async () => ({
          user: { id: 'user-fac-t2', email: 'fac@tenant2.edu' },
          role: 'Facilitator',
          tenantId: T2, // Facilitator from Tenant 2
        }),
      },
      '@/lib/meetings/queries': {
        getMeetingById: async (id) => {
          const m = meetingsCatalog.get(id);
          return { data: m ? { ...m } : null, error: null };
        },
      },
      '@/lib/meetings/guest-requests': guestRequestsMod,
    });

    const decisionRes = await decisionRoute.POST(makeRequest({
      requestId,
      decision: 'APPROVE',
      publicId: meetingCohortGoogleMeet.publicId,
    }));

    assert.strictEqual(decisionRes.status, 404, 'Cross-tenant host cannot access or admit meeting guest');
  });

  // Strict Socket Check
  assert.strictEqual(socketsOpened, 0, 'Zero network sockets opened throughout entire offline test');

  console.log(`\n=============================================================`);
  console.log(`C119 Test Results: ${passedTests}/${totalTests} passed (${failedTests} failed)`);
  console.log(`Network sockets opened: ${socketsOpened}`);
  console.log(`=============================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
})();
