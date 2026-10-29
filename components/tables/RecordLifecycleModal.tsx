/**
 * components/tables/RecordLifecycleModal.tsx
 * Universal safe lifecycle confirmation dialog for data tables.
 * Supports: Delete, Archive, Deactivate, Void, Cancel with referential dependency guards
 * and mandatory/optional audit reason tracking.
 *
 * Certified Clasptek Improvements:
 * - Keyboard accessibility: Escape key listener dismisses dialog when not loading.
 * - Semantic dialog attributes: role="dialog", aria-modal="true", aria-labelledby, aria-describedby.
 * - Synchronous ref lock (isExecutingRef) preventing duplicate / concurrent submissions.
 * - Accessible SVG icons conforming to Clasptek design standards (replaces raw emoji glyphs).
 * - Phase C6G Accessible Focus Management:
 *   - Initial focus directed safely to non-destructive escape hatch (Cancel) or required reason input.
 *   - Focus restoration to invoking element on close / unmount.
 *   - Tab & Shift+Tab focus containment (focus trap) preventing focus escape to background.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';

export type LifecycleActionType = 'DELETE' | 'ARCHIVE' | 'DEACTIVATE' | 'VOID' | 'CANCEL';

export interface RecordDependencyItem {
  label: string;
  count: number;
}

export interface RecordLifecycleModalProps {
  isOpen: boolean;
  actionType: LifecycleActionType;
  entityName: string;
  recordIdentifier?: string;
  recordCount?: number;
  dependencies?: RecordDependencyItem[];
  blockedMessage?: string | null;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function RecordLifecycleModal({
  isOpen,
  actionType,
  entityName,
  recordIdentifier,
  recordCount = 1,
  dependencies = [],
  blockedMessage,
  requireReason = false,
  reasonPlaceholder = 'Please enter justification / audit remarks...',
  isLoading = false,
  onClose,
  onConfirm,
}: RecordLifecycleModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isExecutingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      isExecutingRef.current = false;
    }
  }, [isOpen]);

  // Focus lifecycle: capture activeElement on open, set initial focus, restore on close
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;

      const timer = setTimeout(() => {
        if (modalRef.current) {
          const reasonInput = modalRef.current.querySelector<HTMLElement>('#record-lifecycle-reason');
          const cancelButton = modalRef.current.querySelector<HTMLElement>('#record-lifecycle-cancel-btn');
          const focusable = Array.from(
            modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

          const target =
            requireReason && reasonInput && !reasonInput.hasAttribute('disabled')
              ? reasonInput
              : cancelButton && !cancelButton.hasAttribute('disabled')
              ? cancelButton
              : focusable[0];

          target?.focus();
        }
      }, 30);

      return () => {
        clearTimeout(timer);
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          try {
            previousActiveElementRef.current.focus();
          } catch {
            // Safe fallback if invoking element was unmounted
          }
        }
      };
    }
  }, [isOpen, requireReason]);

  // Handle Escape key closure consistently with Clasptek modal conventions and Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key dismissal
      if (e.key === 'Escape' && !isLoading && !isExecutingRef.current) {
        onClose();
        return;
      }

      // Tab key focus containment
      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const hasDependencies = dependencies.some((d) => d.count > 0);
  const isBlocked = Boolean(blockedMessage) || (actionType === 'DELETE' && hasDependencies);

  const getActionConfig = () => {
    switch (actionType) {
      case 'DELETE':
        return {
          title: recordCount > 1 ? `Delete ${recordCount} ${entityName}s` : `Delete ${entityName}`,
          badgeColor: '#DC2626',
          badgeBg: '#FEE2E2',
          badgeText: 'PERMANENT DELETION',
          consequence: 'This action will permanently delete the record(s) from the portal.',
          isReversible: false,
          confirmLabel: recordCount > 1 ? `Delete ${recordCount} Records` : 'Delete Record',
          confirmBtnClass: 'cp-btn sm cp-btn-danger',
          confirmBtnStyle: { backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none' },
        };
      case 'VOID':
        return {
          title: recordCount > 1 ? `Void ${recordCount} ${entityName}s` : `Void ${entityName}`,
          badgeColor: '#B45309',
          badgeBg: '#FEF3C7',
          badgeText: 'FINANCIAL VOID',
          consequence: 'This will mark the record as VOID. The record number and audit trail will remain intact.',
          isReversible: false,
          confirmLabel: recordCount > 1 ? `Void ${recordCount} Records` : 'Void Record',
          confirmBtnClass: 'cp-btn sm',
          confirmBtnStyle: { backgroundColor: '#D97706', color: '#FFFFFF', border: 'none' },
        };
      case 'DEACTIVATE':
        return {
          title: recordCount > 1 ? `Deactivate ${recordCount} ${entityName}s` : `Deactivate ${entityName}`,
          badgeColor: '#475569',
          badgeBg: '#F1F5F9',
          badgeText: 'ACCOUNT DEACTIVATION',
          consequence: 'Access will be immediately suspended. Historical audit and transaction data will be preserved.',
          isReversible: true,
          confirmLabel: 'Confirm Deactivation',
          confirmBtnClass: 'cp-btn sm secondary',
          confirmBtnStyle: { backgroundColor: '#475569', color: '#FFFFFF', border: 'none' },
        };
      case 'CANCEL':
        return {
          title: recordCount > 1 ? `Cancel ${recordCount} ${entityName}s` : `Cancel ${entityName}`,
          badgeColor: '#DC2626',
          badgeBg: '#FEE2E2',
          badgeText: 'CANCELLATION',
          consequence: 'This will transition the record status to CANCELLED.',
          isReversible: true,
          confirmLabel: 'Confirm Cancellation',
          confirmBtnClass: 'cp-btn sm',
          confirmBtnStyle: { backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none' },
        };
      case 'ARCHIVE':
      default:
        return {
          title: recordCount > 1 ? `Archive ${recordCount} ${entityName}s` : `Archive ${entityName}`,
          badgeColor: '#2563EB',
          badgeBg: '#EFF6FF',
          badgeText: 'ARCHIVE',
          consequence: 'This will archive the record(s) and remove them from active views.',
          isReversible: true,
          confirmLabel: 'Confirm Archive',
          confirmBtnClass: 'cp-btn sm',
          confirmBtnStyle: { backgroundColor: '#2563EB', color: '#FFFFFF', border: 'none' },
        };
    }
  };

  const config = getActionConfig();

  const handleExecute = async () => {
    if (isBlocked || isLoading || isExecutingRef.current) return;
    if (requireReason && !reason.trim()) {
      setError('A reason or justification is required for this action.');
      return;
    }
    setError(null);
    isExecutingRef.current = true;
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during execution.');
    } finally {
      isExecutingRef.current = false;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-lifecycle-title"
      aria-describedby="record-lifecycle-consequence"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading && !isExecutingRef.current) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="cp-card"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface-0, #FFFFFF)',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-1, #F8FAFC)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                color: config.badgeColor,
                backgroundColor: config.badgeBg,
                letterSpacing: '0.04em',
              }}
            >
              {config.badgeText}
            </span>
            <h3
              id="record-lifecycle-title"
              style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--primary, #0F172A)' }}
            >
              {config.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted, #94A3B8)',
              padding: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* Target Identifier */}
          {recordIdentifier && (
            <div
              style={{
                fontSize: '13px',
                padding: '10px 14px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                color: '#334155',
              }}
            >
              Target Record:{' '}
              <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{recordIdentifier}</strong>
            </div>
          )}

          {/* Consequence Statement */}
          <div
            id="record-lifecycle-consequence"
            style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}
          >
            <div>{config.consequence}</div>
            <div
              style={{
                marginTop: '6px',
                fontWeight: 600,
                color: config.isReversible ? '#059669' : '#DC2626',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {config.isReversible ? (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>This action is reversible.</span>
                </>
              ) : (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>This action CANNOT be undone.</span>
                </>
              )}
            </div>
          </div>

          {/* Blocked Dependencies Alert */}
          {isBlocked && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#991B1B',
                  fontWeight: 700,
                  fontSize: '13.5px',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                <span>Action Blocked: Referential Dependencies Exist</span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#7F1D1D', marginTop: '6px' }}>
                {blockedMessage ||
                  `This ${entityName} cannot be deleted because dependent operational records exist in the database:`}
              </div>
              {hasDependencies && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  {dependencies
                    .filter((d) => d.count > 0)
                    .map((d, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: '#FEE2E2',
                          color: '#991B1B',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          border: '1px solid #F87171',
                        }}
                      >
                        {d.count} {d.label}
                      </span>
                    ))}
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '10px', fontStyle: 'italic' }}>
                Recommendation: Use Archive or Deactivate instead of hard delete to preserve historical integrity.
              </div>
            </div>
          )}

          {/* Audit Reason Field */}
          {!isBlocked && (
            <div>
              <label
                htmlFor="record-lifecycle-reason"
                style={{
                  display: 'block',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #475569)',
                  marginBottom: '6px',
                }}
              >
                Audit Remarks {requireReason ? <span style={{ color: '#DC2626' }}>*</span> : '(Optional)'}
              </label>
              <textarea
                id="record-lifecycle-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                disabled={isLoading}
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  borderRadius: '6px',
                  border: '1px solid var(--border, #CBD5E1)',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #F87171',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12.5px',
                color: '#B91C1C',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border, #E2E8F0)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'var(--surface-1, #F8FAFC)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            id="record-lifecycle-cancel-btn"
            onClick={onClose}
            disabled={isLoading}
            className="cp-btn sm secondary"
            style={{ padding: '6px 14px', fontSize: '13px' }}
          >
            Cancel
          </button>
          {!isBlocked && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={isLoading || (requireReason && !reason.trim())}
              className={config.confirmBtnClass}
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                ...config.confirmBtnStyle,
              }}
            >
              {isLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg
                    className="cp-spinner"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span>Processing...</span>
                </span>
              ) : (
                config.confirmLabel
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
