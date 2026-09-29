/**
 * app/my-profile/page.tsx — Server Component for My Personnel Profile
 * Phase 9E: User Workspaces Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeeProfile } from '@/lib/ess/queries';
import { MyProfileClient } from './MyProfileClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Profile — Clasptek Portal',
  description: 'Review official employment records and confidential disbursement banking details on file.',
};

export default async function MyProfilePage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/my-profile');
  }

  const profile = await getEmployeeProfile();

  return (
    <MyProfileClient
      profile={profile}
      currentRole={session.role}
      userEmail={session.user.email || ''}
    />
  );
}
