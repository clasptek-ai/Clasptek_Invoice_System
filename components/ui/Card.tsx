/**
 * components/ui/Card.tsx — Phase 2 & 9G
 * Universal Card primitive backed by authoritative .cp-card design system.
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevation?: 0 | 1 | 2;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  interactive?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Card({
  children,
  className = '',
  elevation = 1,
  header,
  footer,
  interactive = false,
  onClick,
  style,
}: CardProps) {
  return (
    <div
      className={`cp-card ${className}`.trim()}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{
        cursor: interactive ? 'pointer' : undefined,
        boxShadow: elevation === 0 ? 'none' : elevation === 2 ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {header && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          {header}
        </div>
      )}
      <div style={{ padding: '20px' }}>{children}</div>
      {footer && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── KPI Metric Card ──────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeDirection?: 'up' | 'down' | 'neutral';
  changePeriod?: string;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MetricCard({
  label,
  value,
  change,
  changeDirection = 'neutral',
  changePeriod = 'vs last month',
  icon,
  className = '',
  style,
}: MetricCardProps) {
  const changeColor =
    changeDirection === 'up'
      ? 'var(--success)'
      : changeDirection === 'down'
      ? 'var(--danger)'
      : 'var(--text-muted)';

  const changeArrow =
    changeDirection === 'up' ? '↑' : changeDirection === 'down' ? '↓' : '→';

  return (
    <div
      className={`cp-kpi-card ${className}`.trim()}
      style={{ padding: '16px 20px', ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="cp-kpi-label" style={{ margin: 0 }}>{label}</p>
          <p className="cp-kpi-val" style={{ margin: '4px 0 0 0', color: 'var(--text-primary)' }}>{value}</p>
          {change !== undefined && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 600, color: changeColor }}>
              {changeArrow} {Math.abs(change)}% {changePeriod}
            </p>
          )}
        </div>
        {icon && (
          <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '6px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
