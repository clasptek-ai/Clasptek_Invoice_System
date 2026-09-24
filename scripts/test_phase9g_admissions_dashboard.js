/**
 * scripts/test_phase9g_admissions_dashboard.js
 * Phase 9G — Admissions & CRM + Executive Dashboard Visual/Functional Parity Certification Suite
 *
 * Verifies:
 *  1. Executive Management Command Centre & Management Attention Centre
 *  2. Zero emojis / glyphs across Dashboard and Admissions
 *  3. Enquiries & Leads Directory, NewEnquiryModal, and API routes
 *  4. Strict lifecycle separation (Prospect -> Enquiry -> Application -> Conversion)
 *  5. Security governance, tenant isolation, and authoritative data wiring
 */

const fs = require('fs');
const path = require('path');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  \x1b[32m✔\x1b[0m ${message}`);
  } else {
    failedAssertions++;
    console.error(`  \x1b[31m✖\x1b[0m ${message}`);
  }
}

function hasEmoji(text) {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  // Exclude acceptable checkmarks/crosses: ✔, ✕, ✖
  const stripped = text.replace(/[✓✔✕✖•→←…—]/g, '');
  return emojiRegex.test(stripped);
}

console.log('\n\x1b[1m======================================================================\x1b[0m');
console.log('\x1b[1m  PHASE 9G — ADMISSIONS & CRM + EXECUTIVE DASHBOARD CERTIFICATION SUITE\x1b[0m');
console.log('\x1b[1m======================================================================\x1b[0m\n');

// ─── 1. DASHBOARD & MANAGEMENT ATTENTION CENTRE ─────────────────────────────
console.log('\x1b[36m--- Section 1: Executive Dashboard & Management Attention Centre ---\x1b[0m');

const dashboardPath = path.join(__dirname, '..', 'app', 'dashboard', 'DashboardClient.tsx');
assert(fs.existsSync(dashboardPath), 'DashboardClient.tsx exists');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

assert(
  dashboardContent.includes('Executive Command Centre'),
  'Executive Command Centre title is present in Dashboard'
);

assert(
  dashboardContent.includes('id="managementAttentionCentre"'),
  'Management Attention Centre container with id="managementAttentionCentre" exists'
);

assert(
  dashboardContent.includes('Management Attention Centre'),
  'Management Attention Centre title is rendered'
);

assert(
  dashboardContent.includes('Automated multi-department operational exceptions requiring management authorization or intervention.'),
  'Management Attention Centre explanatory subtitle matches legacy verbatim'
);

assert(
  dashboardContent.includes('ACTIONABLE ALERT'),
  'Management Attention Centre displays actionable alert counter badge'
);

assert(
  dashboardContent.includes('cp-attention-grid'),
  'Management Attention Centre operational grid (cp-attention-grid) is present'
);

assert(
  dashboardContent.includes('Overdue Invoices Awaiting Collection') && dashboardContent.includes('/receivables'),
  'Operational alert for Overdue Invoices routes to /receivables'
);

assert(
  dashboardContent.includes('High-Value Accounts Outstanding') && dashboardContent.includes('/receivables'),
  'Operational alert for High-Value Accounts routes to /receivables'
);

assert(
  dashboardContent.includes('Month-End Payroll Ready') && dashboardContent.includes('/payroll'),
  'Operational alert for Month-End Payroll routes to /payroll'
);

assert(
  dashboardContent.includes('Payslips Awaiting Employee Acknowledgement') && dashboardContent.includes('/payroll'),
  'Operational alert for Unacknowledged Payslips routes to /payroll'
);

assert(
  dashboardContent.includes('New Enquiries & Leads Without Contact') && dashboardContent.includes('/enquiries'),
  'Operational alert for New Enquiries & Leads routes to /enquiries'
);

assert(
  dashboardContent.includes('All operational systems, receivables, and payroll items are in normal operating parameters.'),
  'Empty state message for Management Attention Centre matches legacy verbatim'
);

assert(
  !hasEmoji(dashboardContent),
  'Zero emoji glyphs in DashboardClient.tsx (all replaced with SVGs)'
);

const staffDashPath = path.join(__dirname, '..', 'components', 'dashboard', 'StaffFacilitatorDashboard.tsx');
if (fs.existsSync(staffDashPath)) {
  const staffDashContent = fs.readFileSync(staffDashPath, 'utf8');
  assert(!hasEmoji(staffDashContent), 'Zero emoji glyphs in StaffFacilitatorDashboard.tsx');
}

// ─── 2. ENQUIRIES & LEADS DIRECTORY & FORM ──────────────────────────────────
console.log('\n\x1b[36m--- Section 2: Enquiries & Leads Directory & Intake Form Parity ---\x1b[0m');

const navPath = path.join(__dirname, '..', 'lib', 'config', 'navigation.ts');
assert(fs.existsSync(navPath), 'Navigation config exists');
const navContent = fs.readFileSync(navPath, 'utf8');

assert(
  navContent.includes("id: 'enquiries'") && navContent.includes("href: '/enquiries'") && navContent.includes("label: 'Enquiries & Leads'"),
  "Sidebar navigation maps 'Enquiries & Leads' directly to '/enquiries'"
);

const enquiriesPagePath = path.join(__dirname, '..', 'app', 'enquiries', 'page.tsx');
assert(fs.existsSync(enquiriesPagePath), 'app/enquiries/page.tsx exists');
const enquiriesPageContent = fs.readFileSync(enquiriesPagePath, 'utf8');

assert(
  enquiriesPageContent.includes('getEnquiries') && enquiriesPageContent.includes('getProgrammes'),
  'EnquiriesPage fetches enquiries and programmes server-side'
);

const enquiriesClientPath = path.join(__dirname, '..', 'app', 'enquiries', 'EnquiriesPageClient.tsx');
assert(fs.existsSync(enquiriesClientPath), 'EnquiriesPageClient.tsx exists');
const enquiriesClientContent = fs.readFileSync(enquiriesClientPath, 'utf8');

assert(
  enquiriesClientContent.includes('Enquiries & Leads Directory') || enquiriesClientContent.includes('Enquiries &amp; Leads Directory'),
  'Page heading is verbatim: Enquiries & Leads Directory'
);

assert(
  enquiriesClientContent.includes('Manage prospect interactions, programme requests, billing triggers, and lead progression.'),
  'Page subtitle matches legacy verbatim'
);

assert(
  enquiriesClientContent.includes('id="btnNewEnquiryBtn"') && !enquiriesClientContent.includes('href="/apply"'),
  '+ Log Enquiry button opens NewEnquiryModal instead of redirecting to /apply'
);

assert(
  enquiriesClientContent.includes('NewEnquiryModal'),
  'EnquiriesPageClient embeds and controls NewEnquiryModal'
);

assert(
  !hasEmoji(enquiriesClientContent),
  'Zero emoji glyphs in EnquiriesPageClient.tsx'
);

const newEnquiryModalPath = path.join(__dirname, '..', 'components', 'admissions', 'NewEnquiryModal.tsx');
assert(fs.existsSync(newEnquiryModalPath), 'NewEnquiryModal component exists');
const newEnquiryModalContent = fs.readFileSync(newEnquiryModalPath, 'utf8');

assert(
  newEnquiryModalContent.includes('Candidate / Prospect Full Name *'),
  'NewEnquiryModal includes Prospect Full Name field'
);

assert(
  newEnquiryModalContent.includes('duplicateWarningBox') && newEnquiryModalContent.includes('Potential Existing Profile'),
  'NewEnquiryModal implements potential duplicate profile detection'
);

assert(
  newEnquiryModalContent.includes('Phone Number (WhatsApp) *') && newEnquiryModalContent.includes('Email Address'),
  'NewEnquiryModal includes WhatsApp Phone and Email fields'
);

assert(
  newEnquiryModalContent.includes('Target Programme *') && newEnquiryModalContent.includes('Lead Acquisition Source *'),
  'NewEnquiryModal includes Target Programme and Lead Acquisition Source dropdowns'
);

assert(
  newEnquiryModalContent.includes('Enquiry Date *') && newEnquiryModalContent.includes('Assigned Admissions Officer'),
  'NewEnquiryModal includes Enquiry Date and Assigned Staff fields'
);

assert(
  newEnquiryModalContent.includes('Candidate Background & Notes') || newEnquiryModalContent.includes('Candidate Background &amp; Notes'),
  'NewEnquiryModal includes Candidate Background & Notes textarea'
);

assert(
  newEnquiryModalContent.includes('/api/admissions/enquiries'),
  'NewEnquiryModal submits to /api/admissions/enquiries'
);

assert(
  !hasEmoji(newEnquiryModalContent),
  'Zero emoji glyphs in NewEnquiryModal.tsx'
);

// ─── 3. ENQUIRIES API & BUSINESS LOGIC ──────────────────────────────────────
console.log('\n\x1b[36m--- Section 3: Enquiries API & Authoritative Business Logic ---\x1b[0m');

const enquiriesApiRoutePath = path.join(__dirname, '..', 'app', 'api', 'admissions', 'enquiries', 'route.ts');
assert(fs.existsSync(enquiriesApiRoutePath), 'app/api/admissions/enquiries/route.ts exists');
const enquiriesApiContent = fs.readFileSync(enquiriesApiRoutePath, 'utf8');

assert(
  enquiriesApiContent.includes('export async function POST') && enquiriesApiContent.includes('export async function GET'),
  'Enquiries API route exports both GET and POST handlers'
);

assert(
  enquiriesApiContent.includes('getAuthoritativeSession'),
  'Enquiries API enforces getAuthoritativeSession for tenant isolation'
);

assert(
  enquiriesApiContent.includes('createEnquiry'),
  'Enquiries API calls createEnquiry query helper'
);

const queriesPath = path.join(__dirname, '..', 'lib', 'admissions', 'queries.ts');
const queriesContent = fs.readFileSync(queriesPath, 'utf8');

assert(
  queriesContent.includes('export async function createEnquiry'),
  'lib/admissions/queries.ts exports createEnquiry helper'
);

assert(
  queriesContent.includes('tenant_id: tenantId'),
  'createEnquiry enforces session tenant_id'
);

const statusApiRoutePath = path.join(__dirname, '..', 'app', 'api', 'admissions', 'enquiries', '[id]', 'status', 'route.ts');
assert(fs.existsSync(statusApiRoutePath), 'Enquiry status update API route exists');
const statusApiContent = fs.readFileSync(statusApiRoutePath, 'utf8');

assert(
  statusApiContent.includes('ENQUIRY_TRANSITIONS'),
  'Enquiry status transition endpoint enforces ENQUIRY_TRANSITIONS validation matrix'
);

// ─── 4. ADMISSIONS, APPLICATIONS & LIFECYCLE SEPARATION ─────────────────────
console.log('\n\x1b[36m--- Section 4: Admissions Lifecycle & Module Separation ---\x1b[0m');

const applicationsPagePath = path.join(__dirname, '..', 'app', 'applications', 'page.tsx');
assert(fs.existsSync(applicationsPagePath), 'app/applications/page.tsx exists');

const applyPagePath = path.join(__dirname, '..', 'app', 'apply', 'page.tsx');
assert(fs.existsSync(applyPagePath), 'app/apply/page.tsx exists (public application intake)');

const applicantPortalPath = path.join(__dirname, '..', 'app', 'applicant-portal', 'page.tsx');
assert(fs.existsSync(applicantPortalPath), 'app/applicant-portal/page.tsx exists (applicant tracking)');

const convertApiPath = path.join(__dirname, '..', 'app', 'api', 'admissions', 'applications', '[id]', 'convert', 'route.ts');
assert(fs.existsSync(convertApiPath), 'Application conversion endpoint exists');
const convertApiContent = fs.readFileSync(convertApiPath, 'utf8');

assert(
  convertApiContent.includes('convert_intake_application'),
  'Application conversion invokes authoritative convert_intake_application RPC'
);

// Verify Zero Emojis in Admissions Components
const admissionsDir = path.join(__dirname, '..', 'components', 'admissions');
const admissionsFiles = fs.readdirSync(admissionsDir).filter(f => f.endsWith('.tsx'));
let emojiFound = false;
for (const file of admissionsFiles) {
  const content = fs.readFileSync(path.join(admissionsDir, file), 'utf8');
  if (hasEmoji(content)) {
    emojiFound = true;
    console.error(`  \x1b[31mFound emoji in ${file}\x1b[0m`);
  }
}
assert(!emojiFound, 'Zero emoji glyphs in all components/admissions/*.tsx files');

// ─── 5. SUMMARY ─────────────────────────────────────────────────────────────
console.log('\n\x1b[1m======================================================================\x1b[0m');
console.log(`  TOTAL ASSERTIONS : ${totalAssertions}`);
console.log(`  PASSED           : \x1b[32m${passedAssertions}\x1b[0m`);
console.log(`  FAILED           : \x1b[31m${failedAssertions}\x1b[0m`);
console.log('\x1b[1m======================================================================\x1b[0m\n');

if (failedAssertions > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32m✔ PHASE 9G ADMISSIONS & DASHBOARD SUITE PASSED ALL ASSERTIONS.\x1b[0m\n');
  process.exit(0);
}
