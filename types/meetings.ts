/**
 * types/meetings.ts — Phase 5
 * Authoritative types for Meetings, Live Rooms, Recordings, and Google Drive Integration.
 */

export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export type ParticipantAccess = 'COHORT_ONLY' | 'ALL_STUDENTS' | 'PUBLIC_TOKEN';

export type SFUProvider = 'livekit' | 'daily' | 'mock';

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
  rootFolderId?: string;
  tenantId?: string;
  meetingId?: string;
  meetingPublicId?: string;
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
