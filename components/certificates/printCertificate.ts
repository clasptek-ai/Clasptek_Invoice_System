/**
 * components/certificates/printCertificate.ts
 *
 * Reliable, dedicated A4 Landscape Certificate Printing Workflow.
 * Solves the blank-print root cause by mounting the certificate into #print-root
 * and enforcing @page { size: A4 landscape; margin: 0; } print styles.
 *
 * Guarantees:
 * - Unhides the certificate from .cp-modal-overlay
 * - Landscape A4 orientation (297mm x 210mm)
 * - Single-page fit with zero blank 2nd page
 * - Vector graphics, background fills, and borders preserved
 * - Poppins typography at 24px preserved
 */

export function printCertificateElement(certElement: HTMLElement | null): boolean {
  if (!certElement || typeof window === 'undefined') return false;

  // 1. Ensure or get #print-root
  let printRoot = document.getElementById('print-root');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = 'print-root';
    document.body.appendChild(printRoot);
  }

  // 2. Clone the certificate element
  const clone = certElement.cloneNode(true) as HTMLElement;
  clone.style.width = '297mm';
  clone.style.height = '210mm';
  clone.style.maxWidth = '297mm';
  clone.style.maxHeight = '210mm';
  clone.style.margin = '0';
  clone.style.padding = '0';
  clone.style.boxShadow = 'none';

  printRoot.innerHTML = '';
  printRoot.className = 'certificate-print-root';
  printRoot.appendChild(clone);

  // 3. Inject dedicated landscape print styles
  const styleId = 'clasptek-cert-landscape-print-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.innerHTML = `
      @media print {
        @page {
          size: A4 landscape !important;
          margin: 0 !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 297mm !important;
          height: 210mm !important;
          min-width: 297mm !important;
          min-height: 210mm !important;
          max-width: 297mm !important;
          max-height: 210mm !important;
          overflow: hidden !important;
          background: #DDDDF0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#print-root) {
          display: none !important;
        }
        #print-root,
        #print-root.certificate-print-root {
          display: block !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 297mm !important;
          height: 210mm !important;
          max-width: 297mm !important;
          max-height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          background: #DDDDF0 !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          break-after: avoid !important;
          page-break-after: avoid !important;
          z-index: 99999999 !important;
        }
        #print-root .clasptek-cert-print-container,
        #print-root .certificate-print-page {
          width: 297mm !important;
          height: 210mm !important;
          max-width: 297mm !important;
          max-height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          background: #DDDDF0 !important;
        }
        #print-root svg {
          width: 297mm !important;
          height: 210mm !important;
          display: block !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  document.body.classList.add('printing-certificate');

  // 4. Cleanup on afterprint
  const cleanup = () => {
    document.body.classList.remove('printing-certificate');
    if (printRoot) {
      printRoot.innerHTML = '';
      printRoot.className = '';
    }
    const injected = document.getElementById(styleId);
    if (injected) {
      injected.remove();
    }
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  // 5. Invoke browser print
  try {
    window.print();
    return true;
  } catch (err) {
    console.error('[printCertificateElement] Print invocation error:', err);
    cleanup();
    return false;
  }
}
