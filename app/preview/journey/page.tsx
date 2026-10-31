'use client';

/**
 * app/preview/journey/page.tsx — Integrated Local Preview Journey
 * Phase C9: Integrated Local Preview Journey & Cross-Modal Consistency
 *
 * Simulates the complete end-to-end vocational training centre journey:
 * 1. View synthetic student dossier (Chioma Okonkwo STU-2026-0881).
 * 2. Register a new student or switch active student.
 * 3. Schedule a synthetic academic cohort.
 * 4. Enrol the student in an academic programme & cohort.
 * 5. Issue a simulated professional tuition invoice.
 * 6. Record a simulated tuition fee deposit against the invoice.
 * 7. Inspect the canonical fee receipt document with audit verification.
 * 8. Navigate across preview pages (/preview, /preview/payments, /preview/modals) with coherent in-memory state.
 */

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { usePreviewState } from '@/lib/preview/preview-context';
import { CreateProfessionalTuitionInvoiceModal } from '@/components/finance/CreateProfessionalTuitionInvoiceModal';
import { StudentRegistrationModal } from '@/components/students/StudentRegistrationModal';
import { AddEnrolmentModal } from '@/components/students/AddEnrolmentModal';
import { AddCohortModal } from '@/components/cohorts/AddCohortModal';
import { RecordLifecycleModal, type LifecycleActionType } from '@/components/tables/RecordLifecycleModal';
import { CanonicalReceiptDocument } from '@/components/finance/CanonicalReceiptDocument';
import { printCanonicalElement } from '@/components/finance/printCanonical';
import {
  MOCK_PREVIEW_USER,
  MOCK_PREVIEW_PAYMENT_ACCOUNTS,
  MOCK_PREVIEW_SETTINGS,
  MOCK_PREVIEW_FACILITATORS,
} from '@/lib/preview/mock-data';
import type { Invoice, Payment, PaymentMethod } from '@/types/finance';
import type { Student } from '@/types/students';
import type { Cohort } from '@/types/academics';

