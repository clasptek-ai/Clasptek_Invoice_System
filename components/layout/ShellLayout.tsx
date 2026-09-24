'use client';

/**
 * ShellLayout.tsx — Persistent Application Shell Wrapper
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Automatically applies AppLayout to all authenticated routes while preserving
 * standalone rendering for /login and /apply public forms.
 */

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppLayout } from './AppLayout';

interface ShellLayoutProps {
  children: React.ReactNode;
}

export function ShellLayout({ children }: ShellLayoutProps) {
  const pathname = usePathname();

  // Standalone public routes that do not render inside the authenticated application shell:
  // - /login (standalone corporate authentication screen)
  // - /apply, /apply/* (standalone public candidate intake form)
  const isStandalone =
    pathname === '/login' ||
    pathname?.startsWith('/apply') ||
    pathname === '/_not-found';

  if (isStandalone) {
    return <>{children}</>;
  }

  return <AppLayout>{children}</AppLayout>;
}
