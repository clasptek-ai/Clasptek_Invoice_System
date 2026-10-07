/**
 * app/enrolments/EnrolmentsPageClient.tsx — Phase 4
 * Client Component for Course Enrolments.
 * Extended with multi-row selection, bulk status changes, and referential-checked withdrawal dialog.
 */

'use client';

import React, { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Enrolment, Cohort } from '@/types/academics';
import { EnrolmentKpiStrip } from '@/components/enrolments/EnrolmentKpiStrip';
import { EnrolmentFilters } from '@/components/enrolments/EnrolmentFilters';
import { EnrolmentTable } from '@/components/enrolments/EnrolmentTable';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface EnrolmentsPageClientProps {
  initialEnrolments: Enrolment[];
  totalCount: number;
  initialError?: string | null;
  cohorts: Cohort[];
  currentSearch: string;
  currentCohort: string;
  currentStatus: string;
  currentPage: number;
  pageSize: number;
  currentSortBy?: string;
  currentSortOrder?: 'asc' | 'desc';
}

export function EnrolmentsPageClient({
  initialEnrolments,
  totalCount,
  initialError,
  cohorts,
  currentSearch,
  currentCohort,
  currentStatus,
  currentPage,
  pageSize,
  currentSortBy = 'enrolment_date',
  currentSortOrder = 'desc',
}: EnrolmentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [enrolments, setEnrolments] = useState<Enrolment[]>(initialEnrolments);

  useEffect(() => {
    setEnrolments(initialEnrolments);
  }, [initialEnrolments]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSort = useCallback(
    (field: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextOrder = currentSortBy === field ? (currentSortOrder === 'asc' ? 'desc' : 'asc') : 'asc';
      params.set('sortBy', field);
      params.set('order', nextOrder);
      params.delete('page');
      setSelectedIds(new Set());
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams, currentSortBy, currentSortOrder]
  );

  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    enrolmentIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'CANCEL',
    enrolmentIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(newPage));
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', String(newPageSize));
      params.delete('page');
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleFilterUpdate = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      startTransition(() => router.push(`/enrolments?${params.toString()}`));
    },
    [router, searchParams]
  );

  // Multi-row selection
  const visibleIds = enrolments.map((e) => e.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  }, [isAllSelected, visibleIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkStatusChange = useCallback(
    async (newStatus: string) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);
      try {
        const res = await fetch('/api/enrolments/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'UPDATE_STATUS', enrolmentIds: ids, status: newStatus }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update enrolment status');

        setEnrolments((prev) =>
          prev.map((e) => (selectedIds.has(e.id) ? { ...e, status: newStatus as any } : e))
        );
        setSelectedIds(new Set());
        notify('success', data.message || `Updated ${ids.length} enrolments.`);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Status update failed.');
      }
    },
    [selectedIds]
  );

  const handleOpenWithdraw = useCallback(async (ids: string[], targetName?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'CANCEL',
      enrolmentIds: ids,
      recordIdentifier: targetName || `${ids.length} selected enrolment(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: true,
    });

    try {
      const res = await fetch('/api/enrolments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK_DEPENDENCIES', enrolmentIds: ids }),
      });
      const data = await res.json();
      if (data.ok && data.reports) {
        const reports = data.reports;
        let totalCerts = 0;
        let totalAtt = 0;
        reports.forEach((r: { dependencies?: { count?: number; label?: string }[] }) => {
          r.dependencies?.forEach((d) => {
            if (d.label === 'Issued Certificate') totalCerts += d.count || 0;
            if (d.label === 'Attendance Records') totalAtt += d.count || 0;
          });
        });

        const depItems: RecordDependencyItem[] = [];
        if (totalCerts > 0) depItems.push({ label: 'Issued Certificates', count: totalCerts });
        if (totalAtt > 0) depItems.push({ label: 'Attendance Records', count: totalAtt });

        setLifecycleModal((prev) => ({
          ...prev,
          isLoading: false,
          dependencies: depItems,
        }));
      }
    } catch {
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const handleConfirmLifecycleAction = useCallback(
    async (reason: string) => {
      const { enrolmentIds } = lifecycleModal;
      if (enrolmentIds.length === 0) return;

      setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
      try {
        const res = await fetch('/api/enrolments/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'WITHDRAW', enrolmentIds, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Withdrawal failed');

        setEnrolments((prev) =>
          prev.map((e) => (enrolmentIds.includes(e.id) ? { ...e, status: 'WITHDRAWN' as any } : e))
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          enrolmentIds.forEach((id) => next.delete(id));
          return next;
        });
        notify('success', data.message || 'Enrolment(s) successfully withdrawn.');
        setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Action failed.');
        setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [lifecycleModal]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toast Feedback */}
      {feedback && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: '14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            background: feedback.type === 'success' ? '#DEF7EC' : '#FDE8E8',
            color: feedback.type === 'success' ? '#03543F' : '#9B1C1C',
            border: `1px solid ${feedback.type === 'success' ? '#84E1BC' : '#F8B4B4'}`,
          }}
        >
          {feedback.text}
        </div>
      )}

      {initialError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #F87171',
            borderRadius: '8px',
            color: '#991B1B',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden="true">⚠️</span>
          <div>
            <div style={{ fontWeight: 700 }}>Database Query Error</div>
            <div style={{ marginTop: '2px', fontFamily: 'monospace', fontSize: '12px', color: '#7F1D1D' }}>
              {initialError}
            </div>
          </div>
        </div>
      )}

      {/* Header with Action — Exact Legacy Styling */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--primary, #0F172A)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span aria-hidden="true">📝</span> Course Enrollments
          </h1>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
            Comprehensive enrolment lifecycle management, immutable agreed tuition snapshots, and academic status tracking.
          </div>
        </div>
        <a
          href="/students"
          className="cp-btn sm primary"
          id="btnNewEnrolmentBtn"
          style={{ fontWeight: 700, textDecoration: 'none' }}
        >
          + Enrol New Student
        </a>
      </div>

      {/* Top KPI Grid */}
      <EnrolmentKpiStrip enrolments={enrolments} totalCount={totalCount} />

      {/* Universal Selection Toolbar */}
      <TableSelectionBar
        selectedCount={selectedIds.size}
        totalVisibleCount={visibleIds.length}
        entityLabel="enrolment"
        onClearSelection={handleClearSelection}
        onSelectAllVisible={handleToggleSelectAll}
        isAllSelected={isAllSelected}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleBulkStatusChange(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="cp-btn sm secondary"
            style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', background: '#FFFFFF' }}
          >
            <option value="" disabled>Set Status...</option>
            <option value="ACTIVE">Mark as ACTIVE</option>
            <option value="COMPLETED">Mark as COMPLETED</option>
            <option value="WITHDRAWN">Mark as WITHDRAWN</option>
            <option value="CANCELLED">Mark as CANCELLED</option>
          </select>
          <button
            type="button"
            onClick={() => handleOpenWithdraw(Array.from(selectedIds))}
            className="cp-btn sm cp-btn-danger"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🛑 Withdraw Selected
          </button>
        </div>
      </TableSelectionBar>

      {/* Main Table Card */}
      <div className="cp-card">
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 800 }}>
              📋 Course Enrollment Register
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Track status transitions, fee snapshots, attendance rates, and credentials.
            </div>
          </div>

          {/* Filter Controls */}
          <EnrolmentFilters
            currentSearch={currentSearch}
            currentCohort={currentCohort}
            currentStatus={currentStatus}
            cohorts={cohorts}
            onSearchChange={(val) => handleFilterUpdate('search', val)}
            onCohortChange={(val) => handleFilterUpdate('cohort', val)}
            onStatusChange={(val) => handleFilterUpdate('status', val)}
          />
        </div>

        {/* Register Table */}
        <EnrolmentTable
          enrolments={enrolments}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onEditStatus={(en) => {
            const nextStatus = en.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
            handleBulkStatusChange(nextStatus);
          }}
          onWithdrawEnrolment={(en) => handleOpenWithdraw([en.id], `${en.enrolment_number} (${en.student_name})`)}
          sortField={currentSortBy}
          sortOrder={currentSortOrder}
          onSort={handleSort}
        />

        {/* Standard Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          entityLabel="enrolments"
        />
      </div>

      {/* Safe Lifecycle Dialog */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Course Enrolment"
        recordIdentifier={lifecycleModal.recordIdentifier}
        recordCount={lifecycleModal.enrolmentIds.length}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmLifecycleAction}
      />
    </div>
  );
}
