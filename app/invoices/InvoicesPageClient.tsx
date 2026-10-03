'use client';

/**
 * app/invoices/InvoicesPageClient.tsx — Phase 6
 * Interactive Client Component for Invoices & Tuition Billing.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useRef } from 'react';
import type { Invoice, Customer, FinancialMetrics } from '@/types/finance';
import type { FinanceSettingsData, PaymentAccountData } from '@/types/settings';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { CanonicalInvoiceDocument } from '@/components/finance/CanonicalInvoiceDocument';
import { printCanonicalElement } from '@/components/finance/printCanonical';
import { CreateProfessionalTuitionInvoiceModal } from '@/components/finance/CreateProfessionalTuitionInvoiceModal';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';


interface ProgrammeOption {
  id: string;
  code: string;
  name: string;
  tuitionFee: number;
}

interface InvoicesPageClientProps {
  initialInvoices: Invoice[];
  programmes: ProgrammeOption[];
  customers: Customer[];
  metrics: FinancialMetrics;
  financeSettings?: FinanceSettingsData | null;
  paymentAccounts?: PaymentAccountData[] | null;
}


function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  try {
    const parts = d.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[monthIndex]} ${year}`;
    }
    return d;
  } catch {
    return d;
  }
}

export function InvoicesPageClient({
  initialInvoices,
  programmes,
  customers,
  metrics,
  financeSettings,
  paymentAccounts,
}: InvoicesPageClientProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const invoiceDocRef = useRef<HTMLDivElement>(null);

  const selectedPaymentAccount =
    paymentAccounts?.find(a => a.isDefault) || paymentAccounts?.[0] || null;




  // Cancel invoice action
  const handleCancelInvoice = async (invoiceId: string) => {
    if (!window.confirm('Are you sure you want to cancel this invoice? This action is audited and irreversible.')) {
      return;
    }

    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          reason: 'Cancelled by staff user',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel invoice');
      }

      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: 'cancelled' } : inv));
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice({ ...selectedInvoice, status: 'cancelled' });
      }
      setFeedbackMsg({ type: 'success', text: 'Invoice cancelled successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMsg({ type: 'error', text: msg });
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Invoice #', 'Issue Date', 'Due Date', 'Student / Client', 'Programme', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filteredInvoices.map(inv => [
      inv.invoiceDisplayNo,
      inv.invoiceDate,
      inv.dueDate,
      inv.studentName,
      inv.programmeName || '',
      inv.totalAmount,
      inv.paidAmount || 0,
      inv.balanceAmount || 0,
      inv.status.toUpperCase(),
    ]);

    downloadSafeCsv('clasptek_invoices', headers, rows);
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQ = !q ||
      inv.invoiceDisplayNo.toLowerCase().includes(q) ||
      inv.studentName.toLowerCase().includes(q) ||
      (inv.programmeName && inv.programmeName.toLowerCase().includes(q)) ||
      (inv.studentEmail && inv.studentEmail.toLowerCase().includes(q));

    let matchesStatus = true;
    if (statusFilter !== 'all') {
      matchesStatus = inv.status === statusFilter;
    }

    return matchesQ && matchesStatus;
  });

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedInvoices,
    setPage,
    setPageSize,
  } = usePagination(filteredInvoices, {
    initialPageSize: 25,
    resetDeps: [searchQuery, statusFilter],
  });

  // Multi-row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    invoiceIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'VOID',
    invoiceIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const visibleIds = paginatedInvoices.map((inv) => inv.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

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
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleOpenVoidModal = (ids: string[], targetIdentifier?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'VOID',
      invoiceIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected invoice(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: false,
    });
  };

  const handleConfirmVoid = async (reason: string) => {
    const { invoiceIds } = lifecycleModal;
    if (invoiceIds.length === 0) return;

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    try {
      for (const id of invoiceIds) {
        const res = await fetch(`/api/finance/invoices/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'cancelled',
            reason: reason || 'Cancelled via portal invoice manager',
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to void invoice ${id}`);
        }
      }

      setInvoices((prev) =>
        prev.map((i) => (invoiceIds.includes(i.id) ? { ...i, status: 'cancelled' } : i))
      );
      setSelectedIds(new Set());
      setFeedbackMsg({
        type: 'success',
        text: `Successfully voided ${invoiceIds.length} invoice(s). Record numbers preserved in financial audit trail.`,
      });
      setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to void invoice',
      });
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleExportSelectedCSV = () => {
    const selectedInvoices = invoices.filter((i) => selectedIds.has(i.id));
    const headers = [
      'Invoice #',
      'Issue Date',
      'Due Date',
      'Student / Client',
      'Phone',
      'Email',
      'Programme',
      'Total Amount',
      'Paid Amount',
      'Balance',
      'Status',
    ];
    const rows = selectedInvoices.map((inv) => [
      inv.invoiceDisplayNo,
      inv.invoiceDate,
      inv.dueDate,
      inv.studentName,
      inv.studentPhone || '',
      inv.studentEmail || '',
      inv.programmeName || '',
      inv.totalAmount,
      inv.paidAmount || 0,
      inv.balanceAmount || 0,
      inv.status.toUpperCase(),
    ]);
    downloadSafeCsv('clasptek_selected_invoices', headers, rows);
  };


  return (
    <div>
      {/* Top Banner Feedback */}
      {feedbackMsg && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            background: feedbackMsg.type === 'success' ? 'var(--success-bg, #ecfdf5)' : 'var(--danger-bg, #fef2f2)',
            color: feedbackMsg.type === 'success' ? 'var(--success, #059669)' : 'var(--danger, #dc2626)',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary, #0284c7)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Total Invoiced
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #0f172a)', margin: '4px 0' }}>
            {fmtMoney(metrics.totalInvoiced)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {invoices.length} Invoices Issued
          </div>
        </div>

        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--success, #10b981)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Total Collected
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success, #10b981)', margin: '4px 0' }}>
            {fmtMoney(metrics.totalCollected)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {metrics.invoiceCounts.paid} Invoices Fully Settled
          </div>
        </div>

        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--warning, #f59e0b)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Outstanding Balance
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning, #f59e0b)', margin: '4px 0' }}>
            {fmtMoney(metrics.outstandingBalance)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {metrics.invoiceCounts.partial + metrics.invoiceCounts.unpaid} Invoices Pending
          </div>
        </div>

        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--danger, #ef4444)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Overdue Receivables
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--danger, #ef4444)', margin: '4px 0' }}>
            {fmtMoney(metrics.overdueAmount)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {metrics.invoiceCounts.overdue} Past Due Date
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="cp-card">
        {/* Header */}
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              📄 Tuition &amp; Service Invoices
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
              Manage, view, print, and track payment status across all issued student invoices.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cp-btn sm secondary" onClick={handleExportCSV}>
              📥 Export CSV
            </button>
            <button className="cp-btn sm accent" onClick={() => setIsCreateModalOpen(true)}>
              + Create Invoice
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: '280px', flex: '1 1 300px' }}>
            <input
              type="text"
              placeholder="Filter by invoice #, student, programme..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                fontSize: '13px',
                border: '1px solid var(--border, #cbd5e1)',
                borderRadius: '5px',
                background: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'unpaid', 'partial', 'paid', 'overdue', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`cp-pill ${statusFilter === st ? 'active' : ''}`}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: statusFilter === st ? '1px solid var(--primary, #0284c7)' : '1px solid var(--border, #cbd5e1)',
                  background: statusFilter === st ? 'var(--primary, #0284c7)' : '#f8fafc',
                  color: statusFilter === st ? '#fff' : 'var(--text-secondary, #475569)',
                  fontWeight: statusFilter === st ? 600 : 400,
                  textTransform: 'uppercase',
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Invoices Table */}
        {filteredInvoices.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: '36px', marginBottom: '8px' }}>📄</div>
            <div className="cp-empty-title" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              No invoices found
            </div>
            <div className="cp-empty-desc" style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 16px' }}>
              No student invoices match your current search and filter criteria.
            </div>
            <button className="cp-btn accent sm" onClick={() => setIsCreateModalOpen(true)}>
              + Create Invoice
            </button>
          </div>
        ) : (
          <>
            {/* Universal Selection Toolbar */}
            <TableSelectionBar
              selectedCount={selectedIds.size}
              totalVisibleCount={visibleIds.length}
              entityLabel="invoice"
              onClearSelection={handleClearSelection}
              onSelectAllVisible={handleToggleSelectAll}
              isAllSelected={isAllSelected}
            >
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleExportSelectedCSV}
                  className="cp-btn sm secondary"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  Export Selected CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenVoidModal(Array.from(selectedIds))}
                  className="cp-btn sm"
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Void Selected
                </button>
              </div>
            </TableSelectionBar>

            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                    <th style={{ width: '42px', textAlign: 'center', padding: '8px' }}>
                      <input
                        type="checkbox"
                        ref={headerCheckboxRef}
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all visible invoices"
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Invoice #</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Issue Date</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Due Date</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Student / Client</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Programme</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Total</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Paid</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Balance</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv) => {
                    const balance = inv.balanceAmount !== undefined ? inv.balanceAmount : inv.totalAmount - (inv.paidAmount || 0);
                    const isPaid = inv.status === 'paid';
                    const isCancelled = inv.status === 'cancelled' || inv.status === 'voided';
                    const isOverdue = inv.status === 'overdue';

                    let statusColor = '#64748b';
                    let statusBg = '#f1f5f9';
                    if (isPaid) {
                      statusColor = '#059669';
                      statusBg = '#ecfdf5';
                    } else if (isOverdue) {
                      statusColor = '#dc2626';
                      statusBg = '#fef2f2';
                    } else if (inv.status === 'partial') {
                      statusColor = '#d97706';
                      statusBg = '#fffbeb';
                    } else if (inv.status === 'unpaid') {
                      statusColor = '#0284c7';
                      statusBg = '#f0f9ff';
                    }

                    const isChecked = selectedIds.has(inv.id);

                    return (
                      <tr
                        key={inv.id}
                        style={{
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.05)' : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center', width: '42px', padding: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelect(inv.id)}
                            aria-label={`Select ${inv.invoiceDisplayNo}`}
                            style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>
                          {inv.invoiceDisplayNo}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', color: 'var(--text-secondary, #475569)' }}>
                          {fmtDate(inv.invoiceDate)}
                        </td>
                        <td style={{ padding: '10px 14px', color: isOverdue ? 'var(--danger, #dc2626)' : 'var(--text-secondary, #475569)', whiteSpace: 'nowrap' }}>
                          {fmtDate(inv.dueDate)}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                          {inv.studentName}
                          {inv.studentPhone && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontWeight: 400 }}>
                              {inv.studentPhone}
                            </div>
                          )}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', color: 'var(--primary, #0284c7)', fontWeight: 500 }}>
                          {inv.programmeName}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {fmtMoney(inv.totalAmount)}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--success, #059669)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {fmtMoney(inv.paidAmount || 0)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? '#d97706' : '#059669', whiteSpace: 'nowrap' }}>
                          {fmtMoney(balance)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: statusColor,
                              background: statusBg,
                            }}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              className="cp-btn sm secondary"
                              onClick={() => setSelectedInvoice(inv)}
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            >
                              View
                            </button>
                            {!isCancelled && !isPaid && (
                              <button
                                className="cp-btn sm danger"
                                onClick={() => handleOpenVoidModal([inv.id], `${inv.invoiceDisplayNo} (${inv.studentName})`)}
                                style={{ padding: '4px 8px', fontSize: '11.5px', color: '#dc2626' }}
                              >
                                Void
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
            <div className="cp-cards-mobile">
              {paginatedInvoices.map((inv) => {
                const balance = inv.balanceAmount !== undefined ? inv.balanceAmount : inv.totalAmount - (inv.paidAmount || 0);
                const isPaid = inv.status === 'paid';
                const isCancelled = inv.status === 'cancelled' || inv.status === 'voided';
                const isOverdue = inv.status === 'overdue';

                let statusColor = '#64748b';
                let statusBg = '#f1f5f9';
                if (isPaid) {
                  statusColor = '#059669';
                  statusBg = '#ecfdf5';
                } else if (isOverdue) {
                  statusColor = '#dc2626';
                  statusBg = '#fef2f2';
                } else if (inv.status === 'partial') {
                  statusColor = '#d97706';
                  statusBg = '#fffbeb';
                } else if (inv.status === 'unpaid') {
                  statusColor = '#0284c7';
                  statusBg = '#f0f9ff';
                }

                return (
                  <div
                    key={inv.id}
                    className="cp-mobile-record-card"
                    onClick={() => setSelectedInvoice(inv)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedInvoice(inv)}
                    aria-label={`View invoice ${inv.invoiceDisplayNo}`}
                  >
                    <div className="cp-mobile-record-header">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {inv.studentName}
                        </h4>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {inv.programmeName}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11.5px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {inv.invoiceDisplayNo}
                        </span>
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: statusColor,
                            background: statusBg,
                          }}
                        >
                          {inv.status}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '6px',
                        background: 'var(--surface-1, #f8fafc)',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Total</span>
                        <strong>{fmtMoney(inv.totalAmount)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Paid</span>
                        <strong style={{ color: 'var(--success, #059669)' }}>{fmtMoney(inv.paidAmount || 0)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Balance</span>
                        <strong style={{ color: balance > 0 ? '#d97706' : '#059669' }}>{fmtMoney(balance)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: isOverdue ? 'var(--danger, #dc2626)' : 'var(--text-muted)' }}>
                      <span>Due: {fmtDate(inv.dueDate)} {isOverdue && '(OVERDUE)'}</span>
                      {inv.studentPhone && <span>{inv.studentPhone}</span>}
                    </div>

                    <div className="cp-mobile-record-actions">
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInvoice(inv);
                        }}
                        style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                      >
                        View Invoice
                      </button>
                      {!isCancelled && !isPaid && (
                        <button
                          type="button"
                          className="cp-btn sm danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelInvoice(inv.id);
                          }}
                          style={{ padding: '4px 10px', fontSize: '11.5px', color: '#dc2626' }}
                        >
                          Cancel
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
              totalRecords={filteredInvoices.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="invoices"
            />
          </>
        )}
      </div>

      {/* ORIGINAL AUTHORITATIVE PROFESSIONAL TUITION / SERVICE INVOICE CREATION WORKFLOW */}
      <CreateProfessionalTuitionInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        programmes={programmes}
        customers={customers}
        paymentAccounts={paymentAccounts || undefined}
        financeSettings={financeSettings}
        onInvoiceCreated={(created) => {
          setInvoices((prev) => [created, ...prev]);
          setSelectedInvoice(created);
          setFeedbackMsg({
            type: 'success',
            text: `Invoice ${created.invoiceDisplayNo || created.invoiceNo} issued successfully!`,
          });
        }}
      />

      {/* CANONICAL INVOICE PREVIEW MODAL */}
      {selectedInvoice && (
        <div className="cp-modal-overlay">
          <div className="cp-modal doc-modal">
            <div className="cp-modal-header no-print">
              <div className="cp-modal-title">
                Invoice Preview #{selectedInvoice.invoiceDisplayNo || selectedInvoice.invoiceNo}
              </div>
              <button
                className="cp-modal-close"
                onClick={() => setSelectedInvoice(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="cp-modal-body cp-doc-scroll-wrap">
              <div ref={invoiceDocRef}>
                <CanonicalInvoiceDocument
                  invoice={selectedInvoice}
                  financeSettings={financeSettings}
                  paymentAccount={selectedPaymentAccount}
                />
              </div>
            </div>

            <div className="cp-modal-footer no-print">
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="cp-btn accent"
                onClick={() => printCanonicalElement(invoiceDocRef.current)}
              >
                🖨️ Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Void / Cancellation Modal with Mandatory Audit Reason */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Invoice"
        recordIdentifier={lifecycleModal.recordIdentifier}
        recordCount={lifecycleModal.invoiceIds.length}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        requireReason={true}
        reasonPlaceholder="Mandatory reason for voiding invoice (e.g. billing error, student withdrawn, credit note issued)..."
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmVoid}
      />
    </div>
  );
}


