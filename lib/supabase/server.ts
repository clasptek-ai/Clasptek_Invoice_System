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
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
 * Creates a Supabase server client using the SERVICE ROLE key.
 * FOR INTERNAL SERVER-SIDE USE ONLY. Never expose service role key to clients.
 * Use for admin operations that bypass RLS — use with extreme caution.
 */
export async function createSupabaseServiceClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
            // Read-only in Server Components — middleware handles refresh.
          }
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
