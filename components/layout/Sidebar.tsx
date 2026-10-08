'use client';

/**
 * Sidebar.tsx — Authoritative Clasptek White Sidebar
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Restores 260px white sidebar (#FFFFFF), genuine clasptek_logo.png,
 * PostgreSQL active connection indicator, user profile card, and 7-section navigation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { NavSection, NavSvgIcon } from './Navigation';
import { useAuth } from '@/lib/auth/context';
import { getNavigationForRole } from '@/lib/config/navigation';
import {
  runDatabaseHealthProbe,
  INITIAL_DIAGNOSTIC_STATE,
  type DatabaseHealthDiagnostic,
} from '@/lib/supabase/health';
import { SupabaseDiagnosticModal } from './SupabaseDiagnosticModal';

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

export function Sidebar({
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const { user, role, signOut, isAuthenticated } = useAuth();
  const router = useRouter();
  const sections = getNavigationForRole(role);

  const [diagnostic, setDiagnostic] = useState<DatabaseHealthDiagnostic>(INITIAL_DIAGNOSTIC_STATE);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Genuine asynchronous database health check
  const executeProbe = useCallback(async () => {
    const res = await runDatabaseHealthProbe();
    setDiagnostic(res);
  }, []);

  useEffect(() => {
    executeProbe();
  }, [executeProbe, isAuthenticated]);

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? 'CL';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  // Employees and facilitators must NOT gain access to administrator-only diagnostics
  const isRestrictedRole = role === 'Facilitator' || role === 'Student';

  const handlePillClick = () => {
    if (isRestrictedRole) return;
    setIsModalOpen(true);
  };

  return (
    <>
      <aside
        id="appSidebar"
        aria-label="Main navigation"
        className={cn(
          'cp-sidebar',
          isCollapsed && 'collapsed',
          isMobileOpen && 'mobile-open'
        )}
    >
      {/* Brand Header */}
      <div className="cp-sidebar-header">
        <Link
          href="/dashboard"
          className="cp-sidebar-brand"
          id="brandLogoLink"
          onClick={onCloseMobile}
        >
          {isCollapsed ? (
            <Image
              src="/assets/clasptek_brand_mark.png"
              alt="Clasptek Logo"
              width={2610}
              height={905}
              className="cp-sidebar-logo"
              style={{ height: '30px', width: 'auto' }}
              priority
            />
          ) : (
            <Image
              src="/assets/clasptek_logo.png"
              alt="Clasptek Logo"
              width={977}
              height={255}
              className="cp-sidebar-logo"
              style={{ height: '34px', width: 'auto' }}
              priority
            />
          )}
        </Link>

        {/* Collapse Toggle Button (Desktop & Mobile) */}
        <button
          className="cp-collapse-btn"
          id="btnToggleSidebar"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <NavSvgIcon name="collapse" size={16} />
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="cp-sidebar-nav">
        {sections.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            isCollapsed={isCollapsed}
            onItemClick={onCloseMobile}
          />
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="cp-sidebar-footer">
        {/* Connection Status Pill */}
        <div
          className="cp-conn-pill"
          id="sidebarSupabaseStatus"
          onClick={handlePillClick}
          title={
            isRestrictedRole
              ? 'PostgreSQL Database Authority Status'
              : 'Click to launch Supabase Diagnostic Center'
          }
          style={{
            cursor: isRestrictedRole ? 'default' : 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className={cn(
                'cp-conn-dot',
                diagnostic.dotClass
              )}
            />
            {!isCollapsed && (
              <span className="cp-conn-text" style={{ fontSize: '11px', fontWeight: 600 }}>
                {diagnostic.statusLabel}
              </span>
            )}
          </div>
          {!isCollapsed && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                opacity: 0.8,
              }}
            >
              v15.0.0
            </span>
          )}
        </div>

        {/* User Profile Card */}
        <div className="cp-user-card">
          <div className="cp-user-info">
            <div className="cp-user-avatar" title={user?.full_name ?? user?.email ?? 'User'}>
              {initials}
            </div>
            {!isCollapsed && (
              <div className="cp-user-info-text">
                <span className="cp-user-name" title={user?.full_name ?? user?.email ?? 'User'}>
                  {user?.full_name ?? user?.email ?? 'User'}
                </span>
                <span className="cp-user-role">{role ?? 'Staff'}</span>
              </div>
            )}
          </div>
          <button
            className="cp-signout-btn"
            id="btnSidebarSignOut"
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <NavSvgIcon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>

    {/* Supabase Diagnostic Center Modal (Phase 3 restoration) */}
    {!isRestrictedRole && (
      <SupabaseDiagnosticModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        diagnostic={diagnostic}
        user={user}
        role={role}
        onRecheck={executeProbe}
      />
    )}
  </>
);
}
