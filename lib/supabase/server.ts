/**
 * server.ts — Server-side Supabase Client
 * Phase 2: Next.js Foundation
 * Uses @supabase/ssr createServerClient with Next.js cookies() integration.
 * This module is safe to import ONLY in:
 *   - Server Components
 *   - Route Handlers
 *   - Server Actions
 *   - middleware.ts
 *
 * DO NOT import in 'use client' components — use lib/supabase/client.ts instead.
 *
 * createSupabaseServiceClient() — PRIVILEGED INTERNAL USE ONLY
 *   Uses the SUPABASE_SERVICE_ROLE_KEY (not exposed via NEXT_PUBLIC_*).
 *   Bypasses RLS. Must NEVER be imported into client components or browser bundles.
 *   Authorization MUST be performed by the caller before using this client.
 */
import { createServerClient, createBrowserClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component — cookies are read-only.
            // Session refresh will be handled by middleware.ts.
          }
        },
      },
    }
  );
}

export { createSupabaseServerClient as createServerClient };

/**
 * Creates a Supabase client using the SERVICE ROLE key.
 *
 * PRIVILEGED INTERNAL SERVER-SIDE USE ONLY.
 * - Bypasses all RLS policies.
 * - Uses SUPABASE_SERVICE_ROLE_KEY — never exposed via NEXT_PUBLIC_*.
 * - Does NOT carry any user JWT or session cookies.
 * - Caller MUST perform full authorization before invoking this client.
 * - Must NEVER be imported into 'use client' modules, browser bundles, or public responses.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    '';

  // Use createBrowserClient with the service key — no cookies required.
  // This is safe because: (a) it runs server-side only, (b) the service key
  // is never sent to the browser, (c) RLS bypass is intentional and guarded
  // by the caller's prior authorization checks.
  return createBrowserClient(
    url,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
