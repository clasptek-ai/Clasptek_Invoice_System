/**
 * navigation.ts — Centralized Navigation Registry
 * Phase 9A: Visual Shell, Branding & Navigation Restoration
 * Restores original 7-section information architecture and exact labels from clasptek_invoice_system.html
 */

import type { NavigationSection } from '@/types/navigation';
import { type UserRole, normalizeRole } from '@/types/auth';

const ALL_STAFF: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'];
const FINANCE: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
const ADMIN: UserRole[] = ['Super Admin', 'Finance Manager'];
const SUPER_ADMIN: UserRole[] = ['Super Admin'];
const ADMISSIONS_AND_ADMIN: UserRole[] = ['Super Admin', 'Finance Manager', 'Staff'];
const TRAINING_DELIVERY: UserRole[] = ['Super Admin', 'Finance Manager', 'Facilitator'];
const FACILITATOR_SESSIONS: UserRole[] = ['Super Admin', 'Facilitator'];

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

  // ─── 2. PROSPECTS & REGISTRATION ───────────────────────────────────────────
  {
    id: 'crm',
    sectionTitle: 'PROSPECTS & REGISTRATION',
    items: [
      {
        id: 'enquiries',
        label: 'Enquiries & Leads',
        href: '/enquiries',
        icon: 'enquiries',
        rolesAllowed: ADMISSIONS_AND_ADMIN,
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
        rolesAllowed: ADMISSIONS_AND_ADMIN,
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
        href: '/expenses',
        icon: 'expenses',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 9C — ACTIVE',
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
        rolesAllowed: ADMISSIONS_AND_ADMIN,
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
        rolesAllowed: TRAINING_DELIVERY,
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'meetings',
        label: 'Meetings',
        href: '/meetings',
        icon: 'meetings',
        rolesAllowed: TRAINING_DELIVERY,
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
        rolesAllowed: TRAINING_DELIVERY,
        migrationPhase: 'Phase 5 — ACTIVE',
      },
      {
        id: 'completions',
        label: 'Certificate Eligibility',
        href: '/certificate-eligibility',
        icon: 'completions',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 9D — ACTIVE',
      },
      {
        id: 'certificates',
        label: 'Certificates',
        href: '/certificates',
        icon: 'certificates',
        rolesAllowed: ADMIN,
        migrationPhase: 'Phase 9D — ACTIVE',
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
        href: '/funds-transfers',
        icon: 'funds',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 9C — ACTIVE',
      },
      {
        id: 'receivables',
        label: 'Receivables & Collections',
        href: '/receivables',
        icon: 'receivables',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 9C — ACTIVE',
      },
      {
        id: 'budgets',
        label: 'Budgets & Planning',
        href: '/budgets',
        icon: 'budgets',
        rolesAllowed: FINANCE,
        migrationPhase: 'Phase 9C — ACTIVE',
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

  // ─── 8. EMPLOYEE SELF-SERVICE ────────────────────────────────────────────────
  {
    id: 'employeeSelfService',
    sectionTitle: 'EMPLOYEE SELF-SERVICE',
    items: [
      {
        id: 'myPayslips',
        label: 'My Payslips',
        href: '/my-payslips',
        icon: 'payroll',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 9E — ACTIVE',
      },
      {
        id: 'mySessions',
        label: 'My Training Sessions',
        href: '/my-sessions',
        icon: 'sessions',
        rolesAllowed: FACILITATOR_SESSIONS,
        migrationPhase: 'Phase 9E — ACTIVE',
      },
      {
        id: 'myProfile',
        label: 'My Profile & Bank',
        href: '/my-profile',
        icon: 'profile',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 9E — ACTIVE',
      },
      {
        id: 'myQueries',
        label: 'My Payroll Queries',
        href: '/my-queries',
        icon: 'queries',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 9E — ACTIVE',
      },
      {
        id: 'mySecurity',
        label: 'Account Security',
        href: '/my-security',
        icon: 'security',
        rolesAllowed: ALL_STAFF,
        migrationPhase: 'Phase 9E — ACTIVE',
      },
    ],
  },
];

/**
 * Returns navigation sections filtered by the active user role.
 * Items with no rolesAllowed are accessible to all authenticated users.
 */
export function getNavigationForRole(role: UserRole | string | null | undefined): NavigationSection[] {
  if (!role) return [];
  const normalizedRole = normalizeRole(role);

  return NAVIGATION_REGISTRY.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.rolesAllowed || item.rolesAllowed.includes(normalizedRole)
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
