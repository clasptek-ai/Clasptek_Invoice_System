/**
 * app/programmes/page.tsx — Phase 4
 * Server Component: Protected route for Academic Programmes.
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getProgrammes } from '@/lib/academics/queries';
import { ProgrammesPageClient } from './ProgrammesPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Academic Programmes — Clasptek Portal',
  description: 'Official curriculum programs, tuition structures, and training catalog.',
};

export default async function ProgrammesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/programmes');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const { data: programmes } = await getProgrammes();

  return <ProgrammesPageClient initialProgrammes={programmes} />;
}
