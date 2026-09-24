'use client';

/**
 * app/my-queries/MyQueriesClient.tsx — Client component for My Payroll Queries
 * Phase 9E: User Workspaces Migration
 * Matches exact Clasptek query card layout, resolution banners, and new query modal.
 */

import React, { useState } from 'react';
import type { PayrollQuery, EmployeePayslip } from '@/types/ess';
import type { UserRole } from '@/types/auth';

interface Props {
  initialQueries: PayrollQuery[];
  payslips: EmployeePayslip[];
  currentRole: UserRole;
  userEmail: string;
}

export function MyQueriesClient({ initialQueries, payslips }: Props) {
  const [queries, setQueries] = useState<PayrollQuery[]>(initialQueries);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState(payslips[0]?.id || '');
  const [queryReason, setQueryReason] = useState('Incorrect Hours/Sessions');
  const [queryComment, setQueryComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const eligiblePayslips = payslips.filter((p) => p.status !== 'draft' && p.status !== 'cancelled');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayslipId || !queryComment.trim()) {
      setStatusMessage({ text: 'Please select a payslip and provide a detailed explanation.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/ess/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payslipId: selectedPayslipId,
          queryReason,
          queryComment,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit query');
      }

      setQueries((prev) => [data.query, ...prev]);
      setStatusMessage({ text: 'Query submitted to Finance Operations successfully.', type: 'success' });
      setIsModalOpen(false);
      setQueryComment('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting query';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return d;
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>❓</span> My Payroll Discrepancy Queries
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>
            Track questions and discrepancy claims submitted on your payroll statements and view finance responses.
          </p>
        </div>
        {eligiblePayslips.length > 0 && (
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              background: '#0F172A',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            + Raise New Query
          </button>
        )}
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

      {/* Main Queries Container */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px' }}>
        {queries.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>❓</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>No queries recorded</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', maxWidth: '480px', margin: '4px auto 0' }}>
              You have not raised any payroll queries. All compensation statements are in good standing.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {queries.map((q) => {
              let borderColor = '#D97706';
              let statusBg = '#FEF3C7';
              let statusColor = '#92400E';
              if (q.status === 'resolved') {
                borderColor = '#16A34A';
                statusBg = '#DCFCE7';
                statusColor = '#15803D';
              } else if (q.status === 'rejected') {
                borderColor = '#DC2626';
                statusBg = '#FEE2E2';
                statusColor = '#991B1B';
              }

              return (
                <div
                  key={q.id}
                  style={{
                    background: '#FAFBFD',
                    border: '1px solid #E2E8F0',
                    borderLeft: `4px solid ${borderColor}`,
                    borderRadius: '6px',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>
                      {q.queryReason} &middot;{' '}
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
                        Payslip #{q.payslipNo} ({q.payPeriod})
                      </span>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: statusBg, color: statusColor }}>
                      {q.status.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px', lineHeight: 1.5 }}>
                    {q.queryComment}
                  </div>

                  <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                    Submitted on {fmtDate(q.createdAt)}
                  </div>

                  {q.status === 'resolved' || q.status === 'rejected' ? (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px dashed #E2E8F0',
                        fontSize: '12.5px',
                        color: q.status === 'resolved' ? '#166534' : '#991B1B',
                      }}
                    >
                      <strong>{q.status === 'resolved' ? '✔ Resolved by Finance' : '✖ Rejected by Finance'}:</strong>{' '}
                      {q.resolutionNote || 'Reviewed by Finance Operations'}
                      {q.resolvedAt && (
                        <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '8px' }}>
                          ({fmtDate(q.resolvedAt)})
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#D97706', fontStyle: 'italic' }}>
                      ⏳ Currently under review by Finance Operations. Approval is on hold pending resolution.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RAISE QUERY MODAL */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '8px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>Raise Payroll Discrepancy Query</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Select Payslip</label>
                <select
                  value={selectedPayslipId}
                  onChange={(e) => setSelectedPayslipId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  {eligiblePayslips.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      Period: {ps.payPeriod} (#{ps.payslipNo}) &mdash; Net: ₦{Number(ps.netPay).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Discrepancy Category</label>
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
                  required
                  rows={3}
                  value={queryComment}
                  onChange={(e) => setQueryComment(e.target.value)}
                  placeholder="Describe what is missing or incorrect..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', background: '#D97706', color: '#FFFFFF', cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Query'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
