/**
 * app/my-security/page.tsx — Server Component for Account & Security
 * Phase 9E: User Workspaces Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { MySecurityClient } from './MySecurityClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account Security — Clasptek Portal',
  description: 'Manage portal access credentials, update security keys, and review login email.',
};

export default async function MySecurityPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/my-security');
  }

  return (
    <MySecurityClient
      userEmail={session.user.email || ''}
      currentRole={session.role}
    />
  );
}
