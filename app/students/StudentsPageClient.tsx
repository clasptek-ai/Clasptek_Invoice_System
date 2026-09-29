/**
 * app/students/StudentsPageClient.tsx — Phase 4
 * Client Component orchestrator for the Student & Client Directory.
 * Matches legacy index.html lines 24656–24780.
 */

'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { StudentSummary, StudentDossier } from '@/types/students';
import { StudentTable } from '@/components/students/StudentTable';
import { StudentFilters } from '@/components/students/StudentFilters';
import { StudentDrawer } from '@/components/students/StudentDrawer';
import { Pagination } from '@/components/tables/Pagination';
import { downloadSafeCsv } from '@/lib/utils/csv';

interface StudentsPageClientProps {
  initialStudents: StudentSummary[];
  totalCount: number;
  currentSearch: string;
  currentStatus: string;
  currentPage: number;
  pageSize: number;
}

export function StudentsPageClient({
  initialStudents,
  totalCount,
  currentSearch,
  currentStatus,
  currentPage,
  pageSize,
}: StudentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState<boolean>(false);

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(newPage));
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', String(newPageSize));
      params.delete('page');
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleSearchChange = useCallback(
    (search: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set('search', search.trim());
      } else {
        params.delete('search');
      }
      params.delete('page');
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleStatusChange = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status && status !== 'ALL') {
        params.set('status', status);
      } else {
        params.delete('status');
      }
      params.delete('page');
      startTransition(() => router.push(`/students?${params.toString()}`));
    },
    [router, searchParams]
  );

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
            <a
              href="/apply"
              className="cp-btn sm primary"
              id="btnAddNewStudent"
              style={{ fontWeight: 700, textDecoration: 'none' }}
            >
              + Add Student
            </a>
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

        {/* Search & status filter toolbar */}
        <StudentFilters
          currentSearch={currentSearch}
          currentStatus={currentStatus}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
        />

        {/* Directory Table */}
        <StudentTable
          students={initialStudents}
          onOpenProfile={handleOpenProfile}
          onEditStudent={handleOpenProfile}
          onOpen360={handleOpenProfile}
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
    </div>
  );
}
