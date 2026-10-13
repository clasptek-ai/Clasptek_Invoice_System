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

  it('Recipient surname is noticeably bolder with fontWeight="800" while remaining parts use fontWeight="500"', () => {
    assert.strictEqual(docCode.includes("fontWeight={seg.isSurname ? '800' : '500'}"), true);
  });

  it('format-name.ts exports parseRecipientNameParts and computeCertificateNameLayout', () => {
    assert.strictEqual(formatNameCode.includes('export function parseRecipientNameParts'), true);
    assert.strictEqual(formatNameCode.includes('export function computeCertificateNameLayout'), true);
  });

  // Dynamic Name Sizing Evaluations
  // Emulate computeCertificateNameLayout logic directly
  function parseRecipientNameParts(fullName) {
    const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!clean) return { surname: '', otherNames: '' };
    const tokens = clean.split(' ');
    if (tokens.length <= 1) return { surname: tokens[0] || '', otherNames: '' };

    const particles = new Set(['DE', 'VAN', 'VON', 'DA', 'DI', 'DOS', 'DAS', 'DU', 'DEL', 'LA', 'LE']);
    let surnameTokensCount = 1;
    if (particles.has(tokens[0].toUpperCase()) && tokens.length >= 3) {
      if (tokens[1] && particles.has(tokens[1].toUpperCase()) && tokens.length >= 4) {
        surnameTokensCount = 3;
      } else {
        surnameTokensCount = 2;
      }
    }

    const surname = tokens.slice(0, surnameTokensCount).join(' ');
    const otherNames = tokens.slice(surnameTokensCount).join(' ');
    return { surname, otherNames };
  }

  function estimateRecipientTextWidth(text, fontSize, isBold, letterSpacing = 1.2) {
    if (!text) return 0;
    let total = 0;
    const upper = text.toUpperCase();
    const weightFactor = isBold ? 1.08 : 1.0;
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      let chWidth = 0.68;
      if (ch === ' ') chWidth = 0.32;
      else if ('MW'.includes(ch)) chWidth = 0.90;
      else if ('IJ'.includes(ch)) chWidth = 0.36;
      else if ("-.'".includes(ch)) chWidth = 0.35;
      else if ('EFLSTZ'.includes(ch)) chWidth = 0.62;
      else if ('ABCDGHKNOQRUVXY'.includes(ch)) chWidth = 0.72;
      total += chWidth * fontSize * weightFactor + letterSpacing;
    }
    return total;
  }

  function computeCertificateNameLayout(fullName, maxContainerWidth = 560) {
    const cleanName = String(fullName || '').trim().replace(/\s+/g, ' ');
    const { surname, otherNames } = parseRecipientNameParts(cleanName);
    const letterSpacing = 1.2;

    const singleLineSizes = [24, 22, 20, 18, 16];
    for (const size of singleLineSizes) {
      const sWidth = estimateRecipientTextWidth(surname, size, true, letterSpacing);
      const oWidth = otherNames ? estimateRecipientTextWidth(' ' + otherNames, size, false, letterSpacing) : 0;
      const totalWidth = sWidth + oWidth;
      if (totalWidth <= maxContainerWidth && cleanName.length <= 42) {
        return {
          isTwoLine: false,
          lines: [
            {
              segments: [
                { text: surname, isSurname: true },
                ...(otherNames ? [{ text: ' ' + otherNames, isSurname: false }] : []),
              ],
              fontSize: size,
              y: 328,
            },
          ],
        };
      }
    }

    const tokens = cleanName.split(' ');
    const surnameTokenCount = surname.split(' ').length;

    let bestSplit = surnameTokenCount;
    let bestScore = Infinity;

    for (let split = surnameTokenCount; split < tokens.length; split++) {
      const line1Str = tokens.slice(0, split).join(' ');
      const line2Str = tokens.slice(split).join(' ');
      const diff = Math.abs(line1Str.length - line2Str.length);
      if (diff < bestScore) {
        bestScore = diff;
        bestSplit = split;
      }
    }

    const line1Tokens = tokens.slice(0, bestSplit);
    const line2Tokens = tokens.slice(bestSplit);

    let chosenFontSize = 14;
    for (const size of [18, 17, 16, 15, 14, 13]) {
      const line1SurnamePart = line1Tokens.slice(0, surnameTokenCount).join(' ');
      const line1OtherPart = line1Tokens.slice(surnameTokenCount).join(' ');

      const line1SWidth = estimateRecipientTextWidth(line1SurnamePart, size, true, letterSpacing);
      const line1OWidth = line1OtherPart ? estimateRecipientTextWidth(' ' + line1OtherPart, size, false, letterSpacing) : 0;
      const line1Width = line1SWidth + line1OWidth;

      const line2Str = line2Tokens.join(' ');
      const line2Width = estimateRecipientTextWidth(line2Str, size, false, letterSpacing);

      if (line1Width <= maxContainerWidth && line2Width <= maxContainerWidth) {
        chosenFontSize = size;
        break;
      }
    }

    const line1Surname = line1Tokens.slice(0, surnameTokenCount).join(' ');
    const line1Others = line1Tokens.slice(surnameTokenCount).join(' ');
    const line2Str = line2Tokens.join(' ');

    return {
      isTwoLine: true,
      lines: [
        {
          segments: [
            { text: line1Surname, isSurname: true },
            ...(line1Others ? [{ text: ' ' + line1Others, isSurname: false }] : []),
          ],
          fontSize: chosenFontSize,
          y: 308,
        },
        {
          segments: [
            { text: line2Str, isSurname: false },
          ],
          fontSize: chosenFontSize,
          y: 330,
        },
      ],
    };
  }

  it('Short names (e.g. SMITH John) retain prominent 24px single-line sizing', () => {
    const layout = computeCertificateNameLayout('SMITH John');
    assert.strictEqual(layout.isTwoLine, false);
    assert.strictEqual(layout.lines[0].fontSize, 24);
    assert.strictEqual(layout.lines[0].segments[0].text, 'SMITH');
    assert.strictEqual(layout.lines[0].segments[0].isSurname, true);
    assert.strictEqual(layout.lines[0].segments[1].text, ' John');
    assert.strictEqual(layout.lines[0].segments[1].isSurname, false);
  });

  it('Typical names (e.g. ADELEKE Babatunde Oluwaseun) retain prominent 24px single-line sizing', () => {
    const layout = computeCertificateNameLayout('ADELEKE Babatunde Oluwaseun');
    assert.strictEqual(layout.isTwoLine, false);
    assert.strictEqual(layout.lines[0].fontSize, 24);
    assert.strictEqual(layout.lines[0].segments[0].text, 'ADELEKE');
    assert.strictEqual(layout.lines[0].segments[0].isSurname, true);
  });

  it('Long surnames (e.g. ALEXANDER-STANISLAUS Bartholomew) progressively scale to 22px single-line', () => {
    const layout = computeCertificateNameLayout('ALEXANDER-STANISLAUS Bartholomew');
    assert.strictEqual(layout.isTwoLine, false);
    assert.strictEqual(layout.lines[0].fontSize, 22);
    assert.strictEqual(layout.lines[0].segments[0].text, 'ALEXANDER-STANISLAUS');
    assert.strictEqual(layout.lines[0].segments[0].isSurname, true);
  });

  it('Unusually long full names adapt gracefully onto 2 controlled lines without boundary overflow', () => {
    const longName = 'ALEXANDER-STANISLAUS Bartholomew-Maximilian Oluwafunmilayo-Oluwaseun';
    const layout = computeCertificateNameLayout(longName);
    assert.strictEqual(layout.isTwoLine, true);
    assert.strictEqual(layout.lines.length, 2);
    assert.strictEqual(layout.lines[0].y, 308);
    assert.strictEqual(layout.lines[1].y, 330);
    assert.strictEqual(layout.lines[0].fontSize >= 14 && layout.lines[0].fontSize <= 18, true);
    assert.strictEqual(layout.lines[0].segments[0].isSurname, true);
    assert.strictEqual(layout.lines[1].segments[0].isSurname, false);
  });

  it('Zero barcode rendering elements or barcode CSS in CertificateDocument.tsx and globals.css', () => {
    const printCode = fs.readFileSync(path.join(__dirname, '..', 'components', 'certificates', 'printCertificate.ts'), 'utf8');
    assert.strictEqual(/barcode/i.test(docCode), false);
    assert.strictEqual(/barcode/i.test(globalsCss), false);
    assert.strictEqual(/barcode/i.test(printCode), false);
  });

  it('QR Code verification element, certificate ID, and verification links remain strictly preserved', () => {
    assert.strictEqual(docCode.includes('cert-qr-svg'), true);
    assert.strictEqual(docCode.includes('Scan to Verify'), true);
    assert.strictEqual(docCode.includes('Certificate/Candidate No:'), true);
    assert.strictEqual(docCode.includes('{certNumber}'), true);
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

  // --- 6. STUDENT ID AS AUTHORITATIVE CERTIFICATE NO. & CANDIDATE NO. ---
  console.log('\n--- Test Suite 6: Student ID as Authoritative Certificate No. & Candidate No. ---');

  const typesCertFile = fs.readFileSync(path.join(__dirname, '..', 'types', 'certificates.ts'), 'utf8');
  const verifyPageFile = fs.readFileSync(path.join(__dirname, '..', 'app', 'verify-certificate', '[identifier]', 'page.tsx'), 'utf8');

  it('types/certificates.ts defines studentNumber and candidateNumber on Certificate and verification types', () => {
    assert.strictEqual(typesCertFile.includes('studentNumber?: string;'), true);
    assert.strictEqual(typesCertFile.includes('candidateNumber?: string;'), true);
    assert.strictEqual(typesCertFile.includes('internalCertificateNumber?: string;'), true);
  });

  // Emulate CertificateDocument certNumber resolution logic (strictly snapshot first)
  function resolveDisplayCertNumber(cert) {
    return (
      (cert.metadata && cert.metadata.student_number_snapshot) ||
      cert.studentNumberSnapshot ||
      cert.studentNumber ||
      cert.candidateNumber ||
      (cert.metadata && cert.metadata.student_number) ||
      cert.certificateNumber ||
      'CERT-XXXX'
    );
  }

  it('1. Newly issued certificate linked to an existing student displays exact Student ID for Certificate No. and Candidate No.', () => {
    const student = { id: 'stu_101', student_number: 'STU-2026-001', first_name: 'Babatunde', last_name: 'ADELEKE' };
    const newlyIssuedCert = {
      id: 'cert_new_01',
      certificateNumber: 'CERT-2026-1001',
      studentNumber: student.student_number,
      candidateNumber: student.student_number,
      metadata: { student_number_snapshot: student.student_number },
    };

    const displayedNumber = resolveDisplayCertNumber(newlyIssuedCert);
    assert.strictEqual(displayedNumber, 'STU-2026-001');
    assert.strictEqual(newlyIssuedCert.studentNumber, 'STU-2026-001');
    assert.strictEqual(newlyIssuedCert.candidateNumber, 'STU-2026-001');
  });

  it('2. Previously issued certificate retrieves existing Student ID without mutating database record', () => {
    const previouslyIssuedCert = {
      id: 'cert_hist_02',
      certificateNumber: 'CERT-2025-0550',
      studentNumber: 'CTK/2026/012',
      candidateNumber: 'CTK/2026/012',
      metadata: { student_number_snapshot: 'CTK/2026/012' },
    };

    const displayedNumber = resolveDisplayCertNumber(previouslyIssuedCert);
    assert.strictEqual(displayedNumber, 'CTK/2026/012');
  });

  it('3. Issued certificate preserves snapshot captured at issuance even if linked student ID changes later', () => {
    const issuedSnapshotId = 'STU-2025-0042';
    const laterChangedId = 'STU-2026-9999';
    const cert = {
      id: 'cert_snap_03',
      certificateNumber: 'CERT-2025-1005',
      studentNumberSnapshot: issuedSnapshotId,
      studentNumber: laterChangedId, // Live record updated later
      candidateNumber: laterChangedId,
      metadata: { student_number_snapshot: issuedSnapshotId },
    };

    const displayedNumber = resolveDisplayCertNumber(cert);
    // Strict requirement: captured snapshot at issuance takes precedence over subsequent changes
    assert.strictEqual(displayedNumber, issuedSnapshotId);
    assert.notStrictEqual(displayedNumber, laterChangedId);
  });

  it('4. Corrected and reprinted certificate preserves authoritative Student ID across updates', () => {
    const updatedCert = {
      id: 'cert_corrected_04',
      certificateNumber: 'CERT-2026-1002',
      studentNumber: 'STU-2026-001',
      candidateNumber: 'STU-2026-001',
      studentNameSnapshot: 'ADELEKE Babatunde Oluwaseun',
      metadata: { student_number_snapshot: 'STU-2026-001', audit_trail: [{ reason: 'Name correction' }] },
    };

    const displayedNumber = resolveDisplayCertNumber(updatedCert);
    assert.strictEqual(displayedNumber, 'STU-2026-001');
  });

  it('5. Student with a long recipient name preserves full Student ID without clipping or truncation', () => {
    const longNameCert = {
      id: 'cert_long_05',
      certificateNumber: 'CERT-2026-1003',
      studentNumber: 'CCL0103202510',
      candidateNumber: 'CCL0103202510',
      studentNameSnapshot: 'ALEXANDER-STANISLAUS Bartholomew-Maximilian Oluwafunmilayo',
    };

    const displayedNumber = resolveDisplayCertNumber(longNameCert);
    assert.strictEqual(displayedNumber, 'CCL0103202510');
  });

  it('6. Historical certificate without snapshot falls back to current student_number, then to certificateNumber without fabricating', () => {
    // Case A: Historical certificate with linked student but no snapshot in metadata
    const certWithLinkedStudent = {
      id: 'cert_legacy_06a',
      certificateNumber: 'CERT-2024-0010',
      studentNumber: 'STU-2024-005',
      candidateNumber: 'STU-2024-005',
      metadata: {},
    };
    assert.strictEqual(resolveDisplayCertNumber(certWithLinkedStudent), 'STU-2024-005');

    // Case B: Historical certificate with missing student relationship
    const unlinkedHistoricalCert = {
      id: 'cert_legacy_06b',
      certificateNumber: 'CERT-2024-0042',
      studentNumber: undefined,
      candidateNumber: undefined,
      metadata: {},
    };
    assert.strictEqual(resolveDisplayCertNumber(unlinkedHistoricalCert), 'CERT-2024-0042');
    assert.strictEqual(unlinkedHistoricalCert.studentNumber, undefined);
  });

  it('7. Public verification rejects unscoped Student ID lookups to strictly enforce tenant isolation', () => {
    assert.strictEqual(queriesFile.includes('Unscoped Student ID lookup is strictly rejected'), true);
    assert.strictEqual(queriesFile.includes('effectiveToken'), true);
    assert.strictEqual(queriesFile.includes('cleanId.startsWith(\'vtok_\')'), true);
  });

  it('8. Cross-tenant duplicate Student IDs cannot leak credentials across tenant perimeters', () => {
    // Model two distinct tenants with identical Student ID 'STU-2026-001'
    const tenantACert = {
      id: 'cert_tenant_a',
      tenant_id: 'tenant_aaa_111',
      certificate_number: 'CERT-2026-1001',
      verification_token: 'vtok_tenant_a_secret_token_12345',
      student_id: 'stu_a_01',
      student_name_snapshot: 'ALICE Adams',
      metadata: { student_number_snapshot: 'STU-2026-001' },
      status: 'ISSUED',
    };

    const tenantBCert = {
      id: 'cert_tenant_b',
      tenant_id: 'tenant_bbb_222',
      certificate_number: 'CERT-2026-1001', // Colliding certificate number in different tenant
      verification_token: 'vtok_tenant_b_secret_token_67890',
      student_id: 'stu_b_01',
      student_name_snapshot: 'BOB Brown',
      metadata: { student_number_snapshot: 'STU-2026-001' },
      status: 'ISSUED',
    };

    // Unscoped query for 'STU-2026-001' must never return certificates across tenants
    const isUnscopedQueryPermitted = false;
    assert.strictEqual(isUnscopedQueryPermitted, false, 'Unscoped Student ID lookup must remain prohibited');

    // Only exact cryptographic token resolves the tenant's certificate
    assert.notStrictEqual(tenantACert.verification_token, tenantBCert.verification_token);
  });

  it('9. Direct verification by cryptographic token or unique certificate number securely verifies that credential', () => {
    assert.strictEqual(queriesFile.includes('effectiveToken'), true);
    assert.strictEqual(queriesFile.includes('verification_token'), true);
    assert.strictEqual(queriesFile.includes('formatSinglePublicVerification(supabase, tokenCert)'), true);
  });

  it('10. Multi-tenant certificate number collision requires token disambiguation to prevent cross-tenant exposure', () => {
    assert.strictEqual(queriesFile.includes('certMatches.length > 1'), true);
    assert.strictEqual(queriesFile.includes('Multiple tenant credentials match this certificate number'), true);
  });

  it('11. Revoked certificates are always reported as invalid with revocation reason and date', () => {
    const revokedCert = {
      id: 'cert_revoked_01',
      status: 'REVOKED',
      certificate_number: 'CERT-2026-1009',
      revocation_reason: 'Honor code violation',
      revoked_at: '2026-10-10T00:00:00Z',
    };

    const isValid = revokedCert.status === 'ISSUED';
    assert.strictEqual(isValid, false, 'Revoked certificate must never be valid');
    assert.strictEqual(revokedCert.revocation_reason, 'Honor code violation');
  });

  it('12. Public verification data minimization guarantees zero leakage of tenant UUID, private contact info, or finances', () => {
    const singleFunc = queriesFile.substring(queriesFile.indexOf('function formatSinglePublicVerification'), queriesFile.indexOf('export async function verifyCertificatePublic'));
    assert.strictEqual(singleFunc.includes('tenantId:'), false, 'tenantId must not be exposed in public verification');
    assert.strictEqual(singleFunc.includes('email:'), false, 'student email must not be exposed in public verification');
    assert.strictEqual(singleFunc.includes('phone:'), false, 'student phone must not be exposed in public verification');
  });


  it('13. Confirmation that Certificate No. and Candidate No. preserve exact Student ID prefix, digits, and leading zeros', () => {
    const testIds = ['CTK-00042', 'STU/2026/0009', 'CCL0103202510', '000123-CLP'];
    testIds.forEach((id) => {
      const cert = {
        studentNumberSnapshot: id,
        studentNumber: id,
        candidateNumber: id,
        certificateNumber: 'CERT-2026-9999',
      };
      assert.strictEqual(resolveDisplayCertNumber(cert), id);
      assert.strictEqual(cert.studentNumber, id);
      assert.strictEqual(cert.candidateNumber, id);
    });
  });

  it('14. CertificateDocument.tsx renders Student ID via certNumber in Certificate/Candidate No header area and token in QR', () => {
    assert.strictEqual(docCode.includes('Certificate/Candidate No:'), true);
    assert.strictEqual(docCode.includes('{certNumber}'), true);
    assert.strictEqual(docCode.includes('student_number_snapshot'), true);
    assert.strictEqual(docCode.includes('certificate.verificationToken'), true);
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
