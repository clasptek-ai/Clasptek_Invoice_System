/**
 * app/enquiries/EnquiriesPageClient.tsx — Phase 3
 * Client-side orchestrator for the Enquiries CRM page.
 * Owns selected enquiry state, optimistic status updates, and pagination.
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Enquiry, EnquiryStatus } from '@/types/admissions';
import { EnquirySummaryStrip } from '@/components/admissions/EnquirySummaryStrip';
import { EnquiryFilters } from '@/components/admissions/EnquiryFilters';
import { EnquiryTable } from '@/components/admissions/EnquiryTable';
import { EnquiryDrawer } from '@/components/admissions/EnquiryDrawer';

interface EnquiriesPageClientProps {
  initialEnquiries: Enquiry[];
  totalCount: number;
  currentSearch: string;
  currentStatus: string;
  currentPage: number;
}

const PAGE_SIZE = 25;

export function EnquiriesPageClient({
  initialEnquiries,
  totalCount,
  currentSearch,
  currentStatus,
  currentPage,
}: EnquiriesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic local state — updated immediately on status change
  const [enquiries, setEnquiries] = useState<Enquiry[]>(initialEnquiries);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      {/* Page Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Enquiries & Leads</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage prospect interactions, programme interest, and lead progression.
        </p>
      </div>

      {/* Global action error */}
      {actionError && (
        <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* KPI Strip */}
      <EnquirySummaryStrip enquiries={enquiries} onStatusFilter={handleStatusFilter} />

      {/* Filters */}
      <EnquiryFilters currentSearch={currentSearch} currentStatus={currentStatus} />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex-1">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {totalCount === 0
              ? 'No enquiries'
              : `${totalCount} enquir${totalCount === 1 ? 'y' : 'ies'}`}
          </span>
          <span className="text-xs text-gray-400">
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>
        </div>
        <div className="p-4">
          <EnquiryTable enquiries={enquiries} onSelect={setSelectedEnquiry} />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
    </div>
  );
}
