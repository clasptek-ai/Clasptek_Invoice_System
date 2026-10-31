'use client';

/**
 * lib/preview/preview-context.tsx — Client-Side In-Memory Preview State Provider
 * Phase C9: Integrated Local Preview Journey
 *
 * SAFETY INVARIANTS:
 * 1. Scope: Strictly local preview route tree (/preview/*) only. Normal routes (/dashboard, /payments, etc.) never import or consume this context.
 * 2. In-Memory: Ephemeral React state. Zero persistence to localStorage, IndexedDB, cookies, or backend databases.
 * 3. Client Navigation: Survives in-app client-side navigation between /preview routes during the active browser session.
 * 4. Deterministic Fixtures: Full page reloads reset cleanly to verified synthetic mock data in lib/preview/mock-data.ts.
 * 5. Isolation: Zero network sockets, zero Supabase client imports, zero live API fallthrough.
 */

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { Invoice, Payment, FinancialMetrics, PaymentMethod } from '@/types/finance';
import type { Student } from '@/types/students';
import type { Programme, Cohort } from '@/types/academics';
import type { ProgrammeOption, CohortOption } from '@/types/admissions';
import type { LifecycleActionType } from '@/components/tables/RecordLifecycleModal';
import {
  MOCK_PREVIEW_USER,
  MOCK_PREVIEW_STUDENT,
  MOCK_PREVIEW_ADMISSIONS_PROGRAMMES,
  MOCK_PREVIEW_ACADEMIC_PROGRAMMES,
  MOCK_PREVIEW_COHORTS,
  MOCK_PREVIEW_INVOICES,
  MOCK_PREVIEW_PAYMENTS,
  MOCK_PREVIEW_METRICS,
} from '@/lib/preview/mock-data';

export interface TargetInvoiceOption {
  id: string;
  invoiceDisplayNo: string;
  studentName: string;
  totalAmount: number;
  balanceAmount: number;
  status: string;
}

export interface SyntheticEnrolmentRecord {
  id: string;
  enrolment_number: string;
  student_id: string;
  student_name: string;
  programme_id: string;
  programme_name: string;
  cohort_id: string;
  cohort_code: string;
  start_date: string;
  agreed_tuition_fee: number;
  status: string;
  created_at: string;
}

interface PreviewContextValue {
  // Active state
  students: Student[];
  selectedStudent: Student;
  admissionsProgrammes: ProgrammeOption[];
  academicProgrammes: Programme[];
  cohorts: CohortOption[];
  academicCohorts: Cohort[];
  enrolments: SyntheticEnrolmentRecord[];
  invoices: Invoice[];
  payments: Payment[];
  metrics: FinancialMetrics;
  targetInvoices: TargetInvoiceOption[];
  enrolledCohortIdsForSelectedStudent: string[];

