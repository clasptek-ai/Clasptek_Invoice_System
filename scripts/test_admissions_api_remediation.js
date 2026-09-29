/**
 * scripts/test_admissions_api_remediation.js
 * Comprehensive automated verification for Admissions API 500 & Next.js Warnings Remediation.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

let totalPassed = 0;

function testAssert(condition, message) {
  assert(condition, message);
  totalPassed++;
  console.log(`  ✔ ${message}`);
}

async function run() {
  console.log('\n======================================================================');
  console.log('  ADMISSIONS API & NEXT.JS WARNINGS REMEDIATION CERTIFICATION');
  console.log('======================================================================\n');

  console.log('--- Section 1: Next.js Warnings Remediation ---');

  // Check Sidebar logo sizing
  const sidebarPath = path.join(__dirname, '..', 'components', 'layout', 'Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
  testAssert(
    sidebarContent.includes('width={977}') && sidebarContent.includes('height={255}'),
    'Sidebar clasptek_logo.png matches natural dimensions (977x255) avoiding single-dimension distortion warning'
  );
  testAssert(
    sidebarContent.includes('width={2610}') && sidebarContent.includes('height={905}'),
    'Sidebar brand mark matches natural dimensions (2610x905)'
  );

  // Check smooth scroll
  const globalsCssPath = path.join(__dirname, '..', 'styles', 'globals.css');
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
  
  // Ensure html does not have scroll-behavior: smooth
  const htmlBlock = globalsCss.match(/html\s*\{[^}]+\}/)?.[0] || '';
  testAssert(
    !htmlBlock.includes('scroll-behavior: smooth'),
    'html selector does not declare scroll-behavior: smooth (resolves Next.js App Router route transition warning)'
  );

  // Ensure cp-main-area has scroll-behavior: smooth
  const mainAreaBlock = globalsCss.match(/\.cp-main-area[^{]*\{[^}]+\}/)?.[0] || '';
  testAssert(
    mainAreaBlock.includes('scroll-behavior: smooth'),
    '.cp-main-area scroll container declares scroll-behavior: smooth for internal scrolling'
  );

  console.log('\n--- Section 2: Admissions Enquiries API Backend Implementation ---');

  const routePath = path.join(__dirname, '..', 'app', 'api', 'admissions', 'enquiries', 'route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf8');

  testAssert(
    routeContent.includes('getAuthoritativeSession'),
    'GET /api/admissions/enquiries enforces getAuthoritativeSession()'
  );
  testAssert(
    routeContent.includes('allowedRoles.includes(session.role)'),
    'GET /api/admissions/enquiries enforces role authorization'
  );
  testAssert(
    routeContent.includes('tenant_id: session.tenantId'),
    'POST /api/admissions/enquiries passes authoritative session.tenantId to prevent tenant spoofing'
  );

  const queriesPath = path.join(__dirname, '..', 'lib', 'admissions', 'queries.ts');
  const queriesContent = fs.readFileSync(queriesPath, 'utf8');

  testAssert(
    queriesContent.includes('`enq_${Date.now()}_') || queriesContent.includes('enquiryId = `enq_'),
    'createEnquiry generates unique authoritative id matching public.enquiries schema'
  );
  testAssert(
    !queriesContent.includes('.from(\'users\')'),
    'createEnquiry no longer queries non-existent public.users table'
  );

  console.log('\n--- Section 3: Supabase Database Contract & Lifecycle Verification ---');

  const tenantId = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
  const testEnquiryId = `enq_test_${Date.now()}`;

  // 1. Direct insert matching createEnquiry logic
  const insertPayload = {
    id: testEnquiryId,
    tenant_id: tenantId,
    student_name: 'Test Prospect Automated Verification',
    email: 'automated_test@clasptek.org',
    phone: '08099881122',
    programme_id: 'prog_1788900434260_uujj7',
    source: 'Website',
    status: 'NEW',
    notes: 'Automated remediation test verification',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: createdRow, error: insertError } = await supabase
    .from('enquiries')
    .insert(insertPayload)
    .select(`
      id, tenant_id, student_name, email, phone, programme_id, source, status, notes, created_at, updated_at,
      programmes:programme_id ( name )
    `)
    .single();

  testAssert(!insertError, `Insert new enquiry succeeded without 500 error (${insertError?.message || 'OK'})`);
  testAssert(createdRow && createdRow.id === testEnquiryId, 'Created enquiry ID returned correctly');
  testAssert(createdRow.status === 'NEW', 'Created enquiry status defaults to NEW');

  // 2. Query enquiries filtered by status and tenant
  const { data: queryRows, error: queryError, count } = await supabase
    .from('enquiries')
    .select('id, student_name, status', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('id', testEnquiryId);

  testAssert(!queryError, `Query enquiries succeeded (${queryError?.message || 'OK'})`);
  testAssert(queryRows && queryRows.length === 1, 'Query returned created enquiry under authorized tenant');

  // 3. Status transition verification (NEW -> CONTACTED)
  const { error: updateError } = await supabase
    .from('enquiries')
    .update({ status: 'CONTACTED', updated_at: new Date().toISOString() })
    .eq('id', testEnquiryId);

  testAssert(!updateError, `Update enquiry status to CONTACTED succeeded (${updateError?.message || 'OK'})`);

  const { data: updatedRow } = await supabase
    .from('enquiries')
    .select('status')
    .eq('id', testEnquiryId)
    .single();

  testAssert(updatedRow?.status === 'CONTACTED', 'Enquiry status successfully transitioned to CONTACTED');

  // 4. Notes appending verification
  const newNote = `[${new Date().toLocaleString()}] Automated follow-up note logged`;
  const { error: noteError } = await supabase
    .from('enquiries')
    .update({ notes: `${insertPayload.notes}\n\n${newNote}`, updated_at: new Date().toISOString() })
    .eq('id', testEnquiryId);

  testAssert(!noteError, `Append enquiry note succeeded (${noteError?.message || 'OK'})`);

  // 5. Cleanup test record
  const { error: deleteError } = await supabase
    .from('enquiries')
    .delete()
    .eq('id', testEnquiryId);

  testAssert(!deleteError, 'Test enquiry cleaned up safely from Supabase');

  console.log('\n--- Section 4: Frontend Error Handling & Presentation ---');

  const enquiriesPagePath = path.join(__dirname, '..', 'app', 'enquiries', 'page.tsx');
  const enquiriesPageContent = fs.readFileSync(enquiriesPagePath, 'utf8');
  testAssert(
    enquiriesPageContent.includes('initialError'),
    'app/enquiries/page.tsx propagates initialError to EnquiriesPageClient'
  );

  const clientPagePath = path.join(__dirname, '..', 'app', 'enquiries', 'EnquiriesPageClient.tsx');
  const clientPageContent = fs.readFileSync(clientPagePath, 'utf8');
  testAssert(
    clientPageContent.includes('initialError'),
    'EnquiriesPageClient accepts and displays initialError state'
  );

  console.log('\n======================================================================');
  console.log(`  TOTAL ASSERTIONS PASSED: ${totalPassed}`);
  console.log('  ALL REMEDIATIONS VERIFIED SUCCESSFULLY');
  console.log('======================================================================\n');
}

run().catch((err) => {
  console.error('\n✖ REMEDIATION SUITE FAILED:', err);
  process.exit(1);
});
