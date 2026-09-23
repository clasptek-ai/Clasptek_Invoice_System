/**
 * lib/students/queries.ts — Phase 4
 * Server-side Data Access Layer for Students & Client Directory.
 * Enforces multi-tenant RLS through createServerClient().
 */

import { createServerClient } from '@/lib/supabase/server';
import type {
  Student,
  StudentSummary,
  StudentFilters,
  StudentDossier,
} from '@/types/students';

const PAGE_SIZE = 25;

export async function getStudents(
  filters: StudentFilters = {}
): Promise<{ data: StudentSummary[]; count: number; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const { page = 1, pageSize = PAGE_SIZE, search = '' } = filters;

    // 1. Fetch Students
    let query = supabase
      .from('students')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const q = search.trim();
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_number.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
      );
    }

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: students, count, error } = await query;

    if (error) {
      console.error('[getStudents]', error.message);
      return { data: [], count: 0, error: error.message };
    }

    if (!students || students.length === 0) {
      return { data: [], count: count ?? 0, error: null };
    }

    const studentIds = students.map((s) => s.id);

    // 2. Fetch associated enrolments, programmes, invoices, and payments
    const [enrolmentsRes, invoicesRes, paymentsRes] = await Promise.all([
      supabase
        .from('enrolments')
        .select('id, student_id, programme_id, status, programmes!fk_enrolments_programme_tenant(name)')
        .in('student_id', studentIds),
      supabase
        .from('invoices')
        .select('id, invoice_no, total_amount, status, student_name, student_email'),
      supabase
        .from('payments')
        .select('id, invoice_id, amount'),
    ]);

    const enrolments = enrolmentsRes.data ?? [];
    const allInvoices = invoicesRes.data ?? [];
    const allPayments = paymentsRes.data ?? [];

    const paymentsByInvoice: Record<string, number> = {};
    allPayments.forEach((p) => {
      if (p.invoice_id) {
        paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] || 0) + Number(p.amount || 0);
      }
    });

    // 3. Map into StudentSummary matching legacy getStudentAccountSummaries
    const summaries: StudentSummary[] = students.map((stu: Student) => {
      const stuEnrolments = enrolments.filter((e) => e.student_id === stu.id);

      const fullName = `${stu.first_name || ''} ${stu.last_name || ''}`.trim();
      const lowerName = fullName.toLowerCase();
      const lowerEmail = (stu.email || '').toLowerCase();

      const stuInvoices = allInvoices.filter((inv) => {
        const invName = (inv.student_name || '').toLowerCase();
        const invEmail = (inv.student_email || '').toLowerCase();
        if (lowerName && invName && (invName === lowerName || invName.includes(lowerName))) return true;
        if (lowerEmail && invEmail && invEmail === lowerEmail) return true;
        return false;
      });

      const totalInvoiced = stuInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const totalPaid = stuInvoices.reduce((sum, inv) => sum + (paymentsByInvoice[inv.id] || 0), 0);
      const balance = Math.max(0, totalInvoiced - totalPaid);

      const programmeNames = new Set<string>();
      stuEnrolments.forEach((e) => {
        // @ts-expect-error Supabase nested relation shape
        const pName = e.programmes?.name;
        if (pName) programmeNames.add(pName);
      });

      let financialStatus: StudentSummary['financial_status'] = 'NO_INVOICE';
      let statusDisplay = 'Prospect';

      if (totalInvoiced > 0 && balance <= 0) {
        financialStatus = 'FULLY_PAID';
        statusDisplay = 'Fully Paid';
      } else if (totalInvoiced > 0 && totalPaid > 0 && balance > 0) {
        financialStatus = 'PARTIALLY_PAID';
        statusDisplay = 'Partial Balance';
      } else if (totalInvoiced > 0) {
        financialStatus = 'UNPAID';
        statusDisplay = 'Outstanding';
      }

      return {
        id: stu.id,
        student_number: stu.student_number || '',
        first_name: stu.first_name,
        last_name: stu.last_name,
        name: fullName || 'Student',
        email: stu.email,
        phone: stu.phone,
        gender: stu.gender,
        address: stu.address,
        parent_name: stu.emergency_contact_name,
        programmes_list: Array.from(programmeNames).join(', ') || '—',
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance,
        is_enrolled: stuEnrolments.length > 0,
        financial_status: financialStatus,
        training_status: stu.status,
        status_display: statusDisplay,
      };
    });

    return { data: summaries, count: count ?? 0, error: null };
  } catch (err: unknown) {
    console.error('[getStudents unexpected error]', err);
    return { data: [], count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getStudentById(id: string): Promise<{ data: Student | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as Student, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getStudentDossier(
  studentId: string
): Promise<{ data: StudentDossier | null; error: string | null }> {
  try {
    const supabase = await createServerClient();

    // 1. Fetch Student
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (stuErr || !student) {
      return { data: null, error: stuErr?.message || 'Student not found' };
    }

    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();

    // 2. Fetch enrolments with explicit FK hints
    const { data: enrolmentsRaw } = await supabase
      .from('enrolments')
      .select('id, enrolment_number, agreed_tuition_fee, enrolment_date, completion_attendance_pct, certificate_issued, certificate_number, status, programmes!fk_enrolments_programme_tenant(name), cohorts!fk_enrolments_cohort_tenant(name)')
      .eq('student_id', studentId);

    // 3. Fetch invoices by name or email
    let invoicesQuery = supabase
      .from('invoices')
      .select('id, invoice_no, total_amount, status, invoice_date, student_name, student_email');

    if (fullName) {
      invoicesQuery = invoicesQuery.or(`student_name.ilike.%${fullName}%,student_email.ilike.%${student.email || '___none___'}%`);
    } else if (student.email) {
      invoicesQuery = invoicesQuery.eq('student_email', student.email);
    }

    const { data: invoicesRaw } = await invoicesQuery;
    const invList = invoicesRaw || [];
    const invIds = invList.map((i) => i.id);

    // 4. Fetch payments for those invoices
    let paymentsRaw: Array<Record<string, unknown>> = [];
    if (invIds.length > 0) {
      const { data: payData } = await supabase
        .from('payments')
        .select('id, receipt_no, amount, payment_date, payment_method, invoice_id')
        .in('invoice_id', invIds);
      paymentsRaw = payData || [];
    }

    const enrolments = (enrolmentsRaw ?? []).map((e: Record<string, unknown>) => ({
      id: String(e.id || ''),
      enrolment_number: String(e.enrolment_number || 'ENR-—'),
      programme_name: String((e.programmes as { name?: string } | undefined)?.name || 'General Programme'),
      cohort_name: String((e.cohorts as { name?: string } | undefined)?.name || 'General Cohort'),
      status: String(e.status || ''),
      agreed_tuition_fee: Number(e.agreed_tuition_fee || 0),
      enrolment_date: String(e.enrolment_date || ''),
      attendance_pct: Number(e.completion_attendance_pct || 0),
      certificate_issued: Boolean(e.certificate_issued),
      certificate_number: (e.certificate_number as string | null) || null,
    }));

    const invoices = invList.map((inv: Record<string, unknown>) => ({
      id: String(inv.id || ''),
      invoice_number: String(inv.invoice_no || 'INV-—'),
      amount: Number(inv.total_amount || 0),
      balance: 0,
      status: String(inv.status || 'UNPAID'),
      issue_date: String(inv.invoice_date || ''),
    }));

    const payments = paymentsRaw.map((p) => ({
      id: String(p.id || ''),
      receipt_number: String(p.receipt_no || 'REC-—'),
      amount: Number(p.amount || 0),
      payment_date: String(p.payment_date || ''),
      method: String(p.payment_method || 'TRANSFER'),
    }));

    const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = Math.max(0, totalInvoiced - totalPaid);

    return {
      data: {
        student: student as Student,
        enrolments,
        invoices,
        payments,
        totalInvoiced,
        totalPaid,
        balanceDue,
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
