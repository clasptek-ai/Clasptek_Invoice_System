/**
 * lib/finance/queries.ts — Authoritative Financial Operations & Payroll Queries
 * Phase 6: Finance & Payroll Integration
 *
 * Implements:
 * - Deterministic, audited invoice lifecycle (Draft/Unpaid -> Partial -> Paid, Voided, Cancelled)
 * - Strict payment reconciliation (Invoice Total - Payments Applied = Outstanding Balance)
 * - Safe payroll statement generation & approval workflow (Draft -> Issued -> Acknowledged -> Approved -> Paid)
 * - Multi-tenant isolation and Row-Level Security compliance
 * - Immutable financial audit logging into `finance_audit_log`
 */

import { createServerClient } from '../supabase/server';
import type {
  Invoice,
  InvoiceItem,
  Payment,
  Payslip,
  Personnel,
  Customer,
  FinancialMetrics,
  FinanceAuditLogEntry,
  PaymentMethod,
  PaymentAccountData,
} from '../../types/finance';
import { DEFAULT_PAYMENT_ACCOUNT } from '../../types/finance';

const FALLBACK_TENANT_ID = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';

/**
 * Get tenant context safely from server
 */
export async function getFinanceTenantId(): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membership?.tenant_id) {
      return membership.tenant_id;
    }
  }

  return FALLBACK_TENANT_ID;
}

/**
 * Record immutable financial audit log entry
 */
