/**
 * app/people-access/page.tsx
 * Server Component: People & Access / Staff Management
 * Phase 9B: Administration & Governance Module Migration
 */

import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getAdminPersonnelList, getAdminUsersList } from '@/lib/admin/personnel-queries';
import { PeopleAccessPageClient } from './PeopleAccessPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'People & Access — Clasptek Portal',
  description: 'Manage personnel directories, employee self-service portals, role governance, and non-destructive offboarding.',
};

export default async function PeopleAccessPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/people-access');
  }

  // Enforce ADMIN role access: Super Admin or Finance Manager
  const allowed = ['Super Admin', 'Finance Manager'].includes(session.role);
  if (!allowed) {
    redirect('/dashboard');
  }

  const [personnel, users] = await Promise.all([
    getAdminPersonnelList(session.tenantId),
    getAdminUsersList(session.tenantId),
  ]);

  return (
    <PeopleAccessPageClient
      initialPersonnel={personnel}
      initialUsers={users}
      currentUserRole={session.role}
      currentUserId={session.user.id}
    />
  );
}
