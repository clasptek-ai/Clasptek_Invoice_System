'use client';

/**
 * components/dashboard/StaffFacilitatorDashboard.tsx
 * Phase 9E: User Workspaces Migration
 * Matches exact renderStaffDashboardTab view from clasptek_invoice_system.html
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { UserRole } from '@/types/auth';

interface Props {
  userName: string;
  role: UserRole;
  userEmail: string;
}

interface OverviewData {
  todaySessionsCount: number;
  upcomingSessionsCount: number;
  pendingAttendanceCount: number;
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

  useEffect(() => {
    fetch('/api/facilitator/overview')
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch((err) => console.error('Failed to load facilitator overview:', err))
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

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Welcome Header */}
      <div
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
            {role === 'Facilitator' ? 'Master Facilitator & Trainer' : 'Administrative Staff Member'} &middot; Academics &amp; Operations
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {role === 'Facilitator' && (
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
          )}
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '6px 14px',
              borderRadius: '999px',
              background: role === 'Facilitator' ? '#E0F2FE' : '#E0E7FF',
              color: role === 'Facilitator' ? '#0369A1' : '#3730A3',
            }}
          >
            {role.toUpperCase()} PORTAL
          </span>
        </div>
      </div>

      {/* Action Required: Payslip Awaiting Acknowledgement */}
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

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Latest Net Pay</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {loading ? '...' : fmtMoney(data?.latestNetPay || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {data?.latestPeriod || 'Current Period'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Statement Status</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '6px' }}>
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
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
            {data?.latestPayslipNo ? `Payslip #${data.latestPayslipNo}` : 'Awaiting Period Run'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Pending Acknowledgements</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: (data?.pendingAckCount || 0) > 0 ? '#D97706' : '#16A34A', marginTop: '4px' }}>
            {loading ? '...' : data?.pendingAckCount || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {(data?.pendingAckCount || 0) > 0 ? 'Review Required' : 'All Clear'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Compensation Disbursed</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {loading ? '...' : fmtMoney(data?.totalPaidEarnings || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Lifetime Paid History</div>
        </div>
      </div>

      {/* Recent Payslips & Discrepancies Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Left: Recent Payslips */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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
    </div>
  );
}
