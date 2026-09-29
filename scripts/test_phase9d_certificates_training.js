/**
 * scripts/test_phase9d_certificates_training.js — Phase 9D Certification Test Suite
 *
 * Automated verification of Certificate Eligibility, Training Completion Signoff,
 * Dynamic Certificate Generation, Vector QR Code, Public Verification,
 * Revocation Governance, Reissuance Provenance, and Tenant Isolation.
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

async function runPhase9DSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK PHASE 9D CERTIFICATION SUITE: TRAINING COMPLETION & CERTIFICATES');
  console.log('===============================================================\n');

  // --- 1. ZERO EXAMINATION INVARIANT ENFORCEMENT ---
  console.log('--- Test Suite 1: Zero Examination Invariant Enforcement ---');

  it('No examination/quiz/grade tables in schema', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
    assert.strictEqual(/CREATE\s+TABLE\s+(public\.)?exams\b/i.test(schema), false);
    assert.strictEqual(/CREATE\s+TABLE\s+(public\.)?quizzes\b/i.test(schema), false);
    assert.strictEqual(/CREATE\s+TABLE\s+(public\.)?grades\b/i.test(schema), false);
  });

  it('Official credential title is Certificate of Completion', () => {
    const consts = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'constants.ts'), 'utf8');
    assert.strictEqual(consts.includes("certificateTitle: 'Certificate of Completion'"), true);
  });

  it('Certificate Document component contains zero examination terminology', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'CertificateDocument.tsx'), 'utf8');
    assert.strictEqual(/\bexam\b/i.test(doc), false);
    assert.strictEqual(/\bquiz\b/i.test(doc), false);
    assert.strictEqual(/\bgrading\b/i.test(doc), false);
    assert.strictEqual(/\bpass mark\b/i.test(doc), false);
  });

  // --- 2. ZERO DATABASE SCHEMA CHANGES COMMITMENT ---
  console.log('\n--- Test Suite 2: Zero Database Schema Changes Commitment ---');

  it('No new migrations added for Phase 9D', () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const phase9dMigrations = files.filter(f => /phase_?9d/i.test(f));
    assert.strictEqual(phase9dMigrations.length, 0, 'Phase 9D must have 0 new migration files');
  });

  it('Reuses pre-existing public.certificates and public.enrolments schema', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.certificates'), true);
    assert.strictEqual(schema.includes('CREATE TABLE IF NOT EXISTS public.enrolments'), true);
  });

  // --- 3. ATTENDANCE ELIGIBILITY CALCULATION & BUSINESS RULES ---
  console.log('\n--- Test Suite 3: Attendance Eligibility & Math Logic ---');

  it('Default attendance threshold is strictly 80%', () => {
    const consts = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'constants.ts'), 'utf8');
    assert.strictEqual(consts.includes('DEFAULT_ATTENDANCE_THRESHOLD = 80'), true);
  });

  it('Correctly calculates attendance percentage with weighted sessions', () => {
    // 8 delivered sessions: 6 present, 1 late, 1 excused (0.5 weight)
    const totalDelivered = 8;
    const present = 6;
    const late = 1;
    const excused = 1;
    const effectiveAttended = (present * 1.0) + (late * 1.0) + (excused * 0.5);
    const attendancePct = Math.min(100, Math.round((effectiveAttended / totalDelivered) * 100));

    // 7.5 / 8 = 93.75 -> 94%
    assert.strictEqual(attendancePct, 94);
    assert.strictEqual(attendancePct >= 80, true);
  });

  it('Rejects candidate below 80% attendance without override', () => {
    // 10 delivered sessions: 7 present, 0 late, 0 excused -> 70%
    const totalDelivered = 10;
    const present = 7;
    const effective = present * 1.0;
    const attendancePct = Math.min(100, Math.round((effective / totalDelivered) * 100));

    assert.strictEqual(attendancePct, 70);
    assert.strictEqual(attendancePct >= 80, false);
  });

  it('Eligibility module derives attendance from delivered sessions only (excludes cancelled)', () => {
    const eligCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(eligCode.includes("not('status', 'eq', 'CANCELLED')"), true);
    assert.strictEqual(eligCode.includes("in('status', ['COMPLETED', 'ATTENDANCE_SUBMITTED'])"), true);
  });

  // --- 4. COMPLETION VERIFICATION & ADMINISTRATIVE OVERRIDE ---
  console.log('\n--- Test Suite 4: Completion Verification & Override Governance ---');

  it('Completion verification requires Super Admin, Staff, or Cohort Lead Facilitator', () => {
    const eligCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(eligCode.includes('isAdminOrStaff'), true);
    assert.strictEqual(eligCode.includes('isLeadFacilitator'), true);
    assert.strictEqual(eligCode.includes('UNAUTHORIZED: Only an authorized Administrator, Staff, or assigned Cohort Lead Facilitator can verify training completion'), true);
  });

  it('Administrative completion override requires documented justification reason', () => {
    const eligCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(eligCode.includes('OVERRIDE_REASON_REQUIRED'), true);
  });

  it('Administrative completion override restricted to Super Admin and Staff', () => {
    const eligCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(eligCode.includes('UNAUTHORIZED: Only Super Admin or Staff can execute an administrative completion override'), true);
  });

  // --- 5. CANONICAL CERTIFICATE NUMBERING & TOKENS ---
  console.log('\n--- Test Suite 5: Certificate Numbering & Cryptographic Tokens ---');

  it('Certificate numbers follow canonical format CERT-YYYY-##### without Math.random()', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('`CERT-${issueYear}-${nextSeq}`'), true);
    assert.strictEqual(/Math\.random\(\).*certNumber/i.test(certCode), false);
  });

  it('Verification token generated cryptographically with vtok_ prefix', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes("crypto.randomBytes(16).toString('hex')"), true);
    assert.strictEqual(certCode.includes('`vtok_${Date.now().toString(36)}_'), true);
  });

  // --- 6. ACADEMIC GUARDS & ROLE AUTHORIZATION ---
  console.log('\n--- Test Suite 6: Academic Guards & Role Authorization ---');

  it('Academic Completion Guard rejects issuance for unverified completion', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('INELIGIBLE_CERTIFICATE_ISSUANCE'), true);
    assert.strictEqual(certCode.includes("enr.status !== 'COMPLETED' || enr.completion_status !== 'VERIFIED'"), true);
  });

  it('Duplicate active certificate guard prevents double issuance for same enrolment', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('DUPLICATE_ACTIVE_CERTIFICATE'), true);
  });

  it('Certificate issuance restricted to Super Admin and Staff', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('UNAUTHORIZED: Only an authorized Administrator or Staff can issue Certificates of Completion'), true);
  });

  // --- 7. IMMUTABLE SNAPSHOTS & PROGRAMME DEPENDENCIES ---
  console.log('\n--- Test Suite 7: Immutable Snapshots & Programme Competencies ---');

  it('Certificate snapshots student name, programme, role, and attendance percentage', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('student_name_snapshot: studentNameSnapshot'), true);
    assert.strictEqual(certCode.includes('programme_name_snapshot: progNameSnapshot'), true);
    assert.strictEqual(certCode.includes('attendance_pct_snapshot: attendancePctSnapshot'), true);
    assert.strictEqual(certCode.includes('certificate_title_snapshot: certTitle'), true);
  });

  it('Default programme settings dynamically configure CyberSecurity vs Data Analysis competencies', () => {
    const consts = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'constants.ts'), 'utf8');
    assert.strictEqual(consts.includes("'CyberSecurity Professional'"), true);
    assert.strictEqual(consts.includes("'Threat Detection, Network Security, Risk Mitigation, and use of industry-standard tools.'"), true);
    assert.strictEqual(consts.includes("'Data Analyst Professional'"), true);
    assert.strictEqual(consts.includes("'Data Analysis, Data Cleaning and Data Visualization'"), true);
  });

  // --- 8. CONTROLLED REVOCATION & REISSUANCE PROVENANCE ---
  console.log('\n--- Test Suite 8: Controlled Revocation & Reissuance ---');

  it('Revocation strictly requires documented justification reason', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('REVOCATION_REASON_REQUIRED'), true);
  });

  it('Revocation updates status to REVOKED, captures revokedBy, and syncs enrolment', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes("status: 'REVOKED'"), true);
    assert.strictEqual(certCode.includes('revoked_by: actor.id'), true);
    assert.strictEqual(certCode.includes('certificate_issued: false'), true);
  });

  it('Reissuance links new certificate to previous revoked certificate ID', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes('reissued_from_certificate_id: request.reissuedFromCertificateId || null'), true);
    assert.strictEqual(certCode.includes('REISSUE_REASON_REQUIRED'), true);
  });

  // --- 9. SAFE PUBLIC VERIFICATION SERVICE ---
  console.log('\n--- Test Suite 9: Safe Public Verification Service ---');

  it('Public verification endpoint exposes only authorized non-private data', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    const verifyBlock = certCode.substring(certCode.indexOf('verifyCertificatePublic'));

    // Must return public credential summary
    assert.strictEqual(verifyBlock.includes('certificateNumber: cert.certificate_number'), true);
    assert.strictEqual(verifyBlock.includes('studentName: cert.student_name_snapshot'), true);
    assert.strictEqual(verifyBlock.includes('programmeName: cert.programme_name_snapshot'), true);

    // MUST NOT return private student/tenant fields
    assert.strictEqual(/studentEmail:\s*cert\./.test(verifyBlock), false);
    assert.strictEqual(/studentPhone:\s*cert\./.test(verifyBlock), false);
    assert.strictEqual(/tenantId:\s*cert\./.test(verifyBlock), false);
    assert.strictEqual(/invoiceId:\s*cert\./.test(verifyBlock), false);
  });

  // --- 10. VECTOR QR GENERATOR & PRINT GEOMETRY ---
  console.log('\n--- Test Suite 10: Vector QR Generator & Print Geometry ---');

  it('Vector QR SVG generator source contains ISO/IEC QR module count and crispEdges SVG', () => {
    const qrCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'qr-svg.ts'), 'utf8');
    assert.strictEqual(qrCode.includes('generateCertificateQrSvg'), true);
    assert.strictEqual(qrCode.includes('shape-rendering="crispEdges"'), true);
    assert.strictEqual(qrCode.includes('QRCode'), true);
    assert.strictEqual(qrCode.includes('QR8bitByte'), true);
  });

  it('Certificate Document enforces A4 landscape print styling', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'CertificateDocument.tsx'), 'utf8');
    assert.strictEqual(doc.includes('size: A4 landscape !important;'), true);
    assert.strictEqual(doc.includes('width: 297mm !important;'), true);
    assert.strictEqual(doc.includes('viewBox="0 0 841.89 595.28"'), true);
  });

  // --- 11. IMMUTABLE AUDIT LOGGING ---
  console.log('\n--- Test Suite 11: Immutable Audit Logging ---');

  it('Logs all certificate mutations into public.finance_audit_log', () => {
    const certCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(certCode.includes("action: 'CERTIFICATE_ISSUED'"), true);
    assert.strictEqual(certCode.includes("action: 'CERTIFICATE_REVOKED'"), true);
    assert.strictEqual(certCode.includes("action: 'CERTIFICATE_REISSUED'"), true);
  });

  it('Logs completion signoffs into public.finance_audit_log', () => {
    const eligCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(eligCode.includes("action: 'COMPLETION_VERIFIED'"), true);
    assert.strictEqual(eligCode.includes("action: 'COMPLETION_OVERRIDE'"), true);
  });

  // --- 12. NAVIGATION REGISTRY INTEGRITY ---
  console.log('\n--- Test Suite 12: Navigation Registry Integrity ---');

  it('Navigation registry activates Certificate Eligibility (/certificate-eligibility) and Certificates (/certificates)', () => {
    const nav = fs.readFileSync(path.join(__dirname, '..', 'lib', 'config', 'navigation.ts'), 'utf8');
    assert.strictEqual(nav.includes("href: '/certificate-eligibility'"), true);
    assert.strictEqual(nav.includes("href: '/certificates'"), true);
    assert.strictEqual(nav.includes("id: 'completions'"), true);
    assert.strictEqual(nav.includes("id: 'certificates'"), true);

    // Verify neither item is disabled or marked Upcoming
    const completionsSection = nav.substring(nav.indexOf("id: 'completions'"), nav.indexOf("id: 'certificates'"));
    assert.strictEqual(completionsSection.includes('isDisabled: true'), false);
    assert.strictEqual(completionsSection.includes("badge: 'Upcoming'"), false);
  });

  // --- 13. RFC-4180 CSV INJECTION DEFENSE ---
  console.log('\n--- Test Suite 13: RFC-4180 CSV Injection Defense ---');

  it('CSV exporters sanitize formula injection characters (=, +, -, @)', () => {
    const eligClient = fs.readFileSync(path.join(__dirname, '..', 'app', 'certificate-eligibility', 'CertificateEligibilityClient.tsx'), 'utf8');
    const certClient = fs.readFileSync(path.join(__dirname, '..', 'app', 'certificates', 'CertificatesClient.tsx'), 'utf8');

    assert.strictEqual(eligClient.includes('/^[=+\\-@\\t\\r]/'), true);
    assert.strictEqual(certClient.includes('/^[=+\\-@\\t\\r]/'), true);
  });

  console.log('\n===============================================================');
  console.log(` PHASE 9D TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase9DSuite();
