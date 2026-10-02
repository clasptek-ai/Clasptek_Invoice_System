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

    // 1. Fetch Students with optional database-level filtering
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

    // Filter by Programme ID if requested
    if (filters.programmeId && filters.programmeId !== 'ALL') {
      const { data: progEnrs } = await supabase
        .from('enrolments')
        .select('student_id')
        .eq('programme_id', filters.programmeId);
      const matchedStudentIds = Array.from(
        new Set((progEnrs || []).map((e) => e.student_id).filter(Boolean))
      );
      if (matchedStudentIds.length === 0) {
        return { data: [], count: 0, error: null };
      }
      query = query.in('id', matchedStudentIds);
    }

    // Filter by Enrolment Status (ENROLLED vs NOT_ENROLLED)
    if (filters.enrolmentStatus && filters.enrolmentStatus !== 'ALL') {
      const { data: allEnrs } = await supabase.from('enrolments').select('student_id');
      const enrolledStudentIds = Array.from(
        new Set((allEnrs || []).map((e) => e.student_id).filter(Boolean))
      );

      if (filters.enrolmentStatus === 'ENROLLED') {
        if (enrolledStudentIds.length === 0) {
          return { data: [], count: 0, error: null };
        }
        query = query.in('id', enrolledStudentIds);
      } else if (filters.enrolmentStatus === 'NOT_ENROLLED') {
        if (enrolledStudentIds.length > 0) {
          query = query.not('id', 'in', `(${enrolledStudentIds.join(',')})`);
        }
      }
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
    const [enrolmentsRes, programmesRes, invoicesRes, paymentsRes] = await Promise.all([
      supabase
        .from('enrolments')
        .select('id, student_id, programme_id, status, programmes!fk_enrolments_programme_tenant(name)')
        .in('student_id', studentIds),
      supabase
        .from('programmes')
        .select('id, name'),
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

    const programmeMap = new Map<string, string>();
    (programmesRes.data ?? []).forEach((p: { id: string; name: string }) => {
      if (p.id && p.name) programmeMap.set(p.id, p.name);
    });

    const paymentsByInvoice: Record<string, number> = {};
    allPayments.forEach((p) => {
      if (p.invoice_id) {
        paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] || 0) + Number(p.amount || 0);
      }
    });

    // 3. Map into StudentSummary matching legacy getStudentAccountSummaries
    let summaries: StudentSummary[] = students.map((stu: Student) => {
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
        const rawProg = e.programmes;
        const joinedName = Array.isArray(rawProg)
          ? rawProg[0]?.name
          : (rawProg as { name?: string } | undefined)?.name;
        const pName = joinedName || (e.programme_id ? programmeMap.get(e.programme_id) : null);
        if (pName) programmeNames.add(pName);
      });

      let programmesDisplay = 'Not specified';
      if (programmeNames.size > 1) {
        programmesDisplay = `Multiple Programmes (${Array.from(programmeNames).join(', ')})`;
      } else if (programmeNames.size === 1) {
        programmesDisplay = Array.from(programmeNames)[0];
      }

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
        programmes_list: programmesDisplay,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance,
        is_enrolled: stuEnrolments.length > 0,
        financial_status: financialStatus,
        training_status: stu.status,
        status_display: statusDisplay,
      };
    });

    if (filters.financialStatus && filters.financialStatus !== 'ALL') {
      summaries = summaries.filter((s) => s.financial_status === filters.financialStatus);
    }

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
  studentId: string,
  client?: any
): Promise<{ data: StudentDossier | null; error: string | null }> {
  try {
    const supabase = client || (await createServerClient());

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

    // 3. Fetch invoices by customer_id, student_name, or student_email
    let invoicesQuery = supabase
      .from('invoices')
      .select('id, invoice_no, total_amount, status, invoice_date, student_name, student_email, customer_id');

    const orClauses: string[] = [];
    if (student.customer_id) {
      orClauses.push(`customer_id.eq.${student.customer_id}`);
    }
    if (fullName) {
      orClauses.push(`student_name.ilike.%${fullName}%`);
    }
    if (student.email) {
      orClauses.push(`student_email.ilike.%${student.email}%`);
    }

    if (orClauses.length > 0) {
      invoicesQuery = invoicesQuery.or(orClauses.join(','));
    }

    const { data: invoicesRaw } = await invoicesQuery;
    const invList: Array<Record<string, unknown>> = invoicesRaw || [];
    const invIds = invList.map((i: Record<string, unknown>) => String(i.id || ''));

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
      programme_name: String((e.programmes as { name?: string } | undefined)?.name || 'Not specified'),
      cohort_name: String((e.cohorts as { name?: string } | undefined)?.name || 'Unassigned'),
      status: String(e.status || ''),
      agreed_tuition_fee: Number(e.agreed_tuition_fee || 0),
      enrolment_date: String(e.enrolment_date || ''),
      attendance_pct: Number(e.completion_attendance_pct || 0),
      certificate_issued: Boolean(e.certificate_issued),
      certificate_number: (e.certificate_number as string | null) || null,
    }));

    const invoices = invList.map((inv: Record<string, unknown>) => {
      const invId = String(inv.id || '');
      const paidForThisInv = paymentsRaw
        .filter((p: Record<string, unknown>) => String(p.invoice_id) === invId)
        .reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount || 0), 0);
      const invAmount = Number(inv.total_amount || 0);
      return {
        id: invId,
        invoice_number: String(inv.invoice_no || 'INV-—'),
        amount: invAmount,
        balance: Math.max(0, invAmount - paidForThisInv),
        status: String(inv.status || 'UNPAID'),
        issue_date: String(inv.invoice_date || ''),
      };
    });

    const payments = paymentsRaw.map((p) => ({
      id: String(p.id || ''),
      receipt_number: String(p.receipt_no || 'REC-—'),
      amount: Number(p.amount || 0),
      payment_date: String(p.payment_date || ''),
      method: String(p.payment_method || 'TRANSFER'),
    }));

    const totalInvoiced = invoices.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
    const totalPaid = payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    const balanceDue = Math.max(0, totalInvoiced - totalPaid);

    // 5. Fetch linked Corporate Customer / Sponsor if present
    let corporateSponsor: { id: string; name: string; email?: string | null; phone?: string | null } | null = null;
    if (student.customer_id) {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name, email, phone')
        .eq('id', student.customer_id)
        .single();
      if (custData) {
        corporateSponsor = {
          id: String(custData.id),
          name: String(custData.name),
          email: custData.email ? String(custData.email) : null,
          phone: custData.phone ? String(custData.phone) : null,
        };
      }
    }

    return {
      data: {
        student: student as Student,
        corporateSponsor,
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
