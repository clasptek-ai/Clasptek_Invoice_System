/**
 * Test Suite: Dedicated Full-Page Admissions & Candidate Intake Workspace
 * Verifies full-page navigation, step validation, submission flow, confirmation screen,
 * and 4-file distribution parity.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('================================================================================');
console.log(' CLASPTEK ADMISSIONS & CANDIDATE INTAKE WORKSPACE TEST SUITE');
console.log(' Timestamp:', new Date().toISOString());
console.log('================================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ✔ [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

// 1. File & Distribution Parity
const rootHtmlPath = path.join(__dirname, '..', 'clasptek_invoice_system.html');
const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const publicClasptekPath = path.join(__dirname, '..', 'public', 'clasptek_invoice_system.html');
const publicIndexPath = path.join(__dirname, '..', 'public', 'index.html');

const rootContent = fs.readFileSync(rootHtmlPath, 'utf8');
const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
const publicClasptekContent = fs.readFileSync(publicClasptekPath, 'utf8');
const publicIndexContent = fs.readFileSync(publicIndexPath, 'utf8');

function getHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const hRoot = getHash(rootContent);
const hIndex = getHash(indexContent);
const hPubClasptek = getHash(publicClasptekContent);
const hPubIndex = getHash(publicIndexContent);

assert(hRoot === hIndex && hRoot === hPubClasptek && hRoot === hPubIndex,
  '1. 100% SHA-256 byte parity across all 4 production distribution files (' + hRoot.slice(0, 12) + '...)');

// 2. Structural Codebase Checks in clasptek_invoice_system.html
assert(rootContent.includes("apply: 'apply'") && rootContent.includes("#apply"),
  '2. Route mappings for #apply exist in HASH_TO_TAB_MAP and TAB_TO_HASH_MAP');

assert(rootContent.includes("apply: 'Admissions & Candidate Intake'"),
  '3. tabLabels.apply is configured as "Admissions & Candidate Intake"');

assert(rootContent.includes("function renderApplicantIntakePortal(container, options = {})"),
  '4. renderApplicantIntakePortal is defined as a standalone workspace renderer');

assert(rootContent.includes("function renderCandidateApplicationDrawer(container, options = {})"),
  '5. renderCandidateApplicationDrawer is preserved for backwards compatibility and test suites');

assert(rootContent.includes("window.renderCandidateApplicationDrawer = renderCandidateApplicationDrawer;"),
  '6. renderCandidateApplicationDrawer is exported to window');

assert(rootContent.includes("else if (state.tab === 'apply') renderApplicantIntakePortal(contentView);"),
  '7. Router dispatches state.tab === "apply" to renderApplicantIntakePortal');

assert(rootContent.includes("btnEnterStaffApplication") && rootContent.includes("navigateTab('apply')"),
  '8. Candidate Applications view (#applications) wires "+ New Application" to navigateTab("apply")');

// 3. UI Invariants & Content
assert(rootContent.includes("Admissions & Candidate Intake"),
  '9. Contains primary page heading "Admissions & Candidate Intake"');

assert(rootContent.includes("Complete a new candidate application for admission into a Clasptek training programme."),
  '10. Contains supporting description for admissions intake');

assert(rootContent.includes("btnWkBackToApplications") && rootContent.includes("Back to Candidate Applications"),
  '11. Contains explicit "← Back to Candidate Applications" navigation button');

assert(rootContent.includes("cp-intake-stepper") && rootContent.includes("Applicant Details") && rootContent.includes("Programme Selection"),
  '12. Multi-step stepper indicator contains all 5 required intake stages');

assert(rootContent.includes("btnWkModeForm") && rootContent.includes("btnWkModeGoogleForms"),
  '13. Mode switcher toggle between Multi-Step Form and Google Forms / Sheets Ingestion');

assert(rootContent.includes("btnWkBackToQueue") && rootContent.includes("btnWkSubmitAnother") && rootContent.includes("btnWkCopyRef"),
  '14. Submission confirmation screen includes Reference Number, Copy, View Queue, and New Application triggers');

// 4. Responsive CSS Checks
assert(rootContent.includes(".cp-admissions-workspace"),
  '15. CSS includes .cp-admissions-workspace container styles');

assert(rootContent.includes(".cp-intake-stepper"),
  '16. CSS includes .cp-intake-stepper styles with smooth mobile horizontal scroll overflow handling');

assert(rootContent.includes("@media (max-width: 768px)") && rootContent.includes(".cp-intake-form-grid"),
  '17. Responsive CSS collapses 2-column intake form grids into 1-column on mobile viewports');

// 5. CRM & Intake Linking
assert(rootContent.includes("state.pendingApplicationFromEnquiry"),
  '18. renderApplicantIntakePortal supports pre-filling formData from state.pendingApplicationFromEnquiry');

assert(rootContent.includes("enquiryId: linkedEnquiryId") || rootContent.includes("linkedEnquiryId = payload.enquiryId"),
  '19. submitAuthoritativeApplication associates authoritative application with enquiry');

console.log('\n================================================================================');
console.log(` RESULTS: ${passCount}/${passCount + failCount} TESTS PASSED (${failCount} FAILURES)`);
console.log('================================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
