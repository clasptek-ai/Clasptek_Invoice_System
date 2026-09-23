/**
 * components/students/StudentDrawer.tsx — Phase 4
 * Exact legacy Clasptek 4-tab Student Profile & 360° Dossier.
 * Reference: index.html lines 37293–37430
 */

'use client';

import React, { useState } from 'react';
import type { StudentDossier } from '@/types/students';

interface StudentDrawerProps {
  dossier: StudentDossier | null;
  isLoading?: boolean;
  onClose: () => void;
}

function fmtMoney(amount: number): string {
  return '₦' + Number(amount || 0).toLocaleString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function StudentDrawer({ dossier, isLoading, onClose }: StudentDrawerProps) {
  const [activeTab, setActiveTab] = useState<'bio' | 'sponsor' | 'academic' | 'finance'>('bio');

  if (!dossier && !isLoading) return null;

  return (
    <div className="cp-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="cp-modal"
        style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading student dossier...
          </div>
        ) : dossier ? (
          <>
            {/* Header */}
            <div className="cp-modal-header no-print" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="cp-modal-title" style={{ fontSize: '20px', fontWeight: 800 }}>
                    👨‍🎓 {dossier.student.first_name} {dossier.student.last_name}
                  </div>
                  <span className="cp-pill paid" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                    {dossier.student.student_number || 'STU-—'}
                  </span>
                  <span
                    className={`cp-pill ${
                      dossier.student.status === 'ACTIVE'
                        ? 'active'
                        : dossier.student.status === 'COMPLETED'
                        ? 'paid'
                        : 'draft'
                    }`}
                  >
                    {dossier.student.status}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Central CRM Student Dossier &middot; {dossier.student.email || 'No email'} &middot;{' '}
                  {dossier.student.phone || 'No phone'}
                </div>
              </div>
              <button
                type="button"
                className="cp-modal-close"
                id="btnCloseProfileDossier"
                onClick={onClose}
              >
                &times;
              </button>
            </div>

            {/* Dossier Tabs Navigation */}
            <div className="cp-modal-body" style={{ padding: 0 }}>
              <div
                className="no-print"
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border, #E2E8F0)',
                  background: '#F8FAFC',
                  padding: '0 20px',
                  overflowX: 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('bio')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${activeTab === 'bio' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'bio' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  👤 Identity &amp; Bio
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sponsor')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${activeTab === 'sponsor' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'sponsor' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  🤝 Sponsor &amp; Emergency
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('academic')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${activeTab === 'academic' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'academic' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  🎓 Academic &amp; Enrolments ({dossier.enrolments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('finance')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: `2px solid ${activeTab === 'finance' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'finance' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  💰 Financial Position ({fmtMoney(dossier.balanceDue)} Due)
                </button>
              </div>

              {/* Tab 1: Identity & Bio */}
              {activeTab === 'bio' && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div className="cp-card" style={{ padding: '14px' }}>
                      <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '10px' }}>
                        Personal Identification
                      </div>
                      <table style={{ width: '100%', fontSize: '12.5px', lineHeight: 2 }}>
                        <tbody>
                          <tr>
                            <td style={{ color: 'var(--text-muted)', width: '130px' }}>Full Name:</td>
                            <td><strong>{dossier.student.first_name} {dossier.student.last_name}</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Middle Name:</td>
                            <td>{dossier.student.metadata?.middleName || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Date of Birth:</td>
                            <td>{fmtDate(dossier.student.metadata?.dateOfBirth || null)}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Gender:</td>
                            <td>{dossier.student.gender || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Marital Status:</td>
                            <td>{dossier.student.metadata?.maritalStatus || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>State of Origin:</td>
                            <td>{dossier.student.metadata?.stateOfOrigin || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Nationality:</td>
                            <td>{dossier.student.metadata?.nationality || 'Nigerian'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="cp-card" style={{ padding: '14px' }}>
                      <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '10px' }}>
                        Contact &amp; Residence
                      </div>
                      <table style={{ width: '100%', fontSize: '12.5px', lineHeight: 2 }}>
                        <tbody>
                          <tr>
                            <td style={{ color: 'var(--text-muted)', width: '130px' }}>Phone:</td>
                            <td><strong>{dossier.student.phone || '—'}</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Email:</td>
                            <td>{dossier.student.email || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Address:</td>
                            <td>{dossier.student.address || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Employment:</td>
                            <td>{dossier.student.metadata?.employmentStatus || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Registered:</td>
                            <td>{fmtDate(dossier.student.created_at)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Sponsor & Emergency */}
              {activeTab === 'sponsor' && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div className="cp-card" style={{ padding: '14px' }}>
                      <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '10px' }}>
                        Sponsorship Information
                      </div>
                      <table style={{ width: '100%', fontSize: '12.5px', lineHeight: 2 }}>
                        <tbody>
                          <tr>
                            <td style={{ color: 'var(--text-muted)', width: '140px' }}>Sponsor Type:</td>
                            <td><strong>{dossier.student.metadata?.sponsorType || 'Self'}</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Sponsor Name:</td>
                            <td>{dossier.student.metadata?.sponsorName || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Sponsor Phone:</td>
                            <td>{dossier.student.metadata?.sponsorPhone || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Sponsor Email:</td>
                            <td>{dossier.student.metadata?.sponsorEmail || '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="cp-card" style={{ padding: '14px' }}>
                      <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '10px' }}>
                        Emergency Contact / Next of Kin
                      </div>
                      <table style={{ width: '100%', fontSize: '12.5px', lineHeight: 2 }}>
                        <tbody>
                          <tr>
                            <td style={{ color: 'var(--text-muted)', width: '140px' }}>Contact Name:</td>
                            <td><strong>{dossier.student.emergency_contact_name || '—'}</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Contact Phone:</td>
                            <td>{dossier.student.emergency_contact_phone || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>Relationship:</td>
                            <td>{dossier.student.metadata?.emergencyContactRelationship || 'Parent / Guardian'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Academic & Enrolments */}
              {activeTab === 'academic' && (
                <div style={{ padding: '20px' }}>
                  {dossier.enrolments.length === 0 ? (
                    <div className="cp-empty-state">
                      <div className="cp-empty-icon">🎓</div>
                      <div className="cp-empty-title">No enrolment records found</div>
                      <div className="cp-empty-desc">This student has not been enrolled in any training programme cohorts yet.</div>
                    </div>
                  ) : (
                    <div className="cp-table-wrap">
                      <table className="cp-table">
                        <thead>
                          <tr>
                            <th>Enrolment #</th>
                            <th>Programme</th>
                            <th>Cohort</th>
                            <th style={{ textAlign: 'right' }}>Agreed Tuition</th>
                            <th>Enrolment Date</th>
                            <th style={{ textAlign: 'center' }}>Attendance</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.enrolments.map((en) => (
                            <tr key={en.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                {en.enrolment_number}
                              </td>
                              <td style={{ fontWeight: 600 }}>{en.programme_name}</td>
                              <td>{en.cohort_name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {fmtMoney(en.agreed_tuition_fee)}
                              </td>
                              <td>{fmtDate(en.enrolment_date)}</td>
                              <td style={{ textAlign: 'center' }}>{en.attendance_pct}%</td>
                              <td>
                                <span className={`cp-pill ${en.status === 'ACTIVE' ? 'active' : 'paid'}`}>
                                  {en.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Financial Position */}
              {activeTab === 'finance' && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Total Invoiced</div>
                      <div className="cp-kpi-val" style={{ fontSize: '18px', color: 'var(--primary)' }}>
                        {fmtMoney(dossier.totalInvoiced)}
                      </div>
                    </div>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Total Paid</div>
                      <div className="cp-kpi-val" style={{ fontSize: '18px', color: 'var(--success)' }}>
                        {fmtMoney(dossier.totalPaid)}
                      </div>
                    </div>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Balance Outstanding</div>
                      <div
                        className="cp-kpi-val"
                        style={{
                          fontSize: '18px',
                          color: dossier.balanceDue > 0 ? 'var(--warning)' : 'var(--success)',
                        }}
                      >
                        {fmtMoney(dossier.balanceDue)}
                      </div>
                    </div>
                  </div>

                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '10px' }}>
                    Invoices &amp; Billing History
                  </div>
                  {dossier.invoices.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                      No invoices issued for this student.
                    </div>
                  ) : (
                    <div className="cp-table-wrap" style={{ marginBottom: '18px' }}>
                      <table className="cp-table">
                        <thead>
                          <tr>
                            <th>Invoice #</th>
                            <th>Issue Date</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.invoices.map((inv) => (
                            <tr key={inv.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{inv.invoice_number}</td>
                              <td>{fmtDate(inv.issue_date)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(inv.amount)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(inv.balance)}</td>
                              <td><span className="cp-pill active">{inv.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '10px' }}>
                    Receipts &amp; Payments
                  </div>
                  {dossier.payments.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                      No payment receipts recorded for this student.
                    </div>
                  ) : (
                    <div className="cp-table-wrap">
                      <table className="cp-table">
                        <thead>
                          <tr>
                            <th>Receipt #</th>
                            <th>Payment Date</th>
                            <th style={{ textAlign: 'right' }}>Amount Paid</th>
                            <th>Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.payments.map((p) => (
                            <tr key={p.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{p.receipt_number}</td>
                              <td>{fmtDate(p.payment_date)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                                {fmtMoney(p.amount)}
                              </td>
                              <td><span className="cp-pill paid">{p.method}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="cp-modal-footer no-print" style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="cp-btn secondary" onClick={onClose}>
                Close Dossier
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
