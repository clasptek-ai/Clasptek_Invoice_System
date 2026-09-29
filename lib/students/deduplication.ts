/**
 * lib/students/deduplication.ts
 * Authoritative Student Deduplication Engine
 * Implements strict confidence hierarchy:
 * 1. Exact Student ID
 * 2. Exact normalized Email
 * 3. Exact normalized Phone
 * 4. Email + Last Name
 * 5. Phone + Last Name
 * 6. Name-only Match (AMBIGUOUS - Requires Human Confirmation)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Student,
  DeduplicationMatchResult,
} from '@/types/students';

/**
 * Deterministic email normalization: trim, lowercase.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Deterministic phone normalization:
 * Strips all non-digit characters and normalizes Nigerian leading country code (234 -> 0).
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 12) {
    return '0' + digits.slice(3);
  }
  return digits;
}

/**
 * Deterministic name normalization: trim, lowercase, strip extra internal whitespace.
 */
export function normalizeName(name?: string | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface CandidateIdentity {
  studentId?: string | null;
  studentNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Evaluates candidate identity against existing students in the tenant.
 * Follows the approved strict confidence hierarchy.
 */
export async function matchStudent(
  supabase: SupabaseClient,
  tenantId: string,
  candidate: CandidateIdentity
): Promise<DeduplicationMatchResult> {
  const normEmail = normalizeEmail(candidate.email);
  const normPhone = normalizePhone(candidate.phone);
  const normFirst = normalizeName(candidate.firstName);
  const normLast = normalizeName(candidate.lastName);

  // If candidate has a single full name, split into first and last if needed
  let resolvedFirst = normFirst;
  let resolvedLast = normLast;
  if (!resolvedFirst && !resolvedLast && candidate.fullName) {
    const parts = normalizeName(candidate.fullName).split(' ');
    resolvedFirst = parts[0] || '';
    resolvedLast = parts.slice(1).join(' ') || '';
  }

  // 1. Level 1: Exact Student ID or Student Number Match
  if (candidate.studentId || candidate.studentNumber) {
    let query = supabase.from('students').select('*').eq('tenant_id', tenantId);
    if (candidate.studentId && candidate.studentNumber) {
      query = query.or(`id.eq.${candidate.studentId},student_number.ilike.${candidate.studentNumber.trim()}`);
    } else if (candidate.studentId) {
      query = query.eq('id', candidate.studentId);
    } else if (candidate.studentNumber) {
      query = query.ilike('student_number', candidate.studentNumber.trim());
    }
    const { data: matchedById } = await query.limit(1);
    if (matchedById && matchedById.length > 0) {
      return {
        confidence: 'EXACT_ID',
        isAmbiguous: false,
        matchedStudent: matchedById[0] as Student,
        matchReason: `Exact match found by Student Number / ID (${matchedById[0].student_number}).`,
      };
    }
  }

  // 2. Fetch potential candidates by tenant for comprehensive matching
  // Query by email OR phone OR last_name
  const filterParts: string[] = [];
  if (normEmail) {
    filterParts.push(`email.ilike.${normEmail}`);
  }
  if (normPhone) {
    // Search phone field (both raw and normalized)
    filterParts.push(`phone.ilike.%${normPhone}%`);
  }
  if (resolvedLast) {
    filterParts.push(`last_name.ilike.%${resolvedLast}%`);
  }

  if (filterParts.length === 0) {
    return {
      confidence: 'NONE',
      isAmbiguous: false,
      matchedStudent: null,
      matchReason: 'Insufficient identity details provided for deduplication check.',
    };
  }

  const { data: existingStudents, error } = await supabase
    .from('students')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(filterParts.join(','));

  if (error || !existingStudents || existingStudents.length === 0) {
    return {
      confidence: 'NONE',
      isAmbiguous: false,
      matchedStudent: null,
      matchReason: 'No existing students matched the provided details.',
    };
  }

  const students = existingStudents as Student[];

  // Level 2: Exact Normalized Email Match
  if (normEmail) {
    const emailMatch = students.find((s) => normalizeEmail(s.email) === normEmail);
    if (emailMatch) {
      return {
        confidence: 'EXACT_EMAIL',
        isAmbiguous: false,
        matchedStudent: emailMatch,
        matchReason: `Exact normalized email match found (${emailMatch.email} — ${emailMatch.student_number}).`,
      };
    }
  }

  // Level 3: Exact Normalized Phone Match
  if (normPhone) {
    const phoneMatch = students.find((s) => {
      const existingNormPhone = normalizePhone(s.phone);
      return existingNormPhone && existingNormPhone === normPhone;
    });
    if (phoneMatch) {
      return {
        confidence: 'EXACT_PHONE',
        isAmbiguous: false,
        matchedStudent: phoneMatch,
        matchReason: `Exact normalized phone match found (${phoneMatch.phone} — ${phoneMatch.student_number}).`,
      };
    }
  }

  // Level 4: Email + Last Name Match
  if (normEmail && resolvedLast) {
    const emailLastNameMatch = students.find((s) => {
      const matchEmail = normalizeEmail(s.email).includes(normEmail) || normEmail.includes(normalizeEmail(s.email));
      const matchLast = normalizeName(s.last_name) === resolvedLast;
      return matchEmail && matchLast;
    });
    if (emailLastNameMatch) {
      return {
        confidence: 'EMAIL_LASTNAME',
        isAmbiguous: false,
        matchedStudent: emailLastNameMatch,
        matchReason: `Matching email domain/prefix and identical last name (${emailLastNameMatch.last_name}).`,
      };
    }
  }

  // Level 5: Phone + Last Name Match
  if (normPhone && resolvedLast) {
    const phoneLastNameMatch = students.find((s) => {
      const sPhone = normalizePhone(s.phone);
      const phoneClose = sPhone.endsWith(normPhone.slice(-7)) || normPhone.endsWith(sPhone.slice(-7));
      const matchLast = normalizeName(s.last_name) === resolvedLast;
      return phoneClose && matchLast;
    });
    if (phoneLastNameMatch) {
      return {
        confidence: 'PHONE_LASTNAME',
        isAmbiguous: false,
        matchedStudent: phoneLastNameMatch,
        matchReason: `Matching phone suffix and identical last name (${phoneLastNameMatch.last_name}).`,
      };
    }
  }

  // Level 6: Name-Only Match (AMBIGUOUS - NEVER AUTO-MERGE)
  if (resolvedFirst && resolvedLast) {
    const nameMatch = students.find((s) => {
      const sFirst = normalizeName(s.first_name);
      const sLast = normalizeName(s.last_name);
      return sFirst === resolvedFirst && sLast === resolvedLast;
    });
    if (nameMatch) {
      return {
        confidence: 'NAME_ONLY',
        isAmbiguous: true, // Requires explicit Human Confirmation!
        matchedStudent: nameMatch,
        matchReason: `Name collision (${nameMatch.first_name} ${nameMatch.last_name}). Email and phone differ or are absent. Human confirmation required.`,
      };
    }
  }

  return {
    confidence: 'NONE',
    isAmbiguous: false,
    matchedStudent: null,
    matchReason: 'No match meeting confidence thresholds.',
  };
}
