'use client';

/**
 * AppLayout.tsx — Authoritative Clasptek Application Shell
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Composes: Sidebar + Topbar + independent scrolling main area (.cp-main-area).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();

  // Mobile / Tablet (< 1024px) defaults immediately to collapsed state.
  // Desktop (>= 1024px) defaults to expanded state.
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Responsive initialization and window resize listener
  useEffect(() => {
    const updateResponsiveState = () => {
      const isMobileOrTablet = window.innerWidth < 1024;
      setIsCollapsed(isMobileOrTablet);
      if (!isMobileOrTablet) {
        setIsMobileOpen(false);
      }
    };

    updateResponsiveState();

    const mql = window.matchMedia('(max-width: 1023px)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsCollapsed(e.matches);
      if (!e.matches) {
        setIsMobileOpen(false);
      }
    };

    mql.addEventListener('change', handleMediaChange);
    return () => mql.removeEventListener('change', handleMediaChange);
  }, []);

  // When navigating between pages on mobile, preserve collapsed icon rail and close overlay drawer
  useEffect(() => {
    setIsMobileOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsCollapsed(true);
    }
  }, [pathname]);

  const handleToggleCollapse = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      // On mobile screens (< 768px), expanding the sidebar shows the drawer overlay with backdrop
      if (isMobileOpen) {
        setIsMobileOpen(false);
        setIsCollapsed(true);
      } else {
        setIsMobileOpen(true);
        setIsCollapsed(false);
      }
    } else {
      setIsCollapsed((c) => !c);
    }
  }, [isMobileOpen]);

  const handleCloseMobile = useCallback(() => {
    setIsMobileOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsCollapsed(true);
    }
  }, []);

  const handleOpenMobileSidebar = useCallback(() => {
    setIsMobileOpen(true);
    setIsCollapsed(false);
  }, []);

  return (
    <div className="cp-layout">
      {/* Mobile Sidebar Backdrop */}
      <div
        id="sidebarBackdrop"
        className={`cp-sidebar-backdrop ${isMobileOpen ? 'active' : ''}`}
        onClick={handleCloseMobile}
        aria-hidden="true"
      />

      {/* Left Collapsible Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggleCollapse={handleToggleCollapse}
        onCloseMobile={handleCloseMobile}
      />

      {/* Main Area with independent scrolling */}
      <div className="cp-main-area">
        <Header onOpenMobileSidebar={handleOpenMobileSidebar} />
        <main id="main-content" className="cp-content-view" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
