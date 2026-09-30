/**
 * components/finance/CreateProfessionalTuitionInvoiceModal.tsx
 *
 * AUTHORITATIVE "Create Professional Tuition / Service Invoice" Workflow
 * Source-of-truth implementation matching legacy index.html L24840-L25140:
 * - 1. CUSTOMER: Customer select pre-fill, Student Full Name, Parent/Guardian, Phone, Email, Billing Category
 * - 2. TRAINING/PROGRAMME: Programme curriculum, Payment Plan (Full vs 60/40), Invoice Date, Due Date, Delivery Mode, Duration, Schedule
 * - 3. PAYMENT: Designated Payment Account (from Settings / DB, defaults to Sterling Bank 0098457631), Payment Instructions
 * - 4. LINE ITEMS: Repeater with Description, Qty, Unit Price, Discount, Calculated Total, Add/Remove line
 * - 5. NOTES & COMMENTS: Customer-Facing Notes (cyan NOTES box), Contextual/Internal Comments (purple COMMENT box)
 * - 6. TERMS: Standard Terms & Conditions
 * - 7. ACTIONS: Cancel, 👁️ Preview Invoice (Canonical Document), ✔ Issue Official Invoice
 */

'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Invoice, PaymentAccountData, FinanceSettingsData } from '@/types/finance';
import { DEFAULT_FINANCE_SETTINGS, DEFAULT_PAYMENT_ACCOUNT } from '@/types/finance';
import { CanonicalInvoiceDocument } from './CanonicalInvoiceDocument';

export interface ProgrammeOptionItem {
  id: string;
  name: string;
  code?: string;
  tuitionFee?: number;
  price?: number;
}

export interface CustomerOptionItem {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  parentName?: string | null;
}

export interface CreateProfessionalTuitionInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry?: {
    id: string;
    student_name?: string;
    email?: string | null;
    phone?: string | null;
    programme_id?: string | null;
    programme_name?: string | null;
  } | null;
  programmes: ProgrammeOptionItem[];
  customers?: CustomerOptionItem[];
  paymentAccounts?: PaymentAccountData[];
  financeSettings?: FinanceSettingsData | null;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export interface LineItemFormState {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

const BILLING_CATEGORIES = [
  'Student Tuition',
  'Corporate Training',
  'Executive Coaching',
  'Consulting & Advisory',
  'Registration / Examination Fee',
  'General / Shared',
];

const TRAINING_MODES = [
  'Live Interactive Onsite Class',
  'Live Online Virtual Class',
  'Hybrid (Onsite + Virtual)',
];

const CANONICAL_INVOICE_NOTE =
  'Please note that tuition includes all instructional materials, completion credentials, and lab access.';

const CANONICAL_TERMS_AND_CONDITIONS =
  'Payment is due according to the schedule specified above. Certificates and course completion verification are issued upon full settlement of tuition fees.';

const CANONICAL_FALLBACK_PROGRAMMES: ProgrammeOptionItem[] = [
  { id: 'prog_1789416837946_hnnbx', name: 'Digital Marketing', tuitionFee: 180000, price: 180000 },
  { id: 'prog_1788900434260_uujj7', name: 'Cybersecurity', tuitionFee: 450000, price: 450000 },
  { id: 'prog_data_analysis_01', name: 'Data Analysis', tuitionFee: 400000, price: 400000 },
];

function fmtMoney(n: number): string {
  const v = Math.round(Number(n || 0));
  const absFormatted = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-₦' : '₦') + absFormatted;
}

export function CreateProfessionalTuitionInvoiceModal({
  isOpen,
  onClose,
  enquiry,
  programmes,
  customers = [],
  paymentAccounts,
  financeSettings,
  onInvoiceCreated,
}: CreateProfessionalTuitionInvoiceModalProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultDue = useMemo(
    () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    []
  );

  const effectiveProgrammes = useMemo<ProgrammeOptionItem[]>(() => {
    return programmes && programmes.length > 0 ? programmes : CANONICAL_FALLBACK_PROGRAMMES;
  }, [programmes]);

  // Available Payment Accounts: use passed list or fallback to authoritative Sterling Bank default
  const activeAccounts = useMemo<PaymentAccountData[]>(() => {
    if (paymentAccounts && paymentAccounts.length > 0) {
      return paymentAccounts.filter((a) => a.isActive !== false);
    }
    return [DEFAULT_PAYMENT_ACCOUNT];
  }, [paymentAccounts]);

  const defaultAccount = useMemo<PaymentAccountData>(() => {
    return activeAccounts.find((a) => a.isDefault) || activeAccounts[0] || DEFAULT_PAYMENT_ACCOUNT;
  }, [activeAccounts]);

  // Form State: Customer Section
  const [clientName, setClientName] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [billingCategory, setBillingCategory] = useState('Student Tuition');

  // Form State: Training / Programme Section
  const [programmeId, setProgrammeId] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<'full' | 'installment'>('installment');
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [trainingMode, setTrainingMode] = useState('Live Interactive Onsite Class');
  const [duration, setDuration] = useState('5 Months');
  const [schedule, setSchedule] = useState('Weekdays (Tue & Thu 10am - 1pm)');

  // Form State: Payment Section
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccount.id);
  const [paymentInstructions, setPaymentInstructions] = useState(
    defaultAccount.instructions || 'Please use invoice number as your payment reference.'
  );

  // Form State: Line Items
  const [lineItems, setLineItems] = useState<LineItemFormState[]>([]);

  // Form State: Notes, Comments, Terms
  const [notes, setNotes] = useState(CANONICAL_INVOICE_NOTE);
  const [comments, setComments] = useState('');
  const [terms, setTerms] = useState(CANONICAL_TERMS_AND_CONDITIONS);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewInvoiceData, setPreviewInvoiceData] = useState<Invoice | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Synchronize form when opened or enquiry changed
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setPreviewInvoiceData(null);

    // Initial Account
    const initialAcc = defaultAccount;
    setSelectedAccountId(initialAcc.id);
    setPaymentInstructions(initialAcc.instructions || 'Please use invoice number as your payment reference.');

    // Dates
    setInvoiceDate(todayStr);
    setDueDate(defaultDue);
    setTrainingMode('Live Interactive Onsite Class');
    setDuration('5 Months');
    setSchedule('Weekdays (Tue & Thu 10am - 1pm)');
    setNotes(CANONICAL_INVOICE_NOTE);
    setTerms(financeSettings?.defaultTerms || CANONICAL_TERMS_AND_CONDITIONS);

    if (enquiry) {
      // Pre-fill from Enquiry with robust property fallbacks
      const resolvedName = (enquiry.student_name || (enquiry as any)?.name || (enquiry as any)?.studentName || '').trim();
      setClientName(resolvedName || 'Prospective Student / Client');
      setPhone(enquiry.phone || '');
      setEmail(enquiry.email || '');
      setParentName('');
      setBillingCategory('Student Tuition');
      setPaymentPlan('installment');
      setComments(`Admissions enquiry prospect conversion (Enquiry #${enquiry.id})`);

      const matchedProg =
        effectiveProgrammes.find((p) => p.id === enquiry.programme_id) ||
        effectiveProgrammes.find((p) => enquiry.programme_name && p.name.toLowerCase().includes(enquiry.programme_name.toLowerCase())) ||
        effectiveProgrammes[0];
      const progId = matchedProg?.id || effectiveProgrammes[0].id;
      setProgrammeId(progId);

      const fee = Number(matchedProg?.tuitionFee ?? matchedProg?.price ?? 180000);
      setLineItems([
        {
          id: 'item_1',
          description: matchedProg ? `Tuition Fee — ${matchedProg.name}` : 'Professional Training Tuition',
          quantity: 1,
          unitPrice: fee,
          discount: 0,
        },
      ]);
    } else {
      // Normal Finance Invoice
      setClientName('');
      setParentName('');
      setPhone('');
      setEmail('');
      setBillingCategory('Student Tuition');
      setPaymentPlan('installment');
      setComments('');

      const defaultProg = effectiveProgrammes[0];
      const progId = defaultProg?.id || '';
      setProgrammeId(progId);

      const fee = Number(defaultProg?.tuitionFee ?? defaultProg?.price ?? 180000);
      setLineItems([
        {
          id: 'item_1',
          description: defaultProg ? defaultProg.name : 'Professional Training Tuition',
          quantity: 1,
          unitPrice: fee,
          discount: 0,
        },
      ]);
    }

    setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [isOpen, enquiry, effectiveProgrammes, defaultAccount, todayStr, defaultDue, financeSettings]);

  // Handle Existing Customer Selection
  const handleCustomerSelect = (name: string) => {
    if (!name) return;
    const found = customers.find((c) => c.name === name);
    if (found) {
      setClientName(found.name);
      if (found.phone) setPhone(found.phone);
      if (found.email) setEmail(found.email);
      if (found.parentName) setParentName(found.parentName);
    }
  };

  // Handle Programme Change
  const handleProgrammeChange = (pId: string) => {
    setProgrammeId(pId);
    const prog = effectiveProgrammes.find((p) => p.id === pId);
    if (prog) {
      const fee = Number(prog.tuitionFee ?? prog.price ?? 0);
      setLineItems((prev) => {
        if (prev.length === 0) {
          return [{ id: 'item_1', description: prog.name, quantity: 1, unitPrice: fee, discount: 0 }];
        }
        return [
          { ...prev[0], description: prog.name, unitPrice: fee },
          ...prev.slice(1),
        ];
      });
    }
  };

  // Handle Payment Account Change
  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = activeAccounts.find((a) => a.id === accId);
    if (acc) {
      setPaymentInstructions(acc.instructions || 'Please use invoice number as your payment reference.');
    }
  };

  // Line Item Helpers
  const addLineItem = () => {
    const newItem: LineItemFormState = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      description: '',
      quantity: 1,
      unitPrice: 50000,
      discount: 0,
    };
    setLineItems((prev) => [...prev, newItem]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) {
      alert('Invoice must contain at least one line item.');
      return;
    }
    setLineItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItemFormState, value: string | number) => {
    setLineItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  // Totals Calculation
  const { subtotal, totalDiscount, calculatedTotal } = useMemo(() => {
    let sub = 0;
    let disc = 0;
    lineItems.forEach((it) => {
      const lineSub = Number(it.quantity || 1) * Number(it.unitPrice || 0);
      sub += lineSub;
      disc += Number(it.discount || 0);
    });
    const total = Math.max(0, sub - disc);
    return { subtotal: sub, totalDiscount: disc, calculatedTotal: total };
  }, [lineItems]);

  // Selected Account Snapshot
  const currentSelectedAccount = useMemo<PaymentAccountData>(() => {
    const acc = activeAccounts.find((a) => a.id === selectedAccountId);
    return acc || defaultAccount;
  }, [activeAccounts, selectedAccountId, defaultAccount]);

  // Build Preview or Issue Payload
  const buildInvoicePayload = () => {
    const activeProg = effectiveProgrammes.find((p) => p.id === programmeId) || effectiveProgrammes[0];
    const selectedSnapshot: PaymentAccountData = {
      id: currentSelectedAccount.id,
      tenantId: currentSelectedAccount.tenantId || 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      bankName: currentSelectedAccount.bankName,
      accountName: currentSelectedAccount.accountName,
      accountNumber: currentSelectedAccount.accountNumber,
      accountType: currentSelectedAccount.accountType || 'Corporate Current',
      currency: currentSelectedAccount.currency || 'NGN',
      isDefault: currentSelectedAccount.isDefault,
      isActive: currentSelectedAccount.isActive,
      instructions: paymentInstructions.trim() || currentSelectedAccount.instructions,
    };

    return {
      studentName: clientName.trim(),
      studentEmail: email.trim() || undefined,
      studentPhone: phone.trim() || undefined,
      parentName: parentName.trim() || undefined,
      programmeId: activeProg?.id || programmeId || effectiveProgrammes[0].id,
      programmeName: activeProg?.name || 'Professional Training Programme',
      incomeCategory: billingCategory,
      paymentPlan,
      installmentsCount: paymentPlan === 'installment' ? 2 : 1,
      basePrice: subtotal,
      discountAmount: totalDiscount,
      discountPct: subtotal > 0 ? Math.round((totalDiscount / subtotal) * 100) : 0,
      invoiceDate,
      dueDate,
      enquiryId: enquiry?.id,
      trainingMode,
      duration,
      schedule,
      notes: notes.trim() || CANONICAL_INVOICE_NOTE,
      comments: comments.trim() || undefined,
      termsAndConditions: terms.trim() || CANONICAL_TERMS_AND_CONDITIONS,
      paymentAccountId: currentSelectedAccount.id,
      paymentAccountSnapshot: selectedSnapshot,
      items: lineItems.map((it) => ({
        description: it.description.trim() || activeProg?.name || 'Tuition Fee',
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.unitPrice || 0),
        discountAmount: Number(it.discount || 0),
        amount: Math.max(0, Number(it.quantity || 1) * Number(it.unitPrice || 0) - Number(it.discount || 0)),
      })),
    };
  };

  // Handle Preview
  const handlePreview = () => {
    if (!clientName.trim()) {
      setErrorMessage('Student / Client Name is required.');
      return;
    }
    if (lineItems.length === 0) {
      setErrorMessage('Please add at least one line item.');
      return;
    }

    setErrorMessage(null);
    const payload = buildInvoicePayload();
    const tempInvoice: Invoice = {
      id: 'preview_draft',
      tenantId: 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
      invoiceNo: 9999,
      invoiceDisplayNo: 'INV-2026-PREVIEW',
      programmeId: payload.programmeId,
      programmeName: payload.programmeName,
      studentName: payload.studentName,
      studentEmail: payload.studentEmail,
      studentPhone: payload.studentPhone,
      parentName: payload.parentName,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate,
      paymentPlan: payload.paymentPlan,
      installmentsCount: payload.installmentsCount,
      basePrice: payload.basePrice,
      discountPct: payload.discountPct,
      discountAmount: payload.discountAmount,
      totalAmount: calculatedTotal,
      incomeCategory: payload.incomeCategory,
      status: 'unpaid',
      trainingMode: payload.trainingMode,
      duration: payload.duration,
      schedule: payload.schedule,
      notes: payload.notes,
      comments: payload.comments,
      termsAndConditions: payload.termsAndConditions,
      paymentAccountId: payload.paymentAccountId,
      paymentAccountSnapshot: payload.paymentAccountSnapshot,
      source: enquiry ? `ENQUIRY:${enquiry.id}` : 'APP',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAmount: 0,
      balanceAmount: calculatedTotal,
      items: payload.items.map((it, idx) => ({
        id: `item_${idx}`,
        itemDescription: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount,
        lineTotal: it.amount,
      })),
    };

    setPreviewInvoiceData(tempInvoice);
  };

  // Handle Submit / Issue Official Invoice
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!clientName.trim()) {
      setErrorMessage('Student / Client Name is required.');
      return;
    }
    if (!programmeId) {
      setErrorMessage('Please select an Academic Programme.');
      return;
    }
    if (lineItems.length === 0) {
      setErrorMessage('Please add at least one line item.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = buildInvoicePayload();
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to issue official invoice');
      }

      onInvoiceCreated(data.invoice);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error issuing invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="cp-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="cp-modal"
        ref={modalRef}
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          width: '840px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          className="cp-card-header"
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FAFBFD',
          }}
        >
          <div>
            <div
              className="cp-section-title"
              style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary, #14213D)', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>📄</span> Create Professional Tuition / Service Invoice
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
              Generate an official corporate training invoice with configurable banking details, installment schedules, and notes.
            </div>
          </div>
          <button
            type="button"
            className="cp-btn sm secondary"
            onClick={onClose}
            style={{ fontWeight: 600, fontSize: '13px' }}
          >
            &times; Close
          </button>
        </div>

        {/* PREVIEW OVERLAY MODE (if preview clicked) */}
        {previewInvoiceData ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              style={{
                background: '#F0FDF4',
                borderBottom: '1px solid #BBF7D0',
                padding: '10px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                👁️ Invoice Document Preview — Authoritative Screen & Print Layout
              </div>
              <button
                type="button"
                className="cp-btn sm secondary"
                onClick={() => setPreviewInvoiceData(null)}
              >
                &larr; Return to Invoice Form
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
              <CanonicalInvoiceDocument
                invoice={previewInvoiceData}
                financeSettings={financeSettings || DEFAULT_FINANCE_SETTINGS}
                paymentAccount={previewInvoiceData.paymentAccountSnapshot}
              />
            </div>
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                background: '#FAFBFD',
              }}
            >
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setPreviewInvoiceData(null)}
              >
                Edit Invoice
              </button>
              <button
                type="button"
                className="cp-btn accent"
                onClick={() => handleSubmit()}
                disabled={isSubmitting}
                style={{ fontWeight: 700 }}
              >
                {isSubmitting ? 'Issuing Official Invoice…' : '✔ Issue Official Invoice'}
              </button>
            </div>
          </div>
        ) : (
          /* FULL INVOICE CREATION FORM */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Lead Notification Banner */}
            {enquiry && (
              <div
                style={{
                  background: 'var(--info-bg, #E0F2FE)',
                  border: '1px solid var(--info, #0284C7)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '12.5px',
                  color: 'var(--info, #0369A1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📥</span>
                <span>
                  <strong>Creating Invoice for Lead:</strong> {enquiry.student_name} (
                  {enquiry.programme_name || 'General'}) &mdash; Details pre-filled automatically.
                </span>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0, padding: '10px 14px' }}>
                {errorMessage}
              </div>
            )}

            {/* 1. CUSTOMER SECTION */}
            <div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 800,
                  color: 'var(--primary, #14213D)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>👤</span> 1. Customer & Student Information
              </div>

              {customers.length > 0 && (
                <div className="cp-field" style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Select Existing Customer Profile (Optional Pre-fill)
                  </label>
                  <select
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="">-- Choose existing student/client or enter new below --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Student / Client Name *
                  </label>
                  <input
                    ref={firstInputRef}
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Samuel Adebayo"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Parent / Guardian Name (Optional)
                  </label>
                  <input
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    placeholder="e.g. Mr. & Mrs. Adebayo"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div className="cp-row3" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '12px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Phone Number *
                  </label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08031234567"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Billing Category
                  </label>
                  <select
                    value={billingCategory}
                    onChange={(e) => setBillingCategory(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    {BILLING_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 2. TRAINING / PROGRAMME SECTION */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 800,
                  color: 'var(--primary, #14213D)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🎓</span> 2. Programme & Training Specifications
              </div>

              <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Target Programme / Curriculum *
                  </label>
                  <select
                    required
                    value={programmeId}
                    onChange={(e) => handleProgrammeChange(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    {effectiveProgrammes.map((p) => {
                      const fee = Number(p.tuitionFee ?? p.price ?? 0);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({fmtMoney(fee)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Payment Plan *
                  </label>
                  <select
                    value={paymentPlan}
                    onChange={(e) => setPaymentPlan(e.target.value as 'full' | 'installment')}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="installment">60 / 40 Installment Schedule</option>
                    <option value="full">Full Upfront Payment</option>
                  </select>
                </div>
              </div>

              <div className="cp-row3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginBottom: '10px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    Payment Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Training Delivery Mode
                  </label>
                  <select
                    value={trainingMode}
                    onChange={(e) => setTrainingMode(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    {TRAINING_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Course Duration
                  </label>
                  <input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 5 Months"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                    Lecture Schedule
                  </label>
                  <input
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    placeholder="e.g. Weekdays (Tue & Thu 10am - 1pm)"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* 3. PAYMENT ACCOUNT SECTION */}
            <div
              style={{
                background: '#FAFBFD',
                border: '1px solid var(--border, #E2E8F0)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: 'var(--primary, #14213D)',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🏦</span> 3. Designated Settlement Account & Payment Instructions
              </div>

              <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700 }}>
                    Designated Payment Account *
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', fontWeight: 600 }}
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} - {a.accountNumber} ({a.accountName})
                        {a.isDefault ? ' [DEFAULT]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600 }}>
                    Payment Instructions
                  </label>
                  <input
                    value={paymentInstructions}
                    onChange={(e) => setPaymentInstructions(e.target.value)}
                    placeholder="Please use invoice number as your payment reference."
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* 4. INVOICE LINE ITEMS SECTION */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--primary, #14213D)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  4. Invoice Line Items (Service Description)
                </div>
                <button
                  type="button"
                  className="cp-btn secondary sm"
                  onClick={addLineItem}
                  style={{ fontWeight: 600, fontSize: '12px' }}
                >
                  + Add Line Item
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 2fr 70px 1.2fr 1fr 34px',
                      gap: '8px',
                      alignItems: 'center',
                      background: '#FFFFFF',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: '11.5px', color: '#94A3B8', textAlign: 'center', fontWeight: 700 }}>
                      {idx + 1}
                    </span>
                    <input
                      required
                      placeholder="Programme / Service Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: '12.5px', boxSizing: 'border-box' }}
                    />
                    <input
                      type="number"
                      min={1}
                      required
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value || '1', 10)))}
                      style={{ padding: '6px 6px', fontSize: '12.5px', textAlign: 'center', boxSizing: 'border-box' }}
                      title="Quantity"
                    />
                    <input
                      type="number"
                      min={0}
                      required
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(item.id, 'unitPrice', Math.max(0, parseFloat(e.target.value || '0')))}
                      style={{ padding: '6px 8px', fontSize: '12.5px', textAlign: 'right', boxSizing: 'border-box', fontWeight: 600 }}
                      title="Unit Price"
                    />
                    <input
                      type="number"
                      min={0}
                      value={item.discount}
                      onChange={(e) => updateLineItem(item.id, 'discount', Math.max(0, parseFloat(e.target.value || '0')))}
                      style={{ padding: '6px 8px', fontSize: '12.5px', textAlign: 'right', boxSizing: 'border-box' }}
                      title="Discount"
                    />
                    <button
                      type="button"
                      className="cp-btn danger sm"
                      onClick={() => removeLineItem(item.id)}
                      style={{ height: '34px', width: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove Item"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Calculated Total Bar */}
              <div
                style={{
                  background: '#FAFBFD',
                  border: '1px solid var(--border, #E2E8F0)',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  marginTop: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)' }}>
                  Subtotal: <strong>{fmtMoney(subtotal)}</strong>
                  {totalDiscount > 0 ? ` · Discount: -${fmtMoney(totalDiscount)}` : ''}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
                  Calculated Total:{' '}
                  <strong style={{ fontSize: '16px', color: 'var(--primary, #14213D)', marginLeft: '6px' }}>
                    {fmtMoney(calculatedTotal)}
                  </strong>
                </div>
              </div>
            </div>

            {/* 5. NOTES & COMMENTS (Phase 8 Distinct Fields) */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 800,
                  color: 'var(--primary, #14213D)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>📝</span> 5. Notes, Comments & Terms
              </div>

              <div className="cp-row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--info, #0284C7)' }}>
                    Customer-Facing Notes (Appears under NOTES on Invoice)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Please note that tuition includes all instructional materials and completion credentials and lab access."
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px' }}
                  />
                </div>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED' }}>
                    Contextual / Internal Comments (Appears under COMMENT on Invoice)
                  </label>
                  <textarea
                    rows={2}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="e.g. 60/40 installment schedule approved by Admissions Committee."
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div className="cp-field" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>
                  Standard Terms &amp; Conditions
                </label>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '11.5px' }}
                />
              </div>
            </div>

            {/* 6. BOTTOM ACTIONS */}
            <div
              className="cp-modal-footer"
              style={{
                marginTop: '12px',
                paddingTop: '14px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="cp-btn secondary"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cp-btn secondary"
                onClick={handlePreview}
                disabled={isSubmitting}
                style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>👁️</span> Preview Invoice
              </button>
              <button
                type="submit"
                className="cp-btn accent"
                disabled={isSubmitting}
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>✔</span> {isSubmitting ? 'Issuing Official Invoice…' : 'Issue Official Invoice'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
