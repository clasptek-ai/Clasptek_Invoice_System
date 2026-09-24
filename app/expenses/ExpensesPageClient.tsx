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

interface ExpensesClientProps {
  initialExpenses: Expense[];
  expenseGroups: string[];
  currentUserRole: UserRole;
  isPeriodLocked: boolean;
  currentPeriod: string;
}

const DEPARTMENTS = [
  'Operations',
  'Academics',
  'Marketing',
  'Administration',
  'Executive',
  'Finance',
];

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
  const [selectedDept, setSelectedDept] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [cancelModalData, setCancelModalData] = useState<{ id: string; desc: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
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
      return true;
    });
  }, [expenses, search, selectedGroup]);

  // CSV Export with RFC-4180 formula injection defense
  const handleExportCsv = () => {
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
    const rows = filteredExpenses.map((e) => [
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

  // Cancel expense
  const handleCancelSubmit = async () => {
    if (!cancelModalData) return;
    try {
      const res = await fetch(`/api/finance/expenses/${cancelModalData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Cancellation failed');

      setExpenses((prev) =>
        prev.map((e) =>
          e.id === cancelModalData.id ? { ...e, status: 'cancelled' as ExpenseStatus } : e
        )
      );
      setCancelModalData(null);
      setCancelReason('');
      notify('success', 'Expense marked as cancelled.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cancelling expense';
      notify('error', msg);
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
            <button className="cp-btn sm secondary" onClick={handleExportCsv} id="btnExportExpenses">
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
          <div className="cp-field" style={{ maxWidth: 240, marginBottom: 0 }}>
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
          <div className="cp-field" style={{ maxWidth: 200, marginBottom: 0 }}>
            <select
              id="expenseDeptFilter"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

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
          <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense Group</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Beneficiary</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.expenseDate}</td>
                    <td style={{ fontWeight: 600 }}>{e.categoryGroup}</td>
                    <td>{e.subCategory}</td>
                    <td>
                      {e.description}
                      {e.reference && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                          ({e.reference})
                        </span>
                      )}
                    </td>
                    <td>{e.beneficiary}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                      ₦{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>
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
                          onClick={() => setCancelModalData({ id: e.id, desc: e.description })}
                          disabled={isPeriodLocked}
                        >
                          Cancel
                        </button>
                      )}
                      {e.status !== 'recorded' && e.status !== 'pending_approval' && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* Cancel Modal */}
      {cancelModalData && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 440 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">Cancel Expense</div>
              <button
                className="cp-modal-close"
                onClick={() => setCancelModalData(null)}
              >
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Are you sure you want to cancel expense: <strong>{cancelModalData.desc}</strong>?
              </p>
              <div className="cp-field">
                <label>Cancellation Reason *</label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, vendor refund"
                  required
                />
              </div>
            </div>
            <div className="cp-modal-footer">
              <button
                className="cp-btn secondary"
                onClick={() => setCancelModalData(null)}
              >
                Keep Expense
              </button>
              <button
                className="cp-btn danger"
                onClick={handleCancelSubmit}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
