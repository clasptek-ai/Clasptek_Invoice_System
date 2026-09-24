/**
 * app/apply/success/page.tsx — Phase 3 & 9G
 * Application submission confirmation page.
 * Uses genuine Clasptek design tokens and .cp-* classes.
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
    <div style={{ minHeight: '100vh', background: 'var(--neutral-bg, #F8FAFC)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 16px' }}>
      <div className="cp-card" style={{ maxWidth: '480px', width: '100%', padding: '40px 30px', textAlign: 'center' }}>
        {/* Success Icon */}
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--success-bg, #ECFDF5)', color: 'var(--success, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '28px', fontWeight: 800 }}>
          ✓
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: '0 0 6px 0' }}>
          Application Received{name}!
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          Thank you for applying to Clasptek Academy. Your official application has been recorded in our admissions system.
        </p>

        {/* Application Number Box */}
        <div style={{ background: 'var(--surface-1, #F8FAFC)', border: '1px solid var(--border, #E2E8F0)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted, #64748B)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
            Application Reference Number
          </span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', letterSpacing: '0.05em' }}>
            {appNum}
          </span>
        </div>

        {/* Next Steps */}
        <div style={{ textAlign: 'left', background: 'var(--info-bg, #EFF6FF)', border: '1px solid var(--info-border, #BFDBFE)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--info, #1D4ED8)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>
            What Happens Next?
          </h2>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#1E40AF', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.4 }}>
            <li>Our admissions team will review your dossier within 24 to 48 hours.</li>
            <li>You will receive an email confirmation with your interview or orientation schedule.</li>
            <li>Keep your reference number handy if you need to contact support.</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/apply"
            className="cp-btn secondary"
            style={{ width: '100%', textDecoration: 'none' }}
          >
            Submit Another Application
          </Link>
          <Link
            href="/login"
            style={{ fontSize: '12px', color: 'var(--interactive, #0284C7)', fontWeight: 600, textDecoration: 'none', padding: '6px' }}
          >
            Sign in to Staff Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}
