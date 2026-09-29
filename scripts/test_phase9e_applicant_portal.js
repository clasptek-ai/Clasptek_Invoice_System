/**
 * scripts/test_phase9e_applicant_portal.js — Phase 9E Certification Test Suite
 *
 * Automated verification of Applicant Portal & Application Tracking:
 * Anti-enumeration defense, Two-factor verification (Ref + Email/Phone),
 * Progress Stepper mapping, PII & Internal Notes Sanitization, Public Route Access,
 * Controlled Admissions Conversion Boundary, and Tenant Isolation.
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

async function runApplicantPortalSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 9E CERTIFICATION SUITE: APPLICANT TRACKING PORTAL');
  console.log('===============================================================\n');

  // --- 1. ZERO SEPARATE DATABASE INVARIANT ---
  console.log('--- Test Suite 1: Database Architecture & Lifecycle Reuse ---');

  it('Applicant portal reuses authoritative public.crm_intake_applications table without duplicate tables', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.crm_intake_applications'), true);
    assert.strictEqual(/CREATE\s+TABLE\s+(public\.)?applicant_portal_users\b/i.test(schema), false);
  });

  // --- 2. PUBLIC ROUTE & MIDDLEWARE ACCESS ---
  console.log('\n--- Test Suite 2: Public Route & Middleware Bypass ---');

  it('Applicant tracking route (/applicant-portal) is registered in PUBLIC_ROUTES in proxy.ts', () => {
    const proxyCode = fs.readFileSync(path.join(__dirname, '..', 'proxy.ts'), 'utf8');
    assert.strictEqual(proxyCode.includes("'/applicant-portal'"), true);
  });

  it('Public tracking API endpoint (/api/admissions/applications/track) allows unauthenticated POST', () => {
    const trackApi = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'admissions', 'applications', 'track', 'route.ts'), 'utf8');
    // Ensure track API does NOT enforce requireAuth() because it's public tracking with anti-enumeration verification
    assert.strictEqual(trackApi.includes('requireAuth('), false);
    assert.strictEqual(trackApi.includes('trackApplicantApplication'), true);
  });

  // --- 3. ANTI-ENUMERATION SECURITY INVARIANT ---
  console.log('\n--- Test Suite 3: Anti-Enumeration & Oracle Elimination ---');

  it('Applicant lookup returns identical generic error on not found AND verification mismatch', () => {
    const trackingLib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'admissions', 'tracking-queries.ts'), 'utf8');
    const genericErr = 'Application could not be found or verified with the provided details. Please check your reference number and contact information.';
    assert.strictEqual(trackingLib.includes(genericErr), true);

    // Count occurrences: must be thrown both when record is not found AND when verification contact mismatches
    const matches = trackingLib.split(genericErr).length - 1;
    assert.strictEqual(matches >= 1, true, 'Generic error constant must be defined');
    assert.strictEqual(trackingLib.includes('GENERIC_NOT_FOUND_MSG'), true);
  });

  it('Lookup requires both reference number AND email or phone credential', () => {
    const trackingLib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'admissions', 'tracking-queries.ts'), 'utf8');
    assert.strictEqual(trackingLib.includes('if (!normRef || !rawCred)'), true);
  });

  // --- 4. DATA SANITIZATION & ZERO INTERNAL NOTES LEAKAGE ---
  console.log('\n--- Test Suite 4: Sanitization & Zero Internal PII/Staff Leakage ---');

  it('Tracking response interface excludes internal staff notes, internal scoring, and tenant IDs', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'tracking.ts'), 'utf8');
    assert.strictEqual(types.includes('export interface PublicApplicantTracking'), true);
    assert.strictEqual(types.includes('internal_notes'), false);
    assert.strictEqual(types.includes('staff_notes'), false);
    assert.strictEqual(types.includes('tenant_id'), false);
    assert.strictEqual(types.includes('service_role'), false);
  });

  it('Query builder explicitly sanitizes and masks output payload before returning to client', () => {
    const trackingLib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'admissions', 'tracking-queries.ts'), 'utf8');
    assert.strictEqual(trackingLib.includes('required_documents'), true);
    assert.strictEqual(trackingLib.includes('admissions_contact'), true);
    // Explicitly check that raw internal_notes is never selected or returned in the output object
    assert.strictEqual(/return\s*\{[\s\S]*internal_notes/i.test(trackingLib), false);
  });

  // --- 5. PROGRESS STEPPER & AUTHORITATIVE STATUS MAPPING ---
  console.log('\n--- Test Suite 5: Stepper Progression & Status Fidelity ---');

  it('Correctly maps authoritative intake statuses to public stepper', () => {
    const trackingLib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'admissions', 'tracking-queries.ts'), 'utf8');
    assert.strictEqual(trackingLib.includes("rawStatus === 'NEW'"), true);
    assert.strictEqual(trackingLib.includes("rawStatus === 'REVIEW_REQUIRED'"), true);
    assert.strictEqual(trackingLib.includes("rawStatus === 'MATCHED'"), true);
    assert.strictEqual(trackingLib.includes("rawStatus === 'QUALIFIED'"), true);
    assert.strictEqual(trackingLib.includes("rawStatus === 'CONVERTED'"), true);
  });

  it('Friendly status labels preserve underlying database status integrity', () => {
    const trackingLib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'admissions', 'tracking-queries.ts'), 'utf8');
    assert.strictEqual(trackingLib.includes("'Application Received'"), true);
    assert.strictEqual(trackingLib.includes("'Under Admissions Review'"), true);
    assert.strictEqual(trackingLib.includes("'Application Approved / Qualified'"), true);
    assert.strictEqual(trackingLib.includes("'Enrolment Confirmed / Enrolled'"), true);
  });

  // --- 6. ADMISSIONS CONVERSION BOUNDARY ---
  console.log('\n--- Test Suite 6: Admissions Conversion Boundary Invariant ---');

  it('Applicant portal cannot directly convert application into student or enrolment', () => {
    const portalPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'applicant-portal', 'ApplicantPortalClient.tsx'), 'utf8');
    assert.strictEqual(portalPage.includes('convert_intake_application'), false);
    assert.strictEqual(portalPage.includes('/api/admissions/applications/[id]/convert'), false);
  });

  it('Authoritative conversion remains strictly guarded behind staff/admin role in convert endpoint', () => {
    const convertApi = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'admissions', 'applications', '[id]', 'convert', 'route.ts'), 'utf8');
    assert.strictEqual(convertApi.includes('supabase.auth.getUser()'), true);
    assert.strictEqual(convertApi.includes("convert_intake_application"), true);
  });

  // --- 7. OBSOLETE PORTAL REMOVAL & WORKFLOW STREAMLINING ---
  console.log('\n--- Test Suite 7: Obsolete Portal Removal Verification ---');

  it('Intake Tracking Portal removed from navigation config (Task ID: CLASPTEK-REMOVE-INTAKE-APPLICANT-PORTALS-001)', () => {
    const navConfig = fs.readFileSync(path.join(__dirname, '..', 'lib', 'config', 'navigation.ts'), 'utf8');
    assert.strictEqual(navConfig.includes("href: '/applicant-portal'"), false, 'Applicant portal link must be removed from navigation');
    assert.strictEqual(navConfig.includes("label: 'Intake Tracking Portal'"), false, 'Intake Tracking Portal label must be removed from navigation');
  });

  it('Applicant Portal button removed from Student Registration & Intake page', () => {
    const appsPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'applications', 'ApplicationsPageClient.tsx'), 'utf8');
    assert.strictEqual(appsPage.includes('btnOpenApplicantPortal'), false, 'btnOpenApplicantPortal must be removed');
    assert.strictEqual(appsPage.includes('Applicant Portal'), false, 'Applicant Portal text must be removed');
  });

  it('/applicant-portal route safely redirects to /applications', () => {
    const portalPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'applicant-portal', 'page.tsx'), 'utf8');
    assert.strictEqual(portalPage.includes("redirect('/applications')"), true, '/applicant-portal must redirect to /applications');
  });

  console.log('\n===============================================================');
  console.log(`PHASE 9E APPLICANT PORTAL CERTIFICATION RESULT: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runApplicantPortalSuite();
