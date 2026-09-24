'use client';

/**
 * app/my-security/MySecurityClient.tsx — Client component for Account Security
 * Phase 9E: User Workspaces Migration
 * Matches exact Clasptek password change card, strength validator, and GoTrue update logic.
 */

import React, { useState } from 'react';
import type { UserRole } from '@/types/auth';

interface Props {
  userEmail: string;
  currentRole: UserRole;
}

export function MySecurityClient({ userEmail }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Validate strength
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
  const isStrong = hasMinLength && hasUppercase && hasLowercase && hasDigitOrSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!hasMinLength) {
      setStatusMessage({ text: 'New password must be at least 8 characters.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    if (!isStrong) {
      setStatusMessage({
        text: 'Password must contain uppercase, lowercase, and a number or special character.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/ess/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password');
      }

      setStatusMessage({ text: '✔ Password successfully updated. Your new credentials are now active.', type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating password';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🔒</span> Account &amp; Login Security
        </h1>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>
          Manage your portal access credentials and security settings.
        </p>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13.5px',
            background: statusMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${statusMessage.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
            color: statusMessage.type === 'success' ? '#166534' : '#991B1B',
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Security Form Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Registered Login Email
            </label>
            <input
              type="text"
              value={userEmail}
              disabled
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#64748B',
                fontSize: '13.5px',
                cursor: 'not-allowed',
              }}
            />
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>
              Login email is managed by your organization administrator.
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              New Secure Password <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min. 8 characters)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13.5px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Confirm New Password <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13.5px',
              }}
            />
          </div>

          {/* Password Strength Checklist */}
          {newPassword && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Password Requirements:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: hasMinLength ? '#16A34A' : '#94A3B8' }}>
                  {hasMinLength ? '✔' : '○'} At least 8 characters
                </span>
                <span style={{ color: hasUppercase ? '#16A34A' : '#94A3B8' }}>
                  {hasUppercase ? '✔' : '○'} At least one uppercase letter (A-Z)
                </span>
                <span style={{ color: hasLowercase ? '#16A34A' : '#94A3B8' }}>
                  {hasLowercase ? '✔' : '○'} At least one lowercase letter (a-z)
                </span>
                <span style={{ color: hasDigitOrSpecial ? '#16A34A' : '#94A3B8' }}>
                  {hasDigitOrSpecial ? '✔' : '○'} At least one number or symbol
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                fontSize: '13.5px',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                background: '#0F172A',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'Updating...' : '🔒 Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
