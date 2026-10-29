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
 * Resolves Google Drive Central Repository status for a tenant.
 *
 * Prioritizes the persisted central connection in public.google_drive_connections
 * (scoped strictly to connection_type=TENANT_CENTRAL and the authenticated tenant).
 *
 * - When a persisted central connection is CONNECTED, reports connected: true, the
 *   authenticated account email, folder details, and genuine lastVerified timestamp.
 * - When no connected row exists in database, falls back to inspecting environment
 *   configuration without claiming connection or verification (CONFIGURED_UNVERIFIED or DISCONNECTED).
 * - Never fabricates connected status or verification dates from environment alone.
 * - Never permits personal connections (USER_PERSONAL) or other tenants to satisfy central status.
 */
export async function getGoogleDriveStatus(tenantId?: string | null): Promise<GoogleDriveStatus> {
  let fallbackFolderId = '';
  try {
    fallbackFolderId = getMeetingsFolderId();
  } catch {
    fallbackFolderId = '';
  }

  const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';

  if (cleanTenantId) {
    let googleConfig: any = null;
    try {
      googleConfig = require('@/api/_lib/google-oauth-config');
    } catch {
      try {
        googleConfig = require('../../../api/_lib/google-oauth-config');
      } catch {
        try {
          googleConfig = require('../../api/_lib/google-oauth-config');
        } catch (_) {}
      }
    }

    if (googleConfig && typeof googleConfig.getGoogleDriveConnectionStatus === 'function') {
      try {
        const centralStatus = await googleConfig.getGoogleDriveConnectionStatus({
          tenantId: cleanTenantId,
          connectionType: 'TENANT_CENTRAL',
        });

        if (centralStatus && centralStatus.connected && centralStatus.status === 'CONNECTED') {
          return {
            connected: true,
            connectionType: 'TENANT_CENTRAL',
            email: centralStatus.googleEmail || undefined,
            rootFolderId: centralStatus.rootFolderId || fallbackFolderId || undefined,
            rootFolderName: centralStatus.rootFolderName || DEFAULT_ROOT_FOLDER_NAME,
            lastVerified: centralStatus.lastVerifiedAt || undefined,
            status: 'CONNECTED',
          };
        }
      } catch (_) {
        // Fall through to unverified/disconnected configuration evaluation
      }
    }
  }

  // Fallback: evaluate deployment configuration when no active central connection exists
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const isConfigured = Boolean(clientId && clientSecret && fallbackFolderId);

  return {
    connected: false,
    connectionType: 'TENANT_CENTRAL',
    rootFolderId: fallbackFolderId || undefined,
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
