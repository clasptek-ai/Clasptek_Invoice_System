/**
 * app/enquiries/EnquiriesPageClient.tsx — Phase 3 & 9G
 * Client-side orchestrator for the Enquiries & Leads Directory.
 * Owns selected enquiry state, optimistic status updates, financial synchronization,
 * direct invoice generation, and admissions timeline review.
 */

'use client';

import { useState, useCallback, useTransition, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  Enquiry,
  EnquiryStatus,
  ProgrammeOption,
  EnquiryInvoiceSummary,
  EnquiryFinancials,
} from '@/types/admissions';
import type { Invoice, Customer } from '@/types/finance';
import type { FinanceSettingsData, PaymentAccountData } from '@/types/settings';
import { EnquirySummaryStrip } from '@/components/admissions/EnquirySummaryStrip';
import { EnquiryFilters } from '@/components/admissions/EnquiryFilters';
import { EnquiryTable } from '@/components/admissions/EnquiryTable';
import { EnquiryDrawer } from '@/components/admissions/EnquiryDrawer';
import { NewEnquiryModal } from '@/components/admissions/NewEnquiryModal';
import { GenerateInvoiceModal } from '@/components/admissions/GenerateInvoiceModal';
import { ContactFollowUpModal } from '@/components/admissions/ContactFollowUpModal';
import { CanonicalInvoiceDocument } from '@/components/finance/CanonicalInvoiceDocument';
import { printCanonicalElement } from '@/components/finance/printCanonical';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { Pagination } from '@/components/tables/Pagination';
import { TableSelectionBar } from '@/components/tables/TableSelectionBar';
import {
  RecordLifecycleModal,
  type LifecycleActionType,
  type RecordDependencyItem,
} from '@/components/tables/RecordLifecycleModal';

interface EnquiriesPageClientProps {
  initialEnquiries: Enquiry[];
  totalCount: number;
  currentSearch: string;
  currentStatus: string;
  currentPage: number;
  pageSize?: number;
  programmes?: ProgrammeOption[];
  customers?: Customer[];
  financeSettings?: FinanceSettingsData | null;
  paymentAccounts?: PaymentAccountData[] | null;
  initialOpenNew?: boolean;
  staffName?: string;
  initialError?: string | null;
}

