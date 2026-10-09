'use client';

/**
 * components/students/EditStudentModal.tsx
 * Authoritative Admin Student Profile Edit Modal
 *
 * Implements Clasptek Design System (.cp-* tokens):
 * - Strict field validation
 * - Read-only display of immutable identifiers (id, student_number, tenant_id, created_at)
 * - Mandatory "Reason for Change" with audited historical change logging
 * - 4 clean tabs: Personal, Contact, Emergency & Sponsor, Administrative
 * - Corporate Sponsor / Billing Customer linkage to public.customers
 * - Fully responsive across Laptop, Tablet, and Mobile (auto-reflowing grid)
 */

import React, { useState, useEffect } from 'react';
import type { Student, StudentStatus } from '@/types/students';

interface EditStudentModalProps {
  isOpen: boolean;
  student: Student;
  onClose: () => void;
  onSaved: (updatedStudent: Student) => void;
}

export function EditStudentModal({
  isOpen,
  student,
  onClose,
  onSaved,
}: EditStudentModalProps) {
  const meta = (student.metadata as Record<string, unknown>) || {};

  // Form states
  const [firstName, setFirstName] = useState(student.first_name || '');
  const [lastName, setLastName] = useState(student.last_name || '');
  const [middleName, setMiddleName] = useState(String(meta.middleName || ''));
  const [gender, setGender] = useState(student.gender || '');
  const [dateOfBirth, setDateOfBirth] = useState(String(meta.dateOfBirth || ''));
  const [maritalStatus, setMaritalStatus] = useState(String(meta.maritalStatus || ''));
  const [nationality, setNationality] = useState(String(meta.nationality || 'Nigerian'));
  const [stateOfOrigin, setStateOfOrigin] = useState(String(meta.stateOfOrigin || ''));
  const [religion, setReligion] = useState(String(meta.religion || ''));

  const [email, setEmail] = useState(student.email || '');
  const [phone, setPhone] = useState(student.phone || '');
  const [phone2, setPhone2] = useState(String(meta.phone2 || meta.alternativePhone || ''));
  const [address, setAddress] = useState(student.address || '');
  const [location, setLocation] = useState(String(meta.location || ''));
  const [state, setState] = useState(String(meta.state || meta.stateOfOrigin || ''));

  const [hasSponsor, setHasSponsor] = useState(Boolean(meta.hasSponsor ?? (meta.sponsorName ? true : false)));
  const [emergencyContactName, setEmergencyContactName] = useState(student.emergency_contact_name || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(student.emergency_contact_phone || '');
  const [emergencyRelationship, setEmergencyRelationship] = useState(String(meta.emergencyContactRelationship || ''));
  const [sponsorName, setSponsorName] = useState(String(meta.sponsorName || ''));
  const [sponsorType, setSponsorType] = useState(String(meta.sponsorType || (student.customer_id ? 'Corporate' : 'Self')));
  const [sponsorEmail, setSponsorEmail] = useState(String(meta.sponsorEmail || ''));
  const [sponsorPhone, setSponsorPhone] = useState(String(meta.sponsorPhone || ''));
  const [customerId, setCustomerId] = useState<string>(student.customer_id || '');
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; email?: string | null; phone?: string | null }>>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  const [registrationDate, setRegistrationDate] = useState(String(meta.registeredAt || meta.registrationDate || ''));
  const [referralSource, setReferralSource] = useState(String(meta.referralSource || ''));
  const [studentExpertiseLevel, setStudentExpertiseLevel] = useState(String(meta.studentExpertiseLevel || meta.expertiseLevel || 'Beginner'));
  const [employmentStatus, setEmploymentStatus] = useState(String(meta.employmentStatus || ''));
  const [status, setStatus] = useState<StudentStatus>(student.status || 'ACTIVE');
  const [notes, setNotes] = useState(String(meta.notes || ''));

  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<'personal' | 'contact' | 'emergency' | 'administrative'>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing customers for corporate sponsor dropdown
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const res = await fetch('/api/customers');
        const json = await res.json();
        if (isMounted && res.ok && json.data) {
          setCustomers(json.data);
        }
      } catch (err) {
        console.error('Failed to load customers for sponsor selector', err);
      } finally {
        if (isMounted) setIsLoadingCustomers(false);
      }
    }
    loadCustomers();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('A mandatory Reason for Change is required to update this profile.');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('First Name and Last Name are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const updates = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender: gender || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        customer_id: customerId || null,
        status,
        metadata: {
          middleName: middleName.trim() || null,
          phone2: phone2.trim() || null,
          alternativePhone: phone2.trim() || null,
          location: location.trim() || null,
          state: state.trim() || null,
          dateOfBirth: dateOfBirth || null,
          maritalStatus: maritalStatus || null,
          nationality: nationality.trim() || null,
          stateOfOrigin: stateOfOrigin.trim() || state.trim() || null,
          religion: religion.trim() || null,
          hasSponsor,
          sponsorName: hasSponsor ? (sponsorName.trim() || null) : null,
          sponsorType: hasSponsor ? sponsorType : 'Self',
          sponsorEmail: hasSponsor ? (sponsorEmail.trim() || null) : null,
          sponsorPhone: hasSponsor ? (sponsorPhone.trim() || null) : null,
          emergencyContactRelationship: emergencyRelationship.trim() || null,
          registrationDate: registrationDate || null,
          registeredAt: registrationDate || null,
          referralSource: referralSource.trim() || null,
          studentExpertiseLevel: studentExpertiseLevel || null,
          expertiseLevel: studentExpertiseLevel || null,
          employmentStatus: employmentStatus || null,
          notes: notes.trim() || null,
        },
      };

      const res = await fetch(`/api/students/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, reason: reason.trim() }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setErrorMessage(json.error || 'Failed to update student profile.');
        setIsSubmitting(false);
        return;
      }

      onSaved(json.data as Student);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error updating student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="cp-modal-overlay"
      style={{
        zIndex: 1200,
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-student-title"
    >
      <div
        className="cp-modal"
        style={{
          maxWidth: '780px',
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-0, #FFFFFF)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border, #E2E8F0)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cp-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #E2E8F0)', background: 'var(--surface-1, #F8FAFC)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 id="edit-student-title" className="cp-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: 0 }}>
                ✏️ Edit Student Profile
              </h2>
              <span className="cp-pill active" style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>
                {student.student_number}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '4px 0 0 0' }}>
              Authoritative updates with audited historical change logging.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cp-modal-close"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Immutable Identifiers Bar */}
        <div
          style={{
            background: 'var(--surface-2, #F1F5F9)',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '16px',
            fontSize: '12px',
            color: 'var(--text-muted, #64748B)',
          }}
        >
          <div>
            <span>Student Number: </span>
            <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{student.student_number}</strong>
            <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--warning-dark, #B45309)', fontWeight: 700 }}>(Immutable)</span>
          </div>
          <div>
            <span>Internal ID: </span>
            <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{student.id}</strong>
            <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--warning-dark, #B45309)', fontWeight: 700 }}>(Immutable)</span>
          </div>
          <div>
            <span>Registered: </span>
            <strong style={{ color: 'var(--text-primary)' }}>{new Date(student.created_at).toLocaleDateString('en-GB')}</strong>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            background: 'var(--surface-1, #F8FAFC)',
            padding: '0 20px',
            overflowX: 'auto',
          }}
        >
          {(
            [
              { key: 'personal', label: '1. Personal' },
              { key: 'contact', label: '2. Contact' },
              { key: 'emergency', label: '3. Sponsor & Emergency' },
              { key: 'administrative', label: '4. Registration & Profile' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary, #14213D)' : 'transparent'}`,
                color: activeTab === tab.key ? 'var(--primary, #14213D)' : 'var(--text-secondary, #64748B)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            {errorMessage && (
              <div role="alert" className="cp-alert error" style={{ margin: 0 }}>
                {errorMessage}
              </div>
            )}

            {/* TAB 1: Personal */}
            {activeTab === 'personal' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-first-name">First Name <span style={{ color: 'var(--danger, #DC2626)' }}>*</span></label>
                  <input
                    id="edit-first-name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-last-name">Last Name <span style={{ color: 'var(--danger, #DC2626)' }}>*</span></label>
                  <input
                    id="edit-last-name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-middle-name">Middle Name</label>
                  <input
                    id="edit-middle-name"
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-gender">Gender</label>
                  <select
                    id="edit-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-dob">Date of Birth</label>
                  <input
                    id="edit-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-marital">Marital Status</label>
                  <select
                    id="edit-marital"
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-nationality">Nationality</label>
                  <input
                    id="edit-nationality"
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-state">State of Origin</label>
                  <input
                    id="edit-state"
                    type="text"
                    value={stateOfOrigin}
                    onChange={(e) => setStateOfOrigin(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-religion">Religion</label>
                  <input
                    id="edit-religion"
                    type="text"
                    value={religion}
                    onChange={(e) => setReligion(e.target.value)}
                    placeholder="e.g. Christian, Muslim"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Contact */}
            {activeTab === 'contact' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-email">Email Address</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-phone">Primary Phone Number</label>
                  <input
                    id="edit-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-phone2">Alternative Phone (Phone 2)</label>
                  <input
                    id="edit-phone2"
                    type="text"
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value)}
                    placeholder="Alternative contact number"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-location">Location / City</label>
                  <input
                    id="edit-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Ikeja, Port Harcourt"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-state">State / Region</label>
                  <input
                    id="edit-state"
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Lagos, Rivers"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label htmlFor="edit-address">Residential Address</label>
                  <textarea
                    id="edit-address"
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full residential address..."
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Sponsor & Emergency */}
            {activeTab === 'emergency' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {/* Sponsorship Section */}
                <div style={{ gridColumn: '1 / -1', background: 'var(--surface-1, #F8FAFC)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🤝 Sponsorship &amp; Financial Ledger Entity
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-has-sponsor">Has Sponsor?</label>
                      <select
                        id="edit-has-sponsor"
                        value={hasSponsor ? 'yes' : 'no'}
                        onChange={(e) => {
                          const val = e.target.value === 'yes';
                          setHasSponsor(val);
                          if (!val) {
                            setSponsorType('Self');
                          }
                        }}
                      >
                        <option value="no">No (Self-Sponsored / Individual Student)</option>
                        <option value="yes">Yes (Corporate / Third-Party Sponsored)</option>
                      </select>
                    </div>

                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-sp-type">Sponsor Type</label>
                      <select
                        id="edit-sp-type"
                        value={sponsorType}
                        onChange={(e) => setSponsorType(e.target.value)}
                      >
                        <option value="Self">Self Sponsored</option>
                        <option value="Corporate">Corporate / Employer</option>
                        <option value="Parent/Guardian">Parent / Guardian</option>
                        <option value="Scholarship">Scholarship / Donor</option>
                        <option value="Government">Government Agency</option>
                      </select>
                    </div>
                  </div>

                  <div className="cp-field" style={{ margin: '0 0 12px 0' }}>
                    <label htmlFor="edit-customer-id">Corporate Sponsor / Billing Customer (public.customers)</label>
                    <select
                      id="edit-customer-id"
                      value={customerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerId(val);
                        if (val) {
                          setHasSponsor(true);
                          setSponsorType('Corporate');
                          const c = customers.find((cust) => cust.id === val);
                          if (c) {
                            setSponsorName(c.name);
                            if (c.email) setSponsorEmail(c.email);
                            if (c.phone) setSponsorPhone(c.phone);
                          }
                        }
                      }}
                      disabled={isLoadingCustomers}
                    >
                      <option value="">— Link Corporate Customer Profile —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.email ? `(${c.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-sp-name">Sponsor Name / Organization</label>
                      <input
                        id="edit-sp-name"
                        type="text"
                        value={sponsorName}
                        onChange={(e) => setSponsorName(e.target.value)}
                        placeholder="Organization or individual sponsor"
                      />
                    </div>

                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-sp-phone">Sponsor Phone Number</label>
                      <input
                        id="edit-sp-phone"
                        type="text"
                        value={sponsorPhone}
                        onChange={(e) => setSponsorPhone(e.target.value)}
                      />
                    </div>

                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-sp-email">Sponsor Email Address</label>
                      <input
                        id="edit-sp-email"
                        type="email"
                        value={sponsorEmail}
                        onChange={(e) => setSponsorEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    🚨 Emergency Contact
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-emg-name">Contact Full Name</label>
                      <input
                        id="edit-emg-name"
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                      />
                    </div>
                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-emg-phone">Contact Phone</label>
                      <input
                        id="edit-emg-phone"
                        type="text"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      />
                    </div>
                    <div className="cp-field" style={{ margin: 0 }}>
                      <label htmlFor="edit-emg-rel">Relationship</label>
                      <input
                        id="edit-emg-rel"
                        type="text"
                        value={emergencyRelationship}
                        onChange={(e) => setEmergencyRelationship(e.target.value)}
                        placeholder="e.g. Parent, Spouse, Sibling"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Registration & Profile */}
            {activeTab === 'administrative' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-reg-date">Registration Date</label>
                  <input
                    id="edit-reg-date"
                    type="date"
                    value={registrationDate}
                    onChange={(e) => setRegistrationDate(e.target.value)}
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-ref-source">Referral Source</label>
                  <input
                    id="edit-ref-source"
                    type="text"
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    placeholder="e.g. Social Media, Website, Referral"
                  />
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-expertise">Student Expertise Level</label>
                  <select
                    id="edit-expertise"
                    value={studentExpertiseLevel}
                    onChange={(e) => setStudentExpertiseLevel(e.target.value)}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Professional">Professional</option>
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-employment">Employment Status</label>
                  <select
                    id="edit-employment"
                    value={employmentStatus}
                    onChange={(e) => setEmploymentStatus(e.target.value)}
                  >
                    <option value="">— Select Status —</option>
                    <option value="Employed">Employed</option>
                    <option value="Self-Employed">Self-Employed</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Student">Student</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0 }}>
                  <label htmlFor="edit-status">Student Status</label>
                  <select
                    id="edit-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StudentStatus)}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="WITHDRAWN">WITHDRAWN</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>

                <div className="cp-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label htmlFor="edit-notes">Administrative Notes</label>
                  <textarea
                    id="edit-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal administrative comments or context..."
                  />
                </div>
              </div>
            )}

            {/* MANDATORY REASON FOR CHANGE */}
            <div style={{ background: 'var(--warning-bg, #FFFBEB)', padding: '14px', borderRadius: '8px', border: '1px solid var(--warning-border, #FDE68A)' }}>
              <label htmlFor="edit-reason" style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--warning-dark, #B45309)', marginBottom: '4px' }}>
                Reason for Profile Correction <span style={{ color: 'var(--danger, #DC2626)' }}>*</span>
              </label>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary, #334155)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                Every modification is permanently audited. State the administrative justification (e.g. &quot;Customer requested typo correction in phone number&quot;).
              </p>
              <textarea
                id="edit-reason"
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Mandatory reason for this correction..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--warning, #D97706)', background: '#FFFFFF' }}
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="cp-modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-1, #F8FAFC)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={onClose}
              className="cp-btn secondary"
              style={{ fontWeight: 600 }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="cp-btn primary"
              style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isSubmitting ? 'Recording Changes...' : 'Save & Record Audit Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
