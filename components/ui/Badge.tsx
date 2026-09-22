import React from 'react';
import { cn } from '@/lib/utils/cn';
import type { StatusVariant } from '@/types/common';

interface BadgeProps {
  children: React.ReactNode;
  variant?: StatusVariant | 'primary' | 'default';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<string, string> = {
  success: 'bg-[var(--success-light)] text-[var(--success-dark)] border border-[var(--success)] border-opacity-20',
  warning: 'bg-[var(--warning-light)] text-[var(--warning-dark)] border border-[var(--warning)] border-opacity-20',
  danger:  'bg-[var(--danger-light)] text-[var(--danger-dark)] border border-[var(--danger)] border-opacity-20',
  info:    'bg-[var(--info-light)] text-[var(--info-dark)] border border-[var(--info)] border-opacity-20',
  neutral: 'bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border)]',
  primary: 'bg-[var(--primary)] text-white',
  default: 'bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border)]',
};

const dotColors: Record<string, string> = {
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger:  'bg-[var(--danger)]',
  info:    'bg-[var(--info)]',
  neutral: 'bg-[var(--text-tertiary)]',
  primary: 'bg-white',
  default: 'bg-[var(--text-tertiary)]',
};

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-[var(--radius-full)]',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
