'use client';

/**
 * app/expenses/ExpensesPageClient.tsx
 * Client Component for Operational & Programme Expenses
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React, { useState, useMemo } from 'react';
import { Expense, ExpenseStatus, PaymentMethod } from '@/types/finance';
import { UserRole } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { AUTHORITATIVE_EXPENSE_TAXONOMY } from '@/lib/finance/taxonomy';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface ExpensesClientProps {
  initialExpenses: Expense[];
  expenseGroups: string[];
  currentUserRole: UserRole;
  isPeriodLocked: boolean;
  currentPeriod: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Bank Transfer',
  'POS',
  'Card',
  'Online Payment',
  'Payment Gateway',
  'Cash',
  'Other',
];

export function ExpensesPageClient({
  initialExpenses,
  expenseGroups,
  currentUserRole,
  isPeriodLocked,
  currentPeriod,
}: ExpensesClientProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Multi-row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    expenseIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'CANCEL',
    expenseIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  // Modal states
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Log Expense
  const [formGroup, setFormGroup] = useState(expenseGroups[0] || 'Personnel & Payroll');
  const [formSubCategory, setFormSubCategory] = useState(
    AUTHORITATIVE_EXPENSE_TAXONOMY[expenseGroups[0] || 'Personnel & Payroll']?.[0] || 'Salaries'
  );
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formDesc, setFormDesc] = useState('');
  const [formBeneficiary, setFormBeneficiary] = useState('');
  const [formMethod, setFormMethod] = useState<PaymentMethod>('Bank Transfer');
  const [formReference, setFormReference] = useState('');
  const [formError, setFormError] = useState('');

  const canRecord = ['Super Admin', 'Finance Manager', 'Finance Staff'].includes(currentUserRole);
  const canApprove = ['Super Admin', 'Finance Manager'].includes(currentUserRole);
  const canCancel = ['Super Admin', 'Finance Manager', 'Finance Staff'].includes(currentUserRole);

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleGroupChange = (grp: string) => {
    setFormGroup(grp);
    const subCats = AUTHORITATIVE_EXPENSE_TAXONOMY[grp] || [];
    setFormSubCategory(subCats[0] || '');
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const descMatch = (e.description || '').toLowerCase().includes(q);
        const benMatch = (e.beneficiary || '').toLowerCase().includes(q);
        const catMatch = (e.subCategory || '').toLowerCase().includes(q);
        const grpMatch = (e.categoryGroup || '').toLowerCase().includes(q);
        const refMatch = (e.reference || '').toLowerCase().includes(q);
        if (!descMatch && !benMatch && !catMatch && !grpMatch && !refMatch) return false;
      }
      if (selectedGroup && e.categoryGroup !== selectedGroup) return false;
      if (selectedStatus && e.status !== selectedStatus) return false;
      return true;
    });
  }, [expenses, search, selectedGroup, selectedStatus]);

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedExpenses,
    setPage,
    setPageSize,
  } = usePagination(filteredExpenses, {
    initialPageSize: 25,
    resetDeps: [search, selectedGroup, selectedStatus],
  });

  const visibleIds = paginatedExpenses.map((e) => e.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);

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

  // CSV Export with RFC-4180 formula injection defense
  const handleExportCsv = (recordsToExport?: Expense[]) => {
    const list = recordsToExport || filteredExpenses;
    const headers = [
      'Date',
      'Expense Group',
      'Category',
      'Description',
      'Beneficiary',
      'Amount',
      'Payment Method',
      'Reference',
      'Status',
    ];
    const rows = list.map((e) => [
      e.expenseDate,
      e.categoryGroup,
      e.subCategory,
      e.description,
      e.beneficiary,
      String(e.amount),
      e.paymentMethod,
      e.reference || '',
      e.status.toUpperCase(),
    ]);
    downloadSafeCsv('Expenses_Ledger', headers, rows);
    notify('success', 'Expenses ledger exported safely to CSV.');
  };

  const handleExportSelectedCsv = () => {
    const selectedRecords = expenses.filter((e) => selectedIds.has(e.id));
    if (selectedRecords.length > 0) {
      handleExportCsv(selectedRecords);
    }
  };

  // Submit new expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPeriodLocked) {
      setFormError(`Accounting period ${currentPeriod} is locked. Transactions are prohibited.`);
      return;
    }

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid expense amount greater than zero.');
      return;
    }
    if (!formDesc.trim() || !formBeneficiary.trim()) {
      setFormError('Description and beneficiary are required fields.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryGroup: formGroup,
          subCategory: formSubCategory,
          amount: amt,
          expenseDate: formDate,
          description: formDesc.trim(),
          beneficiary: formBeneficiary.trim(),
          paymentMethod: formMethod,
          reference: formReference.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to record expense');
      }

      setExpenses((prev) => [data.expense, ...prev]);
      setIsLogModalOpen(false);
      setFormAmount('');
      setFormDesc('');
      setFormBeneficiary('');
      setFormReference('');
      notify('success', `Expense of ₦${amt.toLocaleString()} recorded successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error logging expense';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Approve expense
  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Approval failed');

      setExpenses((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'approved' as ExpenseStatus } : e))
      );
      notify('success', 'Expense approved successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error approving expense';
      notify('error', msg);
    }
  };

  // Bulk Approve
  const handleBulkApprove = async () => {
    const pendingToApprove = expenses.filter(
      (e) => selectedIds.has(e.id) && e.status === 'pending_approval'
    );
    if (pendingToApprove.length === 0) return;

    let successCount = 0;
    for (const exp of pendingToApprove) {
      try {
        const res = await fetch(`/api/finance/expenses/${exp.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        });
        if (res.ok) successCount++;
      } catch {
        // continue
      }
    }

    setExpenses((prev) =>
      prev.map((e) =>
        selectedIds.has(e.id) && e.status === 'pending_approval'
          ? { ...e, status: 'approved' as ExpenseStatus }
          : e
      )
    );
    notify('success', `Approved ${successCount} expense(s).`);
  };

  // Open Cancel Modal
  const handleOpenCancelModal = (ids: string[], targetIdentifier?: string) => {
    if (isPeriodLocked) {
      setLifecycleModal({
        isOpen: true,
        actionType: 'CANCEL',
        expenseIds: ids,
        recordIdentifier: targetIdentifier || `${ids.length} selected expense(s)`,
        dependencies: [],
        blockedMessage: `Financial period ${currentPeriod} is locked. Transactions and cancellations are strictly prohibited.`,
        isLoading: false,
      });
      return;
    }
    setLifecycleModal({
      isOpen: true,
      actionType: 'CANCEL',
      expenseIds: ids,
      recordIdentifier: targetIdentifier || `${ids.length} selected expense(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: false,
    });
  };

  // Confirm cancellation via RecordLifecycleModal
  const handleConfirmCancel = async (reason: string) => {
    const { expenseIds } = lifecycleModal;
    if (expenseIds.length === 0) return;

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    let successCount = 0;
    try {
      for (const id of expenseIds) {
        const res = await fetch(`/api/finance/expenses/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', reason: reason || 'Cancelled via ledger manager' }),
        });
        if (res.ok) successCount++;
      }

      setExpenses((prev) =>
        prev.map((e) =>
          expenseIds.includes(e.id) ? { ...e, status: 'cancelled' as ExpenseStatus } : e
        )
      );
      setLifecycleModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
      handleClearSelection();
      notify('success', `Cancelled ${successCount} expense record(s).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cancelling expense';
      notify('error', msg);
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div>
      {/* Toast Feedback */}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 6,
            background: feedback.type === 'success' ? '#059669' : '#DC2626',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Period Lock Warning */}
      {isPeriodLocked && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#991B1B',
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 18 }}>🔒</span>
          <div>
            <strong>PERIOD LOCKED:</strong> Financial Period <strong>{currentPeriod}</strong> is
            locked. Expense creation, updates, and cancellations are blocked.
          </div>
        </div>
      )}

      <div className="cp-card">
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
              💸 Operational &amp; Programme Expenses
            </div>
            <div className="cp-section-desc" style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              Track facilitator fees, technology subscriptions, facilities, payroll disbursements, and administration expenses.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cp-btn sm secondary" onClick={() => handleExportCsv()} id="btnExportExpenses">
              📥 Export CSV
            </button>
            {canRecord && (
              <button
                className="cp-btn sm accent"
                onClick={() => setIsLogModalOpen(true)}
                disabled={isPeriodLocked}
                id="btnLogExpenseBtn"
              >
                + Log Expense
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '14px 0', alignItems: 'center' }}>
          <div className="cp-field" style={{ maxWidth: 320, marginBottom: 0, flex: 1 }}>
            <input
              type="text"
              id="expenseSearchInput"
              placeholder="Filter by description, beneficiary, category, or ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cp-field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <select
              id="expenseGroupFilter"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">All Expense Groups</option>
              {expenseGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="cp-field" style={{ maxWidth: 180, marginBottom: 0 }}>
            <select
              id="expenseStatusFilter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="recorded">Recorded</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {(search || selectedGroup || selectedStatus) && (
            <button
              type="button"
              className="cp-btn sm secondary"
              onClick={() => {
                setSearch('');
                setSelectedGroup('');
                setSelectedStatus('');
              }}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Reset Filters
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            Showing {filteredExpenses.length} of {expenses.length}
          </span>
        </div>

        {/* Selection Bar */}
        <TableSelectionBar
          selectedCount={selectedIds.size}
          totalVisibleCount={visibleIds.length}
          entityLabel="expense"
          onSelectAllVisible={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onClearSelection={handleClearSelection}
        >
          <button
            type="button"
            className="cp-btn sm secondary"
            onClick={handleExportSelectedCsv}
            title="Export only selected expenses to CSV"
          >
            📥 Export CSV ({selectedIds.size})
          </button>
          {canApprove && (
            <button
              type="button"
              className="cp-btn sm accent"
              onClick={handleBulkApprove}
              title="Approve selected pending expenses"
            >
              ✅ Approve Selected
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="cp-btn sm danger"
              onClick={() => handleOpenCancelModal(Array.from(selectedIds))}
              disabled={isPeriodLocked}
              title="Cancel selected expense records"
            >
              🛑 Cancel Selected ({selectedIds.size})
            </button>
          )}
        </TableSelectionBar>

        {/* Table / Empty State */}
        {filteredExpenses.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: 36, marginBottom: 8 }}>💸</div>
            <div className="cp-empty-title" style={{ fontWeight: 700, fontSize: 16 }}>No expenses recorded</div>
            <div className="cp-empty-desc" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Track operational, facilitator, marketing and programme expenses.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        ref={headerCheckboxRef}
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all visible expenses"
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>Date</th>
                    <th className="cp-col-secondary">Expense Group</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="cp-col-tertiary">Beneficiary</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th className="cp-col-secondary">Payment Method</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.map((e) => {
                    const isSelected = selectedIds.has(e.id);
                    return (
                      <tr
                        key={e.id}
                        style={{
                          backgroundColor: isSelected ? 'var(--surface-selected, #eff6ff)' : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(e.id)}
                            aria-label={`Select expense ${e.description}`}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{e.expenseDate}</td>
                        <td className="cp-col-secondary" style={{ fontWeight: 600 }}>{e.categoryGroup}</td>
                        <td>{e.subCategory}</td>
                        <td>
                          {e.description}
                          {e.reference && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                              ({e.reference})
                            </span>
                          )}
                        </td>
                        <td className="cp-col-tertiary">{e.beneficiary}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                          ₦{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="cp-col-secondary">
                          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            {e.paymentMethod}
                          </span>
                        </td>
                        <td>
                          <span className={`cp-pill ${e.status}`}>
                            {e.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {e.status === 'pending_approval' && canApprove && (
                            <button
                              className="cp-btn sm accent"
                              onClick={() => handleApprove(e.id)}
                              style={{ marginRight: 6 }}
                            >
                              Approve
                            </button>
                          )}
                          {(e.status === 'recorded' || e.status === 'pending_approval') && canCancel && (
                            <button
                              className="cp-btn sm danger"
                              onClick={() => handleOpenCancelModal([e.id], e.description)}
                              disabled={isPeriodLocked}
                            >
                              Cancel
                            </button>
                          )}
                          {e.status !== 'recorded' && e.status !== 'pending_approval' && '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Vertical Cards */}
            <div className="cp-cards-mobile">
              {paginatedExpenses.map((e) => {
                const isSelected = selectedIds.has(e.id);
                return (
                  <div
                    key={e.id}
                    className="cp-mobile-record-card"
                    style={{
                      borderLeft: isSelected ? '4px solid var(--primary, #0284c7)' : undefined,
                    }}
                    onClick={() => handleToggleSelect(e.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(evt) => evt.key === 'Enter' && handleToggleSelect(e.id)}
                    aria-label={`Select expense ${e.description}`}
                  >
                    <div className="cp-mobile-record-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(evt) => {
                            evt.stopPropagation();
                            handleToggleSelect(e.id);
                          }}
                          aria-label={`Select expense ${e.description}`}
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                            {e.subCategory}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {e.expenseDate} &middot; {e.categoryGroup}
                          </div>
                        </div>
                      </div>
                      <span className={`cp-pill ${e.status}`}>
                        {e.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {e.description}
                      {e.reference && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 6 }}>
                          ({e.reference})
                        </span>
                      )}
                    </div>

                    <div className="cp-mobile-record-grid">
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Beneficiary</span>
                        <span className="cp-mobile-record-value">{e.beneficiary || 'Internal'}</span>
                      </div>
                      <div className="cp-mobile-record-field">
                        <span className="cp-mobile-record-label">Amount</span>
                        <span className="cp-mobile-record-value" style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '13px' }}>
                          ₦{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="cp-mobile-record-field" style={{ gridColumn: 'span 2' }}>
                        <span className="cp-mobile-record-label">Payment Method</span>
                        <span className="cp-mobile-record-value">{e.paymentMethod}</span>
                      </div>
                    </div>

                    {((e.status === 'pending_approval' && canApprove) || ((e.status === 'recorded' || e.status === 'pending_approval') && canCancel)) && (
                      <div className="cp-mobile-record-actions">
                        {e.status === 'pending_approval' && canApprove && (
                          <button
                            type="button"
                            className="cp-btn sm accent"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              handleApprove(e.id);
                            }}
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            Approve
                          </button>
                        )}
                        {(e.status === 'recorded' || e.status === 'pending_approval') && canCancel && (
                          <button
                            type="button"
                            className="cp-btn sm danger"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              handleOpenCancelModal([e.id], e.description);
                            }}
                            disabled={isPeriodLocked}
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Standard Pagination */}
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalRecords={filteredExpenses.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="expenses"
            />
          </>
        )}
      </div>

      {/* Log Expense Modal */}
      {isLogModalOpen && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 540 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">💸 Record Operational Expense</div>
              <button
                className="cp-modal-close"
                onClick={() => setIsLogModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveExpense}>
              <div className="cp-modal-body">
                {formError && (
                  <div
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #F87171',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#DC2626',
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div className="cp-field">
                  <label>Expense Accounting Group *</label>
                  <select
                    value={formGroup}
                    onChange={(e) => handleGroupChange(e.target.value)}
                  >
                    {expenseGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cp-field">
                  <label>Sub-Category *</label>
                  <select
                    value={formSubCategory}
                    onChange={(e) => setFormSubCategory(e.target.value)}
                  >
                    {(AUTHORITATIVE_EXPENSE_TAXONOMY[formGroup] || []).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="cp-field">
                    <label>Amount (₦) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="0.00"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="cp-field">
                    <label>Expense Date *</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="cp-field">
                  <label>Beneficiary / Vendor Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. AWS, Zoom, Facilitator Name, Landlord"
                    value={formBeneficiary}
                    onChange={(e) => setFormBeneficiary(e.target.value)}
                    required
                  />
                </div>

                <div className="cp-field">
                  <label>Description / Purpose *</label>
                  <input
                    type="text"
                    placeholder="e.g. Monthly cloud server infrastructure subscription"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="cp-field">
                    <label>Payment Method *</label>
                    <select
                      value={formMethod}
                      onChange={(e) => setFormMethod(e.target.value as PaymentMethod)}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cp-field">
                    <label>Bank Ref / Invoice Ref</label>
                    <input
                      type="text"
                      placeholder="e.g. TRF/EXP/0926"
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsLogModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cp-btn accent"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Recording...' : '✔ Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Lifecycle Modal (Cancel) */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Operational Expense"
        recordIdentifier={lifecycleModal.recordIdentifier}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        requireReason={true}
        reasonPlaceholder="Mandatory reason for expense cancellation..."
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
