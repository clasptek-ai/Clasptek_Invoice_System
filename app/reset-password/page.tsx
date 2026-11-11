'use client';

/**
 * app/reset-password/page.tsx — Dedicated Password Recovery Screen
 * Phase C320: Production Password Recovery Identity Isolation Remediation
 *
 * SECURITY INVARIANTS:
 * 1. Validates Supabase recovery tokens (hash / search params) safely.
 * 2. Identity Isolation: Authenticated session identity (user.email) is resolved
 *    authoritatively from Supabase Auth — NEVER trusting client-supplied email
 *    query parameters or unverified forms.
 * 3. Token Expiration & Replay Rejection: Detects otp_expired and invalid tokens,
 *    displaying clear guidance rather than falling back or redirecting prematurely.
 * 4. Clean Termination: Immediately calls supabase.auth.signOut() upon successful
 *    password update so the single-use recovery session cannot linger or contaminate
 *    subsequent dashboard sessions.
 * 5. Prevents premature redirect to dashboard during the recovery flow.
 */

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

type RecoveryStage =
  | 'loading'
  | 'set_new_password'
  | 'expired'
  | 'request_reset'
  | 'request_sent'
  | 'success';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<RecoveryStage>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [requestEmail, setRequestEmail] = useState<string>('');
  const [cooldown, setCooldown] = useState<number>(0);

  // Form states for setting new password
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<{ password?: string; confirm?: string }>({});

  // ─── Token Inspection & Session Resolution ──────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function initRecovery() {
      if (typeof window === 'undefined') return;

      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setErrorMessage('Authentication service is not configured.');
          setStage('request_reset');
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const hash = window.location.hash || '';

      // Check URL search or hash for Supabase error indicators
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
      const errorDesc = searchParams.get('error_description') || hashParams.get('error_description');

      if (errorCode || errorDesc) {
        if (isMounted) {
          if (errorCode === 'otp_expired' || errorDesc?.toLowerCase().includes('expired')) {
            setErrorMessage(
              'This password recovery link has expired or has already been used. For your security, recovery links are single-use and time-limited.'
            );
          } else {
            setErrorMessage(
              errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Invalid or expired recovery link.'
            );
          }
          setStage('expired');
        }
        return;
      }

      // Supabase GoTrue puts access_token and type=recovery in the URL hash
      const isRecoveryType = hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';

      // Check current user session
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        if (currentUser) {
          if (isMounted) {
            setUser(currentUser);
            setStage('set_new_password');
          }
          return;
        }
      } catch (err) {
        console.warn('C320: Error retrieving recovery user:', err);
      }

      // Listen for auth state change if Supabase is still parsing the hash token
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && isRecoveryType)) {
            if (session?.user && isMounted) {
              setUser(session.user);
              setStage('set_new_password');
            }
          }
        }
      );

      // If after 1.5s no recovery user was detected and no active session, show request reset form
      const timeout = setTimeout(() => {
        if (isMounted && stage === 'loading') {
          setStage('request_reset');
        }
      }, 1500);

      return () => {
        authListener.subscription.unsubscribe();
        clearTimeout(timeout);
      };
    }

    initRecovery();

    return () => {
      isMounted = false;
    };
  }, [searchParams, stage]);

  // Cooldown countdown timer for requesting reset links
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ─── Password Strength Verification ─────────────────────────────────────────
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumberOrSymbol = /[\d!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumberOrSymbol;

  // ─── Handle Password Update Submission ──────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const errors: { password?: string; confirm?: string } = {};

    if (!newPassword) {
      errors.password = 'Please enter a new password.';
    } else if (!isPasswordValid) {
      errors.password = 'Password does not satisfy all security criteria.';
    }

    if (newPassword !== confirmPassword) {
      errors.confirm = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(error.message || 'Failed to update password. Please request a new recovery link.');
        setIsSubmitting(false);
        return;
      }

      // Terminate recovery session to prevent replay or cross-session contamination
      await supabase.auth.signOut();

      // Clean the URL hash/search to remove any tokens
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }

      setIsSubmitting(false);
      setStage('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  // ─── Handle Request Reset Link ──────────────────────────────────────────────
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const email = requestEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message || 'Unable to process recovery request at this time.');
        return;
      }

      setCooldown(30);
      setStage('request_sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cp-auth-wrap">
      <div className="cp-auth-card animate-fade-in" style={{ maxWidth: '440px' }}>
        {/* Brand Header */}
        <div className="cp-auth-header">
          <div className="cp-auth-logo-wrap">
            <Image
              src="/assets/clasptek-official-logo.png"
              alt="Clasptek Portal Logo"
              width={240}
              height={60}
              className="cp-auth-logo"
              style={{ width: 'auto', maxHeight: '80px' }}
              priority
            />
          </div>
          <h1 className="cp-auth-title">Password Recovery</h1>
          <p className="cp-auth-sub">
            {stage === 'set_new_password' && 'Establish a new secure password for your verified account.'}
            {stage === 'expired' && 'The recovery link is invalid or expired.'}
            {stage === 'request_reset' && 'Enter your work email to receive a secure recovery link.'}
            {stage === 'request_sent' && 'Check your inbox for password recovery instructions.'}
            {stage === 'success' && 'Your password has been successfully updated.'}
            {stage === 'loading' && 'Verifying recovery credentials…'}
          </p>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="cp-auth-alert error"
            style={{ marginBottom: '16px' }}
          >
            {errorMessage}
          </div>
        )}

        {/* ─── STAGE: LOADING ─── */}
        {stage === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div
              className="cp-spinner"
              style={{
                width: '32px',
                height: '32px',
                margin: '0 auto 16px',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--brand-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Verifying recovery authentication token…
            </p>
          </div>
        )}

        {/* ─── STAGE: SET NEW PASSWORD ─── */}
        {stage === 'set_new_password' && (
          <form onSubmit={handleUpdatePassword} noValidate>
            {/* Authoritative Verified Identity Badge */}
            <div
              style={{
                background: 'rgba(235, 94, 40, 0.08)',
                border: '1px solid rgba(235, 94, 40, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                marginBottom: '18px',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                VERIFIED ACCOUNT IDENTITY
              </div>
              <div
                id="recovery-user-email"
                style={{
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontSize: '13.5px',
                  wordBreak: 'break-all',
                }}
              >
                {user?.email || 'Authenticated User'}
              </div>
            </div>

            {/* New Password Field */}
            <div className="cp-field" style={{ marginBottom: '16px' }}>
              <label
                htmlFor="new-password-input"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                New Password
              </label>
              <div className="cp-password-wrap">
                <input
                  id="new-password-input"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  required
                  disabled={isSubmitting}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 42px 0 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${formErrors.password ? 'var(--danger)' : 'var(--border)'}`,
                    background: 'var(--surface-0)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  className="cp-password-toggle"
                  onClick={() => setShowNewPassword((p) => !p)}
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                  {formErrors.password}
                </p>
              )}
            </div>

            {/* Password Criteria Checklist */}
            <div
              style={{
                background: 'var(--surface-50, #f8f9fa)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                marginBottom: '16px',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Password Security Requirements:</div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <li style={{ color: hasMinLength ? 'var(--success, #2b8a3e)' : 'inherit' }}>
                  {hasMinLength ? '✓' : '•'} At least 8 characters
                </li>
                <li style={{ color: hasUppercase ? 'var(--success, #2b8a3e)' : 'inherit' }}>
                  {hasUppercase ? '✓' : '•'} At least one uppercase letter (A-Z)
                </li>
                <li style={{ color: hasLowercase ? 'var(--success, #2b8a3e)' : 'inherit' }}>
                  {hasLowercase ? '✓' : '•'} At least one lowercase letter (a-z)
                </li>
                <li style={{ color: hasNumberOrSymbol ? 'var(--success, #2b8a3e)' : 'inherit' }}>
                  {hasNumberOrSymbol ? '✓' : '•'} At least one digit or special character
                </li>
              </ul>
            </div>

            {/* Confirm Password Field */}
            <div className="cp-field" style={{ marginBottom: '20px' }}>
              <label
                htmlFor="confirm-password-input"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Confirm New Password
              </label>
              <div className="cp-password-wrap">
                <input
                  id="confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  required
                  disabled={isSubmitting}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 42px 0 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${formErrors.confirm ? 'var(--danger)' : 'var(--border)'}`,
                    background: 'var(--surface-0)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  className="cp-password-toggle"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {formErrors.confirm && (
                <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                  {formErrors.confirm}
                </p>
              )}
            </div>

            <button
              id="set-new-password-btn"
              type="submit"
              disabled={isSubmitting || !isPasswordValid}
              className="cp-btn accent"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: isSubmitting || !isPasswordValid ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || !isPasswordValid ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Updating Password…' : 'Update Password & Sign Out'}
            </button>
          </form>
        )}

        {/* ─── STAGE: EXPIRED / INVALID ─── */}
        {stage === 'expired' && (
          <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(235, 94, 40, 0.1)',
                color: 'var(--brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              For your account security, password recovery links are single-use and expire quickly.
              Please request a new link below to proceed.
            </p>
            <button
              type="button"
              id="request-new-link-btn"
              onClick={() => {
                setErrorMessage('');
                setStage('request_reset');
              }}
              className="cp-btn accent"
              style={{ width: '100%', padding: '11px', fontWeight: 700 }}
            >
              Request New Recovery Link
            </button>
          </div>
        )}

        {/* ─── STAGE: REQUEST RESET ─── */}
        {stage === 'request_reset' && (
          <form onSubmit={handleRequestReset} noValidate>
            <div className="cp-field" style={{ marginBottom: '20px' }}>
              <label
                htmlFor="recovery-email-input"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Work Email Address
              </label>
              <input
                id="recovery-email-input"
                type="email"
                autoComplete="email"
                placeholder="name@clasptek.org"
                required
                disabled={isSubmitting || cooldown > 0}
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-0)',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              id="send-recovery-link-btn"
              type="submit"
              disabled={isSubmitting || cooldown > 0}
              className="cp-btn accent"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: isSubmitting || cooldown > 0 ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || cooldown > 0 ? 0.7 : 1,
              }}
            >
              {isSubmitting
                ? 'Sending Link…'
                : cooldown > 0
                ? `Wait ${cooldown}s to Resend`
                : 'Send Recovery Link'}
            </button>
          </form>
        )}

        {/* ─── STAGE: REQUEST SENT ─── */}
        {stage === 'request_sent' && (
          <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(43, 138, 62, 0.1)',
                color: 'var(--success, #2b8a3e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>
              Recovery Email Dispatched
            </p>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              If an active enterprise account is registered for{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{requestEmail}</strong>, a secure single-use recovery link
              has been dispatched. Please check your inbox and spam folder.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="cp-btn"
              style={{
                width: '100%',
                padding: '11px',
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: 'var(--surface-0)',
                color: 'var(--text-primary)',
              }}
            >
              Return to Sign In
            </button>
          </div>
        )}

        {/* ─── STAGE: SUCCESS ─── */}
        {stage === 'success' && (
          <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(43, 138, 62, 0.1)',
                color: 'var(--success, #2b8a3e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '8px' }}>
              Password Reset Complete
            </p>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              Your account password has been successfully established and verified. Recovery session credentials have been
              securely invalidated.
            </p>
            <button
              type="button"
              id="return-to-login-btn"
              onClick={() => router.push('/login')}
              className="cp-btn accent"
              style={{ width: '100%', padding: '11px', fontWeight: 700 }}
            >
              Sign In with New Password
            </button>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="cp-auth-footer-links" style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="cp-auth-link"
            onClick={() => router.push('/login')}
          >
            &larr; Back to Sign In
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
            Authorized Personnel Only
          </span>
        </div>

        <div className="cp-auth-footer">
          &copy; {new Date().getFullYear()} Clasptek Coaching Limited &middot; Secure Enterprise Portal
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="cp-auth-wrap">
          <div className="cp-auth-card animate-fade-in" style={{ maxWidth: '440px', textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading recovery portal…</p>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

