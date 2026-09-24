import Link from 'next/link';
import { Button } from '@/components/ui/Button';

/**
 * not-found.tsx — 404 Page
 * Phase 2 & 9G: Genuine Clasptek Visual Shell Styling
 */
export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--neutral-bg, #F8FAFC)', padding: '20px' }}>
      <div className="cp-card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '40px 30px' }}>
        <p style={{ fontSize: '72px', fontWeight: 900, color: 'var(--border-hover, #CBD5E1)', margin: 0, lineHeight: 1 }}>404</p>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: '12px 0 6px 0' }}>Page not found</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          The page you are looking for does not exist or has been moved to another location.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <Button variant="primary" style={{ width: '100%' }}>Return to Dashboard</Button>
          </Link>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" style={{ width: '100%' }}>Go to Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
