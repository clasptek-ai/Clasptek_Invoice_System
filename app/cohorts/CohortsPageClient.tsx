/**
 * app/cohorts/CohortsPageClient.tsx — Phase 4
 * Client Component for Cohorts & Schedules.
 * Extended with multi-row selection, bulk status transitions, and safe lifecycle dialogs.
 */

'use client';

import React, { useState, useCallback, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Cohort, Programme } from '@/types/academics';
import { CohortKpiStrip } from '@/components/cohorts/CohortKpiStrip';
import { CohortFilters } from '@/components/cohorts/CohortFilters';
import { CohortTable } from '@/components/cohorts/CohortTable';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import { AddCohortModal } from '@/components/cohorts/AddCohortModal';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface FacilitatorOption {
  id: string;
  fullName?: string;
  name?: string;
  employeeId?: string;
  jobTitle?: string;
}

interface CohortsPageClientProps {
  initialCohorts: Cohort[];
  programmes: Programme[];
  facilitators?: FacilitatorOption[];
  currentSearch: string;
  currentProg: string;
  currentStatus: string;
}

export function CohortsPageClient({
  initialCohorts,
  programmes,
  facilitators = [],
  currentSearch,
  currentProg,
  currentStatus,
}: CohortsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [cohorts, setCohorts] = useState<Cohort[]>(initialCohorts);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAddCohortOpen, setIsAddCohortOpen] = useState<boolean>(false);

  // Table sorting state
  const [sortField, setSortField] = useState<string>('start_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortField(field);
  }, [sortField]);

  const sortedCohorts = useMemo(() => {
    const list = [...cohorts];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'cohort_code') {
        cmp = (a.cohort_code || '').localeCompare(b.cohort_code || '');
      } else if (sortField === 'programme_name') {
        cmp = (a.programme_name || '').localeCompare(b.programme_name || '');
      } else if (sortField === 'delivery_mode') {
        cmp = (a.delivery_mode || '').localeCompare(b.delivery_mode || '');
      } else if (sortField === 'facilitator') {
        cmp = (a.lead_facilitator_name || '').localeCompare(b.lead_facilitator_name || '');
      } else if (sortField === 'capacity') {
        cmp = Number(a.capacity || 0) - Number(b.capacity || 0);
      } else if (sortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      } else {
        const dateA = a.start_date || a.created_at || '';
        const dateB = b.start_date || b.created_at || '';
        cmp = dateA.localeCompare(dateB);
      }
      if (cmp !== 0) {
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return (b.cohort_code || '').localeCompare(a.cohort_code || '');
    });
    return list;
  }, [cohorts, sortField, sortOrder]);

  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    cohortIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'CANCEL',
    cohortIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleCohortCreated = useCallback(
    (newCohort: Cohort) => {
      setCohorts((prev) => [newCohort, ...prev]);
      notify('success', `Cohort ${newCohort.cohort_code} successfully created.`);
      startTransition(() => router.refresh());
    },
    [router]
  );

  const handleFilterUpdate = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      startTransition(() => router.push(`/cohorts?${params.toString()}`));
    },
    [router, searchParams]
  );

  // Multi-row selection
  const visibleIds = cohorts.map((c) => c.id);
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
    async (status: string) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);
      try {
        const res = await fetch('/api/admissions/cohorts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'UPDATE_STATUS', cohortIds: ids, status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update cohort status');

        setCohorts((prev) =>
          prev.map((c) => (selectedIds.has(c.id) ? { ...c, status: status as any } : c))
        );
        setSelectedIds(new Set());
        notify('success', data.message || `Updated ${ids.length} cohort(s).`);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Status update failed.');
      }
    },
    [selectedIds]
  );

  const handleOpenCloseCohort = useCallback(async (ids: string[], targetName?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'CANCEL',
      cohortIds: ids,
      recordIdentifier: targetName || `${ids.length} selected cohort(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: true,
    });

    try {
      const res = await fetch('/api/admissions/cohorts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK_DEPENDENCIES', cohortIds: ids }),
      });
      const data = await res.json();
      if (data.ok && data.reports) {
        const reports = data.reports;
        let totalEnrolments = 0;
        reports.forEach((r: { dependencies?: { count?: number; label?: string }[] }) => {
          r.dependencies?.forEach((d) => {
            if (d.label === 'Enrolled Students') totalEnrolments += d.count || 0;
          });
        });

        const depItems: RecordDependencyItem[] = [];
        if (totalEnrolments > 0) depItems.push({ label: 'Enrolled Students', count: totalEnrolments });

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

  const handleConfirmLifecycleAction = useCallback(async () => {
    const { cohortIds } = lifecycleModal;
    if (cohortIds.length === 0) return;

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/admissions/cohorts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLOSE', cohortIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Closure failed');

      setCohorts((prev) =>
        prev.map((c) => (cohortIds.includes(c.id) ? { ...c, status: 'COMPLETED' as any } : c))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        cohortIds.forEach((id) => next.delete(id));
        return next;
      });
      notify('success', data.message || 'Cohort(s) successfully marked as COMPLETED.');
      setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Action failed.');
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  }, [lifecycleModal]);

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
            <span aria-hidden="true">📅</span> Cohorts &amp; Schedules
          </h1>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
            Authoritative cohort scheduling, seat capacity management, assigned lead facilitators, and training progression.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <a
            href="/attendance"
            className="cp-btn sm secondary"
            id="btnScheduleTrainingSessionMain"
            style={{ fontWeight: 600, textDecoration: 'none' }}
          >
            Attendance &amp; Sessions
          </a>
          <button
            type="button"
            className="cp-btn sm primary"
            id="btnAddNewCohortBtn"
            onClick={() => setIsAddCohortOpen(true)}
            style={{ fontWeight: 700 }}
          >
            + Add New Cohort
          </button>
        </div>
      </div>

      {/* Top KPI Grid */}
      <CohortKpiStrip cohorts={cohorts} />

      {/* Main Table Card */}
      <div className="cp-card">
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '16px', fontWeight: 800 }}>
              📋 Training Cohort Schedule
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Manage intake timelines, track capacity thresholds, and launch attendance registers.
            </div>
          </div>

          {/* Filter Controls */}
          <CohortFilters
            currentSearch={currentSearch}
            currentProg={currentProg}
            currentStatus={currentStatus}
            programmes={programmes}
            onSearchChange={(val) => handleFilterUpdate('search', val)}
            onProgChange={(val) => handleFilterUpdate('prog', val)}
            onStatusChange={(val) => handleFilterUpdate('status', val)}
          />
        </div>

        {/* Universal Selection Toolbar */}
        <div style={{ padding: '0 16px' }}>
          <TableSelectionBar
            selectedCount={selectedIds.size}
            totalVisibleCount={visibleIds.length}
            entityLabel="cohort"
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
                <option value="PLANNING">Mark as PLANNING</option>
                <option value="UPCOMING">Mark as UPCOMING</option>
                <option value="IN_PROGRESS">Mark as IN_PROGRESS</option>
                <option value="COMPLETED">Mark as COMPLETED</option>
                <option value="CANCELLED">Mark as CANCELLED</option>
              </select>

              <button
                type="button"
                onClick={() => handleOpenCloseCohort(Array.from(selectedIds))}
                className="cp-btn sm secondary"
                style={{ fontSize: '12px', padding: '4px 8px', color: '#DC2626' }}
              >
                🛑 Close Selected
              </button>
            </div>
          </TableSelectionBar>
        </div>

        {/* Cohort Table */}
        <CohortTable
          cohorts={sortedCohorts}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onCloseCohort={(c) => handleOpenCloseCohort([c.id], `${c.cohort_code} (${c.name})`)}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      </div>

      {/* Safe Closure Dialog */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Training Cohort"
        recordIdentifier={lifecycleModal.recordIdentifier}
        recordCount={lifecycleModal.cohortIds.length}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmLifecycleAction}
      />

      {/* Internal Cohort Creation Modal */}
      <AddCohortModal
        isOpen={isAddCohortOpen}
        programmes={programmes}
        facilitators={facilitators}
        onClose={() => setIsAddCohortOpen(false)}
        onCohortCreated={handleCohortCreated}
      />
    </div>
  );
}