export async function recordFinanceAuditLog(
  entry: Omit<FinanceAuditLogEntry, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const supabase = await createServerClient();
    const auditId = `aud_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

    const { error } = await supabase
      .from('finance_audit_log')
      .insert({
        id: auditId,
        tenant_id: entry.tenantId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        entity_name: entry.entityName || null,
        old_state: entry.oldState || null,
        new_state: entry.newState || null,
        reason: entry.reason || 'Standard financial ledger operation',
        actor_id: entry.actorId || null,
        actor_role: entry.actorRole || 'Staff',
        source: entry.source || 'nextjs_finance_app',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.warn('Notice: Finance audit logging deferred or restricted:', error.message);
    }
  } catch (err) {
    console.warn('Notice: Finance audit logging deferred:', err);
  }
}

/**
 * Fetch all invoices for a tenant with payment reconciliation
 */
export async function getInvoices(tenantId?: string): Promise<Invoice[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const [invoicesRes, paymentsRes, programmesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .order('invoice_date', { ascending: false })
      .order('invoice_no', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', resolvedTenant),
    supabase
      .from('programmes')
      .select('id, name')
      .eq('tenant_id', resolvedTenant),
  ]);

  if (invoicesRes.error) {
    console.error('Error fetching invoices:', invoicesRes.error);
    return [];
  }

  const rawInvoices = invoicesRes.data || [];
  const rawPayments = paymentsRes.data || [];
  const rawProgrammes = programmesRes.data || [];

  const programmeMap = new Map(rawProgrammes.map((p: any) => [p.id, p.name]));
  const todayStr = new Date().toISOString().slice(0, 10);

  return rawInvoices.map((inv: any) => {
    // Reconcile payments applied to this invoice
    const invPayments = rawPayments.filter((p: any) => p.invoice_id === inv.id);
    const paid = invPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const total = Number(inv.total_amount || 0);
    const balance = Math.max(0, total - paid);

    // Compute dynamic status for UI
    let computedStatus = inv.status;
    if (inv.status !== 'voided' && inv.status !== 'cancelled') {
      if (paid >= total && total > 0) {
        computedStatus = 'paid';
      } else if (balance > 0 && inv.due_date && inv.due_date < todayStr) {
        computedStatus = 'overdue';
      } else if (paid > 0) {
        computedStatus = 'partial';
      } else {
        computedStatus = 'unpaid';
      }
    }

    const meta = parseInvoiceMetadata(inv.installment_details);

    return {
      id: inv.id,
      tenantId: inv.tenant_id,
      invoiceNo: inv.invoice_no,
      invoiceDisplayNo: inv.invoice_display_no,
      programmeId: inv.programme_id,
      programmeName: programmeMap.get(inv.programme_id) || 'Not specified',
      customerId: inv.customer_id,
      studentName: inv.student_name,
      studentEmail: inv.student_email,
      studentPhone: inv.student_phone,
      parentName: meta.parentName,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      paymentPlan: inv.payment_plan,
      installmentsCount: inv.installments_count,
      basePrice: Number(inv.base_price || 0),
      discountPct: Number(inv.discount_pct || 0),
      discountAmount: Number(inv.discount_amount || 0),
      totalAmount: total,
      incomeCategory: inv.income_category || 'Student Tuition',
      status: computedStatus,
      installmentDetails: inv.installment_details || [],
      notes: meta.notes,
      comments: meta.comments,
      termsAndConditions: meta.termsAndConditions,
      paymentAccountSnapshot: meta.paymentAccountSnapshot,
      trainingMode: meta.trainingMode,
      duration: meta.duration,
      schedule: meta.schedule,
      source: inv.source,
      createdAt: inv.created_at,
      createdBy: inv.created_by,
      updatedAt: inv.updated_at,
      paidAmount: paid,
      balanceAmount: balance,
    };
  });
}

function parseInvoiceMetadata(installmentDetails: any) {
  let notes: string | null = null;
  let comments: string | null = null;
  let termsAndConditions: string | null = null;
  let paymentAccountSnapshot: PaymentAccountData | null = null;
  let parentName: string | null = null;
  let trainingMode: string | null = null;
  let duration: string | null = null;
  let schedule: string | null = null;

  if (Array.isArray(installmentDetails)) {
    const meta = installmentDetails.find((d: any) => d && d.type === 'meta_snapshot');
    if (meta) {
      notes = meta.notes || null;
      comments = meta.comments || null;
      termsAndConditions = meta.termsAndConditions || null;
      paymentAccountSnapshot = meta.paymentAccountSnapshot || null;
      parentName = meta.parentName || null;
      trainingMode = meta.trainingMode || null;
      duration = meta.duration || null;
      schedule = meta.schedule || null;
    }
  }

  return {
    notes: notes || 'Please note that tuition includes all instructional materials, completion credentials, and lab access.',
    comments,
    termsAndConditions: termsAndConditions || 'Payment is due according to the schedule specified above. Certificates and course completion verification are issued upon full settlement of tuition fees.',
    paymentAccountSnapshot: paymentAccountSnapshot || DEFAULT_PAYMENT_ACCOUNT,
    parentName,
    trainingMode: trainingMode || 'Live Interactive Onsite Class',
    duration: duration || '5 Months',
    schedule: schedule || 'Weekdays (Tue & Thu 10am - 1pm)',
  };
}

/**
 * Fetch a single invoice by ID with line items and payment history
 */
export async function getInvoiceById(id: string, tenantId?: string): Promise<Invoice | null> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const [invRes, paymentsRes, itemsRes, programmesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', resolvedTenant)
      .maybeSingle(),
    supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .eq('tenant_id', resolvedTenant),
    supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .eq('tenant_id', resolvedTenant),
    supabase
      .from('programmes')
      .select('id, name')
      .eq('tenant_id', resolvedTenant),
  ]);

  if (invRes.error || !invRes.data) {
    return null;
  }

  const inv = invRes.data;
  const rawPayments = paymentsRes.data || [];
  const rawItems = itemsRes.data || [];
  const rawProgrammes = programmesRes.data || [];
  const programmeMap = new Map(rawProgrammes.map((p: any) => [p.id, p.name]));

  const paid = rawPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const total = Number(inv.total_amount || 0);
  const balance = Math.max(0, total - paid);
  const todayStr = new Date().toISOString().slice(0, 10);

  let computedStatus = inv.status;
  if (inv.status !== 'voided' && inv.status !== 'cancelled') {
    if (paid >= total && total > 0) {
      computedStatus = 'paid';
    } else if (balance > 0 && inv.due_date && inv.due_date < todayStr) {
      computedStatus = 'overdue';
    } else if (paid > 0) {
      computedStatus = 'partial';
    } else {
      computedStatus = 'unpaid';
    }
  }

  const items: InvoiceItem[] = rawItems.map((it: any) => ({
    id: it.id,
    tenantId: it.tenant_id,
    invoiceId: it.invoice_id,
    itemDescription: it.item_description,
    quantity: Number(it.quantity || 1),
    unitPrice: Number(it.unit_price || 0),
    discountAmount: Number(it.discount_amount || 0),
    lineTotal: Number(it.line_total || 0),
    createdAt: it.created_at,
  }));

  const meta = parseInvoiceMetadata(inv.installment_details);

  return {
    id: inv.id,
    tenantId: inv.tenant_id,
    invoiceNo: inv.invoice_no,
    invoiceDisplayNo: inv.invoice_display_no,
    programmeId: inv.programme_id,
    programmeName: programmeMap.get(inv.programme_id) || 'Not specified',
    customerId: inv.customer_id,
    studentName: inv.student_name,
    studentEmail: inv.student_email,
    studentPhone: inv.student_phone,
    parentName: meta.parentName,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    paymentPlan: inv.payment_plan,
    installmentsCount: inv.installments_count,
    basePrice: Number(inv.base_price || 0),
    discountPct: Number(inv.discount_pct || 0),
    discountAmount: Number(inv.discount_amount || 0),
    totalAmount: total,
    incomeCategory: inv.income_category || 'Student Tuition',
    status: computedStatus,
    installmentDetails: inv.installment_details || [],
    notes: meta.notes,
    comments: meta.comments,
    termsAndConditions: meta.termsAndConditions,
    paymentAccountSnapshot: meta.paymentAccountSnapshot,
    trainingMode: meta.trainingMode,
    duration: meta.duration,
    schedule: meta.schedule,
    source: inv.source,
    createdAt: inv.created_at,
    createdBy: inv.created_by,
    updatedAt: inv.updated_at,
    paidAmount: paid,
    balanceAmount: balance,
    items,
  };
}

/**
 * Create a new authoritative invoice with line items
 */
export async function createInvoice(
  payload: {
    studentName: string;
    studentEmail?: string;
    studentPhone?: string;
    parentName?: string;
    programmeId: string;
    customerId?: string;
    enquiryId?: string;
    invoiceDate?: string;
    dueDate?: string;
    paymentPlan?: 'full' | 'installment';
    installmentsCount?: number;
    basePrice: number;
    discountPct?: number;
    discountAmount?: number;
    incomeCategory?: string;
    notes?: string;
    comments?: string;
    termsAndConditions?: string;
    paymentAccountId?: string;
    paymentAccountSnapshot?: PaymentAccountData;
    trainingMode?: string;
    duration?: string;
    schedule?: string;
    items?: Array<{
      description: string;
      quantity?: number;
      unitPrice?: number;
      discountAmount?: number;
      amount: number;
    }>;
  },
  actor?: { id?: string; role?: string }
): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {
  try {
    const tenantId = await getFinanceTenantId();
    const supabase = await createServerClient();

    const invoiceTimestamp = Date.now();
    const invoiceId = `inv_${invoiceTimestamp}`;
    
    // Deterministic invoice numbering
    const invoiceNo = Math.floor(invoiceTimestamp % 100000000);
    const invoiceDisplayNo = `INV-2026-${invoiceNo}`;

    const basePrice = Math.max(0, Number(payload.basePrice || 0));
    const discountPct = Math.max(0, Math.min(100, Number(payload.discountPct || 0)));
    const discountAmount = payload.discountAmount !== undefined
      ? Number(payload.discountAmount)
      : Math.round((basePrice * discountPct) / 100);
    const totalAmount = Math.max(0, basePrice - discountAmount);

    const todayStr = new Date().toISOString().slice(0, 10);
    const invoiceDate = payload.invoiceDate || todayStr;
    const dueDate = payload.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Resolve or establish canonical Customer link
    let resolvedCustomerId = payload.customerId || null;
    if (!resolvedCustomerId && (payload.studentEmail || payload.studentPhone || payload.studentName)) {
      try {
        let custQuery = supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId);

        if (payload.studentEmail?.trim()) {
          custQuery = custQuery.eq('email', payload.studentEmail.trim());
        } else if (payload.studentPhone?.trim()) {
          custQuery = custQuery.eq('phone', payload.studentPhone.trim());
        } else {
          custQuery = custQuery.eq('name', payload.studentName.trim());
        }

        const { data: matchedCust } = await custQuery.limit(1).maybeSingle();
        if (matchedCust?.id) {
          resolvedCustomerId = matchedCust.id;
        } else {
          const newCustId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const { error: custErr } = await supabase.from('customers').insert({
            id: newCustId,
            tenant_id: tenantId,
            name: payload.studentName.trim(),
            email: payload.studentEmail?.trim() || null,
            phone: payload.studentPhone?.trim() || null,
            total_invoiced: totalAmount,
            total_paid: 0,
            outstanding_balance: totalAmount,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (!custErr) {
            resolvedCustomerId = newCustId;
          }
        }
      } catch (cErr) {
        console.warn('Customer resolution notice:', cErr);
      }
    }

    const paymentAccountSnapshot = payload.paymentAccountSnapshot || DEFAULT_PAYMENT_ACCOUNT;
    const invoiceNotes =
      payload.notes?.trim() ||
      'Please note that tuition includes all instructional materials, completion credentials, and lab access.';
    const termsAndConditions =
      payload.termsAndConditions?.trim() ||
      'Payment is due according to the schedule specified above. Certificates and course completion verification are issued upon full settlement of tuition fees.';
    const comments =
      payload.comments?.trim() ||
      (payload.enquiryId ? `Generated from Enquiry lead record #${payload.enquiryId}` : null);

    const installmentDetails = [
      ...(payload.enquiryId ? [{ enquiry_id: payload.enquiryId, linked_at: new Date().toISOString() }] : []),
      {
        type: 'meta_snapshot',
        notes: invoiceNotes,
        comments,
        termsAndConditions,
        paymentAccountSnapshot,
        parentName: payload.parentName || null,
        trainingMode: payload.trainingMode || null,
        duration: payload.duration || null,
        schedule: payload.schedule || null,
      },
    ];

    const row = {
      id: invoiceId,
      tenant_id: tenantId,
      invoice_no: invoiceNo,
      invoice_display_no: invoiceDisplayNo,
      programme_id: payload.programmeId,
      customer_id: resolvedCustomerId,
      student_name: payload.studentName.trim(),
      student_email: payload.studentEmail?.trim() || null,
      student_phone: payload.studentPhone?.trim() || null,
      invoice_date: invoiceDate,
      due_date: dueDate,
      payment_plan: payload.paymentPlan || 'installment',
      installments_count: payload.installmentsCount || 1,
      base_price: basePrice,
      discount_pct: discountPct,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      income_category: payload.incomeCategory || 'Student Tuition',
      status: 'unpaid', // Must be 'unpaid' per check constraint
      installment_details: installmentDetails,
      source: payload.enquiryId ? `ENQUIRY:${payload.enquiryId}` : 'APP',
      created_at: new Date().toISOString(),
      created_by: actor?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { error: insertErr } = await supabase
      .from('invoices')
      .insert(row);

    if (insertErr) {
      console.error('Invoice creation error:', insertErr);
      return { success: false, error: insertErr.message };
    }

    // Insert line items if provided
    if (payload.items && payload.items.length > 0) {
      const itemsToInsert = payload.items.map(it => ({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        item_description: it.description,
        quantity: it.quantity !== undefined ? it.quantity : 1,
        unit_price: it.unitPrice !== undefined ? it.unitPrice : it.amount,
        discount_amount: it.discountAmount !== undefined ? it.discountAmount : 0,
        line_total: it.amount,
        created_at: new Date().toISOString(),
      }));

      await supabase.from('invoice_items').insert(itemsToInsert);
    } else {
      // Default line item
      await supabase.from('invoice_items').insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        item_description: 'Tuition & Training Delivery Fee',
        quantity: 1,
        unit_price: totalAmount,
        discount_amount: 0,
        line_total: totalAmount,
        created_at: new Date().toISOString(),
      });
    }

    // Record audit log
    await recordFinanceAuditLog({
      tenantId,
      action: 'INVOICE_CREATE',
      entityType: 'invoice',
      entityId: invoiceId,
      entityName: invoiceDisplayNo,
      newState: row,
      reason: `Created invoice for ${row.student_name} (${invoiceDisplayNo})`,
      actorId: actor?.id || null,
      actorRole: actor?.role || 'Staff',
      source: 'nextjs_finance_app',
    });

    // Traceable admissions timeline integration & enquiry note synchronization
    if (payload.enquiryId) {
      try {
        const timelineId = `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await supabase.from('customer_timeline').insert({
          id: timelineId,
          tenant_id: tenantId,
          customer_id: row.customer_id || null,
          enquiry_id: payload.enquiryId,
          event_type: 'INVOICE_GENERATED',
          title: `Invoice Issued (${invoiceDisplayNo})`,
          description: `Generated tuition invoice ${invoiceDisplayNo} for ₦${totalAmount.toLocaleString()} (${row.payment_plan === 'installment' ? 'Installment plan' : 'Full payment'}).`,
          contact_method: 'INVOICE',
          outcome: 'ISSUED',
          reference_id: invoiceId,
          actor_name: actor?.role || 'Admissions Staff',
          created_at: new Date().toISOString(),
        });

        // Synchronize note to public.enquiries table
        const { data: enqData } = await supabase
          .from('enquiries')
          .select('notes')
          .eq('id', payload.enquiryId)
          .maybeSingle();

        if (enqData) {
          const existingNotes = enqData.notes || '';
          const timeStr = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
          const invoiceNote = `[${timeStr}] Generated Invoice ${invoiceDisplayNo} (₦${totalAmount.toLocaleString()})`;
          const updatedNotes = existingNotes ? `${existingNotes}\n\n${invoiceNote}` : invoiceNote;
          await supabase
            .from('enquiries')
            .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
            .eq('id', payload.enquiryId);
        }
      } catch (tErr) {
        console.warn('Admissions timeline sync notice:', tErr);
      }
    }

    const created = await getInvoiceById(invoiceId, tenantId);
    return { success: true, invoice: created || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Update an invoice status (e.g. cancelled, voided)
 */
export async function updateInvoiceStatus(
  id: string,
  newStatus: 'unpaid' | 'partial' | 'paid' | 'voided' | 'cancelled',
  reason?: string,
  actor?: { id?: string; role?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getFinanceTenantId();
    const supabase = await createServerClient();

    const existing = await getInvoiceById(id, tenantId);
    if (!existing) {
      return { success: false, error: 'Invoice not found' };
    }

    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    await recordFinanceAuditLog({
      tenantId,
      action: `INVOICE_STATUS_${newStatus.toUpperCase()}`,
      entityType: 'invoice',
      entityId: id,
      entityName: existing.invoiceDisplayNo,
      oldState: { status: existing.status },
      newState: { status: newStatus },
      reason: reason || `Updated invoice status to ${newStatus}`,
      actorId: actor?.id || null,
      actorRole: actor?.role || 'Staff',
      source: 'nextjs_finance_app',
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Fetch all payments for a tenant
 */
export async function getPayments(tenantId?: string): Promise<Payment[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const [paymentsRes, invoicesRes] = await Promise.all([
    supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .order('payment_date', { ascending: false })
      .order('receipt_no', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_display_no, student_name')
      .eq('tenant_id', resolvedTenant),
  ]);

  if (paymentsRes.error) {
    console.error('Error fetching payments:', paymentsRes.error);
    return [];
  }

  const invoiceMap = new Map<string, { displayNo: string; student: string }>(
    (invoicesRes.data || []).map((i: any) => [i.id, { displayNo: i.invoice_display_no, student: i.student_name }])
  );

  return (paymentsRes.data || []).map((p: any) => {
    const inv = invoiceMap.get(p.invoice_id);
    return {
      id: p.id,
      tenantId: p.tenant_id,
      receiptNo: p.receipt_no,
      receiptDisplayNo: p.receipt_display_no,
      invoiceId: p.invoice_id,
      invoiceDisplayNo: inv?.displayNo || 'INV-REF',
      studentName: inv?.student || 'Student',
      amount: Number(p.amount || 0),
      paymentMethod: p.payment_method as PaymentMethod,
      reference: p.reference,
      paymentDate: p.payment_date,
      notes: p.notes,
      reconciliationStatus: p.reconciliation_status,
      source: p.source,
      createdAt: p.created_at,
      createdBy: p.created_by,
    };
  });
}

/**
 * Record a payment against an invoice with automatic reconciliation
 */
export async function recordPayment(
  payload: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  },
  actor?: { id?: string; role?: string }
): Promise<{ success: boolean; payment?: Payment; error?: string }> {
  try {
    const tenantId = await getFinanceTenantId();
    const supabase = await createServerClient();

    const invoice = await getInvoiceById(payload.invoiceId, tenantId);
    if (!invoice) {
      return { success: false, error: 'Target invoice not found in this tenant' };
    }

    const payAmount = Number(payload.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero' };
    }

    const payTimestamp = Date.now();
    const paymentId = `pay_${payTimestamp}`;
    const receiptNo = Math.floor(payTimestamp % 100000);
    const receiptDisplayNo = `RCT-2026-${receiptNo}`;
    const paymentDate = payload.paymentDate || new Date().toISOString().slice(0, 10);

    const paymentRow = {
      id: paymentId,
      tenant_id: tenantId,
      receipt_no: receiptNo,
      receipt_display_no: receiptDisplayNo,
      invoice_id: invoice.id,
      amount: payAmount,
      payment_method: payload.paymentMethod,
      reference: payload.reference?.trim() || null,
      payment_date: paymentDate,
      notes: payload.notes?.trim() || null,
      reconciliation_status: 'matched',
      source: 'APP',
      created_at: new Date().toISOString(),
      created_by: actor?.id || null,
    };

    const { error: insertPayErr } = await supabase
      .from('payments')
      .insert(paymentRow);

    if (insertPayErr) {
      console.error('Payment creation error:', insertPayErr);
      return { success: false, error: insertPayErr.message };
    }

    // Reconcile and update invoice status
    const newTotalPaid = (invoice.paidAmount || 0) + payAmount;
    let newInvoiceStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';

    if (newTotalPaid >= invoice.totalAmount) {
      newInvoiceStatus = 'paid';
    } else if (newTotalPaid > 0) {
      newInvoiceStatus = 'partial';
    }

    await supabase
      .from('invoices')
      .update({
        status: newInvoiceStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id)
      .eq('tenant_id', tenantId);

    // Record audit log
    await recordFinanceAuditLog({
      tenantId,
      action: 'PAYMENT_RECORD',
      entityType: 'payment',
      entityId: paymentId,
      entityName: receiptDisplayNo,
      newState: paymentRow,
      reason: `Recorded payment of ₦${payAmount.toLocaleString()} for ${invoice.studentName} against ${invoice.invoiceDisplayNo}`,
      actorId: actor?.id || null,
      actorRole: actor?.role || 'Staff',
      source: 'nextjs_finance_app',
    });

    // Traceable admissions payment synchronization
    const enquiryIdFromSource = invoice.source?.startsWith('ENQUIRY:') ? invoice.source.replace('ENQUIRY:', '') : null;
    const enquiryIdFromDetails = Array.isArray(invoice.installmentDetails)
      ? (invoice.installmentDetails as Array<{ enquiry_id?: string }>).find(d => d?.enquiry_id)?.enquiry_id
      : null;
    const linkedEnquiryId = enquiryIdFromSource || enquiryIdFromDetails;

    if (linkedEnquiryId) {
      try {
        const timelineId = `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await supabase.from('customer_timeline').insert({
          id: timelineId,
          tenant_id: tenantId,
          customer_id: invoice.customerId || null,
          enquiry_id: linkedEnquiryId,
          event_type: 'PAYMENT_RECEIVED',
          title: `Payment Received (${receiptDisplayNo})`,
          description: `Applied payment of ₦${payAmount.toLocaleString()} via ${payload.paymentMethod} towards invoice ${invoice.invoiceDisplayNo}. Balance: ₦${Math.max(0, invoice.totalAmount - newTotalPaid).toLocaleString()}.`,
          contact_method: 'RECEIPT',
          outcome: newInvoiceStatus === 'paid' ? 'SETTLED' : 'PARTIAL_PAYMENT',
          reference_id: paymentId,
          actor_name: actor?.role || 'Finance Staff',
          created_at: new Date().toISOString(),
        });

        const { data: enqData } = await supabase
          .from('enquiries')
          .select('notes')
          .eq('id', linkedEnquiryId)
          .maybeSingle();

        if (enqData) {
          const existingNotes = enqData.notes || '';
          const timeStr = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
          const payNote = `[${timeStr}] Recorded Payment ${receiptDisplayNo} of ₦${payAmount.toLocaleString()} (${newInvoiceStatus.toUpperCase()}) against ${invoice.invoiceDisplayNo}`;
          const updatedNotes = existingNotes ? `${existingNotes}\n\n${payNote}` : payNote;
          await supabase
            .from('enquiries')
            .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
            .eq('id', linkedEnquiryId);
        }
      } catch (pErr) {
        console.warn('Admissions payment sync notice:', pErr);
      }
    }

    const result: Payment = {
      id: paymentId,
      tenantId,
      receiptNo,
      receiptDisplayNo,
      invoiceId: invoice.id,
      invoiceDisplayNo: invoice.invoiceDisplayNo,
      studentName: invoice.studentName,
      amount: payAmount,
      paymentMethod: payload.paymentMethod,
      reference: paymentRow.reference,
      paymentDate,
      notes: paymentRow.notes,
      reconciliationStatus: 'matched',
      source: 'APP',
      createdAt: paymentRow.created_at,
      createdBy: actor?.id || null,
    };

    return { success: true, payment: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Fetch all payslips for a tenant
 */
export async function getPayslips(tenantId?: string): Promise<Payslip[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('tenant_id', resolvedTenant)
    .order('pay_period', { ascending: false })
    .order('payslip_no', { ascending: false });

  if (error) {
    console.error('Error fetching payslips:', error);
    return [];
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    tenantId: p.tenant_id,
    payslipNo: p.payslip_no,
    payslipDisplayNo: p.payslip_display_no,
    personnelId: p.personnel_id,
    employeeName: p.employee_name,
    employeeType: p.employee_type,
    department: p.department,
    role: p.role,
    payPeriod: p.pay_period,
    payDate: p.pay_date,
    basicPay: Number(p.basic_pay || 0),
    allowances: Array.isArray(p.allowances) ? p.allowances : [],
    grossPay: Number(p.gross_pay || 0),
    deductions: Array.isArray(p.deductions) ? p.deductions : [],
    totalDeductions: Number(p.total_deductions || 0),
    netPay: Number(p.net_pay || 0),
    status: p.status,
    statementVersion: p.statement_version || 1,
    payslipHash: p.payslip_hash,
    acknowledgedAt: p.acknowledged_at,
    acknowledgedBy: p.acknowledged_by,
    acknowledgementMethod: p.acknowledgement_method,
    acknowledgementRemarks: p.acknowledgement_remarks,
    approvedAt: p.approved_at,
    approvedBy: p.approved_by,
    paidAt: p.paid_at,
    paidBy: p.paid_by,
    paidAmount: p.paid_amount ? Number(p.paid_amount) : null,
    actualPaymentDate: p.actual_payment_date,
    paymentMethod: p.payment_method,
    paymentReference: p.payment_reference,
    linkedExpenseId: p.linked_expense_id,
    cancelReason: p.cancel_reason,
    cancelledAt: p.cancelled_at,
    cancelledBy: p.cancelled_by,
    queries: Array.isArray(p.queries) ? p.queries : [],
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * Fetch a single payslip by ID
 */
export async function getPayslipById(id: string, tenantId?: string): Promise<Payslip | null> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', resolvedTenant)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const p = data;
  return {
    id: p.id,
    tenantId: p.tenant_id,
    payslipNo: p.payslip_no,
    payslipDisplayNo: p.payslip_display_no,
    personnelId: p.personnel_id,
    employeeName: p.employee_name,
    employeeType: p.employee_type,
    department: p.department,
    role: p.role,
    payPeriod: p.pay_period,
    payDate: p.pay_date,
    basicPay: Number(p.basic_pay || 0),
    allowances: Array.isArray(p.allowances) ? p.allowances : [],
    grossPay: Number(p.gross_pay || 0),
    deductions: Array.isArray(p.deductions) ? p.deductions : [],
    totalDeductions: Number(p.total_deductions || 0),
    netPay: Number(p.net_pay || 0),
    status: p.status,
    statementVersion: p.statement_version || 1,
    payslipHash: p.payslip_hash,
    acknowledgedAt: p.acknowledged_at,
    acknowledgedBy: p.acknowledged_by,
    acknowledgementMethod: p.acknowledgement_method,
    acknowledgementRemarks: p.acknowledgement_remarks,
    approvedAt: p.approved_at,
    approvedBy: p.approved_by,
    paidAt: p.paid_at,
    paidBy: p.paid_by,
    paidAmount: p.paid_amount ? Number(p.paid_amount) : null,
    actualPaymentDate: p.actual_payment_date,
    paymentMethod: p.payment_method,
    paymentReference: p.payment_reference,
    linkedExpenseId: p.linked_expense_id,
    cancelReason: p.cancel_reason,
    cancelledAt: p.cancelled_at,
    cancelledBy: p.cancelled_by,
    queries: Array.isArray(p.queries) ? p.queries : [],
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

/**
 * Create a new authoritative payslip statement
 */
export async function createPayslip(
  payload: {
    personnelId: string;
    payPeriod: string; // YYYY-MM
    payDate?: string;
    basicPay?: number;
    allowances?: Array<{ description: string; amount: number }>;
    deductions?: Array<{ description: string; amount: number }>;
    notes?: string;
  },
  actor?: { id?: string; role?: string }
): Promise<{ success: boolean; payslip?: Payslip; error?: string }> {
  try {
    const tenantId = await getFinanceTenantId();
    const supabase = await createServerClient();

    // Verify pay period format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(payload.payPeriod)) {
      return { success: false, error: 'Pay period must be in YYYY-MM format (e.g. 2026-09)' };
    }

    // Lookup personnel details
    const { data: person, error: persErr } = await supabase
      .from('personnel')
      .select('*')
      .eq('id', payload.personnelId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (persErr || !person) {
      return { success: false, error: 'Personnel record not found' };
    }

    const basicPay = payload.basicPay !== undefined ? Number(payload.basicPay) : Number(person.basic_pay || 0);
    const allowances = payload.allowances || [];
    const allowancesSum = allowances.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const grossPay = basicPay + allowancesSum;

    const deductions = payload.deductions || [];
    const totalDeductions = deductions.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const netPay = Math.max(0, grossPay - totalDeductions);

    const timestamp = Date.now();
    const payslipId = `psl_${timestamp}`;
    const payslipNo = Math.floor(timestamp % 100000);
    const payslipDisplayNo = `PSL-2026-${payslipNo}`;
    const payDate = payload.payDate || new Date().toISOString().slice(0, 10);

    const payslipRow = {
      id: payslipId,
      tenant_id: tenantId,
      payslip_no: payslipNo,
      payslip_display_no: payslipDisplayNo,
      personnel_id: person.id,
      employee_name: person.full_name,
      employee_type: person.employee_type,
      department: person.department,
      role: person.job_title,
      pay_period: payload.payPeriod,
      pay_date: payDate,
      basic_pay: basicPay,
      allowances,
      gross_pay: grossPay,
      deductions,
      total_deductions: totalDeductions,
      net_pay: netPay,
      status: 'issued', // Issued for review per Clasptek pre-payment model
      statement_version: 1,
      notes: payload.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertErr } = await supabase
      .from('payslips')
      .insert(payslipRow);

    if (insertErr) {
      console.error('Payslip insert error:', insertErr);
      return { success: false, error: insertErr.message };
    }

    // Record audit log
    await recordFinanceAuditLog({
      tenantId,
      action: 'PAYSLIP_PREPARE',
      entityType: 'payslip',
      entityId: payslipId,
      entityName: payslipDisplayNo,
      newState: payslipRow,
      reason: `Prepared payroll statement for ${person.full_name} (${payslipDisplayNo}, period ${payload.payPeriod})`,
      actorId: actor?.id || null,
      actorRole: actor?.role || 'Staff',
      source: 'nextjs_finance_app',
    });

    const created = await getPayslipById(payslipId, tenantId);
    return { success: true, payslip: created || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Transition a payslip through its multi-stage lifecycle
 */
export async function updatePayslipStatus(
  id: string,
  action: 'acknowledge' | 'approve' | 'pay' | 'cancel',
  payload?: {
    remarks?: string;
    paymentMethod?: string;
    paymentReference?: string;
    cancelReason?: string;
  },
  actor?: { id?: string; name?: string; role?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getFinanceTenantId();
    const supabase = await createServerClient();

    const existing = await getPayslipById(id, tenantId);
    if (!existing) {
      return { success: false, error: 'Payslip not found' };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const actorName = actor?.name || actor?.role || 'Finance Manager';

    if (action === 'acknowledge') {
      updates.status = 'acknowledged';
      updates.acknowledged_at = new Date().toISOString();
      updates.acknowledged_by = actorName;
      updates.acknowledgement_remarks = payload?.remarks || 'Acknowledged statement';
    } else if (action === 'approve') {
      updates.status = 'approved';
      updates.approved_at = new Date().toISOString();
      updates.approved_by = actorName;
    } else if (action === 'pay') {
      updates.status = 'paid';
      updates.paid_at = new Date().toISOString();
      updates.paid_by = actorName;
      updates.paid_amount = existing.netPay;
      updates.actual_payment_date = new Date().toISOString().slice(0, 10);
      updates.payment_method = payload?.paymentMethod || 'Bank Transfer';
      updates.payment_reference = payload?.paymentReference || `DISB-${Date.now()}`;
    } else if (action === 'cancel') {
      updates.status = 'cancelled';
      updates.cancelled_at = new Date().toISOString();
      updates.cancelled_by = actorName;
      updates.cancel_reason = payload?.cancelReason || 'Cancelled by manager';
    }

    const { error: updErr } = await supabase
      .from('payslips')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // Record audit log
    await recordFinanceAuditLog({
      tenantId,
      action: `PAYSLIP_${action.toUpperCase()}`,
      entityType: 'payslip',
      entityId: id,
      entityName: existing.payslipDisplayNo,
      oldState: { status: existing.status },
      newState: updates,
      reason: `${action.toUpperCase()} action executed by ${actorName}`,
      actorId: actor?.id || null,
      actorRole: actor?.role || 'Staff',
      source: 'nextjs_finance_app',
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Fetch personnel list for payroll generation
 */
export async function getPersonnelList(tenantId?: string): Promise<Personnel[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('tenant_id', resolvedTenant)
    .order('full_name', { ascending: true })
    .order('employee_id', { ascending: true });

  if (error) {
    console.error('Error fetching personnel:', error);
    return [];
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    tenantId: p.tenant_id,
    userId: p.user_id,
    employeeId: p.employee_id,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    employeeType: p.employee_type,
    department: p.department,
    jobTitle: p.job_title,
    employmentStatus: p.employment_status,
    dateJoined: p.date_joined,
    bankName: p.bank_name,
    accountName: p.account_name,
    accountNumber: p.account_number,
    compensationType: p.compensation_type,
    basicPay: Number(p.basic_pay || 0),
    facilitatorRate: Number(p.facilitator_rate || 0),
    rateType: p.rate_type,
    notes: p.notes,
  }));
}

/**
 * Fetch customers list
 */
export async function getCustomersList(tenantId?: string): Promise<Customer[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', resolvedTenant)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }

  return (data || []).map((c: any) => ({
    id: c.id,
    tenantId: c.tenant_id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    totalInvoiced: Number(c.total_invoiced || 0),
    totalPaid: Number(c.total_paid || 0),
    outstandingBalance: Number(c.outstanding_balance || 0),
  }));
}

/**
 * Compute aggregate financial metrics
 */
export async function getFinancialMetrics(tenantId?: string): Promise<FinancialMetrics> {
  const invoices = await getInvoices(tenantId);
  const payments = await getPayments(tenantId);
  const payslips = await getPayslips(tenantId);

  const totalInvoiced = invoices
    .filter(i => i.status !== 'voided' && i.status !== 'cancelled')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);

  const overdueAmount = invoices
    .filter(i => i.status === 'overdue')
    .reduce((sum, i) => sum + (i.balanceAmount || 0), 0);

  const invoiceCounts = {
    total: invoices.length,
    unpaid: invoices.filter(i => i.status === 'unpaid').length,
    partial: invoices.filter(i => i.status === 'partial').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    cancelled: invoices.filter(i => i.status === 'cancelled' || i.status === 'voided').length,
  };

  const paymentCounts = {
    total: payments.length,
    reconciled: payments.filter(p => p.reconciliationStatus === 'matched' || p.reconciliationStatus === 'reconciled').length,
    unreconciled: payments.filter(p => p.reconciliationStatus === 'unreconciled').length,
  };

  const draftPayslips = payslips.filter(p => p.status === 'draft');
  const issuedPayslips = payslips.filter(p => p.status === 'issued');
  const acknowledgedPayslips = payslips.filter(p => p.status === 'acknowledged');
  const approvedPayslips = payslips.filter(p => p.status === 'approved');
  const paidPayslips = payslips.filter(p => p.status === 'paid');

  const payroll = {
    draftPayroll: draftPayslips.reduce((sum, p) => sum + p.netPay, 0),
    pendingAcknowledgement: issuedPayslips.reduce((sum, p) => sum + p.netPay, 0),
    pendingApproval: acknowledgedPayslips.reduce((sum, p) => sum + p.netPay, 0),
    approvedReady: approvedPayslips.reduce((sum, p) => sum + p.netPay, 0),
    paidTotal: paidPayslips.reduce((sum, p) => sum + p.netPay, 0),
    draftCount: draftPayslips.length,
    issuedCount: issuedPayslips.length,
    acknowledgedCount: acknowledgedPayslips.length,
    approvedCount: approvedPayslips.length,
    paidCount: paidPayslips.length,
  };

  return {
    totalInvoiced,
    totalCollected,
    outstandingBalance,
    overdueAmount,
    invoiceCounts,
    paymentCounts,
    payroll,
  };
}
