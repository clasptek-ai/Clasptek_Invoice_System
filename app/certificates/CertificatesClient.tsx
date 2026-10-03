'use client';

/**
 * app/certificates/CertificatesClient.tsx — Phase 9D
 * Client Component for Certificates Management, Registry, Issuance, Revocation, and Reissuance.
 * Recreates renderCertificatesTab faithfully from clasptek_invoice_system.html.
 */

import React, { useState, useMemo } from 'react';
import type { Certificate, CertificateEligibilityCandidate, PublicCertificateVerification } from '@/types/certificates';
import type { UserRole } from '@/types/auth';
import { CertificateDocument } from '@/components/certificates/CertificateDocument';
import { DEFAULT_CERTIFICATE_TEMPLATES } from '@/lib/certificates/constants';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface Props {
  initialCertificates: Certificate[];
  initialKpis: {
    totalIssued: number;
    totalRevoked: number;
    totalReissued: number;
  };
  eligibleCandidates: CertificateEligibilityCandidate[];
  currentUserRole: UserRole;
  currentUserId: string;
}

export const CertificatesClient: React.FC<Props> = ({
  initialCertificates,
  initialKpis,
  eligibleCandidates: initialEligible,
  currentUserRole,
}) => {
  const [certificates, setCertificates] = useState<Certificate[]>(initialCertificates);
  const [kpis, setKpis] = useState(initialKpis);
  const [eligibleCandidates, setEligibleCandidates] = useState<CertificateEligibilityCandidate[]>(initialEligible);

  // Subtab navigation: 'registry' | 'eligible' | 'templates' | 'verification'
  const [subTab, setSubTab] = useState<'registry' | 'eligible' | 'templates' | 'verification'>('registry');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [revokeCertTarget, setRevokeCertTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const [reissueCertTarget, setReissueCertTarget] = useState<Certificate | null>(null);
  const [reissueReason, setReissueReason] = useState('');
  const [reissueNameOverride, setReissueNameOverride] = useState('');
  const [reissueDate, setReissueDate] = useState(new Date().toISOString().slice(0, 10));

  const [issueCandidateTarget, setIssueCandidateTarget] = useState<CertificateEligibilityCandidate | null>(null);
  const [issueForm, setIssueForm] = useState({
    issueDate: new Date().toISOString().slice(0, 10),
    certificateTitle: 'Certificate of Completion',
    certificateDescription: '',
    certificateRole: '',
  });

  // Standalone Verification Tool State
  const [verifyQuery, setVerifyQuery] = useState('');
  const [verifyResult, setVerifyResult] = useState<PublicCertificateVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const roleLower = (currentUserRole || '').toLowerCase();
  const isAdminOrStaff =
    roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');

  // Refresh certificates from server
  const refreshCertificates = async () => {
    try {
      const res = await fetch('/api/certificates');
      const data = await res.json();
      if (data.success) {
        setCertificates(data.certificates);
        setKpis(data.kpis);
      }
      const elRes = await fetch('/api/certificates/eligibility');
      const elData = await elRes.json();
      if (elData.success) {
        setEligibleCandidates(
          (elData.candidates as CertificateEligibilityCandidate[]).filter((c) => !c.hasActiveCertificate)
        );
      }
    } catch {
      // silent fallback
    }
  };

  // Filtered certificates list
  const filteredCertificates = useMemo(() => {
    return certificates.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchNum = c.certificateNumber.toLowerCase().includes(q);
        const matchName = c.studentNameSnapshot.toLowerCase().includes(q);
        const matchProg = c.programmeNameSnapshot.toLowerCase().includes(q);
        const matchToken = c.verificationToken.toLowerCase().includes(q);
        if (!matchNum && !matchName && !matchProg && !matchToken) return false;
      }
      return true;
    });
  }, [certificates, statusFilter, search]);

  const {
    currentPage: certPage,
    pageSize: certPageSize,
    paginatedItems: paginatedCertificates,
    setPage: setCertPage,
    setPageSize: setCertPageSize,
  } = usePagination(filteredCertificates, {
    initialPageSize: 25,
    resetDeps: [search, statusFilter],
  });

  const {
    currentPage: eligiblePage,
    pageSize: eligiblePageSize,
    paginatedItems: paginatedEligibleCandidates,
    setPage: setEligiblePage,
    setPageSize: setEligiblePageSize,
  } = usePagination(eligibleCandidates, {
    initialPageSize: 25,
    resetDeps: [eligibleCandidates],
  });

  // Multi-row selection for Registry and Eligible Candidates
  const [selectedCertIds, setSelectedCertIds] = useState<Set<string>>(new Set());
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    certIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'CANCEL',
    certIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const visibleCertIds = paginatedCertificates.map((c) => c.id);
  const isAllCertsSelected = visibleCertIds.length > 0 && visibleCertIds.every((id) => selectedCertIds.has(id));
  const certHeaderCheckboxRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (certHeaderCheckboxRef.current) {
      const someSelected = visibleCertIds.some((id) => selectedCertIds.has(id));
      certHeaderCheckboxRef.current.indeterminate = someSelected && !isAllCertsSelected;
    }
  }, [selectedCertIds, visibleCertIds, isAllCertsSelected]);

  const visibleCandidateIds = paginatedEligibleCandidates.map((c) => c.enrolmentId);
  const isAllCandidatesSelected =
    visibleCandidateIds.length > 0 && visibleCandidateIds.every((id) => selectedCandidateIds.has(id));
  const candidateHeaderCheckboxRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (candidateHeaderCheckboxRef.current) {
      const someSelected = visibleCandidateIds.some((id) => selectedCandidateIds.has(id));
      candidateHeaderCheckboxRef.current.indeterminate = someSelected && !isAllCandidatesSelected;
    }
  }, [selectedCandidateIds, visibleCandidateIds, isAllCandidatesSelected]);

  const handleToggleSelectCert = (id: string) => {
    setSelectedCertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllCerts = () => {
    if (isAllCertsSelected) setSelectedCertIds(new Set());
    else setSelectedCertIds(new Set(visibleCertIds));
  };

  const handleClearCertSelection = () => setSelectedCertIds(new Set());

  const handleToggleSelectCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllCandidates = () => {
    if (isAllCandidatesSelected) setSelectedCandidateIds(new Set());
    else setSelectedCandidateIds(new Set(visibleCandidateIds));
  };

  const handleClearCandidateSelection = () => setSelectedCandidateIds(new Set());

  // Open Safe Revocation Modal
  const handleOpenRevokeModal = (ids: string[], targetIdentifier?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'CANCEL',
      certIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected certificate(s)`,
      dependencies: [
        {
          label: 'Digital Verification Token & Historical Ledger',
          count: ids.length,
        },
      ],
      blockedMessage: null,
      isLoading: false,
    });
  };

  // Blocked Hard Deletion Dialog (Academic accreditation preservation)
  const handleOpenDeleteBlockedModal = (ids: string[], targetIdentifier?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'DELETE',
      certIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected certificate(s)`,
      dependencies: [
        {
          label: 'Cryptographic Verification Records & Public Ledger',
          count: ids.length,
        },
      ],
      blockedMessage:
        'Official issued academic credentials cannot be deleted from the database. To invalidate a credential, revoke it with documented audit reasons or reissue with corrected student details.',
      isLoading: false,
    });
  };

  // Confirm Revocation via RecordLifecycleModal
  const handleConfirmLifecycleAction = async (reason: string) => {
    const { certIds, actionType } = lifecycleModal;
    if (certIds.length === 0) return;
    if (actionType === 'DELETE') {
      setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    let revokedCount = 0;
    try {
      for (const id of certIds) {
        const res = await fetch(`/api/certificates/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || 'Revoked via credentials administrator' }),
        });
        if (res.ok) revokedCount++;
      }

      setLifecycleModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
      handleClearCertSelection();
      setSuccessToast(`Revoked ${revokedCount} certificate credential(s).`);
      await refreshCertificates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error revoking certificate';
      setErrorMessage(msg);
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Bulk Issue Certificates for selected candidates
  const handleBulkIssueSelected = async () => {
    const candidatesToIssue = eligibleCandidates.filter((c) => selectedCandidateIds.has(c.enrolmentId));
    if (candidatesToIssue.length === 0) return;

    setIsLoading(true);
    let issuedCount = 0;
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const c of candidatesToIssue) {
        const res = await fetch('/api/certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrolmentId: c.enrolmentId,
            issueDate: today,
            certificateTitle: 'Certificate of Completion',
            certificateDescription: `${c.programmeName} Core Vocational Competencies`,
            certificateRole: `${c.programmeName} Professional`,
          }),
        });
        if (res.ok) issuedCount++;
      }

      handleClearCandidateSelection();
      setSuccessToast(`Successfully issued ${issuedCount} certificate(s)!`);
      await refreshCertificates();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error in bulk certificate issuance');
    } finally {
      setIsLoading(false);
    }
  };
  const handleOpenIssueModal = (candidate: CertificateEligibilityCandidate) => {
    const isCyber = candidate.programmeName.toLowerCase().includes('cyber');
    const isData = candidate.programmeName.toLowerCase().includes('data');

    setIssueForm({
      issueDate: new Date().toISOString().slice(0, 10),
      certificateTitle: 'Certificate of Completion',
      certificateDescription: isCyber
        ? 'Threat Detection, Network Security, Risk Mitigation, and use of industry-standard tools.'
        : isData
        ? 'Data Analysis, Data Cleaning and Data Visualization'
        : `${candidate.programmeName} Core Vocational Competencies`,
      certificateRole: isCyber
        ? 'CyberSecurity Professional'
        : isData
        ? 'Data Analyst Professional'
        : `${candidate.programmeName} Professional`,
    });
    setIssueCandidateTarget(candidate);
    setErrorMessage(null);
  };

  const handleConfirmIssueCert = async () => {
    if (!issueCandidateTarget) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrolmentId: issueCandidateTarget.enrolmentId,
          issueDate: issueForm.issueDate,
          certificateTitle: issueForm.certificateTitle,
          certificateDescription: issueForm.certificateDescription,
          certificateRole: issueForm.certificateRole,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.certificate) {
        setErrorMessage(data.error || 'Failed to issue certificate');
      } else {
        setSuccessToast(`Certificate ${data.certificate.certificateNumber} issued successfully!`);
        setIssueCandidateTarget(null);
        setSelectedCert(data.certificate);
        await refreshCertificates();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error issuing certificate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeCertTarget) return;
    if (!revokeReason.trim()) {
      setErrorMessage('A documented justification reason is required for certificate revocation.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/certificates/${revokeCertTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Failed to revoke certificate');
      } else {
        setSuccessToast(`Certificate ${revokeCertTarget.certificateNumber} has been revoked.`);
        setRevokeCertTarget(null);
        setRevokeReason('');
        await refreshCertificates();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error revoking certificate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReissue = async () => {
    if (!reissueCertTarget) return;
    if (!reissueReason.trim()) {
      setErrorMessage('A documented justification reason is required for certificate reissuance.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/certificates/${reissueCertTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reissueReason.trim(),
          issueDate: reissueDate,
          studentNameOverride: reissueNameOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.certificate) {
        setErrorMessage(data.error || 'Failed to reissue certificate');
      } else {
        setSuccessToast(`Certificate reissued as ${data.certificate.certificateNumber}!`);
        setReissueCertTarget(null);
        setReissueReason('');
        setSelectedCert(data.certificate);
        await refreshCertificates();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error reissuing certificate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunVerification = async () => {
    if (!verifyQuery.trim()) return;
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch(`/api/certificates/verify/${encodeURIComponent(verifyQuery.trim())}`);
      const data: PublicCertificateVerification = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({
        found: false,
        isValid: false,
        status: 'NOT_FOUND',
        message: 'Network error communicating with credential verification service.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Safe RFC-4180 CSV export
  const exportCsv = () => {
    const sanitize = (val: string | number | null | undefined): string => {
      let str = String(val ?? '').trim();
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Certificate #',
      'Student Name',
      'Awarded Role',
      'Programme',
      'Issue Date',
      'Completion Date',
      'Verification Token',
      'Status',
      'Revocation Reason',
    ];

    const rows = filteredCertificates.map((c) => [
      sanitize(c.certificateNumber),
      sanitize(c.studentNameSnapshot),
      sanitize(c.certificateRoleSnapshot),
      sanitize(c.programmeNameSnapshot),
      sanitize(c.issueDate),
      sanitize(c.completionDate),
      sanitize(c.verificationToken),
      sanitize(c.status),
      sanitize(c.revocationReason || 'N/A'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clasptek_certificates_registry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#059669',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <span>&#x2714;</span>
          <span>{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '16px',
              marginLeft: '8px',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              color: '#14213D',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>&#x1F4DC;</span> Certificates of Completion
          </h1>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Dynamic credential issuance, programme-dependent competency mapping, tamper-evident cryptographic
            verification, and audited provenance.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="cp-btn secondary sm" onClick={exportCsv} title="Export certificates ledger to CSV">
            &#x1F4E5; Export CSV
          </button>
          <button
            className="cp-btn secondary sm"
            onClick={() => {
              setSubTab('verification');
            }}
          >
            &#x1F50D; Verify Credential
          </button>
          {isAdminOrStaff && (
            <button
              className="cp-btn primary sm"
              onClick={() => {
                setSubTab('eligible');
              }}
            >
              + Issue New Certificate
            </button>
          )}
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Total Active Certificates
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{kpis.totalIssued}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Authoritative Credentials</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Revoked Credentials
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: kpis.totalRevoked > 0 ? '#DC2626' : '#94A3B8',
              marginTop: '4px',
            }}
          >
            {kpis.totalRevoked}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Audited Cancellations</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Reissued Credentials
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#14213D', marginTop: '4px' }}>
            {kpis.totalReissued}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>With Provenance Links</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Eligible Awaiting Issuance
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#C1272D', marginTop: '4px' }}>
            {eligibleCandidates.length}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Verified Candidates Ready</div>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          borderBottom: '1px solid #E2E8F0',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setSubTab('registry')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            color: subTab === 'registry' ? '#14213D' : '#64748B',
            borderBottom: `2px solid ${subTab === 'registry' ? '#14213D' : 'transparent'}`,
          }}
        >
          &#x1F4DC; Issued Registry ({certificates.length})
        </button>

        <button
          onClick={() => setSubTab('eligible')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            color: subTab === 'eligible' ? '#14213D' : '#64748B',
            borderBottom: `2px solid ${subTab === 'eligible' ? '#14213D' : 'transparent'}`,
          }}
        >
          &#x2714;&#xFE0F; Eligible Candidates ({eligibleCandidates.length})
        </button>

        <button
          onClick={() => setSubTab('templates')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            color: subTab === 'templates' ? '#14213D' : '#64748B',
            borderBottom: `2px solid ${subTab === 'templates' ? '#14213D' : 'transparent'}`,
          }}
        >
          &#x1F5BC;&#xFE0F; Templates &amp; Versioning ({DEFAULT_CERTIFICATE_TEMPLATES.length})
        </button>

        <button
          onClick={() => setSubTab('verification')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            color: subTab === 'verification' ? '#14213D' : '#64748B',
            borderBottom: `2px solid ${subTab === 'verification' ? '#14213D' : 'transparent'}`,
          }}
        >
          &#x1F50E; Verification Tool
        </button>
      </div>

      {/* ===================== SUBTAB 1: REGISTRY ===================== */}
      {subTab === 'registry' && (
        <div className="cp-card">
          <div
            className="cp-card-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#14213D' }}>
                &#x1F50D; Credential Registry &amp; Verification Tokens
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Search certificates, verify digital tokens, or manage revocation with full audit logging.
              </div>
            </div>

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="cp-input"
                style={{ width: '240px', fontSize: '12px' }}
                placeholder="Search cert #, student, programme..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="cp-input"
                style={{ fontSize: '12px', minWidth: '140px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="ISSUED">Active (Issued)</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </div>
          </div>

          {/* Selection Bar for Certificates */}
          <TableSelectionBar
            selectedCount={selectedCertIds.size}
            totalVisibleCount={visibleCertIds.length}
            entityLabel="certificate"
            onSelectAllVisible={handleToggleSelectAllCerts}
            isAllSelected={isAllCertsSelected}
            onClearSelection={handleClearCertSelection}
          >
            {isAdminOrStaff && (
              <>
                <button
                  type="button"
                  className="cp-btn sm danger"
                  onClick={() => handleOpenRevokeModal(Array.from(selectedCertIds))}
                  title="Revoke selected certificates"
                >
                  🛑 Revoke Selected ({selectedCertIds.size})
                </button>
                <button
                  type="button"
                  className="cp-btn sm secondary"
                  onClick={() => handleOpenDeleteBlockedModal(Array.from(selectedCertIds))}
                  title="Check deletion policy for certificates"
                >
                  ℹ️ Deletion Policy
                </button>
              </>
            )}
          </TableSelectionBar>

          {filteredCertificates.length === 0 ? (
            <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#x1F4DC;</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#14213D' }}>No certificates found</div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Issued credentials will be recorded here with cryptographic tokens and historical snapshots.
              </div>
            </div>
          ) : (
            <>
              {/* Desktop & Tablet Table */}
              <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          ref={certHeaderCheckboxRef}
                          checked={isAllCertsSelected}
                          onChange={handleToggleSelectAllCerts}
                          aria-label="Select all visible certificates"
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Certificate #
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Student Name
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Awarded Role &amp; Programme
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Issue Date
                      </th>
                      <th className="cp-col-secondary" style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Verification Token
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Status
                      </th>
                      <th
                        style={{
                          padding: '12px 14px',
                          fontSize: '11.5px',
                          color: '#475569',
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCertificates.map((cert) => {
                      const isSelected = selectedCertIds.has(cert.id);
                      const isIssued = cert.status === 'ISSUED';
                      const roleName = cert.certificateRoleSnapshot || 'Certified Professional';

                      return (
                        <tr
                          key={cert.id}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            verticalAlign: 'middle',
                            fontSize: '12.5px',
                            backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                          }}
                        >
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCert(cert.id)}
                              aria-label={`Select certificate ${cert.certificateNumber}`}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: '#14213D',
                            }}
                          >
                            {cert.certificateNumber}
                          </td>

                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1E293B' }}>
                            {cert.studentNameSnapshot}
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#C1272D', fontSize: '12px' }}>{roleName}</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>{cert.programmeNameSnapshot}</div>
                          </td>

                          <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>
                            {cert.issueDate}
                          </td>

                          <td className="cp-col-secondary" style={{ padding: '12px 14px', fontSize: '11px', fontFamily: 'monospace' }}>
                            <code
                              style={{ backgroundColor: '#F1F5F9', padding: '3px 6px', borderRadius: '4px' }}
                              title={cert.verificationToken}
                            >
                              {cert.verificationToken.slice(0, 16)}...
                            </code>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <span
                              className={`cp-pill ${isIssued ? 'paid' : 'danger'}`}
                              style={{ fontSize: '10.5px' }}
                            >
                              {cert.status}
                            </span>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => setSelectedCert(cert)}
                                title="View & Print Certificate"
                              >
                                View / Print
                              </button>
                              {isAdminOrStaff &&
                                (isIssued ? (
                                  <button
                                    className="cp-btn sm danger"
                                    onClick={() => {
                                      setRevokeCertTarget(cert);
                                      setRevokeReason('');
                                      setErrorMessage(null);
                                    }}
                                    title="Revoke Certificate"
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <button
                                    className="cp-btn sm secondary"
                                    style={{ color: '#14213D', borderColor: '#CBD5E1' }}
                                    onClick={() => {
                                      setReissueCertTarget(cert);
                                      setReissueReason('');
                                      setReissueNameOverride('');
                                      setErrorMessage(null);
                                    }}
                                    title="Reissue Certificate"
                                  >
                                    Reissue
                                  </button>
                                ))}
                              <button
                                type="button"
                                className="cp-btn sm danger"
                                onClick={() => handleOpenDeleteBlockedModal([cert.id], cert.certificateNumber)}
                                title="Check deletion policy / block casual delete"
                                style={{ padding: '4px 8px' }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Stack */}
              <div className="cp-cards-mobile" style={{ padding: '12px' }}>
                {paginatedCertificates.map((cert) => {
                  const isSelected = selectedCertIds.has(cert.id);
                  const isIssued = cert.status === 'ISSUED';
                  const roleName = cert.certificateRoleSnapshot || 'Certified Professional';

                  return (
                    <div
                      key={cert.id}
                      className="cp-mobile-record-card"
                      style={{
                        borderLeft: isSelected ? '4px solid var(--primary, #0284c7)' : undefined,
                      }}
                      onClick={() => handleToggleSelectCert(cert.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleToggleSelectCert(cert.id)}
                      aria-label={`Select certificate ${cert.certificateNumber}`}
                    >
                      <div className="cp-mobile-record-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSelectCert(cert.id);
                            }}
                            aria-label={`Select certificate ${cert.certificateNumber}`}
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {cert.studentNameSnapshot}
                            </h4>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {roleName} &bull; {cert.programmeNameSnapshot}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            {cert.certificateNumber}
                          </span>
                          <span
                            className={`cp-pill ${isIssued ? 'paid' : 'danger'}`}
                            style={{ fontSize: '10px' }}
                          >
                            {cert.status}
                          </span>
                        </div>
                      </div>

                      <div className="cp-mobile-record-grid">
                        <div className="cp-mobile-record-field">
                          <span className="cp-mobile-record-label">Issue Date</span>
                          <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                            {cert.issueDate}
                          </span>
                        </div>
                        <div className="cp-mobile-record-field">
                          <span className="cp-mobile-record-label">Token ID</span>
                          <span className="cp-mobile-record-value" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 400 }}>
                            {cert.verificationToken.slice(0, 12)}...
                          </span>
                        </div>
                      </div>

                      <div className="cp-mobile-record-actions">
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCert(cert);
                          }}
                          style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                        >
                          View / Print Certificate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Standard Pagination */}
              <Pagination
                currentPage={certPage}
                pageSize={certPageSize}
                totalRecords={filteredCertificates.length}
                onPageChange={setCertPage}
                onPageSizeChange={setCertPageSize}
                entityLabel="certificates"
              />
            </>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 2: ELIGIBLE CANDIDATES ===================== */}
      {subTab === 'eligible' && (
        <div className="cp-card">
          <div
            className="cp-card-header"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#14213D' }}>
              &#x2714;&#xFE0F; Verified Trainees Awaiting Certificate Issuance
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Students whose training completion has been verified (&ge;80% attendance or administrative override) and
              are ready for certificate creation.
            </div>
          </div>

          {/* Selection Bar for Eligible Candidates */}
          <TableSelectionBar
            selectedCount={selectedCandidateIds.size}
            totalVisibleCount={visibleCandidateIds.length}
            entityLabel="candidate"
            onSelectAllVisible={handleToggleSelectAllCandidates}
            isAllSelected={isAllCandidatesSelected}
            onClearSelection={handleClearCandidateSelection}
          >
            {isAdminOrStaff && (
              <button
                type="button"
                className="cp-btn sm accent"
                onClick={handleBulkIssueSelected}
                title="Bulk issue certificates for selected trainees"
              >
                🎓 Issue Selected ({selectedCandidateIds.size})
              </button>
            )}
          </TableSelectionBar>

          {eligibleCandidates.length === 0 ? (
            <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#x1F3C5;</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#14213D' }}>
                All eligible candidates have been issued certificates
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Verify more students in Certificate Eligibility to authorize new credentials.
              </div>
            </div>
          ) : (
            <>
              {/* Desktop & Tablet Table */}
              <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          ref={candidateHeaderCheckboxRef}
                          checked={isAllCandidatesSelected}
                          onChange={handleToggleSelectAllCandidates}
                          aria-label="Select all visible candidates"
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Enrolment #
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Candidate
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Programme &amp; Cohort
                      </th>
                      <th
                        style={{
                          padding: '12px 14px',
                          fontSize: '11.5px',
                          color: '#475569',
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        Attendance
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                        Completion Status
                      </th>
                      <th
                        style={{
                          padding: '12px 14px',
                          fontSize: '11.5px',
                          color: '#475569',
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEligibleCandidates.map((c) => {
                      const isSelected = selectedCandidateIds.has(c.enrolmentId);
                      return (
                        <tr
                          key={c.enrolmentId}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            verticalAlign: 'middle',
                            fontSize: '12.5px',
                            backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                          }}
                        >
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCandidate(c.enrolmentId)}
                              aria-label={`Select candidate ${c.studentName}`}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#14213D' }}>
                            {c.enrolmentNumber}
                          </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1E293B' }}>{c.studentName}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{c.programmeName}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{c.cohortName}</div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                          {c.attendancePct}%
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="cp-pill paid" style={{ fontSize: '10.5px' }}>
                            ✔ VERIFIED
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {isAdminOrStaff && (
                            <button
                              className="cp-btn sm accent"
                              onClick={() => handleOpenIssueModal(c)}
                              title="Issue official certificate"
                            >
                              + Issue Certificate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Stack */}
              <div className="cp-cards-mobile" style={{ padding: '12px' }}>
                {paginatedEligibleCandidates.map((c) => (
                  <div key={c.enrolmentId} className="cp-mobile-record-card">
                    <div className="cp-mobile-record-header">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {c.studentName}
                        </h4>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {c.programmeName} &bull; {c.cohortName}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {c.enrolmentNumber}
                        </span>
                        <span className="cp-pill paid" style={{ fontSize: '10px' }}>
                          ✔ VERIFIED
                        </span>
                      </div>
                    </div>

                    <div className="cp-mobile-record-grid">
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Attendance Rate</span>
                        <span className="cp-mobile-record-value" style={{ color: '#059669', fontSize: '14px' }}>
                          {c.attendancePct}%
                        </span>
                      </div>
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Benchmark</span>
                        <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>&ge; 80% Achieved</span>
                      </div>
                    </div>

                    {isAdminOrStaff && (
                      <div className="cp-mobile-record-actions">
                        <button
                          type="button"
                          className="cp-btn sm accent"
                          onClick={() => handleOpenIssueModal(c)}
                          style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                        >
                          + Issue Certificate
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Standard Pagination */}
              <Pagination
                currentPage={eligiblePage}
                pageSize={eligiblePageSize}
                totalRecords={eligibleCandidates.length}
                onPageChange={setEligiblePage}
                onPageSizeChange={setEligiblePageSize}
                entityLabel="candidates"
              />
            </>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 3: TEMPLATES ===================== */}
      {subTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {DEFAULT_CERTIFICATE_TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="cp-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span
                  style={{
                    backgroundColor: tpl.isDefault ? '#ECFDF5' : '#F1F5F9',
                    color: tpl.isDefault ? '#059669' : '#64748B',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {tpl.isDefault ? 'Default Active Template' : 'Executive Template'}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Version {tpl.version}</span>
              </div>

              <div style={{ fontSize: '16px', fontWeight: 800, color: '#14213D', marginBottom: '6px' }}>
                {tpl.name}
              </div>

              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: '1.5', marginBottom: '16px' }}>
                {tpl.description}
              </div>

              <div style={{ fontSize: '12px', color: '#475569', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div>
                  <strong>Format:</strong> A4 Landscape (841.89 &times; 595.28 pt)
                </div>
                <div>
                  <strong>Verification:</strong> High-Resolution ISO/IEC Vector QR Code
                </div>
                <div>
                  <strong>Security:</strong> Immutable Student &amp; Competency Snapshot
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================== SUBTAB 4: VERIFICATION TOOL ===================== */}
      {subTab === 'verification' && (
        <div className="cp-card" style={{ maxWidth: '720px', margin: '0 auto', padding: '24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#x1F50E;</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#14213D' }}>
              Official Credential Verification Service
            </div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
              Verify authentic Clasptek certificates by entering the canonical Certificate Number or cryptographic token.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input
              type="text"
              className="cp-input"
              style={{ flex: 1, fontSize: '13px' }}
              placeholder="e.g. CERT-2026-1001 or vtok_..."
              value={verifyQuery}
              onChange={(e) => setVerifyQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunVerification()}
            />
            <button
              className="cp-btn primary"
              onClick={handleRunVerification}
              disabled={isVerifying || !verifyQuery.trim()}
            >
              {isVerifying ? 'Verifying...' : 'Verify Credential'}
            </button>
          </div>

          {verifyResult && (
            <div
              style={{
                backgroundColor: verifyResult.found ? (verifyResult.isValid ? '#F0FDF4' : '#FEF2F2') : '#F8FAFC',
                border: `1px solid ${
                  verifyResult.found ? (verifyResult.isValid ? '#BBF7D0' : '#FCA5A5') : '#E2E8F0'
                }`,
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              {verifyResult.found ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{verifyResult.isValid ? '✔' : '✖'}</span>
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 800,
                        color: verifyResult.isValid ? '#166534' : '#991B1B',
                      }}
                    >
                      {verifyResult.isValid ? 'Officially Verified & Active' : 'Revoked Credential'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>
                      <strong>Certificate #:</strong> {verifyResult.certificateNumber}
                    </div>
                    <div>
                      <strong>Student Name:</strong> {verifyResult.studentName}
                    </div>
                    <div>
                      <strong>Awarded Role:</strong> {verifyResult.certificateRole}
                    </div>
                    <div>
                      <strong>Programme:</strong> {verifyResult.programmeName}
                    </div>
                    <div>
                      <strong>Issue Date:</strong> {verifyResult.issueDate}
                    </div>
                    <div>
                      <strong>Status:</strong>{' '}
                      <span className={`cp-pill ${verifyResult.isValid ? 'paid' : 'danger'}`}>
                        {verifyResult.status}
                      </span>
                    </div>
                  </div>

                  {verifyResult.status === 'REVOKED' && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #FCA5A5',
                        borderRadius: '6px',
                        color: '#991B1B',
                        fontSize: '12px',
                      }}
                    >
                      <strong>Revocation Reason:</strong> {verifyResult.revocationReason || 'N/A'}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                  {verifyResult.message || 'No official certificate was found matching the identifier.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== MODAL: VIEW / PRINT CERTIFICATE ===================== */}
      {selectedCert && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '1000px', width: '95%' }}>
            <div className="cp-modal-header">
              <div>
                <div className="cp-modal-title">&#x1F393; Official Certificate of Completion</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Credential {selectedCert.certificateNumber} for {selectedCert.studentNameSnapshot}.
                </div>
              </div>
              <button className="cp-modal-close" onClick={() => setSelectedCert(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body" style={{ backgroundColor: '#F8FAFC', padding: '20px', overflowX: 'auto' }}>
              <CertificateDocument certificate={selectedCert} />

              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Verification URL:</strong>
                  <code style={{ backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                    {selectedCert.verificationUrl || `/verify-certificate/${selectedCert.certificateNumber}`}
                  </code>
                  <button
                    className="cp-btn sm secondary"
                    onClick={() => {
                      const url =
                        selectedCert.verificationUrl ||
                        `${window.location.origin}/verify-certificate/${selectedCert.certificateNumber}`;
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(url).then(() => alert('Verification link copied to clipboard!'));
                      } else {
                        prompt('Copy link:', url);
                      }
                    }}
                  >
                    Copy Link
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>
                    Status:{' '}
                    <span className={`cp-pill ${selectedCert.status === 'ISSUED' ? 'paid' : 'danger'}`}>
                      {selectedCert.status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="cp-btn secondary" onClick={() => setSelectedCert(null)}>
                Close
              </button>
              <button
                className="cp-btn primary"
                onClick={() => {
                  window.print();
                }}
              >
                &#x1F5B6; Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: REVOKE CERTIFICATE ===================== */}
      {revokeCertTarget && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '520px' }}>
            <div className="cp-modal-header" style={{ borderBottomColor: '#FEE2E2' }}>
              <div className="cp-modal-title" style={{ color: '#DC2626' }}>
                &#x26A0; Revoke Official Certificate
              </div>
              <button className="cp-modal-close" onClick={() => setRevokeCertTarget(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#991B1B',
                }}
              >
                Certificate No: <strong>{revokeCertTarget.certificateNumber}</strong>
                <br />
                Student: <strong>{revokeCertTarget.studentNameSnapshot}</strong>
              </div>

              <div className="cp-field">
                <label style={{ color: '#991B1B', fontWeight: 700 }}>
                  Mandatory Justification Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  className="cp-input"
                  rows={3}
                  placeholder="Document the justification for revocation (e.g. erroneous signoff, identity correction)..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                />
              </div>

              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setRevokeCertTarget(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="cp-btn danger"
                onClick={handleConfirmRevoke}
                disabled={isLoading}
              >
                {isLoading ? 'Revoking...' : '&#x26A0; Confirm Revocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: REISSUE CERTIFICATE ===================== */}
      {reissueCertTarget && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '560px' }}>
            <div className="cp-modal-header">
              <div>
                <div className="cp-modal-title">&#x1F4DC; Reissue Certificate of Completion</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Reissuing creates a replacement credential linked to the previous record.
                </div>
              </div>
              <button className="cp-modal-close" onClick={() => setReissueCertTarget(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                }}
              >
                <div>
                  Original Certificate: <strong>{reissueCertTarget.certificateNumber}</strong>
                </div>
                <div>
                  Student: <strong>{reissueCertTarget.studentNameSnapshot}</strong>
                </div>
                <div>
                  Status:{' '}
                  <span className={`cp-pill ${reissueCertTarget.status === 'ISSUED' ? 'paid' : 'danger'}`}>
                    {reissueCertTarget.status}
                  </span>
                </div>
              </div>

              <div className="cp-field" style={{ marginBottom: '12px' }}>
                <label>New Issue Date</label>
                <input
                  type="date"
                  className="cp-input"
                  value={reissueDate}
                  onChange={(e) => setReissueDate(e.target.value)}
                />
              </div>

              <div className="cp-field" style={{ marginBottom: '12px' }}>
                <label>Name Correction / Override (Leave blank to keep current name)</label>
                <input
                  type="text"
                  className="cp-input"
                  placeholder={reissueCertTarget.studentNameSnapshot}
                  value={reissueNameOverride}
                  onChange={(e) => setReissueNameOverride(e.target.value)}
                />
              </div>

              <div className="cp-field">
                <label style={{ fontWeight: 700 }}>
                  Mandatory Reissue Justification Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  className="cp-input"
                  rows={2}
                  placeholder="Document the administrative reason for reissuance (e.g. legal name update)..."
                  value={reissueReason}
                  onChange={(e) => setReissueReason(e.target.value)}
                />
              </div>

              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setReissueCertTarget(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="cp-btn primary"
                onClick={handleConfirmReissue}
                disabled={isLoading}
              >
                {isLoading ? 'Reissuing...' : '✔ Confirm Reissuance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ISSUE CERTIFICATE FROM ELIGIBLE ===================== */}
      {issueCandidateTarget && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '620px' }}>
            <div className="cp-modal-header">
              <div>
                <div className="cp-modal-title">&#x1F393; Issue Certificate of Completion</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Award an authoritative credential with dynamic competency snapshot.
                </div>
              </div>
              <button className="cp-modal-close" onClick={() => setIssueCandidateTarget(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#14213D' }}>
                  {issueCandidateTarget.studentName}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                  {issueCandidateTarget.programmeName} &middot; {issueCandidateTarget.cohortName}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                  Completion Status: <span className="cp-pill paid" style={{ fontSize: '10px' }}>VERIFIED</span> &middot;
                  Attendance: <strong>{issueCandidateTarget.attendancePct}%</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="cp-field">
                  <label>Date of Issuance</label>
                  <input
                    type="date"
                    className="cp-input"
                    value={issueForm.issueDate}
                    onChange={(e) => setIssueForm({ ...issueForm, issueDate: e.target.value })}
                  />
                </div>
                <div className="cp-field">
                  <label>Certificate Title</label>
                  <input
                    type="text"
                    className="cp-input"
                    value={issueForm.certificateTitle}
                    onChange={(e) => setIssueForm({ ...issueForm, certificateTitle: e.target.value })}
                  />
                </div>
              </div>

              <div className="cp-field" style={{ marginBottom: '12px' }}>
                <label>Core Competencies Statement (Description)</label>
                <textarea
                  className="cp-input"
                  rows={2}
                  value={issueForm.certificateDescription}
                  onChange={(e) => setIssueForm({ ...issueForm, certificateDescription: e.target.value })}
                />
              </div>

              <div className="cp-field" style={{ marginBottom: '12px' }}>
                <label>Awarded Professional Role</label>
                <input
                  type="text"
                  className="cp-input"
                  value={issueForm.certificateRole}
                  onChange={(e) => setIssueForm({ ...issueForm, certificateRole: e.target.value })}
                />
              </div>

              <div
                style={{
                  fontSize: '11.5px',
                  color: '#64748B',
                  marginTop: '10px',
                  lineHeight: '1.5',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  padding: '10px',
                  borderRadius: '6px',
                }}
              >
                &#x2139; <strong>Immutability Guarantee:</strong> Issuing this certificate permanently snapshots the
                student&apos;s name, programme, core competencies, and role. Future profile edits will never modify this
                credential.
              </div>

              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setIssueCandidateTarget(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="cp-btn primary"
                onClick={handleConfirmIssueCert}
                disabled={isLoading}
              >
                {isLoading ? 'Issuing...' : '✔ Issue Official Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Record Lifecycle Modal (Revoke / Block Deletion) */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Certificate Credential"
        recordIdentifier={lifecycleModal.recordIdentifier}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        requireReason={lifecycleModal.actionType === 'CANCEL'}
        reasonPlaceholder="Document reason for certificate revocation..."
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmLifecycleAction}
      />
    </div>
  );
};
