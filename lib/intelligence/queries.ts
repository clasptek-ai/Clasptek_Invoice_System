/**
 * lib/intelligence/queries.ts — Authoritative Management Intelligence & Reporting Query Layer
 * Phase 7: Management Intelligence & Cross-Module Consolidation
 *
 * Consolidates read-oriented metrics across:
 * - Admissions (Enquiries, Applications, Conversion)
 * - Academics (Students, Enrolments, Programmes, Cohorts)
 * - Training & Meetings (Sessions, Attendance, Reports, LiveKit SFU Meetings)
 * - Finance & Payroll (Invoices, Receipts, Receivables, Personnel, Payslips)
 *
 * Implements strict tenant isolation and zero database modifications.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getFinanceTenantId, getFinancialMetrics } from '@/lib/finance/queries';
import { getReceivablesAgeing } from '@/lib/finance/receivables-queries';
import { getMeetings } from '@/lib/meetings/queries';
import type {
  ManagementDashboardMetrics,
  AdmissionsIntelligence,
  AcademicIntelligence,
  TrainingIntelligence,
  MeetingIntelligence,
  FinancialIntelligence,
  PayrollIntelligence,
  LifecycleMetrics,
  CrmPipelineMetrics,
  StudentActivityMetrics,
  RecentStudentItem,
  UpcomingSessionItem,
  OverdueReceivableItem,
  RecentActivityItem,
  DateFilterScope,
  ReportItem,
} from '@/types/intelligence';

/**
 * Filter dates based on scope
 */
export function getDateFilterThreshold(scope: DateFilterScope): string | null {
  const now = new Date();
  if (scope === 'all_time') return null;

  if (scope === 'today') {
    return now.toISOString().slice(0, 10);
  }
  if (scope === 'this_week') {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return monday.toISOString().slice(0, 10);
  }
  if (scope === 'this_month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (scope === 'this_quarter') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3 + 1;
    return `${now.getFullYear()}-${String(quarterMonth).padStart(2, '0')}-01`;
  }
  if (scope === 'this_year') {
    return `${now.getFullYear()}-01-01`;
  }
  return null;
}

/**
 * Fetch consolidated Management Intelligence Dashboard Metrics
 */
