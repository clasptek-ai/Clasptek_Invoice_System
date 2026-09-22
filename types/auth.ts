/**
 * auth.ts — Clasptek Portal Auth Types
 * Phase 2: Next.js Foundation
 * Ported from Phase 1 audit of 7 confirmed user roles
 */

// ─── User Roles ──────────────────────────────────────────────────────────────

export type UserRole =
  | 'Super Admin'
  | 'Finance Manager'
  | 'Finance Staff'
  | 'Staff'
  | 'Facilitator'
  | 'Finance Viewer'
  | 'Student';

export const USER_ROLES: UserRole[] = [
  'Super Admin',
  'Finance Manager',
  'Finance Staff',
  'Staff',
  'Facilitator',
  'Finance Viewer',
  'Student',
];

export const ADMIN_ROLES: UserRole[] = ['Super Admin', 'Finance Manager'];
export const FINANCE_ROLES: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Finance Viewer'];
export const STAFF_ROLES: UserRole[] = ['Super Admin', 'Finance Manager', 'Finance Staff', 'Staff', 'Facilitator'];

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  tenant_id: string | null;
  tenant_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
}

// ─── Tenant Context ───────────────────────────────────────────────────────────

export interface TenantMembership {
  tenant_id: string;
  tenant_name: string;
  role: UserRole;
  is_primary: boolean;
}

export interface TenantContext {
  id: string;
  name: string;
  slug: string;
  active_role: UserRole;
}

// ─── Auth Session ─────────────────────────────────────────────────────────────

export interface AuthSession {
  user: UserProfile;
  tenant: TenantContext | null;
  access_token: string;
  expires_at: number;
}

export interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
}

// ─── Auth Context Value ────────────────────────────────────────────────────────

export interface AuthContextValue {
  user: UserProfile | null;
  tenant: TenantContext | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

// ─── Permission Helpers ───────────────────────────────────────────────────────

export function hasAnyRole(userRole: UserRole | null, allowedRoles: UserRole[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

export function isSuperAdmin(role: UserRole | null): boolean {
  return role === 'Super Admin';
}

export function isFinanceRole(role: UserRole | null): boolean {
  return role !== null && FINANCE_ROLES.includes(role);
}
