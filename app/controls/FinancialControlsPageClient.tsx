'use client';

/**
 * app/controls/FinancialControlsPageClient.tsx
 * Client Component for Financial Controls & Governance
 * Phase 9B: Administration & Governance Module Migration
 */

import React, { useState } from 'react';
import { FinancePeriodInfo } from '@/lib/controls/queries';
import { UserRole } from '@/types/auth';

interface FinancialControlsProps {
  initialPeriod: FinancePeriodInfo;
  currentUserRole: UserRole;
}

export function FinancialControlsPageClient({
  initialPeriod,
  currentUserRole,
}: FinancialControlsProps) {
  const [periodInfo, setPeriodInfo] = useState<FinancePeriodInfo>(initialPeriod);
  const [isToggling, setIsToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = currentUserRole === 'Super Admin';
  const isLocked = periodInfo.status === 'locked';

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleToggleLock = async () => {
    if (!isSuperAdmin) return;
    setIsToggling(true);
    try {
      const res = await fetch('/api/admin/controls/period-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: periodInfo.period }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const nextStatus = data.status as 'open' | 'locked';
      setPeriodInfo((prev) => ({
        ...prev,
        status: nextStatus,
        lockedAt: nextStatus === 'locked' ? new Date().toISOString() : null,
      }));
      notify(
        'success',
        nextStatus === 'locked'
          ? `Accounting period ${periodInfo.period} is now LOCKED. Transaction modifications prohibited.`
          : `Accounting period ${periodInfo.period} has been REOPENED for transactions.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update period lock';
      notify('error', msg);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Toast */}
      {feedback && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            background: feedback.type === 'success' ? '#DEF7EC' : '#FDE8E8',
            color: feedback.type === 'success' ? '#03543F' : '#9B1C1C',
            border: `1px solid ${feedback.type === 'success' ? '#84E1BC' : '#F8B4B4'}`,
          }}
        >
          {feedback.text}
        </div>
      )}

      <div className="cp-card" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
        <div className="cp-card-header" style={{ marginBottom: '18px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔒 Financial Controls &amp; Governance
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Accounting period locks, approval threshold tiers, and transaction governance.
            </div>
          </div>
        </div>

        {/* 2-Column Controls Grid matching legacy */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {/* Card 1: Period Status */}
          <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
              Accounting Period Status ({periodInfo.period})
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Status:{' '}
              <strong style={{ color: isLocked ? 'var(--danger)' : '#059669' }}>
                {isLocked ? 'LOCKED (Modifications Prohibited)' : 'OPEN FOR TRANSACTIONS'}
              </strong>
            </div>

            {isSuperAdmin ? (
              <button
                className={`cp-btn sm ${isLocked ? 'accent' : 'danger'}`}
                onClick={handleToggleLock}
                disabled={isToggling}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '12px',
                  background: isLocked ? 'var(--accent)' : 'var(--danger)',
                  color: '#fff',
                }}
              >
                {isToggling
                  ? 'Processing...'
                  : isLocked
                  ? 'Reopen Financial Period'
                  : 'Lock Current Period'}
              </button>
            ) : (
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Period locking restricted to Super Admin.
              </div>
            )}
          </div>

          {/* Card 2: Approval Tiers */}
          <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
              Approval Tiers
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>Tier 1 (Under ₦100,000): <strong>Automatic Approval</strong></div>
              <div>Tier 2 (₦100,000 – ₦500,000): <strong>Finance Manager</strong></div>
              <div>Tier 3 (Over ₦500,000): <strong>Super Admin Only</strong></div>
            </div>
          </div>
        </div>

        {/* Financial Safety Guarantees (Section 9 Requirement) */}
        <div style={{ background: '#FAFBFD', border: '1px solid var(--border)', borderRadius: '6px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
            ⚖️ Financial Integrity &amp; Arithmetic Invariants
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div>• <strong>Invoice Balance Equation:</strong> <code>Invoice Total − Payments Applied = Outstanding Balance</code> (Zero floating discrepancies)</div>
            <div>• <strong>Payroll Pipeline:</strong> <code>Draft → Issued → Acknowledged → Approved Ready → Disbursed/Paid</code> (Zero status skipping)</div>
            <div>• <strong>Receipt Invariant:</strong> Every applied payment generates exactly 1 immutable sequential receipt.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
