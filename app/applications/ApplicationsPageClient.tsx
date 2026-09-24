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
      {/* Page Header — Exact Legacy Clasptek Styling */}
      <div className="cp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="cp-page-title" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #C1272D)' }} aria-hidden="true">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Candidate Applications
          </h1>
          <p className="cp-page-subtitle" style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '4px', margin: 0 }}>
            Authoritative candidate admissions pipeline and intake queue. Review, screen, and admit applicants into training programmes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <a
            href="/apply"
            target="_blank"
            rel="noopener noreferrer"
            className="cp-btn secondary"
            id="btnOpenApplicantPortal"
            style={{ fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Applicant Portal
          </a>
          <a
            href="/apply"
            className="cp-btn primary"
            id="btnEnterStaffApplication"
            style={{ fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            + New Application
          </a>
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div role="alert" className="cp-alert error">
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
