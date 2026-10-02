/**
 * lib/students/queries.ts — Phase 4
 * Server-side Data Access Layer for Students & Client Directory.
 * Enforces multi-tenant RLS through createServerClient().
 */

import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Student,
  StudentSummary,
  StudentFilters,
  StudentDossier,
} from '@/types/students';

const PAGE_SIZE = 25;

export interface StudentFinancialSummary {
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
  financialStatus: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NO_INVOICE' | 'OVERDUE';
  statusDisplay: string;
}

/**
 * Authoritative financial aggregation for students and clients.
 * Safely resolves between live transactional records (invoices/payments) and
 * imported historical customer ledger baseline (customers.total_invoiced, total_paid, outstanding_balance)
 * without double-counting.
 */
export function getStudentFinancialSummary(
  student: { id: string; customer_id?: string | null; first_name?: string; last_name?: string; email?: string | null },
  customer?: { id: string; total_invoiced?: number | null; total_paid?: number | null; outstanding_balance?: number | null } | null,
  stuInvoices: Array<{ id: string; total_amount?: number | null; status?: string | null; due_date?: string | null }> = [],
  paymentsByInvoice: Record<string, number> = {}
): StudentFinancialSummary {
  // If student has transactional records in the invoices table, use them as authoritative
  if (stuInvoices && stuInvoices.length > 0) {
    const totalInvoiced = stuInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    const totalPaid = stuInvoices.reduce((sum, inv) => sum + (paymentsByInvoice[inv.id] || 0), 0);
    const balance = Math.max(0, totalInvoiced - totalPaid);

    const hasOverdueInvoice = stuInvoices.some((inv) => {
      const isUnpaidOrPartial = inv.status !== 'paid';
      const isPastDue = inv.due_date && new Date(inv.due_date) < new Date();
      return isUnpaidOrPartial && isPastDue;
    });

    let financialStatus: StudentFinancialSummary['financialStatus'] = 'NO_INVOICE';
    let statusDisplay = 'Prospect';

    if (totalInvoiced > 0 && balance <= 0) {
      financialStatus = 'FULLY_PAID';
      statusDisplay = 'Fully Paid';
    } else if (hasOverdueInvoice) {
      financialStatus = 'OVERDUE';
      statusDisplay = 'Overdue';
    } else if (totalInvoiced > 0 && totalPaid > 0 && balance > 0) {
      financialStatus = 'PARTIALLY_PAID';
      statusDisplay = 'Partial Balance';
    } else if (totalInvoiced > 0) {
      financialStatus = 'UNPAID';
      statusDisplay = 'Outstanding';
    }

    return { totalInvoiced, totalPaid, balance, financialStatus, statusDisplay };
  }

  // Baseline: Use imported customer ledger values
  if (customer) {
    const totalInvoiced = Math.max(0, Number(customer.total_invoiced || 0));
    const totalPaid = Math.max(0, Number(customer.total_paid || 0));
    const balance = Math.max(
      0,
      customer.outstanding_balance !== undefined && customer.outstanding_balance !== null
        ? Number(customer.outstanding_balance)
        : totalInvoiced - totalPaid
    );

    let financialStatus: StudentFinancialSummary['financialStatus'] = 'NO_INVOICE';
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

    return { totalInvoiced, totalPaid, balance, financialStatus, statusDisplay };
  }

  return {
    totalInvoiced: 0,
    totalPaid: 0,
    balance: 0,
    financialStatus: 'NO_INVOICE',
    statusDisplay: 'Prospect',
  };
}

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

    // Filter by Financial Status if requested
    if (filters.financialStatus && filters.financialStatus !== 'ALL') {
      const targetStatus = filters.financialStatus;
      const [allStudentsRes, allCustRes, allInvsRes, allPaysRes] = await Promise.all([
        supabase.from('students').select('id, customer_id, email, first_name, last_name'),
        supabase.from('customers').select('id, total_invoiced, total_paid, outstanding_balance'),
        supabase.from('invoices').select('id, customer_id, student_name, student_email, total_amount, status, due_date'),
        supabase.from('payments').select('id, invoice_id, amount'),
      ]);

      const custMap = new Map((allCustRes.data || []).map((c) => [c.id, c]));
      const paysByInv: Record<string, number> = {};
      (allPaysRes.data || []).forEach((p) => {
        if (p.invoice_id) {
          paysByInv[p.invoice_id] = (paysByInv[p.invoice_id] || 0) + Number(p.amount || 0);
        }
      });

      const matchedStudentIds: string[] = [];
      (allStudentsRes.data || []).forEach((stu) => {
        const cust = stu.customer_id ? custMap.get(stu.customer_id) : null;
        const fullName = `${stu.first_name || ''} ${stu.last_name || ''}`.trim().toLowerCase();
        const lowerEmail = (stu.email || '').toLowerCase();

        const stuInvs = (allInvsRes.data || []).filter((inv) => {
          if (inv.customer_id && stu.customer_id && inv.customer_id === stu.customer_id) return true;
          const invName = (inv.student_name || '').toLowerCase();
          const invEmail = (inv.student_email || '').toLowerCase();
          if (fullName && invName && (invName === fullName || invName.includes(fullName))) return true;
          if (lowerEmail && invEmail && invEmail === lowerEmail) return true;
          return false;
        });

        const summary = getStudentFinancialSummary(stu, cust, stuInvs, paysByInv);
        if (summary.financialStatus === targetStatus) {
          matchedStudentIds.push(stu.id);
        }
      });

      if (matchedStudentIds.length === 0) {
        return { data: [], count: 0, error: null };
      }
      query = query.in('id', matchedStudentIds);
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
    const customerIds = Array.from(new Set(students.map((s) => s.customer_id).filter(Boolean))) as string[];

    // 2. Fetch associated enrolments, programmes, invoices, payments, and customers
    const [enrolmentsRes, programmesRes, invoicesRes, paymentsRes, customersRes] = await Promise.all([
      supabase
        .from('enrolments')
        .select('id, student_id, programme_id, status, programmes!fk_enrolments_programme_tenant(name)')
        .in('student_id', studentIds),
      supabase
        .from('programmes')
        .select('id, name'),
      supabase
        .from('invoices')
        .select('id, invoice_no, total_amount, status, student_name, student_email, customer_id, due_date'),
      supabase
        .from('payments')
        .select('id, invoice_id, amount'),
      customerIds.length > 0
        ? supabase
            .from('customers')
            .select('id, total_invoiced, total_paid, outstanding_balance')
            .in('id', customerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const enrolments = enrolmentsRes.data ?? [];
    const allInvoices = invoicesRes.data ?? [];
    const allPayments = paymentsRes.data ?? [];
    const allCustomers = customersRes.data ?? [];

    const programmeMap = new Map<string, string>();
    (programmesRes.data ?? []).forEach((p: { id: string; name: string }) => {
      if (p.id && p.name) programmeMap.set(p.id, p.name);
    });

    const customerMap = new Map<string, { id: string; total_invoiced?: number; total_paid?: number; outstanding_balance?: number }>();
    allCustomers.forEach((c) => {
      if (c.id) customerMap.set(c.id, c);
    });

    const paymentsByInvoice: Record<string, number> = {};
    allPayments.forEach((p) => {
      if (p.invoice_id) {
        paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] || 0) + Number(p.amount || 0);
      }
    });

    // 3. Map into StudentSummary matching authoritative programme resolution and financial calculations
    const summaries: StudentSummary[] = students.map((stu: Student) => {
      const stuEnrolments = enrolments.filter((e) => e.student_id === stu.id);
      const cust = stu.customer_id ? customerMap.get(stu.customer_id) : null;

      const fullName = `${stu.first_name || ''} ${stu.last_name || ''}`.trim();
      const lowerName = fullName.toLowerCase();
      const lowerEmail = (stu.email || '').toLowerCase();

      const stuInvoices = allInvoices.filter((inv) => {
        if (inv.customer_id && stu.customer_id && inv.customer_id === stu.customer_id) return true;
        const invName = (inv.student_name || '').toLowerCase();
        const invEmail = (inv.student_email || '').toLowerCase();
        if (lowerName && invName && (invName === lowerName || invName.includes(lowerName))) return true;
        if (lowerEmail && invEmail && invEmail === lowerEmail) return true;
        return false;
      });

      // Authoritative financial summary (same calculation drives columns, filter, and dossier)
      const fin = getStudentFinancialSummary(stu, cust, stuInvoices, paymentsByInvoice);

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
        programmesDisplay = 'Multiple Programmes';
      } else if (programmeNames.size === 1) {
        programmesDisplay = Array.from(programmeNames)[0];
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
        total_invoiced: fin.totalInvoiced,
        total_paid: fin.totalPaid,
        balance: fin.balance,
        is_enrolled: stuEnrolments.length > 0,
        financial_status: fin.financialStatus,
        training_status: stu.status,
        status_display: fin.statusDisplay,
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
  studentId: string,
  client?: SupabaseClient
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

    let invoicesRaw: Array<Record<string, unknown>> = [];
    if (orClauses.length > 0) {
      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_no, total_amount, status, invoice_date, due_date, student_name, student_email, customer_id')
        .or(orClauses.join(','));
      invoicesRaw = invData || [];
    }

    const invList = invoicesRaw;
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

    // 5. Fetch linked Corporate Customer / Sponsor if present
    let corporateSponsor: { id: string; name: string; email?: string | null; phone?: string | null } | null = null;
    let customerRow: { id: string; total_invoiced?: number; total_paid?: number; outstanding_balance?: number } | null = null;
    if (student.customer_id) {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name, email, phone, total_invoiced, total_paid, outstanding_balance')
        .eq('id', student.customer_id)
        .single();
      if (custData) {
        customerRow = custData;
        corporateSponsor = {
          id: String(custData.id),
          name: String(custData.name),
          email: custData.email ? String(custData.email) : null,
          phone: custData.phone ? String(custData.phone) : null,
        };
      }
    }

    const paymentsByInvoice: Record<string, number> = {};
    paymentsRaw.forEach((p) => {
      const invId = String(p.invoice_id || '');
      if (invId) {
        paymentsByInvoice[invId] = (paymentsByInvoice[invId] || 0) + Number(p.amount || 0);
      }
    });

    // Authoritative financial calculation identical to directory table
    const typedInvoices = invList.map((i) => ({
      id: String(i.id || ''),
      total_amount: Number(i.total_amount || 0),
      status: String(i.status || ''),
      due_date: (i.due_date as string | null) || null,
    }));
    const finSummary = getStudentFinancialSummary(student, customerRow, typedInvoices, paymentsByInvoice);

    return {
      data: {
        student: student as Student,
        corporateSponsor,
        enrolments,
        invoices,
        payments,
        totalInvoiced: finSummary.totalInvoiced,
        totalPaid: finSummary.totalPaid,
        balanceDue: finSummary.balance,
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
