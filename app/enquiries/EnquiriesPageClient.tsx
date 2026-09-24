/**
 * app/enquiries/EnquiriesPageClient.tsx — Phase 3
 * Client-side orchestrator for the Enquiries CRM page.
 * Owns selected enquiry state, optimistic status updates, and pagination.
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Enquiry, EnquiryStatus, ProgrammeOption } from '@/types/admissions';
import { EnquirySummaryStrip } from '@/components/admissions/EnquirySummaryStrip';
import { EnquiryFilters } from '@/components/admissions/EnquiryFilters';
import { EnquiryTable } from '@/components/admissions/EnquiryTable';
import { EnquiryDrawer } from '@/components/admissions/EnquiryDrawer';
import { NewEnquiryModal } from '@/components/admissions/NewEnquiryModal';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface EnquiriesPageClientProps {
  initialEnquiries: Enquiry[];
  totalCount: number;
  currentSearch: string;
  currentStatus: string;
  currentPage: number;
  programmes?: ProgrammeOption[];
  initialOpenNew?: boolean;
  staffName?: string;
}

const PAGE_SIZE = 25;

export function EnquiriesPageClient({
  initialEnquiries,
  totalCount,
  currentSearch,
  currentStatus,
  currentPage,
  programmes = [],
  initialOpenNew = false,
  staffName = 'Admissions',
}: EnquiriesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic local state — updated immediately on status change
  const [enquiries, setEnquiries] = useState<Enquiry[]>(initialEnquiries);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(initialOpenNew);

  const handleEnquiryCreated = useCallback((newEnq: Enquiry) => {
    setEnquiries((prev) => [newEnq, ...prev]);
  }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Keep enquiries in sync if server re-renders with new data
  // (React will reconcile with the new props on navigation)
  const handleStatusFilter = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status && status !== 'all') {
        params.set('status', status);
      } else {
        params.delete('status');
      }
      params.delete('page');
      startTransition(() => router.push(`/enquiries?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page > 1) {
        params.set('page', String(page));
      } else {
        params.delete('page');
      }
      startTransition(() => router.push(`/enquiries?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleStatusChange = useCallback(
    async (enquiryId: string, newStatus: EnquiryStatus) => {
      setActionError(null);
      // Optimistic update
      setEnquiries((prev) =>
        prev.map((e) => (e.id === enquiryId ? { ...e, status: newStatus, updated_at: new Date().toISOString() } : e))
      );
      if (selectedEnquiry?.id === enquiryId) {
        setSelectedEnquiry((prev) => prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : prev);
      }

      try {
        const res = await fetch(`/api/admissions/enquiries/${enquiryId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? 'Status update failed');
        }
      } catch (err) {
        // Rollback optimistic update
        setEnquiries(initialEnquiries);
        setActionError(err instanceof Error ? err.message : 'Failed to update status.');
        throw err; // re-throw so drawer can show error
      }
    },
    [initialEnquiries, selectedEnquiry]
  );

  const handleNoteAppend = useCallback(
    async (enquiryId: string, note: string, newStatus: EnquiryStatus | null) => {
      setActionError(null);
      try {
        const res = await fetch(`/api/admissions/enquiries/${enquiryId}/note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, status: newStatus }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? 'Save failed');
        }
        // Optimistic local update after success
        if (newStatus) {
          setEnquiries((prev) =>
            prev.map((e) =>
              e.id === enquiryId ? { ...e, status: newStatus, updated_at: new Date().toISOString() } : e
            )
          );
          if (selectedEnquiry?.id === enquiryId) {
            setSelectedEnquiry((prev) =>
              prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : prev
            );
          }
        }
      } catch (err) {
        throw err;
      }
    },
    [selectedEnquiry]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page Header — Exact Legacy Clasptek Styling */}
      <div className="cp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="cp-page-title" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #C1272D)' }} aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Enquiries &amp; Leads Directory
          </h1>
          <p className="cp-page-subtitle" style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '4px', margin: 0 }}>
            Manage prospect interactions, programme requests, billing triggers, and lead progression.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="cp-btn secondary"
            id="btnExportEnquiries"
            onClick={() => {
              // CSV Export of current enquiries
              const headers = ['Name', 'Email', 'Phone', 'Programme', 'Source', 'Status', 'Date'];
              const rows = enquiries.map((e) => [
                e.student_name,
                e.email || '',
                e.phone || '',
                e.programme_name || '',
                e.source,
                e.status,
                e.created_at || '',
              ]);
              downloadSafeCsv('clasptek-enquiries', headers, rows);
            }}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="cp-btn primary"
            id="btnNewEnquiryBtn"
            style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            + Log Enquiry
          </button>
        </div>
      </div>

      {/* Global action error */}
      {actionError && (
        <div role="alert" className="cp-alert error">
          {actionError}
        </div>
      )}

      {/* KPI Strip */}
      <EnquirySummaryStrip enquiries={enquiries} onStatusFilter={handleStatusFilter} />

      {/* Filters */}
      <EnquiryFilters currentSearch={currentSearch} currentStatus={currentStatus} />

      {/* Table Container */}
      <div className="cp-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalCount === 0
              ? 'No enquiries'
              : `${totalCount} enquir${totalCount === 1 ? 'y' : 'ies'}`}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>
        </div>
        <div style={{ padding: '12px' }}>
          <EnquiryTable enquiries={enquiries} onSelect={setSelectedEnquiry} />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="cp-btn sm secondary"
              aria-label="Previous page"
            >
              ← Previous
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="cp-btn sm secondary"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Enquiry Drawer */}
      <EnquiryDrawer
        enquiry={selectedEnquiry}
        onClose={() => setSelectedEnquiry(null)}
        onStatusChange={handleStatusChange}
        onNoteAppend={handleNoteAppend}
      />

      {/* New Enquiry Modal */}
      <NewEnquiryModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        programmes={programmes}
        existingEnquiries={enquiries}
        assignedStaffName={staffName}
        onEnquiryCreated={handleEnquiryCreated}
      />
    </div>
  );
}
