/**
 * navigation.ts — Centralized Navigation Registry
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Restores original 7-section information architecture and exact labels from clasptek_invoice_system.html
 */

import type { NavigationSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

const ALL_STAFF: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'];
const FINANCE: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
const ADMIN: UserRole[] = ['Super Admin', 'Finance Manager'];
const SUPER_ADMIN: UserRole[] = ['Super Admin'];

export const NAVIGATION_REGISTRY: NavigationSection[] = [
  // ─── 1. WORKSPACE ────────────────────────────────────────────────────────────
  {
    id: 'workspace',
    sectionTitle: 'WORKSPACE',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'dashboard',
        migrationPhase: 'Phase 2 — ACTIVE',
      },
    ],
  },

  // ─── 2. ADMISSIONS & CRM ─────────────────────────────────────────────────────
  {
    id: 'crm',
    sectionTitle: 'ADMISSIONS & CRM',
    items: [
      {
        id: 'enquiries',
        label: 'Enquiries & Leads',
        href: '/enquiries',
        icon: 'enquiries',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 3 — ACTIVE',
      },
      {
        id: 'applications',
        label: 'Candidate Applications',
        href: '/applications',
        icon: 'applications',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 3 — ACTIVE',
      },
    ],
  },

  // ─── 3. DIRECTORY & ACCOUNTS ─────────────────────────────────────────────────
  {
    id: 'directory',
    sectionTitle: 'DIRECTORY & ACCOUNTS',
    items: [
      {
        id: 'students',
        label: 'Student & Client Directory',
        href: '/students',
        icon: 'students',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
    ],
  },

  // ─── 4. FINANCE ──────────────────────────────────────────────────────────────
  {
    id: 'finance',
    sectionTitle: 'FINANCE',
    items: [
      {
        id: 'invoices',
        label: 'Invoices',
        href: '/invoices',
        icon: 'invoices',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'payments',
        label: 'Payments',
        href: '/payments',
        icon: 'payments',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'payroll',
        label: 'Payroll',
        href: '/payroll',
        icon: 'payroll',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 6 — ACTIVE',
      },
      {
        id: 'expenses',
        label: 'Expenses',
        href: '#',
        icon: 'expenses',
        rolesAllowed: FINANCE,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
      {
        id: 'programmes',
        label: 'Programmes',
        href: '/programmes',
        icon: 'programmes',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
    ],
  },

  // ─── 5. TRAINING OPERATIONS ──────────────────────────────────────────────────
  {
    id: 'training',
    sectionTitle: 'TRAINING OPERATIONS',
    items: [
      {
        id: 'enrolments',
        label: 'Course Enrollments',
        href: '/enrolments',
        icon: 'enrolments',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
      {
        id: 'cohorts',
        label: 'Cohorts & Schedules',
        href: '/cohorts',
        icon: 'cohorts',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 4 — ACTIVE',
      },
      {
        id: 'attendance',
        label: 'Attendance Register',
        href: '/attendance',
        icon: 'attendance',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'meetings',
        label: 'Meetings',
        href: '/meetings',
        icon: 'meetings',
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
      {
        id: 'facilitatorReports',
        label: 'Facilitator Reports',
        href: '/facilitator-reports',
        icon: 'facilitatorReports',
        rolesAllowed: ['Super Admin', 'Finance Manager', 'Staff', 'Facilitator'],
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'completions',
        label: 'Certificate Eligibility',
        href: '#',
        icon: 'completions',
        rolesAllowed: ALL_STAFF,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
      {
        id: 'certificates',
        label: 'Certificates',
        href: '#',
        icon: 'certificates',
        rolesAllowed: ALL_STAFF,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
    ],
  },

  // ─── 6. MANAGEMENT INTELLIGENCE ──────────────────────────────────────────────
  {
    id: 'intelligence',
    sectionTitle: 'MANAGEMENT INTELLIGENCE',
    items: [
      {
        id: 'financialIntelligence',
        label: 'Financial Intelligence',
        href: '/intelligence',
        icon: 'financialIntelligence',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 7 — ACTIVE',
      },
      {
        id: 'fundsAndTransfers',
        label: 'Funds & Transfers',
        href: '#',
        icon: 'funds',
        rolesAllowed: ADMIN,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
      {
        id: 'receivables',
        label: 'Receivables & Collections',
        href: '#',
        icon: 'receivables',
        rolesAllowed: ADMIN,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
      {
        id: 'budgets',
        label: 'Budgets & Planning',
        href: '#',
        icon: 'budgets',
        rolesAllowed: ADMIN,
        isDisabled: true,
        badge: 'Upcoming',
        migrationPhase: 'Future Phase',
      },
      {
        id: 'reports',
        label: 'Reports & Analytics',
        href: '/reports',
        icon: 'reports',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 7 — ACTIVE',
      },
    ],
  },

  // ─── 7. ADMINISTRATION ───────────────────────────────────────────────────────
  {
    id: 'administration',
    sectionTitle: 'ADMINISTRATION',
    items: [
      {
        id: 'productionControl',
        label: 'Production Control',
        href: '/production-control',
        icon: 'productionControl',
        rolesAllowed: SUPER_ADMIN,
        migrationPhase: 'Phase 9B — ACTIVE',
      },
      {
        id: 'usersRoles',
        label: 'People & Access',
        href: '/people-access',
        icon: 'usersRoles',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 9B — ACTIVE',
      },
      {
        id: 'financialControls',
        label: 'Financial Controls',
        href: '/controls',
        icon: 'financialControls',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 9B — ACTIVE',
      },
      {
        id: 'auditLog',
        label: 'Audit Log',
        href: '/audit-log',
        icon: 'auditLog',
        rolesAllowed: SUPER_ADMIN,
        migrationPhase: 'Phase 9B — ACTIVE',
      },
      {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: 'settings',
        rolesAllowed: SUPER_ADMIN,
        migrationPhase: 'Phase 9B — ACTIVE',
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
      if (item.href !== '#' && (pathname === item.href || pathname.startsWith(item.href + '/'))) {
        return { section, item };
      }
    }
  }
  return null;
}
