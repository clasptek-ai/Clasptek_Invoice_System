/**
 * app/my-sessions/page.tsx — Server Component for My Sessions & Engagements
 * Phase 9E: User Workspaces Migration
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getEmployeeSessions } from '@/lib/ess/queries';
import { MySessionsClient } from './MySessionsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Training Sessions — Clasptek Portal',
  description: 'Manage assigned training sessions, class deliveries, and attendance registers.',
};

export default async function MySessionsPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/my-sessions');
  }

  const allowedRoles = ['Super Admin', 'Facilitator'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const sessions = await getEmployeeSessions();

  return (
    <MySessionsClient
      initialSessions={sessions}
      currentRole={session.role}
      userEmail={session.user.email || ''}
    />
  );
}
