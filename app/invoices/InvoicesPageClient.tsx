'use client';

/**
 * app/invoices/InvoicesPageClient.tsx — Phase 6
 * Interactive Client Component for Invoices & Tuition Billing.
 * Faithful reproduction of legacy Clasptek UI, design tokens (.cp-*), and workflows.
 */

import React, { useState } from 'react';
import type { Invoice, Customer, FinancialMetrics } from '@/types/finance';
import { downloadSafeCsv } from '@/lib/utils/csv';

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
}: InvoicesPageClientProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Invoice Form State
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newProgrammeId, setNewProgrammeId] = useState(programmes[0]?.id || '');
  const [newPaymentPlan, setNewPaymentPlan] = useState<'full' | 'installment'>('installment');
  const [newBasePrice, setNewBasePrice] = useState(programmes[0]?.tuitionFee || 150000);
  const [newDiscountAmount, setNewDiscountAmount] = useState(0);
  const [newDueDate, setNewDueDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When programme changes in create modal, update default tuition fee
  const handleProgrammeChange = (progId: string) => {
    setNewProgrammeId(progId);
    const prog = programmes.find(p => p.id === progId);
    if (prog) {
      setNewBasePrice(prog.tuitionFee);
    }
  };

  // Pre-fill from existing customer
  const handleCustomerSelect = (custName: string) => {
    const cust = customers.find(c => c.name === custName);
    if (cust) {
      setNewClientName(cust.name);
      if (cust.email) setNewClientEmail(cust.email);
      if (cust.phone) setNewClientPhone(cust.phone);
    }
  };

  // Submit new invoice
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newProgrammeId) {
      setFeedbackMsg({ type: 'error', text: 'Student/Client Name and Programme are required.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: newClientName,
          studentEmail: newClientEmail || undefined,
          studentPhone: newClientPhone || undefined,
          programmeId: newProgrammeId,
          paymentPlan: newPaymentPlan,
          basePrice: newBasePrice,
          discountAmount: newDiscountAmount,
          dueDate: newDueDate,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      setInvoices([data.invoice, ...invoices]);
      setIsCreateModalOpen(false);
      setNewClientName('');
      setNewClientEmail('');
      setNewClientPhone('');
      setNewDiscountAmount(0);
      setFeedbackMsg({ type: 'success', text: `Invoice ${data.invoice.invoiceDisplayNo} created successfully!` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const calculatedTotal = Math.max(0, newBasePrice - newDiscountAmount);

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
          <div className="cp-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Invoice #</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Issue Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Due Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Student / Client</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Programme</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'right' }}>Balance</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary, #475569)', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
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
                    <tr
                      key={inv.id}
                      style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>
                        {inv.invoiceDisplayNo}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary, #475569)' }}>
                        {fmtDate(inv.invoiceDate)}
                      </td>
                      <td style={{ padding: '10px 14px', color: isOverdue ? 'var(--danger, #dc2626)' : 'var(--text-secondary, #475569)' }}>
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
                      <td style={{ padding: '10px 14px', color: 'var(--primary, #0284c7)', fontWeight: 500 }}>
                        {inv.programmeName}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {fmtMoney(inv.totalAmount)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--success, #059669)', fontWeight: 600 }}>
                        {fmtMoney(inv.paidAmount || 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? '#d97706' : '#059669' }}>
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
                              onClick={() => handleCancelInvoice(inv.id)}
                              style={{ padding: '4px 8px', fontSize: '11.5px', color: '#dc2626' }}
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
        )}
      </div>

      {/* CREATE INVOICE MODAL */}
      {isCreateModalOpen && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '600px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                📄 Create Professional Tuition Invoice
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateInvoice}>
              {/* Optional Existing Customer Select */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Select Existing Customer (Optional)
                </label>
                <select
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  <option value="">-- Choose existing client or enter new below --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Student Name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Student / Client Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samuel Adebayo"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              {/* Email & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="08031234567"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Programme Select */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Academic Programme *
                </label>
                <select
                  required
                  value={newProgrammeId}
                  onChange={(e) => handleProgrammeChange(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — {fmtMoney(p.tuitionFee)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Plan & Due Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Plan
                  </label>
                  <select
                    value={newPaymentPlan}
                    onChange={(e) => setNewPaymentPlan(e.target.value as 'full' | 'installment')}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  >
                    <option value="installment">Installment (60% / 40%)</option>
                    <option value="full">Full Payment Upfront</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                      Base Tuition Fee (₦)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={newBasePrice}
                      onChange={(e) => setNewBasePrice(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                      Scholarship / Discount (₦)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newDiscountAmount}
                      onChange={(e) => setNewDiscountAmount(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Net Total Due:</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary, #0284c7)' }}>
                    {fmtMoney(calculatedTotal)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-btn secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="cp-btn accent"
                >
                  {isSubmitting ? 'Generating Invoice...' : 'Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE DETAILS DRAWER */}
      {selectedInvoice && (
        <div className="cp-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="cp-modal" style={{ background: '#fff', borderRadius: '8px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Invoice {selectedInvoice.invoiceDisplayNo}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Issued: {fmtDate(selectedInvoice.invoiceDate)} &bull; Due: {fmtDate(selectedInvoice.dueDate)}
                </div>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Student Name</span>
                <strong>{selectedInvoice.studentName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Contact</span>
                <span>{selectedInvoice.studentPhone || selectedInvoice.studentEmail || 'N/A'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Programme</span>
                <span>{selectedInvoice.programmeName}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Payment Plan</span>
                <span style={{ textTransform: 'capitalize' }}>{selectedInvoice.paymentPlan}</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>Total Invoice Amount:</span>
                <strong>{fmtMoney(selectedInvoice.totalAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#059669' }}>Total Paid To Date:</span>
                <strong style={{ color: '#059669' }}>{fmtMoney(selectedInvoice.paidAmount || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                <span style={{ fontWeight: 600 }}>Remaining Balance:</span>
                <strong style={{ color: (selectedInvoice.balanceAmount || 0) > 0 ? '#d97706' : '#059669', fontSize: '15px' }}>
                  {fmtMoney(selectedInvoice.balanceAmount || 0)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Status: </span>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '12px' }}>
                  {selectedInvoice.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-btn secondary sm"
                  onClick={() => window.print()}
                >
                  🖨️ Print
                </button>
                <button
                  type="button"
                  className="cp-btn secondary sm"
                  onClick={() => setSelectedInvoice(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
