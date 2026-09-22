/**
 * navigation.ts — Navigation Type Definitions
 * Phase 2: Next.js Foundation
 * Reflects 44 confirmed modules from Phase 1 module inventory
 */

import type { UserRole } from './auth';

// ─── Navigation Item ──────────────────────────────────────────────────────────

export interface NavigationItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Display label */
  label: string;
  /** Next.js href route path */
  href: string;
  /** SVG icon name (from icon registry) */
  icon?: string;
  /** If null/undefined, item is accessible to all authenticated users */
  rolesAllowed?: UserRole[];
  /** Optional badge count or status label */
  badge?: string | number;
  /** Opens in new tab */
  isExternal?: boolean;
  /** Item is disabled (grayed out, not clickable) */
  isDisabled?: boolean;
  /** Phase label — indicates migration phase target */
  migrationPhase?: string;
}

// ─── Navigation Section ───────────────────────────────────────────────────────

export interface NavigationSection {
  /** Section heading label */
  sectionTitle: string;
  /** Unique section id */
  id: string;
  /** Navigation items within this section */
  items: NavigationItem[];
}

// ─── Full Navigation Registry ─────────────────────────────────────────────────

export interface NavigationRegistry {
  sections: NavigationSection[];
}

// ─── Active Route ─────────────────────────────────────────────────────────────

export interface ActiveRoute {
  path: string;
  sectionId: string;
  itemId: string;
}
