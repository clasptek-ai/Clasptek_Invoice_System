/**
 * app/applications/page.tsx
 * Task ID: CLASPTEK-CONSOLIDATE-CANDIDATE-APPLICATIONS-001
 * 
 * Candidate Applications have been consolidated into the unified Student & Client Directory.
 * Vocational training students register directly without university-style admissions tracking.
 * Any navigation to /applications redirects permanently to /students.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Student & Client Directory — Clasptek Portal',
  description: 'Authoritative student and client directory and registration.',
};

export default function ApplicationsPage() {
  redirect('/students');
}

