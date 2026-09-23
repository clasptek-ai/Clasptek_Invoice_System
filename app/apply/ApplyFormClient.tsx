/**
 * app/apply/ApplyFormClient.tsx — Phase 3
 * Accessible 5-step admissions application wizard.
 * Preserves exact legacy Clasptek visual design, classes, layout, and terminology.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProgrammeOption, ApplyFormData, DeliveryMode } from '@/types/admissions';
import { submitApplication } from './actions';

interface ApplyFormClientProps {
  programmes: ProgrammeOption[];
  prefilledEnquiryId?: string | null;
  prefilledEmail?: string | null;
  prefilledName?: string | null;
}

const INITIAL_FORM: ApplyFormData = {
  // Step 1: Personal
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: 'MALE',
  maritalStatus: 'Single',
  stateOfOrigin: '',
  address: '',

  // Step 2: Programme
  programmeId: '',
  deliveryMode: 'IN_PERSON',
  preferredSchedule: 'WEEKDAY',
  preferredStartDate: '',
  expertiseLevel: 'BEGINNER',
  agreedTuitionFee: '0',
  preferredDuration: '3 Months',

  // Step 3: Background
  employmentStatus: 'Employed',
  referralSource: 'Website',
  claimedStudentNumber: '',
  notes: '',

  // Step 4: Sponsorship
  sponsorType: 'Self-sponsored',
  sponsorName: '',
  sponsorPhone: '',
  sponsorEmail: '',

  // Step 5: Consent & Security
  website_url_hp: '',
  consentAcknowledged: false,
  enquiryId: null,
};

const STEPS = [
  { step: 1, label: 'Applicant Details' },
  { step: 2, label: 'Programme Selection' },
  { step: 3, label: 'Background & Experience' },
  { step: 4, label: 'Additional Information' },
  { step: 5, label: 'Review & Submit' },
];

export function ApplyFormClient({
  programmes,
  prefilledEnquiryId,
  prefilledEmail,
  prefilledName,
}: ApplyFormClientProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([1]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form with pre-fills if provided
  const [formData, setFormData] = useState<ApplyFormData>(() => {
    let first = '';
    let last = '';
    if (prefilledName) {
      const parts = prefilledName.trim().split(/\s+/);
      first = parts[0] || '';
      last = parts.slice(1).join(' ') || '';
    }
    return {
      ...INITIAL_FORM,
      firstName: first,
      lastName: last,
      email: prefilledEmail || '',
      enquiryId: prefilledEnquiryId || null,
      programmeId: programmes[0]?.id || '',
      agreedTuitionFee: String(programmes[0]?.tuition_fee || 0),
    };
  });

  const updateField = <K extends keyof ApplyFormData>(key: K, value: ApplyFormData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'programmeId') {
        const selectedProg = programmes.find((p) => p.id === value);
        if (selectedProg) {
          next.agreedTuitionFee = String(selectedProg.tuition_fee || 0);
        }
      }
      return next;
    });
  };

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!formData.firstName.trim()) return 'First name is required.';
      if (!formData.lastName.trim()) return 'Last name is required.';
      if (!formData.email.trim() && !formData.phone.trim()) {
        return 'Please provide either an email address or a phone number.';
      }
    }
    if (step === 2) {
      if (!formData.programmeId) return 'Please select a training programme.';
    }
    if (step === 5) {
      if (!formData.consentAcknowledged) {
        return 'You must confirm that the information provided is accurate before submitting.';
      }
    }
    return null;
  };

  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setErrorMessage(null);
    const nextStep = Math.min(currentStep + 1, STEPS.length);
    setVisitedSteps((prev) => new Set([...prev, nextStep]));
    setCurrentStep(nextStep);
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateStep(5);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitApplication(formData);
      if (!res.success) {
        throw new Error(res.error || 'Failed to submit application');
      }

      router.push(
        `/apply/success?appNum=${encodeURIComponent(
          res.applicationNumber || ''
        )}&name=${encodeURIComponent(formData.firstName)}`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed');
      setIsSubmitting(false);
    }
  };

  const selectedProg = programmes.find((p) => p.id === formData.programmeId);

  return (
    <div>
      {/* Exact Multi-Step Application Progress Indicator (cp-intake-stepper) */}
      <div className="cp-intake-stepper" role="navigation" aria-label="Application Progress">
        {STEPS.map((s, idx) => {
          const isActive = currentStep === s.step;
          const isCompleted = visitedSteps.has(s.step) && currentStep > s.step;
          const isDisabled = !visitedSteps.has(s.step);

          return (
            <div key={s.step} style={{ display: 'contents' }}>
              <div
                className={`cp-stepper-step ${
                  isActive ? 'active' : isCompleted ? 'completed' : isDisabled ? 'disabled' : ''
                }`}
                data-step={s.step}
                onClick={() => {
                  if (visitedSteps.has(s.step) && s.step < currentStep) {
                    setCurrentStep(s.step);
                  }
                }}
              >
                <span className="cp-stepper-badge">{isCompleted ? '✔' : s.step}</span>
                <span className="cp-stepper-label">{s.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`cp-stepper-line ${currentStep > s.step ? 'completed' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div
          id="appWkError"
          role="alert"
          style={{
            background: '#FEF2F2',
            borderLeft: '4px solid #EF4444',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '18px',
            color: '#991B1B',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Step Content Area — Exact Legacy Card & Grid */}
      <div
        className="cp-card"
        style={{
          padding: '26px 30px',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          marginBottom: '24px',
        }}
      >
        <form onSubmit={handleSubmit}>
          {/* Honeypot field (hidden from real users, caught by bots) */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <label htmlFor="website_url_hp">Website</label>
            <input
              type="text"
              id="website_url_hp"
              name="website_url_hp"
              tabIndex={-1}
              autoComplete="off"
              value={formData.website_url_hp}
              onChange={(e) => updateField('website_url_hp', e.target.value)}
            />
          </div>

          {/* STEP 1: Applicant Details */}
          {currentStep === 1 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  paddingBottom: '10px',
                  borderBottom: '1.5px solid #F1F5F9',
                }}
              >
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                  }}
                >
                  1
                </span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Applicant Information
                  </h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Enter the legal personal and contact information of the applicant.
                  </div>
                </div>
              </div>

              <div className="cp-intake-form-grid">
                <div className="cp-field">
                  <label htmlFor="appWkFirstName">
                    First Name <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    id="appWkFirstName"
                    required
                    value={formData.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="e.g. Victor"
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkLastName">
                    Last Name <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    id="appWkLastName"
                    required
                    value={formData.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="e.g. Chukwuma"
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkEmail">
                    Email Address <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="email"
                    id="appWkEmail"
                    required
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="applicant@example.com"
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkPhone">
                    Phone Number <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    id="appWkPhone"
                    required
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+2348031112233"
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkDob">Date of Birth</label>
                  <input
                    type="date"
                    id="appWkDob"
                    value={formData.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  />
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkGender">Gender</label>
                  <select
                    id="appWkGender"
                    value={formData.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other / Prefer not to say</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkMarital">Marital Status</label>
                  <select
                    id="appWkMarital"
                    value={formData.maritalStatus}
                    onChange={(e) => updateField('maritalStatus', e.target.value)}
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label htmlFor="appWkState">State of Origin</label>
                  <input
                    type="text"
                    id="appWkState"
                    value={formData.stateOfOrigin}
                    onChange={(e) => updateField('stateOfOrigin', e.target.value)}
                    placeholder="e.g. Lagos, Anambra, Rivers"
                  />
                </div>
                <div className="cp-field cp-col-span-2">
                  <label htmlFor="appWkAddress">Residential Address</label>
                  <input
                    type="text"
                    id="appWkAddress"
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Street address, City, State"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Programme Selection */}
          {currentStep === 2 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  paddingBottom: '10px',
                  borderBottom: '1.5px solid #F1F5F9',
                }}
              >
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                  }}
                >
                  2
                </span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Programme Selection
                  </h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Select the target Clasptek curriculum, agreed terms, and delivery mode.
                  </div>
                </div>
              </div>

              <div className="cp-intake-form-grid">
                <div className="cp-field cp-col-span-2">
                  <label htmlFor="appWkProgramme">
                    Programme / Course <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <select
                    id="appWkProgramme"
                    required
                    value={formData.programmeId}
                    onChange={(e) => updateField('programmeId', e.target.value)}
                    style={{ fontWeight: 700, color: '#0F172A', background: '#FFFFFF' }}
                  >
                    <option value="">-- Select Active Training Programme --</option>
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code || 'CODE'}) &mdash; Standard Tuition: ₦{Number(p.tuition_fee || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Programme Summary Box */}
                {selectedProg && (
                  <div
                    className="cp-field cp-col-span-2"
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '14px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          Selected Curriculum
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                          {selectedProg.name}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          Standard Programme Tuition
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0284C7', fontFamily: 'var(--font-mono)' }}>
                          ₦{Number(selectedProg.tuition_fee || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="cp-field">
                  <label htmlFor="appWkDeliveryMode">Delivery Mode</label>
                  <select
                    id="appWkDeliveryMode"
                    value={formData.deliveryMode}
                    onChange={(e) => updateField('deliveryMode', e.target.value as DeliveryMode)}
                  >
                    <option value="IN_PERSON">In-Person (On Campus)</option>
                    <option value="ONLINE">Online / Virtual Live</option>
                    <option value="HYBRID">Hybrid (Flexible)</option>
                  </select>
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkSchedule">Preferred Schedule</label>
                  <select
                    id="appWkSchedule"
                    value={formData.preferredSchedule}
                    onChange={(e) => updateField('preferredSchedule', e.target.value)}
                  >
                    <option value="WEEKDAY">Weekday (Monday - Friday)</option>
                    <option value="WEEKEND">Weekend (Saturday Intensive)</option>
                    <option value="EVENING">Evening / Part-Time</option>
                  </select>
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkExpertise">Current Expertise Level</label>
                  <select
                    id="appWkExpertise"
                    value={formData.expertiseLevel}
                    onChange={(e) => updateField('expertiseLevel', e.target.value)}
                  >
                    <option value="BEGINNER">Beginner (No prior experience)</option>
                    <option value="INTERMEDIATE">Intermediate (Some foundational knowledge)</option>
                    <option value="ADVANCED">Advanced / Professional upskilling</option>
                  </select>
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkStartDate">Preferred Start Date</label>
                  <input
                    type="date"
                    id="appWkStartDate"
                    value={formData.preferredStartDate}
                    onChange={(e) => updateField('preferredStartDate', e.target.value)}
                  />
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkTuitionFee">Agreed Tuition Fee (NGN)</label>
                  <input
                    type="number"
                    id="appWkTuitionFee"
                    min="0"
                    step="1000"
                    value={formData.agreedTuitionFee}
                    onChange={(e) => updateField('agreedTuitionFee', e.target.value)}
                    placeholder="0"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkDuration">Preferred Duration</label>
                  <input
                    type="text"
                    id="appWkDuration"
                    value={formData.preferredDuration}
                    onChange={(e) => updateField('preferredDuration', e.target.value)}
                    placeholder="e.g. 3 Months, 6 Months"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Background & Experience */}
          {currentStep === 3 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  paddingBottom: '10px',
                  borderBottom: '1.5px solid #F1F5F9',
                }}
              >
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                  }}
                >
                  3
                </span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Background &amp; Experience
                  </h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Provide candidate background, prior technical exposure, and identity cross-reference.
                  </div>
                </div>
              </div>

              <div className="cp-intake-form-grid">
                <div className="cp-field">
                  <label htmlFor="appWkEmployment">Employment Status</label>
                  <select
                    id="appWkEmployment"
                    value={formData.employmentStatus}
                    onChange={(e) => updateField('employmentStatus', e.target.value)}
                  >
                    <option value="Employed">Employed (Full-time)</option>
                    <option value="Self-Employed">Self-Employed / Freelance</option>
                    <option value="Unemployed">Seeking Employment / Career Transition</option>
                    <option value="Student">Current Student (Tertiary)</option>
                    <option value="NYSC">NYSC Corps Member</option>
                  </select>
                </div>

                <div className="cp-field">
                  <label htmlFor="appWkReferral">How did you hear about Clasptek?</label>
                  <select
                    id="appWkReferral"
                    value={formData.referralSource}
                    onChange={(e) => updateField('referralSource', e.target.value)}
                  >
                    <option value="Website">Clasptek Official Website</option>
                    <option value="Social Media">Social Media (LinkedIn / Instagram / X)</option>
                    <option value="Friend/Colleague">Friend, Colleague, or Alumni Referral</option>
                    <option value="Google">Google Search</option>
                    <option value="Event/Webinar">Clasptek Event or Tech Webinar</option>
                    <option value="Other">Other Outreach</option>
                  </select>
                </div>

                <div className="cp-field cp-col-span-2">
                  <label htmlFor="appWkClaimedStudentNumber">
                    Returning Student Number (Optional)
                  </label>
                  <input
                    type="text"
                    id="appWkClaimedStudentNumber"
                    value={formData.claimedStudentNumber}
                    onChange={(e) => updateField('claimedStudentNumber', e.target.value)}
                    placeholder="e.g. STU-2025-0014"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    If applicant has previously enrolled at Clasptek, enter existing Student ID to assist identity matching.
                  </div>
                </div>

                <div className="cp-field cp-col-span-2">
                  <label htmlFor="appWkNotes">Candidate Goals &amp; Specific Requirements</label>
                  <textarea
                    id="appWkNotes"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Enter any notes on candidate learning objectives, schedule flexibility, or intake conversation details..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Additional Information (Sponsorship) */}
          {currentStep === 4 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  paddingBottom: '10px',
                  borderBottom: '1.5px solid #F1F5F9',
                }}
              >
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                  }}
                >
                  4
                </span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Additional Information
                  </h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Declare sponsorship terms, tuition commitment, and supporting admissions notes.
                  </div>
                </div>
              </div>

              <div className="cp-intake-form-grid">
                <div className="cp-field cp-col-span-2">
                  <label htmlFor="appWkSponsorType">Sponsorship / Funding Arrangement</label>
                  <select
                    id="appWkSponsorType"
                    value={formData.sponsorType}
                    onChange={(e) => updateField('sponsorType', e.target.value)}
                  >
                    <option value="Self-sponsored">Self-sponsored (Candidate pays)</option>
                    <option value="Corporate/Employer">Corporate / Employer Sponsored</option>
                    <option value="Parent/Guardian">Parent / Guardian Funded</option>
                    <option value="Scholarship">Scholarship / Partner Organisation</option>
                  </select>
                </div>

                {formData.sponsorType !== 'Self-sponsored' && (
                  <>
                    <div className="cp-field cp-col-span-2">
                      <label htmlFor="appWkSponsorName">Sponsor / Organisation Name</label>
                      <input
                        type="text"
                        id="appWkSponsorName"
                        value={formData.sponsorName}
                        onChange={(e) => updateField('sponsorName', e.target.value)}
                        placeholder="Company, Sponsor, or Guardian Name"
                      />
                    </div>
                    <div className="cp-field">
                      <label htmlFor="appWkSponsorPhone">Sponsor Phone Number</label>
                      <input
                        type="tel"
                        id="appWkSponsorPhone"
                        value={formData.sponsorPhone}
                        onChange={(e) => updateField('sponsorPhone', e.target.value)}
                        placeholder="+234..."
                      />
                    </div>
                    <div className="cp-field">
                      <label htmlFor="appWkSponsorEmail">Sponsor Email Address</label>
                      <input
                        type="email"
                        id="appWkSponsorEmail"
                        value={formData.sponsorEmail}
                        onChange={(e) => updateField('sponsorEmail', e.target.value)}
                        placeholder="sponsor@example.com"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Review & Submit */}
          {currentStep === 5 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  paddingBottom: '10px',
                  borderBottom: '1.5px solid #F1F5F9',
                }}
              >
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                  }}
                >
                  5
                </span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Review &amp; Submit
                  </h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Verify candidate dossier integrity prior to authoritative persistence.
                  </div>
                </div>
              </div>

              {/* Dossier Review Table */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '18px 20px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Applicant Name
                    </span>
                    <strong style={{ color: '#0F172A', fontSize: '14.5px' }}>
                      {formData.firstName} {formData.lastName}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Contact Email
                    </span>
                    <span style={{ color: '#0F172A' }}>{formData.email}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Contact Phone
                    </span>
                    <span style={{ color: '#0F172A' }}>{formData.phone}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Programme Choice
                    </span>
                    <strong style={{ color: '#0284C7' }}>
                      {selectedProg ? `${selectedProg.name} (${selectedProg.code || 'CODE'})` : 'None Selected'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Delivery &amp; Schedule
                    </span>
                    <span style={{ color: '#0F172A' }}>
                      {formData.deliveryMode} &bull; {formData.preferredSchedule}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Agreed Tuition Fee
                    </span>
                    <strong style={{ color: '#0F172A', fontFamily: 'var(--font-mono)' }}>
                      ₦{Number(formData.agreedTuitionFee || 0).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Sponsorship
                    </span>
                    <span style={{ color: '#0F172A' }}>{formData.sponsorType}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Expertise Level
                    </span>
                    <span style={{ color: '#0F172A' }}>{formData.expertiseLevel}</span>
                  </div>
                </div>
              </div>

              {/* Consent Checkbox */}
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="appWkConsent"
                    checked={formData.consentAcknowledged}
                    onChange={(e) => updateField('consentAcknowledged', e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <span style={{ fontSize: '12.5px', color: '#166534', lineHeight: 1.5, fontWeight: 500 }}>
                    <strong>Applicant Verification &amp; Accuracy Confirmation:</strong> I confirm that the candidate information entered is accurate, verified with the applicant, and ready for official intake queue registration under Clasptek Admissions Governance.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Form Navigation Controls — Exact Legacy Button Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '28px',
              paddingTop: '20px',
              borderTop: '1px solid #E2E8F0',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  className="cp-btn secondary"
                  id="btnWkPrevStep"
                  onClick={handleBack}
                  disabled={isSubmitting}
                  style={{ fontWeight: 700 }}
                >
                  &larr; Previous Step
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {currentStep < 5 ? (
                <button
                  type="button"
                  className="cp-btn primary"
                  id="btnWkNextStep"
                  onClick={handleNext}
                  style={{ fontWeight: 700, minWidth: '140px' }}
                >
                  Continue &rarr;
                </button>
              ) : (
                <button
                  type="submit"
                  className="cp-btn primary"
                  id="btnWkSubmitApp"
                  disabled={isSubmitting || !formData.consentAcknowledged}
                  style={{
                    fontWeight: 800,
                    minWidth: '190px',
                    background: '#0F172A',
                    borderColor: '#0F172A',
                  }}
                >
                  {isSubmitting ? 'Registering...' : '✔ Submit Official Application'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
