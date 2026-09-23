/**
 * app/apply/ApplyFormClient.tsx — Phase 3
 * Accessible 5-step admissions application wizard.
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
  gender: '',
  maritalStatus: '',
  stateOfOrigin: '',
  address: '',

  // Step 2: Programme
  programmeId: '',
  deliveryMode: 'IN_PERSON',
  preferredSchedule: 'Morning (9am - 1pm)',
  preferredStartDate: '',
  expertiseLevel: 'Beginner',
  agreedTuitionFee: '0',
  preferredDuration: '3 Months',

  // Step 3: Background
  employmentStatus: 'Employed',
  referralSource: 'Social Media',
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
  { step: 1, title: 'Personal', desc: 'Contact & Identity' },
  { step: 2, title: 'Programme', desc: 'Course & Delivery' },
  { step: 3, title: 'Background', desc: 'Experience & History' },
  { step: 4, title: 'Funding', desc: 'Sponsorship Details' },
  { step: 5, title: 'Review', desc: 'Consent & Submit' },
];

export function ApplyFormClient({
  programmes,
  prefilledEnquiryId,
  prefilledEmail,
  prefilledName,
}: ApplyFormClientProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
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
      // Auto-update tuition fee when programme changes
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
      if (!formData.programmeId) return 'Please select a programme.';
    }
    if (step === 5) {
      if (!formData.consentAcknowledged) {
        return 'You must confirm that the information provided is accurate.';
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
    setCurrentStep((s) => Math.min(s + 1, STEPS.length));
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
    <div className="max-w-3xl mx-auto">
      {/* Wizard Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {STEPS.map((s) => {
            const isCompleted = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div key={s.step} className="flex-1 flex flex-col items-center text-center px-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all mb-1.5 ${
                    isCompleted
                      ? 'bg-blue-600 text-white'
                      : isCurrent
                      ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-600 font-extrabold'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isCompleted ? '✓' : s.step}
                </div>
                <span
                  className={`text-xs hidden sm:block ${
                    isCurrent ? 'font-bold text-gray-900' : 'text-gray-500 font-medium'
                  }`}
                >
                  {s.title}
                </span>
                <span className="text-[10px] text-gray-400 hidden sm:block">{s.desc}</span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Form Container */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 sm:p-8">
        {errorMessage && (
          <div role="alert" className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Honeypot field (hidden from real users, caught by bots) */}
          <div className="hidden" aria-hidden="true">
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

          {/* STEP 1: Personal Details */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Personal & Contact Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-xs font-semibold text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g. John"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-xs font-semibold text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g. Doe"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="john.doe@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-xs font-semibold text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="08012345678"
                  />
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-xs font-semibold text-gray-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="gender" className="block text-xs font-semibold text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    id="gender"
                    value={formData.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other / Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="stateOfOrigin" className="block text-xs font-semibold text-gray-700 mb-1">
                    State of Origin
                  </label>
                  <input
                    id="stateOfOrigin"
                    type="text"
                    value={formData.stateOfOrigin}
                    onChange={(e) => updateField('stateOfOrigin', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g. Lagos, Rivers, Edo"
                  />
                </div>

                <div>
                  <label htmlFor="maritalStatus" className="block text-xs font-semibold text-gray-700 mb-1">
                    Marital Status
                  </label>
                  <select
                    id="maritalStatus"
                    value={formData.maritalStatus}
                    onChange={(e) => updateField('maritalStatus', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="address" className="block text-xs font-semibold text-gray-700 mb-1">
                    Residential Address
                  </label>
                  <textarea
                    id="address"
                    rows={2}
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Street, City, State"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Programme & Study Mode */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Programme & Study Mode
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="programmeId" className="block text-xs font-semibold text-gray-700 mb-1">
                    Select Programme <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="programmeId"
                    value={formData.programmeId}
                    onChange={(e) => updateField('programmeId', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="">Choose a programme...</option>
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — NGN {Number(p.tuition_fee || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Delivery Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['IN_PERSON', 'ONLINE', 'HYBRID'] as DeliveryMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateField('deliveryMode', mode)}
                          className={`py-2 px-1 text-center rounded-lg text-xs font-semibold border transition-all ${
                            formData.deliveryMode === mode
                              ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {mode === 'IN_PERSON' ? 'In-Person' : mode === 'ONLINE' ? 'Online' : 'Hybrid'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="preferredSchedule" className="block text-xs font-semibold text-gray-700 mb-1">
                      Preferred Schedule
                    </label>
                    <select
                      id="preferredSchedule"
                      value={formData.preferredSchedule}
                      onChange={(e) => updateField('preferredSchedule', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Morning (9am - 1pm)">Morning (9am - 1pm)</option>
                      <option value="Afternoon (2pm - 6pm)">Afternoon (2pm - 6pm)</option>
                      <option value="Weekend (Sat - Sun)">Weekend (Sat - Sun)</option>
                      <option value="Flexible / Self-Paced">Flexible / Self-Paced</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="expertiseLevel" className="block text-xs font-semibold text-gray-700 mb-1">
                      Current Expertise Level
                    </label>
                    <select
                      id="expertiseLevel"
                      value={formData.expertiseLevel}
                      onChange={(e) => updateField('expertiseLevel', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Beginner">Beginner (No prior experience)</option>
                      <option value="Intermediate">Intermediate (Some hands-on experience)</option>
                      <option value="Advanced">Advanced (Working professional)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="preferredStartDate" className="block text-xs font-semibold text-gray-700 mb-1">
                      Preferred Start Date
                    </label>
                    <input
                      id="preferredStartDate"
                      type="date"
                      value={formData.preferredStartDate}
                      onChange={(e) => updateField('preferredStartDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Background & History */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Background & Experience
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="employmentStatus" className="block text-xs font-semibold text-gray-700 mb-1">
                    Employment Status
                  </label>
                  <select
                    id="employmentStatus"
                    value={formData.employmentStatus}
                    onChange={(e) => updateField('employmentStatus', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="Employed">Employed</option>
                    <option value="Self-Employed">Self-Employed / Business Owner</option>
                    <option value="Unemployed">Seeking Employment</option>
                    <option value="Student">Current Student (Tertiary)</option>
                    <option value="NYSC">NYSC Member</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="referralSource" className="block text-xs font-semibold text-gray-700 mb-1">
                    How did you hear about us?
                  </label>
                  <select
                    id="referralSource"
                    value={formData.referralSource}
                    onChange={(e) => updateField('referralSource', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="Social Media">Social Media (Instagram/LinkedIn/X)</option>
                    <option value="Friend or Family">Friend / Family / Colleague</option>
                    <option value="Google Search">Google Search</option>
                    <option value="Billboard / Flyer">Billboard / Flyer</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="claimedStudentNumber" className="block text-xs font-semibold text-gray-700 mb-1">
                    Returning Student Number (Optional)
                  </label>
                  <input
                    id="claimedStudentNumber"
                    type="text"
                    value={formData.claimedStudentNumber}
                    onChange={(e) => updateField('claimedStudentNumber', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                    placeholder="e.g. STU-2025-00123"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    If you have previously taken a course with Clasptek, enter your student ID here.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-xs font-semibold text-gray-700 mb-1">
                    Additional Comments or Learning Goals
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Tell us what you hope to achieve through this programme..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Sponsorship Details */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Tuition Sponsorship & Funding
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="sponsorType" className="block text-xs font-semibold text-gray-700 mb-1">
                    Who will be paying the tuition fee?
                  </label>
                  <select
                    id="sponsorType"
                    value={formData.sponsorType}
                    onChange={(e) => updateField('sponsorType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="Self-sponsored">Self-sponsored</option>
                    <option value="Employer / Company">Employer / Corporate Sponsor</option>
                    <option value="Parent / Guardian">Parent / Guardian</option>
                    <option value="Scholarship / NGO">Scholarship / NGO</option>
                  </select>
                </div>

                {formData.sponsorType !== 'Self-sponsored' && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                    <div>
                      <label htmlFor="sponsorName" className="block text-xs font-semibold text-gray-700 mb-1">
                        Sponsor Name / Organization
                      </label>
                      <input
                        id="sponsorName"
                        type="text"
                        value={formData.sponsorName}
                        onChange={(e) => updateField('sponsorName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        placeholder="Company or sponsor name"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sponsorPhone" className="block text-xs font-semibold text-gray-700 mb-1">
                          Sponsor Phone
                        </label>
                        <input
                          id="sponsorPhone"
                          type="tel"
                          value={formData.sponsorPhone}
                          onChange={(e) => updateField('sponsorPhone', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label htmlFor="sponsorEmail" className="block text-xs font-semibold text-gray-700 mb-1">
                          Sponsor Email
                        </label>
                        <input
                          id="sponsorEmail"
                          type="email"
                          value={formData.sponsorEmail}
                          onChange={(e) => updateField('sponsorEmail', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Review & Consent */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Review & Confirm Application
              </h2>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs space-y-3">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Applicant:</span>
                    <span className="font-bold text-slate-800">
                      {formData.firstName} {formData.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Contact:</span>
                    <span className="text-slate-800">
                      {formData.email} {formData.phone ? `(${formData.phone})` : ''}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Selected Programme:</span>
                    <span className="font-bold text-blue-700">
                      {selectedProg?.name || 'General Application'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tuition Fee:</span>
                    <span className="font-mono font-bold text-slate-800">
                      NGN {Number(formData.agreedTuitionFee || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block">Study Mode & Schedule:</span>
                    <span className="text-slate-800">
                      {formData.deliveryMode} • {formData.preferredSchedule}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Sponsorship:</span>
                    <span className="text-slate-800">{formData.sponsorType}</span>
                  </div>
                </div>
              </div>

              {/* Consent checkbox */}
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.consentAcknowledged}
                    onChange={(e) => updateField('consentAcknowledged', e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="text-xs text-blue-900 leading-relaxed font-medium">
                    I declare that all information submitted in this application is truthful and accurate.
                    I understand that submission does not guarantee admission until reviewed and accepted by Clasptek Academy.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < STEPS.length ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !formData.consentAcknowledged}
                className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Submit Official Application</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