  // Mutators (Pure In-Memory)
  selectStudent: (studentId: string) => void;
  registerStudent: (student: Student) => void;
  createCohort: (cohort: Cohort) => void;
  enrolStudent: (payload: {
    studentId: string;
    programmeId: string;
    cohortId: string;
    startDate?: string;
    agreedTuitionFee: number;
  }) => { success: boolean; enrolment?: SyntheticEnrolmentRecord; error?: string };
  issueInvoice: (invoice: Invoice) => void;
  recordPayment: (payload: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    reference?: string;
    notes?: string;
  }) => { success: boolean; payment?: Payment; error?: string };
  performLifecycleAction: (
    actionType: LifecycleActionType,
    entityType: 'student' | 'invoice' | 'payment' | 'cohort',
    recordId: string,
    reason?: string
  ) => { success: boolean; error?: string };
  resetToBaseline: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  // 1. Students State
  const [students, setStudents] = useState<Student[]>([MOCK_PREVIEW_STUDENT]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(MOCK_PREVIEW_STUDENT.id);

  // 2. Programmes & Cohorts State
  const [admissionsProgrammes] = useState<ProgrammeOption[]>(MOCK_PREVIEW_ADMISSIONS_PROGRAMMES);
  const [academicProgrammes] = useState<Programme[]>(MOCK_PREVIEW_ACADEMIC_PROGRAMMES);
  const [cohorts, setCohorts] = useState<CohortOption[]>(MOCK_PREVIEW_COHORTS);
  const [academicCohorts, setAcademicCohorts] = useState<Cohort[]>([]);

  // 3. Enrolments State (Pre-enrolled in DATA-NOV26 to test duplicate check)
  const [enrolments, setEnrolments] = useState<SyntheticEnrolmentRecord[]>([
    {
      id: 'enr_preview_init_001',
      enrolment_number: 'ENR-2026-1001',
      student_id: MOCK_PREVIEW_STUDENT.id,
      student_name: `${MOCK_PREVIEW_STUDENT.first_name} ${MOCK_PREVIEW_STUDENT.last_name}`,
      programme_id: 'prog_001',
      programme_name: 'Executive Data Analysis & Business Intelligence',
      cohort_id: 'coh_001_a',
      cohort_code: 'DATA-NOV26',
      start_date: '2026-11-02',
      agreed_tuition_fee: 1800,
      status: 'CONFIRMED',
      created_at: '2026-10-10T09:00:00Z',
    },
  ]);

  // 4. Invoices State
  const [invoices, setInvoices] = useState<Invoice[]>(MOCK_PREVIEW_INVOICES);

  // 5. Payments State
  const [payments, setPayments] = useState<Payment[]>(MOCK_PREVIEW_PAYMENTS);

  // Derived: Current selected student
  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || students[0] || MOCK_PREVIEW_STUDENT;
  }, [students, selectedStudentId]);

  // Derived: Enrolled cohorts for selected student
  const enrolledCohortIdsForSelectedStudent = useMemo(() => {
    return enrolments
      .filter((e) => e.student_id === selectedStudent.id)
      .map((e) => e.cohort_id);
  }, [enrolments, selectedStudent.id]);

  // Derived: Target Invoices available for payment (only open/partial invoices)
  const targetInvoices: TargetInvoiceOption[] = useMemo(() => {
    return invoices
      .filter((inv) => (inv.balanceAmount ?? 0) > 0 || inv.status !== 'paid')
      .map((inv) => ({
        id: inv.id,
        invoiceDisplayNo: inv.invoiceDisplayNo,
        studentName: inv.studentName,
        totalAmount: inv.totalAmount,
        balanceAmount: inv.balanceAmount ?? Math.max(0, inv.totalAmount - (inv.paidAmount ?? 0)),
        status: inv.status,
      }));
  }, [invoices]);

  // Derived: Metrics recalculated from active in-memory ledger
  const metrics: FinancialMetrics = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const outstandingBalance = invoices.reduce((sum, i) => sum + Math.max(0, Number(i.balanceAmount) || 0), 0);

    const invoiceCounts = {
      total: invoices.length,
      unpaid: invoices.filter((i) => i.status === 'unpaid').length,
      partial: invoices.filter((i) => i.status === 'partial').length,
      paid: invoices.filter((i) => i.status === 'paid').length,
      overdue: 0,
      cancelled: invoices.filter((i) => i.status === 'cancelled').length,
    };

    const paymentCounts = {
      total: payments.length,
      reconciled: payments.filter((p) => p.reconciliationStatus === 'reconciled').length,
      unreconciled: payments.filter((p) => p.reconciliationStatus !== 'reconciled').length,
    };

    return {
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      overdueAmount: 0,
      invoiceCounts,
      paymentCounts,
      payroll: MOCK_PREVIEW_METRICS.payroll,
    };
  }, [invoices, payments]);

  // Actions
  const selectStudent = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
  }, []);

  const registerStudent = useCallback((newStudent: Student) => {
    setStudents((prev) => [newStudent, ...prev]);
    setSelectedStudentId(newStudent.id);
  }, []);

  const createCohort = useCallback((newCohort: Cohort) => {
    setAcademicCohorts((prev) => [newCohort, ...prev]);
    // Also add to admissions cohort options so AddEnrolmentModal can immediately see it
    const newOption: CohortOption = {
      id: newCohort.id,
      cohort_code: newCohort.cohort_code,
      name: newCohort.name,
      programme_id: newCohort.programme_id,
      start_date: newCohort.start_date,
      status: newCohort.status,
    };
    setCohorts((prev) => [newOption, ...prev]);
  }, []);

  const enrolStudent = useCallback(
    (payload: {
      studentId: string;
      programmeId: string;
      cohortId: string;
      startDate?: string;
      agreedTuitionFee: number;
    }) => {
      // Validate duplicate enrolment
      const isAlreadyEnrolled = enrolments.some(
        (e) => e.student_id === payload.studentId && e.cohort_id === payload.cohortId
      );
      if (isAlreadyEnrolled) {
        return {
          success: false,
          error: 'This student is already enrolled in the selected cohort.',
        };
      }

      const prog = admissionsProgrammes.find((p) => p.id === payload.programmeId);
      const coh = cohorts.find((c) => c.id === payload.cohortId);
      const stu = students.find((s) => s.id === payload.studentId) || selectedStudent;
      const enrNo = Math.floor(2000 + Math.random() * 8000);

      const record: SyntheticEnrolmentRecord = {
        id: `enr_mock_${Date.now()}`,
        enrolment_number: `ENR-2026-${enrNo}`,
        student_id: payload.studentId,
        student_name: `${stu.first_name} ${stu.last_name}`,
        programme_id: payload.programmeId,
        programme_name: prog?.name || 'Academic Programme',
        cohort_id: payload.cohortId,
        cohort_code: coh?.cohort_code || 'COHORT',
        start_date: payload.startDate || coh?.start_date || new Date().toISOString().split('T')[0],
        agreed_tuition_fee: payload.agreedTuitionFee,
        status: 'CONFIRMED',
        created_at: new Date().toISOString(),
      };

      setEnrolments((prev) => [record, ...prev]);
      return { success: true, enrolment: record };
    },
    [admissionsProgrammes, cohorts, enrolments, selectedStudent, students]
  );

  const issueInvoice = useCallback((newInvoice: Invoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  }, []);

  const recordPayment = useCallback(
    (payload: {
      invoiceId: string;
      amount: number;
      paymentMethod: PaymentMethod;
      paymentDate: string;
      reference?: string;
      notes?: string;
    }) => {
      if (!payload.invoiceId) {
        return { success: false, error: 'Please select a target invoice.' };
      }
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        return { success: false, error: 'Payment amount must be greater than zero.' };
      }

      const inv = invoices.find((i) => i.id === payload.invoiceId);
      if (!inv) {
        return { success: false, error: 'Target invoice not found in mock session.' };
      }

      const receiptNo = Math.floor(100 + Math.random() * 900);
      const newPayment: Payment = {
        id: `pay_mock_${Date.now()}`,
        tenantId: MOCK_PREVIEW_USER.tenant_id,
        receiptNo,
        receiptDisplayNo: `REC-2026-${receiptNo.toString().padStart(4, '0')}`,
        invoiceId: payload.invoiceId,
        invoiceDisplayNo: inv.invoiceDisplayNo,
        studentName: inv.studentName,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod,
        reference: payload.reference || 'LOCAL-PREVIEW-MOCK',
        paymentDate: payload.paymentDate,
        notes: payload.notes || 'Recorded in integrated local mock journey.',
        reconciliationStatus: 'reconciled',
        source: 'LOCAL_PREVIEW',
        createdAt: new Date().toISOString(),
        createdBy: MOCK_PREVIEW_USER.full_name,
      };

      // Atomic update of payment and target invoice balance
      setPayments((prev) => [newPayment, ...prev]);

      setInvoices((prev) =>
        prev.map((i) => {
          if (i.id !== payload.invoiceId) return i;
          const currentPaid = Number(i.paidAmount) || 0;
          const nextPaid = currentPaid + payload.amount;
          const nextBalance = Math.max(0, (Number(i.totalAmount) || 0) - nextPaid);
          const nextStatus = nextBalance === 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';

          return {
            ...i,
            paidAmount: nextPaid,
            balanceAmount: nextBalance,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
          };
        })
      );

      return { success: true, payment: newPayment };
    },
    [invoices]
  );

  const performLifecycleAction = useCallback(
    (
      actionType: LifecycleActionType,
      entityType: 'student' | 'invoice' | 'payment' | 'cohort',
      recordId: string,
      _reason?: string
    ) => {
      // Referential dependency check
      if (entityType === 'student' && actionType === 'DELETE') {
        const hasEnrolments = enrolments.some((e) => e.student_id === recordId);
        const hasUnsettledInvoices = invoices.some(
          (i) => (i.customerId === recordId || i.studentName.includes('Okonkwo')) && (i.balanceAmount ?? 0) > 0
        );

        if (hasEnrolments || hasUnsettledInvoices) {
          return {
            success: false,
            error:
              'Cannot delete student: Active academic enrolments or unsettled invoices exist. Blocked by referential integrity rules.',
          };
        }
        setStudents((prev) => prev.filter((s) => s.id !== recordId));
        return { success: true };
      }

      if (entityType === 'invoice') {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === recordId ? { ...inv, status: actionType === 'CANCEL' ? 'cancelled' : inv.status } : inv
          )
        );
        return { success: true };
      }

      if (entityType === 'payment') {
        // Void payment
        setPayments((prev) =>
          prev.map((p) => (p.id === recordId ? { ...p, reconciliationStatus: 'unreconciled' } : p))
        );
        return { success: true };
      }

      return { success: true };
    },
    [enrolments, invoices]
  );

  const resetToBaseline = useCallback(() => {
    setStudents([MOCK_PREVIEW_STUDENT]);
    setSelectedStudentId(MOCK_PREVIEW_STUDENT.id);
    setCohorts(MOCK_PREVIEW_COHORTS);
    setAcademicCohorts([]);
    setEnrolments([
      {
        id: 'enr_preview_init_001',
        enrolment_number: 'ENR-2026-1001',
        student_id: MOCK_PREVIEW_STUDENT.id,
        student_name: `${MOCK_PREVIEW_STUDENT.first_name} ${MOCK_PREVIEW_STUDENT.last_name}`,
        programme_id: 'prog_001',
        programme_name: 'Executive Data Analysis & Business Intelligence',
        cohort_id: 'coh_001_a',
        cohort_code: 'DATA-NOV26',
        start_date: '2026-11-02',
        agreed_tuition_fee: 1800,
        status: 'CONFIRMED',
        created_at: '2026-10-10T09:00:00Z',
      },
    ]);
    setInvoices(MOCK_PREVIEW_INVOICES);
    setPayments(MOCK_PREVIEW_PAYMENTS);
  }, []);

  const value = useMemo<PreviewContextValue>(
    () => ({
      students,
      selectedStudent,
      admissionsProgrammes,
      academicProgrammes,
      cohorts,
      academicCohorts,
      enrolments,
      invoices,
      payments,
      metrics,
      targetInvoices,
      enrolledCohortIdsForSelectedStudent,
      selectStudent,
      registerStudent,
      createCohort,
      enrolStudent,
      issueInvoice,
      recordPayment,
      performLifecycleAction,
      resetToBaseline,
    }),
    [
      students,
      selectedStudent,
      admissionsProgrammes,
      academicProgrammes,
      cohorts,
      academicCohorts,
      enrolments,
      invoices,
      payments,
      metrics,
      targetInvoices,
      enrolledCohortIdsForSelectedStudent,
      selectStudent,
      registerStudent,
      createCohort,
      enrolStudent,
      issueInvoice,
      recordPayment,
      performLifecycleAction,
      resetToBaseline,
    ]
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreviewState(): PreviewContextValue {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error('usePreviewState must be used within a PreviewProvider (under /preview route tree).');
  }
  return context;
}
