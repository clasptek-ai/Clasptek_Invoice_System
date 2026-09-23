/**
 * app/programmes/page.tsx — Phase 4
 * Server Component: Protected route for Academic Programmes.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getProgrammes } from '@/lib/academics/queries';
import { ProgrammesPageClient } from './ProgrammesPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Academic Programmes — Clasptek Portal',
  description: 'Official curriculum programs, tuition structures, and training catalog.',
};

export default async function ProgrammesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/programmes');
  }

  const { data: programmes } = await getProgrammes();

  return <ProgrammesPageClient initialProgrammes={programmes} />;
}
