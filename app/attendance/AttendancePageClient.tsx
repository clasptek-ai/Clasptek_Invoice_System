'use client';

/**
 * app/attendance/AttendancePageClient.tsx — Phase 5
 * Interactive Client Component for Attendance Register & Delivery Tracking.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  TrainingSession,
  AttendanceRecord,
  AttendanceStatus,
  EnrolmentStudentInfo,
} from '@/types/training';

interface AttendancePageClientProps {
  cohorts: Array<{
    id: string;
    cohortCode: string;
    name: string;
    status: string;
    programmeName?: string;
    leadFacilitatorName?: string;
  }>;
  selectedCohortId: string;
  sessions: TrainingSession[];
  selectedSessionId: string;
  enrolments: EnrolmentStudentInfo[];
  allAttendance: AttendanceRecord[];
}

export function AttendancePageClient({
  cohorts,
  selectedCohortId,
  sessions,
  selectedSessionId,
  enrolments,
  allAttendance,
}: AttendancePageClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local state for attendance records
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(allAttendance);
  const [studentNotes, setStudentNotes] = useState<Record<string, string>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{
    attendanceId: string;
    studentName: string;
    currentStatus: AttendanceStatus;
  } | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('PRESENT');
  const [overrideReason, setOverrideReason] = useState('');

  // Form state for scheduling / editing session
  const [sessionFormData, setSessionFormData] = useState({
    sessionNumber: sessions.length + 1,
    sessionTitle: '',
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '12:00',
    deliveryMode: 'ONLINE',
    location: '',
    notes: '',
  });

  const activeCohort = cohorts.find((c) => c.id === selectedCohortId);
  const activeSession = sessions.find((s) => s.id === selectedSessionId);
  const sessionAttendance = activeSession
    ? attendance.filter((a) => a.sessionId === activeSession.id)
    : [];

  const deliveredSessions = sessions.filter(
    (s) => s.status === 'COMPLETED' || s.status === 'ATTENDANCE_SUBMITTED'
  );

  // Calculation of KPIs
  const totalDelivered = deliveredSessions.length;
  let cohortTotalPresent = 0;
  const cohortTotalPossible = totalDelivered * enrolments.length;

  if (totalDelivered > 0) {
    deliveredSessions.forEach((ds) => {
      const dsAtt = attendance.filter((a) => a.sessionId === ds.id);
      enrolments.forEach((en) => {
        const rec = dsAtt.find((a) => a.enrolmentId === en.enrolmentId);
        if (rec && (rec.attendanceStatus === 'PRESENT' || rec.attendanceStatus === 'LATE')) {
          cohortTotalPresent++;
        }
      });
    });
  }

  const cohortOverallPct =
    cohortTotalPossible > 0 ? Math.round((cohortTotalPresent / cohortTotalPossible) * 100) : null;
  const cohortDisplayPct = cohortOverallPct !== null ? `${cohortOverallPct}%` : '—';
  const cohortStatusLabel =
    totalDelivered === 0
      ? 'Pending Sessions'
      : activeCohort?.status === 'COMPLETED'
      ? 'Completed'
      : 'In Progress';

  const unrecordedCount = activeSession
    ? enrolments.filter((en) => !sessionAttendance.some((a) => a.enrolmentId === en.enrolmentId)).length
    : 0;

  const isSessionDelivered =
    activeSession &&
    (activeSession.status === 'COMPLETED' || activeSession.status === 'ATTENDANCE_SUBMITTED');

  // Change cohort
  const handleCohortChange = (cohortId: string) => {
    startTransition(() => {
      router.push(`/attendance?cohortId=${encodeURIComponent(cohortId)}`);
    });
  };

  // Change session
  const handleSessionChange = (sessionId: string) => {
    startTransition(() => {
      router.push(
        `/attendance?cohortId=${encodeURIComponent(selectedCohortId)}&sessionId=${encodeURIComponent(sessionId)}`
      );
    });
  };

  // Mark single attendance
  const handleMarkAttendance = async (
    enrolmentId: string,
    status: AttendanceStatus,
    note?: string
  ) => {
    if (!activeSession) return;
    try {
      const res = await fetch('/api/training/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id,
          enrolmentId,
          attendanceStatus: status,
          facilitatorNote: note ?? studentNotes[enrolmentId] ?? '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to record attendance' });
        return;
      }

      // Update local state
      setAttendance((prev) => {
        const existingIdx = prev.findIndex(
          (a) => a.sessionId === activeSession.id && a.enrolmentId === enrolmentId
        );
        if (existingIdx !== -1) {
          const next = [...prev];
          next[existingIdx] = data.data;
          return next;
        }
        return [...prev, data.data];
      });

      setFeedbackMsg({ type: 'success', text: `Attendance updated: ${status}` });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error marking attendance' });
    }
  };

  // Mark All Present
  const handleMarkAllPresent = async () => {
    if (!activeSession || unrecordedCount === 0) return;
    const unrecordedEnrolments = enrolments.filter(
      (en) => !sessionAttendance.some((a) => a.enrolmentId === en.enrolmentId)
    );

    const records = unrecordedEnrolments.map((en) => ({
      sessionId: activeSession.id,
      enrolmentId: en.enrolmentId,
      attendanceStatus: 'PRESENT' as AttendanceStatus,
      facilitatorNote: studentNotes[enrolmentIdNoteKey(en.enrolmentId)] || '',
    }));

    try {
      const res = await fetch('/api/training/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to mark all present' });
        return;
      }

      setFeedbackMsg({ type: 'success', text: `Marked ${records.length} students as PRESENT` });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error marking all present' });
    }
  };

  const enrolmentIdNoteKey = (enrolmentId: string) => enrolmentId;

  // Finalize / Submit Session Attendance
  const handleSubmitSessionAttendance = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch('/api/training/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSession.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to submit session' });
        return;
      }

      setFeedbackMsg({
        type: 'success',
        text: 'Session attendance finalized and marked COMPLETED.',
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Network error submitting session attendance' });
    }
  };

  // Submit Override / Audited Correction
  const handleSaveOverride = async () => {
    if (!overrideTarget || !overrideReason.trim()) {
      alert('A valid reason is required for audited attendance correction.');
      return;
    }

    try {
      const res = await fetch('/api/training/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceId: overrideTarget.attendanceId,
          newStatus: overrideStatus,
          correctionReason: overrideReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to correct attendance');
        return;
      }

      setAttendance((prev) =>
        prev.map((a) => (a.id === overrideTarget.attendanceId ? data.data : a))
      );

      setOverrideTarget(null);
      setOverrideReason('');
      setFeedbackMsg({ type: 'success', text: `Audited correction applied: ${overrideStatus}` });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch {
      alert('Network error submitting correction');
    }
  };

  // Schedule Session Submit
  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCohortId) return;

    try {
      const isEditing = isEditModalOpen && activeSession;
      const payload = {
        id: isEditing ? activeSession.id : undefined,
        cohortId: selectedCohortId,
        sessionNumber: Number(sessionFormData.sessionNumber) || 1,
        sessionTitle: sessionFormData.sessionTitle.trim(),
        sessionDate: sessionFormData.sessionDate,
        startTime: sessionFormData.startTime,
        endTime: sessionFormData.endTime,
        deliveryMode: sessionFormData.deliveryMode,
        location: sessionFormData.location,
        notes: sessionFormData.notes,
      };

      const res = await fetch('/api/training/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to save training session');
        return;
      }

      setIsScheduleModalOpen(false);
      setIsEditModalOpen(false);
      setFeedbackMsg({
        type: 'success',
        text: isEditing ? 'Session updated successfully' : 'Session scheduled successfully',
      });

      startTransition(() => {
        router.refresh();
      });
    } catch {
      alert('Network error saving session');
    }
  };

  // Open Edit Session Modal
  const handleOpenEditSession = () => {
    if (!activeSession) return;
    setSessionFormData({
      sessionNumber: activeSession.sessionNumber,
      sessionTitle: activeSession.sessionTitle,
      sessionDate: activeSession.sessionDate,
      startTime: activeSession.startTime || '10:00',
      endTime: activeSession.endTime || '12:00',
      deliveryMode: activeSession.deliveryMode || 'ONLINE',
      location: activeSession.location || '',
      notes: activeSession.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Open Schedule Session Modal
  const handleOpenScheduleSession = () => {
    setSessionFormData({
      sessionNumber: sessions.length + 1,
      sessionTitle: `Training Session #${sessions.length + 1}`,
      sessionDate: new Date().toISOString().split('T')[0],
      startTime: '10:00',
      endTime: '12:00',
      deliveryMode: 'ONLINE',
      location: '',
      notes: '',
    });
    setIsScheduleModalOpen(true);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!activeCohort) return;
    let csv = 'Student ID,Student Name,Enrolment Number,Delivered Sessions,Present,Late,Excused,Absent,Attendance %\n';
    enrolments.forEach((en) => {
      let p = 0, l = 0, ex = 0, ab = 0;
      deliveredSessions.forEach((ds) => {
        const r = attendance.find((a) => a.sessionId === ds.id && a.enrolmentId === en.enrolmentId);
        if (r?.attendanceStatus === 'PRESENT') p++;
        else if (r?.attendanceStatus === 'LATE') l++;
        else if (r?.attendanceStatus === 'EXCUSED') ex++;
        else if (r?.attendanceStatus === 'ABSENT') ab++;
      });
      const pct = deliveredSessions.length > 0 ? Math.round(((p + l + 0.5 * ex) / deliveredSessions.length) * 100) : 0;
      csv += `"${en.studentNumber}","${en.studentName}","${en.enrolmentNumber}",${deliveredSessions.length},${p},${l},${ex},${ab},"${pct}%"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Attendance_${activeCohort.cohortCode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="cp-main-area" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Feedback Alert */}
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

      {/* Header */}
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
            <span>📋</span> Attendance Register &amp; Delivery Tracking
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            Authoritative student session check-ins, percentage tracking, and audited attendance corrections.
          </div>
        </div>

        {/* Cohort and Session Selectors */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            id="attCohortSelect"
            className="cp-input"
            style={{ fontWeight: 700, minWidth: 200, fontSize: 12.5 }}
            value={selectedCohortId}
            onChange={(e) => handleCohortChange(e.target.value)}
          >
            {cohorts.length === 0 ? (
              <option value="">No cohorts available</option>
            ) : (
              cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cohortCode} - {c.name}
                </option>
              ))
            )}
          </select>

          <select
            id="attSessionSelect"
            className="cp-input"
            style={{ minWidth: 220, maxWidth: '100%', flex: 1, fontSize: 12.5 }}
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
          >
            {sessions.length === 0 ? (
              <option value="">No training sessions created</option>
            ) : (
              sessions.map((s) => {
                const label = `${s.sessionDate} — ${s.sessionTitle || 'Training'} | ${s.startTime || '10:00'} – ${s.endTime || '12:00'} | Facilitator: ${s.facilitatorName || 'Unassigned'}`;
                return (
                  <option key={s.id} value={s.id}>
                    {label}
                  </option>
                );
              })
            )}
          </select>

          <button
            className="cp-btn sm accent"
            id="btnQuickScheduleSession"
            onClick={handleOpenScheduleSession}
          >
            + Schedule Session
          </button>
          <button
            className="cp-btn sm secondary"
            id="btnExportAttendance"
            onClick={handleExportCSV}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Cohort Summary Strip */}
      {activeCohort && (
        <div
          className="cp-card"
          style={{
            marginBottom: 18,
            padding: '14px 18px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>
                {activeCohort.cohortCode} — {activeCohort.name}
              </span>
              <span style={{ marginLeft: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {activeCohort.programmeName || 'Academic Course'}
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                display: 'flex',
                gap: 20,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span>
                Lead: <strong>{activeCohort.leadFacilitatorName || 'Unassigned'}</strong>
              </span>
              <span>
                Enrolled Students: <strong>{enrolments.length}</strong>
              </span>
              <span>
                Delivered: <strong>{totalDelivered} / {sessions.length} sessions</strong>
              </span>
              <span>
                Present:{' '}
                <strong>
                  {totalDelivered === 0 ? '0' : `${cohortTotalPresent} / ${cohortTotalPossible}`}
                </strong>
              </span>
              <span>
                Attendance: <strong>{cohortDisplayPct}</strong>
              </span>
              <span>
                Status:{' '}
                <span
                  className={`cp-pill ${totalDelivered === 0 ? 'draft' : 'paid'}`}
                  style={{ fontSize: 10, fontWeight: 700 }}
                >
                  {cohortStatusLabel}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live Session Attendance Register */}
      <div className="cp-card" style={{ marginBottom: 20 }}>
        <div
          className="cp-card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div className="cp-section-title">
              ✔ Session Register:{' '}
              {activeSession
                ? `Session ${activeSession.sessionNumber}: ${activeSession.sessionTitle}`
                : 'Select a Session'}
            </div>
            <div className="cp-section-desc">
              {activeSession ? (
                <>
                  Date: <strong>{activeSession.sessionDate}</strong> &middot; Time:{' '}
                  <strong>
                    {activeSession.startTime || '10:00'} – {activeSession.endTime || '12:00'}
                  </strong>{' '}
                  &middot; Facilitator: <strong>{activeSession.facilitatorName || 'Unassigned'}</strong>{' '}
                  &middot; Status:{' '}
                  <span
                    className={`cp-pill ${isSessionDelivered ? 'paid' : 'active'}`}
                    style={{ fontSize: 10, fontWeight: 700 }}
                  >
                    {(activeSession.status || 'SCHEDULED').toUpperCase()}
                  </span>
                </>
              ) : (
                'Select a cohort session above to record or review attendance.'
              )}
            </div>
          </div>

          {activeSession && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {unrecordedCount > 0 && (
                <button
                  className="cp-btn sm secondary"
                  id="btnMarkAllPresent"
                  style={{ fontWeight: 600 }}
                  onClick={handleMarkAllPresent}
                >
                  ✅ Mark All Present ({unrecordedCount})
                </button>
              )}
              <button
                className="cp-btn sm paid"
                id="btnSubmitSessionAttendance"
                style={{ fontWeight: 700 }}
                title="Finalize and mark session completed"
                onClick={handleSubmitSessionAttendance}
              >
                💾 {isSessionDelivered ? 'Update & Re-Submit Attendance' : 'Submit Attendance & Mark Completed'}
              </button>
              <button
                className="cp-btn sm secondary"
                id="btnEditCurrentSession"
                title="Edit session details"
                onClick={handleOpenEditSession}
              >
                ✏ Edit Session
              </button>
            </div>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '32px 16px' }}>
            <div className="cp-empty-icon">📋</div>
            <div className="cp-empty-title">No training sessions scheduled</div>
            <div className="cp-empty-desc">
              This cohort does not have any training sessions scheduled yet. Create the first training session to begin tracking attendance and progress.
            </div>
            <button
              className="cp-btn sm accent"
              id="btnEmptyScheduleSession"
              style={{ margin: '12px auto 0' }}
              onClick={handleOpenScheduleSession}
            >
              + Schedule Training Session
            </button>
          </div>
        ) : !activeSession ? (
          <div className="cp-empty-state" style={{ padding: '32px 16px' }}>
            <div className="cp-empty-icon">📋</div>
            <div className="cp-empty-title">No training session selected</div>
            <div className="cp-empty-desc">
              Please select a training session from the dropdown above to view or mark attendance.
            </div>
          </div>
        ) : (
          <>
            {unrecordedCount > 0 && sessionAttendance.length === 0 && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  color: '#92400E',
                  padding: '10px 14px',
                  borderRadius: 6,
                  margin: '0 18px 14px 18px',
                  fontSize: 12.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  ⚠️ <strong>Attendance not recorded:</strong> No attendance records have been submitted for this session yet.
                </div>
                <button
                  className="cp-btn sm primary"
                  id="btnBannerMarkAllPresent"
                  style={{ padding: '4px 10px', fontSize: 11.5 }}
                  onClick={handleMarkAllPresent}
                >
                  Mark All Present
                </button>
              </div>
            )}

            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Student Name</th>
                    <th style={{ textAlign: 'center' }}>Current Status</th>
                    <th>Notes / Check-in Time</th>
                    <th style={{ textAlign: 'center' }}>Mark / Update Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                        No students enrolled in this cohort yet.
                      </td>
                    </tr>
                  ) : (
                    enrolments.map((en) => {
                      const attRec = sessionAttendance.find((a) => a.enrolmentId === en.enrolmentId);
                      const currentStatus = attRec ? attRec.attendanceStatus : 'NOT_RECORDED';

                      let pillColor = 'draft';
                      if (currentStatus === 'PRESENT') pillColor = 'paid';
                      else if (currentStatus === 'LATE') pillColor = 'active';
                      else if (currentStatus === 'EXCUSED') pillColor = 'category-pill';
                      else if (currentStatus === 'ABSENT') pillColor = 'danger';

                      return (
                        <tr key={en.enrolmentId}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {en.studentNumber}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {en.studentName}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`cp-pill ${pillColor}`} style={{ fontWeight: 700, fontSize: 11 }}>
                              {currentStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="cp-input attNoteInput"
                              style={{ fontSize: 11.5, padding: '4px 8px', width: '100%', maxWidth: 240 }}
                              placeholder="Optional note..."
                              defaultValue={attRec?.facilitatorNote || studentNotes[en.enrolmentId] || ''}
                              onChange={(e) =>
                                setStudentNotes((prev) => ({ ...prev, [en.enrolmentId]: e.target.value }))
                              }
                            />
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <button
                                className={`cp-btn sm ${currentStatus === 'PRESENT' ? 'paid' : 'secondary'} btnMarkAtt`}
                                onClick={() => handleMarkAttendance(en.enrolmentId, 'PRESENT')}
                                title="Mark Present"
                              >
                                Present
                              </button>
                              <button
                                className={`cp-btn sm ${currentStatus === 'LATE' ? 'paid' : 'secondary'} btnMarkAtt`}
                                style={{ color: '#D97706' }}
                                onClick={() => handleMarkAttendance(en.enrolmentId, 'LATE')}
                                title="Mark Late"
                              >
                                Late
                              </button>
                              <button
                                className={`cp-btn sm ${currentStatus === 'EXCUSED' ? 'paid' : 'secondary'} btnMarkAtt`}
                                style={{ color: '#2563EB' }}
                                onClick={() => handleMarkAttendance(en.enrolmentId, 'EXCUSED')}
                                title="Mark Excused"
                              >
                                Excused
                              </button>
                              <button
                                className={`cp-btn sm ${currentStatus === 'ABSENT' ? 'danger' : 'secondary'} btnMarkAtt`}
                                onClick={() => handleMarkAttendance(en.enrolmentId, 'ABSENT')}
                                title="Mark Absent"
                              >
                                Absent
                              </button>
                              {attRec && (
                                <button
                                  className="cp-btn sm secondary btnCorrectAtt"
                                  style={{ marginLeft: 6, fontSize: 11 }}
                                  title="Audited Correction"
                                  onClick={() => {
                                    setOverrideTarget({
                                      attendanceId: attRec.id,
                                      studentName: en.studentName,
                                      currentStatus: attRec.attendanceStatus,
                                    });
                                    setOverrideStatus(attRec.attendanceStatus);
                                    setOverrideReason('');
                                  }}
                                >
                                  ⚖ Override
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Overall Cohort Attendance Progression & Certificate Eligibility Matrix */}
      <div className="cp-card">
        <div className="cp-card-header">
          <div>
            <div className="cp-section-title">📊 Cohort Attendance Progression &amp; Certificate Eligibility</div>
            <div className="cp-section-desc">
              Formula: (Present + Late + 0.5 &times; Excused) / Delivered Sessions &times; 100%. Completion benchmark &ge; 80%.
            </div>
          </div>
        </div>

        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th style={{ textAlign: 'center' }}>Present</th>
                <th style={{ textAlign: 'center' }}>Late</th>
                <th style={{ textAlign: 'center' }}>Excused</th>
                <th style={{ textAlign: 'center' }}>Absent</th>
                <th style={{ textAlign: 'center' }}>Attendance %</th>
                <th style={{ textAlign: 'center' }}>Benchmark</th>
                <th style={{ textAlign: 'center' }}>Certificate Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {enrolments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                    No enrolled students to calculate progression.
                  </td>
                </tr>
              ) : (
                enrolments.map((en) => {
                  let p = 0, l = 0, ex = 0, ab = 0;
                  deliveredSessions.forEach((ds) => {
                    const r = attendance.find((a) => a.sessionId === ds.id && a.enrolmentId === en.enrolmentId);
                    if (r?.attendanceStatus === 'PRESENT') p++;
                    else if (r?.attendanceStatus === 'LATE') l++;
                    else if (r?.attendanceStatus === 'EXCUSED') ex++;
                    else if (r?.attendanceStatus === 'ABSENT') ab++;
                  });

                  const pct = deliveredSessions.length > 0
                    ? Math.round(((p + l + 0.5 * ex) / deliveredSessions.length) * 100)
                    : 0;
                  const isEligible = pct >= 80;

                  return (
                    <tr key={en.enrolmentId}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{en.studentNumber}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{en.studentName}</td>
                      <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{p}</td>
                      <td style={{ textAlign: 'center', color: '#D97706', fontWeight: 700 }}>{l}</td>
                      <td style={{ textAlign: 'center', color: '#2563EB', fontWeight: 600 }}>{ex}</td>
                      <td style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 600 }}>{ab}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13 }}>
                        {deliveredSessions.length === 0 ? '—' : `${pct}%`}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>&ge; 80%</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`cp-pill ${isEligible ? 'paid' : 'draft'}`}
                          style={{ fontWeight: 700, fontSize: 11 }}
                        >
                          {deliveredSessions.length === 0 ? 'Pending Delivery' : isEligible ? 'Eligible' : 'Needs Improvement'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule / Edit Training Session Modal */}
      {(isScheduleModalOpen || isEditModalOpen) && (
        <div className="cp-modal-overlay" onClick={() => { setIsScheduleModalOpen(false); setIsEditModalOpen(false); }}>
          <div className="cp-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {isEditModalOpen ? '✏️ Edit Training Session' : '📅 Schedule Training Session'}
              </h3>
              <button
                className="cp-btn ghost sm"
                onClick={() => { setIsScheduleModalOpen(false); setIsEditModalOpen(false); }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveSession}>
              <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Session #
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      className="cp-input"
                      value={sessionFormData.sessionNumber}
                      onChange={(e) =>
                        setSessionFormData((prev) => ({ ...prev, sessionNumber: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Session Title
                    </label>
                    <input
                      type="text"
                      required
                      className="cp-input"
                      placeholder="e.g. Modern React & State Management"
                      value={sessionFormData.sessionTitle}
                      onChange={(e) =>
                        setSessionFormData((prev) => ({ ...prev, sessionTitle: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      className="cp-input"
                      value={sessionFormData.sessionDate}
                      onChange={(e) =>
                        setSessionFormData((prev) => ({ ...prev, sessionDate: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="time"
                      className="cp-input"
                      value={sessionFormData.startTime}
                      onChange={(e) =>
                        setSessionFormData((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      End Time
                    </label>
                    <input
                      type="time"
                      className="cp-input"
                      value={sessionFormData.endTime}
                      onChange={(e) =>
                        setSessionFormData((prev) => ({ ...prev, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Delivery Mode
                  </label>
                  <select
                    className="cp-input"
                    value={sessionFormData.deliveryMode}
                    onChange={(e) =>
                      setSessionFormData((prev) => ({ ...prev, deliveryMode: e.target.value }))
                    }
                  >
                    <option value="ONLINE">Online (Virtual Classroom)</option>
                    <option value="IN_PERSON">In-Person (Campus / Lab)</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Location / Meeting Link
                  </label>
                  <input
                    type="text"
                    className="cp-input"
                    placeholder="Room 101 or Virtual Room"
                    value={sessionFormData.location}
                    onChange={(e) =>
                      setSessionFormData((prev) => ({ ...prev, location: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Session Notes / Syllabus Topics
                  </label>
                  <textarea
                    className="cp-input"
                    rows={2}
                    placeholder="Topics to be covered during this lecture..."
                    value={sessionFormData.notes}
                    onChange={(e) =>
                      setSessionFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => { setIsScheduleModalOpen(false); setIsEditModalOpen(false); }}
                >
                  Cancel
                </button>
                <button type="submit" className="cp-btn primary">
                  {isEditModalOpen ? 'Save Changes' : 'Schedule Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Override / Audited Correction Modal */}
      {overrideTarget && (
        <div className="cp-modal-overlay" onClick={() => setOverrideTarget(null)}>
          <div className="cp-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                ⚖️ Audited Attendance Correction
              </h3>
              <button className="cp-btn ghost sm" onClick={() => setOverrideTarget(null)}>
                ✕
              </button>
            </div>
            <div className="cp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                <div>
                  Student: <strong>{overrideTarget.studentName}</strong>
                </div>
                <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                  Current Status:{' '}
                  <span className="cp-pill active" style={{ fontSize: 10 }}>
                    {overrideTarget.currentStatus}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Corrected Status
                </label>
                <select
                  className="cp-input"
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as AttendanceStatus)}
                >
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="EXCUSED">Excused</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Audited Correction Reason <span style={{ color: 'red' }}>*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  className="cp-input"
                  placeholder="Explain why this attendance record is being modified (mandatory for audit compliance)..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            </div>

            <div className="cp-modal-footer">
              <button type="button" className="cp-btn secondary" onClick={() => setOverrideTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="cp-btn primary"
                disabled={!overrideReason.trim()}
                onClick={handleSaveOverride}
              >
                Apply Audited Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
