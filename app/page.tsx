import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';

// Opt out of static generation — this page reads cookies at runtime
export const dynamic = 'force-dynamic';

/**
 * Root entry page.
 * Server Component: reads authoritative session and redirects accordingly.
 * - Authenticated users with active tenant membership → /dashboard
 * - Unauthenticated or suspended/unmapped users → /login
 */
export default async function RootPage() {
  const session = await getAuthoritativeSession();

  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
