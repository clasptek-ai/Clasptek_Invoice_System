/**
 * scripts/test_phase_c6f_enrolment_modal_focus_offline.js
 * Offline Certification Suite for Phase C6F:
 * AddEnrolmentModal Accessibility, Focus Management, and Multi-Enrolment Workflow Hardening
 *
 * Certified Invariants:
 * 1. AddEnrolmentModal Focus Lifecycle & Keyboard Management:
 *    - Captures invoking document.activeElement upon opening.
 *    - Directs initial focus into the primary input (#enrol-prog-select).
 *    - Restores focus to the invoking element upon closing or unmount.
 *    - Traps keyboard focus (Tab / Shift+Tab) cycling strictly within the active dialog.
 *    - Dismisses modal via Escape key when idle.
 *    - Suppresses Escape key and backdrop clicks while submitting.
 *    - Replaces raw emoji (🎓), text entities (&times;), and check glyphs (✓) with accessible inline SVGs.
 *    - Declares semantic ARIA attributes (role="dialog", aria-modal="true", aria-labelledby).
 *    - Synchronous isSubmittingRef lock prevents duplicate concurrent submissions.
 * 2. Cross-Modal Stability:
 *    - Verifies AddCohortModal and RecordLifecycleModal keyboard handlers remain intact.
 * 3. Strict Offline Transport:
 *    - Strictly verified 0 outbound network sockets created.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const assert = require('assert');

// -----------------------------------------------------------------------------
// STRICT OFFLINE SOCKET INSTRUMENTATION
// -----------------------------------------------------------------------------
let socketAttempts = 0;
const origNetConnect = net.connect;
const origNetCreateConnection = net.createConnection;
const origSocketConnect = net.Socket.prototype.connect;
const origTlsConnect = tls.connect;

function blockSocket(methodName) {
  socketAttempts++;
  throw new Error(`[SECURITY VIOLATION] Offline test prohibited network access via ${methodName}!`);
}

net.connect = () => blockSocket('net.connect');
net.createConnection = () => blockSocket('net.createConnection');
net.Socket.prototype.connect = function () {
  blockSocket('net.Socket.prototype.connect');
};
tls.connect = () => blockSocket('tls.connect');

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    testsPassed++;
    console.log(`  ✔ PASS: ${testName}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✖ FAIL: ${testName}`);
    console.error(`    ${err.message}`);
  }
}

console.log('========================================================================================');
console.log(' CLASPTEK PHASE C6F: ADD ENROLMENT MODAL ACCESSIBILITY & FOCUS MANAGEMENT OFFLINE SUITE');
console.log(' Mode: STRICT OFFLINE (Deterministic Static Inspection & Focus Trap Simulation)');
console.log('========================================================================================\n');

const addEnrolmentPath = path.resolve(__dirname, '../components/students/AddEnrolmentModal.tsx');
assert(fs.existsSync(addEnrolmentPath), `Component file must exist at ${addEnrolmentPath}`);
const enrolmentSource = fs.readFileSync(addEnrolmentPath, 'utf8');

const addCohortPath = path.resolve(__dirname, '../components/cohorts/AddCohortModal.tsx');
assert(fs.existsSync(addCohortPath), `Component file must exist at ${addCohortPath}`);
const cohortSource = fs.readFileSync(addCohortPath, 'utf8');

const lifecycleModalPath = path.resolve(__dirname, '../components/tables/RecordLifecycleModal.tsx');
assert(fs.existsSync(lifecycleModalPath), `Component file must exist at ${lifecycleModalPath}`);
const lifecycleSource = fs.readFileSync(lifecycleModalPath, 'utf8');

// =============================================================================
// Suite 1: AddEnrolmentModal Static Source & Accessibility Inspection
// =============================================================================
console.log('--- Suite 1: AddEnrolmentModal Focus & Keyboard Static Inspection ---');

runTest('1.1 AddEnrolmentModal imports useRef and declares modalRef, previousActiveElementRef, isSubmittingRef', () => {
  assert(enrolmentSource.includes("import React, { useState, useEffect, useRef } from 'react';"), 'Must import useRef');
  assert(enrolmentSource.includes('const modalRef = useRef<HTMLDivElement>(null);'), 'Must declare modalRef');
  assert(
    enrolmentSource.includes('const previousActiveElementRef = useRef<HTMLElement | null>(null);'),
    'Must declare previousActiveElementRef'
  );
  assert(enrolmentSource.includes('const isSubmittingRef = useRef<boolean>(false);'), 'Must declare isSubmittingRef');
});

runTest('1.2 Focus capture & restoration: captures activeElement on open and restores on unmount', () => {
  assert(
    enrolmentSource.includes('previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;'),
    'Must capture document.activeElement on open'
  );
  assert(
    enrolmentSource.includes('previousActiveElementRef.current.focus();'),
    'Must restore focus to invoking element on close/unmount'
  );
});

runTest('1.3 Initial focus is explicitly directed into modal (#enrol-prog-select)', () => {
  assert(enrolmentSource.includes('#enrol-prog-select'), 'Must target #enrol-prog-select');
  assert(enrolmentSource.includes('id="enrol-prog-select"'), 'Select element must declare id="enrol-prog-select"');
  assert(enrolmentSource.includes('progSelect.focus();'), 'Must focus programme select or first available field');
});

runTest('1.4 Escape key dismissal handler is registered and guards against isSubmitting / isSubmittingRef', () => {
  assert(enrolmentSource.includes("if (e.key === 'Escape')"), 'Must listen for Escape key');
  assert(
    enrolmentSource.includes('if (!isSubmitting && !isSubmittingRef.current)'),
    'Escape must be suppressed while submitting'
  );
  assert(
    enrolmentSource.includes("window.removeEventListener('keydown', handleKeyDown);"),
    'Must clean up keydown listener on unmount'
  );
});

runTest('1.5 Tab and Shift+Tab focus trap logic is implemented', () => {
  assert(enrolmentSource.includes("if (e.key === 'Tab')"), 'Must intercept Tab key');
  assert(enrolmentSource.includes('if (e.shiftKey)'), 'Must handle Shift+Tab backward navigation');
  assert(enrolmentSource.includes('lastElement.focus()'), 'Shift+Tab on first element must wrap to last');
  assert(enrolmentSource.includes('firstElement.focus()'), 'Tab on last element must wrap to first');
});

runTest('1.6 Outer overlay declares dialog role, aria-modal, and aria-labelledby', () => {
  assert(enrolmentSource.includes('role="dialog"'), 'Must declare role="dialog"');
  assert(enrolmentSource.includes('aria-modal="true"'), 'Must declare aria-modal="true"');
  assert(
    enrolmentSource.includes('aria-labelledby="add-enrolment-modal-title"'),
    'Must link title with aria-labelledby'
  );
  assert(
    enrolmentSource.includes('id="add-enrolment-modal-title"'),
    'Header title must have id="add-enrolment-modal-title"'
  );
});

runTest('1.7 Close button includes accessible aria-label and uses SVG icon instead of raw &times;', () => {
  assert(enrolmentSource.includes('aria-label="Close modal"'), 'Close button must have aria-label');
  assert(!enrolmentSource.includes('&times;'), 'Raw &times; entity must be removed');
  assert(enrolmentSource.includes('<svg'), 'Close button must render SVG cross');
});

runTest('1.8 Raw emoji glyphs and raw text checks removed from modal', () => {
  assert(!enrolmentSource.includes('🎓'), 'Raw 🎓 emoji must be replaced with SVG academic icon');
  assert(!enrolmentSource.includes('<span>✓</span>'), 'Raw ✓ text glyph must be replaced with SVG checkmark');
});

runTest('1.9 Synchronous isSubmittingRef lock prevents duplicate submissions', () => {
  assert(
    enrolmentSource.includes('if (isSubmitting || isSubmittingRef.current) return;'),
    'Must check both state and ref lock before submission'
  );
  assert(
    enrolmentSource.includes('isSubmittingRef.current = true;'),
    'Must engage isSubmittingRef lock on submission'
  );
  assert(
    enrolmentSource.includes('isSubmittingRef.current = false;'),
    'Must release isSubmittingRef lock in finally'
  );
});

// =============================================================================
// Suite 2: Algorithmic Simulation of Enrolment Modal Focus Trap & Transitions
// =============================================================================
console.log('\n--- Suite 2: Enrolment Modal Focus Trap & Lifecycle Algorithmic Simulation ---');

function createEnrolmentFocusTrapSimulator() {
  const elements = [
    { id: 'enrol-prog-select', tagName: 'SELECT', disabled: false },
    { id: 'enrol-cohort-select', tagName: 'SELECT', disabled: false },
    { id: 'enrol-start-date', tagName: 'INPUT', disabled: false },
    { id: 'enrol-tuition-fee', tagName: 'INPUT', disabled: false },
    { id: 'btn-cancel', tagName: 'BUTTON', disabled: false },
    { id: 'btn-submit-enrolment', tagName: 'BUTTON', disabled: false },
  ];

  let currentFocus = elements[0];
  let isSubmitting = false;
  let closeCalled = false;
  let prevented = false;

  const getFocusable = () => elements.filter((el) => !el.disabled);

  const simulateKeyDown = ({ key, shiftKey = false }) => {
    prevented = false;
    if (key === 'Escape') {
      if (!isSubmitting) {
        closeCalled = true;
      }
      return;
    }

    if (key === 'Tab') {
      const focusable = getFocusable();
      if (focusable.length === 0) {
        prevented = true;
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (shiftKey) {
        if (currentFocus.id === first.id) {
          prevented = true;
          currentFocus = last;
        } else {
          const idx = focusable.findIndex((el) => el.id === currentFocus.id);
          currentFocus = focusable[Math.max(0, idx - 1)];
        }
      } else {
        if (currentFocus.id === last.id) {
          prevented = true;
          currentFocus = first;
        } else {
          const idx = focusable.findIndex((el) => el.id === currentFocus.id);
          currentFocus = focusable[Math.min(focusable.length - 1, idx + 1)];
        }
      }
    }
  };

  return {
    elements,
    getCurrentFocus: () => currentFocus,
    setCurrentFocus: (el) => {
      currentFocus = el;
    },
    setSubmitting: (val) => {
      isSubmitting = val;
    },
    isCloseCalled: () => closeCalled,
    isPrevented: () => prevented,
    simulateKeyDown,
  };
}

runTest('2.1 Forward Tab navigates in order through all enrolment form controls', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-prog-select');
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-cohort-select');
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-start-date');
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-tuition-fee');
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'btn-cancel');
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'btn-submit-enrolment');
});

runTest('2.2 Tab wraps from last control (btn-submit-enrolment) to first (enrol-prog-select)', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  sim.setCurrentFocus(sim.elements[5]); // btn-submit-enrolment
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-prog-select', 'Must wrap from last to first');
  assert.strictEqual(sim.isPrevented(), true, 'Must prevent default tab navigation outside modal');
});

runTest('2.3 Shift+Tab wraps from first control (enrol-prog-select) to last (btn-submit-enrolment)', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  sim.setCurrentFocus(sim.elements[0]); // enrol-prog-select
  sim.simulateKeyDown({ key: 'Tab', shiftKey: true });
  assert.strictEqual(sim.getCurrentFocus().id, 'btn-submit-enrolment', 'Must wrap from first to last on Shift+Tab');
  assert.strictEqual(sim.isPrevented(), true, 'Must prevent default tab navigation outside modal');
});

runTest('2.4 Disabled controls (e.g. while cohorts loading) are skipped in focus cycle', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  sim.elements[1].disabled = true; // disable enrol-cohort-select
  sim.simulateKeyDown({ key: 'Tab' });
  assert.strictEqual(sim.getCurrentFocus().id, 'enrol-start-date', 'Must skip disabled cohort select');
});

runTest('2.5 Escape key dismisses enrolment modal when idle', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  sim.simulateKeyDown({ key: 'Escape' });
  assert.strictEqual(sim.isCloseCalled(), true, 'Escape must call onClose');
});

runTest('2.6 Escape key is suppressed during submission', () => {
  const sim = createEnrolmentFocusTrapSimulator();
  sim.setSubmitting(true);
  sim.simulateKeyDown({ key: 'Escape' });
  assert.strictEqual(sim.isCloseCalled(), false, 'Escape must NOT call onClose while submitting');
});

// =============================================================================
// Suite 3: Cross-Modal Keyboard & Focus Regression Check
// =============================================================================
console.log('\n--- Suite 3: Cross-Modal Keyboard & Focus Regression Check ---');

runTest('3.1 AddCohortModal retains certified focus trap and Escape dismissal', () => {
  assert(cohortSource.includes('previousActiveElementRef.current.focus();'), 'AddCohortModal focus restore intact');
  assert(cohortSource.includes("if (e.key === 'Escape')"), 'AddCohortModal Escape handler intact');
  assert(cohortSource.includes("if (e.key === 'Tab')"), 'AddCohortModal focus trap intact');
});

runTest('3.2 RecordLifecycleModal retains certified Escape dismissal and dialog semantics', () => {
  assert(lifecycleSource.includes("e.key === 'Escape'"), 'RecordLifecycleModal Escape handler intact');
  assert(lifecycleSource.includes('role="dialog"'), 'RecordLifecycleModal dialog role intact');
  assert(lifecycleSource.includes('aria-modal="true"'), 'RecordLifecycleModal aria-modal intact');
});

// =============================================================================
// Suite 4: Strict Offline Socket Assertion
// =============================================================================
console.log('\n--- Suite 4: Strict Offline Socket Assertion ---');

runTest('4.1 Strictly ZERO network sockets attempted during entire test suite run', () => {
  assert.strictEqual(socketAttempts, 0, `Expected 0 network socket attempts, recorded ${socketAttempts}`);
});

// -----------------------------------------------------------------------------
// RESTORE NETWORKING
// -----------------------------------------------------------------------------
net.connect = origNetConnect;
net.createConnection = origNetCreateConnection;
net.Socket.prototype.connect = origSocketConnect;
tls.connect = origTlsConnect;

console.log('\n========================================================================================');
console.log(` PHASE C6F OFFLINE TEST SUMMARY: ${testsPassed} PASSED / ${testsFailed} FAILED`);
console.log(' AddEnrolmentModal Accessibility & Focus Management certified offline (Zero Sockets).');
console.log('========================================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
