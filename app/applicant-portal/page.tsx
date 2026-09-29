/**
 * app/applicant-portal/page.tsx
 * Task ID: CLASPTEK-REMOVE-INTAKE-APPLICANT-PORTALS-001
 * 
 * Applicant Portal & Application Tracking have been removed as they are obsolete
 * in the Clasptek operating model. Any navigation here redirects to the canonical
 * Student Registration & Intake pipeline.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ApplicantPortalPage() {
  redirect('/applications');
}
