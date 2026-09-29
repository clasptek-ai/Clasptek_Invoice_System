'use client';

/**
 * app/dashboard/DashboardClient.tsx — Authoritative Clasptek Management Operations Dashboard
 * CLASPKTEK-2026-PROFESSIONAL-DASHBOARD-ENHANCEMENT-001
 *
 * Professional Training Centre Management & Operations Dashboard combining:
 * 1. The clean hierarchy and organization of the current dashboard
 * 2. The operational depth and monitoring capabilities of the original dashboard:
 *    - Categorized Management Attention Centre (Requires Attention, Action Required, Informational)
 *    - 8-Stage Clasptek Training Centre Lifecycle (PROSPECT -> ENQUIRY -> FOLLOW-UP -> STUDENT -> ENROLMENT -> TRAINING -> COMPLETION -> CERTIFICATE)
 *    - Authoritative Financial Overview & Cash Flow (Total Invoiced, Amount Received, Outstanding, Overdue)
 *    - Admissions & CRM Pipeline (public.enquiries statuses: NEW, CONTACTED, INTERESTED, INVOICE_REQUESTED, INVOICE_ISSUED, ENROLLED, LOST) + Follow-up Monitoring
 *    - Academic & Training Operations (Active Students, Enrolments, Cohorts, Sessions, Attendance)
 *    - Dedicated Student Activity Section (Total, Active, Enrolled, Completed, Certificates, Recently Registered)
 *    - Upcoming Training Operations / Sessions Schedule
 *    - Overdue Receivables Table with Standardized Pagination (10/25/50/100)
 *    - Recent Audit & Governance Activity with Role-Restricted Audit Log Access
 *
 * STRICT INVARIANTS:
 * - Zero emoji icons (Strictly clean SVG icons matching Clasptek cp-* visual tokens).
 * - Multi-tenant RLS isolation with authoritative database figures only.
 * - Zero synthetic historical payment transactions or fabricated business records.
 * - Strictly NO Applicant Tracking / Applicant Portal / Intake Portal terminology.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { StaffFacilitatorDashboard } from '@/components/dashboard/StaffFacilitatorDashboard';
import { Pagination } from '@/components/tables/Pagination';
import { usePagination } from '@/lib/hooks/usePagination';
import type {
  ManagementDashboardMetrics,
  OverdueReceivableItem,
} from '@/types/intelligence';

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function fmtTime(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

export type AlertCategory = 'ALL' | 'requires_attention' | 'action_required' | 'informational';

export interface OperationalAlert {
  id: string;
  category: 'requires_attention' | 'action_required' | 'informational';
  domain: string;
  severity: 'critical' | 'high' | 'medium' | 'informational';
  title: string;
  description: string;
  status: string;
  assignedRole: string;
  actionUrl: string;
  actionLabel: string;
}

function getOperationalAlerts(metrics: ManagementDashboardMetrics | null): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!metrics) return alerts;

  const fin = metrics.finance;
  const crm = metrics.crmPipeline;
  const pay = metrics.payroll;
  const stu = metrics.studentActivity;
  const life = metrics.lifecycle;

  // ─── A. REQUIRES ATTENTION ────────────────────────────────────────────────
  // 1. Overdue Receivables Awaiting Collection
  const overdueAmt = fin?.overdueReceivables ?? 0;
  const overdueCount = metrics.overdueReceivablesList?.length ?? (overdueAmt > 0 ? 1 : 0);
  if (overdueAmt > 0) {
    alerts.push({
      id: 'alt_fin_overdue',
      category: 'requires_attention',
      domain: 'FINANCE',
      severity: overdueAmt >= 500000 ? 'critical' : 'high',
      title: `${overdueCount > 0 ? `${overdueCount} ` : ''}Overdue Invoices Awaiting Collection`,
      description: `${fmtMoney(overdueAmt)} overdue across ${overdueCount || 'outstanding'} invoices past payment due date.`,
      status: 'OPEN',
      assignedRole: 'Finance Staff',
      actionUrl: '/receivables',
      actionLabel: 'Review Ageing',
    });
  }

  // 2. High-Value Accounts Outstanding (>= ₦200,000)
  const outstanding = fin?.outstandingBalance ?? 0;
  if (outstanding >= 200000) {
    alerts.push({
      id: 'alt_fin_high_val',
      category: 'requires_attention',
      domain: 'FINANCE',
      severity: 'high',
      title: `High-Value Accounts Outstanding (≥ ₦200,000)`,
      description: `Cumulative outstanding tuition balances (${fmtMoney(outstanding)}) require collections follow-up.`,
      status: 'OPEN',
      assignedRole: 'Finance Manager',
      actionUrl: '/receivables',
      actionLabel: 'View Receivables',
    });
  }

  // 3. Month-End Payroll Ready for Disbursement
  const approvedCount = pay?.payslipCountsByStatus?.['approved'] ?? 0;
  const approvedAmt = pay?.approvedReadyPayroll ?? 0;
  if (approvedCount > 0 || approvedAmt > 0) {
    alerts.push({
      id: 'alt_hr_payroll_disburse',
      category: 'requires_attention',
      domain: 'HR & PAYROLL',
      severity: 'high',
      title: `Month-End Payroll Ready: ${approvedCount > 0 ? `${approvedCount} Statements` : 'Batches Approved'} (${fmtMoney(approvedAmt)})`,
      description: `Approved statements are ready for bank transfer disbursement to staff and facilitators.`,
      status: 'OPEN',
      assignedRole: 'Finance Manager',
      actionUrl: '/payroll',
      actionLabel: 'Disburse Batch',
    });
  }

  // ─── B. ACTION REQUIRED ───────────────────────────────────────────────────
  // 4. Follow-ups Due & Overdue
  const followUpsOverdue = crm?.followUpsOverdue ?? 0;
  const followUpsDueToday = crm?.followUpsDueToday ?? 0;
  if (followUpsOverdue > 0 || followUpsDueToday > 0) {
    alerts.push({
      id: 'alt_crm_followups',
      category: 'action_required',
      domain: 'CRM',
      severity: followUpsOverdue > 0 ? 'high' : 'medium',
      title: `${followUpsOverdue > 0 ? `${followUpsOverdue} Overdue Follow-ups` : `${followUpsDueToday} Follow-ups Due Today`}`,
      description: `${followUpsOverdue > 0 ? `${followUpsOverdue} prospect leads waiting >48h without contact.` : `${followUpsDueToday} enquiries logged today awaiting intake consultation.`}`,
      status: 'PENDING',
      assignedRole: 'Admissions Officer',
      actionUrl: '/enquiries',
      actionLabel: 'Log Follow-up',
    });
  }

  // 5. Inbound Enquiries Requesting Invoice
  const invRequested = crm?.invoiceRequested ?? 0;
  if (invRequested > 0) {
    alerts.push({
      id: 'alt_crm_inv_req',
      category: 'action_required',
      domain: 'ADMISSIONS',
      severity: 'medium',
      title: `${invRequested} Enquir${invRequested > 1 ? 'ies' : 'y'} Requesting Tuition Invoice`,
      description: `Prospective students confirmed interest and requested official tuition invoice.`,
      status: 'PENDING',
      assignedRole: 'Finance Staff',
      actionUrl: '/invoices',
      actionLabel: 'Generate Invoices',
    });
  }

  // 6. Payslips Awaiting Employee Acknowledgement
  const unackCount = pay?.payslipCountsByStatus?.['issued'] ?? pay?.payslipCountsByStatus?.['pending'] ?? 0;
  if (unackCount > 0) {
    alerts.push({
      id: 'alt_hr_unack_payslips',
      category: 'action_required',
      domain: 'HR & PAYROLL',
      severity: 'medium',
      title: `${unackCount} Payslips Awaiting Employee Acknowledgement`,
      description: `Staff and facilitators have unacknowledged payslip statements pending for the pay cycle.`,
      status: 'PENDING',
      assignedRole: 'Finance Staff',
      actionUrl: '/payroll',
      actionLabel: 'Review Payslips',
    });
  }

  // ─── C. INFORMATIONAL ─────────────────────────────────────────────────────
  // 7. Inbound Leads / Prospects
  const newLeads = crm?.newEnquiries ?? 0;
  if (newLeads > 0) {
    alerts.push({
      id: 'alt_crm_new_leads',
      category: 'informational',
      domain: 'CRM',
      severity: 'informational',
      title: `${newLeads} Inbound Prospect Leads Recorded`,
      description: `Prospective candidates registered inbound inquiries for upcoming training cohorts.`,
      status: 'INFO',
      assignedRole: 'Admissions Team',
      actionUrl: '/enquiries',
      actionLabel: 'View Enquiries',
    });
  }

  // 8. Active Student Registry
  const totalStudents = stu?.totalStudents ?? 0;
  if (totalStudents > 0) {
    alerts.push({
      id: 'alt_stu_registered',
      category: 'informational',
      domain: 'ACADEMICS',
      severity: 'informational',
      title: `${totalStudents} Registered Student Accounts in Directory`,
      description: `${stu?.activeStudents ?? 0} active students enrolled across ${metrics.academics?.cohortsCount ?? 0} cohorts.`,
      status: 'INFO',
      assignedRole: 'Registrar',
      actionUrl: '/students',
      actionLabel: 'View Directory',
    });
  }

  // 9. Tuition Collections Progress
  const totalCollected = fin?.totalCollected ?? 0;
  if (totalCollected > 0) {
    alerts.push({
      id: 'alt_fin_collections',
      category: 'informational',
      domain: 'FINANCE',
      severity: 'informational',
      title: `${fmtMoney(totalCollected)} Total Tuition Collected`,
      description: `Overall collection efficiency is at ${fin?.collectionRate ?? 0}% against issued tuition billings.`,
      status: 'INFO',
      assignedRole: 'Finance Team',
      actionUrl: '/payments',
      actionLabel: 'View Payments',
    });
  }

  // 10. Issued Credentials
  const certsCount = life?.certificates ?? 0;
  if (certsCount > 0) {
    alerts.push({
      id: 'alt_cert_issued',
      category: 'informational',
      domain: 'CREDENTIALS',
      severity: 'informational',
      title: `${certsCount} Cryptographically Verified Certificates Issued`,
      description: `Graduates have received tamper-evident certificates with public QR verification.`,
      status: 'INFO',
      assignedRole: 'Operations Admin',
      actionUrl: '/certificates',
      actionLabel: 'View Certificates',
    });
  }

  return alerts;
}

export function DashboardClient() {
  const { user, role, tenant } = useAuth();
  const [metrics, setMetrics] = useState<ManagementDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [alertTab, setAlertTab] = useState<AlertCategory>('ALL');

  const fetchMetrics = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/intelligence/overview?scope=all_time');
      const data = await res.json();
      if (res.ok && data.success && data.metrics) {
        setMetrics(data.metrics);
      } else {
        setFetchError(data.error || 'Failed to load intelligence metrics');
      }
    } catch (err: unknown) {
      console.error('Failed to load dashboard metrics:', err);
      setFetchError(err instanceof Error ? err.message : 'Network error loading metrics');
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

  // Super Admin, Finance Manager, Operations Admin get the Executive Management Operations Dashboard
  const fin = metrics?.finance;
  const crm = metrics?.crmPipeline;
  const aca = metrics?.academics;
  const trn = metrics?.training;
  const pay = metrics?.payroll;
  const stu = metrics?.studentActivity;
  const life = metrics?.lifecycle;

  const totalInvoiced = fin?.totalInvoiced ?? 0;
  const totalCollected = fin?.totalCollected ?? 0;
  const outstanding = fin?.outstandingBalance ?? 0;
  const overdueReceivables = fin?.overdueReceivables ?? 0;
  const payrollLiability = pay?.totalPayrollObligation ?? 0;

  // Alerts filtering by category
  const allAlerts = useMemo(() => getOperationalAlerts(metrics), [metrics]);
  const attentionCount = allAlerts.filter((a) => a.category === 'requires_attention').length;
  const actionCount = allAlerts.filter((a) => a.category === 'action_required').length;
  const infoCount = allAlerts.filter((a) => a.category === 'informational').length;

  const filteredAlerts = useMemo(() => {
    if (alertTab === 'ALL') return allAlerts;
    return allAlerts.filter((a) => a.category === alertTab);
  }, [allAlerts, alertTab]);

  // Overdue Receivables standard table pagination
  const overdueInvoicesList = metrics?.overdueReceivablesList ?? [];
  const {
    currentPage: recPage,
    pageSize: recPageSize,
    paginatedItems: paginatedOverdue,
    totalCount: recTotalCount,
    onPageChange: onRecPageChange,
    onPageSizeChange: onRecPageSizeChange,
  } = usePagination<OverdueReceivableItem>(overdueInvoicesList, {
    initialPageSize: 25,
    resetDeps: [overdueInvoicesList],
  });

  const isSuperAdmin = role === 'Super Admin';
  const isFinanceRole = role === 'Finance Manager' || role === 'Finance Staff' || role === 'Super Admin';

  return (
    <div
      className="cp-dashboard-view"
      style={{
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
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
              gap: '10px',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--primary)' }}
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Executive Command Centre &middot; {tenant?.name ?? 'Clasptek Training Centre'} &middot; Authoritative management intelligence
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="cp-btn sm secondary"
            id="btnRefreshDashboard"
            onClick={fetchMetrics}
            disabled={loading}
            title="Refresh database metrics"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh Intelligence'}
          </button>

          <Link
            href="/reports"
            className="cp-btn sm secondary"
            id="btnQuickReport"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Management Reports
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

      {fetchError && (
        <div
          className="cp-card"
          style={{
            margin: 0,
            padding: '12px 16px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Error loading authoritative metrics: {fetchError}</span>
          <button className="cp-btn sm secondary" onClick={fetchMetrics}>
            Retry
          </button>
        </div>
      )}

      {/* ─── 2. MANAGEMENT ATTENTION CENTRE ───────────────────────────────────── */}
      <div
        className="cp-card"
        id="managementAttentionCentre"
        style={{
          margin: 0,
          borderLeft: '4px solid var(--accent, #C1272D)',
          padding: '18px 20px',
          background: '#FCFDFF',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div
              className="cp-section-title"
              style={{
                fontSize: '16px',
                fontWeight: 800,
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #C1272D)' }} aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Management Attention Centre
              <span
                className={`cp-pill ${attentionCount > 0 ? 'danger' : actionCount > 0 ? 'partial' : 'paid'}`}
                style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 800 }}
              >
                {allAlerts.length} OPERATIONAL ITEM{allAlerts.length !== 1 ? 'S' : ''}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Multi-department operational exceptions organized by urgency and requiring authorization or intervention.
            </div>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`cp-btn sm ${alertTab === 'ALL' ? 'primary' : 'secondary'}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => setAlertTab('ALL')}
            >
              All ({allAlerts.length})
            </button>
            <button
              type="button"
              className={`cp-btn sm ${alertTab === 'requires_attention' ? 'primary' : 'secondary'}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => setAlertTab('requires_attention')}
            >
              Requires Attention ({attentionCount})
            </button>
            <button
              type="button"
              className={`cp-btn sm ${alertTab === 'action_required' ? 'primary' : 'secondary'}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => setAlertTab('action_required')}
            >
              Action Required ({actionCount})
            </button>
            <button
              type="button"
              className={`cp-btn sm ${alertTab === 'informational' ? 'primary' : 'secondary'}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => setAlertTab('informational')}
            >
              Informational ({infoCount})
            </button>
          </div>
        </div>

        {/* Operational Attention Grid */}
        <div
          className="cp-attention-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '12px',
          }}
        >
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
              Loading operational attention items...
            </div>
          ) : filteredAlerts.length > 0 ? (
            filteredAlerts.map((alt) => {
              let badgeColor = '#DC2626';
              let badgeBg = '#FEE2E2';
              if (alt.severity === 'high') {
                badgeColor = '#EA580C';
                badgeBg = '#FFEDD5';
              } else if (alt.severity === 'medium') {
                badgeColor = '#D97706';
                badgeBg = '#FEF3C7';
              } else if (alt.severity === 'informational') {
                badgeColor = '#2563EB';
                badgeBg = '#DBEAFE';
              }

              return (
                <div
                  key={alt.id}
                  className="cp-alert-card"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    padding: '12px 14px',
                    background: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: badgeBg,
                          color: badgeColor,
                          textTransform: 'uppercase',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: badgeColor,
                            display: 'inline-block',
                          }}
                        />
                        {alt.severity} &middot; {alt.domain}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{alt.status}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {alt.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {alt.description}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '8px',
                      borderTop: '1px solid #F1F5F9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      Assigned: <strong style={{ color: 'var(--text-primary)' }}>{alt.assignedRole}</strong>
                    </span>
                    <Link
                      href={alt.actionUrl}
                      className="cp-btn sm secondary btn-alt-action"
                      style={{ padding: '4px 10px', fontSize: '11px', textDecoration: 'none' }}
                    >
                      {alt.actionLabel} &rarr;
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div
              style={{
                color: 'var(--success, #059669)',
                fontWeight: 600,
                padding: '16px',
                background: '#ECFDF5',
                borderRadius: '6px',
                border: '1px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                gridColumn: '1 / -1',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              No items in this category. All operations, receivables, and admissions parameters are operating normally.
            </div>
          )}
        </div>
      </div>

      {/* ─── 3. 8-STAGE CUSTOMER JOURNEY & ADMISSIONS LIFECYCLE ───────────────── */}
      <div
        className="cp-card"
        style={{
          margin: 0,
          borderTop: '3px solid var(--primary)',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              Customer Journey &amp; Admissions Lifecycle
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Operational progression: Prospect &rarr; Enquiry &rarr; Follow-up &rarr; Student &rarr; Enrolment &rarr; Training &rarr; Completion &rarr; Certificate
            </div>
          </div>
        </div>

        {/* 8-Stage Connected Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
          {/* 01 Prospect */}
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
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#E2E8F0', color: '#475569' }}>01</span>
              <span className="cp-pill draft" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.prospects ?? 0} Leads`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Prospect</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Inbound Leads</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enquiries &rarr;</div>
          </Link>

          {/* 02 Enquiry */}
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
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#E2E8F0', color: '#475569' }}>02</span>
              <span className="cp-pill draft" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.enquiries ?? 0} Enquiries`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Enquiry</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Intake Registry</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enquiries &rarr;</div>
          </Link>

          {/* 03 Follow-up */}
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
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309' }}>03</span>
              <span className="cp-pill partial" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.followUps ?? 0} Engaged`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Follow-up</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Active Outreach</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enquiries &rarr;</div>
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
              <span className="cp-pill paid" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.students ?? 0} Students`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Student</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Learner Directory</div>
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
              <span className="cp-pill active" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.enrolments ?? 0} Enrolled`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Enrolment</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Cohort Register</div>
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
              <span className="cp-pill info" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.training ?? 0} Sessions`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Training</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{trn?.attendanceRate ?? 100}% Attendance</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#attendance &rarr;</div>
          </Link>

          {/* 07 Completion */}
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
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#FEF3C7', color: '#92400E' }}>07</span>
              <span className="cp-pill partial" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.completion ?? 0} Completed`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Completion</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Finished Course</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#enrolments &rarr;</div>
          </Link>

          {/* 08 Certificate */}
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
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#DCFCE7', color: '#15803D' }}>08</span>
              <span className="cp-pill paid" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{loading ? '...' : `${life?.certificates ?? 0} Certified`}</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>Certificate</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>QR Verified</div>
            <div style={{ fontSize: '10px', color: 'var(--interactive)', fontWeight: 700, marginTop: '6px' }}>#certificates &rarr;</div>
          </Link>
        </div>
      </div>

      {/* ─── 4. FINANCIAL OVERVIEW & CASH FLOW ─────────────────────────────────── */}
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
              Authoritative ledger totals: billing issued, payments collected, receivables due, and overdue balance.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link href="/invoices" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Invoices &rarr;
            </Link>
            <Link href="/payments" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Payments &rarr;
            </Link>
            <Link href="/receivables" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Receivables &rarr;
            </Link>
            {isFinanceRole && (
              <Link href="/payroll" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
                Payroll &rarr;
              </Link>
            )}
          </div>
        </div>

        <div className="cp-kpi-grid" style={{ margin: 0 }}>
          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #1D4ED8' }}>
            <div className="cp-kpi-label">TOTAL INVOICED</div>
            <div className="cp-kpi-val" style={{ color: '#1D4ED8' }}>
              {loading ? '...' : fmtMoney(totalInvoiced)}
            </div>
            <div className="cp-kpi-sub">Total Revenue (Invoiced) &middot; Lifetime programme fees billed</div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #10B981' }}>
            <div className="cp-kpi-label">AMOUNT RECEIVED</div>
            <div className="cp-kpi-val" style={{ color: '#15803D' }}>
              {loading ? '...' : fmtMoney(totalCollected)}
            </div>
            <div className="cp-kpi-sub">
              Total Income (Collected) &middot; Collection Efficiency: <strong>{fin?.collectionRate ?? 0}%</strong>
            </div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #F59E0B' }}>
            <div className="cp-kpi-label">OUTSTANDING</div>
            <div className="cp-kpi-val" style={{ color: '#D97706' }}>
              {loading ? '...' : fmtMoney(outstanding)}
            </div>
            <div className="cp-kpi-sub">Outstanding Receivables &middot; Unpaid tuition fee balances</div>
          </div>

          <div className="cp-kpi-card" style={{ borderLeft: '3px solid #DC2626' }}>
            <div className="cp-kpi-label">OVERDUE</div>
            <div className="cp-kpi-val" style={{ color: '#DC2626' }}>
              {loading ? '...' : fmtMoney(overdueReceivables)}
            </div>
            <div className="cp-kpi-sub">
              Past payment due date: <strong style={{ color: '#DC2626' }}>{overdueInvoicesList.length} Invoices</strong>
            </div>
          </div>

          {isFinanceRole && (
            <div className="cp-kpi-card" style={{ borderLeft: '3px solid #6366F1' }}>
              <div className="cp-kpi-label">PAYROLL LIABILITY</div>
              <div className="cp-kpi-val" style={{ color: '#4338CA' }}>
                {loading ? '...' : fmtMoney(payrollLiability)}
              </div>
              <div className="cp-kpi-sub">Payroll Liability (Outflows) &middot; Staff &amp; facilitator compensation</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── 5. ADMISSIONS CRM PIPELINE & ACADEMIC OPERATIONS GRID ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Column 1: Admissions & CRM Pipeline */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #0284C7',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', background: '#0284C7', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>2</span>
                Admissions &amp; CRM Pipeline
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Operational enquiry statuses from prospect interest to confirmed enrolment
              </div>
            </div>
            <Link href="/enquiries" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Enquiries &rarr;
            </Link>
          </div>

          {/* CRM Status Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#475569' }}>New Inbound Leads (NEW):</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : crm?.newEnquiries ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#475569' }}>Outreach In Progress (CONTACTED):</span>
              <strong style={{ fontSize: '13px', color: '#0284C7' }}>{loading ? '...' : crm?.contacted ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#475569' }}>Qualified Prospects (INTERESTED):</span>
              <strong style={{ fontSize: '13px', color: '#0D9488' }}>{loading ? '...' : crm?.interested ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#475569' }}>Invoice Requested (INVOICE_REQUESTED):</span>
              <strong style={{ fontSize: '13px', color: '#D97706' }}>{loading ? '...' : crm?.invoiceRequested ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#475569' }}>Invoice Issued (INVOICE_ISSUED):</span>
              <strong style={{ fontSize: '13px', color: '#2563EB' }}>{loading ? '...' : crm?.invoiceIssued ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#ECFDF5', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 600 }}>Confirmed Enrolments (ENROLLED):</span>
              <strong style={{ fontSize: '13px', color: '#15803D' }}>{loading ? '...' : crm?.enrolled ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>Lost / Inactive (LOST):</span>
              <strong style={{ fontSize: '13px', color: '#64748B' }}>{loading ? '...' : crm?.lost ?? 0}</strong>
            </div>
          </div>

          {/* Follow-up Monitoring Box */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: '#F0F9FF',
              borderRadius: '6px',
              border: '1px solid #BAE6FD',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0369A1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Follow-up Monitoring</span>
              <Link href="/enquiries" style={{ fontSize: '11px', color: '#0284C7', textDecoration: 'none', fontWeight: 700 }}>
                Contact Prospect &amp; Log Follow-up &rarr;
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#0C4A6E' }}>
              <span>Follow-ups Due Today:</span>
              <strong>{loading ? '...' : crm?.followUpsDueToday ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#0C4A6E' }}>
              <span>Follow-ups Overdue (&gt;48h):</span>
              <strong style={{ color: (crm?.followUpsOverdue ?? 0) > 0 ? '#DC2626' : 'inherit' }}>
                {loading ? '...' : crm?.followUpsOverdue ?? 0}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#0C4A6E' }}>
              <span>Recently Contacted:</span>
              <strong>{loading ? '...' : crm?.recentlyContacted ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Column 2: Academic & Training Operations */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #8B5CF6',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', background: '#8B5CF6', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>3</span>
                Academic &amp; Training Operations
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Registered students, active cohorts, session delivery, and attendance tracking
              </div>
            </div>
            <Link href="/attendance" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Attendance &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Active Registered Students:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : aca?.activeStudents ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Active Programme Enrolments:</span>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>{loading ? '...' : aca?.activeEnrolments ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Active Training Cohorts:</span>
              <strong style={{ fontSize: '13px', color: '#7C3AED' }}>{loading ? '...' : `${aca?.cohortsCount ?? 0} Cohorts`}</strong>
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
              <span style={{ fontSize: '13px', color: '#5B21B6', fontWeight: 700 }}>Curriculum Programmes:</span>
              <strong style={{ fontSize: '14px', color: '#7C3AED' }}>{loading ? '...' : `${aca?.programmesCount ?? 0} Programmes`}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 6. STUDENT ACTIVITY & UPCOMING OPERATIONS GRID ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Column 1: Student Activity */}
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
                <span style={{ width: '20px', height: '20px', background: '#10B981', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>4</span>
                Student Activity
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Student directory overview and recently registered learners
              </div>
            </div>
            <Link href="/students" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Students &rarr;
            </Link>
          </div>

          {/* Student KPIs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Total Students</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {loading ? '...' : stu?.totalStudents ?? 0}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Active Learners</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                {loading ? '...' : stu?.activeStudents ?? 0}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Certificates</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284C7', marginTop: '2px' }}>
                {loading ? '...' : stu?.certificatesIssued ?? 0}
              </div>
            </div>
          </div>

          {/* Recently Added Students */}
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
            Recently Added Students:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(stu?.recentlyAddedStudents ?? []).length > 0 ? (
              (stu?.recentlyAddedStudents ?? []).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    background: '#F8FAFC',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>
                      {s.firstName} {s.lastName}
                    </span>{' '}
                    <span style={{ color: '#64748B', fontSize: '11px' }}>({s.studentNumber})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="cp-pill active" style={{ fontSize: '9px', padding: '1px 6px' }}>
                      {s.status}
                    </span>
                    <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{fmtDate(s.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '12px', color: '#94A3B8', padding: '8px' }}>
                {loading ? 'Loading students...' : 'No recent students recorded.'}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Upcoming Training Operations */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #E11D48',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', background: '#E11D48', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>5</span>
                Upcoming Training Operations
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Scheduled training sessions, live lectures, and upcoming cohort activities
              </div>
            </div>
            <Link href="/attendance" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
              Sessions &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(metrics?.upcomingSessions ?? []).length > 0 ? (
              (metrics?.upcomingSessions ?? []).slice(0, 5).map((sess) => (
                <div
                  key={sess.id}
                  style={{
                    padding: '8px 12px',
                    background: '#FFF1F2',
                    borderRadius: '6px',
                    border: '1px solid #FFE4E6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#9F1239' }}>
                      {sess.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#BE123C', marginTop: '2px' }}>
                      {sess.cohortName} &middot; {sess.deliveryMode}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>
                      {fmtDate(sess.sessionDate)}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                      {sess.startTime} - {sess.endTime}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: '24px 16px',
                  background: '#F8FAFC',
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  border: '1px dashed #CBD5E1',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                  No upcoming training sessions scheduled.
                </div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>
                  Training sessions will appear here as new cohorts are planned and scheduled.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 7. OVERDUE RECEIVABLES & RECENT ACTIVITY / GOVERNANCE ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Column 1: Overdue Receivables Table with Standardized Pagination */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #DC2626',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', background: '#DC2626', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>6</span>
                  Overdue Receivables
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Tuition invoices past due date requiring collection follow-up
                </div>
              </div>
              <Link href="/receivables" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
                View Receivables &rarr;
              </Link>
            </div>

            {/* Overdue Table */}
            {overdueInvoicesList.length > 0 ? (
              <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ fontSize: '12px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Invoice #</th>
                      <th style={{ textAlign: 'right' }}>Outstanding</th>
                      <th style={{ textAlign: 'center' }}>Overdue</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOverdue.map((inv) => (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600 }}>{inv.studentName}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          <Link href="/invoices" style={{ color: 'var(--interactive)', textDecoration: 'none' }}>
                            {inv.invoiceDisplayNo}
                          </Link>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                          {fmtMoney(inv.balanceAmount)}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '11px', color: '#991B1B' }}>
                          {inv.daysOverdue}d
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="cp-pill danger" style={{ fontSize: '9px', padding: '1px 6px' }}>
                            OVERDUE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  padding: '24px 16px',
                  background: '#ECFDF5',
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: '#065F46',
                  border: '1px solid #A7F3D0',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700 }}>
                  No overdue receivables.
                </div>
                <div style={{ fontSize: '11.5px', color: '#047857', marginTop: '4px' }}>
                  All student tuition accounts are up to date and in good standing.
                </div>
              </div>
            )}
          </div>

          {/* Standardized Pagination for Overdue Invoices */}
          {overdueInvoicesList.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <Pagination
                currentPage={recPage}
                pageSize={recPageSize}
                totalCount={recTotalCount}
                onPageChange={onRecPageChange}
                onPageSizeChange={onRecPageSizeChange}
                pageSizeOptions={[10, 25, 50, 100]}
                entityLabel="invoices"
              />
            </div>
          )}
        </div>

        {/* Column 2: Recent Activity & Governance */}
        <div
          className="cp-card"
          style={{
            margin: 0,
            borderTop: '3px solid #475569',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '20px', height: '20px', background: '#475569', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>7</span>
                  Recent Activity &amp; Governance
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Chronological operational event log and audit trail
                </div>
              </div>
              {isSuperAdmin && (
                <Link href="/audit-log" className="cp-btn sm secondary" style={{ textDecoration: 'none' }}>
                  View Audit Log &rarr;
                </Link>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(metrics?.recentActivity ?? []).length > 0 ? (
                (metrics?.recentActivity ?? []).slice(0, 7).map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: '#F8FAFC',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>
                        {fmtTime(act.createdAt)}
                      </span>
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>
                        {act.action}: <span style={{ color: '#475569' }}>{act.entityName || act.entityType}</span>
                      </span>
                    </div>
                    <span className="cp-pill draft" style={{ fontSize: '9px', padding: '1px 6px' }}>
                      {act.actorRole}
                    </span>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: '24px 16px',
                    background: '#F8FAFC',
                    borderRadius: '6px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    border: '1px dashed #CBD5E1',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                    No recent governance activity.
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>
                    Financial mutations, payments, and system events will appear here in chronological order.
                  </div>
                </div>
              )}
            </div>
          </div>

          {isSuperAdmin && (
            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
              <Link href="/audit-log" style={{ fontSize: '11.5px', color: 'var(--interactive)', fontWeight: 700, textDecoration: 'none' }}>
                Open Full System Audit Log &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
