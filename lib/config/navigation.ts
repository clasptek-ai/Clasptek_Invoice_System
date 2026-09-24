/**
 * navigation.ts — Centralized Navigation Registry
 * Phase 2: Next.js Foundation
 * Reflects the 44 modules verified in Phase 1 module inventory audit.
 *
 * Route Status:
 *  - ACTIVE (Phase 2): /dashboard, /login — fully implemented
 *  - PENDING migration: all other routes resolve to legacy app during migration phases
 */

import type { NavigationSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

const ALL_STAFF: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'];
const FINANCE: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
const ADMIN: UserRole[] = ['Super Admin', 'Finance Manager'];
const SUPER_ADMIN: UserRole[] = ['Super Admin'];

export const NAVIGATION_REGISTRY: NavigationSection[] = [
  // ─── Executive / Staff Dashboard ─────────────────────────────────────────────
  {
    id: 'home',
    sectionTitle: 'Home',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'home',
        migrationPhase: 'Phase 2 — ACTIVE',
      },
    ],
  },

  // ─── Admissions & CRM ────────────────────────────────────────────────────────
  {
    id: 'crm',
    sectionTitle: 'Admissions & CRM',
    items: [
      {
        id: 'enquiries',
        label: 'Enquiries',
        href: '/enquiries',
        icon: 'inbox',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 3 — ACTIVE',
      },
      {
        id: 'applications',
        label: 'Applications',
        href: '/applications',
        icon: 'file-text',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 3 — ACTIVE',
      },
      {
        id: 'apply',
        label: 'Apply (Public Form)',
        href: '/apply',
        icon: 'send',
        migrationPhase: 'Phase 3 — ACTIVE',
      },
    ],
  },

  // ─── Students & Academics ────────────────────────────────────────────────────
  {
    id: 'students',
    sectionTitle: 'Students & Academics',
    items: [
      {
        id: 'students',
        label: 'Students',
        href: '/students',
        icon: 'users',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
      {
        id: 'enrolments',
        label: 'Enrolments',
        href: '/enrolments',
        icon: 'clipboard-list',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
      {
        id: 'programmes',
        label: 'Programmes',
        href: '/programmes',
        icon: 'book-open',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
      {
        id: 'cohorts',
        label: 'Cohorts',
        href: '/cohorts',
        icon: 'grid',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
    ],
  },

  // ─── TRAINING OPERATIONS ──────────────────────────────────────────────────────
  {
    id: 'training',
    sectionTitle: 'TRAINING OPERATIONS',
    items: [
      {
        id: 'attendance',
        label: 'Attendance',
        href: '/attendance',
        icon: 'check-square',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'facilitatorReports',
        label: 'Facilitator Reports',
        href: '/facilitator-reports',
        icon: 'bar-chart-2',
        rolesAllowed: ['Super Admin', 'Finance Manager', 'Staff', 'Facilitator'],
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'meetings',
        label: 'Meetings',
        href: '/meetings',
        icon: 'video',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 5 — ACTIVE',
        subItems: [
          { id: 'allMeetings', label: 'All Meetings', href: '/meetings?subTab=all' },
          { id: 'scheduleMeeting', label: 'Schedule Meeting', href: '/meetings?subTab=upcoming' },
          { id: 'liveMeetings', label: 'Live Meetings', href: '/meetings?subTab=live' },
          { id: 'recordings', label: 'Recordings', href: '/meetings?subTab=recordings' },
          { id: 'meetingHistory', label: 'Meeting History', href: '/meetings?subTab=completed' },
        ],
      },
    ],
  },

  // ─── Financial Management ─────────────────────────────────────────────────────
  {
    id: 'finance',
    sectionTitle: 'Financial Management',
    items: [
      {
        id: 'invoices',
        label: 'Invoices',
        href: '/invoices',
        icon: 'file-invoice',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'payments',
        label: 'Payments',
        href: '/payments',
        icon: 'credit-card',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'receipts',
        label: 'Receipts',
        href: '/receipts',
        icon: 'receipt',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6',
      },
      {
        id: 'expenses',
        label: 'Expenses',
        href: '/expenses',
        icon: 'trending-down',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6',
      },
      {
        id: 'directIncome',
        label: 'Direct Income',
        href: '/direct-income',
        icon: 'trending-up',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6',
      },
      {
        id: 'payroll',
        label: 'Payroll',
        href: '/payroll',
        icon: 'dollar-sign',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'budgets',
        label: 'Budgets',
        href: '/budgets',
        icon: 'pie-chart',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 6',
      },
    ],
  },

  // ─── MANAGEMENT INTELLIGENCE ──────────────────────────────────────────────────
  {
    id: 'intelligence',
    sectionTitle: 'MANAGEMENT INTELLIGENCE',
    items: [
      {
        id: 'managementDashboard',
        label: 'Management Intelligence',
        href: '/intelligence',
        icon: 'bar-chart-2',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 7 — ACTIVE',
      },
      {
        id: 'reports',
        label: 'Reports & Analytics',
        href: '/reports',
        icon: 'file-text',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 7 — ACTIVE',
      },
    ],
  },

  // ─── Certificates & Governance ────────────────────────────────────────────────
  {
    id: 'governance',
    sectionTitle: 'Certificates & Governance',
    items: [
      {
        id: 'certificates',
        label: 'Certificates',
        href: '/certificates',
        icon: 'award',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 7',
      },
      {
        id: 'controls',
        label: 'Financial Controls',
        href: '/controls',
        icon: 'shield',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 7',
      },
      {
        id: 'auditLog',
        label: 'Audit Log',
        href: '/audit-log',
        icon: 'activity',
        rolesAllowed: SUPER_ADMIN,
        migrationPhase: 'Phase 7',
      },
    ],
  },

  // ─── Organization Settings ────────────────────────────────────────────────────
  {
    id: 'settings',
    sectionTitle: 'Organisation',
    items: [
      {
        id: 'personnel',
        label: 'Personnel',
        href: '/personnel',
        icon: 'user-check',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 8',
      },
      {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: 'settings',
        rolesAllowed: SUPER_ADMIN,
        migrationPhase: 'Phase 8',
      },
    ],
  },
];

/**
 * Returns navigation sections filtered by the active user role.
 * Items with no rolesAllowed are accessible to all authenticated users.
 */
export function getNavigationForRole(role: UserRole | null): NavigationSection[] {
  if (!role) return [];

  return NAVIGATION_REGISTRY.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.rolesAllowed || item.rolesAllowed.includes(role)
    ),
  })).filter((section) => section.items.length > 0);
}

/**
 * Finds the navigation item for a given pathname.
 */
export function findActiveNavItem(pathname: string) {
  for (const section of NAVIGATION_REGISTRY) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return { section, item };
      }
    }
  }
  return null;
}
