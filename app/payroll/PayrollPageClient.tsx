'use client';

/**
 * app/payroll/PayrollPageClient.tsx — Phase 6
 * Interactive Client Component for Staff & Facilitator Payroll & Payslips.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState, useMemo } from 'react';
import type { Payslip, Personnel, FinancialMetrics, AllowanceDeductionItem } from '@/types/finance';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { RecordLifecycleModal } from '@/components/tables/RecordLifecycleModal';

interface PayrollPageClientProps {
  initialPayslips: Payslip[];
  personnel: Personnel[];
  metrics: FinancialMetrics;
}

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

export function PayrollPageClient({
  initialPayslips,
  personnel,
  metrics,
}: PayrollPageClientProps) {
  const [payslips, setPayslips] = useState<Payslip[]>(initialPayslips);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    payslip?: Payslip;
  }>({ isOpen: false });

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'staff' | 'facilitator'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [isPrepareModalOpen, setIsPrepareModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State for Preparing Payslip
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(personnel[0]?.id || '');
  const [selectedPayPeriod, setSelectedPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [basicPay, setBasicPay] = useState<number>(personnel[0]?.basicPay || 100000);
  const [allowances, setAllowances] = useState<AllowanceDeductionItem[]>([]);
  const [deductions, setDeductions] = useState<AllowanceDeductionItem[]>([
    { description: 'Tax', amount: 5000 },
  ]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When selected personnel changes, update suggested basic pay
  const handlePersonnelSelect = (pId: string) => {
    setSelectedPersonnelId(pId);
    const p = personnel.find(item => item.id === pId);
    if (p) {
      setBasicPay(p.basicPay || 100000);
    }
  };

  // Allowance handlers
  const handleAddAllowance = () => {
    setAllowances([...allowances, { description: 'Transport Allowance', amount: 10000 }]);
  };
  const handleRemoveAllowance = (index: number) => {
    setAllowances(allowances.filter((_, i) => i !== index));
  };

  // Deduction handlers
  const handleAddDeduction = () => {
    setDeductions([...deductions, { description: 'Pension', amount: 4000 }]);
  };
  const handleRemoveDeduction = (index: number) => {
    setDeductions(deductions.filter((_, i) => i !== index));
  };

  // Calculate gross, deductions, net
  const grossPay = basicPay + allowances.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const totalDeductions = deductions.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const netPay = Math.max(0, grossPay - totalDeductions);

  // Submit new payslip statement
  const handlePreparePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPersonnelId || !selectedPayPeriod) {
      setFeedbackMsg({ type: 'error', text: 'Please select personnel and pay period.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/finance/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnelId: selectedPersonnelId,
          payPeriod: selectedPayPeriod,
          basicPay,
          allowances,
          deductions,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to prepare payslip');
      }

      setPayslips([data.payslip, ...payslips]);
      setIsPrepareModalOpen(false);
      setNotes('');
      setFeedbackMsg({
        type: 'success',
        text: `Payslip statement ${data.payslip.payslipDisplayNo} issued for review!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lifecycle transitions: Acknowledge, Approve, Pay, Cancel
  const handleStatusAction = async (id: string, action: 'acknowledge' | 'approve' | 'pay' | 'cancel') => {
    const confirmText = {
      acknowledge: 'Acknowledge this compensation statement?',
      approve: 'Approve this statement for disbursement?',
      pay: 'Confirm payment disbursement for this payslip? This marks the statement as PAID.',
      cancel: 'Cancel this payslip statement?',
    }[action];

    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`/api/finance/payroll/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to execute ${action}`);
      }

      // Update local state
      const nextStatus = {
        acknowledge: 'acknowledged' as const,
        approve: 'approved' as const,
        pay: 'paid' as const,
        cancel: 'cancelled' as const,
      }[action];

      setPayslips(payslips.map(p => p.id === id ? { ...p, status: nextStatus } : p));
      if (selectedPayslip?.id === id) {
        setSelectedPayslip({ ...selectedPayslip, status: nextStatus });
      }
      setFeedbackMsg({ type: 'success', text: `Payslip status updated to ${nextStatus.toUpperCase()}!` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMsg({ type: 'error', text: msg });
    }
  };

  // Cancel Statement with Lifecycle Modal
  const handleOpenCancelPayslip = (ps: Payslip) => {
    setLifecycleModal({
      isOpen: true,
      payslip: ps,
    });
  };

  const handleConfirmCancelPayslip = async (reason?: string) => {
    if (!lifecycleModal.payslip) return;
    const ps = lifecycleModal.payslip;
    try {
      const res = await fetch(`/api/finance/payroll/${ps.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', remarks: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel statement');
      }

      setPayslips((prev) => prev.map((item) => (item.id === ps.id ? { ...item, status: 'cancelled' } : item)));
      if (selectedPayslip?.id === ps.id) {
        setSelectedPayslip({ ...selectedPayslip, status: 'cancelled' });
      }
      setFeedbackMsg({ type: 'success', text: `Payslip ${ps.payslipDisplayNo} has been cancelled.` });
      setLifecycleModal({ isOpen: false });
    } catch (err: unknown) {
      setFeedbackMsg({ type: 'error', text: err instanceof Error ? err.message : 'Cancellation failed' });
    }
  };

  // Safe RFC-4180 CSV Export
  const handleExportCSV = (selectedOnly: boolean = false) => {
    const headers = [
      'Payslip #',
      'Pay Period',
      'Employee Name',
      'Type',
      'Department',
      'Role',
      'Basic Pay',
      'Gross Pay',
      'Total Deductions',
      'Net Pay',
      'Status',
    ];
    const sourceList = selectedOnly
      ? filteredPayslips.filter((p) => selectedIds.has(p.id))
      : filteredPayslips;

    const rows = sourceList.map((p) => [
      p.payslipDisplayNo,
      p.payPeriod,
      p.employeeName,
      p.employeeType.toUpperCase(),
      p.department,
      p.role,
      p.basicPay,
      p.grossPay,
      p.totalDeductions,
      p.netPay,
      p.status.toUpperCase(),
    ]);

    downloadSafeCsv('clasptek_payroll', headers, rows);
  };

  // Unique periods for dropdown
  const uniquePeriods = Array.from(new Set(payslips.map((p) => p.payPeriod))).filter(Boolean);

  // Filter payslips
  const filteredPayslips = payslips.filter((ps) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQ =
      !q ||
      ps.payslipDisplayNo.toLowerCase().includes(q) ||
      ps.employeeName.toLowerCase().includes(q) ||
      ps.role.toLowerCase().includes(q) ||
      ps.department.toLowerCase().includes(q);

    const matchesType = typeFilter === 'all' || ps.employeeType === typeFilter;
    const matchesStatus = statusFilter === 'all' || ps.status === statusFilter;
    const matchesPeriod = periodFilter === 'all' || ps.payPeriod === periodFilter;

    return matchesQ && matchesType && matchesStatus && matchesPeriod;
  });

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedPayslips,
    setPage,
    setPageSize,
  } = usePagination(filteredPayslips, {
    initialPageSize: 25,
    resetDeps: [searchQuery, typeFilter, statusFilter, periodFilter],
  });

  // Row Selection logic
  const visibleIds = useMemo(() => paginatedPayslips.map((p) => p.id), [paginatedPayslips]);
  const isAllSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id)),
    [visibleIds, selectedIds]
  );
  const isIndeterminate = useMemo(() => {
    const count = visibleIds.filter((id) => selectedIds.has(id)).length;
    return count > 0 && count < visibleIds.length;
  }, [visibleIds, selectedIds]);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkStatusAction = async (action: 'acknowledge' | 'approve') => {
    const targetStatus = action === 'acknowledge' ? 'issued' : 'acknowledged';
    const eligible = payslips.filter((p) => selectedIds.has(p.id) && p.status === targetStatus);
    if (eligible.length === 0) {
      setFeedbackMsg({
        type: 'error',
        text: `No selected statements are in '${targetStatus.toUpperCase()}' status to ${action}.`,
      });
      return;
    }

    let successCount = 0;
    for (const ps of eligible) {
      try {
        const res = await fetch(`/api/finance/payroll/${ps.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (res.ok) successCount++;
      } catch {
        // continue
      }
    }

    const nextStatus = action === 'acknowledge' ? 'acknowledged' : 'approved';
    setPayslips((prev) =>
      prev.map((p) => (eligible.some((e) => e.id === p.id) ? { ...p, status: nextStatus } : p))
    );
    setFeedbackMsg({
      type: 'success',
      text: `Successfully updated ${successCount} payslip statement(s) to ${nextStatus.toUpperCase()}!`,
    });
    handleClearSelection();
  };

  return (
    <div>
      {/* Feedback Banner */}
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

      {/* 5-Stage Multi-Stage Workflow Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginBottom: '22px' }}>
        <div className="cp-card" style={{ padding: '12px 16px', borderTop: '3px solid #64748b' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
            1. In Preparation
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#334155', margin: '4px 0' }}>
            {fmtMoney(metrics.payroll.draftPayroll)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {metrics.payroll.draftCount} Drafts
          </div>
        </div>

        <div className="cp-card" style={{ padding: '12px 16px', borderTop: '3px solid #0284c7' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#0284c7', fontWeight: 600 }}>
            2. Issued (Review)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284c7', margin: '4px 0' }}>
            {fmtMoney(metrics.payroll.pendingAcknowledgement)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {metrics.payroll.issuedCount} Awaiting Ack
          </div>
        </div>

        <div className="cp-card" style={{ padding: '12px 16px', borderTop: '3px solid #8b5cf6' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8b5cf6', fontWeight: 600 }}>
            3. Acknowledged
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6', margin: '4px 0' }}>
            {fmtMoney(metrics.payroll.pendingApproval)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {metrics.payroll.acknowledgedCount} Pending Approval
          </div>
        </div>

        <div className="cp-card" style={{ padding: '12px 16px', borderTop: '3px solid #f59e0b' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#d97706', fontWeight: 600 }}>
            4. Approved Ready
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#d97706', margin: '4px 0' }}>
            {fmtMoney(metrics.payroll.approvedReady)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {metrics.payroll.approvedCount} Ready for Pay
          </div>
        </div>

        <div className="cp-card" style={{ padding: '12px 16px', borderTop: '3px solid #10b981' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#059669', fontWeight: 600 }}>
            5. Disbursed (Paid)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>
            {fmtMoney(metrics.payroll.paidTotal)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {metrics.payroll.paidCount} Fully Settled
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="cp-card">
        {/* Header */}
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              💳 Staff &amp; Facilitator Payroll &amp; Payslips
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
              Pre-payment statement preparation, staff review, management approval, and verified disbursement audit.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cp-btn sm secondary" onClick={() => handleExportCSV(false)}>
              📥 Export CSV
            </button>
            <button className="cp-btn sm accent" onClick={() => setIsPrepareModalOpen(true)}>
              + Prepare Payslip
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px' }}>
            <input
              type="text"
              placeholder="Search by employee, payslip #, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '7px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '5px' }}
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'staff' | 'facilitator')}
              style={{ padding: '7px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '5px' }}
            >
              <option value="all">All Personnel Types</option>
              <option value="staff">Staff Members</option>
              <option value="facilitator">Facilitators / Trainers</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '7px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '5px' }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued (Review)</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              style={{ padding: '7px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '5px' }}
            >
              <option value="all">All Periods</option>
              {uniquePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Payslips Table */}
        {filteredPayslips.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: '36px', marginBottom: '8px' }}>💳</div>
            <div className="cp-empty-title" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              No payslip statements found
            </div>
            <div className="cp-empty-desc" style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 16px' }}>
              Prepare and issue a monthly compensation statement for staff or facilitators.
            </div>
            <button className="cp-btn accent sm" onClick={() => setIsPrepareModalOpen(true)}>
              + Prepare Payslip
            </button>
          </div>
        ) : (
          <>
            {/* Table Selection Bar */}
            {selectedIds.size > 0 && (
              <div style={{ padding: '0 20px 14px' }}>
                <TableSelectionBar
                  selectedCount={selectedIds.size}
                  totalVisibleCount={visibleIds.length}
                  entityLabel="payslips"
                  onClearSelection={handleClearSelection}
                  onSelectAllVisible={handleToggleSelectAll}
                  isAllSelected={isAllSelected}
                >
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleBulkStatusAction('acknowledge')}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#7e22ce' }}
                  >
                    ✔ Bulk Acknowledge
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleBulkStatusAction('approve')}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#d97706' }}
                  >
                    ✔ Bulk Approve
                  </button>
                  <button
                    type="button"
                    className="cp-btn sm secondary"
                    onClick={() => handleExportCSV(true)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    📥 Export Selected CSV
                  </button>
                </TableSelectionBar>
              </div>
            )}

            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                    <th style={{ width: '40px', padding: '10px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible payslips"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isIndeterminate;
                        }}
                        onChange={handleToggleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Payslip #</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Period</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Employee Name</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Type</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Role / Dept</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Basic Pay</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Gross</th>
                    <th className="cp-col-secondary" style={{ padding: '10px 14px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Deductions</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Net Pay</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569' }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475569', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPayslips.map((ps) => {
                    let statusBg = '#f1f5f9';
                    let statusColor = '#475569';
                    if (ps.status === 'paid') {
                      statusBg = '#ecfdf5';
                      statusColor = '#059669';
                    } else if (ps.status === 'approved') {
                      statusBg = '#fffbeb';
                      statusColor = '#d97706';
                    } else if (ps.status === 'acknowledged') {
                      statusBg = '#f3e8ff';
                      statusColor = '#7e22ce';
                    } else if (ps.status === 'issued') {
                      statusBg = '#f0f9ff';
                      statusColor = '#0284c7';
                    }
                    const isRowSelected = selectedIds.has(ps.id);

                    return (
                      <tr
                        key={ps.id}
                        style={{
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          backgroundColor: isRowSelected ? '#F0F9FF' : undefined,
                        }}
                      >
                        <td style={{ width: '40px', padding: '10px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select payslip ${ps.payslipDisplayNo}`}
                            checked={isRowSelected}
                            onChange={() => handleToggleSelect(ps.id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>
                          {ps.payslipDisplayNo}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#64748b' }}>
                          {ps.payPeriod}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                          {ps.employeeName}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: ps.employeeType === 'facilitator' ? '#fdf4ff' : '#f0fdf4', color: ps.employeeType === 'facilitator' ? '#a21caf' : '#15803d', fontWeight: 600 }}>
                            {ps.employeeType}
                          </span>
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', color: '#475569', fontSize: '12px' }}>
                          {ps.role} &bull; <span style={{ color: '#64748b' }}>{ps.department}</span>
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {fmtMoney(ps.basicPay)}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>
                          {fmtMoney(ps.grossPay)}
                        </td>
                        <td className="cp-col-secondary" style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626' }}>
                          -{fmtMoney(ps.totalDeductions)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                          {fmtMoney(ps.netPay)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', background: statusBg, color: statusColor }}>
                            {ps.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              className="cp-btn sm secondary"
                              onClick={() => setSelectedPayslip(ps)}
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                            >
                              Statement
                            </button>

                            {ps.status === 'issued' && (
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => handleStatusAction(ps.id, 'acknowledge')}
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#7e22ce' }}
                                title="Acknowledge by employee"
                              >
                                Ack
                              </button>
                            )}

                            {ps.status === 'acknowledged' && (
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => handleStatusAction(ps.id, 'approve')}
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#d97706' }}
                                title="Approve by manager"
                              >
                                Approve
                              </button>
                            )}

                            {ps.status === 'approved' && (
                              <button
                                className="cp-btn sm accent"
                                onClick={() => handleStatusAction(ps.id, 'pay')}
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                title="Disburse / Mark Paid"
                              >
                                Pay
                              </button>
                            )}

                            {ps.status !== 'paid' && ps.status !== 'cancelled' && (
                              <button
                                className="cp-btn sm secondary"
                                onClick={() => handleOpenCancelPayslip(ps)}
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#dc2626' }}
                                title="Cancel statement"
                              >
                                Cancel
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
              {paginatedPayslips.map((ps) => {
                let statusBg = '#f1f5f9';
                let statusColor = '#475569';
                if (ps.status === 'paid') {
                  statusBg = '#ecfdf5';
                  statusColor = '#059669';
                } else if (ps.status === 'approved') {
                  statusBg = '#fffbeb';
                  statusColor = '#d97706';
                } else if (ps.status === 'acknowledged') {
                  statusBg = '#f3e8ff';
                  statusColor = '#7e22ce';
                } else if (ps.status === 'issued') {
                  statusBg = '#f0f9ff';
                  statusColor = '#0284c7';
                }

                return (
                  <div
                    key={ps.id}
                    className="cp-mobile-record-card"
                    onClick={() => setSelectedPayslip(ps)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPayslip(ps)}
                    aria-label={`View payslip ${ps.payslipDisplayNo}`}
                  >
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select payslip ${ps.payslipDisplayNo}`}
                          checked={selectedIds.has(ps.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleSelect(ps.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {ps.employeeName}
                          </h4>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {ps.role} &bull; {ps.department}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {ps.payslipDisplayNo}
                        </span>
                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', background: statusBg, color: statusColor }}>
                          {ps.status}
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
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Gross</span>
                        <strong>{fmtMoney(ps.grossPay)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Deductions</span>
                        <strong style={{ color: '#dc2626' }}>-{fmtMoney(ps.totalDeductions)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>Net Pay</span>
                        <strong style={{ color: '#059669' }}>{fmtMoney(ps.netPay)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      <span>Period: {ps.payPeriod}</span>
                      <span style={{ textTransform: 'capitalize' }}>{ps.employeeType}</span>
                    </div>

                    <div className="cp-mobile-record-actions">
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPayslip(ps);
                        }}
                        style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                      >
                        View Statement
                      </button>
                      {ps.status !== 'paid' && ps.status !== 'cancelled' && (
                        <button
                          type="button"
                          className="cp-btn sm secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCancelPayslip(ps);
                          }}
                          style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600, color: '#dc2626' }}
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
              totalRecords={filteredPayslips.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="payslips"
            />
          </>
        )}
      </div>

      {/* PREPARE PAYSLIP MODAL */}
      {isPrepareModalOpen && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '600px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                💳 Prepare Staff / Facilitator Payslip
              </div>
              <button
                onClick={() => setIsPrepareModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePreparePayslip}>
              {/* Personnel Select */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Select Personnel (Staff or Facilitator) *
                </label>
                <select
                  required
                  value={selectedPersonnelId}
                  onChange={(e) => handlePersonnelSelect(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.employeeId}] {p.fullName} &bull; {p.jobTitle} ({p.employeeType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pay Period & Basic Pay */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Pay Period (YYYY-MM) *
                  </label>
                  <input
                    type="text"
                    required
                    pattern="^\d{4}-\d{2}$"
                    placeholder="2026-09"
                    value={selectedPayPeriod}
                    onChange={(e) => setSelectedPayPeriod(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Base Monthly Salary / Pay (₦) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={basicPay}
                    onChange={(e) => setBasicPay(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Allowances */}
              <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Allowances &amp; Bonuses</span>
                  <button
                    type="button"
                    onClick={handleAddAllowance}
                    style={{ fontSize: '11px', background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Add Allowance
                  </button>
                </div>
                {allowances.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => {
                        const copy = [...allowances];
                        copy[idx].description = e.target.value;
                        setAllowances(copy);
                      }}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={it.amount}
                      onChange={(e) => {
                        const copy = [...allowances];
                        copy[idx].amount = Number(e.target.value);
                        setAllowances(copy);
                      }}
                      style={{ width: '120px', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAllowance(idx)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px' }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Deductions */}
              <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Statutory &amp; Voluntary Deductions</span>
                  <button
                    type="button"
                    onClick={handleAddDeduction}
                    style={{ fontSize: '11px', background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Add Deduction
                  </button>
                </div>
                {deductions.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="Description (e.g. Tax, Pension)"
                      value={it.description}
                      onChange={(e) => {
                        const copy = [...deductions];
                        copy[idx].description = e.target.value;
                        setDeductions(copy);
                      }}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={it.amount}
                      onChange={(e) => {
                        const copy = [...deductions];
                        copy[idx].amount = Number(e.target.value);
                        setDeductions(copy);
                      }}
                      style={{ width: '120px', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDeduction(idx)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px' }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Net Pay Preview */}
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                  <span>Gross Pay:</span>
                  <strong>{fmtMoney(grossPay)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: '#dc2626' }}>
                  <span>Total Deductions:</span>
                  <strong>-{fmtMoney(totalDeductions)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #bbf7d0', fontSize: '15px' }}>
                  <span style={{ fontWeight: 700 }}>Net Disbursable Pay:</span>
                  <strong style={{ color: '#059669', fontSize: '17px' }}>{fmtMoney(netPay)}</strong>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsPrepareModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="cp-btn accent"
                >
                  {isSubmitting ? 'Issuing Statement...' : 'Issue Statement for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW STATEMENT MODAL */}
      {selectedPayslip && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '540px', maxWidth: '95vw', padding: '24px', border: '1px solid #cbd5e1' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.05em', color: '#0f172a' }}>
                CLASPTEK COACHING LIMITED
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Staff &amp; Facilitator Monthly Compensation Statement
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Payslip #</span>
                <strong style={{ fontFamily: 'monospace' }}>{selectedPayslip.payslipDisplayNo}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Pay Period</span>
                <strong style={{ fontFamily: 'monospace' }}>{selectedPayslip.payPeriod}</strong>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '14px', fontSize: '12.5px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Employee Name</span>
                  <strong>{selectedPayslip.employeeName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Role &amp; Department</span>
                  <span>{selectedPayslip.role} ({selectedPayslip.department})</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Basic Salary / Compensation:</span>
                <strong>{fmtMoney(selectedPayslip.basicPay)}</strong>
              </div>
              {selectedPayslip.allowances.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#059669', fontSize: '12px' }}>
                  <span>+ {it.description}:</span>
                  <span>{fmtMoney(it.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #e2e8f0', fontWeight: 600 }}>
                <span>Gross Compensation:</span>
                <span>{fmtMoney(selectedPayslip.grossPay)}</span>
              </div>
              {selectedPayslip.deductions.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#dc2626', fontSize: '12px' }}>
                  <span>- {it.description}:</span>
                  <span>-{fmtMoney(it.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '2px solid #0f172a', fontSize: '16px', fontWeight: 700 }}>
                <span>Net Disbursable Pay:</span>
                <span style={{ color: '#059669' }}>{fmtMoney(selectedPayslip.netPay)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Current Status: </span>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>
                  {selectedPayslip.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-btn secondary sm"
                  onClick={() => window.print()}
                >
                  🖨️ Print Statement
                </button>
                <button
                  type="button"
                  className="cp-btn secondary sm"
                  onClick={() => setSelectedPayslip(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Lifecycle Cancellation Modal */}
      {lifecycleModal.isOpen && lifecycleModal.payslip && (
        <RecordLifecycleModal
          isOpen={lifecycleModal.isOpen}
          onClose={() => setLifecycleModal({ isOpen: false })}
          onConfirm={handleConfirmCancelPayslip}
          entityName="Compensation Statement"
          recordIdentifier={lifecycleModal.payslip.payslipDisplayNo}
          actionType="CANCEL"
          dependencies={[
            { label: 'Pay Period', count: 1 },
            { label: 'Gross Pay (₦)', count: Math.round(lifecycleModal.payslip.grossPay) },
          ]}
          requireReason={true}
          reasonPlaceholder="Enter reason for cancelling this payslip statement (mandatory for financial compliance audit)..."
        />
      )}
    </div>
  );
}

