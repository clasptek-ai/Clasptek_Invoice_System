/**
 * loading.tsx — Global Page Loading Skeleton
 * Phase 2 & 9G: Genuine Clasptek Visual Shell Styling
 */

export default function GlobalLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--neutral-bg, #F8FAFC)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <span className="cp-spinner cp-spinner-lg" aria-hidden="true" />
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', fontWeight: 600, margin: 0 }}>
          Loading Clasptek Portal…
        </p>
      </div>
    </div>
  );
}
