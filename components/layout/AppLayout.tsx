'use client';

/**
 * AppLayout.tsx — Shared Application Shell
 * Phase 2: Next.js Foundation
 * Composes: Sidebar + Header + main content area with independent vertical scroll.
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
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggleCollapse={() => setIsCollapsed((c) => !c)}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Content Area */}
      <div className="app-content">
        {/* Top Header */}
        <Header onOpenMobileSidebar={() => setIsMobileOpen(true)} />

        {/* Page Content */}
        <main id="main-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
