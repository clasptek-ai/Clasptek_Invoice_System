/**
 * components/admissions/EnquiryDrawer.tsx — Phase 3 & 9G
 * Slide-in detail drawer for a single prospect/enquiry.
 *
 * Implements the 4 authoritative sections:
 * 1. PROSPECT INFORMATION
 * 2. FINANCIAL STATUS (authoritative billing status, total invoiced, paid, balance + Generate Invoice action)
 * 3. RECOMMENDED NEXT ACTION (state-aware recommendation + direct action button)
 * 4. ADMISSIONS & FOLLOW-UP HISTORY (chronological timeline or "No admissions or follow-up interactions recorded yet.")
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Enquiry, EnquiryStatus, AdmissionsTimelineEvent } from '@/types/admissions';
import { ENQUIRY_TRANSITIONS, ENQUIRY_STATUS_LABELS } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';
import { RegisterStudentModal } from './RegisterStudentModal';

interface EnquiryDrawerProps {
  enquiry: Enquiry | null;
  onClose: () => void;
  onStatusChange?: (enquiryId: string, newStatus: EnquiryStatus) => Promise<void>;
  onNoteAppend?: (enquiryId: string, note: string, newStatus: EnquiryStatus | null) => Promise<void>;
  onGenerateInvoice?: (enquiry: Enquiry) => void;
  onOpenContactFollowUp?: (enquiry: Enquiry) => void;
}

function formatWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `https://wa.me/234${digits.slice(1)}`;
  if (digits.startsWith('234')) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}`;
}

function formatNaira(amount: number): string {
  return '₦' + Math.max(0, amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBillingBadgeStyle(status: string) {
  switch (status) {
    case 'PAID':
      return { bg: '#DEF7EC', text: '#03543F', border: '#BCF0DA', label: 'Paid' };
    case 'PARTIALLY_PAID':
      return { bg: '#FEF08A', text: '#854D0E', border: '#FDE047', label: 'Partially Paid' };
    case 'OVERDUE':
      return { bg: '#FDE8E8', text: '#9B1C1C', border: '#F8B4B4', label: 'Overdue' };
    case 'INVOICED':
      return { bg: '#E1EFFE', text: '#1E429F', border: '#B4C6FC', label: 'Invoiced' };
    case 'INVOICE_REQUESTED':
      return { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF', label: 'Invoice Requested' };
    case 'NOT_INVOICED':
    default:
      return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1', label: 'Not Invoiced' };
  }
}

export function EnquiryDrawer({
  enquiry,
  onClose,
  onStatusChange,
  onNoteAppend,
  onGenerateInvoice,
  onOpenContactFollowUp,
}: EnquiryDrawerProps) {
  const [note, setNote] = useState('');
  const [selectedNextStatus, setSelectedNextStatus] = useState<EnquiryStatus | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [localEnquiry, setLocalEnquiry] = useState<Enquiry | null>(enquiry);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  useEffect(() => {
    setLocalEnquiry(enquiry);
  }, [enquiry]);

  const [historyEvents, setHistoryEvents] = useState<AdmissionsTimelineEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const followUpFormRef = useRef<HTMLDivElement>(null);

  // Load history whenever active enquiry changes
  useEffect(() => {
    setNote('');
    setSelectedNextStatus('');
    setSaveError(null);
    setSaveSuccess(false);

    if (enquiry?.id) {
      setIsLoadingHistory(true);
      fetch(`/api/admissions/enquiries/${enquiry.id}/history`)
        .then((res) => (res.ok ? res.json() : Promise.reject('Failed to load history')))
        .then((data) => {
          if (data.history && Array.isArray(data.history)) {
            setHistoryEvents(data.history);
          } else {
            setHistoryEvents([]);
          }
        })
        .catch(() => {
          setHistoryEvents([]);
        })
        .finally(() => {
          setIsLoadingHistory(false);
        });
    } else {
      setHistoryEvents([]);
    }
  }, [enquiry?.id, enquiry?.updated_at]);

  // Focus trap: move focus into drawer when opened
  useEffect(() => {
    if (enquiry) {
      closeButtonRef.current?.focus();
    }
  }, [enquiry]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!enquiry) return;
    if (!note.trim() && !selectedNextStatus) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const newStatus = selectedNextStatus || null;
      if (onNoteAppend) {
        await onNoteAppend(enquiry.id, note.trim(), newStatus as EnquiryStatus | null);
      } else if (newStatus && onStatusChange) {
        await onStatusChange(enquiry.id, newStatus as EnquiryStatus);
      }
      setNote('');
      setSelectedNextStatus('');
      setSaveSuccess(true);

      // Re-fetch timeline history
      const histRes = await fetch(`/api/admissions/enquiries/${enquiry.id}/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.history) setHistoryEvents(histData.history);
      }

      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [enquiry, note, selectedNextStatus, onNoteAppend, onStatusChange]);

  if (!enquiry) return null;

  const wa = formatWhatsApp(enquiry.phone);
  const allowedTransitions = ENQUIRY_TRANSITIONS[enquiry.status] ?? [];
  const fin = enquiry.financials;
  const billingBadge = getBillingBadgeStyle(fin?.billingStatus || 'NOT_INVOICED');

  // Determine state-driven recommended next action
  const billingStatus = fin?.billingStatus || 'NOT_INVOICED';
  let recommendationTitle = 'Follow Up With Prospect';
  let recommendationDesc = 'Contact the prospect regarding their interest and answer questions.';
  let recommendationButtonLabel = 'Log Follow-Up';
  let recommendationAction = () => {
    if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
    else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!enquiry.programme_id) {
    recommendationTitle = 'Confirm Interested Programme';
    recommendationDesc = 'No programme has been selected yet. Contact prospect to confirm interested programme/course.';
    recommendationButtonLabel = 'Log Follow-Up';
    recommendationAction = () => {
      if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
      else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
  } else if (billingStatus === 'PAID') {
    recommendationTitle = 'Proceed with Admissions Intake';
    recommendationDesc = 'Tuition has been fully settled. Proceed to complete intake application and cohort enrolment.';
    recommendationButtonLabel = 'Proceed with Admissions';
    recommendationAction = () => {
      window.location.href = `/applications?action=new&name=${encodeURIComponent(enquiry.student_name)}&email=${encodeURIComponent(enquiry.email || '')}&phone=${encodeURIComponent(enquiry.phone || '')}&programme=${encodeURIComponent(enquiry.programme_id || '')}&enquiryId=${enquiry.id}`;
    };
  } else if (billingStatus === 'OVERDUE') {
    recommendationTitle = 'Follow Up on Overdue Tuition';
    recommendationDesc = `Tuition payment of ${formatNaira(fin?.balanceDue || 0)} is overdue. Send reminder to avoid admission cancellation.`;
    recommendationButtonLabel = 'Contact & Follow Up';
    recommendationAction = () => {
      if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
      else if (wa) window.open(wa, '_blank');
      else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
  } else if (billingStatus === 'PARTIALLY_PAID') {
    recommendationTitle = 'Follow Up on Outstanding Balance';
    recommendationDesc = `Candidate has paid ${formatNaira(fin?.amountPaid || 0)}. Remind them of balance due: ${formatNaira(fin?.balanceDue || 0)}.`;
    recommendationButtonLabel = 'Follow Up on Balance';
    recommendationAction = () => {
      if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
      else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
  } else if (billingStatus === 'INVOICED') {
    recommendationTitle = 'Follow Up on Payment';
    recommendationDesc = `Tuition invoice has been issued (${formatNaira(fin?.balanceDue || 0)}). Follow up on payment before the due date.`;
    recommendationButtonLabel = 'Follow Up on Payment';
    recommendationAction = () => {
      if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
      else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
  } else if (billingStatus === 'INVOICE_REQUESTED') {
    recommendationTitle = 'Generate Invoice';
    recommendationDesc = `Candidate requested official tuition invoice for ${enquiry.programme_name || 'selected programme'}.`;
    recommendationButtonLabel = 'Generate Invoice';
    recommendationAction = () => onGenerateInvoice?.(enquiry);
  } else if (enquiry.status === 'INTERESTED') {
    recommendationTitle = 'Generate Invoice';
    recommendationDesc = `Candidate is interested in ${enquiry.programme_name || 'the programme'}. Generate tuition invoice to initiate intake.`;
    recommendationButtonLabel = 'Generate Invoice';
    recommendationAction = () => onGenerateInvoice?.(enquiry);
  } else if (enquiry.status === 'NEW') {
    recommendationTitle = 'Contact Prospect';
    recommendationDesc = 'New lead received. Contact prospect directly to assess interest and determine programme.';
    recommendationButtonLabel = 'Contact Prospect';
    recommendationAction = () => {
      if (onOpenContactFollowUp) onOpenContactFollowUp(enquiry);
      else if (wa) window.open(wa, '_blank');
      else followUpFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
  }

  return (
    <div className="cp-drawer-overlay" onClick={onClose} aria-hidden="true">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Prospect details — ${enquiry.student_name}`}
        className="cp-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px', width: '100%' }}
      >
        {/* Drawer Header */}
        <div className="cp-drawer-header">
          <div>
            <h2 className="cp-drawer-title" style={{ fontSize: '18px', fontWeight: 800 }}>
              {enquiry.student_name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <StatusBadge status={enquiry.status} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: billingBadge.bg,
                  color: billingBadge.text,
                  border: `1px solid ${billingBadge.border}`,
                }}
              >
                {billingBadge.label}
              </span>
              {(localEnquiry?.is_registered_student || enquiry.is_registered_student) && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: '#DEF7EC',
                    color: '#03543F',
                    border: '1px solid #BCF0DA',
                  }}
                >
                  Registered Student
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="cp-drawer-close"
            aria-label="Close prospect drawer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="cp-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* SECTION 1: PROSPECT INFORMATION */}
          <section aria-labelledby="section-prospect-info">
            <h3
              id="section-prospect-info"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: 'var(--text-muted, #64748B)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Prospect Information
            </h3>
            <div className="cp-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', display: 'block' }}>Candidate Name</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                  {enquiry.student_name}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', display: 'block' }}>Interested Programme</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: enquiry.programme_name ? 'var(--text-primary, #0F172A)' : '#DC2626' }}>
                  {enquiry.programme_name ?? 'No programme selected'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', display: 'block' }}>Phone (WhatsApp)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {enquiry.phone ?? '—'}
                    </span>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cp-pill success"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', fontSize: '10px' }}
                        title="Chat on WhatsApp"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', display: 'block' }}>Email</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {enquiry.email ? (
                      <a href={`mailto:${enquiry.email}`} style={{ color: 'var(--interactive, #0284C7)', textDecoration: 'none' }}>
                        {enquiry.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>Acquisition Source:</span>
                <span className="cp-pill" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {enquiry.source || 'Direct'}
                </span>
              </div>

              {/* Student Lifecycle State & Action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', display: 'block' }}>Student Lifecycle Status:</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: (localEnquiry?.is_registered_student || enquiry.is_registered_student) ? '#059669' : '#475569' }}>
                    {(localEnquiry?.is_registered_student || enquiry.is_registered_student)
                      ? `Registered Student (${localEnquiry?.linked_student_number || enquiry.linked_student_number || 'STU'})`
                      : 'Prospect (Not yet registered)'}
                  </span>
                </div>
                {(localEnquiry?.is_registered_student || enquiry.is_registered_student) ? (
                  <a
                    href={`/students?search=${encodeURIComponent(localEnquiry?.linked_student_number || enquiry.linked_student_number || enquiry.student_name)}`}
                    className="cp-btn secondary"
                    style={{ fontSize: '11.5px', padding: '5px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>View Student Profile</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="cp-btn primary"
                    style={{
                      fontSize: '11.5px',
                      padding: '5px 12px',
                      backgroundColor: '#059669',
                      borderColor: '#059669',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                    <span>Register Student</span>
                  </button>
                )}
              </div>

              {/* Dedicated Contact & Follow-up Action */}
              {onOpenContactFollowUp && (
                <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenContactFollowUp(enquiry)}
                    className="cp-btn primary"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      padding: '8px 14px',
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span>Contact Prospect &amp; Log Follow-up</span>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 2: FINANCIAL STATUS */}
          <section aria-labelledby="section-financial-status">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3
                id="section-financial-status"
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--text-muted, #64748B)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                Financial Status
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: billingBadge.bg,
                  color: billingBadge.text,
                  border: `1px solid ${billingBadge.border}`,
                }}
              >
                {billingBadge.label}
              </span>
            </div>

            <div
              className="cp-card"
              style={{
                padding: '14px',
                background: '#FAFAFA',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Financial Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Total Invoiced</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {formatNaira(fin?.totalInvoiced || 0)}
                  </span>
                </div>

                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Amount Paid</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#16A34A' }}>
                    {formatNaira(fin?.amountPaid || 0)}
                  </span>
                </div>

                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Balance Due</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: (fin?.balanceDue || 0) > 0 ? 'var(--accent, #C1272D)' : '#059669' }}>
                    {formatNaira(fin?.balanceDue || 0)}
                  </span>
                </div>
              </div>

              {/* Linked Invoices List */}
              {fin && fin.invoices.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                    Associated Invoices ({fin.invoices.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {fin.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.invoiceDisplayNo}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            Due: {inv.dueDate || '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800 }}>{formatNaira(inv.totalAmount)}</span>
                          <span className={`cp-pill ${inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'info'}`} style={{ fontSize: '10px' }}>
                            {inv.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate Invoice Action Button */}
              <button
                type="button"
                className="cp-btn primary"
                onClick={() => onGenerateInvoice?.(enquiry)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Generate Invoice
              </button>
            </div>
          </section>

          {/* SECTION 3: RECOMMENDED NEXT ACTION */}
          <section aria-labelledby="section-recommended-action">
            <h3
              id="section-recommended-action"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: 'var(--text-muted, #64748B)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Recommended Next Action
            </h3>
            <div
              className="cp-card"
              style={{
                padding: '14px',
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ color: '#B45309', marginTop: '2px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E' }}>
                    {recommendationTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350F', marginTop: '2px', lineHeight: 1.4 }}>
                    {recommendationDesc}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={recommendationAction}
                  className="cp-btn accent"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {recommendationButtonLabel} →
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 4: ADMISSIONS & FOLLOW-UP HISTORY */}
          <section aria-labelledby="section-admissions-history">
            <h3
              id="section-admissions-history"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: 'var(--text-muted, #64748B)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Admissions &amp; Follow-up History
            </h3>

            {isLoadingHistory ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
                <span style={{ fontSize: '12px', marginLeft: '8px' }}>Loading timeline history…</span>
              </div>
            ) : historyEvents.length === 0 ? (
              <div
                className="cp-card"
                style={{
                  padding: '16px',
                  textAlign: 'center',
                  color: 'var(--text-muted, #64748B)',
                  fontSize: '13px',
                  fontStyle: 'italic',
                }}
              >
                No admissions or follow-up interactions recorded yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  paddingLeft: '18px',
                  borderLeft: '2px solid var(--border, #E2E8F0)',
                  marginLeft: '8px',
                }}
              >
                {historyEvents.map((evt) => (
                  <div key={evt.id} style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '-24px',
                        top: '4px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent, #C1272D)',
                        border: '2px solid #FFFFFF',
                      }}
                      aria-hidden="true"
                    />
                    <div className="cp-card" style={{ padding: '10px 12px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {evt.date}
                        </span>
                        <span className="cp-pill" style={{ fontSize: '10px', fontWeight: 700 }}>
                          {evt.activityType}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                        {evt.description}
                      </div>
                      {evt.previousStatus && evt.newStatus && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Status: {evt.previousStatus} → <strong>{evt.newStatus}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        By: {evt.staffName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Follow-up Note Logger & Status Progression */}
          {allowedTransitions.length > 0 && (
            <section ref={followUpFormRef} aria-labelledby="section-log-interaction">
              <h3
                id="section-log-interaction"
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--text-muted, #64748B)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '8px',
                }}
              >
                Log Interaction &amp; Progress Status
              </h3>
              <div className="cp-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="drawerFollowUpNote">Interaction Notes</label>
                  <textarea
                    id="drawerFollowUpNote"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Document call, WhatsApp discussion, interview, or next admissions step…"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="drawerNextStatus">Progress Status (Optional)</label>
                  <select
                    id="drawerNextStatus"
                    value={selectedNextStatus}
                    onChange={(e) => setSelectedNextStatus(e.target.value as EnquiryStatus | '')}
                  >
                    <option value="">Keep current: {ENQUIRY_STATUS_LABELS[enquiry.status]}</option>
                    {allowedTransitions.map((s) => (
                      <option key={s} value={s}>
                        → {ENQUIRY_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {saveError && (
                  <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div role="status" className="cp-alert success" style={{ margin: 0 }}>
                    ✓ Interaction recorded successfully.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || (!note.trim() && !selectedNextStatus)}
                  className="cp-btn primary"
                  style={{ width: '100%', fontWeight: 700 }}
                  aria-busy={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Record Interaction'}
                </button>
              </div>
            </section>
          )}

        </div>
      </div>

      {/* Register Student Modal */}
      {isRegisterModalOpen && (
        <RegisterStudentModal
          isOpen={isRegisterModalOpen}
          enquiry={localEnquiry || enquiry}
          onClose={() => setIsRegisterModalOpen(false)}
          onSuccess={(newStudent) => {
            setLocalEnquiry((prev) =>
              prev
                ? {
                    ...prev,
                    is_registered_student: true,
                    linked_student_id: newStudent.id,
                    linked_student_number: newStudent.student_number,
                  }
                : null
            );
          }}
        />
      )}
    </div>
  );
}
