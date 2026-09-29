'use client';

/**
 * app/budgets/BudgetsPageClient.tsx
 * Client Component for Budgets & Planning Management
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React, { useState } from 'react';
import { BudgetVsActualSummary } from '@/types/finance';
import { UserRole } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface BudgetsClientProps {
  initialSummary: BudgetVsActualSummary;
  expenseGroups: string[];
  currentUserRole: UserRole;
}

interface DrilldownTransaction {
  id: string;
  date: string;
  category: string;
  subCategory?: string;
  beneficiary: string;
  amount: number;
  description: string;
  status: string;
}

export function BudgetsPageClient({
  initialSummary,
  expenseGroups,
  currentUserRole,
}: BudgetsClientProps) {
  const [summary, setSummary] = useState<BudgetVsActualSummary>(initialSummary);
  const [period, setPeriod] = useState(initialSummary.periodKey);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Set Budget Modal
  const [isSetBudgetOpen, setIsSetBudgetOpen] = useState(false);
  const [formCategory, setFormCategory] = useState(expenseGroups[0] || 'Personnel & Payroll');
  const [formAmount, setFormAmount] = useState('');
  const [formDept, setFormDept] = useState('Operations');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const [budgetFormError, setBudgetFormError] = useState('');

  // Drilldown Modal
  const [activeDrilldownCategory, setActiveDrilldownCategory] = useState<string | null>(null);
  const [drilldownTransactions, setDrilldownTransactions] = useState<DrilldownTransaction[]>([]);
  const [isLoadingDrilldown, setIsLoadingDrilldown] = useState(false);

  const canManageBudget = ['Super Admin', 'Finance Manager'].includes(currentUserRole);

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handlePeriodChange = async (newPeriod: string) => {
    setPeriod(newPeriod);
    try {
      const res = await fetch(`/api/finance/budgets?period=${newPeriod}`);
      const data = await res.json();
      if (data.success && data.summary) {
        setSummary(data.summary);
      }
    } catch {
      notify('error', 'Failed to reload budget data for period');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Category',
      'Department',
      'Budget Cap',
      'Actual Spent',
      'Variance',
      'Variance %',
      'Utilization %',
      'Status',
    ];
    const rows = summary.categories.map((c) => [
      c.category,
      c.department,
      String(c.budgetAmount),
      String(c.actualAmount),
      String(c.variance),
      `${c.variancePct}%`,
      `${c.utilizationPct}%`,
      c.status,
    ]);
    downloadSafeCsv(`Budget_Variance_${summary.periodKey}`, headers, rows);
    notify('success', 'Budget variance report exported safely to CSV.');
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setBudgetFormError('Budget amount must be strictly greater than zero.');
      return;
    }

    setIsSubmittingBudget(true);
    setBudgetFormError('');

    try {
      const res = await fetch('/api/finance/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: formCategory,
          budgetAmount: amt,
          periodKey: period,
          department: formDept,
          notes: formNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to set budget');
      }

      setIsSetBudgetOpen(false);
      setFormAmount('');
      setFormNotes('');
      notify('success', `Budget of ₦${amt.toLocaleString()} allocated for ${formCategory}.`);

      // Refresh data
      await handlePeriodChange(period);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error setting budget';
      setBudgetFormError(msg);
    } finally {
      setIsSubmittingBudget(false);
    }
  };

  const handleOpenDrilldown = async (category: string) => {
    setActiveDrilldownCategory(category);
    setIsLoadingDrilldown(true);
    try {
      const res = await fetch(
        `/api/finance/budgets/drilldown?category=${encodeURIComponent(category)}&period=${period}`
      );
      const data = await res.json();
      if (data.success) {
        setDrilldownTransactions(data.transactions || []);
      }
    } catch {
      notify('error', 'Failed to fetch drilldown transactions');
    } finally {
      setIsLoadingDrilldown(false);
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

      {/* Top Budget Overview Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="cp-kpi-card" style={{ borderLeft: '3.5px solid var(--primary)' }}>
          <div className="cp-kpi-label">Total Monthly Budget Envelope</div>
          <div className="cp-kpi-value" style={{ color: 'var(--primary)', fontSize: 20 }}>
            ₦{summary.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Period: {summary.periodKey}
          </div>
        </div>

        <div
          className="cp-kpi-card"
          style={{
            borderLeft: `3.5px solid ${summary.hasOverspending ? 'var(--danger)' : 'var(--warning)'}`,
          }}
        >
          <div className="cp-kpi-label">Actual Expenditure to Date</div>
          <div
            className="cp-kpi-value"
            style={{
              color: summary.hasOverspending ? 'var(--danger)' : 'var(--warning)',
              fontSize: 20,
            }}
          >
            ₦{summary.totalActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Overall Utilization: <strong>{summary.overallUtilizationPct}%</strong>
          </div>
        </div>

        <div
          className="cp-kpi-card"
          style={{
            borderLeft: `3.5px solid ${summary.totalVariance >= 0 ? 'var(--success)' : 'var(--danger)'}`,
          }}
        >
          <div className="cp-kpi-label">Net Budget Variance</div>
          <div
            className="cp-kpi-value"
            style={{
              color: summary.totalVariance >= 0 ? 'var(--success)' : 'var(--danger)',
              fontSize: 20,
            }}
          >
            ₦{summary.totalVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: summary.totalVariance >= 0 ? 'var(--success)' : 'var(--danger)',
              marginTop: 2,
            }}
          >
            {summary.totalVariance >= 0 ? 'UNDER BUDGET' : 'OVER BUDGET'}
          </div>
        </div>
      </div>

      {/* Overspending Banner */}
      {summary.hasOverspending && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid var(--danger)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#991B1B',
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ fontSize: 13 }}>
            <strong>Budget Overspending Detected:</strong> {summary.overBudgetCategories.length}{' '}
            categories have exceeded their monthly allocation. Discretionary expenses should be reviewed immediately.
          </div>
        </div>
      )}

      {/* Main Budget Card */}
      <div className="cp-card">
        <div
          className="cp-card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div className="cp-section-title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
              ⚖️ Departmental &amp; Category Budget vs Actual Controls
            </div>
            <div className="cp-section-desc" style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              Live variance tracking, category utilization bars, and transaction drill-down.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="month"
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="cp-field"
              style={{ marginBottom: 0, height: 32, padding: '0 8px', fontSize: 12 }}
              id="budgetPeriodInput"
            />
            <button className="cp-btn sm secondary" onClick={handleExportCsv} id="btnExportBudget">
              📥 Export CSV
            </button>
            {canManageBudget && (
              <button
                className="cp-btn sm accent"
                onClick={() => setIsSetBudgetOpen(true)}
                id="btnSetBudgetBtn"
              >
                + Set Budget Allocation
              </button>
            )}
          </div>
        </div>

        {summary.categories.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: 36, marginBottom: 8 }}>⚖️</div>
            <div className="cp-empty-title" style={{ fontWeight: 700, fontSize: 16 }}>No budget allocations defined</div>
            <div className="cp-empty-desc" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Establish monthly expenditure limits across departments and categories.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="cp-col-secondary">Department</th>
                    <th style={{ textAlign: 'right' }}>Budget Cap</th>
                    <th style={{ textAlign: 'right' }}>Actual Spent</th>
                    <th className="cp-col-tertiary" style={{ textAlign: 'right' }}>Variance</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th className="cp-col-secondary">Utilization</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.categories.map((c) => (
                    <tr key={c.category}>
                      <td style={{ fontWeight: 700 }}>{c.category}</td>
                      <td className="cp-col-secondary">{c.department || 'Operations'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        ₦{c.budgetAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: c.isOverBudget ? 'var(--danger)' : 'inherit',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ₦{c.actualAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className="cp-col-tertiary"
                        style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          color: c.variance >= 0 ? 'var(--success)' : 'var(--danger)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.variance >= 0 ? '+' : ''}₦{c.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          className={`cp-pill ${
                            c.status === 'OVER_BUDGET'
                              ? 'danger'
                              : c.status === 'NEAR_LIMIT'
                              ? 'pending'
                              : 'paid'
                          }`}
                        >
                          {c.status === 'OVER_BUDGET'
                            ? 'OVER BUDGET'
                            : c.status === 'NEAR_LIMIT'
                            ? 'NEAR LIMIT'
                            : 'UNDER BUDGET'}
                        </span>
                      </td>
                      <td className="cp-col-secondary" style={{ width: 140 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                          {c.utilizationPct}%
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: 'var(--surface-2)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, c.utilizationPct)}%`,
                              background:
                                c.utilizationPct > 100
                                  ? 'var(--danger)'
                                  : c.utilizationPct >= 80
                                  ? 'var(--warning)'
                                  : 'var(--success)',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          className="cp-btn sm secondary"
                          onClick={() => handleOpenDrilldown(c.category)}
                        >
                          🔍 Transactions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Vertical Cards */}
            <div className="cp-cards-mobile">
              {summary.categories.map((c) => (
                <div key={c.category} className="cp-mobile-record-card">
                  <div className="cp-mobile-record-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {c.category}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {c.department || 'Operations'}
                      </div>
                    </div>
                    <span
                      className={`cp-pill ${
                        c.status === 'OVER_BUDGET'
                          ? 'danger'
                          : c.status === 'NEAR_LIMIT'
                          ? 'pending'
                          : 'paid'
                      }`}
                    >
                      {c.status === 'OVER_BUDGET'
                        ? 'OVER'
                        : c.status === 'NEAR_LIMIT'
                        ? 'NEAR'
                        : 'OK'}
                    </span>
                  </div>

                  {/* Utilization Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Utilization</span>
                      <span style={{ color: c.utilizationPct > 100 ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {c.utilizationPct}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, c.utilizationPct)}%`,
                          background:
                            c.utilizationPct > 100
                              ? 'var(--danger)'
                              : c.utilizationPct >= 80
                              ? 'var(--warning)'
                              : 'var(--success)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="cp-mobile-record-grid">
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Budget Cap</span>
                      <span className="cp-mobile-record-value" style={{ fontWeight: 700 }}>
                        ₦{c.budgetAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Actual Spent</span>
                      <span
                        className="cp-mobile-record-value"
                        style={{
                          fontWeight: 700,
                          color: c.isOverBudget ? 'var(--danger)' : 'var(--text-primary)',
                        }}
                      >
                        ₦{c.actualAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field" style={{ gridColumn: 'span 2' }}>
                      <span className="cp-mobile-record-label">Variance</span>
                      <span
                        className="cp-mobile-record-value"
                        style={{
                          fontWeight: 800,
                          color: c.variance >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {c.variance >= 0 ? '+' : ''}₦{c.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="cp-mobile-record-actions">
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={() => handleOpenDrilldown(c.category)}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      🔍 Transactions
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Set Budget Allocation Modal */}
      {isSetBudgetOpen && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 480 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">⚖️ Set Budget Allocation</div>
              <button
                className="cp-modal-close"
                onClick={() => setIsSetBudgetOpen(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveBudget}>
              <div className="cp-modal-body">
                {budgetFormError && (
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
                    {budgetFormError}
                  </div>
                )}

                <div className="cp-field">
                  <label>Accounting Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    required
                  >
                    {expenseGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cp-field">
                  <label>Budget Cap (₦) *</label>
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
                  <label>Department</label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                  >
                    <option value="Operations">Operations</option>
                    <option value="Academics">Academics</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Administration">Administration</option>
                    <option value="Executive">Executive</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div className="cp-field">
                  <label>Notes / Justification</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Approved by board for Q3 operations"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsSetBudgetOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cp-btn accent"
                  disabled={isSubmittingBudget}
                >
                  {isSubmittingBudget ? 'Allocating...' : '✔ Set Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drilldown Transactions Modal */}
      {activeDrilldownCategory && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 640 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">
                🔍 Expense Transactions &middot; {activeDrilldownCategory} ({period})
              </div>
              <button
                className="cp-modal-close"
                onClick={() => setActiveDrilldownCategory(null)}
              >
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              {isLoadingDrilldown ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                  Loading transactions...
                </div>
              ) : drilldownTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                  No expense transactions recorded under this category for period {period}.
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table className="cp-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sub-Category</th>
                        <th>Beneficiary</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownTransactions.map((t) => (
                        <tr key={t.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                          <td>{t.subCategory || '—'}</td>
                          <td>{t.beneficiary}</td>
                          <td>{t.description}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                            ₦{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setActiveDrilldownCategory(null)}
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
