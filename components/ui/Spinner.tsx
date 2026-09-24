/**
 * components/ui/Spinner.tsx — Phase 2 & 9G
 * Universal Spinner primitive backed by authoritative .cp-spinner design tokens.
 */

import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  style?: React.CSSProperties;
}

export function Spinner({ size = 'md', className = '', label = 'Loading…', style }: SpinnerProps) {
  const sizeClass = size === 'sm' ? 'cp-spinner-sm' : size === 'lg' ? 'cp-spinner-lg' : 'cp-spinner-md';

  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}
      className={className}
    >
      <span className={`cp-spinner ${sizeClass}`} aria-hidden="true" />
      <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        {label}
      </span>
    </div>
  );
}

// ─── Full Page Loading State ──────────────────────────────────────────────────

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)', zIndex: 1000 }}>
      <span className="cp-spinner cp-spinner-lg" aria-hidden="true" />
      <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</p>
    </div>
  );
}
