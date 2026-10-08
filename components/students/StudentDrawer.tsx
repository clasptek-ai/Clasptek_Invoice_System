/**
 * components/students/StudentDrawer.tsx — Phase 4
 * Authoritative Clasptek Student Profile & 360° Dossier.
 * Features:
 * - 5-tab dossier: Identity/Bio, Sponsor/Emergency, Academic/Enrolments, Finance, Audit History
 * - Clear "Not yet enrolled" badge when enrolments.length === 0
 * - "Edit Student Profile" modal trigger with audited reason
 * - Immutable identifiers protection
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { Student, StudentDossier, StudentAuditTrailEntry } from '@/types/students';
import { EditStudentModal } from './EditStudentModal';
import { AddEnrolmentModal } from './AddEnrolmentModal';

interface StudentDrawerProps {
  dossier: StudentDossier | null;
  isLoading?: boolean;
  onClose: () => void;
  onStudentUpdated?: (updated: Student) => void;
  onRefreshDossier?: () => void;
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

export function StudentDrawer({
  dossier,
  isLoading,
  onClose,
  onStudentUpdated,
  onRefreshDossier,
}: StudentDrawerProps) {
  const [activeTab, setActiveTab] = useState<'bio' | 'profile' | 'sponsor' | 'academic' | 'finance' | 'audit'>('bio');
  const [currentDossier, setCurrentDossier] = useState<StudentDossier | null>(dossier);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(dossier?.student || null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEnrolModalOpen, setIsEnrolModalOpen] = useState(false);

  useEffect(() => {
    if (dossier) {
      setCurrentDossier(dossier);
      if (dossier.student) {
        setCurrentStudent(dossier.student);
      }
    }
  }, [dossier]);

  const refreshDossier = async () => {
    const sId = currentStudent?.id || currentDossier?.student?.id;
    if (!sId) return;
    try {
      const res = await fetch(`/api/students/${sId}/dossier`);
      if (res.ok) {
        const json = await res.json();
        if (json.dossier) {
          setCurrentDossier(json.dossier);
          if (json.dossier.student) {
            setCurrentStudent(json.dossier.student);
            onStudentUpdated?.(json.dossier.student);
          }
        }
      }
    } catch (err) {
      console.error('Failed to reload student dossier', err);
    }
    onRefreshDossier?.();
  };

  if (!dossier && !isLoading) return null;

  const activeDossier = currentDossier || dossier;
  const stu = currentStudent || activeDossier?.student;
  const meta = (stu?.metadata as Record<string, unknown>) || {};
  const auditTrail: StudentAuditTrailEntry[] = Array.isArray(meta.audit_trail)
    ? (meta.audit_trail as StudentAuditTrailEntry[])
    : [];

  const handleSaveStudent = (updated: Student) => {
    setCurrentStudent(updated);
    onStudentUpdated?.(updated);
  };

  return (
    <div className="cp-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="cp-modal"
        style={{ maxWidth: '880px', width: '95%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading student dossier...
          </div>
        ) : activeDossier && stu ? (
          <>
            {/* Header */}
            <div className="cp-modal-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', padding: '16px 20px' }}>
              <div style={{ flex: '1 1 280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="cp-modal-title" style={{ fontSize: '18px', fontWeight: 800 }}>
                    👨‍🎓 {stu.first_name} {meta.middleName ? String(meta.middleName) + ' ' : ''}{stu.last_name}
                  </div>
                  <span className="cp-pill paid" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                    {stu.student_number || 'STU-—'}
                  </span>
                  <span
                    className={`cp-pill ${
                      stu.status === 'ACTIVE'
                        ? 'active'
                        : stu.status === 'COMPLETED'
                        ? 'paid'
                        : 'draft'
                    }`}
                  >
                    {stu.status}
                  </span>
                  {/* Authoritative Enrolment State Derived from public.enrolments */}
                  {activeDossier.enrolments.length === 0 ? (
                    <span
                      className="cp-pill draft"
                      style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}
                    >
                      Not yet enrolled
                    </span>
                  ) : (
                    <span className="cp-pill active">
                      Enrolled ({activeDossier.enrolments.length})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Central Student &amp; Client Directory &middot; {stu.email || 'No email'} &middot;{' '}
                  {stu.phone || 'No phone'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="cp-btn primary"
                  id="btnEnrolStudentFromDossier"
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}
                  onClick={() => setIsEnrolModalOpen(true)}
                >
                  🎓 Enrol Student
                </button>
                <button
                  type="button"
                  className="cp-btn secondary"
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  onClick={() => setIsEditModalOpen(true)}
                >
                  ✏️ Edit Profile
                </button>
                <button
                  type="button"
                  className="cp-modal-close"
                  id="btnCloseProfileDossier"
                  onClick={onClose}
                  aria-label="Close dossier"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Dossier Tabs Navigation */}
            <div className="cp-modal-body" style={{ padding: 0 }}>
              <div
                className="no-print"
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border, #E2E8F0)',
                  background: 'var(--surface-1, #F8FAFC)',
                  padding: '0 16px',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
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
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${activeTab === 'bio' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'bio' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  👤 Personal &amp; Contact
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${activeTab === 'profile' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'profile' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  📋 Registration &amp; Profile
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
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
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
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${activeTab === 'academic' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'academic' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  🎓 Academic &amp; Enrolments ({activeDossier.enrolments.length})
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
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${activeTab === 'finance' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'finance' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  💳 Financial Position
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${activeTab === 'audit' ? 'var(--primary, #0F172A)' : 'transparent'}`,
                    color: activeTab === 'audit' ? 'var(--primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  }}
                >
                  📜 Audit History ({auditTrail.length})
                </button>
              </div>

              {/* Tab 1: Bio — Personal & Contact Details */}
              {activeTab === 'bio' && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Section: Identity & Personal Details */}
                  <div>
                    <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Identity &amp; Personal Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                      <div>
                        <div className="cp-field-label">Student Name (Derived)</div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {stu.first_name} {meta.middleName ? String(meta.middleName) + ' ' : ''}{stu.last_name}
                        </div>
                      </div>
                      <div>
                        <div className="cp-field-label">Student ID (Immutable)</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>
                          {stu.student_number}
                        </div>
                      </div>
                      <div>
                        <div className="cp-field-label">First Name</div>
                        <div style={{ fontSize: '13px' }}>{stu.first_name || '—'}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Middle Name</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.middleName || '—')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Last Name</div>
                        <div style={{ fontSize: '13px' }}>{stu.last_name || '—'}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Gender</div>
                        <div style={{ fontSize: '13px' }}>{stu.gender || '—'}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Date of Birth</div>
                        <div style={{ fontSize: '13px' }}>{fmtDate(meta.dateOfBirth as string)}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Nationality</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.nationality || 'Nigerian')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">State of Origin / State</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.stateOfOrigin || meta.state || '—')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Religion</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.religion || '—')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Marital Status</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.maritalStatus || '—')}</div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Contact Details */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Contact Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                      <div>
                        <div className="cp-field-label">Email Address</div>
                        <div style={{ fontSize: '13px' }}>{stu.email || '—'}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Primary Phone Number</div>
                        <div style={{ fontSize: '13px' }}>{stu.phone || '—'}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Alternative Phone (Phone 2)</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.phone2 || meta.alternativePhone || '—')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">Location / City</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.location || '—')}</div>
                      </div>
                      <div>
                        <div className="cp-field-label">State</div>
                        <div style={{ fontSize: '13px' }}>{String(meta.state || meta.stateOfOrigin || '—')}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="cp-field-label">Residential Address</div>
                        <div style={{ fontSize: '13px' }}>{stu.address || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Profile — Registration & Student Profile */}
              {activeTab === 'profile' && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Registration Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                      <div>
                        <div className="cp-field-label">Registration Date</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>
                          {fmtDate((meta.registrationDate as string) || stu.created_at)}
                        </div>
                      </div>
                      <div>
                        <div className="cp-field-label">Referral Source</div>
                        <div style={{ fontSize: '13.5px' }}>{String(meta.referralSource || '—')}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div className="cp-section-title" style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Student Profile &amp; Background
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                      <div>
                        <div className="cp-field-label">Student Expertise Level</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>
                          {String(meta.studentExpertiseLevel || meta.expertiseLevel || 'Beginner')}
                        </div>
                      </div>
                      <div>
                        <div className="cp-field-label">Employment Status</div>
                        <div style={{ fontSize: '13.5px' }}>
                          {String(meta.employmentStatus || '—')}
                        </div>
                      </div>
                      {Boolean(meta.notes) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="cp-field-label">Administrative Notes</div>
                          <div style={{ fontSize: '13px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            {String(meta.notes)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Sponsor & Emergency */}
              {activeTab === 'sponsor' && (
                <div style={{ padding: '20px' }}>
                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '12px' }}>
                    Sponsorship &amp; Financial Ledger Entity
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                    <div style={{ gridColumn: '1 / -1', background: '#F8FAFC', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div className="cp-field-label">Financial Customer Ledger Identity (public.customers)</div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
                        {activeDossier.corporateSponsor ? (
                          <span>
                            🏢 {activeDossier.corporateSponsor.name}{' '}
                            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-muted)' }}>
                              ({activeDossier.corporateSponsor.id})
                            </span>
                          </span>
                        ) : stu.customer_id ? (
                          <span style={{ fontFamily: 'var(--font-mono)' }}>🏢 {stu.customer_id}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>None (Self-Sponsored / Individual Student)</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Preserves institutional model: Student is the training identity; Customer is the financial ledger account.
                      </div>
                    </div>
                    <div>
                      <div className="cp-field-label">Has Sponsor?</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{String(meta.hasSponsor || (meta.sponsorName ? 'Yes' : 'No'))}</div>
                    </div>
                    <div>
                      <div className="cp-field-label">Sponsor Type</div>
                      <div style={{ fontSize: '13.5px' }}>{String(meta.sponsorType || (stu.customer_id ? 'Corporate' : 'Self'))}</div>
                    </div>
                    <div>
                      <div className="cp-field-label">Sponsor Name</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                        {activeDossier.corporateSponsor?.name || String(meta.sponsorName || '—')}
                      </div>
                    </div>
                    <div>
                      <div className="cp-field-label">Sponsor Phone Number</div>
                      <div style={{ fontSize: '13.5px' }}>{activeDossier.corporateSponsor?.phone || String(meta.sponsorPhone || '—')}</div>
                    </div>
                    <div>
                      <div className="cp-field-label">Sponsor's Email Address</div>
                      <div style={{ fontSize: '13.5px' }}>{activeDossier.corporateSponsor?.email || String(meta.sponsorEmail || '—')}</div>
                    </div>
                  </div>

                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '12px' }}>
                    Emergency Contact
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                    <div>
                      <div className="cp-field-label">Emergency Contact Name</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                        {stu.emergency_contact_name || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="cp-field-label">Emergency Phone</div>
                      <div style={{ fontSize: '13.5px' }}>{stu.emergency_contact_phone || '—'}</div>
                    </div>
                    <div>
                      <div className="cp-field-label">Relationship</div>
                      <div style={{ fontSize: '13.5px' }}>
                        {String(meta.emergencyContactRelationship || '—')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Academic & Enrolments */}
              {activeTab === 'academic' && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div className="cp-section-title" style={{ fontSize: '14px', margin: 0 }}>
                      Enrolled Programmes &amp; Cohorts
                    </div>
                    {activeDossier.enrolments.length > 0 && (
                      <button
                        type="button"
                        className="cp-btn primary"
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                        onClick={() => setIsEnrolModalOpen(true)}
                      >
                        + Enrol in Additional Programme/Cohort
                      </button>
                    )}
                  </div>
                  {activeDossier.enrolments.length === 0 ? (
                    <div style={{ padding: '28px 20px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '14px' }}>
                        Not yet enrolled in a programme.
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '16px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
                        Student registration exists independently. Enrolment into a programme cohort requires separate assignment.
                      </div>
                      <button
                        type="button"
                        className="cp-btn primary"
                        style={{ fontSize: '13px', padding: '8px 18px' }}
                        onClick={() => setIsEnrolModalOpen(true)}
                      >
                        + Enrol in Programme/Cohort
                      </button>
                    </div>
                  ) : (
                    <div className="cp-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table className="cp-table">
                        <thead>
                          <tr>
                            <th>Enrolment #</th>
                            <th>Programme</th>
                            <th>Cohort</th>
                            <th>Enrolment Date</th>
                            <th>Tuition Fee</th>
                            <th>Attendance</th>
                            <th>Certificate</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDossier.enrolments.map((enr) => (
                            <tr key={enr.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                {enr.enrolment_number}
                              </td>
                              <td style={{ fontWeight: 600 }}>{enr.programme_name}</td>
                              <td>{enr.cohort_name}</td>
                              <td>{fmtDate(enr.enrolment_date)}</td>
                              <td style={{ fontWeight: 600 }}>{fmtMoney(enr.agreed_tuition_fee)}</td>
                              <td>{enr.attendance_pct ? `${enr.attendance_pct}%` : '—'}</td>
                              <td>
                                {enr.certificate_issued ? (
                                  <span className="cp-pill paid" title={enr.certificate_number || 'Issued'}>
                                    🏆 {enr.certificate_number || 'Issued'}
                                  </span>
                                ) : (
                                  <span className="cp-pill draft">Pending</span>
                                )}
                              </td>
                              <td><span className="cp-pill active">{enr.status}</span></td>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Total Invoiced</div>
                      <div className="cp-kpi-val" style={{ fontSize: '18px', color: 'var(--primary)' }}>
                        {fmtMoney(activeDossier.totalInvoiced)}
                      </div>
                    </div>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Total Paid</div>
                      <div className="cp-kpi-val" style={{ fontSize: '18px', color: 'var(--success)' }}>
                        {fmtMoney(activeDossier.totalPaid)}
                      </div>
                    </div>
                    <div className="cp-kpi-card" style={{ padding: '12px 14px' }}>
                      <div className="cp-kpi-label">Balance Outstanding</div>
                      <div
                        className="cp-kpi-val"
                        style={{
                          fontSize: '18px',
                          color: activeDossier.balanceDue > 0 ? 'var(--warning)' : 'var(--success)',
                        }}
                      >
                        {fmtMoney(activeDossier.balanceDue)}
                      </div>
                    </div>
                  </div>

                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '10px' }}>
                    Invoices &amp; Billing History
                  </div>
                  {activeDossier.invoices.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                      No invoices issued for this student.
                    </div>
                  ) : (
                    <div className="cp-table-wrap" style={{ marginBottom: '18px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                          {activeDossier.invoices.map((inv) => (
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
                  {activeDossier.payments.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                      No payment receipts recorded for this student.
                    </div>
                  ) : (
                    <div className="cp-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                          {activeDossier.payments.map((p) => (
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

              {/* Tab 5: Authoritative Audit History */}
              {activeTab === 'audit' && (
                <div style={{ padding: '20px' }}>
                  <div className="cp-section-title" style={{ fontSize: '14px', marginBottom: '6px' }}>
                    Authoritative Profile Audit Trail
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Chronological, immutable record of administrative corrections with actor stamps and mandatory reasons.
                  </p>

                  {auditTrail.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No administrative profile modifications recorded yet. Record is in original registered state.
                    </div>
                  ) : (
                    <div className="cp-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table className="cp-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Field Changed</th>
                            <th>Previous Value</th>
                            <th>New Value</th>
                            <th>Modified By</th>
                            <th>Reason for Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditTrail.map((entry) => (
                            <tr key={entry.id}>
                              <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                {fmtDate(entry.timestamp)}{' '}
                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                {entry.field}
                              </td>
                              <td style={{ fontSize: '12px', color: '#991B1B', maxWidth: '140px', wordBreak: 'break-all' }}>
                                {typeof entry.previous_value === 'object' && entry.previous_value !== null
                                  ? JSON.stringify(entry.previous_value)
                                  : String(entry.previous_value ?? '—')}
                              </td>
                              <td style={{ fontSize: '12px', color: '#166534', fontWeight: 600, maxWidth: '140px', wordBreak: 'break-all' }}>
                                {typeof entry.new_value === 'object' && entry.new_value !== null
                                  ? JSON.stringify(entry.new_value)
                                  : String(entry.new_value ?? '—')}
                              </td>
                              <td style={{ fontSize: '12px' }}>
                                <strong>{entry.actor_name}</strong>
                                <br />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{entry.actor_role}</span>
                              </td>
                              <td style={{ fontSize: '12px', fontStyle: 'italic', maxWidth: '200px' }}>
                                &ldquo;{entry.reason}&rdquo;
                              </td>
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

            {/* Edit Student Modal */}
            {isEditModalOpen && (
              <EditStudentModal
                isOpen={isEditModalOpen}
                student={stu}
                onClose={() => setIsEditModalOpen(false)}
                onSaved={handleSaveStudent}
              />
            )}

            {/* Add Enrolment Modal */}
            {isEnrolModalOpen && stu && (
              <AddEnrolmentModal
                isOpen={isEnrolModalOpen}
                student={stu}
                existingEnrolmentCohortIds={activeDossier.enrolments.map((e) => (e as any).cohort_id).filter(Boolean)}
                onClose={() => setIsEnrolModalOpen(false)}
                onEnrolled={refreshDossier}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
