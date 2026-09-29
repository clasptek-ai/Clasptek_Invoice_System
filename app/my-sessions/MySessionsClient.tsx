'use client';

/**
 * app/my-sessions/MySessionsClient.tsx — Client component for My Training Sessions
 * Phase 9E: User Workspaces Migration
 * Matches exact Clasptek KPI cards, session listing, and attendance register links.
 */

import React from 'react';
import Link from 'next/link';
import type { EmployeeSession } from '@/types/ess';
import type { UserRole } from '@/types/auth';

interface Props {
  initialSessions: EmployeeSession[];
  currentRole: UserRole;
  userEmail: string;
}

export function MySessionsClient({ initialSessions, currentRole }: Props) {
  const sessions = initialSessions;
  const todayStr = new Date().toISOString().slice(0, 10);

  const todaySessions = sessions.filter((s) => s.sessionDate === todayStr);
  const upcomingSessions = sessions.filter((s) => s.sessionDate > todayStr && s.status === 'SCHEDULED');
  const pendingAttendance = sessions.filter(
    (s) => s.status === 'ATTENDANCE_PENDING' || (s.sessionDate <= todayStr && s.status !== 'COMPLETED')
  );
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');

  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const fmtTime = (t?: string) => {
    if (!t) return '';
    return t.slice(0, 5);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🎓</span> {currentRole === 'Facilitator' ? 'My Assigned Training Sessions' : 'My Sessions & Engagements'}
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>
            Authoritative vocational training sessions scheduled for your cohorts. Mark student attendance and manage live meetings.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link
            href="/attendance"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '6px',
              background: '#0F172A',
              color: '#FFFFFF',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📋 Full Attendance Register
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Today&apos;s Sessions</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{todaySessions.length}</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{todayStr}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Upcoming Sessions</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>{upcomingSessions.length}</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Future scheduled dates</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Attendance Pending</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: pendingAttendance.length > 0 ? '#D97706' : '#16A34A', marginTop: '4px' }}>
            {pendingAttendance.length}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {pendingAttendance.length > 0 ? 'Requires attendance register' : 'All registers up to date'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Completed Sessions</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{completedSessions.length}</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Delivered &amp; confirmed</div>
        </div>
      </div>

      {/* Main Sessions Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Assigned Cohort Schedule</div>
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>Complete student attendance registers and launch online classrooms.</div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📚</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>No training sessions assigned</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', maxWidth: '480px', margin: '4px auto 0' }}>
              When administrators schedule sessions for your cohorts, they will appear here automatically with attendance management.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px' }}>Date &amp; Time</th>
                  <th style={{ padding: '12px 16px' }}>Cohort</th>
                  <th style={{ padding: '12px 16px' }}>Programme</th>
                  <th style={{ padding: '12px 16px' }}>Session &amp; Topic</th>
                  <th style={{ padding: '12px 16px' }}>Delivery Mode</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const isCompleted = s.status === 'COMPLETED';
                  const isPending = s.status === 'ATTENDANCE_PENDING' || (s.sessionDate <= todayStr && !isCompleted);

                  let statusBadge: { bg: string; color: string; label: string } = { bg: '#F1F5F9', color: '#475569', label: s.status || 'SCHEDULED' };
                  if (isCompleted) statusBadge = { bg: '#DCFCE7', color: '#15803D', label: 'COMPLETED' };
                  else if (isPending) statusBadge = { bg: '#FEF3C7', color: '#B45309', label: 'ATTENDANCE PENDING' };

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{fmtDate(s.sessionDate)}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          {fmtTime(s.startTime)} &ndash; {fmtTime(s.endTime)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#2563EB' }}>{s.cohortCode}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>{s.cohortName}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#334155' }}>
                        {s.programmeName}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          Session #{s.sessionNumber}: {s.sessionTitle}
                        </div>
                        {s.sessionDescription && (
                          <div style={{ fontSize: '11.5px', color: '#64748B', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.sessionDescription}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#EFF6FF', color: '#1E40AF' }}>
                          {s.deliveryMode}
                        </span>
                        {s.location && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{s.location}</div>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <Link
                            href={`/attendance?cohortId=${s.cohortId}`}
                            style={{
                              padding: '5px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#334155',
                              textDecoration: 'none',
                            }}
                          >
                            Mark Attendance
                          </Link>
                          {s.deliveryMode === 'ONLINE' && (
                            <Link
                              href="/meetings"
                              style={{
                                padding: '5px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                textDecoration: 'none',
                              }}
                            >
                              Launch Room
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
