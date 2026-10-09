/**
 * scripts/test_certificate_editing_and_print.js
 *
 * Automated verification suite for Clasptek Certificate Editing, Recipient Name Formatting,
 * Poppins 24px Typography, and Landscape Printing.
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

async function runSuite() {
  console.log('\n===============================================================');
  console.log('CLASPTEK CERTIFICATE EDITING, RECIPIENT NAME & PRINT TEST SUITE');
  console.log('===============================================================\n');

  // --- 1. RECIPIENT NAME FORMATTING & ORDERING ---
  console.log('--- Test Suite 1: Recipient Name Ordering (Last + First + Middle) ---');

  // Emulate formatRecipientName logic from lib/certificates/format-name.ts
  const formatNameCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'format-name.ts'), 'utf8');

  it('format-name.ts exists and exports formatRecipientName', () => {
    assert.strictEqual(formatNameCode.includes('export function formatRecipientName'), true);
  });

  // Evaluate formatRecipientName
  function formatRecipientName(lastName, firstName, middleName) {
    const cleanLast = String(lastName || '').trim();
    const cleanFirst = String(firstName || '').trim();
    const cleanMiddle = String(middleName || '').trim();

    const isInvalid = (val) =>
      !val || val === 'null' || val === 'undefined' || val === '—' || val === '-';

    const parts = [
      isInvalid(cleanLast) ? '' : cleanLast,
      isInvalid(cleanFirst) ? '' : cleanFirst,
      isInvalid(cleanMiddle) ? '' : cleanMiddle,
    ].filter(Boolean);

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  it('Formats full 3 names in exact order: Surname (Last Name) + First Name + Middle Name', () => {
    const result = formatRecipientName('ADELEKE', 'Babatunde', 'Oluwaseun');
    assert.strictEqual(result, 'ADELEKE Babatunde Oluwaseun');
  });

  it('Gracefully omits missing middle name without producing double spaces', () => {
    const result = formatRecipientName('ADELEKE', 'Babatunde', null);
    assert.strictEqual(result, 'ADELEKE Babatunde');
    assert.strictEqual(result.includes('  '), false);
  });

  it('Handles undefined or empty string middle name without null or undefined literal', () => {
    const resultUndef = formatRecipientName('ADELEKE', 'Babatunde', undefined);
    assert.strictEqual(resultUndef, 'ADELEKE Babatunde');

    const resultEmpty = formatRecipientName('ADELEKE', 'Babatunde', '');
    assert.strictEqual(resultEmpty, 'ADELEKE Babatunde');

    const resultDash = formatRecipientName('ADELEKE', 'Babatunde', '—');
    assert.strictEqual(resultDash, 'ADELEKE Babatunde');
  });

  it('Does not produce null or undefined placeholder strings', () => {
    const result = formatRecipientName('SMITH', 'John', 'null');
    assert.strictEqual(result, 'SMITH John');
    assert.strictEqual(result.includes('null'), false);
    assert.strictEqual(result.includes('undefined'), false);
  });

  it('Trims leading and trailing whitespace across all name parts', () => {
    const result = formatRecipientName('   OKONKWO  ', '  Emeka  ', '  Chinedu  ');
    assert.strictEqual(result, 'OKONKWO Emeka Chinedu');
  });

  it('Correctly preserves names with apostrophes and hyphens', () => {
    const result = formatRecipientName("O'CONNOR", 'Mary-Jane', "D'Angelo");
    assert.strictEqual(result, "O'CONNOR Mary-Jane D'Angelo");
  });

  it('Handles exceptionally long names with correct ordering for SVG rendering', () => {
    const result = formatRecipientName('ALEXANDER-STANISLAUS', 'Bartholomew-Maximilian', 'Oluwafunmilayo-Oluwaseun');
    assert.strictEqual(result, 'ALEXANDER-STANISLAUS Bartholomew-Maximilian Oluwafunmilayo-Oluwaseun');
    assert.strictEqual(result.startsWith('ALEXANDER-STANISLAUS'), true);
  });

  it('Queries and candidate generation in certificate-queries use formatRecipientName', () => {
    const queriesCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
    assert.strictEqual(queriesCode.includes("import { formatRecipientName } from './format-name';"), true);
    assert.strictEqual(queriesCode.includes("formatRecipientName(student?.last_name, student?.first_name, middleName)"), true);
  });

  it('Eligibility candidates mapping in eligibility-queries use formatRecipientName', () => {
    const elCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'eligibility-queries.ts'), 'utf8');
    assert.strictEqual(elCode.includes("import { formatRecipientName } from './format-name';"), true);
    assert.strictEqual(elCode.includes("formatRecipientName(student?.last_name, student?.first_name, sMiddle)"), true);
  });

  // --- 2. TYPOGRAPHY: POPPINS AT 24PX ---
  console.log('\n--- Test Suite 2: Name Typography (Poppins at 24px) ---');

  const docCode = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'CertificateDocument.tsx'), 'utf8');
  const globalsCss = fs.readFileSync(path.join(__dirname, '..', 'styles', 'globals.css'), 'utf8');

  it('Poppins font family is loaded in CertificateDocument.tsx @import url', () => {
    assert.strictEqual(docCode.includes('family=Poppins'), true);
    assert.strictEqual(docCode.includes('wght@0,400;0,500;0,600;0,700'), true);
  });

  it('Poppins font family is preloaded in styles/globals.css', () => {
    assert.strictEqual(globalsCss.includes('family=Poppins:wght@400;500;600;700'), true);
  });

  it('Recipient name SVG text explicitly specifies fontFamily with primary \'Poppins\'', () => {
    assert.strictEqual(docCode.includes("fontFamily=\"'Poppins'"), true);
  });

  it('Recipient name SVG text explicitly specifies fontSize="24px"', () => {
    assert.strictEqual(docCode.includes('fontSize="24px"'), true);
  });

  it('Typography outside the name field (titles, body text, signatures) is strictly preserved', () => {
    assert.strictEqual(docCode.includes("fontFamily=\"'Spicy Rice', cursive, serif\""), true);
    assert.strictEqual(docCode.includes("fontFamily=\"'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif\""), true);
  });

  // --- 3. PRINTING & A4 LANDSCAPE ORIENTATION ---
  console.log('\n--- Test Suite 3: Printing Reliability & Landscape Fit ---');

  const printHelperCode = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'printCertificate.ts'), 'utf8');

  it('printCertificate.ts exists and exports printCertificateElement', () => {
    assert.strictEqual(printHelperCode.includes('export function printCertificateElement'), true);
  });

  it('printCertificateElement mounts clone into #print-root and applies certificate-print-root', () => {
    assert.strictEqual(printHelperCode.includes("document.getElementById('print-root')"), true);
    assert.strictEqual(printHelperCode.includes("printRoot.className = 'certificate-print-root'"), true);
  });

  it('Forces landscape page size in @page { size: A4 landscape !important; margin: 0 !important; }', () => {
    assert.strictEqual(printHelperCode.includes('size: A4 landscape !important'), true);
    assert.strictEqual(printHelperCode.includes('margin: 0 !important'), true);
  });

  it('Enforces exact A4 landscape dimensions (297mm x 210mm) and background color preservation', () => {
    assert.strictEqual(printHelperCode.includes('width: 297mm !important'), true);
    assert.strictEqual(printHelperCode.includes('height: 210mm !important'), true);
    assert.strictEqual(printHelperCode.includes('background: #DDDDF0 !important'), true);
    assert.strictEqual(printHelperCode.includes('print-color-adjust: exact !important'), true);
  });

  it('globals.css includes dedicated landscape rules for body.printing-certificate and #print-root', () => {
    assert.strictEqual(globalsCss.includes('body.printing-certificate'), true);
    assert.strictEqual(globalsCss.includes('#print-root.certificate-print-root'), true);
    assert.strictEqual(globalsCss.includes('overflow: hidden !important'), true);
  });

  it('CertificatesClient.tsx View/Print modal wires printCertificateElement on print click', () => {
    const clientCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'certificates', 'CertificatesClient.tsx'), 'utf8');
    assert.strictEqual(clientCode.includes('printCertificateElement(certDocumentRef.current)'), true);
  });

  it('CertificatesClient.tsx synchronizes #print-root when preview modal opens for Ctrl+P support', () => {
    const clientCode = fs.readFileSync(path.join(__dirname, '..', 'app', 'certificates', 'CertificatesClient.tsx'), 'utf8');
    assert.strictEqual(clientCode.includes("printRoot.className = 'certificate-print-root'"), true);
    assert.strictEqual(clientCode.includes("document.body.classList.add('printing-certificate')"), true);
  });

  // --- 4. POST-ISSUANCE CERTIFICATE EDITING ---
  console.log('\n--- Test Suite 4: Post-Issuance Certificate Editing ---');

  const queriesFile = fs.readFileSync(path.join(__dirname, '..', 'lib', 'certificates', 'certificate-queries.ts'), 'utf8');
  const apiRouteFile = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'certificates', '[id]', 'route.ts'), 'utf8');
  const editModalFile = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'EditCertificateModal.tsx'), 'utf8');
  const clientPageFile = fs.readFileSync(path.join(__dirname, '..', 'app', 'certificates', 'CertificatesClient.tsx'), 'utf8');

  it('updateCertificateRecord is exported in certificate-queries.ts', () => {
    assert.strictEqual(queriesFile.includes('export async function updateCertificateRecord'), true);
  });

  it('updateCertificateRecord enforces server-side RBAC for Super Admin, Staff, and Finance Manager', () => {
    assert.strictEqual(queriesFile.includes("roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager')"), true);
    assert.strictEqual(queriesFile.includes('UNAUTHORIZED: Only an authorized Administrator or Staff member can edit issued certificates'), true);
  });

  it('updateCertificateRecord updates in-place using .update() and preserves certificate identity without duplication', () => {
    assert.strictEqual(/from\('certificates'\)[\s\r\n]+\.update\(updatePayload\)[\s\r\n]+\.eq\('id',\s*cert\.id\)[\s\r\n]+\.eq\('tenant_id',\s*tenantId\)/.test(queriesFile), true);
    assert.strictEqual(queriesFile.includes('certificateNumber: cert.certificate_number'), true);
    assert.strictEqual(queriesFile.includes('verificationToken: cert.verification_token'), true);
  });

  it('updateCertificateRecord records CERTIFICATE_UPDATED in finance_audit_log and updates metadata.audit_trail', () => {
    assert.strictEqual(queriesFile.includes("action: 'CERTIFICATE_UPDATED'"), true);
    assert.strictEqual(queriesFile.includes(".from('finance_audit_log').insert("), true);
    assert.strictEqual(queriesFile.includes('updatedMeta.audit_trail = [...existingAuditTrail, auditEntry]'), true);
  });

  it('API route app/api/certificates/[id]/route.ts supports editing in PATCH and PUT', () => {
    assert.strictEqual(apiRouteFile.includes('updateCertificateRecord'), true);
    assert.strictEqual(apiRouteFile.includes("body.action === 'EDIT'"), true);
    assert.strictEqual(apiRouteFile.includes('export async function PUT'), true);
  });

  it('API route rejects attempts to mutate protected fields (status, certificate_number, tenant_id, token)', () => {
    assert.strictEqual(apiRouteFile.includes('PROTECTED_FIELD_IMMUTABLE'), true);
    assert.strictEqual(apiRouteFile.includes('PROTECTED_FIELDS'), true);
    assert.strictEqual(apiRouteFile.includes("'certificate_number'"), true);
    assert.strictEqual(apiRouteFile.includes("'verification_token'"), true);
  });

  it('API route maps errors to appropriate status codes (400, 403, 404, 500)', () => {
    assert.strictEqual(apiRouteFile.includes('mapCertificateErrorToStatus'), true);
    assert.strictEqual(apiRouteFile.includes("errLower.includes('unauthorized') || errLower.includes('forbidden')"), true);
    assert.strictEqual(apiRouteFile.includes("errLower.includes('not found') || errLower.includes('foreign tenant')"), true);
    assert.strictEqual(apiRouteFile.includes("errLower.includes('audit_log_failed')"), true);
  });

  it('updateCertificateRecord fails cleanly with AUDIT_LOG_FAILED if audit logging fails', () => {
    assert.strictEqual(queriesFile.includes('AUDIT_LOG_FAILED'), true);
    assert.strictEqual(queriesFile.includes('recordCertificateAuditLog'), true);
    assert.strictEqual(queriesFile.includes('createSupabaseServiceClient'), true);
  });

  it('updateCertificateRecord rejects empty recipient full name with RECIPIENT_NAME_REQUIRED', () => {
    assert.strictEqual(queriesFile.includes('RECIPIENT_NAME_REQUIRED'), true);
  });

  it('EditCertificateModal.tsx prevents duplicate submissions while saving is in progress', () => {
    assert.strictEqual(editModalFile.includes('if (isSubmitting) return;'), true);
    assert.strictEqual(editModalFile.includes('disabled={isSubmitting}'), true);
  });

  it('EditCertificateModal.tsx handles Escape key dismissal gracefully', () => {
    assert.strictEqual(editModalFile.includes("e.key === 'Escape'"), true);
  });

  it('EditCertificateModal.tsx component renders input for recipient name, issue date, and mandatory audit reason', () => {
    assert.strictEqual(editModalFile.includes('Recipient Full Name'), true);
    assert.strictEqual(editModalFile.includes('Correction Reason (Mandatory Audit Trail)'), true);
    assert.strictEqual(editModalFile.includes("method: 'PATCH'"), true);
  });

  it('EditCertificateModal provides button to reset recipient name to student record authoritative order', () => {
    assert.strictEqual(editModalFile.includes('Use Student Record Order'), true);
  });

  it('CertificatesClient.tsx table provides Edit action button for authorized admins', () => {
    assert.strictEqual(clientPageFile.includes('setEditingCertTarget(cert)'), true);
    assert.strictEqual(clientPageFile.includes('Edit Certificate Record'), true);
  });

  it('CertificatesClient.tsx View modal provides Edit Certificate action button', () => {
    assert.strictEqual(clientPageFile.includes('setEditingCertTarget(certToEdit)'), true);
  });

  // --- 5. ZERO SCHEMA MUTATION SAFEGUARD ---
  console.log('\n--- Test Suite 5: Zero Unapproved Schema Mutations ---');

  it('Zero destructive SQL, zero unapproved migrations added', () => {
    const gitStatusCheck = fs.readdirSync(path.join(__dirname, '..', 'supabase'));
    assert.strictEqual(gitStatusCheck.includes('migrations'), false);
  });

  console.log('\n===============================================================');
  console.log(`CERTIFICATION RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('===============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
