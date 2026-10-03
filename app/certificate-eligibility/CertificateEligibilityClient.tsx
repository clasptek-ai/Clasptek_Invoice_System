'use client';

/**
 * app/certificate-eligibility/CertificateEligibilityClient.tsx — Phase 9D
 * Client Component for Certificate Eligibility & Training Completion Signoff.
 * Recreates renderCompletionsTab faithfully with certified Clasptek design tokens.
 */

import React, { useState, useMemo } from 'react';
import type { CertificateEligibilityCandidate, Certificate } from '@/types/certificates';
import type { UserRole } from '@/types/auth';
import { CertificateDocument } from '@/components/certificates/CertificateDocument';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { RecordLifecycleModal } from '@/components/tables/RecordLifecycleModal';

interface CohortItem {
  id: string;
  cohortCode: string;
  name: string;
}

interface Props {
  initialCandidates: CertificateEligibilityCandidate[];
  initialKpis: {
    totalCandidates: number;
    attendanceEligible: number;
    verifiedCompletions: number;
    belowThreshold: number;
  };
  cohorts: CohortItem[];
  currentUserRole: UserRole;
  currentUserId: string;
}

export const CertificateEligibilityClient: React.FC<Props> = ({
  initialCandidates,
  initialKpis,
  cohorts,
  currentUserRole,
}) => {
  const [candidates, setCandidates] = useState<CertificateEligibilityCandidate[]>(initialCandidates);
  const [kpis, setKpis] = useState(initialKpis);

  // Selection & Lifecycle state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    candidate?: CertificateEligibilityCandidate;
  }>({ isOpen: false });

  // Filters
  const [search, setSearch] = useState('');
  const [cohortFilter, setCohortFilter] = useState('ALL');
  const [eligibilityFilter, setEligibilityFilter] = useState('ALL');

  // Modals state
  const [verifyCandidate, setVerifyCandidate] = useState<CertificateEligibilityCandidate | null>(null);
  const [overrideCandidate, setOverrideCandidate] = useState<CertificateEligibilityCandidate | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [issueCandidate, setIssueCandidate] = useState<CertificateEligibilityCandidate | null>(null);
  const [viewCert, setViewCert] = useState<Certificate | null>(null);

  // Form states
  const [issueForm, setIssueForm] = useState({
    issueDate: new Date().toISOString().slice(0, 10),
    certificateTitle: 'Certificate of Completion',
    certificateDescription: '',
    certificateRole: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const roleLower = (currentUserRole || '').toLowerCase();
  const isAdminOrStaff =
    roleLower.includes('admin') || roleLower.includes('staff') || roleLower.includes('finance manager');

  // Refetch data
  const refreshData = async () => {
    try {
      const params = new URLSearchParams();
      if (cohortFilter !== 'ALL') params.set('cohortId', cohortFilter);
      if (eligibilityFilter !== 'ALL') params.set('eligibilityFilter', eligibilityFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/certificates/eligibility?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCandidates(json.candidates);
        setKpis(json.kpis);
      }
    } catch {
      // silent fallback
    }
  };

  // Filtered in-memory list
  const filteredList = useMemo(() => {
    return candidates.filter((c) => {
      if (cohortFilter !== 'ALL' && c.cohortId !== cohortFilter) return false;
      if (eligibilityFilter === 'ELIGIBLE' && !c.isAttendanceEligible) return false;
      if (eligibilityFilter === 'BELOW_THRESHOLD' && (c.isAttendanceEligible || c.isVerified)) return false;
      if (eligibilityFilter === 'VERIFIED' && !c.isVerified) return false;
      if (eligibilityFilter === 'UNVERIFIED' && c.isVerified) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = c.studentName.toLowerCase().includes(q);
        const matchNum = c.enrolmentNumber.toLowerCase().includes(q);
        const matchEmail = (c.studentEmail || '').toLowerCase().includes(q);
        const matchProg = c.programmeName.toLowerCase().includes(q);
        const matchCert = (c.activeCertificateNumber || '').toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchEmail && !matchProg && !matchCert) return false;
      }
      return true;
    });
  }, [candidates, cohortFilter, eligibilityFilter, search]);

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedCandidates,
    setPage,
    setPageSize,
  } = usePagination(filteredList, {
    initialPageSize: 25,
    resetDeps: [candidates, cohortFilter, eligibilityFilter, search],
  });

  // Selection handlers & computed properties
  const visibleIds = useMemo(() => paginatedCandidates.map((c) => c.enrolmentId), [paginatedCandidates]);
  const isAllSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id)),
    [visibleIds, selectedIds]
  );
  const isIndeterminate = useMemo(() => {
    const count = visibleIds.filter((id) => selectedIds.has(id)).length;
    return count > 0 && count < visibleIds.length;
  }, [visibleIds, selectedIds]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkVerifySelected = async () => {
    const eligibleSelected = candidates.filter(
      (c) => selectedIds.has(c.enrolmentId) && c.isAttendanceEligible && !c.isVerified
    );
    if (eligibleSelected.length === 0) {
      setErrorMessage('None of the selected candidates meet the ≥80% attendance benchmark for verification.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/certificates/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          enrolmentIds: eligibleSelected.map((c) => c.enrolmentId),
          notes: 'Batch completion signoff based on delivered session attendance',
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Failed to verify selected candidates');
      } else {
        setSuccessToast(`Verified completion for ${eligibleSelected.length} candidate(s)`);
        handleClearSelection();
        await refreshData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error executing bulk verification');
    } finally {
      setIsLoading(false);
    }
  };

  // Action handlers
  const handleConfirmVerify = async () => {
    if (!verifyCandidate) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/certificates/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          enrolmentId: verifyCandidate.enrolmentId,
          notes: 'Administrative verification based on delivered session attendance',
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Failed to verify completion');
      } else {
        setSuccessToast(`Completion verified for ${verifyCandidate.studentName}`);
        setVerifyCandidate(null);
        await refreshData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error executing verification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmOverride = async () => {
    if (!overrideCandidate) return;
    if (!overrideReason.trim()) {
      setErrorMessage('A documented justification reason is required for administrative completion overrides.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/certificates/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'override',
          enrolmentId: overrideCandidate.enrolmentId,
          overrideReason: overrideReason.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Failed to grant override');
      } else {
        setSuccessToast(`Administrative override granted for ${overrideCandidate.studentName}`);
        setOverrideCandidate(null);
        setOverrideReason('');
        await refreshData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error executing override');
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
    setIssueCandidate(candidate);
    setErrorMessage(null);
  };

  const handleConfirmIssueCert = async () => {
    if (!issueCandidate) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrolmentId: issueCandidate.enrolmentId,
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
        setIssueCandidate(null);
        setViewCert(data.certificate);
        await refreshData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error issuing certificate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewCert = async (certId: string) => {
    try {
      const res = await fetch(`/api/certificates/${certId}`);
      const data = await res.json();
      if (data.success && data.certificate) {
        setViewCert(data.certificate);
      }
    } catch {
      alert('Could not load certificate');
    }
  };

  // Safe RFC-4180 CSV export with formula injection prevention
  const exportCsv = (selectedOnly: boolean = false) => {
    const sanitize = (val: string | number | null | undefined): string => {
      let str = String(val ?? '').trim();
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Enrolment #',
      'Student Name',
      'Student Email',
      'Programme',
      'Cohort',
      'Delivered Sessions',
      'Attended Sessions',
      'Attendance %',
      'Eligibility Status',
      'Completion Signoff',
      'Certificate #',
    ];

    const sourceList = selectedOnly
      ? filteredList.filter((c) => selectedIds.has(c.enrolmentId))
      : filteredList;

    const rows = sourceList.map((c) => [
      sanitize(c.enrolmentNumber),
      sanitize(c.studentName),
      sanitize(c.studentEmail),
      sanitize(c.programmeName),
      sanitize(c.cohortName),
      sanitize(c.totalDeliveredSessions),
      sanitize(c.totalAttendedSessions),
      sanitize(`${c.attendancePct}%`),
      sanitize(c.isAttendanceEligible ? 'ELIGIBLE (>=80%)' : 'BELOW 80%'),
      sanitize(c.isVerified ? 'VERIFIED' : 'PENDING'),
      sanitize(c.activeCertificateNumber || 'NONE'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clasptek_certificate_eligibility_${new Date().toISOString().slice(0, 10)}.csv`);
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
            <span>&#x1F3C5;</span> Certificate of Completion Eligibility
          </h1>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Evaluation and verification of vocational training completion based strictly on delivered session attendance
            (&ge;80%) and facilitator delivery reports. No examinations.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="cp-btn secondary sm" onClick={() => exportCsv(false)} title="Export current list to CSV">
            &#x1F4E5; Export CSV
          </button>
        </div>
      </div>

      {/* Zero-Examination Governance Notice */}
      <div
        style={{
          backgroundColor: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '12.5px',
          color: '#166534',
          lineHeight: '1.5',
        }}
      >
        <strong>&#x2714;&#xFE0F; Clasptek Training Completion Policy:</strong> Clasptek issues{' '}
        <strong>Certificates of Completion</strong> exclusively. Credentials reflect delivered instructional training,
        attendance participation (&ge;80%), and verified facilitator reporting. Clasptek does <strong>not</strong>{' '}
        conduct examinations, quizzes, grading, or test scoring.
      </div>

      {/* Top 4 KPI Cards */}
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
            Total Candidates in Training
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#14213D', marginTop: '4px' }}>
            {kpis.totalCandidates}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Enrolled Trainees</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Attendance Eligible (&ge;80%)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {kpis.attendanceEligible}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Met Benchmark via Session Logs</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Verified Completions
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#14213D', marginTop: '4px' }}>
            {kpis.verifiedCompletions}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Approved for Certificate Issuance</div>
        </div>

        <div className="cp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
            Below Threshold (&lt;80%)
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: kpis.belowThreshold > 0 ? '#D97706' : '#94A3B8',
              marginTop: '4px',
            }}
          >
            {kpis.belowThreshold}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Requires Admin Override to Verify</div>
        </div>
      </div>

      {/* Main Register Card */}
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
              &#x1F393; Trainee Completion Verification Register
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Verify candidates who achieved &ge;80% attendance, or record documented administrative overrides.
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="cp-input"
              style={{ width: '210px', fontSize: '12px' }}
              placeholder="Search candidate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="cp-input"
              style={{ fontSize: '12px', minWidth: '140px' }}
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value)}
            >
              <option value="ALL">All Cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cohortCode || c.name}
                </option>
              ))}
            </select>

            <select
              className="cp-input"
              style={{ fontSize: '12px', minWidth: '160px' }}
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
            >
              <option value="ALL">All Candidates</option>
              <option value="ELIGIBLE">Attendance Eligible (&ge;80%)</option>
              <option value="BELOW_THRESHOLD">Below Threshold (&lt;80%)</option>
              <option value="VERIFIED">Verified</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#x1F3C5;</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#14213D' }}>
              No candidate records match criteria
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              Adjust filters or search parameters to inspect candidate completion progress.
            </div>
          </div>
        ) : (
          <>
            {/* Table Selection Bar */}
            {selectedIds.size > 0 && (
              <div style={{ padding: '0 20px 14px' }}>
                <TableSelectionBar
                  selectedCount={selectedIds.size}
                  totalVisibleCount={visibleIds.length}
                  entityLabel="candidates"
                  onClearSelection={handleClearSelection}
                  onSelectAllVisible={handleToggleSelectAll}
                  isAllSelected={isAllSelected}
                >
                  <button
                    type="button"
                    className="cp-btn sm paid"
                    onClick={handleBulkVerifySelected}
                    style={{ fontSize: '12px', padding: '4px 12px', fontWeight: 700 }}
                  >
                    ✔ Verify Selected
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => exportCsv(true)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    📥 Export Selected
                  </button>
                </TableSelectionBar>
              </div>
            )}

            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible candidates"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isIndeterminate;
                        }}
                        onChange={handleToggleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
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
                      className="cp-col-secondary"
                      style={{
                        padding: '12px 14px',
                        fontSize: '11.5px',
                        color: '#475569',
                        fontWeight: 700,
                        textAlign: 'center',
                      }}
                    >
                      Delivered
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
                      Attendance %
                    </th>
                    <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                      Eligibility Status
                    </th>
                    <th style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                      Completion Sign-off
                    </th>
                    <th className="cp-col-secondary" style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                      Certificate
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
                  {paginatedCandidates.map((en) => {
                    const isEligible = en.isAttendanceEligible;
                    const isVerified = en.isVerified;
                    const isRowSelected = selectedIds.has(en.enrolmentId);

                    return (
                      <tr
                        key={en.enrolmentId}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          verticalAlign: 'middle',
                          fontSize: '12.5px',
                          backgroundColor: isRowSelected ? '#F0F9FF' : undefined,
                        }}
                      >
                        <td style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select candidate ${en.studentName}`}
                            checked={isRowSelected}
                            onChange={() => handleToggleSelect(en.enrolmentId)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#14213D' }}>
                          {en.enrolmentNumber}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#14213D' }}>{en.studentName}</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                            {en.studentNumber || en.studentEmail || ''}
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#1E293B' }}>{en.programmeName}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{en.cohortName}</div>
                        </td>

                        <td className="cp-col-secondary" style={{ padding: '12px 14px', textAlign: 'center', fontSize: '12px' }}>
                          {en.totalDeliveredSessions} sessions
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '13px',
                              color: en.attendancePct >= 80 ? '#059669' : '#DC2626',
                            }}
                          >
                            {en.attendancePct}%
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span
                            className={`cp-pill ${
                              isEligible ? 'paid' : en.totalDeliveredSessions === 0 ? 'draft' : 'danger'
                            }`}
                            style={{ fontSize: '10.5px' }}
                          >
                            {isEligible
                              ? '✔ ELIGIBLE (≥80%)'
                              : en.totalDeliveredSessions === 0
                              ? 'INSUFFICIENT SESSIONS'
                              : 'BELOW 80%'}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span className={`cp-pill ${isVerified ? 'paid' : 'draft'}`} style={{ fontSize: '10.5px' }}>
                            {isVerified ? '✔ VERIFIED' : 'PENDING'}
                          </span>
                        </td>

                        <td className="cp-col-secondary" style={{ padding: '12px 14px' }}>
                          {en.hasActiveCertificate && en.activeCertificateNumber ? (
                            <span className="cp-pill paid" style={{ fontSize: '10px' }}>
                              {en.activeCertificateNumber}
                            </span>
                          ) : (
                            <span className="cp-pill draft" style={{ fontSize: '10px' }}>
                              NONE
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {!isVerified ? (
                              isEligible ? (
                                <button
                                  className="cp-btn sm paid"
                                  onClick={() => setVerifyCandidate(en)}
                                  title="Verify completion based on attendance"
                                >
                                  ✔ Verify
                                </button>
                              ) : isAdminOrStaff ? (
                                <button
                                  className="cp-btn sm secondary"
                                  style={{ color: '#D97706', borderColor: '#FDE68A' }}
                                  onClick={() => {
                                    setOverrideCandidate(en);
                                    setOverrideReason('');
                                    setErrorMessage(null);
                                  }}
                                  title="Grant administrative override"
                                >
                                  Override
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Pending</span>
                              )
                            ) : !en.hasActiveCertificate ? (
                              isAdminOrStaff ? (
                                <button
                                  className="cp-btn sm accent"
                                  onClick={() => handleOpenIssueModal(en)}
                                  title="Issue official certificate of completion"
                                >
                                  + Issue Cert
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#059669' }}>Verified</span>
                              )
                            ) : (
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => en.activeCertificateId && handleViewCert(en.activeCertificateId)}
                                title="View issued certificate"
                              >
                                View Cert
                              </button>
                            )}
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
              {paginatedCandidates.map((en) => {
                const isEligible = en.isAttendanceEligible;
                const isVerified = en.isVerified;

                return (
                  <div key={en.enrolmentId} className="cp-mobile-record-card">
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select candidate ${en.studentName}`}
                          checked={selectedIds.has(en.enrolmentId)}
                          onChange={() => handleToggleSelect(en.enrolmentId)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {en.studentName}
                          </h4>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {en.programmeName} &bull; {en.cohortName}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {en.enrolmentNumber}
                        </span>
                        <span className={`cp-pill ${isVerified ? 'paid' : 'draft'}`} style={{ fontSize: '10px' }}>
                          {isVerified ? '✔ VERIFIED' : 'PENDING'}
                        </span>
                      </div>
                    </div>

                    <div className="cp-mobile-record-grid">
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Attendance %</span>
                        <span
                          className="cp-mobile-record-value"
                          style={{
                            fontSize: '14px',
                            color: en.attendancePct >= 80 ? '#059669' : '#DC2626',
                          }}
                        >
                          {en.attendancePct}%
                        </span>
                      </div>
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Eligibility</span>
                        <div>
                          <span
                            className={`cp-pill ${
                              isEligible ? 'paid' : en.totalDeliveredSessions === 0 ? 'draft' : 'danger'
                            }`}
                            style={{ fontSize: '10px' }}
                          >
                            {isEligible ? 'Eligible' : 'Below 80%'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="cp-mobile-record-actions">
                      {!isVerified ? (
                        isEligible ? (
                          <button
                            className="cp-btn sm paid"
                            onClick={() => setVerifyCandidate(en)}
                            style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                          >
                            ✔ Verify Completion
                          </button>
                        ) : isAdminOrStaff ? (
                          <button
                            className="cp-btn sm secondary"
                            style={{ color: '#D97706', borderColor: '#FDE68A', padding: '4px 12px', fontSize: '11.5px' }}
                            onClick={() => {
                              setOverrideCandidate(en);
                              setOverrideReason('');
                              setErrorMessage(null);
                            }}
                          >
                            Override
                          </button>
                        ) : null
                      ) : !en.hasActiveCertificate ? (
                        isAdminOrStaff ? (
                          <button
                            className="cp-btn sm accent"
                            onClick={() => handleOpenIssueModal(en)}
                            style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                          >
                            + Issue Certificate
                          </button>
                        ) : null
                      ) : (
                        <button
                          className="cp-btn sm secondary"
                          onClick={() => en.activeCertificateId && handleViewCert(en.activeCertificateId)}
                          style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                        >
                          View Certificate
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Standard Pagination */}
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalRecords={filteredList.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="candidates"
            />
          </>
        )}
      </div>

      {/* ===================== MODAL: VERIFY COMPLETION ===================== */}
      {verifyCandidate && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '500px' }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">&#x1F393; Verify Training Completion</div>
              <button className="cp-modal-close" onClick={() => setVerifyCandidate(null)}>
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
                  fontSize: '12.5px',
                }}
              >
                <div>
                  Candidate: <strong>{verifyCandidate.studentName}</strong>
                </div>
                <div>
                  Programme: <strong>{verifyCandidate.programmeName}</strong>
                </div>
                <div>
                  Attendance:{' '}
                  <strong style={{ color: '#059669' }}>{verifyCandidate.attendancePct}%</strong> (
                  {verifyCandidate.totalAttendedSessions}/{verifyCandidate.totalDeliveredSessions} delivered sessions)
                </div>
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: '1.5' }}>
                Are you sure you want to verify vocational training completion for this student? This marks the enrolment
                as <strong>COMPLETED</strong> and authorizes the student for official certificate issuance.
              </div>
              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '10px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setVerifyCandidate(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="cp-btn primary"
                onClick={handleConfirmVerify}
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : '✔ Confirm Completion Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: OVERRIDE COMPLETION ===================== */}
      {overrideCandidate && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '520px' }}>
            <div className="cp-modal-header" style={{ borderBottomColor: '#FEF08A' }}>
              <div className="cp-modal-title" style={{ color: '#B45309' }}>
                &#x26A0; Override Completion Verification
              </div>
              <button className="cp-modal-close" onClick={() => setOverrideCandidate(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <div
                style={{
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#92400E',
                }}
              >
                Student: <strong>{overrideCandidate.studentName}</strong> ({overrideCandidate.enrolmentNumber})
                <br />
                Current Attendance: <strong>{overrideCandidate.attendancePct}%</strong> (Requirement: &ge;80%)
              </div>

              <div className="cp-field">
                <label style={{ color: '#92400E', fontWeight: 700 }}>
                  Mandatory Justification Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  className="cp-input"
                  rows={3}
                  placeholder="Document the justification for granting an attendance waiver (e.g. approved medical leave with makeup practicals completed, prior learning recognition)..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>

              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setOverrideCandidate(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="cp-btn primary"
                style={{ backgroundColor: '#D97706' }}
                onClick={handleConfirmOverride}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : '✔ Grant Verification Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ISSUE CERTIFICATE ===================== */}
      {issueCandidate && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '620px' }}>
            <div className="cp-modal-header">
              <div>
                <div className="cp-modal-title">&#x1F393; Issue Certificate of Completion</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Award an authoritative credential with dynamic competency snapshot.
                </div>
              </div>
              <button className="cp-modal-close" onClick={() => setIssueCandidate(null)}>
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
                  {issueCandidate.studentName}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                  {issueCandidate.programmeName} &middot; {issueCandidate.cohortName}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                  Completion Status: <span className="cp-pill paid" style={{ fontSize: '10px' }}>VERIFIED</span> &middot;
                  Attendance: <strong>{issueCandidate.attendancePct}%</strong>
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
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Programme-specific description rendered on the certificate.
                </div>
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
                student&apos;s name, programme, core competencies, and role. Future changes to the student profile will never
                alter this issued credential.
              </div>

              {errorMessage && (
                <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px' }}>{errorMessage}</div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setIssueCandidate(null)}
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

      {/* ===================== MODAL: VIEW / PRINT CERTIFICATE ===================== */}
      {viewCert && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: '1000px', width: '95%' }}>
            <div className="cp-modal-header">
              <div>
                <div className="cp-modal-title">&#x1F393; Official Certificate of Completion</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Credential {viewCert.certificateNumber} for {viewCert.studentNameSnapshot}.
                </div>
              </div>
              <button className="cp-modal-close" onClick={() => setViewCert(null)}>
                &times;
              </button>
            </div>
            <div className="cp-modal-body" style={{ backgroundColor: '#F8FAFC', padding: '20px', overflowX: 'auto' }}>
              <CertificateDocument certificate={viewCert} />

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
                    {viewCert.verificationUrl || `/verify-certificate/${viewCert.certificateNumber}`}
                  </code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>
                    Status:{' '}
                    <span className={`cp-pill ${viewCert.status === 'ISSUED' ? 'paid' : 'danger'}`}>
                      {viewCert.status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="cp-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="cp-btn secondary" onClick={() => setViewCert(null)}>
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
      {/* ===================== MODAL: LIFECYCLE / PROVENANCE PROTECTION ===================== */}
      {/* Controlled Protected Record Modal */}
      {lifecycleModal.isOpen && lifecycleModal.candidate && (
        <RecordLifecycleModal
          isOpen={lifecycleModal.isOpen}
          onClose={() => setLifecycleModal({ isOpen: false })}
          onConfirm={async () => {
            setLifecycleModal({ isOpen: false });
          }}
          entityName="Candidate Completion Record"
          recordIdentifier={lifecycleModal.candidate.studentName}
          actionType="DELETE"
          dependencies={[
            { label: 'Delivered Sessions Attended', count: lifecycleModal.candidate.totalAttendedSessions },
            { label: 'Active Certificates', count: lifecycleModal.candidate.hasActiveCertificate ? 1 : 0 },
          ]}
          blockedMessage="Trainee completion records are protected historical academic records with recorded session attendance. To withdraw this student from the cohort, manage their enrolment under Enrolments Management instead of casual deletion."
        />
      )}
    </div>
  );
};
