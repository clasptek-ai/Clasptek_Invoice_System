/**
 * app/students/StudentsPageClient.tsx — Phase 4
 * Client Component orchestrator for the Student & Client Directory.
 * Features:
 * - Multi-criteria filtering (Search, Programme, Enrolment Status, Financial Status, Training Status)
 * - Row selection & batch actions (Individual, Select All, Clear Selection, Selected Count)
 * - Protected record deletion with dependency analysis modal
 * - Responsive table and mobile card stack
 */

'use client';

import React, { useState, useCallback, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { StudentSummary, StudentDossier } from '@/types/students';
import type { ProgrammeOption } from '@/types/admissions';
import { StudentTable } from '@/components/students/StudentTable';
import { StudentFilters } from '@/components/students/StudentFilters';
import { StudentDrawer } from '@/components/students/StudentDrawer';
import { StudentRegistrationModal } from '@/components/students/StudentRegistrationModal';
import { StudentDeleteModal } from '@/components/students/StudentDeleteModal';
import { Pagination } from '@/components/tables/Pagination';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface StudentsPageClientProps {
  initialStudents: StudentSummary[];
  totalCount: number;
  currentSearch: string;
  currentStatus: string;
  currentProgrammeId?: string;
  currentEnrolmentStatus?: string;
  currentFinancialStatus?: string;
  programmes?: ProgrammeOption[];
  currentPage: number;
  pageSize: number;
  currentUserRole?: string;
}

export function StudentsPageClient({
  initialStudents,
  totalCount,
  currentSearch,
  currentStatus,
  currentProgrammeId = 'ALL',
  currentEnrolmentStatus = 'ALL',
  currentFinancialStatus = 'ALL',
  programmes = [],
  currentPage,
  pageSize,
  currentUserRole = 'Staff',
}: StudentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState<boolean>(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);

  // Selection & Deletion State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  const canDelete = ['Super Admin', 'Staff'].includes(currentUserRole);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'ALL') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      setSelectedIds(new Set());
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(newPage));
      setSelectedIds(new Set());
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', String(newPageSize));
      params.delete('page');
      setSelectedIds(new Set());
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleSearchChange = useCallback(
    (search: string) => updateParam('search', search.trim() ? search.trim() : null),
    [updateParam]
  );

  const handleStatusChange = useCallback(
    (status: string) => updateParam('status', status),
    [updateParam]
  );

  const handleProgrammeChange = useCallback(
    (progId: string) => updateParam('programmeId', progId),
    [updateParam]
  );

  const handleEnrolmentStatusChange = useCallback(
    (enrStatus: string) => updateParam('enrolmentStatus', enrStatus),
    [updateParam]
  );

  const handleFinancialStatusChange = useCallback(
    (finStatus: string) => updateParam('financialStatus', finStatus),
    [updateParam]
  );

  const handleClearFilters = useCallback(() => {
    setSelectedIds(new Set());
    startTransition(() => router.push('/students'));
  }, [router]);

  // Selection handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleIds = useMemo(() => initialStudents.map((s) => s.id), [initialStudents]);

  const isAllSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id)),
    [visibleIds, selectedIds]
  );

  const isIndeterminate = useMemo(() => {
    const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
    return selectedCount > 0 && selectedCount < visibleIds.length;
  }, [visibleIds, selectedIds]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [isAllSelected, visibleIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleOpenBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteTargetIds(Array.from(selectedIds));
    setIsDeleteModalOpen(true);
  }, [selectedIds]);

  const handleOpenSingleDelete = useCallback((studentId: string) => {
    setDeleteTargetIds([studentId]);
    setIsDeleteModalOpen(true);
  }, []);

  const handleOpenProfile = useCallback(async (studentId: string) => {
    setSelectedStudentId(studentId);
    setIsLoadingDossier(true);
    try {
      const res = await fetch(`/api/students/${studentId}/dossier`);
      if (res.ok) {
        const json = await res.json();
        setDossier(json.dossier);
      } else {
        console.error('Failed to load student dossier');
      }
    } catch (err) {
      console.error('Error fetching student dossier:', err);
    } finally {
      setIsLoadingDossier(false);
    }
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedStudentId(null);
    setDossier(null);
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = [
      'StudentID',
      'Name',
      'Phone',
      'Email',
      'Programmes',
      'Invoiced',
      'Paid',
      'Balance',
      'FinancialStatus',
      'TrainingStatus',
    ];
    const rows = initialStudents.map((s) => [
      s.student_number || '',
      s.name,
      s.phone || '',
      s.email || '',
      s.programmes_list,
      s.total_invoiced,
      s.total_paid,
      s.balance,
      s.status_display,
      s.training_status,
    ]);

    downloadSafeCsv('Student_Directory', headers, rows);
  }, [initialStudents]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <div className="cp-card">
        {/* Card Header matching legacy index.html line 24670 */}
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ minWidth: '220px', flex: '1 1 auto' }}>
            <div className="cp-section-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span aria-hidden="true">👥</span> Student &amp; Client Directory
            </div>
            <div className="cp-section-desc" style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '3px' }}>
              Single source of truth for student journey, billing history, receipts, cohort enrolments, and balance tracking.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cp-btn sm primary"
              id="btnAddNewStudent"
              onClick={() => setIsAddStudentOpen(true)}
              style={{ fontWeight: 700 }}
            >
              + Add Student
            </button>
            <button
              type="button"
              className="cp-btn sm secondary"
              id="btnExportStudents"
              onClick={handleExportCSV}
              style={{ fontWeight: 600 }}
            >
              <span aria-hidden="true">📥</span> Export Directory CSV
            </button>
          </div>
        </div>

        {/* Enhanced Multi-Filter Toolbar */}
        <StudentFilters
          currentSearch={currentSearch}
          currentStatus={currentStatus}
          currentProgrammeId={currentProgrammeId}
          currentEnrolmentStatus={currentEnrolmentStatus}
          currentFinancialStatus={currentFinancialStatus}
          programmes={programmes}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onProgrammeChange={handleProgrammeChange}
          onEnrolmentStatusChange={handleEnrolmentStatusChange}
          onFinancialStatusChange={handleFinancialStatusChange}
          onClearFilters={handleClearFilters}
        />

        {/* Selection Action Banner */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1E40AF', fontWeight: 600 }}>
              <span>☑️</span>
              <span>
                {selectedIds.size} record{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleClearSelection}
                className="cp-btn sm secondary"
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Clear Selection
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={handleOpenBulkDelete}
                  className="cp-btn sm cp-btn-danger"
                  style={{
                    fontSize: '12px',
                    padding: '4px 12px',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🗑️ Delete Selected
                </button>
              )}
            </div>
          </div>
        )}

        {/* Directory Table with Row Selection */}
        <StudentTable
          students={initialStudents}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
          onOpenProfile={handleOpenProfile}
          onEditStudent={handleOpenProfile}
          onOpen360={handleOpenProfile}
          onDeleteStudent={handleOpenSingleDelete}
          canDelete={canDelete}
        />

        {/* Standard Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          entityLabel="students"
        />
      </div>

      {/* Student 360° Profile Dossier Modal */}
      {selectedStudentId && (
        <StudentDrawer
          dossier={dossier}
          isLoading={isLoadingDossier}
          onClose={handleCloseDrawer}
          onStudentUpdated={() => {
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Authoritative Student Details & Registration Modal */}
      {isAddStudentOpen && (
        <StudentRegistrationModal
          isOpen={isAddStudentOpen}
          onClose={() => setIsAddStudentOpen(false)}
          onSaved={() => {
            setIsAddStudentOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Controlled Deletion & Dependency Verification Modal */}
      <StudentDeleteModal
        isOpen={isDeleteModalOpen}
        studentIds={deleteTargetIds}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={() => {
          setSelectedIds(new Set());
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}
