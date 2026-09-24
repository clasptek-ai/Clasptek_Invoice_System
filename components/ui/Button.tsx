/**
 * components/ui/Button.tsx — Phase 2 & 9G
 * Universal Button primitive backed by authoritative .cp-btn design tokens.
 */

import React from 'react';
import type { ButtonVariant, SizeVariant } from '@/types/common';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Extract<SizeVariant, 'sm' | 'md' | 'lg'>;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  style,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'primary'
      : variant === 'secondary'
      ? 'secondary'
      : variant === 'danger'
      ? 'danger'
      : variant === 'outline'
      ? 'secondary'
      : variant === 'ghost'
      ? 'secondary'
      : 'primary';

  const sizeClass = size === 'sm' ? 'sm' : '';

  return (
    <button
      className={`cp-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      style={{
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <span className="cp-spinner cp-spinner-sm" aria-hidden="true" />
      ) : leftIcon ? (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{leftIcon}</span>
      ) : null}
      {children}
      {!isLoading && rightIcon && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{rightIcon}</span>
      )}
    </button>
  );
}
