/**
 * components/students/StudentDeleteModal.tsx
 * Safe Deletion & Dependency Verification Dialog for Student Directory.
 * Enforces pre-deletion validation, transparent dependency breakdowns,
 * and safe confirmation before any destructive operation.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { StudentDependencyReport } from '@/lib/students/mutations';

interface StudentDeleteModalProps {
  isOpen: boolean;
  studentIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function StudentDeleteModal({
  isOpen,
  studentIds,
  onClose,
  onSuccess,
}: StudentDeleteModalProps) {
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reports, setReports] = useState<StudentDependencyReport[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const fetchDependencies = useCallback(async () => {
    if (studentIds.length === 0) return;
    setIsLoadingCheck(true);
    setCheckError(null);
    setResultMessage(null);

    try {
      const res = await fetch('/api/students/check-dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to inspect record dependencies.');
      }

      const data = await res.json();
      setReports(data.reports || []);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoadingCheck(false);
    }
  }, [studentIds]);

  useEffect(() => {
    if (isOpen && studentIds.length > 0) {
      fetchDependencies();
    } else {
      setReports([]);
      setDeletionReason('');
      setCheckError(null);
      setResultMessage(null);
    }
  }, [isOpen, studentIds, fetchDependencies]);

  if (!isOpen) return null;

  const eligible = reports.filter((r) => r.canDelete);
  const blocked = reports.filter((r) => !r.canDelete);

  const handleExecuteDelete = async () => {
    if (eligible.length === 0) return;
    setIsDeleting(true);
    setCheckError(null);

    try {
      const res = await fetch('/api/students/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: eligible.map((r) => r.studentId),
          reason: deletionReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute deletion.');
      }

      setResultMessage(data.message || `${data.deletedCount} record(s) deleted.`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Error executing deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="cp-modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        className="cp-modal-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🗑️</span>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
              Confirm Record Deletion
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#64748B',
              padding: '4px',
            }}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: '1 1 auto' }}>
          {isLoadingCheck ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B' }}>
              <div className="cp-spinner cp-spinner-md" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                Verifying financial & academic dependencies...
              </p>
            </div>
          ) : resultMessage ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                fontWeight: 600,
                textAlign: 'center',
                fontSize: '14px',
              }}
            >
              ✓ {resultMessage}
            </div>
          ) : checkError ? (
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '13px',
              }}
            >
              ⚠️ {checkError}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary Stats */}
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>SELECTED</span>
                  <strong style={{ fontSize: '15px', color: '#0F172A' }}>{studentIds.length}</strong>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#16A34A', fontSize: '11px', display: 'block' }}>ELIGIBLE</span>
                  <strong style={{ fontSize: '15px', color: '#16A34A' }}>{eligible.length}</strong>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#DC2626', fontSize: '11px', display: 'block' }}>PROTECTED</span>
                  <strong style={{ fontSize: '15px', color: '#DC2626' }}>{blocked.length}</strong>
                </div>
              </div>

              {/* Blocked / Protected List */}
              {blocked.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ color: '#DC2626', fontWeight: 700, fontSize: '13px' }}>
                      🛡️ Protected Records ({blocked.length})
                    </span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#7F1D1D' }}>
                    The following records cannot be deleted because dependent financial or academic records exist.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                    {blocked.map((b) => (
                      <div
                        key={b.studentId}
                        style={{
                          backgroundColor: '#FFFFFF',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #FECACA',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#991B1B' }}>
                          {b.studentName} ({b.studentNumber})
                        </div>
                        <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>
                          Enrolments: {b.dependencies.enrolments} | Invoices: {b.dependencies.invoices} | Payments: {b.dependencies.payments} | Certs: {b.dependencies.certificates}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Eligible List */}
              {eligible.length > 0 ? (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                    Eligible for Deletion ({eligible.length}):
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748B' }}>
                    These records have zero financial history or enrolments and will be permanently deleted.
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '20px',
                      fontSize: '12px',
                      color: '#334155',
                      maxHeight: '120px',
                      overflowY: 'auto',
                    }}
                  >
                    {eligible.map((e) => (
                      <li key={e.studentId} style={{ marginBottom: '4px' }}>
                        <strong>{e.studentName}</strong> ({e.studentNumber})
                      </li>
                    ))}
                  </ul>

                  <div style={{ marginTop: '14px' }}>
                    <label
                      htmlFor="deleteReasonInput"
                      style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}
                    >
                      Reason for Deletion (recorded in audit log):
                    </label>
                    <input
                      id="deleteReasonInput"
                      type="text"
                      className="cp-input"
                      placeholder="e.g. Duplicate test entry or candidate withdrew before enrolment"
                      value={deletionReason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      style={{ width: '100%', fontSize: '12px' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#64748B', fontSize: '13px' }}>
                  No eligible records available to delete.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            className="cp-btn cp-btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
            style={{ fontSize: '13px', padding: '8px 14px' }}
          >
            {resultMessage ? 'Close' : 'Cancel'}
          </button>

          {!resultMessage && eligible.length > 0 && (
            <button
              type="button"
              className="cp-btn cp-btn-danger"
              onClick={handleExecuteDelete}
              disabled={isDeleting || isLoadingCheck}
              style={{
                fontSize: '13px',
                padding: '8px 16px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isDeleting
                ? 'Deleting...'
                : `Delete ${eligible.length} Eligible Record${eligible.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
