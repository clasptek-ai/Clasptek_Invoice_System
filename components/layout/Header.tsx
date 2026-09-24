'use client';

/**
 * Header.tsx — Authoritative Clasptek Topbar
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Restores topbar height (64px), breadcrumb context, omnisearch presentation,
 * role pill tag, and mobile navigation toggle.
 */

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { findActiveNavItem } from '@/lib/config/navigation';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const { user, role, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  const activeNav = findActiveNavItem(pathname);
  const pageTitle = activeNav?.item.label ?? 'Dashboard';
  const sectionTitle = activeNav?.section.sectionTitle ?? 'Workspace';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Client-side search / filter integration or redirect to search
    // Omnisearch presentation is preserved without inventing unsupported backend calls
  };

  return (
    <header id="app-header" className="cp-topbar">
      {/* Topbar Left: Mobile Toggle + Breadcrumb + Omnisearch */}
      <div className="cp-topbar-left">
        <button
          className="cp-mobile-nav-btn"
          id="btnMobileNavToggle"
          onClick={onOpenMobileSidebar}
          title="Open Navigation Menu"
          aria-label="Open navigation menu"
        >
          &#x2630;
        </button>

        <div className="cp-breadcrumb">
          <span>{sectionTitle}</span> / <strong>{pageTitle}</strong>
        </div>

        <form onSubmit={handleSearchSubmit} className="cp-omni-search">
          <span className="cp-omni-icon">
            <svg
              className="cp-svg-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            className="cp-omni-input"
            id="globalSearchInput"
            placeholder="Search enquiries, students, invoices, receipts, programmes..."
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </div>

      {/* Topbar Right: Role Badge + User Info + Sign Out */}
      <div className="cp-topbar-right">
        <div className="cp-role-tag">
          <span
            className="cp-pill paid"
            style={{
              fontSize: '10.5px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontWeight: 700,
              letterSpacing: '0.4px',
            }}
          >
            {(role ?? 'STAFF').toUpperCase()}
          </span>
          <span
            style={{
              color: 'var(--text-secondary)',
              fontSize: '11.5px',
              fontWeight: 500,
              maxWidth: '160px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={user?.full_name ?? user?.email ?? 'User'}
          >
            {user?.full_name ?? user?.email ?? 'User'}
          </span>
        </div>

        <button
          id="header-signout-btn"
          onClick={handleSignOut}
          className="cp-signout-btn hidden sm:flex"
          title="Sign out"
          aria-label="Sign out"
        >
          <svg
            className="cp-svg-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
