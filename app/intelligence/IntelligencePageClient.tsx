'use client';

/**
 * app/intelligence/IntelligencePageClient.tsx — Phase 7
 * Interactive Client Component for Management Intelligence Dashboard.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState } from 'react';
import type { ManagementDashboardMetrics, DateFilterScope } from '@/types/intelligence';

interface IntelligencePageClientProps {
  initialMetrics: ManagementDashboardMetrics;
}

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

export function IntelligencePageClient({ initialMetrics }: IntelligencePageClientProps) {
  const [metrics, setMetrics] = useState<ManagementDashboardMetrics>(initialMetrics);
  const [activeTab, setActiveTab] = useState<'overview' | 'admissions' | 'academics' | 'training' | 'finance' | 'payroll'>('overview');
  const [dateScope, setDateScope] = useState<DateFilterScope>('all_time');
  const [isLoading, setIsLoading] = useState(false);

  // Handle date scope changes
  const handleScopeChange = async (scope: DateFilterScope) => {
    setDateScope(scope);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/intelligence/overview?scope=${scope}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Failed to update scope:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Category', 'Metric', 'Value'];
    const rows = [
      ['Admissions', 'Total Enquiries', metrics.admissions.totalEnquiries],
      ['Admissions', 'Total Applications', metrics.admissions.totalApplications],
      ['Admissions', 'Qualified Applications', metrics.admissions.qualifiedApplications],
      ['Admissions', 'Converted to Students', metrics.admissions.convertedCount],
      ['Admissions', 'Conversion Rate', `${metrics.admissions.conversionRate}%`],
      ['Academics', 'Active Students', metrics.academics.activeStudents],
      ['Academics', 'Active Enrolments', metrics.academics.activeEnrolments],
      ['Academics', 'Academic Programmes', metrics.academics.programmesCount],
      ['Academics', 'Active Cohorts', metrics.academics.cohortsCount],
      ['Training', 'Total Sessions', metrics.training.totalSessions],
      ['Training', 'Completed Sessions', metrics.training.completedSessions],
      ['Training', 'Overall Attendance Rate', `${metrics.training.attendanceRate}%`],
      ['Meetings', 'Total Meetings', metrics.meetings.totalMeetings],
      ['Meetings', 'Recordings Available', metrics.meetings.recordingsAvailable],
      ['Finance', 'Total Invoiced', metrics.finance.totalInvoiced],
      ['Finance', 'Total Collected', metrics.finance.totalCollected],
      ['Finance', 'Outstanding Balance', metrics.finance.outstandingBalance],
      ['Finance', 'Overdue Receivables', metrics.finance.overdueReceivables],
      ['Finance', 'Collection Rate', `${metrics.finance.collectionRate}%`],
      ['Payroll', 'Total Payroll Obligation', metrics.payroll.totalPayrollObligation],
      ['Payroll', 'Disbursed Paid', metrics.payroll.disbursedPaidPayroll],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clasptek_management_intelligence_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Top Banner */}
      <div className="cp-card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--primary, #0284c7)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏛️</span> CLASPTEK MANAGEMENT INTELLIGENCE
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
              Consolidated operational intelligence across Admissions, Academics, Training, Meetings, Finance, and Payroll.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Scope Filter */}
            <select
              value={dateScope}
              onChange={(e) => handleScopeChange(e.target.value as DateFilterScope)}
              style={{
                padding: '6px 12px',
                fontSize: '12.5px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all_time">All Time (Authoritative)</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
            </select>

            <button className="cp-btn sm secondary" onClick={handleExportCSV}>
              📥 Export Intelligence CSV
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', overflowX: 'auto', paddingBottom: '2px' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'admissions', label: 'Admissions' },
          { id: 'academics', label: 'Academics' },
          { id: 'training', label: 'Training & Meetings' },
          { id: 'finance', label: 'Finance' },
          { id: 'payroll', label: 'Payroll' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? 'var(--primary, #0284c7)' : 'var(--text-secondary, #64748b)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary, #0284c7)' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: '-2px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
          Refreshing authoritative metrics...
        </div>
      )}

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {/* Finance Overview */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>💰 Financial Summary</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px' }}>
                {metrics.finance.collectionRate}% Collected
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Total Invoiced:</span>
              <strong>{fmtMoney(metrics.finance.totalInvoiced)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#059669' }}>Total Collected:</span>
              <strong style={{ color: '#059669' }}>{fmtMoney(metrics.finance.totalCollected)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#d97706' }}>Outstanding Balance:</span>
              <strong style={{ color: '#d97706' }}>{fmtMoney(metrics.finance.outstandingBalance)}</strong>
            </div>
          </div>

          {/* Admissions Funnel Overview */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>🎯 Admissions Funnel</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: '12px' }}>
                {metrics.admissions.conversionRate}% Conversion
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Active Enquiries:</span>
              <strong>{metrics.admissions.totalEnquiries}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Applications Received:</span>
              <strong>{metrics.admissions.totalApplications}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#059669' }}>Converted to Students:</span>
              <strong style={{ color: '#059669' }}>{metrics.admissions.convertedCount}</strong>
            </div>
          </div>

          {/* Academics Overview */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #8b5cf6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>📚 Student &amp; Academic Body</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: '12px' }}>
                {metrics.academics.programmesCount} Programmes
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Active Students:</span>
              <strong>{metrics.academics.activeStudents}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Active Enrolments:</span>
              <strong>{metrics.academics.activeEnrolments}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#64748b' }}>Active Cohorts:</span>
              <strong>{metrics.academics.cohortsCount}</strong>
            </div>
          </div>

          {/* Training Delivery Overview */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>🎓 Training &amp; Delivery</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#d97706', background: '#fffbeb', padding: '2px 8px', borderRadius: '12px' }}>
                {metrics.training.attendanceRate}% Attendance
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Total Sessions:</span>
              <strong>{metrics.training.totalSessions}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Completed Sessions:</span>
              <strong>{metrics.training.completedSessions}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#64748b' }}>Active Facilitators:</span>
              <strong>{metrics.training.facilitatorsActive}</strong>
            </div>
          </div>

          {/* Meetings & Video SFU */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #06b6d4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>📹 Meetings &amp; Live Rooms</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0891b2', background: '#ecfeff', padding: '2px 8px', borderRadius: '12px' }}>
                LiveKit SFU
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Scheduled Meetings:</span>
              <strong>{metrics.meetings.scheduledMeetings}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Completed Sessions:</span>
              <strong>{metrics.meetings.completedMeetings}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#059669' }}>Drive Recordings Available:</span>
              <strong style={{ color: '#059669' }}>{metrics.meetings.recordingsAvailable}</strong>
            </div>
          </div>

          {/* Payroll Overview */}
          <div className="cp-card" style={{ padding: '16px 20px', borderTop: '3px solid #ec4899' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>💼 Payroll &amp; Compensation</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#db2777', background: '#fdf2f8', padding: '2px 8px', borderRadius: '12px' }}>
                {metrics.payroll.totalStaffCount + metrics.payroll.totalFacilitatorCount} Personnel
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#64748b' }}>Total Payroll Obligation:</span>
              <strong>{fmtMoney(metrics.payroll.totalPayrollObligation)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#d97706' }}>Pending Approval:</span>
              <strong style={{ color: '#d97706' }}>{fmtMoney(metrics.payroll.approvedReadyPayroll)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#059669' }}>Disbursed (Paid):</span>
              <strong style={{ color: '#059669' }}>{fmtMoney(metrics.payroll.disbursedPaidPayroll)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADMISSIONS INTELLIGENCE */}
      {activeTab === 'admissions' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #0284c7' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL ENQUIRIES</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.admissions.totalEnquiries}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Initial leads logged</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>APPLICATIONS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.admissions.totalApplications}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Submissions received</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>QUALIFIED</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.admissions.qualifiedApplications}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Matched &amp; qualified</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>CONVERTED STUDENTS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>{metrics.admissions.convertedCount}</div>
              <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>{metrics.admissions.conversionRate}% overall conversion</div>
            </div>
          </div>

          <div className="cp-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: '#0f172a' }}>
              Programme Demand Distribution
            </div>
            <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Academic Programme</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Enrolled Applicants</th>
                </tr>
              </thead>
              <tbody>
                {metrics.admissions.topProgrammes.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.programmeName}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ACADEMICS INTELLIGENCE */}
      {activeTab === 'academics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #0284c7' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ACTIVE STUDENTS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.academics.activeStudents}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Verified student profiles</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ACTIVE ENROLMENTS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>{metrics.academics.activeEnrolments}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Enrolled &amp; in-progress</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>PROGRAMMES</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.academics.programmesCount}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Active curriculum paths</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>COHORTS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.academics.cohortsCount}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Class cohorts tracked</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Programme Table */}
            <div className="cp-card" style={{ padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Programmes &amp; Enrolments</div>
              <table className="cp-table" style={{ width: '100%', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '6px 10px' }}>Code</th>
                    <th style={{ padding: '6px 10px' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Students</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.academics.programmeDistribution.map((p) => (
                    <tr key={p.programmeId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{p.code}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 500 }}>{p.programmeName}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{p.studentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cohort Table */}
            <div className="cp-card" style={{ padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Cohorts &amp; Capacity</div>
              <table className="cp-table" style={{ width: '100%', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '6px 10px' }}>Cohort Code</th>
                    <th style={{ padding: '6px 10px' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.academics.cohortDistribution.map((c) => (
                    <tr key={c.cohortId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{c.cohortCode}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 600 }}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TRAINING & MEETINGS */}
      {activeTab === 'training' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #0284c7' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL SESSIONS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.training.totalSessions}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>{metrics.training.completedSessions} completed</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ATTENDANCE RATE</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>{metrics.training.attendanceRate}%</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Present &amp; Late over Total</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>FACILITATOR REPORTS</div>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>{metrics.training.totalReportsSubmitted}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Verified delivery logs</div>
            </div>
            <div className="cp-card" style={{ padding: '14px 18px', borderLeft: '3px solid #06b6d4' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>RECORDINGS STORED</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#0891b2', margin: '4px 0' }}>{metrics.meetings.recordingsAvailable}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Google Drive Central</div>
            </div>
          </div>

          <div className="cp-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Attendance Logged Breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
              <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#059669', fontWeight: 600, fontSize: '12px' }}>PRESENT</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginTop: '4px' }}>{metrics.training.attendanceBreakdown.present}</div>
              </div>
              <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#d97706', fontWeight: 600, fontSize: '12px' }}>LATE</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{metrics.training.attendanceBreakdown.late}</div>
              </div>
              <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#0284c7', fontWeight: 600, fontSize: '12px' }}>EXCUSED</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{metrics.training.attendanceBreakdown.excused}</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px' }}>ABSENT</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>{metrics.training.attendanceBreakdown.absent}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FINANCE */}
      {activeTab === 'finance' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #0284c7' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL INVOICED</div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>{fmtMoney(metrics.finance.totalInvoiced)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Tuition &amp; service billings</div>
            </div>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL COLLECTED</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>{fmtMoney(metrics.finance.totalCollected)}</div>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>{metrics.finance.collectionRate}% Collection Rate</div>
            </div>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>OUTSTANDING BALANCE</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', margin: '4px 0' }}>{fmtMoney(metrics.finance.outstandingBalance)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Pending fee settlements</div>
            </div>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>OVERDUE RECEIVABLES</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', margin: '4px 0' }}>{fmtMoney(metrics.finance.overdueReceivables)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Past invoice due date</div>
            </div>
          </div>

          <div className="cp-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Invoice Status Health</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
              <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#0284c7', fontSize: '12px', fontWeight: 600 }}>UNPAID</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{metrics.finance.invoiceStatusCounts.unpaid}</div>
              </div>
              <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#d97706', fontSize: '12px', fontWeight: 600 }}>PARTIALLY PAID</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{metrics.finance.invoiceStatusCounts.partial}</div>
              </div>
              <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#059669', fontSize: '12px', fontWeight: 600 }}>FULLY PAID</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginTop: '4px' }}>{metrics.finance.invoiceStatusCounts.paid}</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>OVERDUE</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>{metrics.finance.invoiceStatusCounts.overdue}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: PAYROLL */}
      {activeTab === 'payroll' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #64748b' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL PAYROLL OBLIGATION</div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>{fmtMoney(metrics.payroll.totalPayrollObligation)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Across all compensation stages</div>
            </div>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #d97706' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>APPROVED READY</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', margin: '4px 0' }}>{fmtMoney(metrics.payroll.approvedReadyPayroll)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Ready for bank disbursement</div>
            </div>
            <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #059669' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>DISBURSED (PAID)</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>{fmtMoney(metrics.payroll.disbursedPaidPayroll)}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Settled staff &amp; facilitator pay</div>
            </div>
          </div>

          <div className="cp-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Personnel Headcount</div>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>CORE STAFF MEMBERS</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{metrics.payroll.totalStaffCount}</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>MASTER FACILITATORS</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#a21caf', marginTop: '6px' }}>{metrics.payroll.totalFacilitatorCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
