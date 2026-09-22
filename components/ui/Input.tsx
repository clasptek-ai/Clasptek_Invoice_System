import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      error,
      hint,
      leftAddon,
      rightAddon,
      id,
      className,
      inputClassName,
      ...props
    },
    ref
  ) {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
            {props.required && (
              <span className="ml-1 text-[var(--danger)]" aria-hidden="true">*</span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 text-[var(--text-tertiary)] pointer-events-none">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-10 rounded-[var(--radius-md)] border bg-white text-sm',
              'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
              'transition-all duration-[var(--transition-fast)] outline-none',
              'focus:ring-2 focus:ring-[var(--interactive)] focus:ring-offset-0 focus:border-[var(--interactive)]',
              'disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60',
              error
                ? 'border-[var(--danger)] focus:ring-[var(--danger)]'
                : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              leftAddon ? 'pl-10' : 'pl-3',
              rightAddon ? 'pr-10' : 'pr-3',
              inputClassName
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3 text-[var(--text-tertiary)]">
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-[var(--danger)] font-medium">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-xs text-[var(--text-tertiary)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
