import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Opt out of static generation — this page reads cookies at runtime
export const dynamic = 'force-dynamic';

/**
 * Root entry page.
 * Server Component: reads session and redirects accordingly.
 * - Authenticated users → /dashboard
 * - Unauthenticated users → /login
 */
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
