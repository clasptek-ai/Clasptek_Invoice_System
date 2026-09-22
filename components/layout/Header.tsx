'use client';

/**
 * Header.tsx — Top Application Bar
 * Phase 2: Next.js Foundation
 * Displays: hamburger (mobile), tenant badge, active user info, role pill, sign-out.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/context';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

const ROLE_VARIANT_MAP: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  'Super Admin':     'danger',
  'Finance Manager': 'warning',
  'Finance Staff':   'info',
  'Finance Viewer':  'neutral',
  'Staff':           'success',
  'Facilitator':     'info',
  'Student':         'neutral',
};

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const { user, role, tenant, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? 'CL';

  return (
    <header
      id="app-header"
      className={cn(
        'flex items-center justify-between gap-4',
        'h-[var(--header-height)] px-4 lg:px-6',
        'bg-[var(--surface-0)] border-b border-[var(--border)]',
        'shrink-0 z-20'
      )}
    >
      {/* Left: Mobile menu toggle + tenant */}
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          id="sidebar-toggle"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className={cn(
            'lg:hidden flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)]',
            'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]',
            'transition-colors duration-[var(--transition-fast)]'
          )}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Tenant Badge */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--success)]" aria-hidden="true" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {tenant?.name ?? 'Clasptek Main'}
          </span>
        </div>
      </div>

      {/* Right: User info + sign out */}
      <div className="flex items-center gap-3">
        {/* Role badge */}
        {role && (
          <Badge
            variant={ROLE_VARIANT_MAP[role] ?? 'neutral'}
            dot
            className="hidden md:inline-flex"
          >
            {role}
          </Badge>
        )}

        {/* User avatar + name */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <span className="text-xs font-semibold text-white">{initials}</span>
          </div>
          <div className="hidden md:block min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[160px]">
              {user?.full_name ?? user?.email ?? 'User'}
            </p>
            {user?.email && (
              <p className="text-xs text-[var(--text-tertiary)] truncate max-w-[160px]">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Sign Out */}
        <Button
          id="header-signout-btn"
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          aria-label="Sign out"
          className="shrink-0 text-[var(--text-secondary)]"
          leftIcon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          }
        >
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
