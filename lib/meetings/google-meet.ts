/**
 * lib/meetings/google-meet.ts — Clasptek Google Meet Integration
 * Server-side service for Google Meet conference creation, URL validation,
 * and Google Calendar OAuth authorization verification.
 *
 * Strict Invariants:
 * 1. Never fabricate or hallucinate a meet.google.com URL.
 * 2. Validate all URLs against canonical Google Meet format: https://meet.google.com/xxx-yyyy-zzz.
 * 3. Never assume Google Drive permissions grant Calendar permissions.
 * 4. If Google authorization or Calendar conference creation fails, fail closed with clear feedback.
 * 5. Do not issue LiveKit tokens for Google Meet sessions.
 */

import crypto from 'crypto';

export class GoogleMeetError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(`${code}: ${message}`);
    this.name = 'GoogleMeetError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Strict regex for canonical Google Meet meeting URLs.
 * Real Google Meet meetings have a 10-character code in 3-4-3 format (e.g. abc-defg-hij).
 */
export const GOOGLE_MEET_URL_REGEX = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/;

/**
 * Validates whether a given URL is a real, well-formed Google Meet URL.
 */
export function isValidGoogleMeetUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return GOOGLE_MEET_URL_REGEX.test(trimmed);
}

/**
 * Normalizes a Google Meet URL by trimming whitespace and standardizing protocol.
 */
export function normalizeGoogleMeetUrl(url: string): string {
  if (!isValidGoogleMeetUrl(url)) {
    throw new GoogleMeetError(
      'INVALID_GOOGLE_MEET_URL',
      'The provided URL is not a valid Google Meet link. Format must match https://meet.google.com/xxx-yyyy-zzz'
    );
  }
  return url.trim();
}

export interface GoogleMeetConferenceResult {
  meetUrl: string;
  conferenceId?: string;
  calendarEventId?: string;
  createdVia: 'GOOGLE_CALENDAR_API' | 'CUSTOM_VERIFIED_URL';
}

/**
 * Creates or retrieves a Google Meet conference URL.
 * Either validates a facilitator-provided Google Meet URL or creates one
 * via Google Calendar API with conferenceDataVersion=1.
 */
export async function createOrValidateGoogleMeet({
  tenantId,
  title,
  description,
  scheduledStart,
  scheduledEnd,
  customGoogleMeetUrl,
}: {
  tenantId: string;
  title: string;
  description?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  customGoogleMeetUrl?: string | null;
}): Promise<GoogleMeetConferenceResult> {
  throw new GoogleMeetError(
    'PROVIDER_UNSUPPORTED',
    'Google Meet is disabled. Clasptek video meetings use LiveKit exclusively.',
    400
  );
}
