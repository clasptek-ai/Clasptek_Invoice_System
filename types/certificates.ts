/**
 * types/certificates.ts — Phase 9D
 * Authoritative types for Certificate of Completion, Eligibility Determination,
 * Issuance, Templates, Verification, and Revocation Governance.
 */

export type CertificateStatus = 'ISSUED' | 'REVOKED';

export type CompletionStatus = 'VERIFIED' | 'NOT_ELIGIBLE' | 'PENDING' | 'OVERRIDDEN';

export interface Certificate {
  id: string;
  tenantId: string;
  studentId: string;
  enrolmentId: string;
  programmeId: string;
  cohortId?: string | null;
  certificateNumber: string;
  issueDate: string;
  completionDate: string;
  status: CertificateStatus;
  issuedBy?: string | null;
  verificationToken: string;
  studentNameSnapshot: string;
  programmeNameSnapshot: string;
  programmeCodeSnapshot: string;
  cohortNameSnapshot?: string | null;
  cohortCodeSnapshot?: string | null;
  attendancePctSnapshot: number;
  certificateTitleSnapshot?: string;
  certificateDescriptionSnapshot?: string;
  certificateIntroSnapshot?: string;
  certificateRoleSnapshot?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  certificateTemplateId?: string;
  templateVersion?: string;
  verificationUrl?: string;
  pdfUrl?: string | null;
  revocationReason?: string | null;
  revokedBy?: string | null;
  revokedAt?: string | null;
  reissuedFromCertificateId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  templateType: 'standard_completion' | 'executive';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgrammeCertificateSettings {
  programmeId?: string;
  certificateTitle: string;
  certificateIntro: string;
  certificateDescription: string;
  certificateRole: string;
  signatoryName: string;
  signatoryTitle: string;
  certificateTemplateId: string;
  requiresAdminApproval: boolean;
  certificateEnabled: boolean;
}

export interface CertificateEligibilityCandidate {
  enrolmentId: string;
  enrolmentNumber: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  studentEmail?: string;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  cohortId: string;
  cohortName: string;
  cohortCode: string;
  currentStatus: string;
  completionStatus: CompletionStatus;
  completionDate?: string | null;
  completionVerifiedBy?: string | null;
  completionVerifiedAt?: string | null;
  completionNotes?: string | null;
  attendancePct: number;
  requiredPct: number;
  totalDeliveredSessions: number;
  totalAttendedSessions: number;
  isAttendanceEligible: boolean;
  isVerified: boolean;
  hasActiveCertificate: boolean;
  activeCertificateId?: string | null;
  activeCertificateNumber?: string | null;
}

export interface PublicCertificateVerification {
  found: boolean;
  isValid: boolean;
  status: 'ISSUED' | 'REVOKED' | 'NOT_FOUND';
  message?: string;
  certificateNumber?: string;
  studentName?: string;
  programmeName?: string;
  programmeCode?: string;
  cohortName?: string;
  certificateTitle?: string;
  certificateDescription?: string;
  certificateRole?: string;
  issueDate?: string;
  completionDate?: string;
  verificationToken?: string;
  revocationReason?: string | null;
  revokedAt?: string | null;
}

export interface IssueCertificateRequest {
  enrolmentId: string;
  issueDate?: string;
  certificateTitle?: string;
  certificateDescription?: string;
  certificateRole?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  certificateTemplateId?: string;
  notes?: string;
}

export interface RevokeCertificateRequest {
  reason: string;
}

export interface ReissueCertificateRequest {
  reason: string;
  issueDate?: string;
  studentNameOverride?: string;
  certificateTitle?: string;
  certificateDescription?: string;
  certificateRole?: string;
}

export interface VerifyCompletionRequest {
  enrolmentId: string;
  notes?: string;
}

export interface OverrideCompletionRequest {
  enrolmentId: string;
  overrideReason: string;
  notes?: string;
}
