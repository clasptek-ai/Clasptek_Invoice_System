/**
 * app/apply/success/page.tsx — Phase 3
 * Application submission confirmation page.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Application Received — Clasptek Academy',
  description: 'Your intake application has been received successfully.',
};

interface SuccessPageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function ApplySuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const appNum = params.appNum || 'APP-RECEIVED';
  const name = params.name ? ` ${params.name}` : '';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        {/* Success Icon */}
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          ✓
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Application Received{name}!
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          Thank you for applying to Clasptek Academy. Your official application has been recorded in our admissions system.
        </p>

        {/* Application Number Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
            Application Reference Number
          </span>
          <span className="font-mono text-lg font-bold text-gray-900 tracking-wider">
            {appNum}
          </span>
        </div>

        {/* Next Steps */}
        <div className="text-left bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-6 space-y-3">
          <h2 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
            What Happens Next?
          </h2>
          <ul className="text-xs text-blue-800 space-y-2 list-disc list-inside">
            <li>Our admissions team will review your dossier within 24 to 48 hours.</li>
            <li>You will receive an email confirmation with your interview or orientation schedule.</li>
            <li>Keep your reference number handy if you need to contact support.</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Link
            href="/apply"
            className="block w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Submit Another Application
          </Link>
          <Link
            href="/login"
            className="block text-xs text-blue-600 hover:text-blue-700 font-medium py-1 transition-colors"
          >
            Sign in to Staff Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}
