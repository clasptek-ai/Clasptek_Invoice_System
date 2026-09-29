/**
 * types/training.ts — Phase 5
 * Authoritative types for Training Operations: Attendance, Training Sessions, and Facilitator Reports.
 */

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'NOT_RECORDED';

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'ATTENDANCE_SUBMITTED' | 'CANCELLED';

export type FacilitatorReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';

export type DeliveryMode = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

export interface TrainingSession {
  id: string;
  tenantId: string;
  cohortId: string;
  facilitatorId?: string | null;
  sessionNumber: number;
  sessionTitle: string;
  sessionDate: string;
  startTime?: string | null;
  endTime?: string | null;
  deliveryMode: DeliveryMode;
  location?: string | null;
  status: SessionStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  // Joined fields
  facilitatorName?: string;
  cohortCode?: string;
  cohortName?: string;
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  cohortId: string;
  sessionId: string;
  enrolmentId: string;
  attendanceStatus: AttendanceStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  facilitatorNote?: string | null;
  recordedBy?: string | null;
  recordedAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  correctionReason?: string | null;
}

export interface FacilitatorReport {
  id: string;
  tenantId: string;
  cohortId: string;
  sessionId?: string | null;
  facilitatorId: string;
  reportDate: string;
  sessionSummary: string;
  topicsCovered: string;
  attendanceObservations?: string | null;
  studentParticipationNotes?: string | null;
  issuesEncountered?: string | null;
  followUpRecommendations?: string | null;
  status: FacilitatorReportStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  // Joined fields
  facilitatorName?: string;
  cohortCode?: string;
  cohortName?: string;
  programmeName?: string;
}

export interface EnrolmentStudentInfo {
  enrolmentId: string;
  enrolmentNumber: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  studentEmail?: string;
  status: string;
}

export interface StudentAttendanceSummary {
  enrolmentId: string;
  enrolmentNumber: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
  totalDelivered: number;
  attendancePct: number;
  requiredPct: number;
  isEligible: boolean;
}

export interface CohortAttendanceSummary {
  cohortId: string;
  cohortCode: string;
  cohortName: string;
  programmeName: string;
  leadFacilitatorName: string;
  enrolledStudentsCount: number;
  totalSessionsCount: number;
  deliveredSessionsCount: number;
  totalPresentCount: number;
  totalPossibleCount: number;
  overallAttendancePct: number | null;
  statusLabel: string;
}
