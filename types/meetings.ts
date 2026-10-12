/**
 * types/meetings.ts — Phase 5
 * Authoritative types for Meetings, Live Rooms, Recordings, and Google Drive Integration.
 */

export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export type ParticipantAccess = 'COHORT_ONLY' | 'ALL_STUDENTS' | 'PUBLIC_TOKEN';

export type SFUProvider = 'livekit' | 'daily' | 'mock' | 'google_meet';

export type MeetingPlatform = 'livekit' | 'google_meet';

export type RecordingStatus = 'NOT_STARTED' | 'RECORDING' | 'PROCESSING' | 'STORED' | 'FAILED';

export interface MeetingSettings {
  allowChat?: boolean;
  allowScreenShare?: boolean;
  muteOnEntry?: boolean;
  emptyTimeout?: number;
  maxParticipants?: number;
}

export interface RecordingMetadata {
  provider?: string;
  fileId?: string;
  driveFileId?: string;
  driveFolderId?: string;
  fileName?: string;
  mimeType?: string;
  driveUrl?: string;
  webViewLink?: string;
  webContentLink?: string;
  fileSizeBytes?: number;
  size?: number | string;
  durationSeconds?: number;
  recordingId?: string;
  uploadedAt?: string;
  storedAt?: string;
  source?: string;
  error?: string;
  failure_reason?: string;
  rootFolderId?: string;
  tenantId?: string;
  meetingId?: string;
  meetingPublicId?: string;
  startedAt?: string;
  startedBy?: string;
  stoppedAt?: string;
  stoppedReason?: string;
  failedAt?: string;
  egressId?: string;
  egress_id?: string;
  uploadStatus?: string;
  retryCount?: number;
  google_drive_file_id?: string;
  google_drive_folder_id?: string;
  google_drive_url?: string;
  recording_id?: string;
  processing_claim?: {
    token: string;
    claimed_at: string;
    event_id?: string;
    worker_id?: string;
  } | null;
  start_intent?: {
    token: string;
    roomName: string;
    tenantId: string;
    meetingId: string;
    startedBy: string;
    initiatedAt: string;
    fileName?: string;
    filePath?: string;
  } | null;
  permission_reconciliation_needed?: {
    participantId: string;
    identity: string;
    action: string;
    failedAt: string;
    error?: string;
  } | null;
  processed_events?: string[];
  last_webhook_event_id?: string;
  ambiguous_egress_candidates?: Array<{
    egressId: string;
    status: string;
    roomName?: string;
    createdAt?: string;
    fileResults?: any[];
  }> | null;
  ambiguity_detected_at?: string;
  consent_session?: RecordingConsentSession | null;
  consent_audit_log?: ConsentAuditEntry[];
  active_participants?: Array<{
    participantId: string;
    participantName: string;
    role: string;
    joinedAt: string;
    canPublish?: boolean;
    permissionRevocationPending?: boolean;
    revocationError?: string;
  }>;
  unresolved_egress_artifact?: {
    egressId?: string;
    downloadUrl?: string;
    location?: string;
    filePath?: string;
    blockedReason?: string;
    unresolvedAt?: string;
    [key: string]: any;
  } | null;
  unresolved_drive_artifact?: {
    driveFileId?: string;
    fileId?: string;
    fileName?: string;
    uploadedAt?: string;
    discoveredAt?: string;
    reason?: string;
    [key: string]: any;
  } | null;
}

export type ConsentDecision = 'GRANTED' | 'DECLINED' | 'WITHDRAWN' | 'PENDING';

export interface ParticipantConsentRecord {
  participantId: string;
  participantName: string;
  role: string;
  status: ConsentDecision;
  recordingSessionId: string;
  updatedAt: string;
  reason?: string;
}

export interface ConsentAuditEntry {
  timestamp: string;
  action:
    | 'CONSENT_REQUESTED'
    | 'CONSENT_GRANTED'
    | 'CONSENT_DECLINED'
    | 'CONSENT_WITHDRAWN'
    | 'LATE_JOIN_REGISTERED'
    | 'RECORDING_ALLOWED'
    | 'RECORDING_BLOCKED'
    | 'RECORDING_STOPPED_DUE_TO_WITHDRAWAL'
    | 'RECORDING_STOP_FAILED_ON_WITHDRAWAL'
    | 'CLAIM_ACQUIRED'
    | 'CLAIM_RELEASED';
  recordingSessionId: string;
  participantId?: string;
  participantRole?: string;
  reason?: string;
}

export interface RecordingConsentSession {
  sessionId: string;
  requestedAt: string;
  requestedBy: string;
  status: 'PENDING_CONSENT' | 'ALL_GRANTED' | 'DECLINED' | 'WITHDRAWN' | 'ACTIVE_RECORDING' | 'STOPPED';
  requiredParticipantIds: string[];
  consents: Record<string, ParticipantConsentRecord>;
  lockAcquiredAt?: string;
}

export interface Meeting {
  id: string;
  tenantId: string;
  publicId: string;
  title: string;
  description?: string | null;
  programmeId?: string | null;
  cohortId?: string | null;
  trainingSessionId?: string | null;
  facilitatorId?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  status: MeetingStatus;
  participantAccess: ParticipantAccess;
  sfuProvider: SFUProvider;
  sfuRoomId?: string | null;
  providerRoomUrl?: string | null;
  settings: MeetingSettings;
  recordingEnabled: boolean;
  recordingStatus: RecordingStatus;
  recordingMetadata: RecordingMetadata;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  // Joined fields
  facilitatorName?: string;
  cohortCode?: string;
  cohortName?: string;
  programmeName?: string;
  recordings?: RecordingMetadata[];
  recordingUrl?: string;
}

export interface MeetingParticipant {
  id: string;
  tenantId: string;
  meetingId: string;
  userId?: string | null;
  studentId?: string | null;
  personnelId?: string | null;
  displayName: string;
  role: 'HOST' | 'FACILITATOR' | 'STUDENT' | 'STAFF' | 'GUEST';
  joinedAt: string;
  leftAt?: string | null;
  durationSeconds: number;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'REMOVED';
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export interface MeetingChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface GoogleDriveStatus {
  connected: boolean;
  connectionType: 'TENANT_CENTRAL' | 'USER_PERSONAL';
  email?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  lastVerified?: string;
  status?: string;
  error?: string;
}
