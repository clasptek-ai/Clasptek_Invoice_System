/**
 * middleware.ts — Supabase Session Middleware Helper
 * Phase 2: Next.js Foundation
 * Proactively refreshes the Supabase session token in Edge Middleware.
 * Called from the root middleware.ts to keep the auth session alive.
 */
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveValidatedSupabaseUrl, resolveValidatedAnonKey } from '@/lib/supabase/project-guard';

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const rawPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawServerUrl = process.env.SUPABASE_URL;

  // If neither URL is set, fail closed early without contacting Supabase
  if (!rawPublicUrl && !rawServerUrl) {
    return { supabaseResponse, user: null };
  }

  // Validates strict hostname, scheme, embedded credentials, and rejects quarantined project ref
  const supabaseUrl = resolveValidatedSupabaseUrl(
    rawServerUrl,
    rawPublicUrl,
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL'
  );

  const rawPublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const rawAltKey = process.env.NEXT_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!rawPublicKey && !rawAltKey) {
    return { supabaseResponse, user: null };
  }

  const supabaseKey = resolveValidatedAnonKey(
    rawPublicKey,
    rawAltKey,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY'
  );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Proactively refresh the session — do NOT use session from this call for auth decisions.
  // Session data can be stale; use getUser() for secure auth checks.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
