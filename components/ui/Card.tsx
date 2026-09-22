import React from 'react';
import { cn } from '@/lib/utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Elevation level — controls shadow and background */
  elevation?: 0 | 1 | 2;
  /** Optional card header slot */
  header?: React.ReactNode;
  /** Optional card footer slot */
  footer?: React.ReactNode;
  /** Makes the card interactive (hover effect) */
  interactive?: boolean;
  onClick?: () => void;
}

const elevationStyles = {
  0: 'bg-white border border-[var(--border)] shadow-none',
  1: 'bg-white border border-[var(--border)] shadow-[var(--shadow-sm)]',
  2: 'bg-white border border-[var(--border)] shadow-[var(--shadow-md)]',
};

export function Card({
  children,
  className,
  elevation = 1,
  header,
  footer,
  interactive = false,
  onClick,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] overflow-hidden',
        elevationStyles[elevation],
        interactive && 'cursor-pointer transition-all duration-[var(--transition-base)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5',
        className
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {header && (
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
          {header}
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-1)]">
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
}

export function MetricCard({
  label,
  value,
  change,
  changeDirection = 'neutral',
  changePeriod = 'vs last month',
  icon,
  className,
}: MetricCardProps) {
  const changeColor =
    changeDirection === 'up'
      ? 'text-[var(--success)]'
      : changeDirection === 'down'
      ? 'text-[var(--danger)]'
      : 'text-[var(--text-tertiary)]';

  const changeArrow =
    changeDirection === 'up' ? '↑' : changeDirection === 'down' ? '↓' : '→';

  return (
    <Card className={cn('animate-fade-in', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-secondary)] truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
          {change !== undefined && (
            <p className={cn('mt-1 text-xs font-medium', changeColor)}>
              {changeArrow} {Math.abs(change)}% {changePeriod}
            </p>
          )}
        </div>
        {icon && (
          <div className="shrink-0 w-10 h-10 rounded-[var(--radius-md)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)]">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
