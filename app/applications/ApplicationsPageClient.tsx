/**
 * app/applications/ApplicationsPageClient.tsx — Phase 3
 * Client-side orchestrator for the CRM Intake Applications page.
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  IntakeApplication,
  ApplicationStatus,
  ProgrammeOption,
  ConversionResult,
} from '@/types/admissions';
import { ApplicationKpiStrip } from '@/components/admissions/ApplicationKpiStrip';
import { ApplicationFilters } from '@/components/admissions/ApplicationFilters';
import { ApplicationTable } from '@/components/admissions/ApplicationTable';
import { ApplicationDrawer } from '@/components/admissions/ApplicationDrawer';

interface ApplicationsPageClientProps {
  initialApplications: IntakeApplication[];
  totalCount: number;
  statusCounts: Record<string, number>;
  programmes: ProgrammeOption[];
  currentSearch: string;
  currentStatus: string;
  currentProgramme: string;
  currentSource: string;
  currentPage: number;
}

export function ApplicationsPageClient({
  initialApplications,
  totalCount,
  statusCounts,
  programmes,
  currentSearch,
  currentStatus,
  currentProgramme,
  currentSource,
  currentPage,
}: ApplicationsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [applications, setApplications] = useState<IntakeApplication[]>(initialApplications);
  const [selectedApplication, setSelectedApplication] = useState<IntakeApplication | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatusFilter = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status && status !== 'ALL') {
        params.set('status', status);
      } else {
        params.delete('status');
      }
      params.delete('page');
      startTransition(() => router.push(`/applications?${params.toString()}`));
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
      startTransition(() => router.push(`/applications?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleStatusChange = useCallback(
    async (applicationId: string, newStatus: ApplicationStatus) => {
      setActionError(null);
      // Optimistic update
      setApplications((prev) =>
        prev.map((a) =>
          a.id === applicationId
            ? { ...a, status: newStatus, updated_at: new Date().toISOString() }
            : a
        )
      );
      if (selectedApplication?.id === applicationId) {
        setSelectedApplication((prev) =>
          prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : prev
        );
      }

      try {
        const res = await fetch(`/api/admissions/applications/${applicationId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? 'Status update failed');
        }
      } catch (err) {
        // Rollback
        setApplications(initialApplications);
        setActionError(err instanceof Error ? err.message : 'Failed to update status.');
        throw err;
      }
    },
    [initialApplications, selectedApplication]
  );

  const handleConverted = useCallback(
    (result: ConversionResult) => {
      setApplications((prev) =>
        prev.map((a) =>
          a.id === result.application_id
            ? {
                ...a,
                status: 'CONVERTED',
                matched_student_id: result.student_id,
                enrolment_id: result.enrolment_id,
                updated_at: new Date().toISOString(),
              }
            : a
        )
      );
      if (selectedApplication?.id === result.application_id) {
        setSelectedApplication((prev) =>
          prev
            ? {
                ...prev,
                status: 'CONVERTED',
                matched_student_id: result.student_id,
                enrolment_id: result.enrolment_id,
                updated_at: new Date().toISOString(),
              }
            : prev
        );
      }
    },
    [selectedApplication]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Intake Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review admissions submissions, manage verification workflows, and execute student conversions.
          </p>
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* KPI Strip */}
      <ApplicationKpiStrip
        applications={applications}
        totalCount={totalCount}
        statusCounts={statusCounts}
        activeStatus={currentStatus}
        onStatusFilter={handleStatusFilter}
      />

      {/* Filters */}
      <ApplicationFilters
        currentSearch={currentSearch}
        currentStatus={currentStatus}
        currentProgramme={currentProgramme}
        currentSource={currentSource}
        programmes={programmes}
      />

      {/* Table */}
      <ApplicationTable
        applications={applications}
        totalCount={totalCount}
        currentPage={currentPage}
        selectedId={selectedApplication?.id}
        onSelect={(app) => setSelectedApplication(app)}
        onPageChange={handlePageChange}
      />

      {/* Detail Drawer */}
      <ApplicationDrawer
        application={selectedApplication}
        onClose={() => setSelectedApplication(null)}
        onStatusChange={handleStatusChange}
        onConverted={handleConverted}
      />
    </div>
  );
}
