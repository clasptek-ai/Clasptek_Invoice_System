/**
 * lib/finance/receivables-queries.ts — Authoritative Server Queries for Receivables & Collections
 * Phase 9C: Finance Completion & Financial Operations Migration
 *
 * Implements:
 * - Strict Financial Invariant: Outstanding Balance = Invoice Total - Payments Applied
 * - Authoritative 5-Bucket Ageing Analysis (Current, 1-30d, 31-60d, 61-90d, 90+d)
 * - Priority scoring algorithm (Balance + Days Overdue)
 * - Collection notes management (`collection_notes`) & audit logging
 */

import { createServerClient } from '@/lib/supabase/server';
import { getFinanceTenantId, recordFinanceAuditLog } from '@/lib/finance/queries';
import type {
  Invoice,
  ReceivablesAgeingBuckets,
  CollectionPriority,
  CollectionNote,
} from '@/types/finance';

export function calculateReceivablePriority(
  balance: number,
  dueDateStr: string,
  clientName: string,
  invoiceId?: string
): CollectionPriority {
  const today = new Date();
  const dueDate = new Date(dueDateStr);
  const diffTime = today.getTime() - dueDate.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  let score = 0;
  if (balance >= 200000) score += 40;
  else if (balance >= 100000) score += 28;
  else if (balance >= 50000) score += 18;
  else if (balance > 0) score += 10;

  if (daysOverdue >= 60) score += 40;
  else if (daysOverdue >= 30) score += 28;
  else if (daysOverdue >= 14) score += 18;
  else if (daysOverdue > 0) score += 10;

  let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  let recommendedAction = 'Automated Email Payment Reminder';
  let actionType: 'Email' | 'WhatsApp' | 'Phone Call' | 'Escalation' = 'Email';

  if (score >= 70) {
    priority = 'CRITICAL';
    recommendedAction = 'Immediate Escalation & In-Person Follow-up';
    actionType = 'Escalation';
  } else if (score >= 45) {
    priority = 'HIGH';
    recommendedAction = 'Direct Phone Call & Payment Plan Negotiation';
    actionType = 'Phone Call';
  } else if (score >= 25) {
    priority = 'MEDIUM';
    recommendedAction = 'WhatsApp Reminder with Outstanding Statement';
    actionType = 'WhatsApp';
  }

  return {
    score,
    priority,
    recommendedAction,
    actionType,
    balance,
    daysOverdue,
    clientName,
    invoiceId,
  };
}

