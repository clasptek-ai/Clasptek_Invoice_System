/**
 * types/ess.ts — Type definitions for Employee Self-Service (ESS)
 * Phase 9E: User Workspaces Migration
 */

export interface EmployeeProfile {
  id: string;
  tenantId: string;
  userId?: string | null;
  employeeId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeType: 'staff' | 'facilitator';
  department: string;
  jobTitle: string;
  employmentStatus: 'active' | 'probation' | 'suspended' | 'deactivated';
  dateJoined?: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  compensationType: 'salaried' | 'per_session' | 'commission';
  basicPay: number;
  facilitatorRate?: number;
  rateType?: string;
  notes?: string | null;
  taxNumber?: string | null;
  feeStructure?: string | null;
}

export interface PayrollQuery {
  id: string;
  payslipId: string;
  payslipNo: number | string;
  payPeriod: string;
  queryReason: string;
  queryComment: string;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  resolvedBy?: string | null;
}

export interface EmployeePayslip {
  id: string;
  tenantId: string;
  payslipNo: number;
  payslipDisplayNo: string;
  personnelId: string;
  employeeName: string;
  employeeType: string;
  department: string;
  role: string;
  payPeriod: string;
  payDate: string;
  basicPay: number;
  allowances: Array<{ description: string; amount: number }>;
  grossPay: number;
  deductions: Array<{ description: string; amount: number }>;
  totalDeductions: number;
  netPay: number;
  status: 'draft' | 'issued' | 'acknowledged' | 'approved' | 'paid' | 'cancelled';
  statementVersion: number;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgementRemarks?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  paidAmount?: number;
  actualPaymentDate?: string | null;
  paymentMethod?: string | null;
  queries: PayrollQuery[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeSession {
  id: string;
  cohortId: string;
  cohortCode: string;
  cohortName: string;
  programmeId: string;
  programmeName: string;
  sessionNumber: number;
  sessionTitle: string;
  sessionDescription?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  deliveryMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  location?: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'ATTENDANCE_PENDING' | 'CANCELLED';
  attendedCount?: number;
  totalStudents?: number;
}
