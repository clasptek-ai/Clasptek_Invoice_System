/**
 * components/finance/printCanonical.ts
 * Decoupled A4 Full-Page Canonical Printing Utility.
 * Faithfully mirrors legacy index.html printCanonicalDocument().
 */

export function printCanonicalHtml(html: string) {
  if (typeof window === 'undefined') return;
  let printRoot = document.getElementById('print-root');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = 'print-root';
    document.body.appendChild(printRoot);
  }
  printRoot.innerHTML = html;
  window.print();
}

export function printCanonicalElement(element: HTMLElement | null) {
  if (!element || typeof window === 'undefined') return;
  printCanonicalHtml(element.outerHTML);
}
