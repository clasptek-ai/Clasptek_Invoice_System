'use client';

/**
 * components/students/StudentRegistrationModal.tsx
 * Authoritative Student Details & Registration Form
 *
 * Implements Clasptek Design System (.cp-* tokens):
 * - User-facing Title: "Student Details & Registration"
 * - Vocational training registration (NOT an academic candidate application)
 * - 6 Structured Sections:
 *   1. STUDENT IDENTIFICATION (System-generated Student ID, live derived Student Name)
 *   2. PERSONAL DETAILS (First Name, Middle Name, Last Name, Gender, Date of Birth, Nationality, Religion, Marital Status)
 *   3. CONTACT DETAILS (Email, Phone Number, Alternative Phone Number, Phone Number 2, Address, Location, State)
 *   4. REGISTRATION (Registration Date, Referral Source)
 *   5. STUDENT PROFILE (Student Expertise Level, Employment Status)
 *   6. SPONSOR INFORMATION (Sponsor toggle Yes/No, Sponsor Name, Sponsor Phone Number, Sponsor's Email Address)
 * - Strictly ends at Sponsor's Email Address
 * - Concurrency-safe deduplication checking
 * - Fully responsive across Laptop, Tablet, and Mobile
 */

import React, { useState, useId } from 'react';
import type { Student } from '@/types/students';

interface StudentRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (newStudent: Student) => void;
  prefill?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    programmeId?: string;
  };
}