function fmtMoney(amount?: number | null): string {
  return '₦' + Math.round(Number(amount || 0)).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function PreviewJourneyPage() {
  const {
    students,
    selectedStudent,
    admissionsProgrammes,
    academicProgrammes,
    cohorts,
    enrolments,
    invoices,
    payments,
    targetInvoices,
    enrolledCohortIdsForSelectedStudent,
    selectStudent,
    registerStudent,
    createCohort,
    enrolStudent,
    issueInvoice,
    recordPayment,
    performLifecycleAction,
    resetToBaseline,
  } = usePreviewState();

  // Modal display states
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false);
  const [isEnrolmentModalOpen, setIsEnrolmentModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);
  const [lifecycleAction] = useState<LifecycleActionType>('DELETE');
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);

  // In-journey quick payment state
  const [quickPayInvoiceId, setQuickPayInvoiceId] = useState<string>('');
  const [quickPayAmount, setQuickPayAmount] = useState<number>(0);
  const [quickPayMethod, setQuickPayMethod] = useState<PaymentMethod>('Bank Transfer');
  const [quickPayReference, setQuickPayReference] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const isSubmittingPaymentRef = useRef<boolean>(false);

  // Status feedback notices
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Ref for canonical receipt printing
  const receiptDocRef = useRef<HTMLDivElement>(null);

  // Derived: Invoices and payments belonging to selected student
  const studentInvoices = invoices.filter(
    (inv) => inv.studentName === `${selectedStudent.first_name} ${selectedStudent.last_name}` || inv.customerId === selectedStudent.id
  );
  const studentPayments = payments.filter(
    (p) => p.studentName === `${selectedStudent.first_name} ${selectedStudent.last_name}`
  );
  const studentEnrolments = enrolments.filter((e) => e.student_id === selectedStudent.id);

  // Find target invoice for quick payment
  const selectedTargetInvoice = targetInvoices.find((t) => t.id === quickPayInvoiceId);
  const isOverpayment =
    selectedTargetInvoice &&
    quickPayAmount > selectedTargetInvoice.balanceAmount &&
    selectedTargetInvoice.balanceAmount > 0;

  // Handlers
  const handleQuickPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPaymentRef.current) return;

    if (!quickPayInvoiceId) {
      setFeedback({ type: 'error', message: 'Please select a target invoice to record payment.' });
      return;
    }
    if (!Number.isFinite(quickPayAmount) || quickPayAmount <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive payment amount.' });
      return;
    }

    isSubmittingPaymentRef.current = true;
    setIsSubmittingPayment(true);

    try {
      const res = recordPayment({
        invoiceId: quickPayInvoiceId,
        amount: Number(quickPayAmount),
        paymentMethod: quickPayMethod,
        paymentDate: new Date().toISOString().split('T')[0],
        reference: quickPayReference.trim() || undefined,
        notes: 'Simulated payment from interactive student journey.',
      });

      if (!res.success || !res.payment) {
        setFeedback({ type: 'error', message: res.error || 'Failed to record simulated payment.' });
      } else {
        setFeedback({
          type: 'success',
          message: `Payment of ${fmtMoney(quickPayAmount)} recorded successfully! (Receipt: ${res.payment.receiptDisplayNo}). Invoice balance updated.`,
        });
        setQuickPayAmount(0);
        setQuickPayReference('');
      }
    } finally {
      setIsSubmittingPayment(false);
      isSubmittingPaymentRef.current = false;
    }
  };

  const handlePrintReceipt = () => {
    if (receiptDocRef.current) {
      printCanonicalElement(receiptDocRef.current);
    }
  };

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '28px 36px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, backgroundColor: '#0D9488', color: '#FFF', padding: '2px 8px', borderRadius: '4px' }}>
              PHASE C9
            </span>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Integrated Student Journey Simulation
            </h1>
          </div>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            Simulate a student&apos;s complete journey: register profile, schedule cohort, enrol in programme, issue tuition invoice, record deposit, and inspect official audit receipt. State updates in-memory across all preview routes.
          </p>
        </div>

        <button
          type="button"
          id="btnResetPreviewSession"
          onClick={() => {
            resetToBaseline();
            setFeedback({ type: 'info', message: 'In-memory preview session reset to clean baseline fixtures.' });
          }}
          style={{
            backgroundColor: '#F1F5F9',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          Reset In-Memory Session
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor:
              feedback.type === 'success' ? '#F0FDF4' : feedback.type === 'error' ? '#FEF2F2' : '#EFF6FF',
            border: `1px solid ${
              feedback.type === 'success' ? '#BBF7D0' : feedback.type === 'error' ? '#FECACA' : '#BFDBFE'
            }`,
            color:
              feedback.type === 'success' ? '#166534' : feedback.type === 'error' ? '#991B1B' : '#1E40AF',
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <Link
          href="/preview/payments"
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
            textDecoration: 'none',
            display: 'block',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>
            Cross-Page Check &rarr;
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
            Tuition Payments Ledger
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {payments.length} payment(s) &middot; {invoices.length} invoice(s)
          </div>
        </Link>

        <Link
          href="/preview/modals"
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
            textDecoration: 'none',
            display: 'block',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase' }}>
            Cross-Page Check &rarr;
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
            Modal Validation Sandbox
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            Test line items, focus traps, &amp; SVGs
          </div>
        </Link>

        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Session Status
          </div>
          <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
            <strong>Active Student:</strong> {selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.student_number})
          </div>
        </div>
      </div>

      {/* Main Grid: Student Dossier (Left) + Workflow Actions (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Synthetic Student Dossier */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#E2E8F0', color: '#334155', padding: '2px 8px', borderRadius: '4px' }}>
                SYNTHETIC DOSSIER
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '6px', marginBottom: '2px' }}>
                {selectedStudent.first_name} {selectedStudent.last_name}
              </h2>
              <span style={{ fontSize: '12.5px', color: '#64748B', fontFamily: 'monospace' }}>
                {selectedStudent.student_number} &middot; {selectedStudent.email || 'No email'}
              </span>
            </div>

            {students.length > 1 && (
              <select
                aria-label="Switch Active Student"
                value={selectedStudent.id}
                onChange={(e) => selectStudent(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.student_number})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section: Academic Enrolments */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Academic Enrolments ({studentEnrolments.length})
            </div>
            {studentEnrolments.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>
                No academic enrolments recorded yet. Use Step 3 below to enrol.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {studentEnrolments.map((enr) => (
                  <div key={enr.id} style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                      <span>{enr.cohort_code} &middot; {enr.programme_name}</span>
                      <span style={{ color: '#0D9488' }}>{enr.status}</span>
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>
                      Enrolment ID: <code>{enr.enrolment_number}</code> &middot; Fee: {fmtMoney(enr.agreed_tuition_fee)} &middot; Start: {enr.start_date}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Tuition Invoices */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tuition Invoices ({studentInvoices.length})
            </div>
            {studentInvoices.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>
                No invoices issued for this student yet. Use Step 4 to issue one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {studentInvoices.map((inv) => (
                  <div key={inv.id} style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                      <span>{inv.invoiceDisplayNo} &middot; {inv.programmeName}</span>
                      <span style={{ color: inv.status === 'paid' ? '#059669' : inv.status === 'partial' ? '#D97706' : '#DC2626' }}>
                        {inv.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '12px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total: {fmtMoney(inv.totalAmount)} &middot; Paid: {fmtMoney(inv.paidAmount || 0)}</span>
                      <strong>Balance: {fmtMoney(inv.balanceAmount || 0)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Recorded Payments & Receipts */}
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Receipts Ledger ({studentPayments.length})
            </div>
            {studentPayments.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>
                No fee deposits recorded for this student yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {studentPayments.map((p) => (
                  <div key={p.id} style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>
                        {p.receiptDisplayNo} &middot; {fmtMoney(p.amount)}
                      </div>
                      <div style={{ color: '#64748B', fontSize: '11.5px' }}>
                        {p.paymentMethod} &middot; Ref: {p.reference || '—'} &middot; {p.paymentDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      id={`btnViewReceipt-${p.id}`}
                      onClick={() => setViewingReceipt(p)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '4px',
                        color: '#1D4ED8',
                        cursor: 'pointer',
                      }}
                    >
                      View Receipt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Journey Workflow Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Action Step 1: Register New Student */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB' }}>STAGE 1 &middot; ADMISSIONS</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>
                  Register Vocational Student
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Capture identity, personal details, contact bounds, and sponsor details.
                </p>
              </div>
              <button
                type="button"
                id="btnJourneyOpenStudentModal"
                onClick={() => setIsStudentModalOpen(true)}
                style={{
                  backgroundColor: '#2563EB',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Register Student &rarr;
              </button>
            </div>
          </div>

          {/* Action Step 2: Schedule New Cohort */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED' }}>STAGE 2 &middot; ACADEMIC PLANNING</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>
                  Schedule Academic Cohort
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Schedule a new cohort. Newly created cohorts immediately appear in enrolment options.
                </p>
              </div>
              <button
                type="button"
                id="btnJourneyOpenCohortModal"
                onClick={() => setIsCohortModalOpen(true)}
                style={{
                  backgroundColor: '#7C3AED',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Create Cohort &rarr;
              </button>
            </div>
          </div>

          {/* Action Step 3: Enrol Student */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488' }}>STAGE 3 &middot; ENROLMENT</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>
                  Enrol Student in Programme
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Select programme and cohort. Duplicate enrolments are strictly blocked.
                </p>
              </div>
              <button
                type="button"
                id="btnJourneyOpenEnrolmentModal"
                onClick={() => setIsEnrolmentModalOpen(true)}
                style={{
                  backgroundColor: '#0D9488',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Enrol Student &rarr;
              </button>
            </div>
          </div>

          {/* Action Step 4: Issue Tuition Invoice */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A' }}>STAGE 4 &middot; BILLING</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>
                  Issue Tuition Invoice
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Calculate line items and generate an official tuition invoice for the student.
                </p>
              </div>
              <button
                type="button"
                id="btnJourneyOpenInvoiceModal"
                onClick={() => setIsInvoiceModalOpen(true)}
                style={{
                  backgroundColor: '#0F172A',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Issue Invoice &rarr;
              </button>
            </div>
          </div>

          {/* Action Step 5: Record Payment against Invoice */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#B45309' }}>STAGE 5 &middot; CASH RECORDING</div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 10px 0' }}>
              Record Tuition Deposit
            </h3>

            <form onSubmit={handleQuickPaymentSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Target Invoice *
                  </label>
                  <select
                    id="journeyPayInvoiceSelect"
                    aria-label="Target Invoice to Credit"
                    value={quickPayInvoiceId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setQuickPayInvoiceId(id);
                      const inv = targetInvoices.find((t) => t.id === id);
                      if (inv) setQuickPayAmount(inv.balanceAmount);
                    }}
                    required
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12.5px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                  >
                    <option value="">-- Select Invoice --</option>
                    {targetInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceDisplayNo} &middot; {inv.studentName} (Bal: {fmtMoney(inv.balanceAmount)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Payment Amount (₦) *
                  </label>
                  <input
                    type="number"
                    id="journeyPayAmountInput"
                    aria-label="Payment Amount"
                    min="1"
                    step="any"
                    required
                    value={quickPayAmount || ''}
                    onChange={(e) => setQuickPayAmount(Number(e.target.value))}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12.5px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Overpayment Warning Banner */}
              {isOverpayment && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '5px',
                    fontSize: '12px',
                    color: '#B45309',
                    marginBottom: '12px',
                  }}
                >
                  <strong>Overpayment Notice:</strong> Entered amount exceeds displayed balance by{' '}
                  <strong>{fmtMoney(quickPayAmount - selectedTargetInvoice.balanceAmount)}</strong>. Surplus will be credited to student account.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Payment Channel
                  </label>
                  <select
                    value={quickPayMethod}
                    onChange={(e) => setQuickPayMethod(e.target.value as PaymentMethod)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12.5px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="POS">POS Terminal</option>
                    <option value="Card">Card</option>
                    <option value="Cash">Cash Deposit</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Bank Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GTB/TRF/20261019"
                    value={quickPayReference}
                    onChange={(e) => setQuickPayReference(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12.5px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                id="btnJourneySubmitPayment"
                disabled={isSubmittingPayment}
                style={{
                  backgroundColor: '#B45309',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isSubmittingPayment ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isSubmittingPayment ? 'Recording Deposit...' : 'Confirm Deposit & Generate Receipt'}
              </button>
            </form>
          </div>

          {/* Action Step 6: Record Lifecycle & Deletion Safety */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626' }}>STAGE 6 &middot; AUDIT &amp; RETENTION</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>
                  Record Lifecycle &amp; Deletion
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Verify referential dependency blocks when attempting destructive actions on records with dependencies.
                </p>
              </div>
              <button
                type="button"
                id="btnJourneyOpenLifecycleModal"
                onClick={() => setIsLifecycleModalOpen(true)}
                style={{
                  backgroundColor: '#DC2626',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Test Lifecycle &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Render Modals with Preview Context Adapters */}
      {isStudentModalOpen && (
        <StudentRegistrationModal
          isOpen={isStudentModalOpen}
          onClose={() => setIsStudentModalOpen(false)}
          customSubmitHandler={async (payload) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            const appNum = Math.floor(202600 + Math.random() * 900);
            const newStu: Student = {
              id: `stu_mock_${Date.now()}`,
              tenant_id: MOCK_PREVIEW_USER.tenant_id,
              customer_id: null,
              user_id: null,
              student_number: `STU-2026-${appNum}`,
              first_name: payload.firstName,
              last_name: payload.lastName,
              email: payload.email || null,
              phone: payload.phone || null,
              gender: payload.gender || null,
              address: payload.address || null,
              emergency_contact_name: null,
              emergency_contact_phone: null,
              status: 'ACTIVE',
              metadata: { source: 'LOCAL_PREVIEW' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            registerStudent(newStu);
            return { success: true, student: newStu };
          }}
          onSaved={(stu) => {
            setFeedback({
              type: 'success',
              message: `Student ${stu.first_name} ${stu.last_name} (${stu.student_number}) registered successfully and activated in mock session.`,
            });
          }}
        />
      )}

      {isCohortModalOpen && (
        <AddCohortModal
          isOpen={isCohortModalOpen}
          programmes={academicProgrammes}
          facilitators={MOCK_PREVIEW_FACILITATORS}
          onClose={() => setIsCohortModalOpen(false)}
          customSubmitHandler={async (payload) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            const newCoh: Cohort = {
              id: `coh_mock_${Date.now()}`,
              tenant_id: MOCK_PREVIEW_USER.tenant_id,
              programme_id: payload.programme_id,
              lead_facilitator_id: payload.lead_facilitator_id,
              cohort_code: payload.cohort_code,
              name: payload.name,
              start_date: payload.start_date,
              end_date: payload.end_date || '',
              delivery_mode: payload.delivery_mode,
              capacity: payload.capacity,
              status: payload.status,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            createCohort(newCoh);
            return { success: true, cohort: newCoh };
          }}
          onCohortCreated={(coh) => {
            setFeedback({
              type: 'success',
              message: `Academic Cohort ${coh.name} (${coh.cohort_code}) scheduled. It is now immediately selectable in Enrolment.`,
            });
          }}
        />
      )}

      {isEnrolmentModalOpen && (
        <AddEnrolmentModal
          isOpen={isEnrolmentModalOpen}
          student={selectedStudent}
          existingEnrolmentCohortIds={enrolledCohortIdsForSelectedStudent}
          programmes={admissionsProgrammes}
          cohorts={cohorts}
          onClose={() => setIsEnrolmentModalOpen(false)}
          customSubmitHandler={async (payload) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            return enrolStudent(payload);
          }}
          onEnrolled={(enr) => {
            setFeedback({
              type: 'success',
              message: `Student ${selectedStudent.first_name} ${selectedStudent.last_name} enrolled in ${enr?.cohort_code || 'Cohort'} (Ref: ${enr?.enrolment_number || 'ENR-2026-MOCK'}).`,
            });
          }}
        />
      )}

      {isInvoiceModalOpen && (
        <CreateProfessionalTuitionInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          programmes={admissionsProgrammes.map((p) => ({ id: p.id, name: p.name, price: p.tuition_fee }))}
          customers={students.map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, email: s.email || '', phone: s.phone || '' }))}
          paymentAccounts={MOCK_PREVIEW_PAYMENT_ACCOUNTS}
          financeSettings={MOCK_PREVIEW_SETTINGS}
          customSubmitHandler={async (payload) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            const invNo = Math.floor(1050 + Math.random() * 500);
            const syntheticInvoice: Invoice = {
              id: `inv_mock_${Date.now()}`,
              tenantId: MOCK_PREVIEW_USER.tenant_id,
              invoiceNo: invNo,
              invoiceDisplayNo: `INV-2026-${invNo}`,
              programmeId: payload.programmeId,
              programmeName: payload.programmeName,
              studentName: payload.clientName,
              studentEmail: payload.email,
              studentPhone: payload.phone,
              invoiceDate: payload.invoiceDate,
              dueDate: payload.dueDate,
              paymentPlan: payload.paymentPlan,
              installmentsCount: payload.paymentPlan === 'installment' ? 2 : 1,
              basePrice: payload.basePrice,
              discountPct: payload.discountPct,
              discountAmount: payload.discountAmount,
              totalAmount: payload.totalAmount,
              incomeCategory: payload.billingCategory || 'Tuition Fee',
              status: 'unpaid',
              source: 'LOCAL_PREVIEW',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              paidAmount: 0,
              balanceAmount: payload.totalAmount,
            };
            issueInvoice(syntheticInvoice);
            return { success: true, invoice: syntheticInvoice };
          }}
          onInvoiceCreated={(inv) => {
            setFeedback({
              type: 'success',
              message: `Tuition invoice ${inv.invoiceDisplayNo} for ${inv.studentName} issued (${fmtMoney(inv.totalAmount)}). Ready for deposit.`,
            });
          }}
        />
      )}

      {isLifecycleModalOpen && (
        <RecordLifecycleModal
          isOpen={isLifecycleModalOpen}
          actionType={lifecycleAction}
          entityName="Student Registration Record"
          recordIdentifier={`${selectedStudent.student_number} (${selectedStudent.first_name} ${selectedStudent.last_name})`}
          dependencies={
            lifecycleAction === 'DELETE' && studentEnrolments.length > 0
              ? [
                  { label: 'Active Academic Enrolments', count: studentEnrolments.length },
                  { label: 'Unsettled Tuition Invoices', count: studentInvoices.length },
                ]
              : undefined
          }
          blockedMessage={
            lifecycleAction === 'DELETE' && studentEnrolments.length > 0
              ? 'Deletion blocked: Active academic enrolments and ledger records exist for this student.'
              : undefined
          }
          isLoading={false}
          onClose={() => setIsLifecycleModalOpen(false)}
          onConfirm={(reason) => {
            const res = performLifecycleAction(lifecycleAction, 'student', selectedStudent.id, reason);
            if (!res.success) {
              setFeedback({ type: 'error', message: res.error || 'Action failed.' });
            } else {
              setFeedback({
                type: 'success',
                message: `Simulated ${lifecycleAction} completed successfully on student profile.`,
              });
            }
            setIsLifecycleModalOpen(false);
          }}
        />
      )}

      {/* Canonical Receipt Modal */}
      {viewingReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingReceipt(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#0F172A' }}>
                Canonical Student Tuition Receipt — {viewingReceipt.receiptDisplayNo}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  id="btnPrintReceipt"
                  onClick={handlePrintReceipt}
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    fontSize: '18px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, backgroundColor: '#F8FAFC' }}>
              <div ref={receiptDocRef}>
                <CanonicalReceiptDocument
                  payment={viewingReceipt}
                  invoice={invoices.find((i) => i.id === viewingReceipt.invoiceId) || null}
                  financeSettings={MOCK_PREVIEW_SETTINGS}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
