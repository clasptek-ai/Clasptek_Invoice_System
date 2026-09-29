'use client';

/**
 * app/login/page.tsx — Authoritative Clasptek Authentication Screen
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Restores dark radial gradient, 440px white card with heavy shadow,
 * official logo clasptek-official-logo.png, and original typography.
 * Preserves Supabase GoTrue authentication integration.
 */

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

export default function LoginPage() {
  const { signIn, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(nextPath);
    }
  }, [isAuthenticated, isLoading, nextPath, router]);

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const nextErrors = { email: '', password: '', general: '' };
    let valid = true;

    if (!form.email.trim()) {
      nextErrors.email = 'Email address is required.';
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Please enter a valid email address.';
      valid = false;
    }

    if (!form.password) {
      nextErrors.password = 'Password is required.';
      valid = false;
    } else if (form.password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.';
      valid = false;
    }

    setErrors(nextErrors);
    return valid;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({ email: '', password: '', general: '' });

    if (!validate()) return;

    setIsSubmitting(true);
    const { error } = await signIn(form.email.trim(), form.password);
    setIsSubmitting(false);

    if (error) {
      setErrors((prev) => ({ ...prev, general: error }));
      return;
    }

    router.replace(nextPath);
  };

  return (
    <div className="cp-auth-wrap">
      <div className="cp-auth-card animate-fade-in">
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
          <h1 className="cp-auth-title">Clasptek Portal</h1>
          <p className="cp-auth-sub">Sign in to access your secure workspace.</p>
        </div>

        {/* Global Error Banner */}
        {errors.general && (
          <div role="alert" aria-live="assertive" className="cp-auth-alert error">
            {errors.general}
          </div>
        )}

        {/* Login Form */}
        <form id="login-form" onSubmit={handleSubmit} noValidate>
          <div className="cp-field" style={{ marginBottom: '16px' }}>
            <label
              htmlFor="login-email"
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
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="name@clasptek.org"
              required
              disabled={isSubmitting}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={{
                width: '100%',
                height: '40px',
                padding: '0 12px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${errors.email ? 'var(--danger)' : 'var(--border)'}`,
                background: 'var(--surface-0)',
                fontSize: '14px',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {errors.email && (
              <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                {errors.email}
              </p>
            )}
          </div>

          <div className="cp-field" style={{ marginBottom: '20px' }}>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <div className="cp-password-wrap">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                disabled={isSubmitting}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 42px 0 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${errors.password ? 'var(--danger)' : 'var(--border)'}`,
                  background: 'var(--surface-0)',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                id="btnTogglePwd"
                className="cp-password-toggle"
                onClick={() => setShowPassword((p) => !p)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
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
            {errors.password && (
              <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                {errors.password}
              </p>
            )}
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="cp-btn accent"
            style={{
              width: '100%',
              padding: '11px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Signing In…' : 'Sign In'}
          </button>
        </form>

        {/* Footer Links */}
        <div className="cp-auth-footer-links">
          <button
            type="button"
            id="forgot-password-btn"
            className="cp-auth-link"
            onClick={() => alert('Password reset: please contact your system administrator.')}
          >
            Forgot Password?
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
