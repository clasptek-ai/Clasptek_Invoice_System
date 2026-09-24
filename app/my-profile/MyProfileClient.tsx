'use client';

/**
 * app/my-profile/MyProfileClient.tsx — Client component for My Profile & Banking Details
 * Phase 9E: User Workspaces Migration
 * Matches exact Clasptek doc-box styling, split information sections, and security notes.
 */

import React, { useState } from 'react';
import type { EmployeeProfile } from '@/types/ess';
import type { UserRole } from '@/types/auth';

interface Props {
  profile: EmployeeProfile;
  currentRole: UserRole;
  userEmail: string;
}

export function MyProfileClient({ profile, currentRole }: Props) {
  const [showAccount, setShowAccount] = useState(false);

  const maskedAccount = profile.accountNumber
    ? profile.accountNumber.length > 4
      ? '••••••' + profile.accountNumber.slice(-4)
      : profile.accountNumber
    : 'Not on file';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>👤</span> {currentRole === 'Facilitator' ? 'My Profile & Engagements' : 'My Personnel Profile & Banking Details'}
        </h1>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>
          Review your official employment record and confidential disbursement banking details on file.
        </p>
      </div>

      {/* Main Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          {/* Box 1: Personal & Employment Information */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderLeft: '4px solid #2563EB', borderRadius: '6px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#2563EB', marginBottom: '16px' }}>
              PERSONAL &amp; EMPLOYMENT INFORMATION
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Full Name:</span>
                <strong style={{ color: '#0F172A' }}>{profile.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Personnel ID:</span>
                <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{profile.employeeId}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Work Email:</span>
                <strong style={{ color: '#0F172A' }}>{profile.email}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Phone Number:</span>
                <strong style={{ color: '#0F172A' }}>{profile.phone || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Department:</span>
                <strong style={{ color: '#0F172A' }}>{profile.department}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Role / Designation:</span>
                <strong style={{ color: '#0F172A' }}>{profile.jobTitle}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
                <span style={{ color: '#64748B' }}>Personnel Type:</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#E0E7FF', color: '#3730A3' }}>
                  {profile.employeeType.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Box 2: Payroll & Banking Disbursement Details */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderLeft: '4px solid #16A34A', borderRadius: '6px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#16A34A', marginBottom: '16px' }}>
              PAYROLL &amp; BANKING DISBURSEMENT DETAILS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Bank Name:</span>
                <strong style={{ color: '#0F172A' }}>{profile.bankName || 'Guaranty Trust Bank'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Account Name:</span>
                <strong style={{ color: '#0F172A' }}>{profile.accountName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Account Number:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>
                    {showAccount ? profile.accountNumber || '—' : maskedAccount}
                  </strong>
                  {profile.accountNumber && (
                    <button
                      type="button"
                      onClick={() => setShowAccount(!showAccount)}
                      style={{ fontSize: '11px', color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {showAccount ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Tax Identification (TIN):</span>
                <strong style={{ color: '#0F172A' }}>{profile.taxNumber || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E2E8F0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Compensation Model:</span>
                <strong style={{ color: '#0F172A', textTransform: 'capitalize' }}>{profile.compensationType.replace('_', ' ')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
                <span style={{ color: '#64748B' }}>Account Status:</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#15803D' }}>
                  {profile.employmentStatus.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Guidance Footer */}
        <div style={{ background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '14px 18px', fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📊</span>
          <span>
            <em>Note: If you need to update your registered disbursement banking account details or tax information, please contact the Finance Department or submit a formal profile change request.</em>
          </span>
        </div>
      </div>
    </div>
  );
}
