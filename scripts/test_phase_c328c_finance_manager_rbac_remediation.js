/**
 * scripts/test_phase_c328c_finance_manager_rbac_remediation.js
 *
 * Phase C328C: Finance Manager Scope Remediation & RBAC Hardening Verification Suite
 *
 * Exercises authoritative role-based access control (RBAC) behavior for:
 * 1.  POST  /api/students
 * 2.  PATCH /api/students/[id]
 * 3.  DELETE /api/students/[id]
 * 4.  POST  /api/students/[id]/enrol
 * 5.  POST  /api/students/bulk-delete
 * 6.  POST  /api/enrolments/bulk
 * 7.  POST  /api/admissions/enquiries/[id]/register-student
 * 8.  POST  /api/admissions/enquiries/bulk (action: 'DELETE')
 * 9.  POST  /api/admissions/programmes/bulk
 *
 * Demonstrates:
 * - Super Admin: Authorized
 * - Finance Manager: Denied (HTTP 403 Forbidden)
 * - Finance Staff: Denied (HTTP 403 Forbidden)
 * - Staff: Denied (HTTP 403 Forbidden)
 * - Facilitator: Denied (HTTP 403 Forbidden)
 * - Student: Denied (HTTP 403 Forbidden)
 * - Unauthenticated: Denied (HTTP 401 Unauthorized)
 * - Read-only financial student access preserved for Finance Manager (GET /api/students)
 * - Role normalization behavior in lib/auth/server.ts
 * - Invariance of protected C320 security files
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let totalPassed = 0;
let totalFailed = 0;

function it(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          console.log(`  ✔ PASS: ${name}`);
          totalPassed++;
        })
        .catch((err) => {
          console.error(`  ✖ FAIL: ${name}`);
          console.error(`         ${err.message}`);
          totalFailed++;
        });
    }
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`         ${err.message}`);
    totalFailed++;
  }
}

// ─── HARNESS INFRASTRUCTURE ──────────────────────────────────────────────────

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

function makeRequest(body = {}, url = 'http://localhost/test') {
  return {
    json: async () => body,
    headers: new Map(),
    url,
  };
}

let currentSession = null;

function setSession(role, tenantId = 'tenant_uuid_1111') {
  if (role === null) {
    currentSession = null;
    return;
  }
  currentSession = {
    user: {
      id: `usr_${role.toLowerCase().replace(/\s+/g, '_')}`,
      email: `${role.toLowerCase().replace(/\s+/g, '_')}@clasptek.com`,
      user_metadata: { full_name: `Test ${role}` },
    },
    role,
    tenantId,
  };
}

const fakeSupabase = {
  auth: {
    getUser: async () => {
      if (!currentSession) return { data: { user: null }, error: new Error('No session') };
      return { data: { user: currentSession.user }, error: null };
    },
  },
  from: (table) => {
    const queryObj = {
      select: () => queryObj,
      eq: () => queryObj,
      in: () => queryObj,
      single: async () => ({ data: { id: 'mock_id' }, error: null }),
      maybeSingle: async () => ({ data: { id: 'mock_id' }, error: null }),
      limit: () => queryObj,
      order: () => queryObj,
      range: () => queryObj,
      insert: async () => ({ data: { id: 'mock_inserted' }, error: null }),
      update: async () => ({ data: { id: 'mock_updated' }, error: null }),
      delete: async () => ({ data: { id: 'mock_deleted' }, error: null }),
    };
    return queryObj;
  },
};

function loadTsModule(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };

  const mocks = {
    'next/server': makeNextServerMock(),
    '@/lib/auth/server': {
      getAuthoritativeSession: async () => currentSession,
      requireAuth: async (_req, opts = {}) => {
        if (!currentSession) {
          return {
            session: null,
            errorResponse: makeNextServerMock().NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
          };
        }
        if (opts.allowedRoles && !opts.allowedRoles.includes(currentSession.role)) {
          return {
            session: null,
            errorResponse: makeNextServerMock().NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
          };
        }
        return { session: currentSession, errorResponse: null };
      },
      normalizeRole: (r) => {
        if (!r) return 'Staff';
        const c = String(r).trim().toUpperCase();
        if (c === 'SUPER_ADMIN' || c === 'SUPER ADMIN' || c === 'ADMIN') return 'Super Admin';
        if (c === 'FINANCE_MANAGER' || c === 'FINANCE MANAGER') return 'Finance Manager';
        if (c === 'FINANCE_STAFF' || c === 'FINANCE STAFF') return 'Finance Staff';
        if (c === 'FACILITATOR') return 'Facilitator';
        if (c === 'STUDENT') return 'Student';
        return 'Staff';
      },
    },
    '@/lib/supabase/server': {
      createServerClient: async () => fakeSupabase,
    },
    '@/lib/students/queries': {
      getStudents: async () => ({ data: [], count: 0, error: null }),
      getStudentById: async () => ({ data: { id: 'std_1' }, error: null }),
      getStudentDossier: async () => ({ data: { student: { id: 'std_1' } }, error: null }),
    },
    '@/lib/students/mutations': {
      registerStudentSafely: async () => ({ success: true, student: { id: 'std_new' } }),
      registerStudentFromEnquiry: async () => ({ success: true, student: { id: 'std_new' } }),
      updateStudentProfile: async () => ({ success: true }),
      deleteStudentSafe: async () => ({ success: true }),
      checkStudentDependencies: async () => ({ success: true }),
      createStudentEnrolment: async () => ({ success: true }),
      generateNextStudentNumber: async () => 'STU-2026-0001',
    },
    '@/lib/admissions/queries': {
      getProgrammes: async () => ({ data: [], error: null }),
      getEnquiryById: async () => ({ data: { id: 'enq_1' }, error: null }),
      checkEnquiriesDependencies: async () => [],
      bulkUpdateEnquiriesStatus: async () => ({ success: true, updatedCount: 1 }),
      deleteEnquiriesSafe: async () => ({ success: true }),
    },
    '@/lib/crm/intake-service': {
      allocateStudentNumber: async () => 'STU-2026-0001',
    },
    'crypto': crypto,
  };

  const customRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/')) {
      // Return dummy object if not specifically mocked
      return {};
    }
    try {
      return require(id);
    } catch {
      return {};
    }
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  return mod.exports;
}

// ─── TEST EXECUTION ──────────────────────────────────────────────────────────

async function runC328CTestSuite() {
  console.log('======================================================================');
  console.log(' CLASPTEK PHASE C328C: FINANCE MANAGER RBAC REMEDIATION TEST SUITE');
  console.log('======================================================================\n');

  // Load route modules
  const studentsRoute = loadTsModule('app/api/students/route.ts');
  const studentIdRoute = loadTsModule('app/api/students/[id]/route.ts');
  const studentEnrolRoute = loadTsModule('app/api/students/[id]/enrol/route.ts');
  const studentsBulkDeleteRoute = loadTsModule('app/api/students/bulk-delete/route.ts');
  const enrolmentsBulkRoute = loadTsModule('app/api/enrolments/bulk/route.ts');
  const enquiryRegisterRoute = loadTsModule('app/api/admissions/enquiries/[id]/register-student/route.ts');
  const enquiriesBulkRoute = loadTsModule('app/api/admissions/enquiries/bulk/route.ts');
  const programmesBulkRoute = loadTsModule('app/api/admissions/programmes/bulk/route.ts');

  const testParams = Promise.resolve({ id: 'test_item_id' });

  // ─── 1. POST /api/students (Student Registration) ──────────────────────────
  console.log('--- 1. POST /api/students (Student Registration) ---');
  await it('POST /api/students: Super Admin is authorized (200 / not 403)', async () => {
    setSession('Super Admin');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST /api/students: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students: Finance Staff is DENIED (HTTP 403)', async () => {
    setSession('Finance Staff');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students: Staff is DENIED (HTTP 403)', async () => {
    setSession('Staff');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students: Facilitator is DENIED (HTTP 403)', async () => {
    setSession('Facilitator');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students: Student is DENIED (HTTP 403)', async () => {
    setSession('Student');
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students: Unauthenticated caller is DENIED (HTTP 401)', async () => {
    setSession(null);
    const res = await studentsRoute.POST(makeRequest({ firstName: 'A', lastName: 'B' }));
    if (res.status !== 401) throw new Error(`Expected HTTP 401, got ${res.status}`);
  });

  // ─── 2. PATCH /api/students/[id] (Student Profile Edit) ────────────────────
  console.log('\n--- 2. PATCH /api/students/[id] (Student Profile Edit) ---');
  await it('PATCH /api/students/[id]: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await studentIdRoute.PATCH(makeRequest({ updates: {}, reason: 'Fix' }), { params: testParams });
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('PATCH /api/students/[id]: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await studentIdRoute.PATCH(makeRequest({ updates: {}, reason: 'Fix' }), { params: testParams });
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('PATCH /api/students/[id]: Staff is DENIED (HTTP 403)', async () => {
    setSession('Staff');
    const res = await studentIdRoute.PATCH(makeRequest({ updates: {}, reason: 'Fix' }), { params: testParams });
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 3. DELETE /api/students/[id] (Student Record Deletion) ────────────────
  console.log('\n--- 3. DELETE /api/students/[id] (Student Record Deletion) ---');
  await it('DELETE /api/students/[id]: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await studentIdRoute.DELETE(makeRequest({ reason: 'Graduated' }), { params: testParams });
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('DELETE /api/students/[id]: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await studentIdRoute.DELETE(makeRequest({ reason: 'Graduated' }), { params: testParams });
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('DELETE /api/students/[id]: Staff is DENIED (HTTP 403)', async () => {
    setSession('Staff');
    const res = await studentIdRoute.DELETE(makeRequest({ reason: 'Graduated' }), { params: testParams });
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 4. POST /api/students/[id]/enrol (Cohort Enrolment) ───────────────────
  console.log('\n--- 4. POST /api/students/[id]/enrol (Cohort Enrolment) ---');
  await it('POST /api/students/[id]/enrol: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await studentEnrolRoute.POST(
      makeRequest({ programmeId: 'prog_1', cohortId: 'coh_1' }),
      { params: testParams }
    );
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST /api/students/[id]/enrol: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await studentEnrolRoute.POST(
      makeRequest({ programmeId: 'prog_1', cohortId: 'coh_1' }),
      { params: testParams }
    );
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  await it('POST /api/students/[id]/enrol: Staff is DENIED (HTTP 403)', async () => {
    setSession('Staff');
    const res = await studentEnrolRoute.POST(
      makeRequest({ programmeId: 'prog_1', cohortId: 'coh_1' }),
      { params: testParams }
    );
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 5. POST /api/students/bulk-delete (Bulk Student Deletion) ─────────────
  console.log('\n--- 5. POST /api/students/bulk-delete (Bulk Student Deletion) ---');
  await it('POST /api/students/bulk-delete: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await studentsBulkDeleteRoute.POST(makeRequest({ studentIds: ['s1'], reason: 'Cleanup' }));
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST /api/students/bulk-delete: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await studentsBulkDeleteRoute.POST(makeRequest({ studentIds: ['s1'], reason: 'Cleanup' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 6. POST /api/enrolments/bulk (Bulk Enrolment Management) ──────────────
  console.log('\n--- 6. POST /api/enrolments/bulk (Bulk Enrolment Management) ---');
  await it('POST /api/enrolments/bulk: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await enrolmentsBulkRoute.POST(makeRequest({ enrolmentIds: ['e1'], action: 'CHECK_DEPENDENCIES' }));
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST /api/enrolments/bulk: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await enrolmentsBulkRoute.POST(makeRequest({ enrolmentIds: ['e1'], action: 'CHECK_DEPENDENCIES' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 7. POST /api/admissions/enquiries/[id]/register-student ───────────────
  console.log('\n--- 7. POST /api/admissions/enquiries/[id]/register-student ---');
  await it('POST register-student: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await enquiryRegisterRoute.POST(makeRequest({}), { params: testParams });
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST register-student: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await enquiryRegisterRoute.POST(makeRequest({}), { params: testParams });
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 8. POST /api/admissions/enquiries/bulk (DELETE action) ────────────────
  console.log('\n--- 8. POST /api/admissions/enquiries/bulk (DELETE action) ---');
  await it('POST enquiries/bulk (action: DELETE): Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await enquiriesBulkRoute.POST(makeRequest({ action: 'DELETE', enquiryIds: ['enq_1'], reason: 'dup' }));
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST enquiries/bulk (action: DELETE): Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await enquiriesBulkRoute.POST(makeRequest({ action: 'DELETE', enquiryIds: ['enq_1'], reason: 'dup' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 9. POST /api/admissions/programmes/bulk ───────────────────────────────
  console.log('\n--- 9. POST /api/admissions/programmes/bulk ---');
  await it('POST programmes/bulk: Super Admin is authorized', async () => {
    setSession('Super Admin');
    const res = await programmesBulkRoute.POST(makeRequest({ programmeIds: ['p1'], action: 'CHECK_DEPENDENCIES' }));
    if (res.status === 403) throw new Error(`Super Admin unexpectedly rejected with 403`);
  });

  await it('POST programmes/bulk: Finance Manager is DENIED (HTTP 403)', async () => {
    setSession('Finance Manager');
    const res = await programmesBulkRoute.POST(makeRequest({ programmeIds: ['p1'], action: 'CHECK_DEPENDENCIES' }));
    if (res.status !== 403) throw new Error(`Expected HTTP 403, got ${res.status}`);
  });

  // ─── 10. PRESERVATION OF READ-ONLY FINANCE ACCESS ──────────────────────────
  console.log('\n--- 10. Preservation of Read-Only Financial Student Access ---');
  await it('GET /api/students: Finance Manager retains read-only access (200 OK)', async () => {
    setSession('Finance Manager');
    const res = await studentsRoute.GET(makeRequest({}, 'http://localhost/api/students'));
    if (res.status !== 200) throw new Error(`Expected HTTP 200 for Finance Manager on GET /api/students, got ${res.status}`);
  });

  // ─── 11. ROLE NORMALIZATION CONTRACT IN SERVER.TS ──────────────────────────
  console.log('\n--- 11. Server-Side Role Normalization Contract ---');
  const serverAuthCode = fs.readFileSync(path.join(ROOT, 'lib', 'auth', 'server.ts'), 'utf8');
  it('lib/auth/server.ts maps SUPER_ADMIN to Super Admin', () => {
    if (!serverAuthCode.includes("SUPER_ADMIN: 'Super Admin'")) {
      throw new Error(`Missing mapping for SUPER_ADMIN`);
    }
  });

  it('lib/auth/server.ts maps ADMIN to Super Admin', () => {
    if (!serverAuthCode.includes("ADMIN: 'Super Admin'")) {
      throw new Error(`Missing mapping for ADMIN`);
    }
  });

  it('lib/auth/server.ts maps ADMINISTRATOR to Super Admin', () => {
    if (!serverAuthCode.includes("ADMINISTRATOR: 'Super Admin'")) {
      throw new Error(`Missing mapping for ADMINISTRATOR`);
    }
  });

  it('lib/auth/server.ts maps FINANCE_MANAGER to Finance Manager', () => {
    if (!serverAuthCode.includes("FINANCE_MANAGER: 'Finance Manager'")) {
      throw new Error(`Missing mapping for FINANCE_MANAGER`);
    }
  });

  // ─── 12. C320 SECURITY FILE BLOB HASH INVARIANCE ───────────────────────────
  console.log('\n--- 12. C320 Security File Blob Hash Invariance ---');
  const protectedFiles = [
    { file: 'app/api/intelligence/overview/route.ts', expected: 'ffcceeae8a7ffa97e911bb9585305122ce947852' },
    { file: 'app/dashboard/DashboardClient.tsx', expected: 'c87b15630285cd723e5cb282a2403cf6af037c9d' },
    { file: 'app/reset-password/page.tsx', expected: 'cbdf6b701854ebbf96db4d92f824e77657cd7c39' },
    { file: 'lib/auth/context.tsx', expected: 'adf139d293296cb25a12f9f0232e3b3c6a731a01' },
    { file: 'proxy.ts', expected: 'c48ecf97aaeeb0c5451ac01665cdfeabaee13bcb' },
  ];

  for (const { file, expected } of protectedFiles) {
    it(`Protected file "${file}" matches authoritative C320 SHA-1`, () => {
      const hash = execSync(`git hash-object "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
      if (hash !== expected) {
        throw new Error(`Hash mismatch for ${file}: expected ${expected}, got ${hash}`);
      }
    });
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(`TOTAL PHASE C328C TESTS: ${totalPassed + totalFailed}`);
  console.log(`PASSED: ${totalPassed}`);
  console.log(`FAILED: ${totalFailed}`);
  console.log('======================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runC328CTestSuite().catch((err) => {
  console.error('Test harness exception:', err);
  process.exit(1);
});
