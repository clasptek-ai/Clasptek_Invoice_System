/**
 * app/apply/page.tsx — Phase 3
 * Public Admissions Application Page.
 * Accessible without authentication.
 */

import { getActiveProgrammes } from '@/lib/admissions/queries';
import { ApplyFormClient } from './ApplyFormClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Apply for Admission — Clasptek Academy',
  description: 'Submit your intake application for professional technology and engineering training programmes.',
};

interface ApplyPageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function ApplyPage({ searchParams }: ApplyPageProps) {
  const params = await searchParams;
  const programmes = await getActiveProgrammes();

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      {/* Brand & Introduction Header */}
      <div className="max-w-3xl mx-auto text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/60 text-blue-700 text-xs font-semibold mb-3">
          <span>🎓</span> Official Admissions Intake
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
          Apply to Clasptek Academy
        </h1>
        <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto">
          Take the first step toward launching or advancing your career in software engineering, cloud, and data technologies.
        </p>
      </div>

      {/* 5-Step Application Wizard */}
      <ApplyFormClient
        programmes={programmes}
        prefilledEnquiryId={params.enquiry_id || null}
        prefilledEmail={params.email || null}
        prefilledName={params.name || null}
      />
    </div>
  );
}
