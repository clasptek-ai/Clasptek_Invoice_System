import Link from 'next/link';
import { Button } from '@/components/ui/Button';

/**
 * not-found.tsx — 404 Page
 * Phase 2: Next.js Foundation
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 404 */}
        <div className="space-y-1">
          <p className="text-8xl font-extrabold text-[var(--border)] select-none">404</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Page not found</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button variant="primary">Return to Dashboard</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Go to Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
