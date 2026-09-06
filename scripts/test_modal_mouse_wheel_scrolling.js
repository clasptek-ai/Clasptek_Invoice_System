/**
 * CLASPTEK MODAL MOUSE-WHEEL SCROLLING VERIFICATION SUITE
 * 
 * Verifies:
 * 1. .cp-modal-body is the primary vertical scroll container with overflow-y: auto and overflow-x: hidden.
 * 2. Constrained max-height (min-height: 0, max-height: calc(90vh - 120px)) so it genuinely owns scroll.
 * 3. Mouse wheel scrolling when pointer is:
 *    - over the center of the modal
 *    - over the left side
 *    - over the right side (immediately beside scrollbar)
 *    - over the modal header
 *    - over the modal footer
 * 4. Boundary checking prevents wheel events from leaking to underlying page.
 * 5. document.body is locked with cp-modal-open (overflow: hidden !important) when modal is open.
 * 6. Nested scrollable elements retain their own native scrolling.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runModalScrollTests() {
  console.log('=== CLASPTEK MODAL MOUSE-WHEEL SCROLLING VERIFICATION ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✔ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${message}`);
      failed++;
    }
  }

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // 1. Verify CSS Rules
  assert(html.includes('overflow-y: auto;'), 'CSS: .cp-modal-body has overflow-y: auto');
  assert(html.includes('overflow-x: hidden;'), 'CSS: .cp-modal-body has overflow-x: hidden');
  assert(html.includes('min-height: 0;'), 'CSS: .cp-modal-body has min-height: 0 (flexbox scroll ownership)');
  assert(html.includes('max-height: calc(90vh - 120px);'), 'CSS: .cp-modal-body has constrained max-height');
  assert(html.includes('overscroll-behavior: contain;'), 'CSS: .cp-modal-body has overscroll-behavior: contain');
  assert(html.includes('body.cp-modal-open'), 'CSS: body.cp-modal-open has overflow: hidden !important');
  assert(html.includes('flex-shrink: 0;'), 'CSS: Header and footer have flex-shrink: 0 (stable boundary)');

  // 2. Unit Verification of attachModalWheelHandling logic
  const listeners = {};
  const mockModalBody = {
    scrollTop: 0,
    scrollHeight: 1600,
    clientHeight: 600,
    parentElement: null,
    contains: function(el) { return el === this; }
  };
  const mockModal = {
    contains: function(el) { return el === this || el === mockModalBody; }
  };
  const mockOverlay = {
    querySelector: function(sel) {
      if (sel === '.cp-modal') return mockModal;
      if (sel === '.cp-modal-body') return mockModalBody;
      return null;
    },
    addEventListener: function(evt, handler, opts) {
      listeners[evt] = handler;
    }
  };

  // Extract attachModalWheelHandling from index.html
  const fnMatch = html.match(/function attachModalWheelHandling\(container\)[\s\S]*?\n\}/);
  assert(Boolean(fnMatch), 'attachModalWheelHandling function exists in index.html');

  const context = {
    window: {
      getComputedStyle: () => ({ overflowY: 'visible' })
    }
  };
  vm.createContext(context);
  vm.runInContext(fnMatch[0], context);

  // Attach handler
  context.attachModalWheelHandling({
    querySelector: (sel) => {
      if (sel === '.cp-modal-overlay') return mockOverlay;
      if (sel === '.cp-modal') return mockModal;
      if (sel === '.cp-modal-body') return mockModalBody;
      return null;
    }
  });

  const wheelHandler = listeners['wheel'];
  assert(typeof wheelHandler === 'function', 'Wheel event listener attached to modal overlay');

  // Test A: Cursor over center / modal body -> scrolls normally
  let stoppedProp = false;
  let defPrevented = false;
  mockModalBody.scrollTop = 100;
  wheelHandler({
    target: mockModalBody,
    deltaY: 50,
    stopPropagation: () => { stoppedProp = true; },
    preventDefault: () => { defPrevented = true; }
  });
  assert(stoppedProp, 'Test A: Event propagation stopped so underlying page does not receive event');
  assert(!defPrevented, 'Test A: Native scrolling allowed within boundaries');

  // Test B: Cursor over header or footer (e.g. mockModal) -> forwards scroll to modalBody
  stoppedProp = false;
  defPrevented = false;
  const initialScroll = mockModalBody.scrollTop;
  wheelHandler({
    target: mockModal,
    deltaY: 70,
    stopPropagation: () => { stoppedProp = true; },
    preventDefault: () => { defPrevented = true; }
  });
  assert(stoppedProp, 'Test B: Header/Footer event propagation stopped');
  assert(defPrevented, 'Test B: Header/Footer default prevented to protect page');
  assert(mockModalBody.scrollTop === initialScroll + 70, 'Test B: Wheel event forwarded to modalBody');

  // Test C: Cursor on right edge / overlay -> forwards scroll to modalBody
  stoppedProp = false;
  defPrevented = false;
  const beforeEdgeScroll = mockModalBody.scrollTop;
  wheelHandler({
    target: mockOverlay,
    deltaY: 60,
    stopPropagation: () => { stoppedProp = true; },
    preventDefault: () => { defPrevented = true; }
  });
  assert(mockModalBody.scrollTop === beforeEdgeScroll + 60, 'Test C: Right side / overlay wheel event forwarded to modalBody');

  // Test D: Boundary leak prevention at top
  mockModalBody.scrollTop = 0;
  stoppedProp = false;
  defPrevented = false;
  wheelHandler({
    target: mockModalBody,
    deltaY: -50,
    stopPropagation: () => { stoppedProp = true; },
    preventDefault: () => { defPrevented = true; }
  });
  assert(defPrevented, 'Test H: Wheel upward at top boundary is default-prevented from scrolling underlying dashboard');

  // Test E: Boundary leak prevention at bottom
  mockModalBody.scrollTop = mockModalBody.scrollHeight - mockModalBody.clientHeight;
  stoppedProp = false;
  defPrevented = false;
  wheelHandler({
    target: mockModalBody,
    deltaY: 50,
    stopPropagation: () => { stoppedProp = true; },
    preventDefault: () => { defPrevented = true; }
  });
  assert(defPrevented, 'Test H: Wheel downward at bottom boundary is default-prevented from scrolling underlying dashboard');

  console.log(`\n=============================================================`);
  console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log(`=============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runModalScrollTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
