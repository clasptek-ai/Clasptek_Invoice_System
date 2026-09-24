/**
 * app/applicant-portal/page.tsx — Server Component for Applicant Status & Admissions Portal
 * Phase 9E: User Workspaces Migration
 * Publicly accessible candidate self-service portal with zero-trust lookup.
 */

import React from 'react';
import { ApplicantPortalClient } from './ApplicantPortalClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Applicant Status & Tracking — Clasptek Admissions',
  description: 'Track vocational training application progress, admission decisions, and document verification in real time.',
};

export default function ApplicantPortalPage() {
  return <ApplicantPortalClient />;
}
