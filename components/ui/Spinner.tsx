import React from 'react';
import { cn } from '@/lib/utils/cn';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
  xl: 'w-12 h-12 border-4',
};

export function Spinner({ size = 'md', className, label = 'Loading…' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span
        className={cn(
          'rounded-full border-[var(--border-strong)] border-t-[var(--interactive)] animate-spin',
          sizeStyles[size]
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ─── Full Page Loading State ──────────────────────────────────────────────────

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--surface-0)] z-50">
      <div
        className="w-10 h-10 rounded-full border-4 border-[var(--border)] border-t-[var(--interactive)] animate-spin"
        aria-hidden="true"
      />
      <p className="mt-4 text-sm text-[var(--text-tertiary)] font-medium">{label}</p>
    </div>
  );
}
