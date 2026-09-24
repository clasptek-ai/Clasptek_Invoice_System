'use client';

/**
 * app/applicant-portal/ApplicantPortalClient.tsx — Client component for Applicant Status & Admissions Portal
 * Phase 9E: User Workspaces Migration
 * Implements exact Clasptek tracking layout, anti-enumeration security, and progress stepper.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import type { PublicApplicantTracking } from '@/types/tracking';

type ApplicationData = NonNullable<PublicApplicantTracking['application']>;

export function ApplicantPortalClient() {
  const [appRef, setAppRef] = useState('');
  const [credential, setCredential] = useState('');
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appRef.trim() || !credential.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setApplication(null);

    try {
      const res = await fetch('/api/admissions/applications/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: appRef.trim(),
          credential: credential.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.application) {
        throw new Error(
          data.message ||
            'Application could not be found or verified with the provided details. Please check your reference number and contact information.'
        );
      }

      setApplication(data.application);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Application could not be found or verified with the provided details. Please check your reference number and contact information.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const fmtDate = (d?: string | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  // Progression stepper steps
  const steps = [
    { key: 'SUBMITTED', label: '1. Submitted' },
    { key: 'REVIEW', label: '2. Admissions Review' },
    { key: 'QUALIFIED', label: '3. Qualified' },
    { key: 'ENROLLED', label: '4. Enrolled' },
  ];

  let currentStepIdx = 0;
  let badgeColor = '#0284C7';
  let badgeBg = '#E0F2FE';

  if (application) {
    if (application.raw_status === 'REVIEW_REQUIRED' || application.raw_status === 'MATCHED') {
      currentStepIdx = 1;
      badgeColor = '#B45309';
      badgeBg = '#FEF3C7';
    } else if (application.raw_status === 'QUALIFIED') {
      currentStepIdx = 2;
      badgeColor = '#15803D';
      badgeBg = '#DCFCE7';
    } else if (application.raw_status === 'CONVERTED') {
      currentStepIdx = 3;
      badgeColor = '#6B21A8';
      badgeBg = '#F3E8FF';
    } else if (application.raw_status === 'REJECTED' || application.raw_status === 'CANCELLED') {
      badgeColor = '#B91C1C';
      badgeBg = '#FEE2E2';
    }
  }

  return (
    <div style={{ maxWidth: '880px', margin: '30px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      {/* Portal Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: '12px',
          padding: '28px 32px',
          color: '#FFFFFF',
          marginBottom: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#38BDF8', marginBottom: '6px' }}>
              CLASPTEK ADMISSIONS SELF-SERVICE
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', color: '#F8FAFC' }}>
              Applicant Status &amp; Admissions Portal
            </h1>
            <div style={{ fontSize: '13.5px', color: '#94A3B8', maxWidth: '620px', lineHeight: 1.5 }}>
              Check your application progress, admission decisions, required credentials, and next steps in real time.
            </div>
          </div>
          <Link
            href="/apply"
            style={{
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #475569',
              background: 'transparent',
              color: '#F1F5F9',
              textDecoration: 'none',
            }}
          >
            + Apply for New Programme
          </Link>
        </div>
      </div>

      {/* Search / Lookup Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🔍</span> Track Your Application
        </h2>

        <form onSubmit={handleLookup}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '12.5px', color: '#334155', marginBottom: '6px' }}>
                Application Reference <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={appRef}
                onChange={(e) => setAppRef(e.target.value)}
                placeholder="e.g. APP-2026-000001"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              />
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                Provided upon completing your initial application submission.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '12.5px', color: '#334155', marginBottom: '6px' }}>
                Registered Email or Phone <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="applicant@example.com or 080..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '13.5px',
                }}
              />
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                Used strictly to verify applicant identity (anti-enumeration).
              </div>
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #F87171',
                borderRadius: '6px',
                padding: '12px 16px',
                color: '#991B1B',
                fontSize: '13px',
                marginBottom: '18px',
              }}
            >
              {errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: '13px', color: '#475569', textDecoration: 'none', fontWeight: 600 }}>
              &larr; Staff Portal Login
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '10px 24px',
                fontSize: '13.5px',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                background: '#0F172A',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              {isLoading ? 'Verifying Details...' : 'Check Application Status'}
            </button>
          </div>
        </form>
      </div>

      {/* Dossier Container (Rendered on successful lookup) */}
      {application && (
        <div>
          {/* Status Card */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderLeft: `5px solid ${badgeColor}`,
              borderRadius: '8px',
              padding: '24px',
              marginBottom: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Current Status
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                  {application.status_label}
                </div>
                <div style={{ fontSize: '13.5px', color: '#475569', marginTop: '6px', maxWidth: '580px', lineHeight: 1.5 }}>
                  {application.status_description}
                </div>
              </div>
              <span
                style={{
                  background: badgeBg,
                  color: badgeColor,
                  fontWeight: 800,
                  fontSize: '13px',
                  padding: '6px 14px',
                  borderRadius: '999px',
                }}
              >
                {application.status_label}
              </span>
            </div>

            {/* Progress Stepper */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }}>
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const dotBg = isCompleted || isCurrent ? badgeColor : '#CBD5E1';
                const textColor = isCurrent ? '#0F172A' : isCompleted ? '#475569' : '#94A3B8';
                const weight = isCurrent ? 800 : 600;
                return (
                  <div key={step.key} style={{ textAlign: 'center' }}>
                    <div style={{ height: '6px', borderRadius: '3px', background: dotBg, marginBottom: '8px' }} />
                    <div style={{ fontSize: '11.5px', fontWeight: weight, color: textColor }}>{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details & Document Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Left: Application Information */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 16px 0', borderBottom: '1.5px solid #F1F5F9', paddingBottom: '10px' }}>
                Application Information
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600, width: '42%' }}>Reference Number:</td>
                    <td style={{ padding: '8px 0', fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}>
                      {application.application_number}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Applicant Name:</td>
                    <td style={{ padding: '8px 0', fontWeight: 700, color: '#1E293B' }}>{application.candidate_name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Programme:</td>
                    <td style={{ padding: '8px 0', fontWeight: 700, color: '#0369A1' }}>{application.programme_name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Delivery Mode:</td>
                    <td style={{ padding: '8px 0', color: '#334155' }}>{application.delivery_mode}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Preferred Schedule:</td>
                    <td style={{ padding: '8px 0', color: '#334155' }}>{application.preferred_schedule}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Submission Date:</td>
                    <td style={{ padding: '8px 0', color: '#334155' }}>{fmtDate(application.submitted_at)}</td>
                  </tr>
                  {application.preferred_start_date && (
                    <tr>
                      <td style={{ padding: '8px 0', color: '#64748B', fontWeight: 600 }}>Target Start Date:</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: '#334155' }}>{fmtDate(application.preferred_start_date)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Right: Requirements & Admissions Contact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 14px 0', borderBottom: '1.5px solid #F1F5F9', paddingBottom: '10px' }}>
                  Document Requirements
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                  The following credentials must be presented or verified prior to cohort induction:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {application.required_documents.map((doc, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#334155' }}>{doc.name}</span>
                      <span style={{ background: '#E2E8F0', color: '#475569', fontWeight: 700, fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                        Verification Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' }}>
                <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
                  Admissions Inquiries
                </h4>
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
                  For status inquiries or schedule adjustments, contact Admissions directly:<br />
                  <strong>Email:</strong>{' '}
                  <a href={`mailto:${application.admissions_contact.email}`} style={{ color: '#0284C7', textDecoration: 'none' }}>
                    {application.admissions_contact.email}
                  </a>
                  <br />
                  <strong>Helpline:</strong> {application.admissions_contact.phone}
                  <br />
                  <strong>Office:</strong> {application.admissions_contact.office}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
