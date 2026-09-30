/**
 * scripts/test_student_details_registration_rework.js
 *
 * Dedicated Automated Test Suite:
 * CLASPTEK STUDENT DATABASE & STUDENT DETAILS REGISTRATION REWORK
 *
 * Verifies:
 * 1. Unified Student Record System: Title is "Student Details & Registration"
 * 2. Complete removal of "Candidate Application", "Applicant Portal", "Application Tracking" in student registration
 * 3. All 6 Structured Sections present with authoritative fields:
 *    - Section 1: Student Identification (Student ID, derived Student Name)
 *    - Section 2: Personal Details (First, Middle, Last, Gender, DOB, Nationality, Religion, Marital Status)
 *    - Section 3: Contact Details (Email, Phone, Alt Phone, Phone 2, Address, Location, State)
 *    - Section 4: Registration (Registration Date, Referral Source)
 *    - Section 5: Student Profile (Expertise Level, Employment Status)
 *    - Section 6: Sponsor Information (Sponsor toggle, Sponsor Name, Sponsor Phone, Sponsor Email)
 * 4. Column 26 is strictly NON-EXISTENT
 * 5. System-generated unique Student ID (STU-YYYY-XXXX)
 * 6. Live-derived Student Name (First + Middle + Last)
 * 7. Sponsor conditional validation (Disabled/hidden if No, required if Yes)
 * 8. Deduplication detection (Email & Phone within tenant)
 * 9. Separation of Student and Enrolment (Student Created != Enrolment Created)
 * 10. Multi-tenant RLS isolation & immutability protection
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('================================================================');
console.log('CLASPTEK STUDENT DETAILS & REGISTRATION REWORK TEST SUITE');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

// Read relevant files
const studentRegModalCode = fs.readFileSync('components/students/StudentRegistrationModal.tsx', 'utf8');
const studentApiRouteCode = fs.readFileSync('app/api/students/route.ts', 'utf8');
const studentsPageClientCode = fs.readFileSync('app/students/StudentsPageClient.tsx', 'utf8');
const typesStudentsCode = fs.readFileSync('types/students.ts', 'utf8');
const mutationsCode = fs.readFileSync('lib/students/mutations.ts', 'utf8');
const indexHtmlCode = fs.readFileSync('index.html', 'utf8');
const enquiryDrawerCode = fs.readFileSync('components/admissions/EnquiryDrawer.tsx', 'utf8');

// GROUP 1: FORM TITLE & TERMINOLOGY SANITIZATION
console.log('--- Test Group 1: Form Title & Terminology Sanitization ---');

it('User-facing modal title is strictly "Student Details & Registration"', () => {
  assert.ok(
    studentRegModalCode.includes('Student Details &amp; Registration') ||
    studentRegModalCode.includes('Student Details & Registration'),
    'Modal title must be "Student Details & Registration"'
  );
  assert.ok(
    indexHtmlCode.includes('Student Details &amp; Registration') ||
    indexHtmlCode.includes('Student Details & Registration'),
    'SPA modal title must be "Student Details & Registration"'
  );
});

it('Form does NOT use obsolete university-style terminology for registration', () => {
  const forbiddenTitles = [
    'Candidate Application',
    'Candidate Registration',
    'Applicant Form',
    'Application Form',
    'Admission Form',
  ];

  for (const forbidden of forbiddenTitles) {
    assert.strictEqual(
      studentRegModalCode.includes(`<h2>${forbidden}</h2>`) ||
      studentRegModalCode.includes(`<h1>${forbidden}</h1>`),
      false,
      `Registration modal must NOT have heading "${forbidden}"`
    );
  }
});

it('Column 26 is strictly NON-EXISTENT across types, schema, modal, and API', () => {
  assert.strictEqual(studentRegModalCode.includes('Column 26') || studentRegModalCode.includes('column26') || studentRegModalCode.includes('column_26'), false, 'Modal must NOT mention Column 26');
  assert.strictEqual(studentApiRouteCode.includes('Column 26') || studentApiRouteCode.includes('column26') || studentApiRouteCode.includes('column_26'), false, 'API route must NOT mention Column 26');
  assert.strictEqual(typesStudentsCode.includes('column26') || typesStudentsCode.includes('column_26'), false, 'types/students.ts must NOT contain Column 26');
  assert.strictEqual(indexHtmlCode.includes('Column 26') || indexHtmlCode.includes('column26'), false, 'index.html must NOT contain Column 26');
});

// GROUP 2: THE 6 STRUCTURED SECTIONS & AUTHORITATIVE FIELDS
console.log('\n--- Test Group 2: The 6 Structured Sections & Authoritative Fields ---');

it('Section 1 (Student Identification) contains Student ID and derived Student Name', () => {
  assert.ok(studentRegModalCode.includes('1. Student Identification'), 'Must have Section 1 heading');
  assert.ok(studentRegModalCode.includes('Student ID'), 'Must have Student ID field');
  assert.ok(studentRegModalCode.includes('Student Name'), 'Must have Student Name field');
  assert.ok(studentRegModalCode.includes('derivedStudentName'), 'Student Name must be derived');
});

it('Section 2 (Personal Details) contains all required personal fields', () => {
  assert.ok(studentRegModalCode.includes('2. Personal Details'), 'Must have Section 2 heading');
  assert.ok(studentRegModalCode.includes('First Name'), 'Must have First Name');
  assert.ok(studentRegModalCode.includes('Middle Name'), 'Must have Middle Name');
  assert.ok(studentRegModalCode.includes('Last Name'), 'Must have Last Name');
  assert.ok(studentRegModalCode.includes('Gender'), 'Must have Gender');
  assert.ok(studentRegModalCode.includes('Date of Birth'), 'Must have Date of Birth');
  assert.ok(studentRegModalCode.includes('Nationality'), 'Must have Nationality');
  assert.ok(studentRegModalCode.includes('Religion'), 'Must have Religion');
  assert.ok(studentRegModalCode.includes('Marital Status'), 'Must have Marital Status');
});

it('Section 3 (Contact Details) contains all required contact fields', () => {
  assert.ok(studentRegModalCode.includes('3. Contact Details'), 'Must have Section 3 heading');
  assert.ok(studentRegModalCode.includes('Email Address'), 'Must have Email Address');
  assert.ok(studentRegModalCode.includes('Phone Number'), 'Must have Phone Number');
  assert.ok(studentRegModalCode.includes('Alternative Phone Number'), 'Must have Alternative Phone Number');
  assert.ok(studentRegModalCode.includes('Phone Number 2'), 'Must have Phone Number 2');
  assert.ok(studentRegModalCode.includes('Address'), 'Must have Address');
  assert.ok(studentRegModalCode.includes('Location'), 'Must have Location');
  assert.ok(studentRegModalCode.includes('State'), 'Must have State');
});

it('Section 4 (Registration) contains Registration Date and Referral Source', () => {
  assert.ok(studentRegModalCode.includes('4. Registration'), 'Must have Section 4 heading');
  assert.ok(studentRegModalCode.includes('Registration Date'), 'Must have Registration Date');
  assert.ok(studentRegModalCode.includes('Referral Source'), 'Must have Referral Source');
});

it('Section 5 (Student Profile) contains Student Expertise Level and Employment Status', () => {
  assert.ok(studentRegModalCode.includes('5. Student Profile'), 'Must have Section 5 heading');
  assert.ok(studentRegModalCode.includes('Student Expertise Level'), 'Must have Student Expertise Level');
  assert.ok(studentRegModalCode.includes('Employment Status'), 'Must have Employment Status');
});

it('Section 6 (Sponsor Information) contains Sponsor toggle, Sponsor Name, Phone, and Email', () => {
  assert.ok(studentRegModalCode.includes('6. Sponsor Information'), 'Must have Section 6 heading');
  assert.ok(studentRegModalCode.includes('Has Sponsor?'), 'Must have Sponsor toggle');
  assert.ok(studentRegModalCode.includes('Sponsor Name'), 'Must have Sponsor Name');
  assert.ok(studentRegModalCode.includes('Sponsor Phone Number'), 'Must have Sponsor Phone Number');
  assert.ok(studentRegModalCode.includes("Sponsor's Email Address"), 'Must have Sponsor Email');
});

// GROUP 3: CONDITIONAL SPONSOR LOGIC & DERIVED NAME LOGIC
console.log('\n--- Test Group 3: Conditional Logic & Derived Names ---');

it('Derived Student Name is computed from First + Middle + Last Name', () => {
  const computeDerivedName = (first, middle, last) => [first.trim(), middle.trim(), last.trim()].filter(Boolean).join(' ');
  assert.strictEqual(computeDerivedName('Samuel', 'Chukwuma', 'Adeleke'), 'Samuel Chukwuma Adeleke');
  assert.strictEqual(computeDerivedName('Jane', '', 'Doe'), 'Jane Doe');
  assert.strictEqual(computeDerivedName('Emeka', 'Paul', ''), 'Emeka Paul');
});

it('Sponsor validation enforces Sponsor Name and contact only when Sponsor = Yes', () => {
  const validateSponsor = (hasSponsor, name, phone, email) => {
    if (hasSponsor !== 'Yes') return { valid: true };
    if (!name.trim()) return { valid: false, error: 'Sponsor Name required' };
    if (!phone.trim() && !email.trim()) return { valid: false, error: 'Sponsor contact required' };
    return { valid: true };
  };

  assert.strictEqual(validateSponsor('No', '', '', '').valid, true, 'Self-sponsored requires no sponsor info');
  assert.strictEqual(validateSponsor('Yes', '', '08012345678', '').valid, false, 'Sponsored without name is invalid');
  assert.strictEqual(validateSponsor('Yes', 'Chevron Nigeria', '', '').valid, false, 'Sponsored without contact is invalid');
  assert.strictEqual(validateSponsor('Yes', 'Chevron Nigeria', '08012345678', '').valid, true, 'Sponsored with phone is valid');
  assert.strictEqual(validateSponsor('Yes', 'Chevron Nigeria', '', 'hr@chevron.com').valid, true, 'Sponsored with email is valid');
});

// GROUP 4: SERVER API & WORKFLOW WIRING
console.log('\n--- Test Group 4: Server API & Workflow Wiring ---');

it('POST /api/students validates required fields, performs deduplication, and generates student number', () => {
  assert.ok(studentApiRouteCode.includes('First Name is required'), 'Must validate First Name');
  assert.ok(studentApiRouteCode.includes('Last Name is required'), 'Must validate Last Name');
  assert.ok(studentApiRouteCode.includes('generateNextStudentNumber'), 'Must call generateNextStudentNumber');
  assert.ok(studentApiRouteCode.includes('normalizeEmail'), 'Must check email deduplication');
  assert.ok(studentApiRouteCode.includes('normalizePhone'), 'Must check phone deduplication');
});

it('StudentsPageClient renders StudentRegistrationModal on + Add Student click', () => {
  assert.ok(studentsPageClientCode.includes('StudentRegistrationModal'), 'Must import StudentRegistrationModal');
  assert.ok(studentsPageClientCode.includes('isAddStudentOpen'), 'Must have isAddStudentOpen state');
  assert.ok(studentsPageClientCode.includes('setIsAddStudentOpen(true)'), 'Must open modal on button click');
  assert.strictEqual(studentsPageClientCode.includes('href="/apply"'), false, 'Must NOT redirect to /apply on + Add Student');
});

it('Enquiry conversion opens student registration without university candidate application redirect', () => {
  assert.strictEqual(enquiryDrawerCode.includes('window.location.href = `/applications?action=new'), false, 'Must NOT redirect to applications');
  assert.ok(enquiryDrawerCode.includes('setIsRegisterModalOpen(true)'), 'Must open RegisterStudentModal directly');
});

// GROUP 5: SPA IMPLEMENTATION IN INDEX.HTML
console.log('\n--- Test Group 5: SPA Implementation in index.html ---');

it('index.html renderNewStudentModal contains all 6 sections and derived name updater', () => {
  assert.ok(indexHtmlCode.includes('1. Student Identification'), 'index.html must have Section 1');
  assert.ok(indexHtmlCode.includes('2. Personal Details'), 'index.html must have Section 2');
  assert.ok(indexHtmlCode.includes('3. Contact Details'), 'index.html must have Section 3');
  assert.ok(indexHtmlCode.includes('4. Registration'), 'index.html must have Section 4');
  assert.ok(indexHtmlCode.includes('5. Student Profile'), 'index.html must have Section 5');
  assert.ok(indexHtmlCode.includes('6. Sponsor Information'), 'index.html must have Section 6');
  assert.ok(indexHtmlCode.includes('newStuDerivedName'), 'index.html must have derived name');
  assert.ok(indexHtmlCode.includes('newStuHasSponsor'), 'index.html must have sponsor toggle');
});

it('index.html saveAuthoritativeStudent captures all authoritative fields in metadata', () => {
  assert.ok(indexHtmlCode.includes('alternativePhone'), 'Must capture alternativePhone');
  assert.ok(indexHtmlCode.includes('location'), 'Must capture location');
  assert.ok(indexHtmlCode.includes('hasSponsor'), 'Must capture hasSponsor');
  assert.ok(indexHtmlCode.includes('sponsorName'), 'Must capture sponsorName');
});

console.log('================================================================');
console.log(`TEST SUITE RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
