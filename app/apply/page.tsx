/**
 * app/apply/page.tsx — Phase 3
 * Public Admissions Application Page.
 * Visual and structural preservation of legacy Clasptek Admissions & Candidate Intake.
 */

import Link from 'next/link';
import { getActiveProgrammes } from '@/lib/admissions/queries';
import { ApplyFormClient } from './ApplyFormClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admissions & Candidate Intake — Clasptek Academy',
  description: 'Complete a new candidate application for admission into a Clasptek training programme.',
};

interface ApplyPageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function ApplyPage({ searchParams }: ApplyPageProps) {
  const params = await searchParams;
  const programmes = await getActiveProgrammes();

  return (
    <div className="min-h-screen bg-[var(--surface-1)] py-6 px-4 sm:px-6">
      <div className="cp-admissions-workspace">
        {/* Top Navigation */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <Link href="/applications" className="cp-admissions-back-btn" aria-label="Back to Candidate Applications">
            <span style={{ fontSize: '16px', lineHeight: 1 }}>&larr;</span> Back to Candidate Applications
          </Link>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Route: <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>#apply</code>
          </div>
        </div>

        {/* Page Header — Exact Clasptek Admissions Header */}
        <div
          className="cp-card"
          style={{
            padding: '22px 26px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: '#FFFFFF',
            border: '1px solid #334155',
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#38BDF8', marginBottom: '4px' }}>
                Candidate Applications &bull; Admissions &amp; Candidate Intake
              </div>
              <h1 className="cp-page-title" style={{ fontSize: '24px', fontWeight: 800, color: '#F8FAFC', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
                Admissions &amp; Candidate Intake
              </h1>
              <p className="cp-page-subtitle" style={{ fontSize: '13.5px', color: '#94A3B8', margin: 0, maxWidth: '680px', lineHeight: 1.4 }}>
                Complete a new candidate application for admission into a Clasptek training programme.
              </p>
            </div>
          </div>

          {/* Formal Intake Stage Notice */}
          <div style={{ marginTop: '16px', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38BDF8', borderRadius: '4px', fontSize: '12px', color: '#BAE6FD', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>ℹ️</span>
            <span><strong>Formal Application Stage:</strong> This admissions workspace records authoritative candidate dossiers for review, screening, and conversion prior to cohort enrollment.</span>
          </div>
        </div>

        {/* 5-Step Application Wizard */}
        <ApplyFormClient
          programmes={programmes}
          prefilledEnquiryId={params.enquiry_id || null}
          prefilledEmail={params.email || null}
          prefilledName={params.name || null}
        />
      </div>
    </div>
  );
}
