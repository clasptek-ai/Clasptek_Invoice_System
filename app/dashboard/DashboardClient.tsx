'use client';

/**
 * app/dashboard/DashboardClient.tsx — Authoritative Clasptek Dashboard
 * Phase 9F: Visual Shell, Dashboard & Navigation Remediation
 * Faithful Next.js implementation of the original Clasptek Executive Command Centre
 * and Staff/Facilitator Workspace views.
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { StaffFacilitatorDashboard } from '@/components/dashboard/StaffFacilitatorDashboard';
import type { ManagementDashboardMetrics } from '@/types/intelligence';

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

export function DashboardClient() {
  const { user, role, tenant } = useAuth();
  const [metrics, setMetrics] = useState<ManagementDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/overview?scope=all_time');
      const data = await res.json();
      if (res.ok && data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const displayName = user?.full_name ?? user?.email?.split('@')[0] ?? 'Administrator';

  // Facilitator & Staff role gets the dedicated delivery & compensation workspace
  if (role === 'Facilitator' || role === 'Staff') {
    return (
      <div className="cp-dashboard-container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <StaffFacilitatorDashboard
          userName={user?.full_name || displayName}
          role={role}
          userEmail={user?.email || ''}
        />
      </div>
    );
  }

  // Super Admin, Finance Manager, and Operations Admin get the Executive Management Command Centre
  const fin = metrics?.finance;
  const crm = metrics?.admissions;
  const aca = metrics?.academics;
  const trn = metrics?.training;
  const pay = metrics?.payroll;

  const totalInvoiced = fin?.totalInvoiced ?? 0;
  const totalCollected = fin?.totalCollected ?? 0;
  const outstanding = fin?.outstandingBalance ?? 0;
  const payrollLiability = pay?.totalPayrollObligation ?? 0;

  return (
    <div className="cp-dashboard-view" style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ─── 1. EXECUTIVE GREETING & COMMAND CENTRE HEADER ─────────────────────── */}
      <div
        className="cp-card"
        style={{
          margin: 0,
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🏛️</span> {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Executive Command Centre &middot; {tenant?.name ?? 'Clasptek Portal'} &middot; Database-authoritative intelligence
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="cp-btn sm secondary"
            id="btnRefreshDashboard"
            onClick={fetchMetrics}
            title="Refresh database metrics"
          >
            🔄 Refresh Intelligence
          </button>
          <Link
            href="/reports"
            className="cp-btn sm accent"
            id="btnQuickReport"
            style={{ textDecoration: 'none' }}
          >
            📊 Management Reports
          </Link>
          <span
            className="cp-pill paid"
            style={{
              fontSize: '11px',
              padding: '6px 12px',
              borderRadius: '999px',
              fontWeight: 800,
            }}
          >
            {(role ?? 'SUPER ADMIN').toUpperCase()} PORTAL
          </span>
        </div>
      </div>

      {/* ─── 2. 7-STAGE CUSTOMER JOURNEY & ADMISSIONS LIFECYCLE ───────────────── */}
      <div
        className="cp-card"
        style={{
          margin: 0,
          borderTop: '3px solid var(--primary)',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧭</span> Customer Journey &amp; Admissions Lifecycle
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              End-to-end progression from prospect lead, active follow-up, admissions intake, student records, training delivery, to certificate issuance.
            </div>
          </div>
        </div>

        {/* 7-Stage Connected Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {/* 01 Enquiry */}
          <Link
            href="/enquiries"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              transition: 'transform 0.15s ease, border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#E2E8F0', color: '#475569' }}>01</span>
              <span className="cp-pill draft" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{crm?.totalEnquiries ?? 0} Leads</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Enquiry / Lead</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Inbound Interest</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enquiries &rarr;</div>
          </Link>

          {/* 02 Outreach */}
          <Link
            href="/enquiries"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309' }}>02</span>
              <span className="cp-pill partial" style={{ fontSize: '9.5px', padding: '1px 6px' }}>Action</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Follow-up &amp; Outreach</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Active Engagement</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enquiries &rarr;</div>
          </Link>

          {/* 03 Application */}
          <Link
            href="/applications"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#E0E7FF', color: '#4338CA' }}>03</span>
              <span className="cp-pill info" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{crm?.totalApplications ?? 0} Apps</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Candidate Application</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Admissions Intake</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#applications &rarr;</div>
          </Link>

          {/* 04 Student */}
          <Link
            href="/students"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#DCFCE7', color: '#15803D' }}>04</span>
              <span className="cp-pill paid" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{aca?.activeStudents ?? 0} Students</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Student Accounts</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Directory Master</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#students &rarr;</div>
          </Link>

          {/* 05 Enrolment */}
          <Link
            href="/enrolments"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#F3E8FF', color: '#7E22CE' }}>05</span>
              <span className="cp-pill active" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{aca?.activeEnrolments ?? 0} Enrolled</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Course Enrolment</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Active Cohorts</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enrolments &rarr;</div>
          </Link>

          {/* 06 Training Delivery */}
          <Link
            href="/attendance"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#EFF6FF', color: '#1D4ED8' }}>06</span>
              <span className="cp-pill info" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{trn?.totalSessions ?? 0} Sessions</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Training Delivery</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{trn?.attendanceRate ?? 100}% Attendance</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#attendance &rarr;</div>
          </Link>

          {/* 07 Certificate */}
          <Link
            href="/certificates"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 10px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#DCFCE7', color: '#15803D' }}>07</span>
              <span className="cp-pill paid" style={{ fontSize: '9.5px', padding: '1px 6px' }}>Certified</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Completion &amp; Certificate</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>QR Verified</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#certificates &rarr;</div>
          </Link>
        </div>
      </div>

      {/* ─── 3. PILLAR 1: FINANCIAL OVERVIEW ──────────────────────────────────── */}
      <div
        className="cp-card"
        style={{
          margin: 0,
          borderTop: '3px solid #10B981',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '20px', height: '20px', background: '#10B981', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>1</span>
              Financial Overview &amp; Cash Flow
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Real-time ledger totals: billing issued, payments collected, receivables due, and payroll obligation.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/invoices" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Invoices &rarr;
            </Link>
            <Link href="/payments" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Payments &rarr;
            </Link>
          </div>
        </div>

        <div className="cp-kpi-grid" style={{ margin: 0 }}>
          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #1D4ED8' }}>
            <div className="cp-kpi-label">Total Revenue (Invoiced)</div>
            <div className="cp-kpi-val" style={{ color: '#1D4ED8' }}>
              {loading ? '...' : fmtMoney(totalInvoiced)}
            </div>
            <div className="cp-kpi-sub">Lifetime programme fees billed</div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #10B981' }}>
            <div className="cp-kpi-label">Total Income (Collected)</div>
            <div className="cp-kpi-val" style={{ color: '#15803D' }}>
              {loading ? '...' : fmtMoney(totalCollected)}
            </div>
            <div className="cp-kpi-sub">
              Collection Efficiency: <strong>{fin?.collectionRate ?? 0}%</strong>
            </div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #F59E0B' }}>
            <div className="cp-kpi-label">Outstanding Receivables</div>
            <div className="cp-kpi-val" style={{ color: '#D97706' }}>
              {loading ? '...' : fmtMoney(outstanding)}
            </div>
            <div className="cp-kpi-sub">
              Overdue: <strong style={{ color: '#DC2626' }}>{fmtMoney(fin?.overdueReceivables ?? 0)}</strong>
            </div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #DC2626' }}>
            <div className="cp-kpi-label">Payroll Liability (Outflows)</div>
            <div className="cp-kpi-val" style={{ color: '#DC2626' }}>
              {loading ? '...' : fmtMoney(payrollLiability)}
            </div>
            <div className="cp-kpi-sub">Personnel &amp; facilitator compensation</div>
          </div>
        </div>
      </div>

      {/* ─── 4. PILLAR 2 & 3: ADMISSIONS CRM & ACADEMIC OPERATIONS GRID ────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Pillar 2: CRM & Admissions Funnel */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #0284C7',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', background: '#0284C7', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>2</span>
                Admissions &amp; CRM Pipeline
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Conversion of candidate interest into confirmed enrolments
              </div>
            </div>
            <Link href="/applications" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Applications &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Total Inbound Enquiries:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : crm?.totalEnquiries ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Candidate Applications Received:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : crm?.totalApplications ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Qualified Admissions:</span>
              <strong style={{ fontSize: '13px', color: '#0284C7' }}>{loading ? '...' : crm?.qualifiedApplications ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#ECFDF5', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>Confirmed Enrolments Converted:</span>
              <strong style={{ fontSize: '13px', color: '#15803D' }}>{loading ? '...' : crm?.convertedCount ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#EFF6FF', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
              <span style={{ fontSize: '13px', color: '#1E40AF', fontWeight: 700 }}>Conversion Rate:</span>
              <strong style={{ fontSize: '14px', color: '#1D4ED8' }}>{loading ? '...' : `${crm?.conversionRate ?? 0}%`}</strong>
            </div>
          </div>
        </div>

        {/* Pillar 3: Academic Operations & Training Delivery */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #8B5CF6',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', background: '#8B5CF6', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>3</span>
                Academic &amp; Training Operations
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Student registry, cohorts, attendance, and LiveKit meetings
              </div>
            </div>
            <Link href="/attendance" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Attendance &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Active Registered Students:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : aca?.activeStudents ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Active Programme Enrolments:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : aca?.activeEnrolments ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Total Training Sessions:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>
                {loading ? '...' : `${trn?.completedSessions ?? 0} completed / ${trn?.totalSessions ?? 0} total`}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#ECFDF5', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>Overall Attendance Rate:</span>
              <strong style={{ fontSize: '13px', color: '#15803D' }}>{loading ? '...' : `${trn?.attendanceRate ?? 100}%`}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F5F3FF', borderRadius: '6px', border: '1px solid #DDD6FE' }}>
              <span style={{ fontSize: '13px', color: '#5B21B6', fontWeight: 700 }}>Active Training Cohorts:</span>
              <strong style={{ fontSize: '14px', color: '#7C3AED' }}>{loading ? '...' : aca?.cohortsCount ?? 0} Cohorts</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
