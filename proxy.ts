/**
 * proxy.ts — Edge Proxy: Route Protection & Session Refresh
 * Phase 2: Next.js Foundation (Next.js 16 — renamed from middleware.ts)
 *
 * Responsibilities:
 *  1. Proactively refresh the Supabase session token on every request.
 *  2. Redirect unauthenticated users to /login when accessing protected routes.
 *  3. Redirect authenticated users away from /login to /dashboard.
 *  4. Pass through: static assets, api/ routes, public routes, legacy HTML files.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ['/login', '/apply', '/verify-certificate', '/applicant-portal'];

// Routes that should bypass middleware entirely (legacy, static)
const BYPASS_PATTERNS = [
  /^\/api\//,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/runtime-config\.js$/,
  /^\/assets\//,
  /^\/public\//,
  /\.html$/,
  /\.js$/,
  /\.css$/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/,
  /\.woff2?$/,
  /\.ttf$/,
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass: static assets and legacy files
  for (const pattern of BYPASS_PATTERNS) {
    if (pattern.test(pathname)) {
      return NextResponse.next();
    }
  }

  // Evaluate public routes before session initialization
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Check whether the request carries Supabase auth session cookies
  const hasAuthCookies = request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-')
  );

  // Anonymous visitor accessing public route: pass through without unnecessary session initialization
  if (isPublicRoute && !hasAuthCookies) {
    return NextResponse.next();
  }

  // Non-login public routes (e.g. /apply, /verify-certificate): always pass through
  if (isPublicRoute && pathname !== '/login') {
    return NextResponse.next();
  }

  // Proactively refresh Supabase session and get current user
  const { supabaseResponse, user } = await updateSupabaseSession(request);

  // Unauthenticated user accessing a protected route → redirect to /login
  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user accessing /login → redirect to /dashboard
  if (user && pathname === '/login') {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.searchParams.delete('next');
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static (static files)
     *  - _next/image (image optimisation)
     *  - favicon.ico
     *  - robots.txt, sitemap.xml
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
