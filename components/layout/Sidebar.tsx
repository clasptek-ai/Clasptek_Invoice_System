'use client';

/**
 * Sidebar.tsx — Collapsible Navigation Rail
 * Phase 2: Next.js Foundation
 * Desktop: 260px full or 72px collapsed icon rail.
 * Mobile: full-width drawer overlay.
 */

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { NavSection } from './Navigation';
import { useAuth } from '@/lib/auth/context';
import { getNavigationForRole } from '@/lib/config/navigation';

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
  const { role } = useAuth();
  const sections = getNavigationForRole(role);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          'fixed top-0 left-0 h-full z-40 flex flex-col',
          'bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]',
          'transition-[width,transform] duration-[var(--transition-sidebar)]',
          // Desktop collapsed/expanded
          'lg:relative lg:translate-x-0',
          isCollapsed ? 'lg:w-[var(--sidebar-collapsed-width)]' : 'lg:w-[var(--sidebar-width)]',
          // Mobile: slide in/out
          isMobileOpen ? 'translate-x-0 w-[var(--sidebar-width)]' : '-translate-x-full w-[var(--sidebar-width)] lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className={cn(
          'flex items-center border-b border-[var(--sidebar-border)]',
          'h-[var(--header-height)] shrink-0 px-4',
          isCollapsed ? 'justify-center' : 'justify-between gap-3'
        )}>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Brand Mark */}
              <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm select-none">C</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">Clasptek</p>
                <p className="text-xs text-[var(--sidebar-text-muted)] truncate">Portal</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--accent)] flex items-center justify-center">
              <span className="text-white font-bold text-sm select-none">C</span>
            </div>
          )}

          {/* Collapse Toggle (desktop) */}
          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'hidden lg:flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)]',
              'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)]',
              'transition-colors duration-[var(--transition-fast)] shrink-0'
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isCollapsed
                ? <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>
                : <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>
              }
            </svg>
          </button>

          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden flex items-center justify-center w-7 h-7 rounded text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
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
        {!isCollapsed && (
          <div className="shrink-0 px-4 py-3 border-t border-[var(--sidebar-border)]">
            <p className="text-xs text-[var(--sidebar-text-muted)] text-center">
              Clasptek Portal v2
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
