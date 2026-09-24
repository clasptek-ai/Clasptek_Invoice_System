/**
 * types/finance.ts — Core Data Contracts for Phase 6 Finance & Payroll
 * Aligned strictly with PostgreSQL tables:
 * - public.invoices
 * - public.invoice_items
 * - public.payments
 * - public.payslips
 * - public.personnel
 * - public.finance_audit_log
 * - public.customers
 */

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'voided' | 'cancelled' | 'overdue';

export type PaymentPlan = 'full' | 'installment';

export type PaymentMethod = 
  | 'Bank Transfer' 
  | 'POS' 
  | 'Card' 
  | 'Online Payment' 
  | 'Payment Gateway' 
  | 'Cash' 
  | 'Other';

export type ReconciliationStatus = 'unreconciled' | 'matched' | 'reconciled';

export type PayslipStatus = 'draft' | 'issued' | 'acknowledged' | 'approved' | 'paid' | 'cancelled';

export type EmployeeType = 'staff' | 'facilitator';

export interface InvoiceItem {
  id?: string;
  tenantId?: string;
  invoiceId?: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNo: number;
  invoiceDisplayNo: string;
  programmeId: string;
  programmeName?: string;
  customerId?: string | null;
  studentName: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  invoiceDate: string;
  dueDate: string;
  paymentPlan: PaymentPlan;
  installmentsCount: number;
  basePrice: number;
  discountPct: number;
  discountAmount: number;
  totalAmount: number;
  incomeCategory: string;
  status: InvoiceStatus;
  installmentDetails?: Array<{
    dueDate: string;
    amount: number;
    description: string;
    isPaid?: boolean;
  }>;
  source: string;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  // Computed fields for UI reconciliation
  paidAmount?: number;
  balanceAmount?: number;
  items?: InvoiceItem[];
}

export interface Payment {
  id: string;
  tenantId: string;
  receiptNo: number;
  receiptDisplayNo: string;
  invoiceId: string;
  invoiceDisplayNo?: string;
  studentName?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  paymentDate: string;
  notes?: string | null;
  reconciliationStatus: ReconciliationStatus;
  source: string;
  createdAt: string;
  createdBy?: string | null;
}

export interface AllowanceDeductionItem {
  description: string;
  amount: number;
}

