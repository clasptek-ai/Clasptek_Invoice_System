/**
 * components/ui/Input.tsx — Phase 2 & 9G
 * Universal Input primitive backed by authoritative .cp-field design tokens.
 */

import React, { forwardRef } from 'react';

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
      className = '',
      inputClassName = '',
      style,
      ...props
    },
    ref
  ) {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`cp-field ${error ? 'has-error' : ''} ${className}`.trim()} style={style}>
        {label && (
          <label htmlFor={inputId}>
            {label}
            {props.required && (
              <span style={{ color: 'var(--danger)', marginLeft: '4px' }} aria-hidden="true">*</span>
            )}
          </label>
        )}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {leftAddon && (
            <div style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={inputClassName}
            style={{
              width: '100%',
              paddingLeft: leftAddon ? '36px' : '12px',
              paddingRight: rightAddon ? '36px' : '12px',
            }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
          {rightAddon && (
            <div style={{ position: 'absolute', right: '12px', color: 'var(--text-muted)' }}>
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <span id={`${inputId}-error`} role="alert" className="cp-error">
            {error}
          </span>
        )}
        {!error && hint && (
          <span id={`${inputId}-hint`} style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
