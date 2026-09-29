'use client';

/**
 * AppLayout.tsx — Authoritative Clasptek Application Shell
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Composes: Sidebar + Topbar + independent scrolling main area (.cp-main-area).
 */

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="cp-layout">
      {/* Mobile Sidebar Backdrop */}
      <div
        id="sidebarBackdrop"
        className={`cp-sidebar-backdrop ${isMobileOpen ? 'active' : ''}`}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Left Collapsible Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggleCollapse={() => setIsCollapsed((c) => !c)}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Area with independent scrolling */}
      <div className="cp-main-area">
        <Header onOpenMobileSidebar={() => setIsMobileOpen(true)} />
        <main id="main-content" className="cp-content-view" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