export interface Payslip {
  id: string;
  tenantId: string;
  payslipNo: number;
  payslipDisplayNo: string;
  personnelId: string;
  employeeName: string;
  employeeType: EmployeeType;
  department: string;
  role: string;
  payPeriod: string; // YYYY-MM
  payDate: string;   // YYYY-MM-DD
  basicPay: number;
  allowances: AllowanceDeductionItem[];
  grossPay: number;
  deductions: AllowanceDeductionItem[];
  totalDeductions: number;
  netPay: number;
  status: PayslipStatus;
  statementVersion: number;
  payslipHash?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgementMethod?: string | null;
  acknowledgementRemarks?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  paidAmount?: number | null;
  actualPaymentDate?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  linkedExpenseId?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  queries?: Array<{
    id: string;
    subject: string;
    message: string;
    status: 'open' | 'under_review' | 'resolved';
    createdAt: string;
  }>;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Personnel {
  id: string;
  tenantId: string;
  userId?: string | null;
  employeeId: string; // EMP-#### or FAC-####
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  employeeType: EmployeeType;
  department: string;
  jobTitle: string;
  employmentStatus: 'active' | 'on_leave' | 'suspended' | 'deactivated' | 'terminated';
  dateJoined?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  compensationType: string;
  basicPay: number;
  facilitatorRate?: number;
  rateType?: string;
  notes?: string | null;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
}

export interface FinanceAuditLogEntry {
  id: string;
  tenantId: string;
  action: string;
  entityType:
    | 'invoice'
    | 'payment'
    | 'payslip'
    | 'receipt'
    | 'direct_income'
    | 'expense'
    | 'system'
    | 'personnel'
    | 'user'
    | 'finance_period'
    | 'finance_settings'
    | 'payment_account'
    | 'internal_transfer';
  entityId: string;
  entityName?: string | null;
  oldState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
  actorId?: string | null;
  actorRole: string;
  source: string;
  createdAt: string;
}

export interface FinancialMetrics {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueAmount: number;
  invoiceCounts: {
    total: number;
    unpaid: number;
    partial: number;
    paid: number;
    overdue: number;
    cancelled: number;
  };
  paymentCounts: {
    total: number;
    reconciled: number;
    unreconciled: number;
  };
  payroll: {
    draftPayroll: number;
    pendingAcknowledgement: number;
    pendingApproval: number;
    approvedReady: number;
    paidTotal: number;
    draftCount: number;
    issuedCount: number;
    acknowledgedCount: number;
    approvedCount: number;
    paidCount: number;
  };
}

// ----------------------------------------------------
// PHASE 9C: EXPENSES DATA CONTRACTS
// ----------------------------------------------------
export type ExpenseStatus = 'recorded' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'voided';

export interface Expense {
  id: string;
  tenantId: string;
  categoryGroup: string;
  subCategory: string;
  amount: number;
  expenseDate: string;
  description: string;
  beneficiary: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  programmeId?: string | null;
  status: ExpenseStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  cancelledReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  department?: string;
  source: string;
  createdAt: string;
  createdBy?: string | null;
}

// ----------------------------------------------------
// PHASE 9C: FUNDS & TRANSFERS DATA CONTRACTS
// ----------------------------------------------------
export interface PaymentAccount {
  id: string;
  tenantId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType?: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
}

export interface InternalTransfer {
  id: string;
  tenantId: string;
  fromAccountId: string;
  toAccountId: string;
  fromBank: string;
  toBank: string;
  amount: number;
  date: string;
  reference: string;
  reason?: string | null;
  isRevenue: false; // Explicit non-revenue invariant
  recordedBy?: string | null;
  createdAt: string;
}

export interface CreditedAccountDistribution {
  accountId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  total: number;
  count: number;
}

// ----------------------------------------------------
// PHASE 9C: RECEIVABLES & COLLECTIONS DATA CONTRACTS
// ----------------------------------------------------
export interface AgeingBucketInfo {
  count: number;
  amount: number;
  invoices: Invoice[];
}

export interface ReceivablesAgeingBuckets {
  current: AgeingBucketInfo;
  days1to30: AgeingBucketInfo;
  days31to60: AgeingBucketInfo;
  days61to90: AgeingBucketInfo;
  days90Plus: AgeingBucketInfo;
  totalOutstanding: number;
  totalOverdue: number;
}

export interface CollectionNote {
  id: string;
  tenantId: string;
  invoiceId: string;
  note: string;
  promisedDate?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface CollectionPriority {
  score: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction: string;
  actionType: 'Email' | 'WhatsApp' | 'Phone Call' | 'Escalation';
  balance: number;
  daysOverdue: number;
  clientName: string;
  invoiceId?: string | null;
}

// ----------------------------------------------------
// PHASE 9C: BUDGETS & PLANNING DATA CONTRACTS
// ----------------------------------------------------
export interface FinancialBudget {
  id: string;
  tenantId: string;
  financialYear: string;
  periodType: 'annual' | 'quarterly' | 'monthly';
  periodKey: string;
  department: string;
  totalBudgetAmount: number;
  allocatedBy: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLine {
  id: string;
  tenantId: string;
  budgetId: string;
  category: string;
  subCategory?: string | null;
  monthKey: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetVsActualCategory {
  category: string;
  department: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  utilizationPct: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  status: 'UNDER_BUDGET' | 'NEAR_LIMIT' | 'OVER_BUDGET';
  subCategories?: Record<string, { budgetAmount: number; actualAmount: number }>;
}

export interface BudgetVsActualSummary {
  financialYear: string;
  periodKey: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  overallUtilizationPct: number;
  categories: BudgetVsActualCategory[];
  overBudgetCategories: BudgetVsActualCategory[];
  nearLimitCategories: BudgetVsActualCategory[];
  hasOverspending: boolean;
}

