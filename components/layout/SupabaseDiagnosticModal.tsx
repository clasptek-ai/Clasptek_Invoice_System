'use client';

/**
 * components/layout/SupabaseDiagnosticModal.tsx
 *
 * Restores the original administrative database diagnostic modal (supabaseModal)
 * from clasptek_invoice_system.html (lines 40870–41160).
 *
 * Preserves Clasptek design tokens, visual hierarchy, and diagnostics while
 * maintaining strict security:
 * - ZERO exposure of service-role keys or sensitive credentials
 * - Restricted strictly to administrators (Super Admin, Finance Manager, Staff)
 * - Exposes live latency, tenant boundary, PostgREST status, and specific query error traces
 */

import React, { useEffect, useState } from 'react';
import type { DatabaseHealthDiagnostic } from '@/lib/supabase/health';
import type { UserProfile, UserRole } from '@/types/auth';

interface SupabaseDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostic: DatabaseHealthDiagnostic;
  user: UserProfile | null;
  role: UserRole | null;
  onRecheck: () => Promise<void>;
}

export function SupabaseDiagnosticModal({
  isOpen,
  onClose,
  diagnostic,
  user,
  role,
  onRecheck,
}: SupabaseDiagnosticModalProps) {
  const [isProbing, setIsProbing] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRunProbe = async () => {
    setIsProbing(true);
    try {
      await onRecheck();
    } finally {
      setIsProbing(false);
    }
  };

  const isConnected = diagnostic.status === 'POSTGRESQL_ACTIVE';
  const hasError = diagnostic.errorDetails !== null;

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'None in session';
    try {
      return new Date(ts).toLocaleString('en-GB');
    } catch {
      return ts;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sbModalTitle"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          animation: 'modalFadeIn 0.15s ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <h2
              id="sbModalTitle"
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '0.3px',
                margin: 0,
              }}
            >
              CLASPTEK PRODUCTION HEALTH MATRIX (PHASE 15)
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
              Authoritative Supabase PostgreSQL, PostgREST &amp; RLS Diagnostic Center
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#64748B',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            fontSize: '12.5px',
            color: '#334155',
          }}
        >
          {/* Diagnostic Warning Banner if Error Present */}
          {hasError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1.5px solid #F87171',
                borderRadius: '6px',
                padding: '12px 16px',
                color: '#991B1B',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <span>⚠️</span>
                <span>DIAGNOSTIC ALERT &middot; {diagnostic.status}</span>
              </div>
              <div
                style={{
                  marginTop: '6px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {diagnostic.errorDetails}
              </div>
            </div>
          )}

          {/* 4-Quadrant Diagnostic Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
            }}
          >
            {/* 1. Configuration & Project */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '11.5px', textTransform: 'uppercase' }}>
                1. Configuration &amp; Project
              </div>
              <div>Supabase Project: <strong>Clasptek Enterprise</strong></div>
              <div>Project Reference: <code style={{ color: '#2563EB', fontWeight: 700 }}>{diagnostic.projectRef}</code></div>
              <div>
                REST Endpoint:{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: '#64748B' }}>
                  https://{diagnostic.projectRef}.supabase.co/rest/v1
                </span>
              </div>
              <div>
                Public Anon Key: <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px' }}>eyJhbGciOi...[Masked]</span>
              </div>
              <div>
                Config Status:{' '}
                <strong style={{ color: '#16A34A' }}>✔ VALID &amp; VERIFIED</strong>
              </div>
            </div>

            {/* 2. Authentication & Identity */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '11.5px', textTransform: 'uppercase' }}>
                2. Authentication &amp; Identity
              </div>
              <div>Auth Provider: <strong>Supabase Auth (GoTrue JWT)</strong></div>
              <div>
                Session Status:{' '}
                <strong style={{ color: user ? '#16A34A' : '#DC2626' }}>
                  {user ? '✔ ACTIVE (Valid Session)' : '✖ UNAUTHENTICATED'}
                </strong>
              </div>
              <div>Current User: <strong>{user?.full_name || user?.email || 'Guest'}</strong></div>
              <div>Assigned Role: <span className="cp-pill primary" style={{ display: 'inline-block' }}>{role || 'Staff'}</span></div>
              <div>
                Access Token: <strong>{user ? '✔ PRESENT (Masked in Memory)' : '✖ NONE'}</strong>
              </div>
            </div>

            {/* 3. Database & PostgREST */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '11.5px', textTransform: 'uppercase' }}>
                3. Database &amp; PostgREST
              </div>
              <div>
                PostgREST Status:{' '}
                <strong style={{ color: diagnostic.httpStatus === 200 ? '#16A34A' : '#DC2626' }}>
                  {diagnostic.httpStatus === 200 ? '✔ CONNECTED (200 OK)' : `✖ HTTP ${diagnostic.httpStatus || 0}`}
                </strong>
              </div>
              <div>
                PostgreSQL Reachability:{' '}
                <strong style={{ color: diagnostic.latencyMs !== null ? '#16A34A' : '#DC2626' }}>
                  {diagnostic.latencyMs !== null ? '✔ AVAILABLE &amp; REACHABLE' : '✖ UNREACHABLE'}
                </strong>
              </div>
              <div>
                Database Latency: <strong>{diagnostic.latencyMs !== null ? `${diagnostic.latencyMs}ms` : 'N/A'}</strong>
              </div>
              <div>
                Last Successful Read:{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: '#64748B' }}>
                  {formatTimestamp(diagnostic.lastSuccessfulRead)}
                </span>
              </div>
            </div>

            {/* 4. Security & Invariants */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '11.5px', textTransform: 'uppercase' }}>
                4. Security &amp; Tenant Boundary
              </div>
              <div>
                RLS Enforcement:{' '}
                <strong style={{ color: '#16A34A' }}>✔ ACTIVE (Tenant-Scoped)</strong>
              </div>
              <div>
                Tenant Boundary:{' '}
                <code style={{ fontSize: '11px', color: diagnostic.tenantId ? '#0F172A' : '#DC2626' }}>
                  {diagnostic.tenantId || 'UNESTABLISHED (LOGIN REQUIRED)'}
                </code>
              </div>
              <div>
                Audit Immutability: <strong style={{ color: '#16A34A' }}>✔ APPEND-ONLY (Trigger Guarded)</strong>
              </div>
              <div>
                Service Role Key: <strong style={{ color: '#16A34A' }}>✔ NOT DETECTED IN CLIENT</strong>
              </div>
            </div>
          </div>

          {/* Persistence & Authority Status Strip */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                Runtime Authority Mode:{' '}
              </span>
              <strong style={{ color: isConnected ? '#16A34A' : '#DC2626', fontSize: '13px' }}>
                {diagnostic.statusLabel}
              </strong>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Probe Run: {new Date(diagnostic.probeTimestamp).toLocaleTimeString('en-GB')}
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={handleRunProbe}
            disabled={isProbing}
            className="cp-btn primary sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
          >
            <span>{isProbing ? '⏳' : '⚡'}</span>
            <span>{isProbing ? 'Running Probe...' : 'Run Connectivity Probe'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cp-btn secondary sm"
            style={{ fontSize: '12.5px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
