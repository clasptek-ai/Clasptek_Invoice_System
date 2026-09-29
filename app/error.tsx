'use client';

/**
 * error.tsx — Global Error Boundary
 * Phase 2 & 9G: Genuine Clasptek Visual Shell Styling
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GlobalError]', error.message);
    }
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--neutral-bg, #F8FAFC)', padding: '20px' }}>
      <div className="cp-card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '40px 30px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--danger-bg, #FEF2F2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: 'var(--danger, #DC2626)', fontSize: '24px' }}>
          ⚠️
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: '0 0 8px 0' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          An unexpected error occurred. Your data is safe. Please try again or return to the dashboard.
        </p>

        {process.env.NODE_ENV === 'development' && error.digest && (
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: '4px', marginBottom: '20px', wordBreak: 'break-all' }}>
            Error ID: {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Button variant="primary" onClick={reset} style={{ width: '100%' }}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = '/dashboard'} style={{ width: '100%' }}>
            Return to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