export function EnquiriesPageClient({
  initialEnquiries,
  totalCount,
  currentSearch,
  currentStatus,
  currentPage,
  pageSize = 25,
  programmes = [],
  customers = [],
  financeSettings,
  paymentAccounts,
  initialOpenNew = false,
  staffName = 'Admissions',
  initialError = null,
}: EnquiriesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Local state
  const [enquiries, setEnquiries] = useState<Enquiry[]>(initialEnquiries);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [actionError, setActionError] = useState<string | null>(initialError);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(initialOpenNew);

  // Contact Prospect & Log Follow-up Modal state
  const [contactFollowUpEnquiry, setContactFollowUpEnquiry] = useState<Enquiry | null>(null);

  // Generate Invoice Modal state
  const [invoiceModalEnquiry, setInvoiceModalEnquiry] = useState<Enquiry | null>(null);
  const [isGenerateInvoiceOpen, setIsGenerateInvoiceOpen] = useState(false);
  const [createdInvoiceForPreview, setCreatedInvoiceForPreview] = useState<Invoice | null>(null);
  const invoiceDocRef = useRef<HTMLDivElement>(null);

  // Multi-row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType;
    enquiryIds: string[];
    recordIdentifier?: string;
    dependencies: RecordDependencyItem[];
    blockedMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    actionType: 'DELETE',
    enquiryIds: [],
    dependencies: [],
    blockedMessage: null,
    isLoading: false,
  });

  const visibleIds = enquiries.map((e) => e.id);
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

  const handleOpenDelete = useCallback(async (ids: string[], targetName?: string) => {
    setLifecycleModal({
      isOpen: true,
      actionType: 'DELETE',
      enquiryIds: ids,
      recordIdentifier: targetName || `${ids.length} selected record(s)`,
      dependencies: [],
      blockedMessage: null,
      isLoading: true,
    });

    try {
      const res = await fetch('/api/admissions/enquiries/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK_DEPENDENCIES', enquiryIds: ids }),
      });
      const data = await res.json();
      if (data.ok && data.reports) {
        const reports = data.reports;
        const blocked = reports.filter((r: { canDelete: boolean }) => !r.canDelete);
        let totalInvoices = 0;
        let totalStudents = 0;
        reports.forEach((r: { dependencies?: { invoices?: number; registeredStudents?: number } }) => {
          totalInvoices += r.dependencies?.invoices || 0;
          totalStudents += r.dependencies?.registeredStudents || 0;
        });

        const depItems: RecordDependencyItem[] = [];
        if (totalInvoices > 0) depItems.push({ label: 'Invoices', count: totalInvoices });
        if (totalStudents > 0) depItems.push({ label: 'Registered Student Profiles', count: totalStudents });

        setLifecycleModal((prev) => ({
          ...prev,
          isLoading: false,
          dependencies: depItems,
          blockedMessage:
            blocked.length > 0
              ? `${blocked.length} enquiry record(s) have active dependencies (invoices or registered students) and cannot be deleted.`
              : null,
        }));
      }
    } catch {
      setLifecycleModal((prev) => ({
        ...prev,
        isLoading: false,
        blockedMessage: 'Failed to verify record dependencies.',
      }));
    }
  }, []);

  const handleBulkStatusChange = useCallback(
    async (status: EnquiryStatus) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);
      try {
        const res = await fetch('/api/admissions/enquiries/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'UPDATE_STATUS', enquiryIds: ids, status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update status');

        setEnquiries((prev) =>
          prev.map((e) => (selectedIds.has(e.id) ? { ...e, status, updated_at: new Date().toISOString() } : e))
        );
        setSelectedIds(new Set());
        setSuccessBanner(data.message || `Updated ${ids.length} records.`);
        setTimeout(() => setSuccessBanner(null), 4000);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Bulk status update failed.');
      }
    },
    [selectedIds]
  );

  const handleConfirmLifecycleAction = useCallback(
    async (reason: string) => {
      const { actionType, enquiryIds } = lifecycleModal;
      if (enquiryIds.length === 0) return;

      setLifecycleModal((prev) => ({ ...prev, isLoading: true }));
      try {
        if (actionType === 'DELETE') {
          const res = await fetch('/api/admissions/enquiries/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'DELETE', enquiryIds, reason }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Deletion failed');

          setEnquiries((prev) => prev.filter((e) => !enquiryIds.includes(e.id)));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            enquiryIds.forEach((id) => next.delete(id));
            return next;
          });
          setSuccessBanner(data.message || 'Records successfully deleted.');
          setTimeout(() => setSuccessBanner(null), 4000);
          setLifecycleModal((prev) => ({ ...prev, isOpen: false }));
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Action failed.');
        setLifecycleModal((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [lifecycleModal]
  );

  const handleEnquiryCreated = useCallback((newEnq: Enquiry) => {
    setEnquiries((prev) => [newEnq, ...prev]);
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize);

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

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newSize !== 25) {
        params.set('pageSize', String(newSize));
      } else {
        params.delete('pageSize');
      }
      params.delete('page');
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
        throw err;
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

  // Handle Follow-up logged from dedicated modal
  const handleFollowUpLogged = useCallback(
    async (
      enquiryId: string,
      payload: {
        note: string;
        contactMethod: string;
        outcome: string;
        activitySummary?: string;
        nextFollowUpDate?: string;
        status?: EnquiryStatus | null;
      }
    ) => {
      setActionError(null);
      try {
        const res = await fetch(`/api/admissions/enquiries/${enquiryId}/note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? 'Failed to record follow-up.');
        }

        const nowIso = new Date().toISOString();
        const headerParts: string[] = [];
        if (payload.contactMethod) headerParts.push(`Channel: ${payload.contactMethod}`);
        if (payload.outcome) headerParts.push(`Outcome: ${payload.outcome}`);
        if (payload.activitySummary) headerParts.push(`Summary: ${payload.activitySummary}`);
        const metaHeader = headerParts.length > 0 ? `【${headerParts.join(' | ')}】` : '';
        const followUpTrailer = payload.nextFollowUpDate ? `\nNext Follow-up Scheduled: ${payload.nextFollowUpDate}` : '';
        const appendedNote = [metaHeader, payload.note, followUpTrailer].filter(Boolean).join('\n');

        setEnquiries((prev) =>
          prev.map((e) => {
            if (e.id !== enquiryId) return e;
            const existingNotes = e.notes || '';
            const mergedNotes = existingNotes ? `${existingNotes}\n\n${appendedNote}` : appendedNote;
            return {
              ...e,
              status: payload.status || e.status,
              notes: mergedNotes,
              updated_at: nowIso,
            };
          })
        );

        if (selectedEnquiry?.id === enquiryId) {
          setSelectedEnquiry((prev) => {
            if (!prev) return prev;
            const existingNotes = prev.notes || '';
            const mergedNotes = existingNotes ? `${existingNotes}\n\n${appendedNote}` : appendedNote;
            return {
              ...prev,
              status: payload.status || prev.status,
              notes: mergedNotes,
              updated_at: nowIso,
            };
          });
        }

        setContactFollowUpEnquiry(null);

        setSuccessBanner(
          `Follow-up logged via ${payload.contactMethod} (${payload.outcome})${
            payload.status ? ` — Stage advanced to ${payload.status}` : ''
          }.`
        );
      } catch (err) {
        throw err;
      }
    },
    [selectedEnquiry]
  );

  // Trigger invoice creation modal
  const handleOpenGenerateInvoice = useCallback((enquiry: Enquiry) => {
    setInvoiceModalEnquiry(enquiry);
    setIsGenerateInvoiceOpen(true);
  }, []);

  // Handle invoice created & synchronize financial status
  const handleInvoiceCreated = useCallback(
    (newInvoice: Invoice) => {
      setSuccessBanner(`Invoice ${newInvoice.invoiceDisplayNo} generated and linked to prospect successfully!`);
      setCreatedInvoiceForPreview(newInvoice);

      const targetEnquiryId = invoiceModalEnquiry?.id;

      // Optimistically update financial totals for the enquiry
      setEnquiries((prev) =>
        prev.map((e) => {
          if (e.id === targetEnquiryId || (newInvoice.studentEmail && e.email === newInvoice.studentEmail)) {
            const existingFin = e.financials;
            const newTotal = (existingFin?.totalInvoiced || 0) + Number(newInvoice.totalAmount || 0);
            const newPaid = Number(existingFin?.amountPaid || 0);
            const newBal = Math.max(0, newTotal - newPaid);

            const newSummary: EnquiryInvoiceSummary = {
              id: newInvoice.id,
              invoiceNo: Number(newInvoice.invoiceNo || 0),
              invoiceDisplayNo: newInvoice.invoiceDisplayNo,
              totalAmount: Number(newInvoice.totalAmount || 0),
              paidAmount: Number(newInvoice.paidAmount || 0),
              balanceAmount: Number(newInvoice.balanceAmount || newInvoice.totalAmount),
              status: newInvoice.status,
              dueDate: newInvoice.dueDate,
              invoiceDate: newInvoice.invoiceDate,
              createdAt: newInvoice.createdAt,
            };

            const updatedFin: EnquiryFinancials = {
              billingStatus: 'INVOICED',
              billingStatusLabel: 'Invoiced',
              totalInvoiced: newTotal,
              amountPaid: newPaid,
              balanceDue: newBal,
              invoicesCount: (existingFin?.invoicesCount || 0) + 1,
              invoices: [newSummary, ...(existingFin?.invoices || [])],
            };

            return {
              ...e,
              financials: updatedFin,
              updated_at: new Date().toISOString(),
            };
          }
          return e;
        })
      );

      // If drawer is open on this enquiry, update selectedEnquiry as well
      if (
        selectedEnquiry &&
        (selectedEnquiry.id === targetEnquiryId || selectedEnquiry.email === newInvoice.studentEmail)
      ) {
        setSelectedEnquiry((prev) => {
          if (!prev) return null;
          const existingFin = prev.financials;
          const newTotal = (existingFin?.totalInvoiced || 0) + Number(newInvoice.totalAmount || 0);
          const newPaid = Number(existingFin?.amountPaid || 0);
          const newBal = Math.max(0, newTotal - newPaid);

          const newSummary: EnquiryInvoiceSummary = {
            id: newInvoice.id,
            invoiceNo: Number(newInvoice.invoiceNo || 0),
            invoiceDisplayNo: newInvoice.invoiceDisplayNo,
            totalAmount: Number(newInvoice.totalAmount || 0),
            paidAmount: Number(newInvoice.paidAmount || 0),
            balanceAmount: Number(newInvoice.balanceAmount || newInvoice.totalAmount),
            status: newInvoice.status,
            dueDate: newInvoice.dueDate,
            invoiceDate: newInvoice.invoiceDate,
            createdAt: newInvoice.createdAt,
          };

          return {
            ...prev,
            financials: {
              billingStatus: 'INVOICED',
              billingStatusLabel: 'Invoiced',
              totalInvoiced: newTotal,
              amountPaid: newPaid,
              balanceDue: newBal,
              invoicesCount: (existingFin?.invoicesCount || 0) + 1,
              invoices: [newSummary, ...(existingFin?.invoices || [])],
            },
            updated_at: new Date().toISOString(),
          };
        });
      }
    },
    [invoiceModalEnquiry, selectedEnquiry]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div
        className="cp-page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            className="cp-page-title"
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--accent, #C1272D)' }}
              aria-hidden="true"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Enquiries &amp; Leads Directory
          </h1>
          <p
            className="cp-page-subtitle"
            style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', marginTop: '4px', margin: 0 }}
          >
            Manage prospect interactions, programme requests, billing triggers, and lead progression.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="cp-btn secondary"
            id="btnExportEnquiries"
            onClick={() => {
              const headers = [
                'Name',
                'Email',
                'Phone',
                'Programme',
                'Source',
                'Status',
                'Billing Status',
                'Total Invoiced',
                'Amount Paid',
                'Balance Due',
                'Updated At',
              ];
              const rows = enquiries.map((e) => [
                e.student_name,
                e.email || '',
                e.phone || '',
                e.programme_name || '',
                e.source || '',
                e.status,
                e.financials?.billingStatusLabel || 'Not Invoiced',
                e.financials?.totalInvoiced || 0,
                e.financials?.amountPaid || 0,
                e.financials?.balanceDue || 0,
                e.updated_at || '',
              ]);
              downloadSafeCsv('clasptek-enquiries-leads', headers, rows);
            }}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            + Log Enquiry
          </button>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div role="alert" className="cp-alert error" style={{ marginBottom: '16px' }}>
          {actionError}
        </div>
      )}

      {/* Success feedback banner */}
      {successBanner && (
        <div
          role="status"
          className="cp-alert success"
          style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {successBanner}</span>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <EnquirySummaryStrip enquiries={enquiries} onStatusFilter={handleStatusFilter} />

      {/* Filters */}
      <EnquiryFilters currentSearch={currentSearch} currentStatus={currentStatus} />

      {/* Universal Selection Toolbar */}
      <TableSelectionBar
        selectedCount={selectedIds.size}
        totalVisibleCount={visibleIds.length}
        entityLabel="enquiry"
        onClearSelection={handleClearSelection}
        onSelectAllVisible={handleToggleSelectAll}
        isAllSelected={isAllSelected}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleBulkStatusChange(e.target.value as EnquiryStatus);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="cp-btn sm secondary"
            style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', background: '#FFFFFF' }}
          >
            <option value="" disabled>Set Status...</option>
            <option value="NEW">Mark as NEW</option>
            <option value="CONTACTED">Mark as CONTACTED</option>
            <option value="QUALIFIED">Mark as QUALIFIED</option>
            <option value="INVOICED">Mark as INVOICED</option>
            <option value="LOST">Mark as LOST</option>
          </select>
          <button
            type="button"
            onClick={() => handleOpenDelete(Array.from(selectedIds))}
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
            Delete Selected
          </button>
        </div>
      </TableSelectionBar>

      {/* Table Container */}
      <div className="cp-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalCount === 0 ? 'No enquiries' : `${totalCount} enquir${totalCount === 1 ? 'y' : 'ies'}`}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>
        </div>
        <div style={{ padding: '12px' }}>
          <EnquiryTable
            enquiries={enquiries}
            onSelect={setSelectedEnquiry}
            onFollowUp={(enq) => setContactFollowUpEnquiry(enq)}
            onGenerateInvoice={handleOpenGenerateInvoice}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            isAllSelected={isAllSelected}
            onDeleteEnquiry={(enq) => handleOpenDelete([enq.id], enq.student_name)}
            onEditEnquiry={(enq) => setSelectedEnquiry(enq)}
          />
        </div>

        {/* Standard Pagination */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalRecords={totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          entityLabel="enquiries"
        />
      </div>

      {/* Enquiry Detail Drawer */}
      <EnquiryDrawer
        enquiry={selectedEnquiry}
        onClose={() => setSelectedEnquiry(null)}
        onStatusChange={handleStatusChange}
        onNoteAppend={handleNoteAppend}
        onGenerateInvoice={handleOpenGenerateInvoice}
        onOpenContactFollowUp={(enq) => setContactFollowUpEnquiry(enq)}
      />

      {/* Contact Prospect & Log Follow-up Modal */}
      <ContactFollowUpModal
        isOpen={Boolean(contactFollowUpEnquiry)}
        enquiry={contactFollowUpEnquiry}
        onClose={() => setContactFollowUpEnquiry(null)}
        onFollowUpLogged={handleFollowUpLogged}
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

      {/* Generate Invoice Modal — Uses Authoritative 7-Section Workflow */}
      <GenerateInvoiceModal
        isOpen={isGenerateInvoiceOpen}
        onClose={() => {
          setIsGenerateInvoiceOpen(false);
          setInvoiceModalEnquiry(null);
        }}
        enquiry={invoiceModalEnquiry}
        programmes={programmes}
        customers={customers}
        financeSettings={financeSettings}
        paymentAccounts={paymentAccounts}
        onInvoiceCreated={handleInvoiceCreated}
      />

      {/* Canonical Invoice Document Preview Modal */}
      {createdInvoiceForPreview && (
        <div
          className="cp-modal-overlay"
          style={{ zIndex: 1200 }}
          onClick={() => setCreatedInvoiceForPreview(null)}
        >
          <div
            className="cp-modal"
            style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="cp-modal-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div
                className="cp-modal-title"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Tuition Invoice Generated ({createdInvoiceForPreview.invoiceDisplayNo})
              </div>
              <button
                type="button"
                className="cp-modal-close"
                onClick={() => setCreatedInvoiceForPreview(null)}
                aria-label="Close invoice preview"
              >
                ✕
              </button>
            </div>
            <div className="cp-modal-body cp-doc-scroll-wrap" style={{ padding: '20px', background: '#F8FAFC' }}>
              <div ref={invoiceDocRef}>
                <CanonicalInvoiceDocument
                  invoice={createdInvoiceForPreview}
                  financeSettings={financeSettings}
                  paymentAccount={paymentAccounts?.find(a => a.isDefault) || paymentAccounts?.[0]}
                />
              </div>
            </div>
            <div
              className="cp-modal-footer"
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}
            >
              <button
                type="button"
                className="cp-btn secondary"
                onClick={() => setCreatedInvoiceForPreview(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="cp-btn primary"
                onClick={() => printCanonicalElement(invoiceDocRef.current)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Deletion & Dependency Verification Dialog */}
      <RecordLifecycleModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        entityName="Enquiry"
        recordIdentifier={lifecycleModal.recordIdentifier}
        recordCount={lifecycleModal.enquiryIds.length}
        dependencies={lifecycleModal.dependencies}
        blockedMessage={lifecycleModal.blockedMessage}
        isLoading={lifecycleModal.isLoading}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmLifecycleAction}
      />
    </div>
  );
}

