/**
 * client.ts — Browser-side Supabase Client
 * Phase 2: Next.js Foundation
 * Uses @supabase/ssr createBrowserClient — safe for 'use client' components.
 * Reads NEXT_PUBLIC_* env vars at runtime (never server-only secrets).
 */
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // During build-time static generation, env vars may not be present.
    // Return a no-op placeholder — auth will be unavailable until runtime.
    throw new Error('Supabase env vars not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createBrowserClient(url, key);
}

/**
 * Singleton browser client for use in client components.
 * Do NOT import this in Server Components or Route Handlers — use server.ts instead.
 */
let _browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!_browserClient) {
    _browserClient = createSupabaseBrowserClient();
  }
  return _browserClient;
}

/** Returns true if Supabase is configured at runtime */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
