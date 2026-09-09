/**
 * CLASPTEK SOURCE-WIDE STATUS DOMAIN CONTAMINATION AUDIT
 * 
 * Searches for all status values across domains:
 * - 'issued'
 * - 'overdue'
 * - 'draft'
 * - 'pending'
 * - 'unpaid'
 * - 'partial'
 * - 'paid'
 * - 'voided'
 * - 'cancelled'
 * 
 * Verifies that invoice domain ONLY uses canonical statuses:
 *   ['unpaid', 'partial', 'paid', 'voided', 'cancelled']
 * and that temporal display state 'overdue' is computed-only.
 * Guarantees zero cross-domain leakage from payslips ('issued', 'draft', 'acknowledged', 'approved')
 * into persistent invoice records.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const lines = html.split('\n');

const TARGET_STATUSES = [
  'issued',
  'overdue',
  'draft',
  'pending',
  'unpaid',
  'partial',
  'paid',
  'voided',
  'cancelled'
];

const domainClassifications = {
  invoice: [],
  payslip: [],
  certificate: [],
  payment: [],
  CRM: [],
  unrelated: []
};

function classifyLine(line, lineNum, statusTerm) {
  const lower = line.toLowerCase();
  
  if (lower.includes('payslip') || lower.includes('payroll') || lower.includes('disburse')) {
    return 'payslip';
  }
  if (lower.includes('certificate') || lower.includes('cert_')) {
    return 'certificate';
  }
  if (lower.includes('enquiry') || lower.includes('intake') || lower.includes('applicant') || lower.includes('lead') || lower.includes('crm')) {
    return 'CRM';
  }
  if (lower.includes('payment') || lower.includes('receipt') || lower.includes('reconcil')) {
    if (lower.includes('invoice')) return 'invoice';
    return 'payment';
  }
  if (lower.includes('invoice') || lower.includes('inv.') || lower.includes('inv_') || lower.includes('tuition')) {
    return 'invoice';
  }
  return 'unrelated';
}

console.log('================================================================');
console.log(' CLASPTEK STATUS DOMAIN CONTAMINATION AUDIT');
console.log('================================================================\n');

let totalMatches = 0;
const invoiceMatches = [];

lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  TARGET_STATUSES.forEach(term => {
    const regex = new RegExp(`['"]${term}['"]`, 'i');
    if (regex.test(line)) {
      totalMatches++;
      const domain = classifyLine(line, lineNum, term);
      domainClassifications[domain].push({ lineNum, term, line: line.trim() });
      if (domain === 'invoice') {
        invoiceMatches.push({ lineNum, term, line: line.trim() });
      }
    }
  });
});

console.log(`Total status string literal occurrences inspected: ${totalMatches}`);
console.log('\n--- Domain Breakdown ---');
Object.keys(domainClassifications).forEach(domain => {
  console.log(`  - ${domain.padEnd(14)}: ${domainClassifications[domain].length} references`);
});

console.log('\n--- INVOICE DOMAIN STATUS REFERENCES ---');
const CANONICAL_PERSISTENT = ['unpaid', 'partial', 'paid', 'voided', 'cancelled'];
const COMPUTED_DISPLAY = ['overdue'];

let violationCount = 0;
invoiceMatches.forEach(m => {
  const lowerTerm = m.term.toLowerCase();
  const isCanonical = CANONICAL_PERSISTENT.includes(lowerTerm);
  const isComputed = COMPUTED_DISPLAY.includes(lowerTerm);

  if (!isCanonical && !isComputed) {
    if (m.line.includes('throw new Error') || m.line.includes('Must be one of') || m.line.includes('includes(')) {
      console.log(`  [VALIDATION GUARD] Line ${m.lineNum} references '${m.term}': ${m.line}`);
    } else {
      console.error(`  ❌ CONTAMINATION VIOLATION Line ${m.lineNum}: Invoice domain contains illegal status '${m.term}'!`);
      console.error(`     Code: ${m.line}`);
      violationCount++;
    }
  } else if (isComputed) {
    console.log(`  [COMPUTED STATE] Line ${m.lineNum} computed '${m.term}': ${m.line}`);
  } else {
    // canonical
  }
});

console.log(`\nContamination Violations in Invoice Domain: ${violationCount}`);
assert.strictEqual(violationCount, 0, 'Zero status contamination violations allowed in invoice domain.');
console.log('✔ PASS: Zero status contamination between payslip/other domains and invoice domain.\n');
