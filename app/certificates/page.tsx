/**
 * app/certificates/page.tsx — Phase 9D
 * Server Component: Certificates of Completion Registry & Lifecycle Management
 *
 * Governing Principle: CHANGE THE ENGINE, NOT THE APPEARANCE.
 * Certified Clasptek visual shell with closed RLS and immutable auditability.
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { getCertificates } from '@/lib/certificates/certificate-queries';
import { getCertificateEligibilityList } from '@/lib/certificates/eligibility-queries';
import { CertificatesClient } from './CertificatesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Certificates of Completion — Clasptek Training Operations',
  description:
    'Dynamic credential issuance, programme-dependent competency mapping, tamper-evident cryptographic verification, and audited provenance.',
};

export default async function CertificatesPage() {
  const session = await getAuthoritativeSession();

  if (!session) {
    redirect('/login?next=/certificates');
  }

  const allowedRoles = ['Super Admin', 'Finance Manager'];
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
  }

  const [certsResult, eligibilityResult] = await Promise.all([
    getCertificates(session.tenantId),
    getCertificateEligibilityList(session.tenantId),
  ]);

  return (
    <div className="cp-main-area" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <CertificatesClient
        initialCertificates={certsResult.data}
        initialKpis={certsResult.kpis}
        eligibleCandidates={eligibilityResult.data.filter((c) => !c.hasActiveCertificate)}
        currentUserRole={session.role}
        currentUserId={session.user.id}
      />
    </div>
  );
}
