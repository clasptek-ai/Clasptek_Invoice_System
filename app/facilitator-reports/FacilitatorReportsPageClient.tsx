'use client';

/**
 * app/facilitator-reports/FacilitatorReportsPageClient.tsx — Phase 5
 * Interactive Client Component for Facilitator Reports.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FacilitatorReport } from '@/types/training';

interface FacilitatorReportsPageClientProps {
  initialReports: FacilitatorReport[];
  cohorts: Array<{ id: string; cohortCode: string; name: string }>;
  personnel: Array<{ id: string; name: string; role: string; status: string }>;
  currentCohortFilter: string;
  currentStatusFilter: string;
  currentSearch: string;
}

export function FacilitatorReportsPageClient({
  initialReports,
  cohorts,
  personnel,
  currentCohortFilter,
  currentStatusFilter,
  currentSearch,
}: FacilitatorReportsPageClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [reports, setReports] = useState<FacilitatorReport[]>(initialReports);
  const [search, setSearch] = useState(currentSearch);
  const [cohortFilter, setCohortFilter] = useState(currentCohortFilter);
  const [statusFilter, setStatusFilter] = useState(currentStatusFilter);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [inspectReport, setInspectReport] = useState<FacilitatorReport | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Submit report form state
  const [reportForm, setReportForm] = useState({
    cohortId: cohorts.length > 0 ? cohorts[0].id : '',
    facilitatorId: personnel.length > 0 ? personnel[0].id : '',
    reportDate: new Date().toISOString().split('T')[0],
    topicsCovered: '',
    sessionSummary: '',
    attendanceObservations: '',
    studentParticipationNotes: '',
    issuesEncountered: '',
    followUpRecommendations: '',
  });

  const facilitators = personnel.filter((p) => (p.role || '').toLowerCase().includes('facilitator'));
  const activeFacilitatorsCount = facilitators.filter((p) => p.status === 'active').length;

  const pendingCount = reports.filter((r) => r.status === 'SUBMITTED').length;
  const reviewedCount = reports.filter((r) => r.status === 'REVIEWED').length;

  // Filter application
  const applyFilters = (newCohort: string, newStatus: string, newSearch: string) => {
    startTransition(() => {
      const sp = new URLSearchParams();
      if (newCohort !== 'ALL') sp.set('cohortId', newCohort);
      if (newStatus !== 'ALL') sp.set('status', newStatus);
      if (newSearch.trim()) sp.set('search', newSearch.trim());
      router.push(`/facilitator-reports?${sp.toString()}`);
    });
  };

  // Submit report handler
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side Zero-examination invariant check
    const prohibitedPattern =
      /\b(exam scores?|exam results?|grades? [a-f]|quiz(zes)?|quiz scores?|assessment marks?|pass marks?|test scores?)\b/i;
    if (
      prohibitedPattern.test(reportForm.sessionSummary) ||
      prohibitedPattern.test(reportForm.topicsCovered)
    ) {
      alert(
        'ZERO-EXAMINATION VIOLATION: Facilitator delivery reports must focus on syllabus coverage and curriculum engagement. Examination marks, grades, and quiz scores are strictly prohibited.'
      );
      return;
    }

    try {
      const res = await fetch('/api/training/facilitator-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportForm),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to submit facilitator report');
        return;
      }

      setIsSubmitModalOpen(false);
      setReports((prev) => [data.data, ...prev]);
      setFeedbackMsg({ type: 'success', text: 'Facilitator report submitted successfully.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      startTransition(() => router.refresh());
    } catch {
      alert('Network error submitting report');
    }
  };

  // Review & Approve handler
  const handleReviewReport = async () => {
    if (!inspectReport) return;
    try {
      const res = await fetch('/api/training/facilitator-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: inspectReport.id,
          reviewNotes: reviewNotes.trim() || 'Approved by administrator',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to review report');
        return;
      }

      setReports((prev) =>
        prev.map((r) =>
          r.id === inspectReport.id
            ? { ...r, status: 'REVIEWED', reviewedBy: 'Administrator', reviewedAt: new Date().toISOString() }
            : r
        )
      );

      setInspectReport(null);
      setReviewNotes('');
      setFeedbackMsg({ type: 'success', text: 'Report reviewed and approved.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      startTransition(() => router.refresh());
    } catch {
      alert('Network error reviewing report');
    }
  };

  return (
    <div className="cp-main-area" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Feedback banner */}
      {feedbackMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: feedbackMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
            color: feedbackMsg.type === 'success' ? '#065F46' : '#991B1B',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header with Action */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📑</span> Facilitator Training Delivery Reports
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            Comprehensive session delivery logs submitted by instructors, syllabus coverage, student engagement, and management sign-off.
          </div>
        </div>
        <button
          className="cp-btn sm accent"
          id="btnSubmitReportAdminBtn"
          onClick={() => setIsSubmitModalOpen(true)}
        >
          + Submit Delivery Report
        </button>
      </div>

      {/* Top KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
          <div className="cp-kpi-label">Total Reports Logged</div>
          <div className="cp-kpi-val" style={{ fontSize: 20, color: 'var(--primary)' }}>
            {reports.length}
          </div>
          <div className="cp-kpi-sub">Curriculum Delivery Records</div>
        </div>
        <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
          <div className="cp-kpi-label">Awaiting Admin Review</div>
          <div
            className="cp-kpi-val"
            style={{ fontSize: 20, color: pendingCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}
          >
            {pendingCount}
          </div>
          <div className="cp-kpi-sub">
            {pendingCount > 0 ? 'Requires Management Signoff' : 'Up to Date'}
          </div>
        </div>
        <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
          <div className="cp-kpi-label">Reviewed &amp; Approved</div>
          <div className="cp-kpi-val" style={{ fontSize: 20, color: 'var(--success)' }}>
            {reviewedCount}
          </div>
          <div className="cp-kpi-sub">Audited Session Reports</div>
        </div>
        <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
          <div className="cp-kpi-label">Active Facilitators</div>
          <div className="cp-kpi-val" style={{ fontSize: 20, color: 'var(--primary)' }}>
            {activeFacilitatorsCount}
          </div>
          <div className="cp-kpi-sub">Reporting Instructors</div>
        </div>
      </div>

      {/* Main Reports Card */}
      <div className="cp-card">
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="cp-section-title">📜 Session Delivery Logs</div>
            <div className="cp-section-desc">
              Auditable academic delivery records, topics taught, and student engagement observations.
            </div>
          </div>

          {/* Filter Controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              id="fReportSearchInput"
              className="cp-input"
              style={{ width: 190, fontSize: 12 }}
              placeholder="Search topics or notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                applyFilters(cohortFilter, statusFilter, e.target.value);
              }}
            />
            <select
              id="fReportCohortFilter"
              className="cp-input"
              style={{ fontSize: 12 }}
              value={cohortFilter}
              onChange={(e) => {
                setCohortFilter(e.target.value);
                applyFilters(e.target.value, statusFilter, search);
              }}
            >
              <option value="ALL">All Cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cohortCode} - {c.name}
                </option>
              ))}
            </select>
            <select
              id="fReportStatusFilter"
              className="cp-input"
              style={{ fontSize: 12 }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                applyFilters(cohortFilter, e.target.value, search);
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Awaiting Review</option>
              <option value="REVIEWED">Reviewed</option>
            </select>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">📑</div>
            <div className="cp-empty-title">No delivery reports found</div>
            <div className="cp-empty-desc">
              Facilitator session delivery reports will appear here for administrative signoff.
            </div>
          </div>
        ) : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cohort &amp; Programme</th>
                  <th>Facilitator</th>
                  <th>Topics Covered</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{r.reportDate}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {r.cohortCode}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.programmeName || r.cohortName}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, fontWeight: 600 }}>{r.facilitatorName}</td>
                    <td
                      style={{
                        fontSize: 12,
                        maxWidth: 240,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <strong>{r.topicsCovered || '—'}</strong>
                    </td>
                    <td>
                      <span
                        className={`cp-pill ${r.status === 'REVIEWED' ? 'paid' : 'active'}`}
                        style={{ fontSize: 10.5 }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {r.reviewedBy ? (
                        <>
                          {r.reviewedBy}
                          <br />
                          <span style={{ fontSize: 10 }}>{r.reviewedAt?.split('T')[0]}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="cp-btn sm secondary btnInspectReport"
                        onClick={() => {
                          setInspectReport(r);
                          setReviewNotes('');
                        }}
                      >
                        Inspect &amp; Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submit Facilitator Report Modal */}
      {isSubmitModalOpen && (
        <div className="cp-modal-overlay" onClick={() => setIsSubmitModalOpen(false)}>
          <div className="cp-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                📑 Submit Facilitator Delivery Report
              </h3>
              <button className="cp-btn ghost sm" onClick={() => setIsSubmitModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitReport}>
              <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Cohort <span style={{ color: 'red' }}>*</span>
                    </label>
                    <select
                      required
                      className="cp-input"
                      value={reportForm.cohortId}
                      onChange={(e) => setReportForm((p) => ({ ...p, cohortId: e.target.value }))}
                    >
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cohortCode} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Reporting Facilitator <span style={{ color: 'red' }}>*</span>
                    </label>
                    <select
                      required
                      className="cp-input"
                      value={reportForm.facilitatorId}
                      onChange={(e) => setReportForm((p) => ({ ...p, facilitatorId: e.target.value }))}
                    >
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Report Date <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="cp-input"
                    value={reportForm.reportDate}
                    onChange={(e) => setReportForm((p) => ({ ...p, reportDate: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Syllabus Topics Covered <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="cp-input"
                    placeholder="e.g. Asynchronous JavaScript, Promises & Fetch API"
                    value={reportForm.topicsCovered}
                    onChange={(e) => setReportForm((p) => ({ ...p, topicsCovered: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Session Summary &amp; Learning Objectives <span style={{ color: 'red' }}>*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    className="cp-input"
                    placeholder="Detail the curriculum delivered, practical exercises conducted..."
                    value={reportForm.sessionSummary}
                    onChange={(e) => setReportForm((p) => ({ ...p, sessionSummary: e.target.value }))}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Note: Facilitator reports are curriculum delivery records. Do not record examination marks, grades, or quiz scores.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Student Engagement &amp; Participation Notes
                  </label>
                  <textarea
                    rows={2}
                    className="cp-input"
                    placeholder="Observations regarding student interaction, questions asked, and comprehension..."
                    value={reportForm.studentParticipationNotes}
                    onChange={(e) =>
                      setReportForm((p) => ({ ...p, studentParticipationNotes: e.target.value }))
                    }
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Issues / Roadblocks Encountered
                    </label>
                    <textarea
                      rows={2}
                      className="cp-input"
                      placeholder="Technical glitches, connectivity, or prerequisite gaps..."
                      value={reportForm.issuesEncountered}
                      onChange={(e) =>
                        setReportForm((p) => ({ ...p, issuesEncountered: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Follow-up Recommendations
                    </label>
                    <textarea
                      rows={2}
                      className="cp-input"
                      placeholder="Suggested review topics, reading assignments..."
                      value={reportForm.followUpRecommendations}
                      onChange={(e) =>
                        setReportForm((p) => ({ ...p, followUpRecommendations: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsSubmitModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="cp-btn primary">
                  Submit Delivery Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect & Review Report Modal */}
      {inspectReport && (
        <div className="cp-modal-overlay" onClick={() => setInspectReport(null)}>
          <div className="cp-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                📜 Inspect Delivery Report — {inspectReport.cohortCode}
              </h3>
              <button className="cp-btn ghost sm" onClick={() => setInspectReport(null)}>
                ✕
              </button>
            </div>
            <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: 6,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Date:</span>
                  <br />
                  <strong>{inspectReport.reportDate}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Facilitator:</span>
                  <br />
                  <strong>{inspectReport.facilitatorName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <br />
                  <span
                    className={`cp-pill ${inspectReport.status === 'REVIEWED' ? 'paid' : 'active'}`}
                    style={{ fontSize: 10.5 }}
                  >
                    {inspectReport.status}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  Syllabus Topics Covered:
                </label>
                <div style={{ marginTop: 4, fontSize: 13, background: '#FFF', padding: 8, borderRadius: 4, border: '1px solid #E2E8F0' }}>
                  {inspectReport.topicsCovered}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  Session Summary:
                </label>
                <div style={{ marginTop: 4, fontSize: 13, background: '#FFF', padding: 8, borderRadius: 4, border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                  {inspectReport.sessionSummary}
                </div>
              </div>

              {inspectReport.studentParticipationNotes && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    Student Engagement Notes:
                  </label>
                  <div style={{ marginTop: 4, fontSize: 13, background: '#FFF', padding: 8, borderRadius: 4, border: '1px solid #E2E8F0' }}>
                    {inspectReport.studentParticipationNotes}
                  </div>
                </div>
              )}

              {inspectReport.issuesEncountered && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
                    Issues Encountered:
                  </label>
                  <div style={{ marginTop: 4, fontSize: 13, background: '#FFF', padding: 8, borderRadius: 4, border: '1px solid #E2E8F0' }}>
                    {inspectReport.issuesEncountered}
                  </div>
                </div>
              )}

              {inspectReport.followUpRecommendations && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    Follow-up Recommendations:
                  </label>
                  <div style={{ marginTop: 4, fontSize: 13, background: '#FFF', padding: 8, borderRadius: 4, border: '1px solid #E2E8F0' }}>
                    {inspectReport.followUpRecommendations}
                  </div>
                </div>
              )}

              {inspectReport.status !== 'REVIEWED' && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Administrative Review Notes &amp; Sign-off:
                  </label>
                  <textarea
                    rows={2}
                    className="cp-input"
                    placeholder="Enter review comments for the facilitator..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="cp-modal-footer">
              <button type="button" className="cp-btn secondary" onClick={() => setInspectReport(null)}>
                Close
              </button>
              {inspectReport.status !== 'REVIEWED' && (
                <button type="button" className="cp-btn paid" onClick={handleReviewReport}>
                  ✔ Approve &amp; Mark Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
