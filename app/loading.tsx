/**
 * loading.tsx — Global Page Loading Skeleton
 * Phase 2: Next.js Foundation
 */

export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-1)]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-4 border-[var(--border)] border-t-[var(--interactive)] animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--text-tertiary)] font-medium animate-pulse">
          Loading Clasptek Portal…
        </p>
      </div>
    </div>
  );
}
