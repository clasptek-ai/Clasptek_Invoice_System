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

export interface RecipientNameParts {
  surname: string;
  otherNames: string;
}

export interface CertificateNameLineSegment {
  text: string;
  isSurname: boolean;
}

export interface CertificateNameLine {
  segments: CertificateNameLineSegment[];
  fontSize: number;
  y: number;
}

export interface CertificateNameLayout {
  isTwoLine: boolean;
  lines: CertificateNameLine[];
}

/**
 * Parses a full recipient name into its leading Surname (family name)
 * and remaining names (first and middle), preserving Surname-First ordering.
 * Supports hyphenated / double-barrelled surnames and common multi-part prefixes.
 */
export function parseRecipientNameParts(fullName: string): RecipientNameParts {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { surname: '', otherNames: '' };
  const tokens = clean.split(' ');
  if (tokens.length <= 1) return { surname: tokens[0] || '', otherNames: '' };

  const particles = new Set(['DE', 'VAN', 'VON', 'DA', 'DI', 'DOS', 'DAS', 'DU', 'DEL', 'LA', 'LE']);
  let surnameTokensCount = 1;
  if (particles.has(tokens[0].toUpperCase()) && tokens.length >= 3) {
    if (tokens[1] && particles.has(tokens[1].toUpperCase()) && tokens.length >= 4) {
      surnameTokensCount = 3; // e.g. "VAN DER WAALS"
    } else {
      surnameTokensCount = 2; // e.g. "DE SILVA"
    }
  }

  const surname = tokens.slice(0, surnameTokensCount).join(' ');
  const otherNames = tokens.slice(surnameTokensCount).join(' ');
  return { surname, otherNames };
}

/**
 * Estimates text width in points for Poppins uppercase text with letter-spacing.
 */
export function estimateRecipientTextWidth(
  text: string,
  fontSize: number,
  isBold: boolean,
  letterSpacing = 1.2
): number {
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

/**
 * Computes adaptive certificate name typography layout.
 * Evaluates candidate font sizes against the available container width (default 560pt).
 * For names that fit comfortably, retains prominent 24px single line.
 * For longer names, progressively reduces font size (22px, 20px, 18px, 16px).
 * For unusually long names (>42 characters or overflowing at 16px), adopts a
 * controlled two-line layout with 14-18px sizing, ensuring vertical alignment
 * and preventing any clipping or boundary overflow.
 */
export function computeCertificateNameLayout(
  fullName: string,
  maxContainerWidth = 560
): CertificateNameLayout {
  const cleanName = String(fullName || '').trim().replace(/\s+/g, ' ');
  const { surname, otherNames } = parseRecipientNameParts(cleanName);
  const letterSpacing = 1.2;

  // Single line candidates from prominent 24px down to 16px
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

  // Controlled Two-line Layout for unusually long names
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
