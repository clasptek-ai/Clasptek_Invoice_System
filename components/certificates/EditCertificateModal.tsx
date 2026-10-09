'use client';

/**
 * components/certificates/EditCertificateModal.tsx
 *
 * Dedicated administrative modal for post-issuance certificate correction.
 * Allows authorised administrators to correct recipient name snapshots and certificate
 * metadata in place without creating duplicate records or changing academic provenance.
 */

import React, { useState, useEffect } from 'react';
import type { Certificate } from '@/types/certificates';

interface Props {
  isOpen: boolean;
  certificate: Certificate | null;
  onClose: () => void;
  onSuccess: (updated: Certificate) => void;
}

export const EditCertificateModal: React.FC<Props> = ({
  isOpen,
  certificate,
  onClose,
  onSuccess,
}) => {
  const [studentName, setStudentName] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [certificateTitle, setCertificateTitle] = useState('');
  const [certificateDescription, setCertificateDescription] = useState('');
  const [certificateRole, setCertificateRole] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (certificate) {
      setStudentName(certificate.studentNameSnapshot || '');
      setIssueDate(certificate.issueDate || '');
      setCompletionDate(certificate.completionDate || '');
      setCertificateTitle(certificate.certificateTitleSnapshot || 'Certificate of Completion');
      setCertificateDescription(certificate.certificateDescriptionSnapshot || '');
      setCertificateRole(certificate.certificateRoleSnapshot || '');
      setSignatoryName(certificate.signatoryName || 'Academy Director');
      setSignatoryTitle(certificate.signatoryTitle || 'Academy Director Signature');
      setReason('');
      setError(null);
    }
  }, [certificate]);

  if (!isOpen || !certificate) return null;

  const authoritativeName = certificate.studentAuthoritativeName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError('Recipient Name is required.');
      return;
    }
    if (!reason.trim()) {
      setError('A documented correction reason is required for the audit trail.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/certificates/${certificate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'EDIT',
          studentNameSnapshot: studentName.trim(),
          issueDate: issueDate || undefined,
          completionDate: completionDate || undefined,
          certificateTitle: certificateTitle.trim() || undefined,
          certificateDescription: certificateDescription.trim() || undefined,
          certificateRole: certificateRole.trim() || undefined,
          signatoryName: signatoryName.trim() || undefined,
          signatoryTitle: signatoryTitle.trim() || undefined,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.certificate) {
        setError(data.error || 'Failed to update certificate record.');
        setIsSubmitting(false);
        return;
      }

      onSuccess(data.certificate);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting certificate correction';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cp-modal-overlay">
      <div className="cp-modal" style={{ maxWidth: '640px', width: '95%' }}>
        <div className="cp-modal-header" style={{ borderBottomColor: '#E2E8F0' }}>
          <div>
            <div className="cp-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>&#x270F;&#xFE0F;</span>
              <span>Edit Issued Certificate</span>
              <code style={{ fontSize: '12px', color: '#1E293B', backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: '4px' }}>
                {certificate.certificateNumber}
              </code>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              In-place administrative correction preserving credential number, cryptographic token, and academic provenance.
            </div>
          </div>
          <button className="cp-modal-close" onClick={onClose} disabled={isSubmitting}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cp-modal-body" style={{ maxHeight: 'calc(85vh - 140px)', overflowY: 'auto', padding: '20px' }}>
            {/* Integrity Notice */}
            <div
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#1E40AF',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>&#x2139;&#xFE0F;</span>
              <span>
                Saving updates this existing record directly. <strong>No duplicate certificate</strong> is generated.
                Identifier: <code>{certificate.certificateNumber}</code>.
              </span>
            </div>

            {error && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  color: '#991B1B',
                  marginBottom: '16px',
                  fontWeight: 600,
                }}
              >
                &#x26A0;&#xFE0F; {error}
              </div>
            )}

            {/* Recipient Full Name */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                  Recipient Full Name <span style={{ color: '#DC2626' }}>*</span>
                </label>
                {authoritativeName && authoritativeName !== studentName && (
                  <button
                    type="button"
                    onClick={() => setStudentName(authoritativeName)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                    title={`Reset to student record: ${authoritativeName}`}
                  >
                    Use Student Record Order ({authoritativeName})
                  </button>
                )}
              </div>
              <input
                type="text"
                className="cp-input"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. DOE John Michael"
                style={{ width: '100%', fontSize: '13px' }}
                required
              />
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Required order: <strong>Last Name (Surname) + First Name + Middle Name</strong>. Rendered on certificate in <strong>Poppins 24px</strong>.
              </div>
            </div>

            {/* Dates row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                  Issue Date
                </label>
                <input
                  type="date"
                  className="cp-input"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                  Completion Date
                </label>
                <input
                  type="date"
                  className="cp-input"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Certificate Title */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                Certificate Title
              </label>
              <input
                type="text"
                className="cp-input"
                value={certificateTitle}
                onChange={(e) => setCertificateTitle(e.target.value)}
                placeholder="Certificate of Completion"
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            {/* Certified Role */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                Professional Role Designation
              </label>
              <input
                type="text"
                className="cp-input"
                value={certificateRole}
                onChange={(e) => setCertificateRole(e.target.value)}
                placeholder="e.g. CyberSecurity Professional"
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            {/* Core Competencies / Description */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                Core Vocational Competencies
              </label>
              <textarea
                className="cp-input"
                rows={2}
                value={certificateDescription}
                onChange={(e) => setCertificateDescription(e.target.value)}
                placeholder="Description of skills and competency domain"
                style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
              />
            </div>

            {/* Signatory Details row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                  Signatory Name
                </label>
                <input
                  type="text"
                  className="cp-input"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  placeholder="Academy Director"
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', display: 'block', marginBottom: '4px' }}>
                  Signatory Title
                </label>
                <input
                  type="text"
                  className="cp-input"
                  value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)}
                  placeholder="Academy Director Signature"
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Documented Correction Reason (Mandatory Audit Requirement) */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B', display: 'block', marginBottom: '4px' }}>
                Correction Reason (Mandatory Audit Trail) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                className="cp-input"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Document why this certificate is being updated (e.g. Corrected surname spelling and middle name order per student passport)"
                style={{ width: '100%', fontSize: '13px', borderColor: '#FCA5A5' }}
                required
              />
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                Recorded permanently in the immutable Clasptek finance audit log with actor ID and timestamp.
              </div>
            </div>
          </div>

          <div
            className="cp-modal-footer"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '14px 20px',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            <button
              type="button"
              className="cp-btn secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cp-btn primary"
              disabled={isSubmitting}
              style={{ minWidth: '120px' }}
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Corrections'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
