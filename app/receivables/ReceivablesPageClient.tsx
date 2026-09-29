'use client';

/**
 * app/receivables/ReceivablesPageClient.tsx
 * Client Component for Receivables & Collections Management
 * Phase 9C: Finance Completion & Financial Operations Migration
 */

import React, { useState, useMemo } from 'react';
import { Invoice, ReceivablesAgeingBuckets, CollectionPriority, CollectionNote } from '@/types/finance';
import { UserRole } from '@/types/auth';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';

interface ReceivablesClientProps {
  initialBuckets: ReceivablesAgeingBuckets;
  initialInvoices: Array<
    Invoice & {
      balanceAmount: number;
      paidAmount: number;
      daysOverdue: number;
      priority: CollectionPriority;
    }
  >;
  currentUserRole: UserRole;
}

export function ReceivablesPageClient({
  initialBuckets,
  initialInvoices,
  currentUserRole,
}: ReceivablesClientProps) {
  const [invoices] = useState(initialInvoices);
  const [buckets] = useState<ReceivablesAgeingBuckets>(initialBuckets);
  const [search, setSearch] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notes Modal state
  const [activeInvoice, setActiveInvoice] = useState<
    (Invoice & { balanceAmount: number; paidAmount: number; daysOverdue: number; priority: CollectionPriority }) | null
  >(null);
  const [notesList, setNotesList] = useState<CollectionNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  const canRecordNote = ['Super Admin', 'Finance Manager', 'Finance Staff'].includes(currentUserRole);

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const numMatch = String(inv.invoiceNo).includes(q) || (inv.invoiceDisplayNo || '').toLowerCase().includes(q);
        const nameMatch = (inv.studentName || '').toLowerCase().includes(q);
        const phoneMatch = (inv.studentPhone || '').toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !phoneMatch) return false;
      }
      if (selectedBucket) {
        if (selectedBucket === 'current' && inv.daysOverdue > 0) return false;
        if (selectedBucket === '1-30' && (inv.daysOverdue < 1 || inv.daysOverdue > 30)) return false;
        if (selectedBucket === '31-60' && (inv.daysOverdue < 31 || inv.daysOverdue > 60)) return false;
        if (selectedBucket === '61-90' && (inv.daysOverdue < 61 || inv.daysOverdue > 90)) return false;
        if (selectedBucket === '90plus' && inv.daysOverdue <= 90) return false;
      }
      return true;
    });
  }, [invoices, search, selectedBucket]);

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedInvoices,
    setPage,
    setPageSize,
  } = usePagination(filteredInvoices, {
    initialPageSize: 25,
    resetDeps: [search, selectedBucket],
  });

  const handleExportCsv = () => {
    const headers = [
      'Invoice #',
      'Due Date',
      'Student Name',
      'Phone',
      'Total Amount',
      'Paid Amount',
      'Balance Due',
      'Days Overdue',
      'Priority',
      'Priority Score',
      'Recommended Action',
    ];
    const rows = filteredInvoices.map((inv) => [
      inv.invoiceDisplayNo || String(inv.invoiceNo),
      inv.dueDate,
      inv.studentName,
      inv.studentPhone || '',
      String(inv.totalAmount),
      String(inv.paidAmount),
      String(inv.balanceAmount),
      String(inv.daysOverdue),
      inv.priority.priority,
      String(inv.priority.score),
      inv.priority.recommendedAction,
    ]);
    downloadSafeCsv('Outstanding_Receivables', headers, rows);
    notify('success', 'Receivables ledger exported safely to CSV.');
  };

  const handleOpenNotes = async (
    inv: Invoice & { balanceAmount: number; paidAmount: number; daysOverdue: number; priority: CollectionPriority }
  ) => {
    setActiveInvoice(inv);
    setIsLoadingNotes(true);
    setNewNoteText('');
    setPromisedDate('');

    try {
      const res = await fetch(`/api/finance/receivables/notes?invoiceId=${inv.id}`);
      const data = await res.json();
      if (data.success) {
        setNotesList(data.notes || []);
      }
    } catch {
      notify('error', 'Failed to fetch collection notes');
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice || !newNoteText.trim()) return;

    setIsSubmittingNote(true);
    try {
      const res = await fetch('/api/finance/receivables/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: activeInvoice.id,
          note: newNoteText.trim(),
          promisedDate: promisedDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add note');

      setNotesList((prev) => [data.note, ...prev]);
      setNewNoteText('');
      setPromisedDate('');
      notify('success', 'Collection note recorded successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding note';
      notify('error', msg);
    } finally {
      setIsSubmittingNote(false);
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

      {/* Top Receivables Ageing Buckets Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div className="cp-kpi-card" style={{ padding: '10px 12px', borderLeft: '3.5px solid #10B981' }}>
          <div className="cp-kpi-label">Current (Due)</div>
          <div className="cp-kpi-value" style={{ fontSize: 16, color: '#10B981' }}>
            ₦{buckets.current.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{buckets.current.count} invoices</div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '10px 12px', borderLeft: '3.5px solid #3B82F6' }}>
          <div className="cp-kpi-label">1–30 Days Overdue</div>
          <div className="cp-kpi-value" style={{ fontSize: 16, color: '#3B82F6' }}>
            ₦{buckets.days1to30.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{buckets.days1to30.count} invoices</div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '10px 12px', borderLeft: '3.5px solid #F59E0B' }}>
          <div className="cp-kpi-label">31–60 Days Overdue</div>
          <div className="cp-kpi-value" style={{ fontSize: 16, color: '#F59E0B' }}>
            ₦{buckets.days31to60.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{buckets.days31to60.count} invoices</div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '10px 12px', borderLeft: '3.5px solid #F97316' }}>
          <div className="cp-kpi-label">61–90 Days Overdue</div>
          <div className="cp-kpi-value" style={{ fontSize: 16, color: '#F97316' }}>
            ₦{buckets.days61to90.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{buckets.days61to90.count} invoices</div>
        </div>

        <div className="cp-kpi-card" style={{ padding: '10px 12px', borderLeft: '3.5px solid #EF4444' }}>
          <div className="cp-kpi-label">90+ Days (Critical)</div>
          <div className="cp-kpi-value" style={{ fontSize: 16, color: '#EF4444' }}>
            ₦{buckets.days90Plus.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{buckets.days90Plus.count} invoices</div>
        </div>
      </div>

      {/* Main Receivables Card */}
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
              ⏳ Receivables &amp; Collections Management
            </div>
            <div className="cp-section-desc" style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              Track overdue tuition balances, prioritized by automated risk score and collection recommendation.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cp-btn sm secondary" onClick={handleExportCsv} id="btnExportReceivables">
              📥 Export Receivables CSV
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '14px 0', alignItems: 'center' }}>
          <div className="cp-field" style={{ maxWidth: 320, marginBottom: 0, flex: 1 }}>
            <input
              type="text"
              placeholder="Search by student name, phone, or invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="receivablesSearchInput"
            />
          </div>
          <div className="cp-field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <select
              value={selectedBucket}
              onChange={(e) => setSelectedBucket(e.target.value)}
              id="receivablesBucketFilter"
            >
              <option value="">All Ageing Buckets</option>
              <option value="current">Current (Due)</option>
              <option value="1-30">1–30 Days Overdue</option>
              <option value="31-60">31–60 Days Overdue</option>
              <option value="61-90">61–90 Days Overdue</option>
              <option value="90plus">90+ Days (Critical)</option>
            </select>
          </div>
        </div>

        {/* Table / Empty State */}
        {filteredInvoices.length === 0 ? (
          <div className="cp-empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div className="cp-empty-icon" style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div className="cp-empty-title" style={{ fontWeight: 700, fontSize: 16 }}>No overdue accounts</div>
            <div className="cp-empty-desc" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              All student and client accounts matching your criteria are up to date.
            </div>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Due Date</th>
                    <th>Student Name</th>
                    <th className="cp-col-secondary">Phone</th>
                    <th className="cp-col-secondary" style={{ textAlign: 'right' }}>Total</th>
                    <th className="cp-col-secondary" style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Outstanding Due</th>
                    <th>Ageing</th>
                    <th className="cp-col-tertiary">Priority Score</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        #{inv.invoiceNo}
                      </td>
                      <td
                        style={{
                          color: inv.priority.priority === 'CRITICAL' ? 'var(--danger)' : 'inherit',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {inv.dueDate}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {inv.studentName}
                        {inv.studentPhone && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {inv.studentPhone}
                          </div>
                        )}
                      </td>
                      <td className="cp-col-secondary">{inv.studentPhone || 'N/A'}</td>
                      <td className="cp-col-secondary" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        ₦{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="cp-col-secondary" style={{ textAlign: 'right', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                        ₦{inv.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--warning)', whiteSpace: 'nowrap' }}>
                        ₦{inv.balanceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {inv.daysOverdue <= 0 ? 'Current' : `${inv.daysOverdue}d overdue`}
                      </td>
                      <td className="cp-col-tertiary">
                        <span
                          className={`cp-pill ${
                            inv.priority.priority === 'CRITICAL'
                              ? 'danger'
                              : inv.priority.priority === 'HIGH'
                              ? 'pending'
                              : inv.priority.priority === 'MEDIUM'
                              ? 'category-pill'
                              : 'active'
                          }`}
                        >
                          {inv.priority.priority} ({inv.priority.score}pts)
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          className="cp-btn sm secondary"
                          onClick={() => handleOpenNotes(inv)}
                          title="View / Add Collection Notes"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          📝 Notes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Stack */}
            <div className="cp-cards-mobile">
              {paginatedInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="cp-mobile-record-card"
                  onClick={() => handleOpenNotes(inv)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleOpenNotes(inv)}
                  aria-label={`View receivables notes for #${inv.invoiceNo}`}
                >
                  <div className="cp-mobile-record-header">
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {inv.studentName}
                      </h4>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Due: {inv.dueDate} &bull; {inv.daysOverdue <= 0 ? 'Current' : `${inv.daysOverdue}d overdue`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: '11px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        #{inv.invoiceNo}
                      </span>
                      <span
                        className={`cp-pill ${
                          inv.priority.priority === 'CRITICAL'
                            ? 'danger'
                            : inv.priority.priority === 'HIGH'
                            ? 'pending'
                            : inv.priority.priority === 'MEDIUM'
                            ? 'category-pill'
                            : 'active'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {inv.priority.priority}
                      </span>
                    </div>
                  </div>

                  <div className="cp-mobile-record-grid">
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Outstanding Due</span>
                      <span className="cp-mobile-record-value" style={{ color: 'var(--warning)', fontSize: '14px', fontWeight: 800 }}>
                        ₦{inv.balanceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Total Invoiced</span>
                      <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                        ₦{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Paid Amount</span>
                      <span className="cp-mobile-record-value" style={{ color: 'var(--success)', fontWeight: 600 }}>
                        ₦{inv.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="cp-mobile-record-field">
                      <span className="cp-mobile-record-label">Contact</span>
                      <span className="cp-mobile-record-value" style={{ fontWeight: 400 }}>
                        {inv.studentPhone || 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="cp-mobile-record-actions">
                    <button
                      type="button"
                      className="cp-btn sm secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNotes(inv);
                      }}
                      style={{ padding: '4px 12px', fontSize: '11.5px', fontWeight: 600 }}
                    >
                      📝 Collection Notes
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Standard Pagination */}
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalRecords={filteredInvoices.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              entityLabel="receivables"
            />
          </>
        )}
      </div>

      {/* Collection Notes Modal */}
      {activeInvoice && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 540 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">
                📝 Collection Notes &amp; Follow-up &middot; #{activeInvoice.invoiceNo}
              </div>
              <button
                className="cp-modal-close"
                onClick={() => setActiveInvoice(null)}
              >
                &times;
              </button>
            </div>
            <div className="cp-modal-body">
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Student: <strong>{activeInvoice.studentName}</strong></span>
                  <span>Balance Due: <strong style={{ color: 'var(--warning)' }}>₦{activeInvoice.balanceAmount.toLocaleString()}</strong></span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Recommended Action: <strong>{activeInvoice.priority.recommendedAction}</strong> ({activeInvoice.priority.actionType})
                </div>
              </div>

              {canRecordNote && (
                <form onSubmit={handleAddNote} style={{ marginBottom: 16 }}>
                  <div className="cp-field">
                    <label>Log Follow-up Call / Communication Note *</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Spoke with student. Promised to transfer balance on Friday."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <div className="cp-field" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Promised Payment Date (Optional)</label>
                      <input
                        type="date"
                        value={promisedDate}
                        onChange={(e) => setPromisedDate(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="cp-btn accent sm"
                      disabled={isSubmittingNote}
                      style={{ height: 38 }}
                    >
                      {isSubmittingNote ? 'Saving...' : '+ Add Note'}
                    </button>
                  </div>
                </form>
              )}

              {/* Existing Notes Timeline */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--primary)' }}>
                Activity History
              </div>
              {isLoadingNotes ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                  Loading notes...
                </div>
              ) : notesList.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '10px 0' }}>
                  No collection notes recorded yet for this invoice.
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {notesList.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--border)',
                        background: '#FAFBFD',
                        borderRadius: 4,
                        marginBottom: 6,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{n.note}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Logged: {n.createdAt.slice(0, 16).replace('T', ' ')}</span>
                        {n.promisedDate && <span>Promised Date: <strong>{n.promisedDate}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="cp-modal-footer">
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setActiveInvoice(null)}
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
