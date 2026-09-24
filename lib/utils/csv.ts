/**
 * lib/utils/csv.ts — Enterprise RFC-4180 CSV Serializer & Formula Injection Guard
 * Phase 8: Production Security Hardening & Export Defense (CWE-1236)
 *
 * Enforces:
 * 1. Sanitization of spreadsheet formula injection characters ('=', '+', '-', '@', '\t', '\r')
 * 2. Proper RFC-4180 quotation and quote escaping
 * 3. Preservation of legitimate numeric values and dates
 * 4. Safe filename generation without path traversal characters
 */

/**
 * Sanitizes a single cell value against spreadsheet formula injection.
 * If the value starts with '=', '+', '-', '@', '\t', or '\r' and is not a plain number,
 * it is prefixed with a single quote to force spreadsheet software to treat it as text.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  if (typeof value === 'number') {
    return isFinite(value) ? String(value) : '""';
  }

  if (typeof value === 'boolean') {
    return value ? '"TRUE"' : '"FALSE"';
  }

  let str = String(value);

  // Preserve pure numeric representations (e.g. "-500", "+25.5")
  const isPureNumber = /^[+-]?\d+(\.\d+)?$/.test(str.trim());

  // Formula triggers in Excel, LibreOffice, Google Sheets
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];

  if (!isPureNumber && formulaTriggers.some((trigger) => str.startsWith(trigger))) {
    // Prefix with single quote (') to neuter formula execution
    str = `'${str}`;
  }

  // RFC-4180 double-quote escaping
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Serializes headers and tabular rows into a safe RFC-4180 CSV string.
 */
export function serializeSafeCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Downloads a safe CSV file in the browser environment.
 */
export function downloadSafeCsv(
  filenamePrefix: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const csvContent = serializeSafeCsv(headers, rows);
  const cleanPrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fullFilename = `${cleanPrefix}_${dateStr}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fullFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