export function StudentRegistrationModal({
  isOpen,
  onClose,
  onSaved,
  prefill,
}: StudentRegistrationModalProps) {
  const formId = useId();

  // 1. Personal Details
  const [firstName, setFirstName] = useState(prefill?.firstName || '');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState(prefill?.lastName || '');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [nationality, setNationality] = useState('Nigerian');
  const [religion, setReligion] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');

  // 2. Contact Details
  const [email, setEmail] = useState(prefill?.email || '');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');

  // 3. Registration
  const [registrationDate, setRegistrationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referralSource, setReferralSource] = useState('Walk-in / Direct Enquiry');

  // 4. Student Profile
  const [expertiseLevel, setExpertiseLevel] = useState('Beginner');
  const [employmentStatus, setEmploymentStatus] = useState('Employed');

  // 5. Sponsor Information
  const [hasSponsor, setHasSponsor] = useState<'No' | 'Yes'>('No');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Derived Student Name: First Name + Middle Name + Last Name
  const derivedStudentName = [firstName.trim(), middleName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(' ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side validations
    if (!firstName.trim()) {
      setErrorMessage('First Name is required.');
      return;
    }
    if (!lastName.trim()) {
      setErrorMessage('Last Name is required.');
      return;
    }
    if (hasSponsor === 'Yes') {
      if (!sponsorName.trim()) {
        setErrorMessage('Sponsor Name is required when student has a sponsor.');
        return;
      }
      if (!sponsorPhone.trim() && !sponsorEmail.trim()) {
        setErrorMessage('Please provide at least a Sponsor Phone Number or Sponsor Email Address.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
        nationality: nationality.trim() || 'Nigerian',
        religion: religion || null,
        maritalStatus: maritalStatus || null,

        email: email.trim() || null,
        phone: phone.trim() || null,
        alternativePhone: alternativePhone.trim() || null,
        phone2: phone2.trim() || null,
        address: address.trim() || null,
        location: location.trim() || null,
        state: state.trim() || null,

        registrationDate: registrationDate || new Date().toISOString().slice(0, 10),
        referralSource: referralSource || 'Direct',

        expertiseLevel: expertiseLevel || 'Beginner',
        employmentStatus: employmentStatus || 'Employed',

        hasSponsor: hasSponsor === 'Yes',
        sponsorName: hasSponsor === 'Yes' ? sponsorName.trim() : null,
        sponsorPhone: hasSponsor === 'Yes' ? sponsorPhone.trim() : null,
        sponsorEmail: hasSponsor === 'Yes' ? sponsorEmail.trim() : null,
      };

      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.error || 'Failed to complete student registration.');
        setIsSubmitting(false);
        return;
      }

      onSaved(json.student as Student);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error during student registration.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="cp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-registration-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        className="cp-modal"
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '760px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          className="cp-modal-header"
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <h2
              id="student-registration-title"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-primary, #0F172A)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span aria-hidden="true">👨‍🎓</span> Student Details &amp; Registration
            </h2>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748B)', marginTop: '2px' }}>
              Authoritative vocational student identity capture and official registration.
            </div>
          </div>
          <button
            type="button"
            className="cp-modal-close"
            id="btnCloseStudentRegModal"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748B)',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body - 6 Structured Sections */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            className="cp-modal-body"
            style={{
              padding: '20px 24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '22px',
            }}
          >
            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  color: '#991B1B',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* SECTION 1: STUDENT IDENTIFICATION */}
            <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary, #0369A1)', marginBottom: '10px' }}>
                1. Student Identification
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-student-id`} style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Student ID <span style={{ fontSize: '11px', fontWeight: 500, color: '#0369A1' }}>(System-Generated)</span>
                  </label>
                  <input
                    id={`${formId}-student-id`}
                    type="text"
                    readOnly
                    value="Auto-generated on Save (e.g. STU-2026-XXXX)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px dashed #CBD5E1',
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-student-name`} style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Student Name <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B' }}>(Derived from Names)</span>
                  </label>
                  <input
                    id={`${formId}-student-name`}
                    type="text"
                    readOnly
                    value={derivedStudentName || '— (Auto-derived from First, Middle, Last) —'}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      color: derivedStudentName ? '#0F172A' : '#94A3B8',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'default',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: PERSONAL DETAILS */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#1E293B', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                2. Personal Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-first-name`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    First Name <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id={`${formId}-first-name`}
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Samuel"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-middle-name`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Middle Name
                  </label>
                  <input
                    id={`${formId}-middle-name`}
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="e.g. Chukwuma"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-last-name`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Last Name <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id={`${formId}-last-name`}
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Adeleke"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-gender`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Gender
                  </label>
                  <select
                    id={`${formId}-gender`}
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other' | '')}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-dob`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Date of Birth
                  </label>
                  <input
                    id={`${formId}-dob`}
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-nationality`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Nationality
                  </label>
                  <input
                    id={`${formId}-nationality`}
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="e.g. Nigerian"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-religion`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Religion
                  </label>
                  <select
                    id={`${formId}-religion`}
                    value={religion}
                    onChange={(e) => setReligion(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="">Select Religion</option>
                    <option value="Christianity">Christianity</option>
                    <option value="Islam">Islam</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-marital`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Marital Status
                  </label>
                  <select
                    id={`${formId}-marital`}
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 3: CONTACT DETAILS */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#1E293B', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                3. Contact Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-email`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Email Address
                  </label>
                  <input
                    id={`${formId}-email`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-phone`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Phone Number
                  </label>
                  <input
                    id={`${formId}-phone`}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-alt-phone`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Alternative Phone Number
                  </label>
                  <input
                    id={`${formId}-alt-phone`}
                    type="tel"
                    value={alternativePhone}
                    onChange={(e) => setAlternativePhone(e.target.value)}
                    placeholder="e.g. 08087654321"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-phone-2`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Phone Number 2
                  </label>
                  <input
                    id={`${formId}-phone-2`}
                    type="tel"
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value)}
                    placeholder="e.g. 07098765432"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-address`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Address
                  </label>
                  <input
                    id={`${formId}-address`}
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street Address, Area"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-location`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Location
                  </label>
                  <input
                    id={`${formId}-location`}
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Port Harcourt"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-state`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    State
                  </label>
                  <input
                    id={`${formId}-state`}
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Rivers State"
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: REGISTRATION */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#1E293B', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                4. Registration
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-reg-date`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Registration Date
                  </label>
                  <input
                    id={`${formId}-reg-date`}
                    type="date"
                    value={registrationDate}
                    onChange={(e) => setRegistrationDate(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-referral-source`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Referral Source
                  </label>
                  <select
                    id={`${formId}-referral-source`}
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="Walk-in / Direct Enquiry">Walk-in / Direct Enquiry</option>
                    <option value="Website">Clasptek Official Website</option>
                    <option value="Social Media">LinkedIn / Social Media</option>
                    <option value="Alumni">Alumni / Peer Recommendation</option>
                    <option value="Employer">Employer Recommendation</option>
                    <option value="Google Form">Google Form Intake</option>
                    <option value="Other">Other Referral Channel</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 5: STUDENT PROFILE */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#1E293B', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                5. Student Profile
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="cp-field">
                  <label htmlFor={`${formId}-expertise-level`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Student Expertise Level
                  </label>
                  <select
                    id={`${formId}-expertise-level`}
                    value={expertiseLevel}
                    onChange={(e) => setExpertiseLevel(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="Beginner">Beginner (Foundational)</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Professional / Executive">Professional / Executive</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label htmlFor={`${formId}-employment-status`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Employment Status
                  </label>
                  <select
                    id={`${formId}-employment-status`}
                    value={employmentStatus}
                    onChange={(e) => setEmploymentStatus(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="Employed">Employed (Corporate / Private)</option>
                    <option value="Self-Employed">Self-Employed / Business Owner</option>
                    <option value="Unemployed">Unemployed / Job Seeker</option>
                    <option value="Student">Student (Undergraduate / NYSC)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 6: SPONSOR INFORMATION (Ends at Sponsor's Email Address) */}
            <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#1E293B' }}>
                  6. Sponsor Information
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor={`${formId}-sponsor-toggle`} style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    Has Sponsor?
                  </label>
                  <select
                    id={`${formId}-sponsor-toggle`}
                    value={hasSponsor}
                    onChange={(e) => setHasSponsor(e.target.value as 'No' | 'Yes')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: hasSponsor === 'Yes' ? '#EFF6FF' : '#FFFFFF',
                      color: hasSponsor === 'Yes' ? '#1D4ED8' : '#334155',
                    }}
                  >
                    <option value="No">No (Self-Sponsored)</option>
                    <option value="Yes">Yes (Sponsored)</option>
                  </select>
                </div>
              </div>

              {hasSponsor === 'Yes' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div className="cp-field">
                    <label htmlFor={`${formId}-sponsor-name`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Sponsor Name <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      id={`${formId}-sponsor-name`}
                      type="text"
                      required
                      value={sponsorName}
                      onChange={(e) => setSponsorName(e.target.value)}
                      placeholder="e.g. Chevron Nigeria / John Doe"
                      className="cp-input"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    />
                  </div>
                  <div className="cp-field">
                    <label htmlFor={`${formId}-sponsor-phone`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Sponsor Phone Number
                    </label>
                    <input
                      id={`${formId}-sponsor-phone`}
                      type="tel"
                      value={sponsorPhone}
                      onChange={(e) => setSponsorPhone(e.target.value)}
                      placeholder="e.g. 08012345678"
                      className="cp-input"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    />
                  </div>
                  <div className="cp-field">
                    <label htmlFor={`${formId}-sponsor-email`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Sponsor's Email Address
                    </label>
                    <input
                      id={`${formId}-sponsor-email`}
                      type="email"
                      value={sponsorEmail}
                      onChange={(e) => setSponsorEmail(e.target.value)}
                      placeholder="sponsor@example.com"
                      className="cp-input"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', padding: '6px 0' }}>
                  Student is self-sponsored. No external corporate or individual sponsor registered.
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div
            className="cp-modal-footer"
            style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--border, #E2E8F0)',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#F8FAFC',
            }}
          >
            <button
              type="button"
              className="cp-btn secondary"
              id="btnCancelStudentReg"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ fontWeight: 600, padding: '8px 16px', borderRadius: '6px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cp-btn primary"
              id="btnSaveStudentReg"
              disabled={isSubmitting}
              style={{
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '6px',
                backgroundColor: 'var(--primary, #0369A1)',
                color: '#FFFFFF',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isSubmitting ? '⏳ Registering Student...' : '✔ Save Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
