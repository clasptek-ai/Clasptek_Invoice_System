import React from 'react';
import type { Payment, Invoice } from '@/types/finance';
import type { FinanceSettingsData } from '@/types/settings';
import { DEFAULT_FINANCE_SETTINGS } from '@/types/settings';


export interface CanonicalReceiptDocumentProps {
  payment: Payment;
  invoice?: Invoice | null;
  financeSettings?: Partial<FinanceSettingsData> | null;
  studentNumber?: string | null;
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

export const CanonicalReceiptDocument: React.FC<CanonicalReceiptDocumentProps> = ({
  payment,
  invoice,
  financeSettings,
  studentNumber,
}) => {
  const fsCfg = {
    ...DEFAULT_FINANCE_SETTINGS,
    ...(financeSettings || {}),
  };

  const resolvedStudentName =
    payment?.studentName ||
    invoice?.studentName ||
    'Student Name Unavailable';

  const programmeName = invoice?.programmeName || 'Educational Training';
  const clientPhone = invoice?.studentPhone || '';
  const clientEmail = invoice?.studentEmail || '';

  const receiptDisplayNo =
    payment?.receiptDisplayNo ||
    (payment?.receiptNo ? `RCP-${payment.receiptNo}` : 'N/A');
  const receiptDisplayNoFormatted = receiptDisplayNo.startsWith('#')
    ? receiptDisplayNo.slice(1)
    : receiptDisplayNo;

  const invoiceDisplayNo =
    invoice?.invoiceDisplayNo ||
    payment?.invoiceDisplayNo ||
    (invoice?.invoiceNo ? `#INV-${invoice.invoiceNo}` : 'N/A');

  const total = invoice?.totalAmount !== undefined ? Number(invoice.totalAmount) : Number(payment?.amount || 0);
  const paid = invoice?.paidAmount !== undefined ? Number(invoice.paidAmount) : Number(payment?.amount || 0);
  const balance = invoice?.balanceAmount !== undefined ? Number(invoice.balanceAmount) : Math.max(0, total - paid);

  const paymentMethod = payment?.paymentMethod || 'Bank Transfer';
  const paymentReference = payment?.reference || 'N/A';

  return (
    <div className="cp-doc-paper" id={`canonical-receipt-${payment?.id || 'doc'}`}>
      {/* 1. Header: Clasptek Logo on Left, Company Contact on Right */}
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
          </div>
        </div>
      </div>

      {/* 2. Official Receipt Title & Badge Row */}
      <div className="cp-doc-title-row">
        <div>
          <h1 className="cp-doc-main-title">OFFICIAL RECEIPT</h1>
          <div className="cp-doc-no">Receipt No: #{receiptDisplayNoFormatted}</div>
        </div>
        <div className="cp-doc-badge-col">
          <span className="cp-pill paid" style={{ fontSize: '11px', padding: '3px 10px' }}>
            PAYMENT CONFIRMED
          </span>
        </div>
      </div>

      {/* 3. Two-Column Meta Grid */}
      <div className="cp-doc-meta-grid">
        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">RECEIVED FROM</div>
          <div className="cp-doc-client-name">{resolvedStudentName}</div>
          {studentNumber ? (
            <div className="cp-doc-meta-line">
              Student ID: <strong>{studentNumber}</strong>
            </div>
          ) : null}
          <div className="cp-doc-meta-line">
            Programme: <strong>{programmeName}</strong>
          </div>
          {clientPhone ? (
            <div className="cp-doc-meta-line">
              Phone: <strong>{clientPhone}</strong>
            </div>
          ) : null}
          {clientEmail ? (
            <div className="cp-doc-meta-line">
              Email: <strong>{clientEmail}</strong>
            </div>
          ) : null}
        </div>

        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">PAYMENT DETAILS</div>
          <div className="cp-doc-meta-row">
            <span>Payment Date:</span>
            <strong>{fmtDate(payment?.paymentDate)}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Payment Method:</span>
            <strong>{paymentMethod}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Transaction Ref:</span>
            <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{paymentReference}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Target Invoice:</span>
            <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{invoiceDisplayNo}</strong>
          </div>
        </div>
      </div>

      {/* 4. Amount Received Banner */}
      <div className="cp-receipt-amount-box" style={{ marginBottom: '12px', padding: '12px 16px' }}>
        <div>
          <div className="cp-doc-section-label" style={{ color: '#15803D' }}>
            AMOUNT RECEIVED
          </div>
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--primary, #14213D)', marginTop: '2px' }}>
            Tuition &amp; Educational Service Settlement
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cp-receipt-amount" style={{ fontSize: '22px' }}>
            {fmtMoney(payment?.amount || 0)}
          </div>
        </div>
      </div>

      {/* 5. Account Position Box */}
      <div className="cp-doc-box" style={{ marginBottom: '12px' }}>
        <div className="cp-doc-section-label">ACCOUNT POSITION AFTER PAYMENT</div>
        <div className="cp-doc-meta-row">
          <span>Total Invoiced:</span>
          <strong>{fmtMoney(total)}</strong>
        </div>
        <div className="cp-doc-meta-row">
          <span>Total Paid to Date:</span>
          <strong style={{ color: 'var(--success, #059669)' }}>{fmtMoney(paid)}</strong>
        </div>
        <div
          className="cp-doc-meta-row balance-row"
          style={{ borderTop: '1px dashed var(--border, #E2E8F0)', paddingTop: '5px', marginTop: '3px' }}
        >
          <span>Remaining Balance:</span>
          <strong>{fmtMoney(balance)}</strong>
        </div>
      </div>

      {/* 6. Footer */}
      <div className="cp-doc-footer" style={{ marginTop: '10px', paddingTop: '8px' }}>
        <div className="cp-doc-footer-main">Thank you for choosing Clasptek.</div>
        <div className="cp-doc-footer-sub">
          {fsCfg.website} &middot; {fsCfg.email} &middot; {fsCfg.phone}
        </div>
      </div>
    </div>
  );
};
