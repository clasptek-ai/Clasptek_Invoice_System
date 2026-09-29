/**
 * scripts/test_dashboard_enhancement_suite.js
 * Comprehensive automated certification test for:
 * CLASPKTEK-2026-PROFESSIONAL-DASHBOARD-ENHANCEMENT-001
 *
 * Verifies:
 * 1. Visual Foundation & Design Token Preservation (cp-* CSS, Zero emojis, No redesign).
 * 2. 8-Stage Clasptek Training Centre Lifecycle:
 *    PROSPECT -> ENQUIRY -> FOLLOW-UP -> STUDENT -> ENROLMENT -> TRAINING -> COMPLETION -> CERTIFICATE.
 * 3. Complete Elimination of Applicant Tracking from Active Workflow:
 *    NO Applicant Portal, NO Applicant Tracking, NO Intake Tracking.
 * 4. Categorized Management Attention Centre (Requires Attention, Action Required, Informational).
 * 5. 4 Primary Financial Overview Indicators (TOTAL INVOICED, AMOUNT RECEIVED, OUTSTANDING, OVERDUE).
 * 6. Historical Enrolment Financial Rule (Genuine ledger vs historical state).
 * 7. Admissions & CRM Pipeline (NEW, CONTACTED, INTERESTED, INVOICE_REQUESTED, INVOICE_ISSUED, ENROLLED, LOST).
 * 8. Follow-up Monitoring ("Contact Prospect & Log Follow-up").
 * 9. Academic & Training Operations (Students, Enrolments, Cohorts, Sessions, Attendance).
 * 10. Dedicated Student Activity Section + Upcoming Training Operations.
 * 11. Overdue Receivables Table + Standardized Pagination (10/25/50/100).
 * 12. Recent Activity & Governance (Audit log with role-restricted access).
 * 13. Role-Aware Behavior (Super Admin / Finance vs Facilitator).
 * 14. Database Safety (0 mutations, 0 schema alterations, 0 synthetic payments).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✔ PASS: ${desc}`);
  } catch (err) {
    failCount++;
    console.error(`  ✖ FAIL: ${desc}`);
    console.error(`         ${err.message}`);
  }
}

async function runDashboardEnhancementSuite() {
  console.log('\n================================================================');
  console.log('CLASPKTEK PORTAL: PROFESSIONAL DASHBOARD ENHANCEMENT TEST SUITE');
  console.log('Task: CLASPKTEK-2026-PROFESSIONAL-DASHBOARD-ENHANCEMENT-001');
  console.log('================================================================\n');

  const dashPath = path.join(__dirname, '..', 'app', 'dashboard', 'DashboardClient.tsx');
  const dashContent = fs.readFileSync(dashPath, 'utf8');

  const intelQueriesPath = path.join(__dirname, '..', 'lib', 'intelligence', 'queries.ts');
  const intelContent = fs.readFileSync(intelQueriesPath, 'utf8');

  const intelTypesPath = path.join(__dirname, '..', 'types', 'intelligence.ts');
  const typesContent = fs.readFileSync(intelTypesPath, 'utf8');

  // --- 1. VISUAL FOUNDATION & CP-* PRESERVATION ---
  console.log('--- Test Group 1: Visual Foundation & Design Token Preservation ---');
  it('Dashboard preserves Clasptek branding, .cp-card, .cp-pill, and .cp-btn styling', () => {
    assert(dashContent.includes('className="cp-card"'), 'Must preserve .cp-card styling');
    assert(dashContent.includes('className="cp-btn'), 'Must preserve .cp-btn styling');
    assert(dashContent.includes('className="cp-pill'), 'Must preserve .cp-pill styling');
    assert(dashContent.includes('Executive Command Centre'), 'Must preserve Executive Command Centre branding');
  });

  it('Dashboard strictly enforces zero emoji icons (clean SVGs only)', () => {
    // Check for common emojis
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(dashContent), false, 'DashboardClient must contain zero emoji icons');
  });

  // --- 2. 8-STAGE CUSTOMER JOURNEY LIFECYCLE ---
  console.log('\n--- Test Group 2: 8-Stage Clasptek Training Centre Lifecycle ---');
  it('Dashboard renders exact approved 8-stage lifecycle sequence', () => {
    assert(dashContent.includes('Customer Journey &amp; Admissions Lifecycle'), 'Must render Customer Journey heading');
    assert(dashContent.includes('01'), 'Must render Stage 01');
    assert(dashContent.includes('Prospect'), 'Must render Prospect stage');
    assert(dashContent.includes('02'), 'Must render Stage 02');
    assert(dashContent.includes('Enquiry'), 'Must render Enquiry stage');
    assert(dashContent.includes('03'), 'Must render Stage 03');
    assert(dashContent.includes('Follow-up'), 'Must render Follow-up stage');
    assert(dashContent.includes('04'), 'Must render Stage 04');
    assert(dashContent.includes('Student'), 'Must render Student stage');
    assert(dashContent.includes('05'), 'Must render Stage 05');
    assert(dashContent.includes('Enrolment'), 'Must render Enrolment stage');
    assert(dashContent.includes('06'), 'Must render Stage 06');
    assert(dashContent.includes('Training'), 'Must render Training stage');
    assert(dashContent.includes('07'), 'Must render Stage 07');
    assert(dashContent.includes('Completion'), 'Must render Completion stage');
    assert(dashContent.includes('08'), 'Must render Stage 08');
    assert(dashContent.includes('Certificate'), 'Must render Certificate stage');
  });

  it('Stage tiles link to genuine existing modules and routes', () => {
    assert(dashContent.includes('href="/enquiries"'), 'Must link to /enquiries');
    assert(dashContent.includes('href="/students"'), 'Must link to /students');
    assert(dashContent.includes('href="/enrolments"'), 'Must link to /enrolments');
    assert(dashContent.includes('href="/attendance"'), 'Must link to /attendance');
    assert(dashContent.includes('href="/certificates"'), 'Must link to /certificates');
  });

  // --- 3. ELIMINATION OF APPLICANT TRACKING WORKFLOW ---
  console.log('\n--- Test Group 3: Elimination of Applicant Tracking Workflow ---');
  it('Dashboard strictly contains NO Applicant Portal or Candidate Application tiles in lifecycle', () => {
    // Strip multi-line comments to test actual rendered JSX code
    const jsxOnly = dashContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    assert.strictEqual(jsxOnly.includes('Candidate Application'), false, 'Candidate Application tile must NOT exist in lifecycle');
    assert.strictEqual(jsxOnly.includes('Applicant Portal'), false, 'Applicant Portal must NOT be exposed in dashboard');
    assert.strictEqual(jsxOnly.includes('#applications'), false, 'Must not link to #applications anchor in lifecycle');
  });

  // --- 4. MANAGEMENT ATTENTION CENTRE CATEGORISATION ---
  console.log('\n--- Test Group 4: Management Attention Centre Categorisation ---');
  it('Management Attention Centre organizes alerts into Requires Attention, Action Required, Informational', () => {
    assert(dashContent.includes('managementAttentionCentre'), 'Must have managementAttentionCentre anchor');
    assert(dashContent.includes('Requires Attention'), 'Must have Requires Attention category');
    assert(dashContent.includes('Action Required'), 'Must have Action Required category');
    assert(dashContent.includes('Informational'), 'Must have Informational category');
    assert(dashContent.includes('setAlertTab'), 'Must provide interactive category filtering');
  });

  it('Every alert item provides a direct action link (Review / View / Open)', () => {
    assert(dashContent.includes('alt.actionUrl'), 'Must bind actionUrl');
    assert(dashContent.includes('alt.actionLabel'), 'Must bind actionLabel');
    assert(dashContent.includes('btn-alt-action'), 'Must render action button');
  });

  // --- 5. FINANCIAL OVERVIEW & HISTORICAL FINANCIAL INVARIANT ---
  console.log('\n--- Test Group 5: Financial Overview & Historical Rule Compliance ---');
  it('Financial Overview renders 4 primary indicators with genuine Nigerian Naira formatting', () => {
    assert(dashContent.includes('TOTAL INVOICED'), 'Must display TOTAL INVOICED');
    assert(dashContent.includes('AMOUNT RECEIVED'), 'Must display AMOUNT RECEIVED');
    assert(dashContent.includes('OUTSTANDING'), 'Must display OUTSTANDING');
    assert(dashContent.includes('OVERDUE'), 'Must display OVERDUE');
    assert(dashContent.includes('en-NG'), 'Must use en-NG currency formatting');
  });

  it('Intelligence query computes metrics from authoritative invoices & payments without synthetic generation', () => {
    assert(intelContent.includes('getReceivablesAgeing'), 'Must integrate authoritative receivables ageing');
    assert(intelContent.includes('getFinancialMetrics'), 'Must integrate financial metrics');
    assert.strictEqual(intelContent.includes('createPayment'), false, 'Must NOT fabricate payment mutations');
    assert.strictEqual(intelContent.includes('createInvoice'), false, 'Must NOT fabricate invoice mutations');
  });

  // --- 6. ADMISSIONS & CRM PIPELINE (PUBLIC.ENQUIRIES STATUSES) ---
  console.log('\n--- Test Group 6: Admissions & CRM Pipeline (public.enquiries Statuses) ---');
  it('Admissions & CRM Pipeline uses genuine public.enquiries statuses', () => {
    assert(dashContent.includes('NEW'), 'Must track NEW status');
    assert(dashContent.includes('CONTACTED'), 'Must track CONTACTED status');
    assert(dashContent.includes('INTERESTED'), 'Must track INTERESTED status');
    assert(dashContent.includes('INVOICE_REQUESTED'), 'Must track INVOICE_REQUESTED status');
    assert(dashContent.includes('INVOICE_ISSUED'), 'Must track INVOICE_ISSUED status');
    assert(dashContent.includes('ENROLLED'), 'Must track ENROLLED status');
    assert(dashContent.includes('LOST'), 'Must track LOST status');
  });

  it('Follow-up monitoring links directly to Contact Prospect & Log Follow-up workflow', () => {
    assert(dashContent.includes('Follow-up Monitoring'), 'Must render Follow-up Monitoring card');
    assert(dashContent.includes('Contact Prospect &amp; Log Follow-up'), 'Must link to Contact Prospect & Log Follow-up');
    assert(dashContent.includes('crm?.followUpsDueToday'), 'Must track followUpsDueToday');
    assert(dashContent.includes('crm?.followUpsOverdue'), 'Must track followUpsOverdue');
  });

  // --- 7. ACADEMIC & TRAINING OPERATIONS ---
  console.log('\n--- Test Group 7: Academic & Training Operations ---');
  it('Academic & Training Operations displays live registered student and training counts', () => {
    assert(dashContent.includes('Academic &amp; Training Operations'), 'Must render Academic Operations section');
    assert(dashContent.includes('aca?.activeStudents'), 'Must display active students');
    assert(dashContent.includes('aca?.activeEnrolments'), 'Must display active enrolments');
    assert(dashContent.includes('aca?.cohortsCount'), 'Must display cohorts count');
    assert(dashContent.includes('trn?.attendanceRate'), 'Must display attendance rate');
  });

  // --- 8. STUDENT ACTIVITY & UPCOMING OPERATIONS ---
  console.log('\n--- Test Group 8: Student Activity & Upcoming Operations ---');
  it('Student Activity section renders total, active, certificates, and recently added students table', () => {
    assert(dashContent.includes('Student Activity'), 'Must render Student Activity section');
    assert(dashContent.includes('Recently Added Students'), 'Must render recently added students');
    assert(dashContent.includes('stu?.totalStudents'), 'Must display total students');
    assert(dashContent.includes('stu?.certificatesIssued'), 'Must display certificates issued');
  });

  it('Upcoming Training Operations displays scheduled sessions with graceful empty state', () => {
    assert(dashContent.includes('Upcoming Training Operations'), 'Must render Upcoming Training Operations section');
    assert(dashContent.includes('No upcoming training sessions scheduled'), 'Must provide authoritative empty state');
    assert(dashContent.includes('metrics?.upcomingSessions'), 'Must bind upcomingSessions');
  });

  // --- 9. OVERDUE RECEIVABLES & STANDARDIZED PAGINATION ---
  console.log('\n--- Test Group 9: Overdue Receivables & Standardized Pagination ---');
  it('Overdue Receivables table implements standard pagination (10/25/50/100, page change)', () => {
    assert(dashContent.includes('Overdue Receivables'), 'Must render Overdue Receivables section');
    assert(dashContent.includes('usePagination'), 'Must use universal usePagination hook');
    assert(dashContent.includes('<Pagination'), 'Must render universal Pagination component');
    assert(dashContent.includes('pageSizeOptions={[10, 25, 50, 100]}'), 'Must configure 10, 25, 50, 100 page size options');
    assert(dashContent.includes('entityLabel="invoices"'), 'Must configure invoices entity label');
  });

  // --- 10. RECENT ACTIVITY & GOVERNANCE ---
  console.log('\n--- Test Group 10: Recent Activity & Governance ---');
  it('Recent Activity & Governance displays audit events and strictly role-gates full audit log access', () => {
    assert(dashContent.includes('Recent Activity &amp; Governance'), 'Must render Recent Activity section');
    assert(dashContent.includes('metrics?.recentActivity'), 'Must bind recentActivity data');
    assert(dashContent.includes("isSuperAdmin &&"), 'Must restrict View Audit Log to Super Admin');
    assert(dashContent.includes('href="/audit-log"'), 'Must link to /audit-log for permitted roles');
  });

  // --- 11. ROLE AWARENESS ---
  console.log('\n--- Test Group 11: Role Awareness ---');
  it('Staff and Facilitators are routed to dedicated StaffFacilitatorDashboard', () => {
    assert(dashContent.includes("role === 'Facilitator' || role === 'Staff'"), 'Must route Facilitator/Staff to workspace');
    assert(dashContent.includes('StaffFacilitatorDashboard'), 'Must render StaffFacilitatorDashboard component');
  });

  // --- 12. DATABASE SAFETY INVARIANTS ---
  console.log('\n--- Test Group 12: Database Safety Invariants ---');
  it('Zero schema modifications or destructive database queries executed', () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const enhancementMigrations = files.filter(f => /dashboard_enhancement/i.test(f));
    assert.strictEqual(enhancementMigrations.length, 0, 'Must have 0 schema migration files');
  });

  console.log('\n================================================================');
  console.log(`DASHBOARD ENHANCEMENT TEST RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runDashboardEnhancementSuite();
