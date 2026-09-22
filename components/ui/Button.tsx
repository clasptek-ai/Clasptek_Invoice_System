import React from 'react';
import { cn } from '@/lib/utils/cn';
import type { ButtonVariant, SizeVariant } from '@/types/common';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Extract<SizeVariant, 'sm' | 'md' | 'lg'>;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--interactive)] text-white',
    'hover:bg-[var(--interactive-dark)] active:scale-[0.98]',
    'focus-visible:ring-2 focus-visible:ring-[var(--interactive)] focus-visible:ring-offset-2',
  ].join(' '),
  secondary: [
    'bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)]',
    'hover:bg-[var(--surface-3)] active:scale-[0.98]',
  ].join(' '),
  outline: [
    'bg-transparent text-[var(--interactive)] border border-[var(--interactive)]',
    'hover:bg-[var(--interactive)] hover:text-white active:scale-[0.98]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--text-secondary)]',
    'hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.98]',
  ].join(' '),
  danger: [
    'bg-[var(--danger)] text-white',
    'hover:bg-[var(--danger-dark)] active:scale-[0.98]',
    'focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2',
  ].join(' '),
};

const sizeStyles: Record<Extract<SizeVariant, 'sm' | 'md' | 'lg'>, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]',
        'transition-all duration-[var(--transition-base)] cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'select-none outline-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {!isLoading && rightIcon && (
        <span className="shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}
