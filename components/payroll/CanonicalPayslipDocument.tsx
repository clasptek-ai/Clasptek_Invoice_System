import React from 'react';
import type { Payslip, Personnel } from '@/types/finance';
import type { FinanceSettingsData } from '@/types/settings';
import { DEFAULT_FINANCE_SETTINGS } from '@/types/settings';

export interface CanonicalPayslipDocumentProps {
  payslip: Payslip;
  personnel?: Personnel[] | null;
  financeSettings?: Partial<FinanceSettingsData> | null;
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

export const CanonicalPayslipDocument: React.FC<CanonicalPayslipDocumentProps> = ({
  payslip,
  personnel,
  financeSettings,
}) => {
  const fsCfg = {
    ...DEFAULT_FINANCE_SETTINGS,
    ...(financeSettings || {}),
  };

  const isPaid = payslip.status === 'paid';
  const hasOpenQuery =
    Boolean(payslip.queries && payslip.queries.some((q) => q.status === 'open' || q.status === 'under_review'));

  let statusLabel = '1. DRAFT (IN PREPARATION)';
  let statusClass = 'draft';
  if (payslip.status === 'issued') {
    statusLabel = '2. ISSUED — PENDING REVIEW';
    statusClass = 'new';
  } else if (payslip.status === 'acknowledged') {
    statusLabel = '3. ACKNOWLEDGED';
    statusClass = 'active';
  } else if (payslip.status === 'approved') {
    statusLabel = '4. APPROVED — AWAITING PAYMENT';
    statusClass = 'partial';
  } else if (payslip.status === 'paid') {
    statusLabel = 'PAID IN FULL';
    statusClass = 'paid';
  } else if (payslip.status === 'cancelled') {
    statusLabel = 'CANCELLED';
    statusClass = 'cancelled';
  }

  // Extract month and year from payPeriod (YYYY-MM or string)
  let periodTitle = payslip.payPeriod;
  try {
    const parts = (payslip.payPeriod || '').split('-');
    if (parts.length === 2) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      periodTitle = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
    }
  } catch {
    // fallback to original payPeriod
  }

  const earningsList = [
    { description: 'Basic Monthly Compensation', amount: payslip.basicPay },
    ...(payslip.allowances || []),
  ];

  const deductionsList =
    payslip.deductions && payslip.deductions.length
      ? payslip.deductions
      : [{ description: 'No Deductions Applied', amount: 0 }];

  const linkedPers = (personnel || []).find(
    (p) => p.id === payslip.personnelId || (payslip as unknown as Record<string, unknown>).personnel_id === p.id
  );
  const empIdDisp =
    (payslip as unknown as Record<string, unknown>).employeeId ||
    (payslip as unknown as Record<string, unknown>).employee_id ||
    linkedPers?.employeeId ||
    (linkedPers as unknown as Record<string, unknown>)?.employee_id ||
    (linkedPers as unknown as Record<string, unknown>)?.employeeNo;

  const rawDisplayNo =
    payslip.payslipDisplayNo ||
    (payslip as unknown as Record<string, unknown>).payslip_display_no ||
    (payslip.payslipNo ? `PSL-${payslip.payslipNo}` : 'PSL-DRAFT');
  const displayNoFormatted = String(rawDisplayNo).startsWith('#')
    ? String(rawDisplayNo).slice(1)
    : String(rawDisplayNo);

