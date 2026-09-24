'use client';

/**
 * DashboardClient.tsx — Dashboard Client Component
 * Phase 2: Next.js Foundation
 * Renders the AppLayout shell with KPI metric cards and migration status panel.
 */

import React from 'react';
import { Card, MetricCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils/cn';
import { StaffFacilitatorDashboard } from '@/components/dashboard/StaffFacilitatorDashboard';

// ─── Migration Phase Status ───────────────────────────────────────────────────

const MIGRATION_PHASES = [
  {
    id: 'phase-2',
    phase: 'Phase 2',
    title: 'Next.js Foundation',
    description: 'Core infrastructure: authentication, layout, design system',
    status: 'active' as const,
    href: null,
  },
  {
    id: 'phase-3',
    phase: 'Phase 3',
    title: 'Admissions & CRM',
    description: 'Enquiries, applications, public apply form',
    status: 'pending' as const,
    href: null,
  },
  {
    id: 'phase-4',
    phase: 'Phase 4',
    title: 'Students & Academics',
    description: 'Students, enrolments, programmes, cohorts',
    status: 'pending' as const,
    href: null,
  },
  {
    id: 'phase-5',
    phase: 'Phase 5',
    title: 'Training & Meetings',
    description: 'Attendance, facilitator reports, meetings',
    status: 'pending' as const,
    href: null,
  },
  {
    id: 'phase-6',
    phase: 'Phase 6',
    title: 'Financial Management',
    description: 'Invoices, payments, receipts, expenses, payroll, budgets',
    status: 'pending' as const,
    href: null,
  },
  {
    id: 'phase-7',
    phase: 'Phase 7',
    title: 'Certificates & Governance',
    description: 'Certificates, financial controls, audit log',
    status: 'pending' as const,
    href: null,
  },
  {
    id: 'phase-8',
    phase: 'Phase 8',
    title: 'Organisation Settings',
    description: 'Personnel management, system configuration',
    status: 'pending' as const,
    href: null,
  },
];

const STATUS_CONFIG = {
  active: { label: 'Active', variant: 'success' as const, dot: true },
  pending: { label: 'Pending', variant: 'neutral' as const, dot: false },
  complete: { label: 'Complete', variant: 'info' as const, dot: false },
};

// ─── Dashboard Client Component ───────────────────────────────────────────────

export function DashboardClient() {
  const { user, role, tenant } = useAuth();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const displayName = user?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  if (role === 'Facilitator' || role === 'Staff') {
    return (
      <div className="max-w-[var(--content-max-width)] mx-auto animate-fade-in">
        <StaffFacilitatorDashboard
          userName={user?.full_name || displayName}
          role={role}
          userEmail={user?.email || ''}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[var(--content-max-width)] mx-auto space-y-6 animate-fade-in">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {greeting}, {displayName}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Welcome to the Clasptek Portal.{' '}
              <span className="font-medium text-[var(--text-primary)]">
                {tenant?.name ?? 'Clasptek Main'}
              </span>
            </p>
          </div>
          <Badge variant="success" dot size="md">
            System Operational
          </Badge>
        </div>

        {/* Phase 1 Four-Way Financial KPI Separation */}
        <section aria-label="Key Performance Indicators">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Financial Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Revenue"
              value="₦0.00"
              change={0}
              changeDirection="neutral"
              changePeriod="this period"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              }
            />
            <MetricCard
              label="Total Expenses"
              value="₦0.00"
              change={0}
              changeDirection="neutral"
              changePeriod="this period"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
                </svg>
              }
            />
            <MetricCard
              label="Outstanding Invoices"
              value="₦0.00"
              change={0}
              changeDirection="neutral"
              changePeriod="this period"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              }
            />
            <MetricCard
              label="Payroll Liability"
              value="₦0.00"
              change={0}
              changeDirection="neutral"
              changePeriod="this period"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                </svg>
              }
            />
          </div>
        </section>

        {/* Migration Status */}
        <section aria-label="Migration Progress">
          <Card
            header={
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Next.js Migration Progress
                </h2>
                <Badge variant="info" size="sm">Phase 2 of 10</Badge>
              </div>
            }
          >
            <div className="space-y-3">
              {MIGRATION_PHASES.map((phase) => {
                const config = STATUS_CONFIG[phase.status];
                return (
                  <div
                    key={phase.id}
                    id={`migration-${phase.id}`}
                    className={cn(
                      'flex items-start gap-4 p-3 rounded-[var(--radius-md)]',
                      phase.status === 'active'
                        ? 'bg-[var(--success-light)] border border-[var(--success)] border-opacity-30'
                        : 'bg-[var(--surface-1)]'
                    )}
                  >
                    <div className="shrink-0 mt-0.5">
                      {phase.status === 'active' ? (
                        <div className="w-5 h-5 rounded-full bg-[var(--success)] flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-[var(--border)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                          {phase.phase}
                        </span>
                        <span className="font-semibold text-sm text-[var(--text-primary)]">
                          {phase.title}
                        </span>
                        <Badge variant={config.variant} dot={config.dot} size="sm">
                          {config.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {phase.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Session Info (dev aid) */}
        <Card
          elevation={0}
          header={
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Active Session
            </h2>
          }
        >
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'User ID', value: user?.id ? (user.id.slice(0, 8) + '…') : '—' },
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Role', value: role ?? '—' },
              { label: 'Tenant', value: tenant?.name ?? 'Clasptek Main' },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">{label}</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)] truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

      </div>
  );
}
