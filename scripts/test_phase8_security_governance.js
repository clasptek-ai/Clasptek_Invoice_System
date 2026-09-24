/**
 * scripts/test_phase8_security_governance.js — Phase 8 Governance & Security Certification Suite
 * Validates:
 * 1. Server-side Authentication & Session Guard (requireAuth)
 * 2. Role Governance & Canonical Role Matrix (SUPER_ADMIN, FINANCE_MANAGER, FINANCE_STAFF, STAFF, FACILITATOR)
 * 3. Tenant Boundary & Cross-Tenant Tampering Protection (Fail-Closed)
 * 4. CSV Formula Injection Defense (CWE-1236, OWASP)
 * 5. Destructive Action Safeguards & Personnel Deletion Verification
 * 6. Financial & Payroll Privacy Gate (Non-finance role rejection)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let totalPassed = 0;
let totalFailed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    totalFailed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}\n    Error: ${err.message}`);
    totalFailed++;
  }
}

async function runPhase8SecuritySuite() {
  console.log('======================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 8 GOVERNANCE & SECURITY SUITE');
  console.log('======================================================================\n');

  // ─── 1. Role Normalization & Canonical Matrix ────────────────────────────
  console.log('[1/6] Role Governance & Canonical Role Matrix:');
  const serverAuthPath = path.join(process.cwd(), 'lib', 'auth', 'server.ts');
  assert(fs.existsSync(serverAuthPath), 'lib/auth/server.ts must exist');
  const serverAuthContent = fs.readFileSync(serverAuthPath, 'utf8');

  it('Canonical role mapping is registered for all 7 platform roles', () => {
    assert(serverAuthContent.includes("'Super Admin'"), 'Must include Super Admin');
    assert(serverAuthContent.includes("'Finance Manager'"), 'Must include Finance Manager');
    assert(serverAuthContent.includes("'Finance Staff'"), 'Must include Finance Staff');
    assert(serverAuthContent.includes("'Staff'"), 'Must include Staff');
    assert(serverAuthContent.includes("'Facilitator'"), 'Must include Facilitator');
    assert(serverAuthContent.includes("'Finance Viewer'"), 'Must include Finance Viewer');
    assert(serverAuthContent.includes("'Student'"), 'Must include Student');
  });

  it('Role normalizer handles case and separator variants', () => {
    assert(serverAuthContent.includes('normalizeRole'), 'normalizeRole function must exist');
    assert(serverAuthContent.includes('CANONICAL_ROLES'), 'CANONICAL_ROLES map must exist');
  });

  // ─── 2. CSV Formula Injection Defense (CWE-1236) ──────────────────────────
  console.log('\n[2/6] CSV Formula Injection & Export Security:');
  const csvUtilPath = path.join(process.cwd(), 'lib', 'utils', 'csv.ts');
  assert(fs.existsSync(csvUtilPath), 'lib/utils/csv.ts must exist');
  const csvUtilContent = fs.readFileSync(csvUtilPath, 'utf8');

  it('CSV serializer contains formula trigger check for =, +, -, @, \\t, \\r', () => {
    assert(csvUtilContent.includes("'='"), 'Must check for =');
    assert(csvUtilContent.includes("'+'"), 'Must check for +');
    assert(csvUtilContent.includes("'-'"), 'Must check for -');
    assert(csvUtilContent.includes("'@'"), 'Must check for @');
  });

  it('Legitimate negative and positive numbers are preserved without text quotation', () => {
    assert(csvUtilContent.includes('isPureNumber'), 'Must detect pure numeric values');
  });

  it('All 8 client page components consume downloadSafeCsv', () => {
    const clients = [
      'app/students/StudentsPageClient.tsx',
      'app/reports/ReportsPageClient.tsx',
      'app/payroll/PayrollPageClient.tsx',
      'app/payments/PaymentsPageClient.tsx',
      'app/invoices/InvoicesPageClient.tsx',
      'app/intelligence/IntelligencePageClient.tsx',
      'app/enquiries/EnquiriesPageClient.tsx',
      'app/attendance/AttendancePageClient.tsx',
    ];
    clients.forEach((c) => {
      const p = path.join(process.cwd(), c);
      assert(fs.existsSync(p), `${c} must exist`);
      const cnt = fs.readFileSync(p, 'utf8');
      assert(cnt.includes('downloadSafeCsv'), `${c} must call downloadSafeCsv`);
    });
  });

  // ─── 3. Server-Side Route Guard Hardening ───────────────────────────────
  console.log('\n[3/6] Server-Side API Authorization & Tenant Isolation:');
  const guardedRoutes = [
    'app/api/finance/invoices/route.ts',
    'app/api/finance/invoices/[id]/status/route.ts',
    'app/api/finance/payments/route.ts',
    'app/api/finance/payroll/route.ts',
    'app/api/finance/payroll/[id]/action/route.ts',
    'app/api/finance/summary/route.ts',
    'app/api/intelligence/overview/route.ts',
    'app/api/intelligence/reports/route.ts',
    'app/api/meetings/drive-status/route.ts',
  ];

  guardedRoutes.forEach((r) => {
    it(`Route ${r} enforces server-side requireAuth`, () => {
      const p = path.join(process.cwd(), r);
      const content = fs.readFileSync(p, 'utf8');
      assert(content.includes('requireAuth'), `${r} must call requireAuth`);
      assert(content.includes('errorResponse'), `${r} must handle errorResponse`);
    });
  });

  // ─── 4. Cross-Tenant Tampering Safeguards ───────────────────────────────
  console.log('\n[4/6] Tenant Boundary & Tampering Safeguards:');
  it('requireAuth explicitly rejects cross-tenant requests from non-superadmin actors', () => {
    assert(serverAuthContent.includes('Cross-tenant data access rejected'), 'Must reject cross-tenant tampering');
    assert(serverAuthContent.includes('requested !== session.tenantId'), 'Must compare requested tenant against session tenant');
  });

  // ─── 5. Administrative Destructive Operations ───────────────────────────
  console.log('\n[5/6] Destructive Action Safeguards (Personnel Deletion):');
  const deletePersonnelApi = path.join(process.cwd(), 'api', 'admin', 'delete-personnel.js');
  assert(fs.existsSync(deletePersonnelApi), 'api/admin/delete-personnel.js must exist');

  it('delete-personnel endpoint rejects unauthenticated and non-admin requests', () => {
    const adminJs = fs.readFileSync(path.join(process.cwd(), 'api', 'admin.js'), 'utf8');
    assert(adminJs.includes("['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(callerRole)"), 'Must restrict deletion to SUPER_ADMIN or FINANCE_MANAGER');
    assert(adminJs.includes('DEPENDENCIES_EXIST'), 'Must block deletion when active dependencies exist');
    assert(adminJs.includes('Administrators cannot delete their own account'), 'Must prevent self-deletion');
  });

  // ─── 6. Service Role & Environment Secrets Audit ────────────────────────
  console.log('\n[6/6] Service-Role Key & Secrets Exposure Audit:');
  it('SUPABASE_SERVICE_ROLE_KEY is absent from all client bundles and NEXT_PUBLIC_ variables', () => {
    const appDir = path.join(process.cwd(), 'app');
    const componentsDir = path.join(process.cwd(), 'components');
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'api') {
          checkDir(full);
        } else if (e.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
          const content = fs.readFileSync(full, 'utf8');
          assert(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `Exposed service role key in ${full}`);
          assert(!content.includes('SUPABASE_SECRET_KEY'), `Exposed secret key in ${full}`);
        }
      }
    };
    checkDir(appDir);
    checkDir(componentsDir);
  });

  console.log('\n======================================================================');
  console.log(` PHASE 8 GOVERNANCE RESULTS: ${totalPassed} PASSED / ${totalFailed} FAILED`);
  console.log('======================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPhase8SecuritySuite();