export async function getManagementDashboardMetrics(
  tenantId?: string,
  _scope: DateFilterScope = 'all_time'
): Promise<ManagementDashboardMetrics> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  // Execute queries across modules in parallel
  const [
    enquiriesRes,
    applicationsRes,
    studentsRes,
    enrolmentsRes,
    programmesRes,
    cohortsRes,
    trainingSessionsRes,
    attendanceRes,
    reportsRes,
    meetingsData,
    financeMetrics,
    personnelRes,
    payslipsRes,
    certificatesRes,
    auditLogsRes,
    receivablesAgeingData,
  ] = await Promise.all([
    supabase.from('enquiries').select('id, student_name, email, phone, programme_id, status, created_at').eq('tenant_id', resolvedTenant),
    supabase.from('crm_intake_applications').select('id, status, created_at').eq('tenant_id', resolvedTenant),
    supabase.from('students').select('id, student_number, first_name, last_name, email, status, created_at').eq('tenant_id', resolvedTenant),
    supabase.from('enrolments').select('id, student_name, enrolment_number, status, programme_id, cohort_id, agreed_tuition_fee, certificate_issued, created_at').eq('tenant_id', resolvedTenant),
    supabase.from('programmes').select('id, code, name, tuition_fee, status').eq('tenant_id', resolvedTenant),
    supabase.from('cohorts').select('id, cohort_code, name, status, start_date, end_date').eq('tenant_id', resolvedTenant),
    supabase.from('training_sessions').select('id, cohort_id, session_number, title, session_date, start_time, end_time, status, delivery_mode').eq('tenant_id', resolvedTenant).order('session_date', { ascending: true }),
    supabase.from('attendance').select('id, status, marked_at').eq('tenant_id', resolvedTenant),
    supabase.from('facilitator_reports').select('id, status, created_at').eq('tenant_id', resolvedTenant),
    getMeetings(),
    getFinancialMetrics(resolvedTenant),
    supabase.from('personnel').select('id, employee_type, employment_status').eq('tenant_id', resolvedTenant),
    supabase.from('payslips').select('id, status, net_pay, pay_period').eq('tenant_id', resolvedTenant),
    supabase.from('certificates').select('id, status, certificate_number, created_at').eq('tenant_id', resolvedTenant),
    supabase.from('finance_audit_log').select('id, action, entity_type, entity_id, entity_name, actor_role, reason, created_at').eq('tenant_id', resolvedTenant).order('created_at', { ascending: false }).limit(25),
    getReceivablesAgeing(resolvedTenant),
  ]);

  // 1. Admissions Intelligence
  const enquiries = enquiriesRes.data || [];
  const applications = applicationsRes.data || [];
  const totalEnquiries = enquiries.length;
  const totalApplications = applications.length;

  const appStatusMap: Record<string, number> = {};
  applications.forEach(app => {
    const st = app.status || 'NEW';
    appStatusMap[st] = (appStatusMap[st] || 0) + 1;
  });

  const enqStatusMap: Record<string, number> = {};
  enquiries.forEach(enq => {
    const st = enq.status || 'NEW';
    enqStatusMap[st] = (enqStatusMap[st] || 0) + 1;
  });

  const qualifiedApps = (appStatusMap['QUALIFIED'] || 0) + (appStatusMap['MATCHED'] || 0) + (appStatusMap['CONVERTED'] || 0);
  const convertedCount = appStatusMap['CONVERTED'] || 0;
  const conversionRate = totalApplications > 0
    ? Math.round((convertedCount / totalApplications) * 100)
    : 0;

  const admissions: AdmissionsIntelligence = {
    totalEnquiries,
    totalApplications,
    qualifiedApplications: qualifiedApps,
    convertedCount,
    conversionRate,
    enquiryStages: enqStatusMap,
    applicationStatusBreakdown: appStatusMap,
    topProgrammes: (programmesRes.data || []).map(p => ({
      programmeName: p.name,
      count: (enrolmentsRes.data || []).filter(e => e.programme_id === p.id).length,
    })),
  };

  // 2. Academic Intelligence
  const students = studentsRes.data || [];
  const enrolments = enrolmentsRes.data || [];
  const programmes = programmesRes.data || [];
  const cohorts = cohortsRes.data || [];

  const activeStudents = students.filter(s => (s.status || '').toUpperCase() === 'ACTIVE' || (s.status || '').toUpperCase() !== 'WITHDRAWN').length;
  const activeEnrolments = enrolments.filter(e => e.status === 'ENROLLED' || e.status === 'IN_PROGRESS' || e.status === 'ACTIVE' || e.status === 'CONFIRMED').length;
  const completedEnrolments = enrolments.filter(e => (e.status || '').toUpperCase() === 'COMPLETED').length;

  const enrolmentStatusBreakdown: Record<string, number> = {};
  enrolments.forEach(e => {
    const st = e.status || 'ENROLLED';
    enrolmentStatusBreakdown[st] = (enrolmentStatusBreakdown[st] || 0) + 1;
  });

  const programmeDistribution = programmes.map(p => ({
    programmeId: p.id,
    programmeName: p.name,
    code: p.code,
    studentCount: enrolments.filter(e => e.programme_id === p.id).length,
    tuitionFee: Number(p.tuition_fee || 0),
  }));

  const cohortDistribution = cohorts.map(c => ({
    cohortId: c.id,
    cohortCode: c.cohort_code,
    name: c.name,
    enrolmentCount: enrolments.filter(e => e.cohort_id === c.id).length,
    status: c.status,
  }));

  const academics: AcademicIntelligence = {
    activeStudents,
    activeEnrolments,
    programmesCount: programmes.length,
    cohortsCount: cohorts.length,
    programmeDistribution,
    cohortDistribution,
    enrolmentStatusBreakdown,
  };

  // 3. Training Intelligence
  const sessions = trainingSessionsRes.data || [];
  const attendance = attendanceRes.data || [];
  const reports = reportsRes.data || [];

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => s.status === 'COMPLETED').length;
  const scheduledSessions = sessions.filter(s => s.status === 'SCHEDULED').length;

  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let absentCount = 0;

  attendance.forEach(a => {
    const st = (a.status || '').toUpperCase();
    if (st === 'PRESENT') presentCount++;
    else if (st === 'LATE') lateCount++;
    else if (st === 'EXCUSED') excusedCount++;
    else if (st === 'ABSENT') absentCount++;
  });

  const totalAtt = presentCount + lateCount + excusedCount + absentCount;
  const attRate = totalAtt > 0
    ? Math.round(((presentCount + lateCount) / totalAtt) * 100)
    : 100;

  const training: TrainingIntelligence = {
    totalSessions,
    completedSessions,
    scheduledSessions,
    attendanceRate: attRate,
    attendanceBreakdown: {
      present: presentCount,
      late: lateCount,
      excused: excusedCount,
      absent: absentCount,
    },
    totalReportsSubmitted: reports.filter(r => r.status === 'SUBMITTED' || r.status === 'VERIFIED').length,
    facilitatorsActive: (personnelRes.data || []).filter(p => p.employee_type === 'facilitator' && p.employment_status === 'active').length,
  };

  // 4. Meeting Intelligence
  const meetings = meetingsData?.data || [];
  const totalMeetings = meetings.length;
  const scheduledMeetings = meetings.filter(m => m.status === 'SCHEDULED').length;
  const liveMeetings = meetings.filter(m => m.status === 'LIVE').length;
  const completedMeetings = meetings.filter(m => m.status === 'COMPLETED' || m.status === 'ENDED').length;
  const cancelledMeetings = meetings.filter(m => m.status === 'CANCELLED').length;
  const recordingsAvailable = meetings.filter(m => m.recordingStatus === 'STORED' || (m.recordings && m.recordings.length > 0)).length;

  const meetingsIntel: MeetingIntelligence = {
    totalMeetings,
    scheduledMeetings,
    liveMeetings,
    completedMeetings,
    cancelledMeetings,
    recordingsAvailable,
    totalParticipantsEngaged: totalMeetings * 12, // Average cohort engagement estimate
  };

  // 5. Financial Intelligence
  const collectionRate = financeMetrics.totalInvoiced > 0
    ? Math.round((financeMetrics.totalCollected / financeMetrics.totalInvoiced) * 100)
    : 0;

  const finance: FinancialIntelligence = {
    totalInvoiced: financeMetrics.totalInvoiced,
    totalCollected: financeMetrics.totalCollected,
    outstandingBalance: financeMetrics.outstandingBalance,
    overdueReceivables: financeMetrics.overdueAmount,
    collectionRate,
    invoiceStatusCounts: financeMetrics.invoiceCounts,
    recentPayments: [], // Will be filled if needed
  };

  // 6. Payroll Intelligence
  const personnel = personnelRes.data || [];
  const payslips = payslipsRes.data || [];

  const totalStaffCount = personnel.filter(p => p.employee_type === 'staff').length;
  const totalFacilitatorCount = personnel.filter(p => p.employee_type === 'facilitator').length;

  const payslipCountsByStatus: Record<string, number> = {};
  payslips.forEach(ps => {
    const st = ps.status || 'draft';
    payslipCountsByStatus[st] = (payslipCountsByStatus[st] || 0) + 1;
  });

  const payroll: PayrollIntelligence = {
    totalStaffCount,
    totalFacilitatorCount,
    totalPayrollObligation: financeMetrics.payroll.draftPayroll + financeMetrics.payroll.pendingAcknowledgement + financeMetrics.payroll.pendingApproval + financeMetrics.payroll.approvedReady + financeMetrics.payroll.paidTotal,
    draftPayroll: financeMetrics.payroll.draftPayroll,
    pendingReviewPayroll: financeMetrics.payroll.pendingAcknowledgement,
    approvedReadyPayroll: financeMetrics.payroll.approvedReady,
    disbursedPaidPayroll: financeMetrics.payroll.paidTotal,
    payslipCountsByStatus,
  };

  // 7. Lifecycle & Customer Journey Metrics
  const rawCerts = certificatesRes.data || [];
  const certsIssuedCount = rawCerts.filter(c => (c.status || '').toUpperCase() === 'ISSUED').length;
  const certsFromEnr = enrolments.filter(e => e.certificate_issued === true).length;
  const totalCertificates = Math.max(certsIssuedCount, certsFromEnr);

  const newEnquiries = enqStatusMap['NEW'] || 0;
  const contacted = enqStatusMap['CONTACTED'] || 0;
  const interested = enqStatusMap['INTERESTED'] || 0;
  const invoiceRequested = enqStatusMap['INVOICE_REQUESTED'] || 0;
  const invoiceIssued = enqStatusMap['INVOICE_ISSUED'] || 0;
  const enrolled = enqStatusMap['ENROLLED'] || 0;
  const lost = enqStatusMap['LOST'] || 0;

  const nowTime = Date.now();
  const todayDateStr = new Date().toISOString().slice(0, 10);

  const followUpsDueToday = enquiries.filter(e => {
    const st = (e.status || '').toUpperCase();
    return (st === 'NEW' || st === 'CONTACTED') && (e.created_at || '').slice(0, 10) === todayDateStr;
  }).length;

  const followUpsOverdue = enquiries.filter(e => {
    const st = (e.status || '').toUpperCase();
    if (st !== 'NEW') return false;
    const createdTime = new Date(e.created_at).getTime();
    return (nowTime - createdTime) > 48 * 3600 * 1000;
  }).length;

  const recentlyContacted = contacted + interested;

  const lifecycle: LifecycleMetrics = {
    prospects: totalEnquiries,
    enquiries: totalEnquiries,
    followUps: contacted + interested + (newEnquiries > 0 ? newEnquiries : 0),
    students: students.length,
    enrolments: enrolments.length,
    training: totalSessions,
    completion: completedEnrolments > 0 ? completedEnrolments : completedSessions,
    certificates: totalCertificates,
  };

  // 8. CRM Pipeline Metrics
  const crmPipeline: CrmPipelineMetrics = {
    newEnquiries,
    contacted,
    interested,
    invoiceRequested,
    invoiceIssued,
    enrolled,
    lost,
    followUpsDueToday,
    followUpsOverdue,
    recentlyContacted,
  };

  // 9. Student Activity Metrics
  const recentlyAddedStudents: RecentStudentItem[] = [...students]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(s => ({
      id: s.id,
      studentNumber: s.student_number || 'STU-—',
      firstName: s.first_name || '',
      lastName: s.last_name || '',
      email: s.email,
      status: s.status || 'ACTIVE',
      createdAt: s.created_at,
    }));

  const studentActivity: StudentActivityMetrics = {
    totalStudents: students.length,
    activeStudents,
    activeEnrolments,
    recentlyAddedStudents,
    completedTraining: completedEnrolments > 0 ? completedEnrolments : completedSessions,
    certificatesIssued: totalCertificates,
  };

  // 10. Upcoming Sessions
  const cohortsMap = new Map((cohortsRes.data || []).map(c => [c.id, c.name]));
  const upcomingSessions: UpcomingSessionItem[] = sessions
    .filter(s => s.status === 'SCHEDULED' || s.session_date >= todayDateStr)
    .slice(0, 10)
    .map(s => ({
      id: s.id,
      sessionNumber: Number(s.session_number || 1),
      title: s.title,
      sessionDate: s.session_date,
      startTime: s.start_time || '10:00',
      endTime: s.end_time || '12:00',
      status: s.status,
      deliveryMode: s.delivery_mode || 'HYBRID',
      cohortName: cohortsMap.get(s.cohort_id) || 'General Cohort',
    }));

  // 11. Overdue Receivables List
  const programmesMap = new Map((programmesRes.data || []).map(p => [p.id, p.name]));
  const overdueReceivablesList: OverdueReceivableItem[] = (receivablesAgeingData?.outstandingInvoices || [])
    .filter(inv => inv.daysOverdue > 0)
    .sort((a, b) => b.balanceAmount - a.balanceAmount)
    .map(inv => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDisplayNo: inv.invoiceDisplayNo,
      studentName: inv.studentName,
      programmeName: inv.programmeId ? programmesMap.get(inv.programmeId) : undefined,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      balanceAmount: inv.balanceAmount,
      dueDate: inv.dueDate,
      daysOverdue: inv.daysOverdue,
      status: inv.status,
    }));

  // 12. Recent Activity & Governance
  const rawAudit = auditLogsRes.data || [];
  const recentActivity: RecentActivityItem[] = rawAudit.slice(0, 15).map(a => ({
    id: a.id,
    action: a.action,
    entityType: a.entity_type,
    entityId: a.entity_id,
    entityName: a.entity_name,
    actorRole: a.actor_role,
    reason: a.reason,
    createdAt: a.created_at,
  }));

  return {
    admissions,
    academics,
    training,
    meetings: meetingsIntel,
    finance,
    payroll,
    lifecycle,
    crmPipeline,
    studentActivity,
    upcomingSessions,
    overdueReceivablesList,
    recentActivity,
    generatedAt: new Date().toISOString(),
    tenantId: resolvedTenant,
  };
}

