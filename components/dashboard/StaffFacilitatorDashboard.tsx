'use client';

/**
 * components/dashboard/StaffFacilitatorDashboard.tsx
 * Phase 9E / C328: Role Separation & Facilitator Workspace Restoration
 *
 * Implements:
 * 1. For Facilitator: Full 5-core-area training delivery workspace:
 *    - Core Area 1: Cohort Assigned (assigned cohorts only, class roster modal, direct links)
 *    - Core Area 2: Attendance (today/upcoming sessions, record attendance direct actions)
 *    - Core Area 3: Meetings (assigned meetings, LiveKit/Google Meet links, join/copy)
 *    - Core Area 4: Reports (delivery report status, submission link, self-approval forbidden note)
 *    - Core Area 5: Employee Self Service (ESS: payslips, queries, compensation, profile)
 * 2. For Staff: Pure Employee Self-Service (ESS) workspace ONLY:
 *    - Latest Net Pay, Statement Status, Pending Acknowledgements, Compensation Disbursed
 *    - Recent Payslips & Payroll Queries panels
 *    - Direct ESS quick links (Profile, Payslips, Queries, Security)
 *    - ZERO students, enquiries, courses, or cohorts
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { UserRole } from '@/types/auth';
import { ClassRosterModal } from '@/components/cohorts/ClassRosterModal';

interface Props {
  userName: string;
  role: UserRole;
  userEmail: string;
}

interface AssignedCohort {
  id: string;
  cohortCode: string;
  name: string;
  status: string;
  programmeName?: string;
  leadFacilitatorName?: string;
  delivery_mode?: string;
}

interface AssignedMeeting {
  id: string;
  title: string;
  topic?: string;
  cohort_id?: string;
  provider?: string;
  provider_room_url?: string;
  scheduled_start?: string;
  status?: string;
}

interface TrainingSessionItem {
  id: string;
  cohortId: string;
  sessionTitle?: string;
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
  deliveryMode?: string;
  status?: string;
}

interface DeliveryReportItem {
  id: string;
  reportDate?: string;
  status?: string;
  topicsCovered?: string;
}

interface OverviewData {
  role?: string;
  userName?: string;
  todaySessionsCount: number;
  upcomingSessionsCount: number;
  pendingAttendanceCount: number;
  cohortsCount: number;
  meetingsCount: number;
  reportsCount: number;
  assignedCohorts: AssignedCohort[];
  meetings: AssignedMeeting[];
  sessions: TrainingSessionItem[];
  reports: DeliveryReportItem[];
  pendingAckCount: number;
  pendingAckFirst?: { id: string; payPeriod: string; payslipNo: number } | null;
  latestNetPay: number;
  latestPeriod: string;
  latestStatus: string;
  latestPayslipNo?: number | null;
  totalPaidEarnings: number;
  recentPayslips: Array<{
    id: string;
    payPeriod: string;
    payslipNo: number;
    payDate: string;
    netPay: number;
    status: string;
  }>;
  recentQueries: Array<{
    id: string;
    payslipNo: number;
    payPeriod: string;
    queryReason: string;
    queryComment: string;
    status: string;
    resolutionNote?: string;
  }>;
}

export function StaffFacilitatorDashboard({ userName, role }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [rosterModal, setRosterModal] = useState<{
    isOpen: boolean;
    cohortId: string | null;
    cohortCode?: string;
    cohortName?: string;
  }>({
    isOpen: false,
    cohortId: null,
  });

  useEffect(() => {
    fetch('/api/facilitator/overview')
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch((err) => console.error('Failed to load overview:', err))
      .finally(() => setLoading(false));
  }, []);

  const fmtMoney = (val: number) => {
    return '₦' + Number(val || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const handleCopyLink = (url?: string) => {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopyFeedback('Link copied to clipboard!');
      setTimeout(() => setCopyFeedback(null), 3000);
    });
  };

  const isFacilitator = role === 'Facilitator';

  return (
    <div className="cp-dashboard-view cp-staff-dashboard" style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {copyFeedback && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            zIndex: 10000,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          }}
        >
          {copyFeedback}
        </div>
      )}

      {/* ─── WELCOME HEADER ─── */}
      <div
        className="cp-card cp-staff-welcome"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            Welcome, {userName}
          </div>
          <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
            {isFacilitator
              ? 'Master Facilitator & Academic Delivery Workspace'
              : 'Administrative Staff Member · Employee Self Service'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isFacilitator && (
            <>
              <Link
                href="/cohorts"
                className="cp-btn sm secondary"
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Assigned Cohorts
              </Link>
              <Link
                href="/attendance"
                className="cp-btn sm secondary"
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Attendance Register
              </Link>
              <Link
                href="/facilitator-reports"
                style={{
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Submit Delivery Report
              </Link>
            </>
          )}

          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '6px 14px',
              borderRadius: '999px',
              background: isFacilitator ? '#E0F2FE' : '#E0E7FF',
              color: isFacilitator ? '#0369A1' : '#3730A3',
            }}
          >
            {isFacilitator ? 'FACILITATOR PORTAL · TRAINING DELIVERY' : 'STAFF PORTAL · EMPLOYEE SELF SERVICE'}
          </span>
        </div>
      </div>

      {/* ─── ACTION REQUIRED: PAYSLIP AWAITING ACKNOWLEDGEMENT ─── */}
      {data && data.pendingAckCount > 0 && data.pendingAckFirst && (
        <div
          style={{
            background: '#FEF3C7',
            border: '1.5px solid #F59E0B',
            borderRadius: '8px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Action Required: Payslip Awaiting Your Acknowledgement
            </div>
            <div style={{ fontSize: '12.5px', color: '#B45309', marginTop: '3px' }}>
              Your payslip for <strong>{data.pendingAckFirst.payPeriod}</strong> (#{data.pendingAckFirst.payslipNo}) has been issued for your review. Please review your earnings and confirm acknowledgement.
            </div>
          </div>
          <Link
            href="/my-payslips"
            style={{
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              background: '#D97706',
              color: '#FFFFFF',
              textDecoration: 'none',
            }}
          >
            Review &amp; Acknowledge &rarr;
          </Link>
        </div>
      )}

      {/* ─── FACILITATOR TRAINING DELIVERY WORKSPACE ─── */}
      {isFacilitator && (
        <>
          {/* Top Facilitator KPIs */}
          <div className="cp-kpi-grid cp-facilitator-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Assigned Cohorts</div>
              <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {loading ? '...' : data?.cohortsCount || 0}
              </div>
              <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Active Training Schedules</div>
            </div>

            <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Today&apos;s Sessions</div>
              <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {loading ? '...' : data?.todaySessionsCount || 0}
              </div>
              <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Sessions Scheduled Today</div>
            </div>

            <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Pending Attendance</div>
              <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: (data?.pendingAttendanceCount || 0) > 0 ? '#D97706' : '#16A34A', marginTop: '4px' }}>
                {loading ? '...' : data?.pendingAttendanceCount || 0}
              </div>
              <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                {(data?.pendingAttendanceCount || 0) > 0 ? 'Requires Recording' : 'Up to Date'}
              </div>
            </div>

            <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Scheduled Meetings</div>
              <div className="cp-kpi-val" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {loading ? '...' : data?.meetingsCount || 0}
              </div>
              <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Live Video Sessions</div>
            </div>

            <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Latest Net Pay</div>
              <div className="cp-kpi-val" style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
                {loading ? '...' : fmtMoney(data?.latestNetPay || 0)}
              </div>
              <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{data?.latestPeriod || 'Current Statement'}</div>
            </div>
          </div>

          {/* 1. Core Area 1: Cohort Assigned */}
          <div className="cp-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Cohort Assigned &middot; Active Training Cohorts
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                  Authoritative cohorts assigned to your instructor profile. Inspect student class rosters, attendance, and meetings.
                </div>
              </div>
              <Link href="/cohorts" style={{ fontSize: '12.5px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>
                View All Cohorts ({data?.assignedCohorts?.length || 0}) &rarr;
              </Link>
            </div>

            {!data || data.assignedCohorts.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                No training cohorts currently assigned to your profile. Contact academic administration for course allocations.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                {data.assignedCohorts.map((cohort) => (
                  <div
                    key={cohort.id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '16px',
                      background: '#F8FAFC',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#0F172A' }}>{cohort.name}</strong>
                          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#2563EB', marginTop: '2px' }}>
                            {cohort.cohortCode}
                          </div>
                        </div>
                        <span
                          className={`cp-pill ${cohort.status === 'IN_PROGRESS' ? 'active' : cohort.status === 'COMPLETED' ? 'paid' : 'draft'}`}
                          style={{ fontSize: '10px' }}
                        >
                          {cohort.status || 'UPCOMING'}
                        </span>
                      </div>
                      {cohort.programmeName && (
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                          <strong>Programme:</strong> {cohort.programmeName}
                        </div>
                      )}
                      {cohort.delivery_mode && (
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          <strong>Mode:</strong> {cohort.delivery_mode}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={() =>
                          setRosterModal({
                            isOpen: true,
                            cohortId: cohort.id,
                            cohortCode: cohort.cohortCode,
                            cohortName: cohort.name,
                          })
                        }
                        style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 600 }}
                      >
                        Class Roster
                      </button>
                      <Link
                        href={`/attendance?cohortId=${cohort.id}`}
                        className="cp-btn sm secondary"
                        style={{ padding: '4px 10px', fontSize: '11.5px', textDecoration: 'none' }}
                      >
                        Attendance
                      </Link>
                      <Link
                        href={`/meetings?cohortId=${cohort.id}`}
                        className="cp-btn sm secondary"
                        style={{ padding: '4px 10px', fontSize: '11.5px', textDecoration: 'none' }}
                      >
                        Meetings
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2 & 3. Core Area 2 & 3: Sessions & Meetings Two-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            {/* Left: Core Area 2: Attendance & Training Sessions */}
            <div className="cp-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Attendance &middot; Sessions
                </div>
                <Link href="/attendance" style={{ fontSize: '12.5px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>
                  Attendance Register &rarr;
                </Link>
              </div>

              {!data || data.sessions.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                  No upcoming training sessions scheduled.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {data.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '13px', color: '#0F172A' }}>
                          {sess.sessionTitle || 'Training Session'}
                        </strong>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          Date: {fmtDate(sess.sessionDate)} &middot; {sess.startTime || '—'} - {sess.endTime || '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`cp-pill ${sess.status === 'COMPLETED' ? 'paid' : sess.status === 'ATTENDANCE_PENDING' ? 'danger' : 'active'}`}
                          style={{ fontSize: '10px' }}
                        >
                          {sess.status || 'SCHEDULED'}
                        </span>
                        <Link
                          href={`/attendance?cohortId=${sess.cohortId}&sessionId=${sess.id}`}
                          className="cp-btn sm secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Record
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Core Area 3: Scheduled Meetings */}
            <div className="cp-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  Scheduled Meetings &middot; Live Video
                </div>
                <Link href="/meetings" style={{ fontSize: '12.5px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>
                  All Meetings &rarr;
                </Link>
              </div>

              {!data || data.meetings.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                  No video meetings currently scheduled for your cohorts.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {data.meetings.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '13px', color: '#0F172A' }}>{m.topic || m.title || 'Online Meeting'}</strong>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          Start: {fmtDate(m.scheduled_start)} &middot; {m.provider === 'google_meet' ? 'Google Meet' : 'LiveKit SFU'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {m.provider_room_url && (
                          <>
                            <a
                              href={m.provider_room_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cp-btn sm primary"
                              style={{ padding: '3px 10px', fontSize: '11px', textDecoration: 'none', fontWeight: 700 }}
                            >
                              Join
                            </a>
                            <button
                              type="button"
                              className="cp-btn sm secondary"
                              onClick={() => handleCopyLink(m.provider_room_url)}
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              title="Copy meeting URL"
                            >
                              Copy
                            </button>
                          </>
                        )}
                        {!m.provider_room_url && (
                          <Link
                            href="/meetings"
                            className="cp-btn sm secondary"
                            style={{ padding: '3px 8px', fontSize: '11px', textDecoration: 'none' }}
                          >
                            Details
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Core Area 4: Delivery Reports Workflow */}
          <div className="cp-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Facilitator Delivery Reports
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Submit session delivery reports for academic and finance review. Facilitator self-approval is strictly forbidden.
                </div>
              </div>
              <Link
                href="/facilitator-reports"
                className="cp-btn sm primary"
                style={{ fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
              >
                + New Delivery Report
              </Link>
            </div>

            {!data || data.reports.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                No recent delivery reports filed. Submit a report after each completed training session.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                {data.reports.map((rep) => (
                  <div
                    key={rep.id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      padding: '12px',
                      background: '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '12.5px', color: '#0F172A' }}>
                        Report &middot; {fmtDate(rep.reportDate)}
                      </strong>
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                        {rep.topicsCovered ? rep.topicsCovered.slice(0, 40) + '...' : 'Delivery summary'}
                      </div>
                    </div>
                    <span
                      className={`cp-pill ${rep.status === 'REVIEWED' ? 'paid' : rep.status === 'SUBMITTED' ? 'active' : 'draft'}`}
                      style={{ fontSize: '10px' }}
                    >
                      {rep.status || 'DRAFT'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── 5. CORE AREA 5: EMPLOYEE SELF SERVICE (ESS) ─── */}
      {/* For Staff: this is the main view with KPI cards */}
      {!isFacilitator && (
        <div className="cp-kpi-grid cp-staff-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Latest Net Pay</div>
            <div className="cp-kpi-val" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {loading ? '...' : fmtMoney(data?.latestNetPay || 0)}
            </div>
            <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              {data?.latestPeriod || 'Current Period'}
            </div>
          </div>

          <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Statement Status</div>
            <div className="cp-kpi-val" style={{ fontSize: '18px', fontWeight: 800, marginTop: '6px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 800,
                  background: data?.latestStatus === 'paid' ? '#DCFCE7' : data?.latestStatus === 'approved' ? '#FEF3C7' : '#E0E7FF',
                  color: data?.latestStatus === 'paid' ? '#15803D' : data?.latestStatus === 'approved' ? '#92400E' : '#3730A3',
                }}
              >
                {data?.latestStatus?.toUpperCase() || 'NO STATEMENTS'}
              </span>
            </div>
            <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              {data?.latestPayslipNo ? `Payslip #${data.latestPayslipNo}` : 'Awaiting Period Run'}
            </div>
          </div>

          <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Pending Acknowledgements</div>
            <div className="cp-kpi-val" style={{ fontSize: '22px', fontWeight: 800, color: (data?.pendingAckCount || 0) > 0 ? '#D97706' : '#16A34A', marginTop: '4px' }}>
              {loading ? '...' : data?.pendingAckCount || 0}
            </div>
            <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              {(data?.pendingAckCount || 0) > 0 ? 'Review Required' : 'All Clear'}
            </div>
          </div>

          <div className="cp-card cp-kpi-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="cp-kpi-label" style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Compensation Disbursed</div>
            <div className="cp-kpi-val" style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
              {loading ? '...' : fmtMoney(data?.totalPaidEarnings || 0)}
            </div>
            <div className="cp-kpi-sub" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Lifetime Paid History</div>
          </div>
        </div>
      )}

      {/* ESS Panels Grid: Recent Payslips & Discrepancies Grid */}
      <div className="cp-staff-panels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Left: Recent Payslips */}
        <div className="cp-card cp-staff-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
              My Recent Payslips
            </div>
            <Link href="/my-payslips" style={{ fontSize: '12.5px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>
              View All ({data?.recentPayslips.length || 0}) &rarr;
            </Link>
          </div>

          {!data || data.recentPayslips.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No payslips have been issued to your account yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data.recentPayslips.map((ps) => (
                <div
                  key={ps.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: '13px' }}>{ps.payPeriod}</strong> &middot;{' '}
                    <span style={{ fontFamily: 'monospace', color: '#64748B', fontSize: '12px' }}>#{ps.payslipNo}</span>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Target Pay: {fmtDate(ps.payDate)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: '#16A34A', fontSize: '13px' }}>{fmtMoney(ps.netPay)}</strong>
                    <div>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: ps.status === 'paid' ? '#DCFCE7' : '#E0E7FF',
                          color: ps.status === 'paid' ? '#15803D' : '#3730A3',
                        }}
                      >
                        {ps.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Discrepancy Queries */}
        <div className="cp-card cp-staff-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              My Payroll Queries
            </div>
            <Link href="/my-queries" style={{ fontSize: '12.5px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>
              View Queries ({data?.recentQueries.length || 0}) &rarr;
            </Link>
          </div>

          {!data || data.recentQueries.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No queries raised. All compensation statements are in good standing.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.recentQueries.map((q) => (
                <div key={q.id} style={{ padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ color: '#0F172A', fontSize: '12.5px' }}>{q.queryReason}</strong>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        background: q.status === 'resolved' ? '#DCFCE7' : '#FEF3C7',
                        color: q.status === 'resolved' ? '#15803D' : '#92400E',
                      }}
                    >
                      {q.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>{q.queryComment}</div>
                  {q.resolutionNote && (
                    <div style={{ fontSize: '11px', color: '#166534', background: '#F0FDF4', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <strong>Finance Note:</strong> {q.resolutionNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ESS Quick Navigation Bar */}
      <div
        className="cp-card"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
          Employee Self Service Quick Links:
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href="/my-profile" className="cp-btn sm secondary" style={{ fontSize: '12px', textDecoration: 'none' }}>
            My Profile &amp; Bank Details
          </Link>
          <Link href="/my-payslips" className="cp-btn sm secondary" style={{ fontSize: '12px', textDecoration: 'none' }}>
            My Payslips
          </Link>
          {isFacilitator && (
            <Link href="/my-sessions" className="cp-btn sm secondary" style={{ fontSize: '12px', textDecoration: 'none' }}>
              My Sessions
            </Link>
          )}
          <Link href="/my-queries" className="cp-btn sm secondary" style={{ fontSize: '12px', textDecoration: 'none' }}>
            Payroll Queries
          </Link>
          <Link href="/my-security" className="cp-btn sm secondary" style={{ fontSize: '12px', textDecoration: 'none' }}>
            Account Security
          </Link>
        </div>
      </div>

      {/* Class Roster Modal */}
      <ClassRosterModal
        isOpen={rosterModal.isOpen}
        cohortId={rosterModal.cohortId}
        cohortCode={rosterModal.cohortCode}
        cohortName={rosterModal.cohortName}
        onClose={() => setRosterModal({ isOpen: false, cohortId: null })}
      />
    </div>
  );
}
