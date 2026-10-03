/**
 * app/programmes/ProgrammesPageClient.tsx — Phase 4
 * Client Component for Clasptek Academic Programmes.
 * Extended with multi-row selection, bulk activation/deactivation, and safe lifecycle dialogs.
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { Programme } from '@/types/academics';
import { ProgrammeTable } from '@/components/programmes/ProgrammeTable';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface ProgrammesPageClientProps {
  initialProgrammes: Programme[];
}

export function ProgrammesPageClient({ initialProgrammes }: ProgrammesPageClientProps) {
  const [programmes, setProgrammes] = useState<Programme[]>(initialProgrammes);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    programmeIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'DEACTIVATE',
    programmeIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const visibleIds = programmes.map((p) => p.id);
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
        const res = await fetch('/api/admissions/programmes/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'UPDATE_STATUS', programmeIds: ids, status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status update failed');

        setProgrammes((prev) =>
          prev.map((p) => (selectedIds.has(p.id) ? { ...p, status: status as any } : p))
        );
        setSelectedIds(new Set());
        notify('success', data.message || `Updated ${ids.length} programme(s).`);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Status update failed.');
      }
    },
    [selectedIds]
  );

  const handleOpenDeactivate = useCallback(async (ids: string[], targetName?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'DEACTIVATE',
      programmeIds: ids,
      recordIdentifier: targetName || `${ids.length} selected programme(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: true,
    });

    try {
      const res = await fetch('/api/admissions/programmes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK_DEPENDENCIES', programmeIds: ids }),
      });
      const data = await res.json();
      if (data.ok && data.reports) {
        const reports = data.reports;
        let totalCohorts = 0;
        let totalEnrolments = 0;
        reports.forEach((r: { dependencies?: { count?: number; label?: string }[] }) => {
          r.dependencies?.forEach((d) => {
            if (d.label === 'Cohorts') totalCohorts += d.count || 0;
            if (d.label === 'Student Enrolments') totalEnrolments += d.count || 0;
          });
        });

        const depItems: RecordDependencyItem[] = [];
        if (totalCohorts > 0) depItems.push({ label: 'Active Cohorts', count: totalCohorts });
        if (totalEnrolments > 0) depItems.push({ label: 'Student Enrolments', count: totalEnrolments });

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
    const { programmeIds } = lifecycleModal;
    if (programmeIds.length === 0) return;

    setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/admissions/programmes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DEACTIVATE', programmeIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deactivation failed');

      setProgrammes((prev) =>
        prev.map((p) => (programmeIds.includes(p.id) ? { ...p, status: 'archived' } : p))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        programmeIds.forEach((id) => next.delete(id));
        return next;
      });
      notify('success', data.message || 'Programme(s) deactivated.');
      setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Action failed.');
      setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
    }
  }, [lifecycleModal]);

  const handleExportCSV = () => {
    const headers = ['Code', 'ProgrammeName', 'Category', 'TuitionFee', 'DurationWeeks', 'Status'];
    const rows = programmes.map((p) => [
      p.code || p.id,
      p.name,
      p.metadata?.category || 'Academic',
      p.tuition_fee,
      p.duration_weeks || '',
      p.status || 'active',
    ]);
    downloadSafeCsv('clasptek-programmes', headers, rows);
  };

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

      <div className="cp-card" style={{ marginBottom: '24px' }}>
        <div className="cp-card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div
              className="cp-section-title"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span aria-hidden="true">🎓</span> Clasptek Academic Programmes
            </div>
            <div
              className="cp-section-desc"
              style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '3px' }}
            >
              Official curriculum programs, tuition structures, and training catalog.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="cp-btn sm secondary"
              style={{ fontWeight: 600 }}
            >
              Export CSV
            </button>
            <a
              href="/apply"
              className="cp-btn sm primary"
              id="btnAddProgBtn"
              style={{ fontWeight: 700, textDecoration: 'none' }}
            >
              + Add New Programme
            </a>
          </div>
        </div>

        {/* Universal Selection Toolbar */}
        <div style={{ padding: '0 16px' }}>
          <TableSelectionBar
            selectedCount={selectedIds.size}
            totalVisibleCount={visibleIds.length}
            entityLabel="programme"
            onClearSelection={handleClearSelection}
            onSelectAllVisible={handleToggleSelectAll}
            isAllSelected={isAllSelected}
          >
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleBulkStatusChange('active')}
                className="cp-btn sm secondary"
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                Activate Selected
              </button>
              <button
                type="button"
                onClick={() => handleOpenDeactivate(Array.from(selectedIds))}
                className="cp-btn sm secondary"
                style={{ fontSize: '12px', padding: '4px 8px', color: '#DC2626' }}
              >
                🛑 Deactivate Selected
              </button>
            </div>
          </TableSelectionBar>
        </div>

        {/* Programmes Catalogue Table */}
        <ProgrammeTable
          programmes={programmes}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          onDeactivateProgramme={(p) => handleOpenDeactivate([p.id], `${p.code} (${p.name})`)}
        />
      </div>

      {/* Safe Deactivation & Dependency Verification Dialog */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Academic Programme"
        recordIdentifier={lifecycleModal.recordIdentifier}
        recordCount={lifecycleModal.programmeIds.length}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmLifecycleAction}
      />
    </div>
  );
}
