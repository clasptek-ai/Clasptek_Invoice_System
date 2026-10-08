'use client';

/**
 * app/payments/PaymentsPageClient.tsx — Phase 6
 * Interactive Client Component for Tuition Payments & Receipts Ledger.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useRef } from 'react';
import type { Payment, FinancialMetrics, PaymentMethod, Invoice } from '@/types/finance';
import type { FinanceSettingsData } from '@/types/settings';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { CanonicalReceiptDocument } from '@/components/finance/CanonicalReceiptDocument';
import { printCanonicalElement } from '@/components/finance/printCanonical';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { SortableHeader } from '@/components/tables/SortableHeader';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';


interface TargetInvoiceOption {
  id: string;
  invoiceDisplayNo: string;
  studentName: string;
  totalAmount: number;
  balanceAmount: number;
  status: string;
}

interface PaymentsPageClientProps {
  initialPayments: Payment[];
  targetInvoices: TargetInvoiceOption[];
  allInvoices?: Invoice[];
  financeSettings?: FinanceSettingsData | null;
  metrics: FinancialMetrics;
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

export function PaymentsPageClient({
  initialPayments,
  targetInvoices,
  allInvoices,
  financeSettings,
  metrics,
}: PaymentsPageClientProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const receiptDocRef = useRef<HTMLDivElement>(null);

  const matchingInvoice = selectedReceipt
    ? allInvoices?.find(
        i => i.id === selectedReceipt.invoiceId || i.invoiceDisplayNo === selectedReceipt.invoiceDisplayNo
      ) || null
    : null;


  // Form State for Recording Payment
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(targetInvoices[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState<number>(targetInvoices[0]?.balanceAmount || 50000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When selected invoice changes, update suggested amount to outstanding balance
  const handleInvoiceSelect = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = targetInvoices.find(i => i.id === invId);
    if (inv && inv.balanceAmount > 0) {
      setPaymentAmount(inv.balanceAmount);
    }
  };

  // Submit payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId || paymentAmount <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Please select an invoice and enter a valid positive payment amount.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          amount: paymentAmount,
          paymentMethod,
          paymentDate,
          reference: reference || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to record payment');
      }

      setPayments((prev) => {
        const next = [data.payment, ...prev];
        return next.sort((a, b) => {
          const dateA = a.paymentDate || '';
          const dateB = b.paymentDate || '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (Number(b.receiptNo) || 0) - (Number(a.receiptNo) || 0);
        });
      });
      setIsRecordModalOpen(false);
      setReference('');
      setNotes('');
      setFeedbackMsg({
        type: 'success',
        text: `Payment of ${fmtMoney(paymentAmount)} recorded successfully! (Receipt ${data.payment.receiptDisplayNo})`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter state
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Multi-row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    paymentIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'VOID',
    paymentIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  // Filter payments
  const filteredPayments = payments.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQ =
      !q ||
      p.receiptDisplayNo.toLowerCase().includes(q) ||
      (p.studentName && p.studentName.toLowerCase().includes(q)) ||
      (p.invoiceDisplayNo && p.invoiceDisplayNo.toLowerCase().includes(q)) ||
      (p.reference && p.reference.toLowerCase().includes(q)) ||
      p.paymentMethod.toLowerCase().includes(q);

    const matchesMethod = methodFilter === 'all' || p.paymentMethod === methodFilter;
    const matchesStatus = statusFilter === 'all' || p.reconciliationStatus === statusFilter;

    return matchesQ && matchesMethod && matchesStatus;
  });

  // Table sorting state
  const [sortField, setSortField] = useState<string>('paymentDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    setSortOrder((prev) => (sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortField(field);
  };

  const sortedPayments = React.useMemo(() => {
    const list = [...filteredPayments];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'receiptDisplayNo') {
        cmp = (a.receiptDisplayNo || '').localeCompare(b.receiptDisplayNo || '');
      } else if (sortField === 'studentName') {
        cmp = (a.studentName || '').localeCompare(b.studentName || '');
      } else if (sortField === 'invoiceDisplayNo') {
        cmp = (a.invoiceDisplayNo || '').localeCompare(b.invoiceDisplayNo || '');
      } else if (sortField === 'paymentMethod') {
        cmp = (a.paymentMethod || '').localeCompare(b.paymentMethod || '');
      } else if (sortField === 'reference') {
        cmp = (a.reference || '').localeCompare(b.reference || '');
      } else if (sortField === 'amount' || sortField === 'amountPaid') {
        cmp = (a.amount || 0) - (b.amount || 0);
      } else if (sortField === 'reconciliationStatus') {
        cmp = (a.reconciliationStatus || '').localeCompare(b.reconciliationStatus || '');
      } else {
        const dateA = a.paymentDate || a.createdAt || '';
        const dateB = b.paymentDate || b.createdAt || '';
        cmp = dateA.localeCompare(dateB);
      }
      if (cmp !== 0) {
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return (b.receiptDisplayNo || '').localeCompare(a.receiptDisplayNo || '');
    });
    return list;
  }, [filteredPayments, sortField, sortOrder]);

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedPayments,
    setPage,
    setPageSize,
  } = usePagination(sortedPayments, {
    initialPageSize: 25,
    resetDeps: [searchQuery, methodFilter, statusFilter, sortField, sortOrder],
  });

  const visibleIds = paginatedPayments.map((p) => p.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      const someSelected = visibleIds.some((id) => selectedIds.has(id));
      headerCheckboxRef.current.indeterminate = someSelected && !isAllSelected;
    }
  }, [selectedIds, visibleIds, isAllSelected]);

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

  // CSV Export for selected or all
  const handleExportCSV = (recordsToExport?: Payment[]) => {
    const list = recordsToExport || filteredPayments;
    const headers = ['Receipt #', 'Payment Date', 'Student / Client', 'Target Invoice', 'Payment Method', 'Transaction Ref', 'Amount Paid', 'Status'];
    const rows = list.map(p => [
      p.receiptDisplayNo,
      p.paymentDate,
      p.studentName || 'Student',
      p.invoiceDisplayNo || 'N/A',
      p.paymentMethod,
      p.reference || '',
      p.amount,
      p.reconciliationStatus.toUpperCase(),
    ]);

    downloadSafeCsv('clasptek_payments', headers, rows);
  };

  const handleExportSelectedCSV = () => {
    const selectedRecords = payments.filter((p) => selectedIds.has(p.id));
    if (selectedRecords.length > 0) {
      handleExportCSV(selectedRecords);
    }
  };

  // Safe Deletion / Voiding Audit Handler (Receipts are permanent audit ledger entries)
  const handleOpenVoidModal = (ids: string[], targetIdentifier?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'VOID',
      paymentIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected receipt(s)`,
      dependencies: [
        {
          label: 'General Ledger Accounts & Invoices (Balancing Debtor Records)',
          count: ids.length,
        },
      ],
      blockedMessage:
        'Official fee receipts are immutable financial audit records. To reverse a misallocated deposit, create an adjustment credit note or contact the Super Administrator.',
      isLoading: false,
    });
  };

  const selectedInvDetail = targetInvoices.find(i => i.id === selectedInvoiceId);

  return (
    <div>
      {/* Top Feedback Banner */}
      {feedbackMsg && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            background: feedbackMsg.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: feedbackMsg.type === 'success' ? '#059669' : '#dc2626',
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

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary, #0284c7)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Total Receipts Issued
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #0f172a)', margin: '4px 0' }}>
            {payments.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            Confirmed deposit transactions
          </div>
        </div>

        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--success, #10b981)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Total Collected Value
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success, #10b981)', margin: '4px 0' }}>
            {fmtMoney(metrics.totalCollected)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            Allocated against tuition invoices
          </div>
        </div>

        <div className="cp-card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Reconciled Status
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6', margin: '4px 0' }}>
            {metrics.paymentCounts.reconciled} / {payments.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            100% trace to ledger records
          </div>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="cp-card">
        {/* Header */}
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              🧾 Tuition Payments &amp; Receipts Ledger
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
              Audit confirmed student fee deposits, bank transaction references, and generate official receipts.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cp-btn sm secondary" onClick={() => handleExportCSV()}>
              📥 Export CSV
            </button>
            <button className="cp-btn sm accent" onClick={() => setIsRecordModalOpen(true)}>
              + Record Payment
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search receipt #, student, reference, or invoice..."
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{ padding: '7px 10px', fontSize: '12.5px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '5px', background: '#fff' }}
            >
              <option value="all">All Payment Methods</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="POS">POS Terminal</option>
              <option value="Card">Debit / Credit Card</option>
              <option value="Online Payment">Online Payment</option>
              <option value="Cash">Cash Deposit</option>
              <option value="Other">Other</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '7px 10px', fontSize: '12.5px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '5px', background: '#fff' }}
            >
              <option value="all">All Statuses</option>
              <option value="matched">Matched</option>
              <option value="pending">Pending</option>
              <option value="unmatched">Unmatched</option>
            </select>
            {(searchQuery || methodFilter !== 'all' || statusFilter !== 'all') && (
              <button
                type="button"
                className="cp-btn sm secondary"
                onClick={() => {
                  setSearchQuery('');
                  setMethodFilter('all');
                  setStatusFilter('all');
                }}
                style={{ padding: '5px 10px', fontSize: '12px' }}
              >
                Reset
              </button>
            )}
            <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
              Showing {filteredPayments.length} of {payments.length}
            </span>
          </div>
        </div>

        {/* Selection Bar */}
        <TableSelectionBar
          selectedCount={selectedIds.size}
          totalVisibleCount={visibleIds.length}
          entityLabel="receipt"
          onSelectAllVisible={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onClearSelection={handleClearSelection}
        >
          <button
            type="button"
            className="cp-btn sm secondary"
            onClick={handleExportSelectedCSV}
            title="Export only selected receipts to CSV"
          >
            📥 Export CSV ({selectedIds.size})
          </button>
          <button
            type="button"
            className="cp-btn sm danger"
            onClick={() => handleOpenVoidModal(Array.from(selectedIds))}
            title="Review void or audit policy for selected records"
          >
            🛑 Audit / Invalidate ({selectedIds.size})
          </button>
        </TableSelectionBar>

        {/* Ledger Table */}
        {filteredPayments.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: '36px', marginBottom: '8px' }}>🧾</div>
            <div className="cp-empty-title" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              No payments recorded
            </div>
            <div className="cp-empty-desc" style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 16px' }}>
              Record a tuition deposit or payment against an existing student invoice.
            </div>
            <button className="cp-btn accent sm" onClick={() => setIsRecordModalOpen(true)}>
              + Record Payment
            </button>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                    <th style={{ width: '40px', padding: '10px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        ref={headerCheckboxRef}
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all visible payments"
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <SortableHeader
                      label="Receipt #"
                      field="receiptDisplayNo"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Payment Date"
                      field="paymentDate"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Student / Client"
                      field="studentName"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Target Invoice"
                      field="invoiceDisplayNo"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Method"
                      field="paymentMethod"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                      className="cp-col-tertiary"
                    />
                    <SortableHeader
                      label="Reference"
                      field="reference"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                      className="cp-col-secondary"
                    />
                    <SortableHeader
                      label="Amount Paid"
                      field="amountPaid"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Status"
                      field="reconciliationStatus"
                      currentSort={sortField}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPayments.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(p.id)}
                            aria-label={`Select receipt ${p.receiptDisplayNo}`}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>
                          {p.receiptDisplayNo}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary, #475569)' }}>
                          {fmtDate(p.paymentDate)}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                          {p.studentName || 'Student'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--primary, #0284c7)', fontFamily: 'monospace', fontWeight: 600 }}>
                          {p.invoiceDisplayNo || 'INV-REF'}
                        </td>
                        <td className="cp-col-tertiary" style={{ padding: '10px 14px' }}>
                          <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11.5px', color: '#64748b' }}>
                          {p.reference || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                          {fmtMoney(p.amount)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#059669', background: '#ecfdf5', textTransform: 'uppercase' }}>
                            {p.reconciliationStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              className="cp-btn sm secondary"
                              onClick={() => setSelectedReceipt(p)}
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            >
                              Receipt
                            </button>
                            <button
                              className="cp-btn sm danger"
                              onClick={() => handleOpenVoidModal([p.id], p.receiptDisplayNo)}
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              title="Audit / Invalidate Receipt"
                            >
                              🛑
                            </button>
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
              {paginatedPayments.map((p) => {
                const isSelected = selectedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="cp-mobile-record-card"
                    style={{
                      borderLeft: isSelected ? '4px solid var(--primary, #0284c7)' : undefined,
                    }}
                    onClick={() => handleToggleSelect(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleToggleSelect(p.id)}
                    aria-label={`Select receipt ${p.receiptDisplayNo}`}
                  >
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(p.id);
                          }}
                          aria-label={`Select receipt ${p.receiptDisplayNo}`}
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {p.studentName || 'Student'}
                          </h4>
                          <div style={{ fontSize: '11.5px', color: 'var(--primary)', fontFamily: 'monospace', marginTop: '2px', fontWeight: 600 }}>
                            {p.invoiceDisplayNo || 'INV-REF'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11.5px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {p.receiptDisplayNo}
                        </span>
                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, color: '#059669', background: '#ecfdf5', textTransform: 'uppercase' }}>
                          {p.reconciliationStatus}
                        </span>
                      </div>
                    </div>

                  <div className="cp-mobile-record-grid">
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Amount Paid</span>
                      <span className="cp-mobile-record-value" style={{ color: '#059669', fontSize: '14px' }}>
                        {fmtMoney(p.amount)}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Payment Date</span>
                      <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                        {fmtDate(p.paymentDate)}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Method</span>
                      <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                        {p.paymentMethod}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Reference</span>
                      <span className="cp-mobile-record-value" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 400 }}>
                        {p.reference || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="cp-mobile-record-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReceipt(p);
                      }}
                      style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                    >
                      Receipt
                    </button>
                    <button
                      type="button"
                      className="cp-btn sm danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenVoidModal([p.id], p.receiptDisplayNo);
                      }}
                      style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                    >
                      🛑 Audit / Void
                    </button>
                  </div>
                </div>
              );
            })}
            </div>

            {/* Standard Pagination */}
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalRecords={filteredPayments.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="payments"
            />
          </>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isRecordModalOpen && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                🧾 Record Tuition Deposit / Payment
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment}>
              {/* Target Invoice Select */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Target Invoice to Credit *
                </label>
                <select
                  required
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  {targetInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceDisplayNo} &mdash; {inv.studentName} (Bal: {fmtMoney(inv.balanceAmount)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Outstanding Balance Banner */}
              {selectedInvDetail && (
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Student:</span>
                    <strong>{selectedInvDetail.studentName}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ color: '#64748b' }}>Current Outstanding Balance:</span>
                    <strong style={{ color: '#d97706' }}>{fmtMoney(selectedInvDetail.balanceAmount)}</strong>
                  </div>
                </div>
              )}

              {/* Payment Amount & Method */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Amount Paid (₦) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="POS">POS Terminal</option>
                    <option value="Card">Debit / Credit Card</option>
                    <option value="Online Payment">Online Payment Gateway</option>
                    <option value="Cash">Cash Deposit</option>
                    <option value="Other">Other Channel</option>
                  </select>
                </div>
              </div>

              {/* Payment Date & Reference */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Transaction Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GTB/TRF/9812401"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Audit Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. First installment verified via bank statement"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsRecordModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="cp-btn accent"
                >
                  {isSubmitting ? 'Recording Deposit...' : 'Confirm & Generate Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANONICAL RECEIPT MODAL */}
      {selectedReceipt && (
        <div className="cp-modal-overlay">
          <div className="cp-modal doc-modal">
            <div className="cp-modal-header no-print">
              <div className="cp-modal-title">
                Receipt Preview #{selectedReceipt.receiptDisplayNo || selectedReceipt.receiptNo}
              </div>
              <button
                className="cp-modal-close"
                onClick={() => setSelectedReceipt(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="cp-modal-body cp-doc-scroll-wrap">
              <div ref={receiptDocRef}>
                <CanonicalReceiptDocument
                  payment={selectedReceipt}
                  invoice={matchingInvoice}
                  financeSettings={financeSettings}
                />
              </div>
            </div>

            <div className="cp-modal-footer no-print">
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setSelectedReceipt(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="cp-btn accent"
                onClick={() => printCanonicalElement(receiptDocRef.current)}
              >
                🖨️ Print Official Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD LIFECYCLE MODAL (Audit/Void Protection) */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Payment Receipt"
        recordIdentifier={lifecycleModal.recordIdentifier}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
}