export async function getReceivablesAgeing(tenantId?: string): Promise<{
  buckets: ReceivablesAgeingBuckets;
  outstandingInvoices: Array<
    Invoice & {
      balanceAmount: number;
      paidAmount: number;
      daysOverdue: number;
      priority: CollectionPriority;
    }
  >;
}> {
  const resolvedTenant = tenantId || (await getFinanceTenantId());
  const supabase = await createServerClient();

  const [invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', resolvedTenant)
      .not('status', 'in', '("voided","cancelled")')
      .order('due_date', { ascending: true })
      .order('invoice_no', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', resolvedTenant),
  ]);

  const rawInvoices = invoicesRes.data || [];
  const rawPayments = paymentsRes.data || [];

  const paymentsByInvoice: Record<string, number> = {};
  for (const p of rawPayments) {
    if (!p.invoice_id) continue;
    paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] || 0) + Number(p.amount || 0);
  }

  const buckets: ReceivablesAgeingBuckets = {
    current: { count: 0, amount: 0, invoices: [] },
    days1to30: { count: 0, amount: 0, invoices: [] },
    days31to60: { count: 0, amount: 0, invoices: [] },
    days61to90: { count: 0, amount: 0, invoices: [] },
    days90Plus: { count: 0, amount: 0, invoices: [] },
    totalOutstanding: 0,
    totalOverdue: 0,
  };

  const today = new Date();
  const outstandingInvoices: Array<
    Invoice & {
      balanceAmount: number;
      paidAmount: number;
      daysOverdue: number;
      priority: CollectionPriority;
    }
  > = [];

  for (const inv of rawInvoices) {
    const totalAmount = Number(inv.total_amount || 0);
    const paidAmount = paymentsByInvoice[inv.id] || 0;
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    if (balanceAmount <= 0) continue; // Fully paid, skip

    const dueDateStr = inv.due_date || inv.invoice_date || new Date().toISOString().slice(0, 10);
    const dueDate = new Date(dueDateStr);
    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysOverdue = Math.max(0, diffDays);

    const invoiceObj: Invoice = {
      id: inv.id,
      tenantId: inv.tenant_id,
      invoiceNo: inv.invoice_no,
      invoiceDisplayNo: `INV-${String(inv.invoice_no).padStart(4, '0')}`,
      programmeId: inv.programme_id,
      studentName: inv.student_name,
      studentEmail: inv.student_email,
      studentPhone: inv.student_phone,
      invoiceDate: inv.invoice_date,
      dueDate: dueDateStr,
      paymentPlan: inv.payment_plan,
      installmentsCount: inv.installments_count,
      basePrice: Number(inv.base_price || 0),
      discountPct: Number(inv.discount_pct || 0),
      discountAmount: Number(inv.discount_amount || 0),
      totalAmount,
      incomeCategory: inv.income_category,
      status: inv.status,
      source: inv.source || 'supabase_app',
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      paidAmount,
      balanceAmount,
    };

    const priority = calculateReceivablePriority(
      balanceAmount,
      dueDateStr,
      inv.student_name,
      inv.id
    );

    buckets.totalOutstanding = Number((buckets.totalOutstanding + balanceAmount).toFixed(2));

    if (diffDays <= 0) {
      buckets.current.count++;
      buckets.current.amount = Number((buckets.current.amount + balanceAmount).toFixed(2));
      buckets.current.invoices.push(invoiceObj);
    } else {
      buckets.totalOverdue = Number((buckets.totalOverdue + balanceAmount).toFixed(2));
      if (diffDays <= 30) {
        buckets.days1to30.count++;
        buckets.days1to30.amount = Number((buckets.days1to30.amount + balanceAmount).toFixed(2));
        buckets.days1to30.invoices.push(invoiceObj);
      } else if (diffDays <= 60) {
        buckets.days31to60.count++;
        buckets.days31to60.amount = Number((buckets.days31to60.amount + balanceAmount).toFixed(2));
        buckets.days31to60.invoices.push(invoiceObj);
      } else if (diffDays <= 90) {
        buckets.days61to90.count++;
        buckets.days61to90.amount = Number((buckets.days61to90.amount + balanceAmount).toFixed(2));
        buckets.days61to90.invoices.push(invoiceObj);
      } else {
        buckets.days90Plus.count++;
        buckets.days90Plus.amount = Number((buckets.days90Plus.amount + balanceAmount).toFixed(2));
        buckets.days90Plus.invoices.push(invoiceObj);
      }
    }

    outstandingInvoices.push({
      ...invoiceObj,
      balanceAmount,
      paidAmount,
      daysOverdue,
      priority,
    });
  }

  // Sort by highest priority score descending
  outstandingInvoices.sort((a, b) => b.priority.score - a.priority.score);

  return { buckets, outstandingInvoices };
}

export async function getCollectionNotes(
  tenantId: string,
  invoiceId: string
): Promise<CollectionNote[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('collection_notes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching collection notes:', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    note: row.note,
    promisedDate: row.promised_date,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export async function addCollectionNote(
  tenantId: string,
  actor: { id?: string; name?: string; role?: string },
  data: {
    invoiceId: string;
    note: string;
    promisedDate?: string;
  }
): Promise<{ success: boolean; note?: CollectionNote; error?: string }> {
  if (!data.note || !data.note.trim()) {
    return { success: false, error: 'Collection note text is required.' };
  }

  const supabase = await createServerClient();
  const noteId = `cn_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const now = new Date().toISOString();

  const insertPayload = {
    id: noteId,
    tenant_id: tenantId,
    invoice_id: data.invoiceId,
    note: data.note.trim(),
    promised_date: data.promisedDate || null,
    created_at: now,
    created_by: actor.id || null,
  };

  const { error } = await supabase.from('collection_notes').insert(insertPayload);
  if (error) {
    return { success: false, error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'ADD_COLLECTION_NOTE',
    entityType: 'invoice',
    entityId: data.invoiceId,
    entityName: `Collection Note on Invoice ${data.invoiceId}`,
    actorId: actor.id || null,
    actorRole: actor.role || 'Staff',
    reason: `Collection note recorded: ${data.note.slice(0, 50)}...`,
    newState: insertPayload as unknown as Record<string, unknown>,
    source: 'nextjs_finance_app',
  });

  return {
    success: true,
    note: {
      id: noteId,
      tenantId,
      invoiceId: data.invoiceId,
      note: data.note.trim(),
      promisedDate: data.promisedDate,
      createdAt: now,
      createdBy: actor.id || null,
    },
  };
}
