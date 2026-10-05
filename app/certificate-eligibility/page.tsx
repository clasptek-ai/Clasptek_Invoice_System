/**
 * app/certificate-eligibility/page.tsx — Phase 9D
 * Server Component: Certificate Eligibility Register & Completion Verification
 *
 * Governing Principle: CHANGE THE ENGINE, NOT THE APPEARANCE.
 * Uses certified Clasptek shell and tokens.
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getCertificateEligibilityList } from '@/lib/certificates/eligibility-queries';
import { getTrainingCohorts } from '@/lib/training/queries';
import { CertificateEligibilityClient } from './CertificateEligibilityClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Certificate Eligibility — Clasptek Training Operations',
  description:
    'Authoritative vocational completion evaluation based on >=80% delivered session attendance and facilitator reporting.',
};

export default async function CertificateEligibilityPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/certificate-eligibility');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const [eligibilityResult, cohortsResult] = await Promise.all([
    getCertificateEligibilityList(session.tenantId),
    getTrainingCohorts(),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <CertificateEligibilityClient
        initialCandidates={eligibilityResult.data}
        initialKpis={eligibilityResult.kpis}
        cohorts={cohortsResult.data || []}
        currentUserRole={session.role}
        currentUserId={session.user.id}
      />
    </div>
  );
}