  return (
    <div className="cp-doc-paper" id={`canonical-payslip-${payslip.id}`}>
      {/* 1. Header: Logo on Left, Company Info on Right */}
      <div className="cp-doc-header">
        <div className="cp-doc-brand">
          <img src="/assets/clasptek_logo.png" alt="Clasptek" className="cp-doc-logo" />
        </div>
        <div className="cp-doc-company-block">
          <div className="cp-doc-company-title">{fsCfg.companyName}</div>
          <div className="cp-doc-company-meta">
            {fsCfg.address}
            <br />
            Phone: {fsCfg.phone} &middot; Email: {fsCfg.email}
            <br />
            {fsCfg.taxId ? `TIN: ${fsCfg.taxId} · ` : ''}
            {fsCfg.registrationNumber ? `RC: ${fsCfg.registrationNumber} · ` : ''}
            Web: {fsCfg.website}
          </div>
        </div>
      </div>

      {/* 2. Payslip Title & Meta Row */}
      <div className="cp-doc-title-row">
        <div>
          <h1 className="cp-doc-main-title">PAYSLIP</h1>
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--primary, #14213D)',
              marginTop: '2px',
            }}
          >
            FOR THE PERIOD OF {periodTitle}
          </div>
          <div className="cp-doc-no" style={{ marginTop: '2px' }}>
            Payslip No: #{displayNoFormatted}
          </div>
        </div>
        <div className="cp-doc-badge-col">
          <span className={`cp-pill ${statusClass}`} style={{ fontSize: '11px', padding: '3px 10px' }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* 3. Personnel & Payroll Schedule Grid */}
      <div className="cp-doc-meta-grid">
        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">EMPLOYEE / BENEFICIARY INFORMATION</div>
          <div className="cp-doc-client-name">{payslip.employeeName}</div>
          {empIdDisp ? (
            <div className="cp-doc-meta-line">
              Personnel ID:{' '}
              <strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                {String(empIdDisp)}
              </strong>
            </div>
          ) : null}
          <div className="cp-doc-meta-line">
            Designation / Role: <strong>{payslip.role}</strong>
          </div>
          <div className="cp-doc-meta-line">
            Department: <strong>{payslip.department}</strong>
          </div>
          <div className="cp-doc-meta-line">
            Classification: <strong>{(payslip.employeeType || 'Staff').toUpperCase()}</strong>
          </div>
        </div>
        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">PAYROLL SCHEDULE</div>
          <div className="cp-doc-meta-row">
            <span>Pay Period:</span>
            <strong>{payslip.payPeriod}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Target Pay Date:</span>
            <strong>{fmtDate(payslip.payDate)}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Payment Mode:</span>
            <strong>{payslip.paymentMethod || 'Bank Transfer'}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Gross Earnings:</span>
            <strong>{fmtMoney(payslip.grossPay)}</strong>
          </div>
        </div>
      </div>

      {/* 4. SIDE-BY-SIDE: EARNINGS (LEFT) + DEDUCTIONS (RIGHT) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px',
          marginBottom: '12px',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        {/* Left Column: Earnings Table */}
        <div className="cp-doc-table-wrap" style={{ margin: 0 }}>
          <div
            style={{
              background: 'var(--primary, #14213D)',
              color: '#FFFFFF',
              fontSize: '10.5px',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '6px 10px',
              letterSpacing: '0.4px',
            }}
          >
            1. EARNINGS &amp; ALLOWANCES
          </div>
          <table className="cp-doc-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right', width: '100px' }}>Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              {earningsList.map((e, idx) => (
                <tr key={idx}>
                  <td>{e.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                </tr>
              ))}
              <tr
                style={{
                  background: '#FAFBFD',
                  fontWeight: 800,
                  borderTop: '1.5px solid var(--primary, #14213D)',
                }}
              >
                <td>GROSS EARNINGS:</td>
                <td style={{ textAlign: 'right', color: 'var(--primary, #14213D)' }}>
                  {fmtMoney(payslip.grossPay)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Column: Deductions Table */}
        <div className="cp-doc-table-wrap" style={{ margin: 0 }}>
          <div
            style={{
              background: '#B91C1C',
              color: '#FFFFFF',
              fontSize: '10.5px',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '6px 10px',
              letterSpacing: '0.4px',
            }}
          >
            2. STATUTORY &amp; DEDUCTIONS
          </div>
          <table className="cp-doc-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right', width: '100px' }}>Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              {deductionsList.map((d, idx) => (
                <tr key={idx}>
                  <td>{d.description}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger, #DC2626)' }}>
                    {Number(d.amount) > 0 ? `-${fmtMoney(d.amount)}` : '₦0.00'}
                  </td>
                </tr>
              ))}
              <tr
                style={{
                  background: '#FAFBFD',
                  fontWeight: 800,
                  borderTop: '1.5px solid var(--danger, #DC2626)',
                }}
              >
                <td>TOTAL DEDUCTIONS:</td>
                <td style={{ textAlign: 'right', color: 'var(--danger, #DC2626)' }}>
                  {payslip.totalDeductions > 0 ? `-${fmtMoney(payslip.totalDeductions)}` : '₦0.00'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Net Pay Highlight Banner */}
      <div
        style={{
          background: '#F0FDF4',
          border: '1.5px solid var(--success, #16A34A)',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              color: 'var(--success, #16A34A)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            NET COMPENSATION PAYABLE
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #64748B)', marginTop: '1px' }}>
            Gross: <strong>{fmtMoney(payslip.grossPay)}</strong> &middot; Deductions:{' '}
            <strong style={{ color: 'var(--danger, #DC2626)' }}>
              {payslip.totalDeductions > 0 ? `-${fmtMoney(payslip.totalDeductions)}` : '₦0.00'}
            </strong>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              color: 'var(--text-muted, #94A3B8)',
              textTransform: 'uppercase',
            }}
          >
            NET PAY
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 900,
              color: 'var(--success, #16A34A)',
              lineHeight: 1.1,
            }}
          >
            {fmtMoney(payslip.netPay)}
          </div>
        </div>
      </div>

      {/* 6. Employee Acknowledgement & Dual Signatures (Side-by-Side) */}
      <div
        style={{
          background: '#FAFBFD',
          border: '1px solid var(--border, #E2E8F0)',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '10px 14px',
          marginBottom: '10px',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <div className="cp-doc-section-label" style={{ marginBottom: '3px' }}>
          EMPLOYEE / FACILITATOR ACKNOWLEDGEMENT
        </div>
        <p
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary, #64748B)',
            fontStyle: 'italic',
            marginBottom: '8px',
            lineHeight: 1.35,
          }}
        >
          &ldquo;I acknowledge that I have reviewed the earnings and deductions stated on this payslip.&rdquo;
        </p>

        {payslip.acknowledgedAt ? (
          <div
            style={{
              background: '#ECFDF5',
              border: '1px solid #10B981',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '5px 10px',
              fontSize: '11px',
              color: '#065F46',
              marginBottom: '8px',
            }}
          >
            ✔ <strong>Digital Acknowledgement Captured:</strong> Confirmed by{' '}
            <strong>{payslip.acknowledgedBy || payslip.employeeName}</strong> on{' '}
            {new Date(payslip.acknowledgedAt).toLocaleString('en-GB')} via{' '}
            <em>{payslip.acknowledgementMethod || 'Portal Confirmation'}</em>.
          </div>
        ) : (
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94A3B8)', marginBottom: '8px' }}>
            Status: <em>Pending Employee Review &amp; Acknowledgement</em>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            paddingTop: '8px',
            borderTop: '1px dashed var(--border, #E2E8F0)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #94A3B8)',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}
            >
              Employee / Facilitator Signature:
            </div>
            <div style={{ borderBottom: '1px solid var(--text-primary, #0F172A)', width: '85%', height: '1px' }} />
            <div style={{ fontSize: '10px', color: 'var(--text-muted, #94A3B8)', marginTop: '3px' }}>
              Date: ________________________
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #94A3B8)',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}
            >
              Authorized Finance Officer:
            </div>
            <div style={{ borderBottom: '1px solid var(--text-primary, #0F172A)', width: '85%', height: '1px' }} />
            <div style={{ fontSize: '10px', color: 'var(--text-muted, #94A3B8)', marginTop: '3px' }}>
              Date: ________________________
            </div>
          </div>
        </div>
      </div>

      {/* 7. Actual Disbursement Details (Shown ONLY when status is PAID) */}
      {isPaid && (
        <div
          className="cp-doc-box"
          style={{
            borderLeftColor: 'var(--success, #16A34A)',
            background: '#F0FDF4',
            marginBottom: '10px',
            padding: '8px 12px',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
          }}
        >
          <div
            className="cp-doc-section-label"
            style={{ color: 'var(--success, #16A34A)', fontWeight: 800, marginBottom: '3px' }}
          >
            DISBURSEMENT CONFIRMATION (PAID)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11.5px' }}>
            <div>
              <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Payment Date:</span>{' '}
              <strong>{fmtDate(payslip.actualPaymentDate || payslip.payDate)}</strong> &middot;{' '}
              <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Method:</span>{' '}
              <strong>{payslip.paymentMethod || 'Bank Transfer'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Ref:</span>{' '}
              <strong style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary, #14213D)' }}>
                {payslip.paymentReference || 'N/A'}
              </strong>{' '}
              &middot; <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Officer:</span>{' '}
              <strong>{payslip.paidBy || 'Finance Operations'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* 8. Active Query Alert on Document (if any) */}
      {hasOpenQuery && (
        <div
          style={{
            background: '#FFFBEB',
            border: '1px solid var(--warning, #F59E0B)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '8px 12px',
            fontSize: '11px',
            color: '#92400E',
            marginBottom: '10px',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
          }}
        >
          ⚠️ <strong>Under Query:</strong> A payroll discrepancy query was raised on this statement and is
          currently under review by Finance Operations.
        </div>
      )}

      {/* 9. Compact Single-Line Footer */}
      <div
        className="cp-doc-footer"
        style={{ marginTop: '8px', paddingTop: '6px', pageBreakInside: 'avoid', breakInside: 'avoid' }}
      >
        <div className="cp-doc-footer-main">
          Official Confidential Payroll Statement &middot; Clasptek Coaching Limited
        </div>
        <div className="cp-doc-footer-sub">
          {fsCfg.website} &middot; {fsCfg.email} &middot; {fsCfg.phone}
        </div>
      </div>
    </div>
  );
};
