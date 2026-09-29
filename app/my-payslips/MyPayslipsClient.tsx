'use client';

/**
 * app/my-payslips/MyPayslipsClient.tsx — Client component for My Confidential Payslips
 * Phase 9E: User Workspaces Migration
 * Matches exact Clasptek visual styling, card layout, and interactive modals.
 */

import React, { useState } from 'react';
import type { EmployeePayslip } from '@/types/ess';
import type { UserRole } from '@/types/auth';

interface Props {
  initialPayslips: EmployeePayslip[];
  currentRole: UserRole;
  userEmail: string;
}

export function MyPayslipsClient({ initialPayslips }: Props) {
  const [payslips, setPayslips] = useState<EmployeePayslip[]>(initialPayslips);
  const [selectedPayslip, setSelectedPayslip] = useState<EmployeePayslip | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAckModalOpen, setIsAckModalOpen] = useState(false);
  const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);
  const [ackRemarks, setAckRemarks] = useState('');
  const [queryReason, setQueryReason] = useState('Incorrect Hours/Sessions');
  const [queryComment, setQueryComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fmtMoney = (amount: number) => {
    return '₦' + Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleOpenView = (ps: EmployeePayslip) => {
    setSelectedPayslip(ps);
    setIsViewModalOpen(true);
  };

  const handleOpenAck = (ps: EmployeePayslip) => {
    setSelectedPayslip(ps);
    setAckRemarks('');
    setIsAckModalOpen(true);
  };

  const handleOpenQuery = (ps: EmployeePayslip) => {
    setSelectedPayslip(ps);
    setQueryReason('Incorrect Hours/Sessions');
    setQueryComment('');
    setIsQueryModalOpen(true);
  };

  const handleConfirmAck = async () => {
    if (!selectedPayslip) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/ess/payslips/${selectedPayslip.id}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: ackRemarks }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to acknowledge payslip');
      }

      setPayslips((prev) =>
        prev.map((p) => (p.id === selectedPayslip.id ? { ...p, status: 'acknowledged', acknowledgedAt: new Date().toISOString() } : p))
      );
      setStatusMessage({ text: `Payslip #${selectedPayslip.payslipNo} successfully acknowledged.`, type: 'success' });
      setIsAckModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error acknowledging payslip';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmQuery = async () => {
    if (!selectedPayslip) return;
    if (!queryComment.trim()) {
      setStatusMessage({ text: 'Please explain the discrepancy detail in the comment box.', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/ess/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payslipId: selectedPayslip.id,
          queryReason,
          queryComment,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit query');
      }

      setPayslips((prev) =>
        prev.map((p) =>
          p.id === selectedPayslip.id
            ? { ...p, queries: [...(p.queries || []), data.query] }
            : p
        )
      );

      setStatusMessage({ text: `Payroll query submitted to Finance Operations successfully.`, type: 'success' });
      setIsQueryModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting query';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (payslips.length === 0) return;
    const sanitize = (val: string | number) => {
      let str = String(val ?? '').replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
      return `"${str}"`;
    };

    const headers = ['Period', 'Payslip No', 'Gross Pay', 'Deductions', 'Net Pay', 'Status', 'Acknowledged At'];
    const rows = payslips.map((p) => [
      sanitize(p.payPeriod),
      sanitize(p.payslipDisplayNo),
      sanitize(p.grossPay),
      sanitize(p.totalDeductions),
      sanitize(p.netPay),
      sanitize(p.status.toUpperCase()),
      sanitize(p.acknowledgedAt || 'N/A'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `My_Payslips_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💳</span> My Confidential Payslips
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>
            Review your monthly compensation statements, verify earnings &amp; deductions, confirm acknowledgements, or print official copies.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={exportCSV}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13.5px',
            background: statusMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${statusMessage.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
            color: statusMessage.type === 'success' ? '#166534' : '#991B1B',
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Main Payslips Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {payslips.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>No payslips issued yet</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', maxWidth: '480px', margin: '4px auto 0' }}>
              When Finance issues your monthly payroll statement, it will appear here for your review and acknowledgement.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px' }}>Period</th>
                  <th style={{ padding: '12px 16px' }}>Payslip #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Gross Pay</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Deductions</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net Pay</th>
                  <th style={{ padding: '12px 16px' }}>Payroll Status</th>
                  <th style={{ padding: '12px 16px' }}>Acknowledgement</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((ps) => {
                  const hasOpenQry = ps.queries && ps.queries.some((q) => q.status === 'open' || q.status === 'under_review');
                  let statusBadge = { bg: '#F1F5F9', color: '#475569', label: ps.status.toUpperCase() };
                  if (ps.status === 'issued') statusBadge = { bg: '#E0E7FF', color: '#3730A3', label: 'ISSUED (REVIEW)' };
                  else if (ps.status === 'acknowledged') statusBadge = { bg: '#E0E7FF', color: '#1E40AF', label: 'ACKNOWLEDGED' };
                  else if (ps.status === 'approved') statusBadge = { bg: '#FEF3C7', color: '#92400E', label: 'APPROVED' };
                  else if (ps.status === 'paid') statusBadge = { bg: '#DCFCE7', color: '#15803D', label: 'PAID & DISBURSED' };
                  else if (ps.status === 'cancelled') statusBadge = { bg: '#FEE2E2', color: '#991B1B', label: 'CANCELLED' };

                  return (
                    <tr key={ps.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>{ps.payPeriod}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                        #{ps.payslipNo}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                        {fmtMoney(ps.grossPay)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                        {ps.totalDeductions > 0 ? `-${fmtMoney(ps.totalDeductions)}` : '₦0.00'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#16A34A', fontSize: '13.5px' }}>
                        {fmtMoney(ps.netPay)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {ps.acknowledgedAt ? (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#15803D' }}>
                            ✔ Acknowledged
                          </span>
                        ) : ps.status === 'issued' ? (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#FEF3C7', color: '#B45309' }}>
                            ⚠️ Action Required
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>&mdash;</span>
                        )}
                        {hasOpenQry && (
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                              ⚠️ Query Open
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenView(ps)}
                            style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 600, borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', cursor: 'pointer' }}
                          >
                            📄 View / Print
                          </button>
                          {(ps.status === 'issued' || ps.status === 'acknowledged') && (
                            <>
                              {ps.status === 'issued' && (
                                <button
                                  onClick={() => handleOpenAck(ps)}
                                  style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 600, borderRadius: '4px', border: 'none', background: '#16A34A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                  Acknowledge
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenQuery(ps)}
                                style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 600, borderRadius: '4px', border: '1px solid #FCD34D', background: '#FFFBEB', color: '#B45309', cursor: 'pointer' }}
                              >
                                Raise Query
                              </button>
                            </>
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

      {/* VIEW / PRINT PAYSLIP MODAL */}
      {isViewModalOpen && selectedPayslip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '8px', maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>CLASPTEK COACHING LIMITED</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Official Confidential Payslip Statement</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>#{selectedPayslip.payslipNo}</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Period: {selectedPayslip.payPeriod}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#F8FAFC', padding: '16px', borderRadius: '6px', marginBottom: '20px', fontSize: '12.5px' }}>
              <div>
                <div style={{ color: '#64748B', fontWeight: 600 }}>Employee Name:</div>
                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14px' }}>{selectedPayslip.employeeName}</div>
                <div style={{ marginTop: '6px', color: '#64748B', fontWeight: 600 }}>Department / Role:</div>
                <div style={{ fontWeight: 700, color: '#334155' }}>{selectedPayslip.department} &middot; {selectedPayslip.role}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontWeight: 600 }}>Disbursement Date:</div>
                <div style={{ fontWeight: 700, color: '#334155' }}>{selectedPayslip.payDate}</div>
                <div style={{ marginTop: '6px', color: '#64748B', fontWeight: 600 }}>Statement Status:</div>
                <div style={{ fontWeight: 800, color: '#16A34A' }}>{selectedPayslip.status.toUpperCase()}</div>
              </div>
            </div>

            {/* Earnings & Deductions Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Earnings</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Deductions</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>Basic Compensation</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(selectedPayslip.basicPay)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8' }}>—</td>
                </tr>
                {selectedPayslip.allowances.map((a, i) => (
                  <tr key={`al_${i}`} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '10px 12px' }}>Allowance: {a.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(a.amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8' }}>—</td>
                  </tr>
                ))}
                {selectedPayslip.deductions.map((d, i) => (
                  <tr key={`ded_${i}`} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '10px 12px' }}>Deduction: {d.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8' }}>—</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>-{fmtMoney(d.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#F8FAFC', fontWeight: 800, borderTop: '2px solid #CBD5E1' }}>
                  <td style={{ padding: '12px' }}>Totals</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#0F172A' }}>{fmtMoney(selectedPayslip.grossPay)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#DC2626' }}>{selectedPayslip.totalDeductions > 0 ? `-${fmtMoney(selectedPayslip.totalDeductions)}` : '₦0.00'}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: '6px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#166534' }}>NET DISBURSEMENT AMOUNT:</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803D' }}>{fmtMoney(selectedPayslip.netPay)}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsViewModalOpen(false)}
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', background: '#0F172A', color: '#FFFFFF', cursor: 'pointer' }}
              >
                🖨 Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACKNOWLEDGE MODAL */}
      {isAckModalOpen && selectedPayslip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>Confirm Payslip Acknowledgement</h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              You are confirming receipt and review of your compensation statement for <strong>{selectedPayslip.payPeriod}</strong> (#{selectedPayslip.payslipNo}) with net pay of <strong>{fmtMoney(selectedPayslip.netPay)}</strong>.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Optional Acknowledgement Remarks
              </label>
              <input
                type="text"
                value={ackRemarks}
                onChange={(e) => setAckRemarks(e.target.value)}
                placeholder="e.g. Reviewed and verified"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsAckModalOpen(false)}
                disabled={isSubmitting}
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAck}
                disabled={isSubmitting}
                style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', background: '#16A34A', color: '#FFFFFF', cursor: 'pointer' }}
              >
                {isSubmitting ? 'Confirming...' : 'Confirm Acknowledgement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAISE QUERY MODAL */}
      {isQueryModalOpen && selectedPayslip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '8px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>Raise Payroll Discrepancy Query</h3>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 16px 0' }}>
              Payslip #{selectedPayslip.payslipNo} ({selectedPayslip.payPeriod}) &middot; Finance Operations will review your submission.
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Query Reason</label>
              <select
                value={queryReason}
                onChange={(e) => setQueryReason(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              >
                <option value="Incorrect Hours/Sessions">Incorrect Hours / Delivered Sessions</option>
                <option value="Missing Allowance">Missing Allowance / Reimbursable Fee</option>
                <option value="Deduction Discrepancy">Deduction Discrepancy / Over-deduction</option>
                <option value="Tax Calculation Error">Tax / Pension Calculation Error</option>
                <option value="Other Discrepancy">Other Discrepancy</option>
              </select>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Detailed Explanation</label>
              <textarea
                rows={3}
                value={queryComment}
                onChange={(e) => setQueryComment(e.target.value)}
                placeholder="Describe the discrepancy clearly..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsQueryModalOpen(false)}
                disabled={isSubmitting}
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmQuery}
                disabled={isSubmitting}
                style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', background: '#D97706', color: '#FFFFFF', cursor: 'pointer' }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Query to Finance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
