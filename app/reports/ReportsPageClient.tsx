'use client';

/**
 * app/reports/ReportsPageClient.tsx — Phase 7
 * Interactive Client Component for Unified Operational Reports.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState } from 'react';
import type { ReportItem } from '@/types/intelligence';
import type { FinancialMetrics } from '@/types/finance';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface ReportsPageClientProps {
  initialReports: ReportItem[];
  financeMetrics: FinancialMetrics;
}

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

export function ReportsPageClient({ initialReports, financeMetrics }: ReportsPageClientProps) {
  const [reports, setReports] = useState<ReportItem[]>(initialReports);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'FINANCE' | 'ACADEMIC' | 'TRAINING' | 'ADMISSIONS' | 'PAYROLL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Category change
  const handleCategoryChange = async (cat: typeof selectedCategory) => {
    setSelectedCategory(cat);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/intelligence/reports?category=${cat}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setReports(data.reports);
      }
    } catch (err) {
      console.error('Failed to filter reports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Dimension', 'Reference #', 'Date', 'Title', 'Details', 'Primary Value', 'Status'];
    const rows = filteredReports.map(r => [
      r.category,
      r.referenceNo,
      r.date,
      r.title,
      r.subTitle || '',
      String(r.primaryValue),
      r.status,
    ]);

    downloadSafeCsv('clasptek_performance_report', headers, rows);
  };

  // Filtered reports
  const filteredReports = reports.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.referenceNo.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      (r.subTitle && r.subTitle.toLowerCase().includes(q)) ||
      r.status.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Top Banner */}
      <div className="cp-card" style={{ marginBottom: '18px', borderLeft: '4px solid var(--accent, #0284c7)', padding: '16px 20px', background: '#fafbfd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary, #0284c7)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏛️</span> CLASPTEK MANAGEMENT PERFORMANCE REPORT
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
              Official decision-grade operational intelligence report covering finance, revenue collection, receivables, programmes, and payroll.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cp-btn sm accent" onClick={() => setIsPrintModalOpen(true)}>
              🖨️ Print-Ready Report
            </button>
            <button className="cp-btn sm secondary" onClick={handleExportCSV}>
              📥 Export Complete CSV
            </button>
          </div>
        </div>
      </div>

      {/* Income Statement & Operational Summary Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Income & Operating Statement */}
        <div style={{ background: '#fafbfd', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', fontSize: '13px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary, #0284c7)', marginBottom: '8px' }}>
            Income &amp; Operating Statement
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Total Invoiced Tuition:</span>
            <strong>{fmtMoney(financeMetrics.totalInvoiced)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Tuition Revenue Collected:</span>
            <strong style={{ color: '#059669' }}>{fmtMoney(financeMetrics.totalCollected)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Outstanding Tuition Receivables:</span>
            <strong style={{ color: '#d97706' }}>{fmtMoney(financeMetrics.outstandingBalance)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>Disbursed Staff &amp; Facilitator Payroll:</span>
            <strong style={{ color: '#059669' }}>{fmtMoney(financeMetrics.payroll.paidTotal)}</strong>
          </div>
        </div>

        {/* Operational Health Overview */}
        <div style={{ background: '#fafbfd', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', fontSize: '13px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary, #0284c7)', marginBottom: '8px' }}>
            Cross-Module Verification Status
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Invoices Fully Settled:</span>
            <strong style={{ color: '#059669' }}>{financeMetrics.invoiceCounts.paid} Invoices</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Receipts Reconciled to Ledger:</span>
            <strong style={{ color: '#059669' }}>{financeMetrics.paymentCounts.reconciled} Payments</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span>Overdue Receivables Balance:</span>
            <strong style={{ color: '#dc2626' }}>{fmtMoney(financeMetrics.overdueAmount)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>Payroll Statements Ready for Disbursement:</span>
            <strong style={{ color: '#d97706' }}>{fmtMoney(financeMetrics.payroll.approvedReady)}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="cp-card">
        {/* Dimension Filter Bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Dimensions' },
              { id: 'FINANCE', label: 'Finance' },
              { id: 'ACADEMIC', label: 'Academics' },
              { id: 'TRAINING', label: 'Training' },
              { id: 'ADMISSIONS', label: 'Admissions' },
              { id: 'PAYROLL', label: 'Payroll' },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id as typeof selectedCategory)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  border: selectedCategory === cat.id ? '1px solid #0284c7' : '1px solid #cbd5e1',
                  background: selectedCategory === cat.id ? '#0284c7' : '#f8fafc',
                  color: selectedCategory === cat.id ? '#fff' : '#475569',
                  fontWeight: selectedCategory === cat.id ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search reference, title, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 12px', fontSize: '12.5px', border: '1px solid #cbd5e1', borderRadius: '5px' }}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Loading dimension dataset...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: '36px', marginBottom: '8px' }}>📋</div>
            <div className="cp-empty-title" style={{ fontSize: '15px', fontWeight: 600 }}>No report records found</div>
            <div className="cp-empty-desc" style={{ fontSize: '13px', color: '#64748b' }}>Try adjusting your dimension category or search filters.</div>
          </div>
        ) : (
          <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>Dimension</th>
                  <th style={{ padding: '10px 14px' }}>Reference #</th>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Item Title</th>
                  <th style={{ padding: '10px 14px' }}>Value</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            r.category === 'FINANCE' ? '#ecfdf5' :
                            r.category === 'ACADEMIC' ? '#f5f3ff' :
                            r.category === 'TRAINING' ? '#fffbeb' :
                            r.category === 'ADMISSIONS' ? '#f0f9ff' : '#fdf2f8',
                          color:
                            r.category === 'FINANCE' ? '#059669' :
                            r.category === 'ACADEMIC' ? '#7c3aed' :
                            r.category === 'TRAINING' ? '#d97706' :
                            r.category === 'ADMISSIONS' ? '#0284c7' : '#db2777',
                        }}
                      >
                        {r.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {r.referenceNo}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>
                      {r.date}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.title}</div>
                      {r.subTitle && <div style={{ fontSize: '11px', color: '#64748b' }}>{r.subTitle}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                      {r.primaryValue}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background: '#f1f5f9',
                          color: '#475569',
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PRINT PREVIEW MODAL */}
      {isPrintModalOpen && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '640px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                CLASPTEK COACHING LIMITED
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Official Executive Operational Performance Report
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Total Invoiced Tuition:</span>
                <strong>{fmtMoney(financeMetrics.totalInvoiced)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Total Revenue Collected:</span>
                <strong style={{ color: '#059669' }}>{fmtMoney(financeMetrics.totalCollected)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Outstanding Tuition Balance:</span>
                <strong style={{ color: '#d97706' }}>{fmtMoney(financeMetrics.outstandingBalance)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                <span>Total Disbursed Payroll:</span>
                <strong style={{ color: '#059669' }}>{fmtMoney(financeMetrics.payroll.paidTotal)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="cp-btn secondary sm"
                onClick={() => window.print()}
              >
                🖨️ Print to PDF / Paper
              </button>
              <button
                type="button"
                className="cp-btn secondary sm"
                onClick={() => setIsPrintModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
