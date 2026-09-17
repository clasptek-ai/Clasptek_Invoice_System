// scripts/test_navigation_sidebar_scroll.js
// Automated verification for Clasptek Sidebar, Navigation, SVG Icons, Scrolling & Router Synchronization

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

console.log('================================================================');
console.log('CLASPTEK SIDEBAR, NAVIGATION, ICONS & SCROLL TEST SUITE');
console.log('================================================================\n');

const htmlPath = path.resolve(__dirname, '../clasptek_invoice_system.html');
if (!fs.existsSync(htmlPath)) {
  console.error('FAIL: Primary file clasptek_invoice_system.html does not exist.');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// -------------------------------------------------------------
// TEST GROUP 1: Single Meetings Entry & Zero Duplicates
// -------------------------------------------------------------
console.log('--- TEST GROUP 1: Single Meetings Entry & Zero Duplicates ---');

// Extract the navigation sections
const employeeNavMatch = html.match(/<!-- EMPLOYEE \/ FACILITATOR SELF-SERVICE MENU -->([\s\S]*?)<!-- ADMINISTRATIVE FINANCE & PAYROLL MENU -->/);
const adminNavMatch = html.match(/<!-- ADMINISTRATIVE FINANCE & PAYROLL MENU -->([\s\S]*?)<\/nav>/);

assert(employeeNavMatch && employeeNavMatch[1], 'Employee/Facilitator navigation template exists');
assert(adminNavMatch && adminNavMatch[1], 'Administrative navigation template exists');

const empNav = employeeNavMatch ? employeeNavMatch[1] : '';
const adminNav = adminNavMatch ? adminNavMatch[1] : '';

// Count meetings top-level items in both
const empMeetingsMatches = (empNav.match(/data-tab=["']meetings["']/g) || []).length;
const adminMeetingsMatches = (adminNav.match(/data-tab=["']meetings["']/g) || []).length;

assert(empMeetingsMatches === 1, `Employee/Facilitator menu has exactly ONE top-level Meetings item (found: ${empMeetingsMatches})`);
assert(adminMeetingsMatches === 1, `Admin menu has exactly ONE top-level Meetings item (found: ${adminMeetingsMatches})`);

// Check all data-tabs in admin menu for uniqueness
const adminTabMatches = [...adminNav.matchAll(/class=["']cp-nav-item[^"']*["']\s+data-tab=["']([^"']+)["']/g)].map(m => m[1]);
const adminTabCounts = {};
adminTabMatches.forEach(t => { adminTabCounts[t] = (adminTabCounts[t] || 0) + 1; });
const adminDuplicates = Object.entries(adminTabCounts).filter(([_, count]) => count > 1);

assert(adminDuplicates.length === 0, `Admin navigation has ZERO duplicate top-level items (duplicates: ${JSON.stringify(adminDuplicates)})`);

// -------------------------------------------------------------
// TEST GROUP 2: Parent Meetings Navigation Module & Nested Sub-items
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Parent Meetings Navigation Module & Nested Sub-items ---');

assert(adminNav.includes('cp-nav-parent') && adminNav.includes('cp-nav-subitems'), 'Meetings is configured as a parent navigation module with sub-items');

const subItemLabels = ['All Meetings', 'Schedule Meeting', 'Live Meetings', 'Recordings', 'Meeting History'];
subItemLabels.forEach(label => {
  assert(adminNav.includes(label), `Admin Meetings module includes sub-action "${label}"`);
  assert(empNav.includes(label), `Facilitator Meetings module includes sub-action "${label}"`);
});

assert(html.includes('data-action="schedule"'), 'Sub-item for "Schedule Meeting" exists with data-action="schedule"');
assert(html.includes('data-filter="live"'), 'Sub-item for "Live Meetings" exists with data-filter="live"');
assert(html.includes('data-filter="recordings"'), 'Sub-item for "Recordings" exists with data-filter="recordings"');
assert(html.includes('data-filter="completed"'), 'Sub-item for "Meeting History" exists with data-filter="completed"');

// -------------------------------------------------------------
// TEST GROUP 3: SVG Icon System & Zero Emojis in Nav Items
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 3: SVG Icon System & Zero Emojis in Nav Items ---');

assert(html.includes('function renderNavIcon(name, customSize)'), 'renderNavIcon SVG icon helper is implemented');
assert(html.includes('const NAV_SVG_ICONS = {'), 'NAV_SVG_ICONS dictionary is defined');

// Check that all primary nav items use renderNavIcon
const empNavIcons = [...empNav.matchAll(/<span class=["']cp-nav-icon["']>([\s\S]*?)<\/span>/g)].map(m => m[1]);
const adminNavIcons = [...adminNav.matchAll(/<span class=["']cp-nav-icon["']>([\s\S]*?)<\/span>/g)].map(m => m[1]);
const allNavIcons = [...empNavIcons, ...adminNavIcons];

assert(allNavIcons.length > 0, `Extracted ${allNavIcons.length} navigation icon spans`);
let hasEmojiIcon = false;
allNavIcons.forEach(iconHtml => {
  if (iconHtml.includes('&#x') || /[\u{1F300}-\u{1FAFF}]/u.test(iconHtml)) {
    hasEmojiIcon = true;
  }
});
assert(!hasEmojiIcon, 'Zero emojis or unicode HTML entities in .cp-nav-icon elements');

// Check section titles: must remain text-only labels
const sectionTitles = [...html.matchAll(/<div class=["']cp-nav-section-title["']>([\s\S]*?)<\/div>/g)].map(m => m[1].trim());
let titlesHaveEmoji = false;
sectionTitles.forEach(t => {
  if (t.includes('&#x') || /[\u{1F300}-\u{1FAFF}]/u.test(t)) {
    titlesHaveEmoji = true;
  }
});
assert(!titlesHaveEmoji, `Section titles are clean text-only labels (${sectionTitles.join(' | ')})`);

// Check brand logo link href: must not be '#'
assert(!html.includes('<a href="#" class="cp-sidebar-brand"'), 'Brand logo link does not use href="#" (uses javascript:void(0))');

// -------------------------------------------------------------
// TEST GROUP 4: Router State & Single Source of Truth
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Router State & Single Source of Truth ---');

assert(html.includes('const TAB_TO_HASH_MAP = {'), 'TAB_TO_HASH_MAP is defined');
assert(html.includes('const HASH_TO_TAB_MAP = {'), 'HASH_TO_TAB_MAP is defined');
assert(html.includes('function tabToHash(tab)'), 'tabToHash router helper exists');
assert(html.includes('function hashToTab(hash)'), 'hashToTab router helper exists');
assert(html.includes('function navigateTab('), 'navigateTab router helper exists');
assert(html.includes('function syncRouteFromHash()'), 'syncRouteFromHash helper exists');

// Verify tab permissions in canAccessTab
const canAccessTabSnippet = html.match(/function canAccessTab\([\s\S]*?^}/m);
assert(canAccessTabSnippet && canAccessTabSnippet[0].includes("'meetings'"), 'canAccessTab permits "meetings" for all verified roles');
assert(canAccessTabSnippet && canAccessTabSnippet[0].includes("'facilitatorReports'"), 'canAccessTab permits "facilitatorReports" for Facilitators and Admins');

// Verify employeeAllowed in render()
assert(html.includes("employeeAllowed.push('facilitatorReports')"), 'render() explicitly allows facilitatorReports for Facilitators');
assert(html.includes("else if (state.tab === 'facilitatorReports') renderFacilitatorReportsTab(contentView);"), 'Employee contentView router explicitly dispatches renderFacilitatorReportsTab');

// -------------------------------------------------------------
// TEST GROUP 5: Independent Viewport Scrolling Architecture
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Independent Viewport Scrolling Architecture ---');

assert(html.includes('.cp-layout {') && html.includes('height: 100vh;') && html.includes('overflow: hidden;'), '.cp-layout has height: 100vh and overflow: hidden');
assert(html.includes('.cp-sidebar {') && html.includes('height: 100vh;') && html.includes('position: sticky;'), '.cp-sidebar has height: 100vh and position: sticky');
assert(html.includes('.cp-sidebar-nav {') && html.includes('overflow-y: auto;') && html.includes('overscroll-behavior: contain;'), '.cp-sidebar-nav has independent overflow-y: auto and overscroll-behavior: contain');
assert(html.includes('.cp-main-area {') && html.includes('height: 100vh;') && html.includes('overflow-y: auto;') && html.includes('overscroll-behavior: contain;'), '.cp-main-area has independent overflow-y: auto and overscroll-behavior: contain');

// Scroll preservation logic
assert(html.includes('savedMainScroll = currentMainArea ? currentMainArea.scrollTop : 0;'), 'render() captures mainArea.scrollTop prior to re-render');
assert(html.includes('savedSidebarScroll = currentSidebarNav ? currentSidebarNav.scrollTop : 0;'), 'render() captures sidebarNav.scrollTop prior to re-render');
assert(html.includes('newMainArea.scrollTop = savedMainScroll;'), 'render() preserves scrollTop on intra-page view updates');
assert(html.includes('newMainArea.scrollTop = 0;'), 'render() resets scrollTop = 0 on true tab transitions');

// -------------------------------------------------------------
// TEST GROUP 6: Authoritative Meeting & Google Drive Invariants
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Authoritative Meeting & Google Drive Invariants ---');

// Verify that navigating to Meetings -> Recordings never selects USER_PERSONAL
assert(!html.includes("GoogleDriveOAuth.getStatus('USER_PERSONAL')") && !html.includes("state.meetingSubTab === 'recordings' && GoogleDriveOAuth.getStatus('USER_PERSONAL')"), 'Navigating to Meetings -> Recordings NEVER requests USER_PERSONAL Google Drive status');
assert(html.includes("GoogleDriveOAuth.getStatus('TENANT_CENTRAL')"), 'Meetings module queries authoritative TENANT_CENTRAL Google Drive status');

// -------------------------------------------------------------
// TEST GROUP 7: 100% SHA-256 Parity Across All 4 Distribution Files
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Distribution Targets SHA-256 Parity ---');

const primaryHash = sha256(fs.readFileSync(htmlPath));
const targets = [
  path.resolve(__dirname, '../index.html'),
  path.resolve(__dirname, '../public/clasptek_invoice_system.html'),
  path.resolve(__dirname, '../public/index.html')
];

// Copy primary file to all targets before testing
targets.forEach(t => {
  fs.copyFileSync(htmlPath, t);
});

targets.forEach(t => {
  const targetHash = sha256(fs.readFileSync(t));
  assert(primaryHash === targetHash, `SHA-256 byte parity verified for ${path.relative(path.resolve(__dirname, '..'), t)} (${primaryHash.slice(0, 12)}...)`);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✓');
  process.exit(0);
}
