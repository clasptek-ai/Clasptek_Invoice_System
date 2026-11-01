'use client';

/**
 * app/preview/layout.tsx — Dedicated Preview Shell Layout
 * Phase C3: Isolated Local UI Preview Recovery
 *
 * SAFETY INVARIANTS:
 * - Completely isolated from live Supabase auth and database queries.
 * - Displays a persistent, non-dismissible banner indicating local preview status.
 * - Zero network transport, zero socket creation, zero remote queries.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PreviewProvider } from '@/lib/preview/preview-context';

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navLinks = [
    { href: '/preview', label: 'Overview' },
    { href: '/preview/journey', label: 'Interactive Journey' },
    { href: '/preview/payments', label: 'Payments Ledger' },
    { href: '/preview/modals', label: 'Modal Sandbox' },
  ];

  return (
    <PreviewProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main, #F8FAFC)' }}>
        {/* Persistent Local Mock Preview Banner */}
        <div
          id="preview-security-banner"
          role="region"
          aria-label="Local Preview Banner"
          style={{
            backgroundColor: '#0F172A',
            color: '#F8FAFC',
            padding: '10px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '3px solid #2563EB',
            fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            position: 'sticky',
            top: 0,
            zIndex: 10000,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.6px',
              }}
            >
              LOCAL MOCK PREVIEW
            </span>
            <span style={{ fontWeight: 600 }}>
              NO DATABASE ACCESS &middot; ZERO NETWORK WRITES &middot; SYNTHETIC FIXTURES ONLY
            </span>
          </div>

          <nav aria-label="Preview Navigation" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    color: isActive ? '#60A5FA' : '#CBD5E1',
                    fontWeight: isActive ? 700 : 500,
                    textDecoration: 'none',
                    fontSize: '12.5px',
                    borderBottom: isActive ? '2px solid #60A5FA' : '2px solid transparent',
                    paddingBottom: '2px',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main Preview Container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </PreviewProvider>
  );
}
