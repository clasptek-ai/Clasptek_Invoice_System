'use client';

/**
 * app/login/page.tsx — Authentication Entry Point
 * Phase 2: Next.js Foundation
 * Integrates with Supabase GoTrue via useAuth().signIn().
 * Redirects authenticated users to /dashboard (middleware also guards this).
 */

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/context';

export default function LoginPage() {
  const { signIn, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect immediately
  React.useEffect(() => {
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-1)] px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-[var(--radius-xl)] bg-[var(--primary)] flex items-center justify-center mb-4">
            <span className="text-white font-extrabold text-2xl select-none">C</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Clasptek Portal
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Sign in to your account
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-md)] p-8">
          <form id="login-form" onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* General Error */}
            {errors.general && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--danger-light)] border border-[var(--danger)] border-opacity-30 px-4 py-3"
              >
                <svg
                  className="shrink-0 mt-0.5 text-[var(--danger)]"
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm text-[var(--danger-dark)] font-medium">
                  {errors.general}
                </p>
              </div>
            )}

            {/* Email */}
            <Input
              id="login-email"
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@clasptek.com"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={errors.email}
              disabled={isSubmitting}
              leftAddon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              }
            />

            {/* Password */}
            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              error={errors.password}
              disabled={isSubmitting}
              leftAddon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              }
            />

            {/* Submit */}
            <Button
              id="login-submit-btn"
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
              className="w-full mt-2"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Forgot password placeholder */}
          <div className="mt-5 text-center">
            <button
              type="button"
              id="forgot-password-btn"
              className="text-sm text-[var(--text-interactive)] hover:underline"
              onClick={() => alert('Password reset: contact your system administrator.')}
            >
              Forgot your password?
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
          © {new Date().getFullYear()} Clasptek. All rights reserved.
        </p>
      </div>
    </div>
  );
}
