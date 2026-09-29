import React from 'react';
import type { Invoice, InvoiceItem } from '@/types/finance';
import type { FinanceSettingsData, PaymentAccountData } from '@/types/settings';
import { DEFAULT_FINANCE_SETTINGS, DEFAULT_PAYMENT_ACCOUNT } from '@/types/settings';

export interface CanonicalInvoiceDocumentProps {
  invoice: Invoice;
  financeSettings?: Partial<FinanceSettingsData> | null;
  paymentAccount?: Partial<PaymentAccountData> | null;
}

const CANONICAL_INVOICE_NOTE = 'Please note that tuition includes all instructional materials, completion credentials, and lab access.';
const CANONICAL_TERMS_AND_CONDITIONS =
  'Payment is due according to the schedule specified above. Certificates and course completion verification are issued upon full settlement of tuition fees.';

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

export const CanonicalInvoiceDocument: React.FC<CanonicalInvoiceDocumentProps> = ({
  invoice,
  financeSettings,
  paymentAccount,
}) => {
  const fsCfg = {
    ...DEFAULT_FINANCE_SETTINGS,
    ...(financeSettings || {}),
  };

  const payAcc = {
    bankName: invoice.paymentAccountSnapshot?.bankName || paymentAccount?.bankName || DEFAULT_PAYMENT_ACCOUNT.bankName,
    accountName: invoice.paymentAccountSnapshot?.accountName || paymentAccount?.accountName || DEFAULT_PAYMENT_ACCOUNT.accountName,
    accountNumber: invoice.paymentAccountSnapshot?.accountNumber || paymentAccount?.accountNumber || DEFAULT_PAYMENT_ACCOUNT.accountNumber,
    instructions:
      invoice.paymentAccountSnapshot?.instructions ||
      paymentAccount?.instructions ||
      DEFAULT_PAYMENT_ACCOUNT.instructions ||
      'Please use invoice number as your payment reference.',
  };

  const total = Number(invoice.totalAmount || 0);
  const paid = Number(invoice.paidAmount || 0);
  const balance = invoice.balanceAmount !== undefined ? Number(invoice.balanceAmount) : Math.max(0, total - paid);

  let st = (invoice.status || 'unpaid').toLowerCase();
  if (st !== 'paid' && st !== 'cancelled' && st !== 'voided') {
    if (paid >= total && total > 0) {
      st = 'paid';
    } else if (paid > 0) {
      st = 'partial';
    } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
      st = 'overdue';
    }
  }

  const statusLabel =
    st === 'paid'
      ? 'PAID IN FULL'
      : st === 'partial'
      ? 'PARTIALLY PAID'
      : st === 'overdue'
      ? 'OVERDUE'
      : st === 'cancelled'
      ? 'CANCELLED'
      : st === 'voided'
      ? 'VOIDED'
      : 'UNPAID';

  const statusPillClass =
    st === 'paid'
      ? 'paid'
      : st === 'partial'
      ? 'partial'
      : st === 'overdue'
      ? 'overdue'
      : 'unpaid';

  const isInstallment = invoice.paymentPlan === 'installment';
  const firstInstAmt = isInstallment ? Math.round(total * 0.6) : total;
  const secondInstAmt = isInstallment ? Math.round(total * 0.4) : 0;
  const firstDueDate = invoice.invoiceDate;
  const secondDueDate = invoice.dueDate;

  const items: Array<Partial<InvoiceItem> & { description?: string; price?: number; amount?: number; notes?: string }> =
    invoice.items && invoice.items.length
      ? invoice.items
      : [
          {
            description: invoice.programmeName || 'Professional Training Programme',
            quantity: 1,
            price: invoice.basePrice || total,
            discountAmount: invoice.discountAmount || 0,
            lineTotal: total,
            amount: total,
          },
        ];

  const notesText = invoice.notes?.trim() ? invoice.notes.trim() : CANONICAL_INVOICE_NOTE;
  const commentsText = invoice.comments?.trim() || '';
  const hasNotes = true;

  const displayNo = invoice.invoiceDisplayNo || `#INV-${invoice.invoiceNo || 'DRAFT'}`;
  const displayNoFormatted = displayNo.startsWith('#') ? displayNo.slice(1) : displayNo;

  return (
    <div className="cp-doc-paper" id={`canonical-invoice-${invoice.id || 'doc'}`}>
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
            <br />
            {fsCfg.taxId ? `TIN: ${fsCfg.taxId} · ` : ''}
            {fsCfg.registrationNumber ? `RC: ${fsCfg.registrationNumber} · ` : ''}
            Web: {fsCfg.website}
          </div>
        </div>
      </div>

      {/* 2. Invoice Title & Meta Row */}
      <div className="cp-doc-title-row">
        <div>
          <h1 className="cp-doc-main-title">INVOICE</h1>
          <div className="cp-doc-no">Invoice No: #{displayNoFormatted}</div>
        </div>
        <div className="cp-doc-badge-col">
          <span className={`cp-pill ${statusPillClass}`} style={{ fontSize: '11px', padding: '3px 10px' }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* 3. Compact Two-Column Bill To & Invoice Info Grid */}
      <div className="cp-doc-meta-grid">
        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">BILL TO</div>
          <div className="cp-doc-client-name">{invoice.studentName || 'Student Name Unavailable'}</div>
          {invoice.parentName ? (
            <div className="cp-doc-meta-line">
              Parent / Guardian: <strong>{invoice.parentName}</strong>
            </div>
          ) : null}
          <div className="cp-doc-meta-line">
            {invoice.studentPhone ? (
              <>
                Phone: <strong>{invoice.studentPhone}</strong>
              </>
            ) : null}
            {invoice.studentPhone && invoice.studentEmail ? ' · ' : ''}
            {invoice.studentEmail ? (
              <>
                Email: <strong>{invoice.studentEmail}</strong>
              </>
            ) : null}
          </div>
          {(invoice as any).address ? (
            <div className="cp-doc-meta-line">Address: {(invoice as any).address}</div>
          ) : null}
        </div>

        <div className="cp-doc-meta-block">
          <div className="cp-doc-section-label">INVOICE SPECIFICATION</div>
          <div className="cp-doc-meta-row">
            <span>Issue Date:</span>
            <strong>{fmtDate(invoice.invoiceDate)}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Due Date:</span>
            <strong style={{ color: st === 'overdue' ? 'var(--danger, #DC2626)' : 'inherit' }}>
              {fmtDate(invoice.dueDate)}
            </strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Payment Structure:</span>
            <strong>{isInstallment ? '60 / 40 Installment Plan' : 'Full Upfront Payment'}</strong>
          </div>
          <div className="cp-doc-meta-row">
            <span>Delivery Mode:</span>
            <strong>{(invoice as any).trainingMode || 'Live Interactive Class'}</strong>
          </div>
        </div>
      </div>

      {/* 4. Programme / Service Line Items Table */}
      <div className="cp-doc-table-wrap">
        <table className="cp-doc-table">
          <thead>
            <tr>
              <th style={{ width: '30px', textAlign: 'center' }}>#</th>
              <th>Programme / Service Description</th>
              <th style={{ width: '85px', textAlign: 'center' }}>Duration</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Schedule</th>
              <th style={{ width: '45px', textAlign: 'center' }}>Qty</th>
              <th style={{ width: '105px', textAlign: 'right' }}>Unit Price</th>
              <th style={{ width: '85px', textAlign: 'right' }}>Discount</th>
              <th style={{ width: '115px', textAlign: 'right' }}>Amount (₦)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const desc = it.itemDescription || it.description || invoice.programmeName || 'Training Programme';
              const price = it.unitPrice !== undefined ? it.unitPrice : it.price || 0;
              const disc = it.discountAmount !== undefined ? it.discountAmount : 0;
              const lineAmt = it.lineTotal !== undefined ? it.lineTotal : it.amount || (price * (it.quantity || 1) - disc);
              return (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted, #94A3B8)' }}>{idx + 1}</td>
                  <td>
                    <strong style={{ color: 'var(--primary, #14213D)', fontSize: '12.5px' }}>{desc}</strong>
                    {it.notes || (invoice.programmeName && desc !== invoice.programmeName) ? (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary, #64748B)', marginTop: '1px' }}>
                        {it.notes || invoice.programmeName}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '11px' }}>
                    {(invoice as any).duration || 'Standard'}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '11px' }}>
                    {(invoice as any).schedule || 'Flexible'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{it.quantity || 1}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(price)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted, #94A3B8)' }}>
                    {Number(disc) > 0 ? `-${fmtMoney(disc)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary, #14213D)' }}>
                    {fmtMoney(lineAmt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 5. SIDE-BY-SIDE: PAYMENT PLAN / INFO (LEFT) + TOTALS (RIGHT) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr',
          gap: '14px',
          marginBottom: '12px',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        {/* Left Column: Payment Plan Schedule (or Instructions) */}
        <div>
          {isInstallment ? (
            <div className="cp-doc-plan-box" style={{ margin: 0, height: '100%', boxSizing: 'border-box' }}>
              <div className="cp-doc-section-label">PAYMENT PLAN SCHEDULE</div>
              <table className="cp-doc-mini-table">
                <thead>
                  <tr>
                    <th>Installment</th>
                    <th>%</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Amount (₦)</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>1st Deposit</strong>
                    </td>
                    <td>60%</td>
                    <td>{fmtDate(firstDueDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(firstInstAmt)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`cp-pill ${paid >= firstInstAmt ? 'paid' : 'unpaid'}`}
                        style={{ fontSize: '9.5px', padding: '2px 6px' }}
                      >
                        {paid >= firstInstAmt ? 'PAID' : 'DUE'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>2nd Balance</strong>
                    </td>
                    <td>40%</td>
                    <td>{fmtDate(secondDueDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(secondInstAmt)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`cp-pill ${paid >= total ? 'paid' : 'unpaid'}`}
                        style={{ fontSize: '9.5px', padding: '2px 6px' }}
                      >
                        {paid >= total ? 'PAID' : 'PENDING'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cp-doc-box payment-info-box" style={{ margin: 0, height: '100%', boxSizing: 'border-box' }}>
              <div className="cp-doc-section-label" style={{ color: 'var(--primary, #14213D)' }}>
                PAYMENT INSTRUCTIONS
              </div>
              <div className="cp-doc-bank-grid">
                <div>
                  <span className="cp-meta-label">Bank:</span> <strong>{payAcc.bankName}</strong>
                  <br />
                  <span className="cp-meta-label">Account Name:</span> <strong>{payAcc.accountName}</strong>
                </div>
                <div>
                  <span className="cp-meta-label">Account Number:</span>{' '}
                  <strong className="cp-acc-num">{payAcc.accountNumber}</strong>
                  <br />
                  <span className="cp-meta-label">Payment Ref:</span>{' '}
                  <strong className="cp-ref-num">INV-{displayNoFormatted}</strong>
                </div>
              </div>
              {payAcc.instructions ? (
                <div className="cp-doc-instructions" style={{ marginTop: '6px', paddingTop: '6px' }}>
                  {payAcc.instructions}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Right Column: Financial Totals */}
        <div>
          <div className="cp-doc-totals-box" style={{ width: '100%', margin: 0, boxSizing: 'border-box' }}>
            <div className="cp-doc-total-row">
              <span>Subtotal</span>
              <span>{fmtMoney(invoice.basePrice || total + (invoice.discountAmount || 0))}</span>
            </div>
            {Number(invoice.discountAmount || 0) > 0 ? (
              <div className="cp-doc-total-row">
                <span>Discount</span>
                <span style={{ color: 'var(--danger, #DC2626)' }}>- {fmtMoney(invoice.discountAmount || 0)}</span>
              </div>
            ) : null}
            <div className="cp-doc-total-row grand">
              <span>TOTAL DUE</span>
              <span>{fmtMoney(total)}</span>
            </div>
            <div className="cp-doc-total-row">
              <span>Amount Paid</span>
              <span style={{ color: 'var(--success, #059669)', fontWeight: 700 }}>{fmtMoney(paid)}</span>
            </div>
            <div className="cp-doc-total-row balance-row">
              <span>Outstanding Balance</span>
              <span>{fmtMoney(balance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. SIDE-BY-SIDE: PAYMENT INSTRUCTIONS (if installment) + NOTES */}
      {isInstallment ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasNotes ? '1.15fr 1fr' : '1fr',
            gap: '14px',
            marginBottom: '10px',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
          }}
        >
          <div className="cp-doc-box payment-info-box" style={{ margin: 0 }}>
            <div className="cp-doc-section-label" style={{ color: 'var(--primary, #14213D)' }}>
              PAYMENT INSTRUCTIONS
            </div>
            <div className="cp-doc-bank-grid">
              <div>
                <span className="cp-meta-label">Bank:</span> <strong>{payAcc.bankName}</strong>
                <br />
                <span className="cp-meta-label">Account Name:</span> <strong>{payAcc.accountName}</strong>
              </div>
              <div>
                <span className="cp-meta-label">Account Number:</span>{' '}
                <strong className="cp-acc-num">{payAcc.accountNumber}</strong>
                <br />
                <span className="cp-meta-label">Payment Ref:</span>{' '}
                <strong className="cp-ref-num">INV-{displayNoFormatted}</strong>
              </div>
            </div>
            {payAcc.instructions ? (
              <div className="cp-doc-instructions" style={{ marginTop: '6px', paddingTop: '6px' }}>
                {payAcc.instructions}
              </div>
            ) : null}
          </div>

          {hasNotes ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notesText ? (
                <div className="cp-doc-box notes-box" style={{ margin: 0 }}>
                  <div className="cp-doc-section-label" style={{ color: 'var(--info, #0284C7)' }}>
                    NOTES
                  </div>
                  <div className="cp-doc-box-content" style={{ fontSize: '11px' }}>
                    {notesText}
                  </div>
                </div>
              ) : null}
              {commentsText ? (
                <div className="cp-doc-box comment-box" style={{ margin: 0 }}>
                  <div className="cp-doc-section-label" style={{ color: '#7C3AED' }}>
                    COMMENT
                  </div>
                  <div className="cp-doc-box-content" style={{ fontSize: '11px' }}>
                    {commentsText}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : hasNotes ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: notesText && commentsText ? '1fr 1fr' : '1fr',
            gap: '14px',
            marginBottom: '10px',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
          }}
        >
          {notesText ? (
            <div className="cp-doc-box notes-box" style={{ margin: 0 }}>
              <div className="cp-doc-section-label" style={{ color: 'var(--info, #0284C7)' }}>
                NOTES
              </div>
              <div className="cp-doc-box-content" style={{ fontSize: '11px' }}>
                {notesText}
              </div>
            </div>
          ) : null}
          {commentsText ? (
            <div className="cp-doc-box comment-box" style={{ margin: 0 }}>
              <div className="cp-doc-section-label" style={{ color: '#7C3AED' }}>
                COMMENT
              </div>
              <div className="cp-doc-box-content" style={{ fontSize: '11px' }}>
                {commentsText}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 7. Compact Terms & Conditions Block */}
      <div
        className="cp-doc-box terms-box"
        style={{ marginBottom: '10px', padding: '8px 12px', pageBreakInside: 'avoid', breakInside: 'avoid' }}
      >
        <div className="cp-doc-section-label" style={{ marginBottom: '3px' }}>
          TERMS &amp; CONDITIONS
        </div>
        <div className="cp-doc-box-content terms-text" style={{ fontSize: '10.5px', lineHeight: 1.35 }}>
          {invoice.termsAndConditions ||
            fsCfg.defaultTerms ||
            CANONICAL_TERMS_AND_CONDITIONS}
        </div>
      </div>

      {/* 8. Compact Single-Line Footer */}
      <div
        className="cp-doc-footer"
        style={{ marginTop: '10px', paddingTop: '8px', pageBreakInside: 'avoid', breakInside: 'avoid' }}
      >
        <div className="cp-doc-footer-main">
          {fsCfg.invoiceFooter || 'Thank you for choosing Clasptek Coaching Limited! Learn | Lead | Impact — clasptek.org'}
        </div>
        <div className="cp-doc-footer-sub">
          {fsCfg.website} &middot; {fsCfg.email} &middot; {fsCfg.phone}
        </div>
      </div>
    </div>
  );
};
