'use client';

/**
 * app/payments/PaymentsPageClient.tsx — Phase 6
 * Interactive Client Component for Tuition Payments & Receipts Ledger.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState } from 'react';
import type { Payment, FinancialMetrics, PaymentMethod } from '@/types/finance';
import { downloadSafeCsv } from '@/lib/utils/csv';

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
  metrics,
}: PaymentsPageClientProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      setPayments([data.payment, ...payments]);
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

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Receipt #', 'Payment Date', 'Student / Client', 'Target Invoice', 'Payment Method', 'Transaction Ref', 'Amount Paid', 'Status'];
    const rows = filteredPayments.map(p => [
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

  // Filter payments
  const filteredPayments = payments.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.receiptDisplayNo.toLowerCase().includes(q) ||
      (p.studentName && p.studentName.toLowerCase().includes(q)) ||
      (p.invoiceDisplayNo && p.invoiceDisplayNo.toLowerCase().includes(q)) ||
      (p.reference && p.reference.toLowerCase().includes(q)) ||
      p.paymentMethod.toLowerCase().includes(q)
    );
  });

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
            <button className="cp-btn sm secondary" onClick={handleExportCSV}>
              📥 Export CSV
            </button>
            <button className="cp-btn sm accent" onClick={() => setIsRecordModalOpen(true)}>
              + Record Payment
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <input
            type="text"
            placeholder="Filter by receipt #, student, reference, or invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              maxWidth: '380px',
              width: '100%',
              padding: '7px 12px',
              fontSize: '13px',
              border: '1px solid var(--border, #cbd5e1)',
              borderRadius: '5px',
              background: '#fff',
            }}
          />
        </div>

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
          <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Receipt #</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Payment Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Student / Client</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Target Invoice</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Method</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Reference</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
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
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11.5px', color: '#64748b' }}>
                      {p.reference || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      {fmtMoney(p.amount)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#059669', background: '#ecfdf5', textTransform: 'uppercase' }}>
                        {p.reconciliationStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        className="cp-btn sm secondary"
                        onClick={() => setSelectedReceipt(p)}
                        style={{ padding: '4px 8px', fontSize: '11.5px' }}
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* OFFICIAL RECEIPT MODAL */}
      {selectedReceipt && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '500px', maxWidth: '95vw', padding: '24px', border: '1px solid #cbd5e1' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.05em', color: '#0f172a' }}>
                CLASPTEK COACHING LIMITED
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Official Tuition &amp; Service Fee Receipt
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Receipt Number</span>
                <strong style={{ fontFamily: 'monospace' }}>{selectedReceipt.receiptDisplayNo}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Date Received</span>
                <strong>{fmtDate(selectedReceipt.paymentDate)}</strong>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Received From</span>
                <strong style={{ fontSize: '15px' }}>{selectedReceipt.studentName || 'Student'}</strong>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>For Invoice</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0284c7' }}>
                  {selectedReceipt.invoiceDisplayNo || 'INV-REF'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Payment Channel</span>
                  <span>{selectedReceipt.paymentMethod}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Reference</span>
                  <span style={{ fontFamily: 'monospace' }}>{selectedReceipt.reference || 'None'}</span>
                </div>
              </div>
              <div style={{ paddingTop: '10px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Amount Confirmed:</span>
                <strong style={{ fontSize: '18px', color: '#059669' }}>
                  {fmtMoney(selectedReceipt.amount)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="cp-btn secondary sm"
                onClick={() => window.print()}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="cp-btn secondary sm"
                onClick={() => setSelectedReceipt(null)}
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
