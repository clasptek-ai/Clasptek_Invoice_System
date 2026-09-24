'use client';

/**
 * app/funds-transfers/FundsTransfersPageClient.tsx
 * Client Component for Funds & Official Accounts Intelligence
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React, { useState } from 'react';
import { PaymentAccount, InternalTransfer, CreditedAccountDistribution } from '@/types/finance';
import { UserRole } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface FundsTransfersProps {
  accounts: PaymentAccount[];
  distribution: CreditedAccountDistribution[];
  initialTransfers: InternalTransfer[];
  metrics: {
    fundsReceived: number;
    totalExpenses: number;
    netFundsMovement: number;
    totalInternalTransfers: number;
    transfersCount: number;
    reconciliation: {
      reconciledCount: number;
      reconciledAmount: number;
      unreconciledCount: number;
      unreconciledAmount: number;
      exceptionCount: number;
      exceptionAmount: number;
    };
  };
  currentUserRole: UserRole;
}

export function FundsTransfersPageClient({
  accounts,
  distribution,
  initialTransfers,
  metrics: initialMetrics,
  currentUserRole,
}: FundsTransfersProps) {
  const [transfers, setTransfers] = useState<InternalTransfer[]>(initialTransfers);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canRecordTransfer = ['Super Admin', 'Finance Manager', 'Finance Staff'].includes(
    currentUserRole
  );

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleExportCsv = () => {
    const headers = [
      'Transfer ID',
      'Date',
      'From Account',
      'To Account',
      'Amount',
      'Reference',
      'Reason',
      'Recorded By',
    ];
    const rows = transfers.map((t) => [
      t.id,
      t.date,
      t.fromBank,
      t.toBank,
      String(t.amount),
      t.reference,
      t.reason || '',
      t.recordedBy || '',
    ]);
    downloadSafeCsv('Internal_Transfers', headers, rows);
    notify('success', 'Internal transfers exported safely to CSV.');
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAccountId || !toAccountId) {
      setFormError('Please select both source and destination accounts.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setFormError('Source and destination accounts must be different.');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Transfer amount must be strictly greater than zero.');
      return;
    }
    if (!reference.trim()) {
      setFormError('Bank reference or transfer identifier is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const res = await fetch('/api/finance/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          toAccountId,
          amount: amt,
          date: transferDate,
          reference: reference.trim(),
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to record transfer');
      }

      setTransfers((prev) => [data.transfer, ...prev]);
      setMetrics((prev) => ({
        ...prev,
        totalInternalTransfers: prev.totalInternalTransfers + amt,
        transfersCount: prev.transfersCount + 1,
      }));

      setIsTransferModalOpen(false);
      setAmount('');
      setReference('');
      setReason('');
      notify('success', `Internal transfer of ₦${amt.toLocaleString()} recorded successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error recording transfer';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
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

      {/* Page Header */}
      <div
        className="cp-page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🏦</span> Funds &amp; Official Accounts Intelligence
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            Authoritative multi-account fund movement, external receipts ledger, internal non-revenue transfers, and bank reconciliation.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cp-btn sm secondary" onClick={handleExportCsv} id="btnExportTransfers">
            📥 Export CSV
          </button>
          {canRecordTransfer && (
            <button
              className="cp-btn primary sm"
              onClick={() => setIsTransferModalOpen(true)}
              style={{ fontWeight: 700 }}
              id="btnOpenTransferModal"
            >
              + Record Internal Transfer
            </button>
          )}
        </div>
      </div>

      {/* Funds Summary KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="cp-kpi-card" style={{ borderLeft: '3.5px solid var(--success)' }}>
          <div className="cp-kpi-label">Funds Received (External)</div>
          <div className="cp-kpi-value" style={{ color: 'var(--success)', fontSize: 20 }}>
            ₦{metrics.fundsReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Total External Inflows &middot; Excl. Transfers
          </div>
        </div>

        <div className="cp-kpi-card" style={{ borderLeft: '3.5px solid var(--danger)' }}>
          <div className="cp-kpi-label">Approved Outflows</div>
          <div className="cp-kpi-value" style={{ color: 'var(--danger)', fontSize: 20 }}>
            ₦{metrics.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Disbursed &amp; Approved Expenses
          </div>
        </div>

        <div className="cp-kpi-card" style={{ borderLeft: '3.5px solid var(--primary)' }}>
          <div className="cp-kpi-label">Net Funds Movement</div>
          <div
            className="cp-kpi-value"
            style={{
              color: metrics.netFundsMovement >= 0 ? 'var(--primary)' : 'var(--danger)',
              fontSize: 20,
            }}
          >
            ₦{metrics.netFundsMovement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Receipts &minus; Approved Outflows
          </div>
        </div>

        <div className="cp-kpi-card" style={{ borderLeft: '3.5px solid #8B5CF6' }}>
          <div className="cp-kpi-label">Internal Transfers</div>
          <div className="cp-kpi-value" style={{ color: '#7C3AED', fontSize: 20 }}>
            ₦{metrics.totalInternalTransfers.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Non-Revenue Movements ({transfers.length} txns)
          </div>
        </div>
      </div>

      {/* Section 1 & Section 2 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Official Bank Accounts */}
        <div className="cp-card" style={{ marginBottom: 0 }}>
          <div className="cp-card-header" style={{ marginBottom: 12 }}>
            <div className="cp-section-title" style={{ fontSize: 14, fontWeight: 700 }}>
              🏛️ Official Bank Accounts
            </div>
            <span className="cp-pill active" style={{ fontSize: 10 }}>
              {accounts.length} ACTIVE
            </span>
          </div>
          <div style={{ fontSize: 12.5 }}>
            {accounts.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '12px 0' }}>
                No official accounts configured.
              </div>
            ) : (
              accounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--primary)' }}>{acc.bankName}</strong>
                    {acc.isDefault && (
                      <span className="cp-pill paid" style={{ fontSize: 9, marginLeft: 6 }}>
                        DEFAULT
                      </span>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {acc.accountName} &middot; Acct: <strong>{acc.accountNumber}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="cp-pill active" style={{ fontSize: 10 }}>
                      ACTIVE
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Credited Account Distribution */}
        <div className="cp-card" style={{ marginBottom: 0 }}>
          <div className="cp-card-header" style={{ marginBottom: 12 }}>
            <div className="cp-section-title" style={{ fontSize: 14, fontWeight: 700 }}>
              💰 Credited Account Distribution
            </div>
            <span className="cp-pill success" style={{ fontSize: 10 }}>
              RECEIPTS ONLY
            </span>
          </div>
          <div style={{ fontSize: 12.5 }}>
            {distribution.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '12px 0' }}>
                No external receipts credited yet.
              </div>
            ) : (
              distribution.map((dist) => (
                <div
                  key={dist.accountId}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--primary)' }}>{dist.bankName}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {dist.accountName} &middot; {dist.count} payment{dist.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--success)', fontSize: 14 }}>
                      ₦{dist.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              ))
            )}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px dashed var(--border)',
              paddingTop: 6,
            }}
          >
            <span>Total External Receipts:</span>
            <strong style={{ color: 'var(--success)' }}>
              ₦{metrics.fundsReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      </div>

      {/* Section 3 & Section 4 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Internal Transfers Ledger */}
        <div className="cp-card" style={{ marginBottom: 0 }}>
          <div className="cp-card-header" style={{ marginBottom: 12 }}>
            <div className="cp-section-title" style={{ fontSize: 14, fontWeight: 700 }}>
              🔄 Internal Account Transfers
            </div>
            <span className="cp-pill category-pill" style={{ fontSize: 10 }}>
              NON-REVENUE
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 10,
              background: '#F8FAFC',
              padding: 8,
              borderRadius: 4,
            }}
          >
            ℹ️ Internal transfers represent liquidity balancing between official accounts. They are excluded from revenue and Funds Received.
          </div>
          <div style={{ fontSize: 12, maxHeight: 260, overflowY: 'auto' }}>
            {transfers.length === 0 ? (
              <div className="cp-empty-state" style={{ color: 'var(--text-secondary)', padding: '16px 0', textAlign: 'center' }}>
                <div className="cp-empty-icon" style={{ fontSize: 24, marginBottom: 4 }}>🔄</div>
                <div className="cp-empty-title" style={{ fontSize: 13, fontWeight: 700 }}>No internal transfers recorded</div>
              </div>
            ) : (
              transfers.map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {t.fromBank} &rarr; {t.toBank}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                      Ref: {t.reference} &middot; {t.date}
                    </div>
                    {t.reason && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        &ldquo;{t.reason}&rdquo;
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: '#7C3AED', fontSize: 13 }}>
                      ₦{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bank Reconciliation Status */}
        <div className="cp-card" style={{ marginBottom: 0 }}>
          <div className="cp-card-header" style={{ marginBottom: 12 }}>
            <div className="cp-section-title" style={{ fontSize: 14, fontWeight: 700 }}>
              ⚖️ Bank Reconciliation Status
            </div>
            <span className="cp-pill active" style={{ fontSize: 10 }}>
              AUDITED LEDGER
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14, textAlign: 'center' }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                Reconciled
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', margin: '2px 0' }}>
                {metrics.reconciliation.reconciledCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                ₦{metrics.reconciliation.reconciledAmount.toLocaleString()}
              </div>
            </div>

            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>
                Unreconciled
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warning)', margin: '2px 0' }}>
                {metrics.reconciliation.unreconciledCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                ₦{metrics.reconciliation.unreconciledAmount.toLocaleString()}
              </div>
            </div>

            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                Exceptions
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)', margin: '2px 0' }}>
                {metrics.reconciliation.exceptionCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                ₦{metrics.reconciliation.exceptionAmount.toLocaleString()}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            All external client payments must be reconciled against official corporate bank account statements. Discrepancies and unmatched deposits are flagged as exceptions.
          </div>
        </div>
      </div>

      {/* Record Internal Transfer Modal */}
      {isTransferModalOpen && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 520 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">🔄 Record Internal Account Transfer</div>
              <button
                className="cp-modal-close"
                onClick={() => setIsTransferModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveTransfer}>
              <div className="cp-modal-body">
                <div
                  style={{
                    background: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 14,
                    fontSize: 11.5,
                    color: '#0369A1',
                  }}
                >
                  ℹ️ Internal transfers move cash between official Clasptek accounts. They are NOT revenue and do not increase Funds Received.
                </div>

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
                  <label>Source Account (From) *</label>
                  <select
                    value={fromAccountId}
                    onChange={(e) => setFromAccountId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Source Account --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} &mdash; {a.accountName} ({a.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cp-field">
                  <label>Destination Account (To) *</label>
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Destination Account --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} &mdash; {a.accountName} ({a.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="cp-field">
                    <label>Transfer Amount (₦) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="cp-field">
                    <label>Transfer Date *</label>
                    <input
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="cp-field">
                  <label>Bank Reference / Transfer ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. TRF/GTB/ACC/20260916"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                  />
                </div>

                <div className="cp-field">
                  <label>Transfer Purpose / Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Liquidity rebalancing to meet operational disbursements"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="cp-modal-footer">
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cp-btn accent"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Recording...' : '✔ Record Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