/**
 * Fetch unified tabular reporting dataset across operational dimensions
 */
export async function getUnifiedReports(
  category: 'ALL' | 'FINANCE' | 'ACADEMIC' | 'TRAINING' | 'ADMISSIONS' | 'PAYROLL' = 'ALL',
  tenantId?: string
): Promise<ReportItem[]> {
  const resolvedTenant = tenantId || await getFinanceTenantId();
  const supabase = await createServerClient();

  const items: ReportItem[] = [];

  // 1. Finance Invoices & Payments
  if (category === 'ALL' || category === 'FINANCE') {
    const [invRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('tenant_id', resolvedTenant).order('invoice_date', { ascending: false }).limit(25),
      supabase.from('payments').select('*').eq('tenant_id', resolvedTenant).order('payment_date', { ascending: false }).limit(25),
    ]);

    (invRes.data || []).forEach(inv => {
      items.push({
        id: `inv_${inv.id}`,
        category: 'FINANCE',
        referenceNo: inv.invoice_display_no,
        date: inv.invoice_date,
        title: `Tuition Invoice: ${inv.student_name}`,
        subTitle: `Due: ${inv.due_date}`,
        primaryValue: `₦${Number(inv.total_amount).toLocaleString('en-NG')}`,
        secondaryValue: `Plan: ${inv.payment_plan}`,
        status: inv.status.toUpperCase(),
      });
    });

    (payRes.data || []).forEach(p => {
      items.push({
        id: `pay_${p.id}`,
        category: 'FINANCE',
        referenceNo: p.receipt_display_no,
        date: p.payment_date,
        title: `Fee Deposit Receipt`,
        subTitle: `Method: ${p.payment_method} (${p.reference || 'No Ref'})`,
        primaryValue: `₦${Number(p.amount).toLocaleString('en-NG')}`,
        status: p.reconciliation_status.toUpperCase(),
      });
    });
  }

  // 2. Academic Cohorts & Enrolments
  if (category === 'ALL' || category === 'ACADEMIC') {
    const cohortsRes = await supabase.from('cohorts').select('*').eq('tenant_id', resolvedTenant).limit(20);
    (cohortsRes.data || []).forEach(c => {
      items.push({
        id: `coh_${c.id}`,
        category: 'ACADEMIC',
        referenceNo: c.cohort_code,
        date: c.start_date || 'Ongoing',
        title: `Cohort: ${c.name}`,
        subTitle: `Status: ${c.status}`,
        primaryValue: c.delivery_mode || 'HYBRID',
        status: c.status.toUpperCase(),
      });
    });
  }

  // 3. Training Sessions & Reports
  if (category === 'ALL' || category === 'TRAINING') {
    const sessRes = await supabase.from('training_sessions').select('*').eq('tenant_id', resolvedTenant).limit(20);
    (sessRes.data || []).forEach(s => {
      items.push({
        id: `sess_${s.id}`,
        category: 'TRAINING',
        referenceNo: `SESS-${s.session_number || 1}`,
        date: s.session_date,
        title: `Training: ${s.title}`,
        subTitle: `${s.start_time} - ${s.end_time}`,
        primaryValue: s.delivery_mode,
        status: s.status.toUpperCase(),
      });
    });
  }

  // 4. Admissions Applications
  if (category === 'ALL' || category === 'ADMISSIONS') {
    const appRes = await supabase.from('crm_intake_applications').select('*').eq('tenant_id', resolvedTenant).limit(20);
    (appRes.data || []).forEach(a => {
      items.push({
        id: `app_${a.id}`,
        category: 'ADMISSIONS',
        referenceNo: a.application_number,
        date: a.created_at ? a.created_at.slice(0, 10) : '2026-09-01',
        title: `Applicant: ${a.first_name} ${a.last_name}`,
        subTitle: a.email,
        primaryValue: a.education_level || 'Applicant',
        status: a.status.toUpperCase(),
      });
    });
  }

  // 5. Payroll Statements
  if (category === 'ALL' || category === 'PAYROLL') {
    const pslRes = await supabase.from('payslips').select('*').eq('tenant_id', resolvedTenant).limit(20);
    (pslRes.data || []).forEach(p => {
      items.push({
        id: `psl_${p.id}`,
        category: 'PAYROLL',
        referenceNo: p.payslip_display_no,
        date: p.pay_period,
        title: `Payroll Statement: ${p.employee_name}`,
        subTitle: `${p.role} (${p.department})`,
        primaryValue: `₦${Number(p.net_pay).toLocaleString('en-NG')}`,
        status: p.status.toUpperCase(),
      });
    });
  }

  // Sort descending by date
  return items.sort((a, b) => (b.date > a.date ? 1 : -1));
}
