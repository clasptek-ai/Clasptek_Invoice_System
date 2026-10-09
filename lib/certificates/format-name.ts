/**
 * lib/certificates/format-name.ts
 *
 * Authoritative recipient name formatting for Certificates & Credentials.
 * Enforces the strict ordering:
 *   Last Name (Surname) + First Name + Middle Name
 * Separated by single spaces, gracefully omitting missing middle names
 * without producing 'undefined', 'null', or duplicate whitespace.
 */

export function formatRecipientName(
  lastName?: string | null,
  firstName?: string | null,
  middleName?: string | null
): string {
  const cleanLast = String(lastName || '').trim();
  const cleanFirst = String(firstName || '').trim();
  const cleanMiddle = String(middleName || '').trim();

  const isInvalid = (val: string) =>
    !val || val === 'null' || val === 'undefined' || val === '—' || val === '-';

  const parts = [
    isInvalid(cleanLast) ? '' : cleanLast,
    isInvalid(cleanFirst) ? '' : cleanFirst,
    isInvalid(cleanMiddle) ? '' : cleanMiddle,
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
