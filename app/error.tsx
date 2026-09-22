'use client';

/**
 * error.tsx — Global Error Boundary
 * Phase 2: Next.js Foundation
 * Displays a friendly recovery UI without leaking stack traces or credentials.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to an error monitoring service in production (e.g. Sentry)
    // Never log to console in production — use structured logging only
    if (process.env.NODE_ENV === 'development') {
      console.error('[GlobalError]', error.message);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-[var(--danger-light)] flex items-center justify-center">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            Something went wrong
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            An unexpected error occurred. Your data is safe. Please try again
            or contact support if the problem persists.
          </p>
          {process.env.NODE_ENV === 'development' && error.digest && (
            <p className="text-xs font-mono text-[var(--text-tertiary)] bg-[var(--surface-2)] rounded px-3 py-1.5 break-all">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = '/dashboard'}>
            Return to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
