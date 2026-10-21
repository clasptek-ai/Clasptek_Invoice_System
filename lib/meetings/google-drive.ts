/**
 * lib/meetings/google-drive.ts — Phase 2 Google Drive Recording Storage Integration
 * Server-side Google Drive integration for native meeting recordings.
 * Enforces least-privilege OAuth scope (drive.file), approved organization folder routing,
 * deterministic file naming, and zero client credential exposure.
 *
 * IMPORTANT: This module performs NO Google Drive uploads. The only genuine upload path is
 * uploadFileToGoogleDrive() in api/_lib/google-oauth-config.js, invoked through
 * lib/meetings/recording-service.ts (uploadRecordingWithRetry / reconcileMeetingRecording),
 * which validates the Drive response (file id + parent folder) before a recording is marked STORED.
 */

import type { GoogleDriveStatus, RecordingMetadata } from '@/types/meetings';

export const DEFAULT_ROOT_FOLDER_NAME = 'Clasptek Meeting Recordings';

/**
 * Resolves the authoritative Google Drive folder ID for meeting recordings.
 * Precedence:
 * 1. Preferred primary: GOOGLE_DRIVE_ROOT_FOLDER_ID
 * 2. Legacy fallback: GOOGLE_DRIVE_MEETINGS_FOLDER_ID
 * Emits a safe diagnostic warning if both are configured with different values.
 * Never logs credentials, tokens, or sensitive values.
 */
export function getMeetingsFolderId(): string {
  const preferred = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  const legacy = process.env.GOOGLE_DRIVE_MEETINGS_FOLDER_ID?.trim();

  if (preferred && legacy) {
    if (preferred !== legacy) {
      console.warn(
        '[GOOGLE_DRIVE_CONFIG] Both GOOGLE_DRIVE_ROOT_FOLDER_ID and legacy GOOGLE_DRIVE_MEETINGS_FOLDER_ID ' +
        'are configured with different values. Precedence rule: using primary GOOGLE_DRIVE_ROOT_FOLDER_ID.'
      );
    }
    return preferred;
  }
  if (preferred) return preferred;
  if (legacy) return legacy;

  throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured');
}

/**
 * Validates that the configured meetings folder ID is present and well-formed.
 */
export async function verifyMeetingsFolderAccess(): Promise<{
  valid: boolean;
  folderId: string;
  error?: string;
}> {
  let folderId: string;
  try {
    folderId = getMeetingsFolderId();
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured';
    return { valid: false, folderId: '', error: errorMsg };
  }
  // Google Drive folder IDs are base64-like alphanumeric strings with hyphens and underscores
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(folderId)) {
    return { valid: false, folderId, error: 'INVALID_FOLDER_ID_FORMAT' };
  }
  return { valid: true, folderId };
}

/**
 * Generates a deterministic, human-readable filename for meeting recordings.
 * Pattern: CLASPTEK_[MEETING_PUBLIC_ID]_[YYYY-MM-DD]_[TITLE].mp4
 * Title is sanitized for filesystem and Google Drive safety without exposing private student PII.
 */
export function generateRecordingFileName(params: {
  meetingPublicId: string;
  title: string;
  scheduledStart?: string;
  extension?: string;
}): string {
  const dateStr = (params.scheduledStart ? new Date(params.scheduledStart) : new Date())
    .toISOString()
    .slice(0, 10);
  const cleanTitle = (params.title || 'Meeting')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
  const ext = params.extension || 'mp4';
  return `CLASPTEK_${params.meetingPublicId}_${dateStr}_${cleanTitle}.${ext}`;
}

/**
 * Environment-only configuration status.
 *
 * This function reads environment variables only. It does NOT contact Google and does NOT consult
 * the stored OAuth connection, so it can never prove that Drive authorization is valid. It therefore
 * never reports `connected: true`; a complete configuration is reported as CONFIGURED_UNVERIFIED.
 * No account e-mail or verification timestamp is fabricated.
 */
export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  let rootFolderId = '';
  try {
    rootFolderId = getMeetingsFolderId();
  } catch {
    rootFolderId = '';
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const isConfigured = Boolean(clientId && clientSecret && rootFolderId);

  return {
    connected: false,
    connectionType: 'TENANT_CENTRAL',
    rootFolderId,
    rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
    status: isConfigured ? 'CONFIGURED_UNVERIFIED' : 'DISCONNECTED',
  };
}

/**
 * Unsupported direct-upload entry point — always fails closed.
 *
 * This function previously fabricated a Drive file ID and URL without uploading anything. It must
 * never report success. Recording uploads are performed only by the recording service, which calls
 * uploadFileToGoogleDrive() in api/_lib/google-oauth-config.js and validates the real Drive response.
 */
export async function uploadRecordingToDrive(params: {
  meetingId: string;
  tenantId: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
  durationSeconds?: number;
  meetingPublicId?: string;
}): Promise<RecordingMetadata> {
  void params;
  throw new Error(
    'GOOGLE_DRIVE_DIRECT_UPLOAD_UNSUPPORTED: lib/meetings/google-drive.ts does not upload files. ' +
      'Use the recording service upload path, which validates the genuine Google Drive response.'
  );
}
