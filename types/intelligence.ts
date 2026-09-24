/**
 * types/intelligence.ts — Data Contracts for Phase 7 Management Intelligence & Reporting
 * Consolidates authoritative data from:
 * - Admissions & CRM (enquiries, applications, qualification, conversion)
 * - Students & Academics (students, enrolments, programmes, cohorts)
 * - Training & Meetings (sessions, attendance, facilitator reports, meetings, recordings)
 * - Financial & Payroll (invoices, payments, receivables, personnel, payslips)
 */

export type DateFilterScope = 'all_time' | 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year';

export interface AdmissionsIntelligence {
  totalEnquiries: number;
  totalApplications: number;
  qualifiedApplications: number;
  convertedCount: number;
  conversionRate: number; // percentage
  enquiryStages: Record<string, number>;
  applicationStatusBreakdown: Record<string, number>;
  topProgrammes: Array<{ programmeName: string; count: number }>;
}

export interface AcademicIntelligence {
  activeStudents: number;
  activeEnrolments: number;
  programmesCount: number;
  cohortsCount: number;
  programmeDistribution: Array<{
    programmeId: string;
    programmeName: string;
    code: string;
    studentCount: number;
    tuitionFee: number;
  }>;
  cohortDistribution: Array<{
    cohortId: string;
    cohortCode: string;
    name: string;
    enrolmentCount: number;
    status: string;
  }>;
  enrolmentStatusBreakdown: Record<string, number>;
}

export interface TrainingIntelligence {
  totalSessions: number;
  completedSessions: number;
  scheduledSessions: number;
  attendanceRate: number; // percentage
  attendanceBreakdown: {
    present: number;
    late: number;
    excused: number;
    absent: number;
  };
  totalReportsSubmitted: number;
  facilitatorsActive: number;
}

export interface MeetingIntelligence {
  totalMeetings: number;
  scheduledMeetings: number;
  liveMeetings: number;
  completedMeetings: number;
  cancelledMeetings: number;
  recordingsAvailable: number;
  totalParticipantsEngaged: number;
}

export interface FinancialIntelligence {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueReceivables: number;
  collectionRate: number; // percentage
  invoiceStatusCounts: {
    unpaid: number;
    partial: number;
    paid: number;
    overdue: number;
    cancelled: number;
  };
  recentPayments: Array<{
    receiptNo: string;
    date: string;
    studentName: string;
    amount: number;
    method: string;
  }>;
}

export interface PayrollIntelligence {
  totalStaffCount: number;
  totalFacilitatorCount: number;
  totalPayrollObligation: number;
  draftPayroll: number;
  pendingReviewPayroll: number;
  approvedReadyPayroll: number;
  disbursedPaidPayroll: number;
  payslipCountsByStatus: Record<string, number>;
}

export interface ManagementDashboardMetrics {
  admissions: AdmissionsIntelligence;
  academics: AcademicIntelligence;
  training: TrainingIntelligence;
  meetings: MeetingIntelligence;
  finance: FinancialIntelligence;
  payroll: PayrollIntelligence;
  generatedAt: string;
  tenantId: string;
}

export interface ReportItem {
  id: string;
  category: 'FINANCE' | 'ACADEMIC' | 'TRAINING' | 'ADMISSIONS' | 'PAYROLL';
  referenceNo: string;
  date: string;
  title: string;
  subTitle?: string;
  primaryValue: string | number;
  secondaryValue?: string | number;
  status: string;
}
