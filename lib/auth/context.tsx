'use client';

/**
 * context.tsx — Client-Side Auth Context & Provider
 * Phase 2: Next.js Foundation
 * Wraps the app with a React context exposing user session, role, tenant,
 * signIn, signOut, and role checking helpers.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AuthContextValue, AuthState, TenantContext, UserProfile, UserRole } from '@/types/auth';

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Safely obtain the Supabase client — may throw during build-time static
  // pre-rendering if env vars are not present. In that case, render children
  // in an unauthenticated/loading state without crashing.
  let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
  try {
    supabase = getSupabaseBrowserClient();
  } catch {
    // Supabase not configured (build time or missing env vars).
    // Fall through — auth will remain in the unauthenticated idle state.
  }

  const [state, setState] = useState<AuthState>({
    session: null,
    isLoading: supabase !== null, // only show loading if Supabase is available
    error: null,
  });

  // Load the initial session on mount
  useEffect(() => {
    if (!supabase) {
      setState({ session: null, isLoading: false, error: null });
      return;
    }
    const initSession = async () => {
      try {
        const { data: { user }, error } = await supabase!.auth.getUser();

        if (error || !user) {
          setState({ session: null, isLoading: false, error: null });
          return;
        }

        // Build profile from user metadata
        const profile: UserProfile = {
          id: user.id,
          email: user.email ?? '',
          full_name: (user.user_metadata?.full_name as string) ?? null,
          role: ((user.user_metadata?.role as UserRole) ?? 'Staff'),
          tenant_id: (user.user_metadata?.tenant_id as string) ?? null,
          tenant_name: (user.user_metadata?.tenant_name as string) ?? 'Clasptek Main',
          is_active: true,
          created_at: user.created_at ?? '',
          updated_at: user.updated_at ?? '',
          avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
        };

        const tenant: TenantContext | null = profile.tenant_id
          ? {
              id: profile.tenant_id,
              name: profile.tenant_name ?? 'Clasptek Main',
              slug: 'clasptek-main',
              active_role: profile.role,
            }
          : null;

        setState({
          session: {
            user: profile,
            tenant,
            access_token: '',
            expires_at: 0,
          },
          isLoading: false,
          error: null,
        });
      } catch (_err) {
        setState({ session: null, isLoading: false, error: 'Session initialization failed.' });
      }
    };

    initSession();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setState({ session: null, isLoading: false, error: null });
        return;
      }

      const u = session.user;
      const profile: UserProfile = {
        id: u.id,
        email: u.email ?? '',
        full_name: (u.user_metadata?.full_name as string) ?? null,
        role: ((u.user_metadata?.role as UserRole) ?? 'Staff'),
        tenant_id: (u.user_metadata?.tenant_id as string) ?? null,
        tenant_name: (u.user_metadata?.tenant_name as string) ?? 'Clasptek Main',
        is_active: true,
        created_at: u.created_at ?? '',
        updated_at: u.updated_at ?? '',
        avatar_url: (u.user_metadata?.avatar_url as string) ?? null,
      };

      const tenant: TenantContext | null = profile.tenant_id
        ? {
            id: profile.tenant_id,
            name: profile.tenant_name ?? 'Clasptek Main',
            slug: 'clasptek-main',
            active_role: profile.role,
          }
        : null;

      setState({
        session: {
          user: profile,
          tenant,
          access_token: session.access_token,
          expires_at: session.expires_at ?? 0,
        },
        isLoading: false,
        error: null,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // ─── signIn ────────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      if (!supabase) return { error: 'Authentication not available.' };
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const message = error.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please try again.'
            : error.message;
          setState((prev) => ({ ...prev, isLoading: false, error: message }));
          return { error: message };
        }
        // onAuthStateChange will update the session state
        return { error: null };
      } catch (_err) {
        const message = 'An unexpected error occurred. Please try again.';
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return { error: message };
      }
    },
    [supabase]
  );

  // ─── signOut ───────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    if (supabase) await supabase.auth.signOut();
    setState({ session: null, isLoading: false, error: null });
  }, [supabase]);

  // ─── hasRole ───────────────────────────────────────────────────────────────

  const hasRole = useCallback(
    (roles: UserRole | UserRole[]): boolean => {
      const userRole = state.session?.user.role ?? null;
      if (!userRole) return false;
      if (Array.isArray(roles)) return roles.includes(userRole);
      return userRole === roles;
    },
    [state.session]
  );

  // ─── Context Value ─────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.session?.user ?? null,
      tenant: state.session?.tenant ?? null,
      role: state.session?.user.role ?? null,
      isLoading: state.isLoading,
      isAuthenticated: state.session !== null,
      error: state.error,
      signIn,
      signOut,
      hasRole,
    }),
    [state, signIn, signOut, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used inside <AuthProvider>. Wrap your app in AuthProvider.');
  }
  return ctx;
}
