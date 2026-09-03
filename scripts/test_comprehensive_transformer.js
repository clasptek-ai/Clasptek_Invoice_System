const fs = require('fs');
const inv = JSON.parse(fs.readFileSync('schema_inventory.json', 'utf8'));
const tables = inv.allTables;

// Define the comprehensive whitelist transformer function
function transformEntityForPostgres(entity, item, tenantId) {
  if (!item || typeof item !== 'object') return item;

  switch (entity) {
    case 'finance_settings':
      return {
        id: item.id || ('finance_settings_' + tenantId),
        tenant_id: tenantId,
        company_name: item.companyName || item.company_name || 'Clasptek Coaching Limited',
        trading_name: item.tradingName || item.trading_name || 'Clasptek',
        address: item.address || null,
        phone: item.phone || null,
        email: item.email || null,
        website: item.website || null,
        tax_id: item.taxId || item.tax_id || null,
        registration_number: item.registrationNumber || item.registration_number || null,
        invoice_footer: item.invoiceFooter || item.invoice_footer || null,
        default_terms: item.defaultTerms || item.default_terms || null,
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'payment_accounts':
      return {
        id: item.id || ('acc_' + Math.random().toString(36).substr(2, 9)),
        tenant_id: tenantId,
        bank_name: item.bankName || item.bank_name || '',
        account_name: item.accountName || item.account_name || '',
        account_number: item.accountNumber || item.account_number || '',
        account_type: item.accountType || item.account_type || 'Corporate Current',
        currency: item.currency || 'NGN',
        is_default: item.isDefault !== undefined ? Boolean(item.isDefault) : (item.is_default !== undefined ? Boolean(item.is_default) : false),
        is_active: item.isActive !== undefined ? Boolean(item.isActive) : (item.is_active !== undefined ? Boolean(item.is_active) : true),
        instructions: item.instructions || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'programmes':
      return {
        id: item.id,
        tenant_id: tenantId,
        name: item.name || '',
        code: item.code || '',
        tuition_fee: Number(item.tuitionFee !== undefined ? item.tuitionFee : (item.tuition_fee !== undefined ? item.tuition_fee : 0)),
        max_discount_pct: Number(item.maxDiscountPct !== undefined ? item.maxDiscountPct : (item.max_discount_pct !== undefined ? item.max_discount_pct : 0)),
        allow_installments: item.allowInstallments !== undefined ? Boolean(item.allowInstallments) : (item.allow_installments !== undefined ? Boolean(item.allow_installments) : true),
        installment_first_pct: Number(item.installmentFirstPct !== undefined ? item.installmentFirstPct : (item.installment_first_pct !== undefined ? item.installment_first_pct : 50)),
        installment_second_pct: Number(item.installmentSecondPct !== undefined ? item.installmentSecondPct : (item.installment_second_pct !== undefined ? item.installment_second_pct : 50)),
        status: item.status || (item.isActive === false || item.is_active === false ? 'archived' : 'active'),
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'personnel':
      return {
        id: item.id,
        tenant_id: tenantId,
        user_id: (item.user_id && item.user_id.includes('-')) ? item.user_id : null,
        employee_id: item.employeeId || item.employee_id || item.employeeNo || item.employee_no || item.id,
        first_name: item.firstName || item.first_name || (item.name ? item.name.split(' ')[0] : (item.fullName ? item.fullName.split(' ')[0] : '')),
        last_name: item.lastName || item.last_name || (item.name ? item.name.split(' ').slice(1).join(' ') : (item.fullName ? item.fullName.split(' ').slice(1).join(' ') : '')),
        full_name: item.fullName || item.full_name || item.name || '',
        email: item.email || null,
        phone: item.phone || null,
        employee_type: (item.employeeType || item.employee_type || item.type || 'STAFF').toUpperCase(),
        department: item.department || null,
        job_title: item.jobTitle || item.job_title || item.role || item.designation || null,
        employment_status: ((item.employmentStatus || item.employment_status || item.status || 'ACTIVE').toUpperCase().includes('ACTIVE') ? 'ACTIVE' : 'SUSPENDED'),
        date_joined: item.dateJoined || item.date_joined || item.dateOfJoining || null,
        bank_name: item.bankName || item.bank_name || null,
        account_name: item.accountName || item.account_name || null,
        account_number: item.accountNumber || item.account_number || null,
        compensation_type: item.compensationType || item.compensation_type || 'MONTHLY_SALARY',
        basic_pay: Number(item.basicPay !== undefined ? item.basicPay : (item.basic_pay !== undefined ? item.basic_pay : 0)),
        facilitator_rate: Number(item.facilitatorRate !== undefined ? item.facilitatorRate : (item.facilitator_rate !== undefined ? item.facilitator_rate : 0)),
        rate_type: item.rateType || item.rate_type || 'PER_SESSION',
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'customers':
      return {
        id: item.id,
        tenant_id: tenantId,
        name: item.name || '',
        email: item.email || null,
        phone: item.phone || null,
        address: item.address || null,
        total_invoiced: Number(item.totalInvoiced !== undefined ? item.totalInvoiced : (item.total_invoiced !== undefined ? item.total_invoiced : 0)),
        total_paid: Number(item.totalPaid !== undefined ? item.totalPaid : (item.total_paid !== undefined ? item.total_paid : 0)),
        outstanding_balance: Number(item.outstandingBalance !== undefined ? item.outstandingBalance : (item.outstanding_balance !== undefined ? item.outstanding_balance : 0)),
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'enquiries':
      return {
        id: item.id,
        tenant_id: tenantId,
        student_name: item.studentName || item.student_name || item.name || '',
        email: item.email || null,
        phone: item.phone || null,
        programme_id: item.programmeId || item.programme_id || null,
        source: item.source || 'Direct',
        status: item.status || 'open',
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'enrolments':
      return {
        id: item.id,
        tenant_id: tenantId,
        enquiry_id: item.enquiryId || item.enquiry_id || null,
        student_name: item.studentName || item.student_name || '',
        student_email: item.studentEmail || item.student_email || item.email || null,
        student_phone: item.studentPhone || item.student_phone || item.phone || null,
        programme_id: item.programmeId || item.programme_id || null,
        cohort: item.cohort || null,
        status: item.status || 'active',
        enrolment_date: item.enrolmentDate || item.enrolment_date || item.startDate || item.start_date || new Date().toISOString().split('T')[0],
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      };

    case 'invoices':
      return {
        id: item.id,
        tenant_id: tenantId,
        invoice_no: String(item.invoiceNo || item.invoice_no || item.id),
        invoice_display_no: item.invoice_display_no || item.invoiceDisplayNo || String(item.invoiceNo || item.invoice_no || item.id),
        programme_id: item.programmeId || item.programme_id || null,
        customer_id: item.customerId || item.customer_id || null,
        student_name: item.studentName || item.student_name || item.clientName || item.client || 'Student',
        student_email: item.studentEmail || item.student_email || item.email || null,
        student_phone: item.studentPhone || item.student_phone || item.phone || null,
        invoice_date: item.invoiceDate || item.invoice_date || item.issueDate || item.issue_date || item.date || new Date().toISOString().split('T')[0],
        due_date: item.dueDate || item.due_date || new Date().toISOString().split('T')[0],
        payment_plan: item.paymentPlan || item.payment_plan || item.plan || 'full',
        installments_count: Number(item.installmentsCount || item.installments_count || 1),
        base_price: Number(item.basePrice !== undefined ? item.basePrice : (item.base_price !== undefined ? item.base_price : (item.subTotal !== undefined ? item.subTotal : (item.subtotal !== undefined ? item.subtotal : (item.total || 0))))),
        discount_pct: Number(item.discountPct !== undefined ? item.discountPct : (item.discount_pct !== undefined ? item.discount_pct : 0)),
        discount_amount: Number(item.discountAmount !== undefined ? item.discountAmount : (item.discount_amount !== undefined ? item.discount_amount : (item.discount || 0))),
        total_amount: Number(item.totalAmount !== undefined ? item.totalAmount : (item.total_amount !== undefined ? item.total_amount : (item.total !== undefined ? item.total : 0))),
        income_category: item.incomeCategory || item.income_category || item.category || 'Student Tuition',
        status: item.status || 'issued',
        installment_details: Array.isArray(item.installmentDetails || item.installment_details) ? (item.installmentDetails || item.installment_details) : [],
        source: item.source || 'APP',
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null,
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'invoice_items':
      return {
        id: item.id,
        tenant_id: tenantId,
        invoice_id: item.invoiceId || item.invoice_id,
        item_description: item.itemDescription || item.item_description || item.description || 'Tuition Fee',
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unitPrice !== undefined ? item.unitPrice : (item.unit_price !== undefined ? item.unit_price : 0)),
        discount_amount: Number(item.discountAmount !== undefined ? item.discountAmount : (item.discount_amount !== undefined ? item.discount_amount : 0)),
        line_total: Number(item.lineTotal !== undefined ? item.lineTotal : (item.line_total !== undefined ? item.line_total : (item.totalPrice !== undefined ? item.totalPrice : (item.total_price !== undefined ? item.total_price : 0)))),
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      };

    case 'payments':
      return {
        id: item.id,
        tenant_id: tenantId,
        receipt_no: String(item.receiptNo || item.receipt_no || item.id),
        receipt_display_no: item.receipt_display_no || item.receiptDisplayNo || String(item.receiptNo || item.receipt_no || item.id),
        invoice_id: item.invoiceId || item.invoice_id || null,
        amount: Number(item.amount || 0),
        payment_method: item.paymentMethod || item.payment_method || 'Bank Transfer',
        reference: item.reference || item.paymentNo || item.payment_no || null,
        payment_date: item.paymentDate || item.payment_date || item.date || new Date().toISOString().split('T')[0],
        notes: item.notes || null,
        reconciliation_status: item.reconciliationStatus || item.reconciliation_status || 'unreconciled',
        source: item.source || 'APP',
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null
      };

    case 'receipts':
      return {
        id: item.id,
        tenant_id: tenantId,
        receipt_no: String(item.receiptNo || item.receipt_no || item.id),
        invoice_id: item.invoiceId || item.invoice_id || null,
        payment_id: item.paymentId || item.payment_id || null,
        amount: Number(item.amount || 0),
        payment_date: item.paymentDate || item.payment_date || item.receiptDate || item.receipt_date || new Date().toISOString().split('T')[0],
        payer_name: item.payerName || item.payer_name || item.clientName || null,
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null
      };

    case 'expenses':
      return {
        id: item.id,
        tenant_id: tenantId,
        category_group: item.categoryGroup || item.category_group || item.category || 'Operations',
        sub_category: item.subCategory || item.sub_category || item.description || 'General',
        amount: Number(item.amount || 0),
        expense_date: item.expenseDate || item.expense_date || item.date || new Date().toISOString().split('T')[0],
        description: item.description || item.expenseNo || item.expense_no || '',
        beneficiary: item.beneficiary || item.vendor || 'Vendor',
        payment_method: item.paymentMethod || item.payment_method || 'Bank Transfer',
        reference: item.reference || item.expenseNo || item.expense_no || null,
        programme_id: item.programmeId || item.programme_id || null,
        status: item.status || 'recorded',
        approved_by: item.approvedBy || item.approved_by || null,
        approved_at: item.approvedAt || item.approved_at || null,
        rejection_reason: item.rejectionReason || item.rejection_reason || null,
        cancelled_reason: item.cancelledReason || item.cancelled_reason || null,
        cancelled_at: item.cancelledAt || item.cancelled_at || null,
        cancelled_by: item.cancelledBy || item.cancelled_by || null,
        source: item.source || 'APP',
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null
      };

    case 'direct_income':
      return {
        id: item.id,
        tenant_id: tenantId,
        income_category: item.incomeCategory || item.income_category || 'Other Income',
        payer_name: item.payerName || item.payer_name || 'Direct Payer',
        amount: Number(item.amount || 0),
        payment_method: item.paymentMethod || item.payment_method || 'Bank Transfer',
        reference: item.reference || item.incomeNo || item.income_no || null,
        income_date: item.incomeDate || item.income_date || item.date || new Date().toISOString().split('T')[0],
        description: item.description || '',
        status: item.status || 'received',
        cancelled_reason: item.cancelledReason || item.cancelled_reason || null,
        cancelled_at: item.cancelledAt || item.cancelled_at || null,
        cancelled_by: item.cancelledBy || item.cancelled_by || null,
        source: item.source || 'APP',
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null
      };

    case 'budgets':
      return {
        id: item.id,
        tenant_id: tenantId,
        period: item.period || item.budgetPeriod || item.budget_period || '2026-09',
        category_group: item.categoryGroup || item.category_group || item.category || 'Operations',
        budget_amount: Number(item.budgetAmount !== undefined ? item.budgetAmount : (item.budget_amount !== undefined ? item.budget_amount : (item.allocatedAmount !== undefined ? item.allocatedAmount : (item.allocated_amount !== undefined ? item.allocated_amount : 0)))),
        status: item.status || 'active',
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        created_by: (item.created_by && item.created_by.includes('-')) ? item.created_by : null
      };

    case 'budget_lines':
      return {
        id: item.id,
        tenant_id: tenantId,
        budget_id: item.budgetId || item.budget_id,
        category: item.category || 'Operations',
        sub_category: item.subCategory || item.sub_category || 'General',
        month_key: item.monthKey || item.month_key || '2026-09',
        budget_amount: Number(item.budgetAmount !== undefined ? item.budgetAmount : (item.budget_amount !== undefined ? item.budget_amount : (item.allocatedAmount !== undefined ? item.allocatedAmount : (item.allocated_amount !== undefined ? item.allocated_amount : 0)))),
        actual_amount: Number(item.actualAmount !== undefined ? item.actualAmount : (item.actual_amount !== undefined ? item.actual_amount : (item.spentAmount !== undefined ? item.spentAmount : (item.spent_amount !== undefined ? item.spent_amount : 0)))),
        variance: Number(item.variance !== undefined ? item.variance : 0),
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'payslips':
      return {
        id: item.id,
        tenant_id: tenantId,
        payslip_no: String(item.payslipNo || item.payslip_no || item.id),
        payslip_display_no: item.payslip_display_no || item.payslipDisplayNo || String(item.payslipNo || item.payslip_no || item.id),
        personnel_id: item.personnelId || item.personnel_id,
        employee_name: item.employeeName || item.employee_name || item.name || 'Employee',
        employee_type: item.employeeType || item.employee_type || 'STAFF',
        department: item.department || null,
        role: item.role || null,
        pay_period: item.payPeriod || item.pay_period || item.payrollPeriod || item.payroll_period || '2026-09',
        pay_date: item.payDate || item.pay_date || new Date().toISOString().split('T')[0],
        basic_pay: Number(item.basicPay !== undefined ? item.basicPay : (item.basic_pay !== undefined ? item.basic_pay : (item.basicSalary !== undefined ? item.basicSalary : (item.basic_salary !== undefined ? item.basic_salary : 0)))),
        allowances: Array.isArray(item.allowances) ? item.allowances : (item.allowances && typeof item.allowances === 'object' ? item.allowances : []),
        gross_pay: Number(item.grossPay !== undefined ? item.grossPay : (item.gross_pay !== undefined ? item.gross_pay : 0)),
        deductions: Array.isArray(item.deductions) ? item.deductions : (item.deductions && typeof item.deductions === 'object' ? item.deductions : []),
        total_deductions: Number(item.totalDeductions !== undefined ? item.totalDeductions : (item.total_deductions !== undefined ? item.total_deductions : 0)),
        net_pay: Number(item.netPay !== undefined ? item.netPay : (item.net_pay !== undefined ? item.net_pay : 0)),
        status: item.status || 'draft',
        statement_version: Number(item.statementVersion || item.statement_version || 1),
        payslip_hash: item.payslipHash || item.payslip_hash || null,
        acknowledged_at: item.acknowledgedAt || item.acknowledged_at || null,
        acknowledged_by: item.acknowledgedBy || item.acknowledged_by || null,
        acknowledgement_method: item.acknowledgementMethod || item.acknowledgement_method || null,
        acknowledgement_remarks: item.acknowledgementRemarks || item.acknowledgement_remarks || null,
        approved_at: item.approvedAt || item.approved_at || null,
        approved_by: item.approvedBy || item.approved_by || null,
        paid_at: item.paidAt || item.paid_at || item.disbursedAt || item.disbursed_at || null,
        paid_by: item.paidBy || item.paid_by || null,
        paid_amount: Number(item.paidAmount !== undefined ? item.paidAmount : (item.paid_amount !== undefined ? item.paid_amount : (item.netPay || item.net_pay || 0))),
        actual_payment_date: item.actualPaymentDate || item.actual_payment_date || null,
        payment_method: item.paymentMethod || item.payment_method || 'Bank Transfer',
        payment_reference: item.paymentReference || item.payment_reference || null,
        linked_expense_id: item.linkedExpenseId || item.linked_expense_id || null,
        cancel_reason: item.cancelReason || item.cancel_reason || null,
        cancelled_at: item.cancelledAt || item.cancelled_at || null,
        cancelled_by: item.cancelledBy || item.cancelled_by || null,
        queries: Array.isArray(item.queries) ? item.queries : [],
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'facilitator_sessions':
      return {
        id: item.id,
        tenant_id: tenantId,
        facilitator_id: item.facilitatorId || item.facilitator_id || item.personnelId || item.personnel_id,
        facilitator_name: item.facilitatorName || item.facilitator_name || 'Facilitator',
        programme_id: item.programmeId || item.programme_id || null,
        programme_name: item.programmeName || item.programme_name || null,
        session_date: item.sessionDate || item.session_date || item.date || new Date().toISOString().split('T')[0],
        session_type: item.sessionType || item.session_type || 'Lecture',
        sessions_count: Number(item.sessionsCount !== undefined ? item.sessionsCount : (item.sessions_count !== undefined ? item.sessions_count : 1)),
        rate_per_session: Number(item.ratePerSession !== undefined ? item.ratePerSession : (item.rate_per_session !== undefined ? item.rate_per_session : (item.hourlyRate || item.hourly_rate || 0))),
        total_amount: Number(item.totalAmount !== undefined ? item.totalAmount : (item.total_amount !== undefined ? item.total_amount : (item.totalEarnings || item.total_earnings || 0))),
        topic: item.topic || null,
        status: item.status || 'pending',
        payroll_period: item.payrollPeriod || item.payroll_period || null,
        payment_status: item.paymentStatus || item.payment_status || 'unpaid',
        approved_by: item.approvedBy || item.approved_by || null,
        approved_at: item.approvedAt || item.approved_at || null,
        payslip_id: item.payslipId || item.payslip_id || null,
        notes: item.notes || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'customer_timeline':
      return {
        id: item.id,
        tenant_id: tenantId,
        customer_id: item.customerId || item.customer_id || null,
        enquiry_id: item.enquiryId || item.enquiry_id || null,
        event_type: item.eventType || item.event_type || item.activityType || item.activity_type || 'Note',
        title: item.title || 'Timeline Event',
        description: item.description || null,
        contact_method: item.contactMethod || item.contact_method || null,
        outcome: item.outcome || null,
        next_action: item.nextAction || item.next_action || null,
        next_follow_up_date: item.nextFollowUpDate || item.next_follow_up_date || null,
        reference_id: item.referenceId || item.reference_id || null,
        actor_name: item.actorName || item.actor_name || null,
        created_at: item.createdAt || item.created_at || item.eventDate || item.event_date || new Date().toISOString()
      };

    case 'collection_actions':
      return {
        id: item.id,
        tenant_id: tenantId,
        customer_id: item.customerId || item.customer_id || null,
        invoice_id: item.invoiceId || item.invoice_id || null,
        priority: item.priority || 'Medium',
        action_type: item.actionType || item.action_type || 'Follow-up',
        action_notes: item.actionNotes || item.action_notes || item.notes || null,
        promised_payment_date: item.promisedPaymentDate || item.promised_payment_date || null,
        actor_name: item.actorName || item.actor_name || null,
        created_at: item.createdAt || item.created_at || item.actionDate || item.action_date || new Date().toISOString()
      };

    case 'finance_audit_log':
      return {
        id: item.id,
        tenant_id: tenantId,
        action: item.action || 'SYSTEM_ACTION',
        entity_type: item.entityType || item.entity_type || 'General',
        entity_id: String(item.entityId || item.entity_id || 'N/A'),
        entity_name: item.entityName || item.entity_name || item.reference || null,
        old_state: item.oldState !== undefined ? item.oldState : (item.old_state !== undefined ? item.old_state : (item.previousValue !== undefined ? item.previousValue : (item.previous_value !== undefined ? item.previous_value : null))),
        new_state: item.newState !== undefined ? item.newState : (item.new_state !== undefined ? item.new_state : (item.newValue !== undefined ? item.newValue : (item.new_value !== undefined ? item.new_value : null))),
        reason: item.reason || null,
        actor_id: item.actorId || item.actor_id || item.performedBy || item.performed_by || 'System',
        actor_role: item.actorRole || item.actor_role || item.role || 'Super Admin',
        source: item.source || 'APP',
        created_at: item.createdAt || item.created_at || item.performedAt || item.performed_at || new Date().toISOString()
      };

    case 'management_alerts':
      return {
        id: item.id,
        tenant_id: tenantId,
        domain: item.domain || 'Finance',
        severity: item.severity || 'Medium',
        title: item.title || item.alertTitle || item.alert_title || 'Alert',
        description: item.description || item.alertMessage || item.alert_message || '',
        record_type: item.recordType || item.record_type || item.alertType || item.alert_type || null,
        record_id: item.recordId || item.record_id || null,
        status: item.status || (item.isResolved || item.is_resolved ? 'resolved' : 'active'),
        assigned_role: item.assignedRole || item.assigned_role || 'SUPER_ADMIN',
        action_url: item.actionUrl || item.action_url || null,
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        acknowledged_at: item.acknowledgedAt || item.acknowledged_at || null,
        acknowledged_by: item.acknowledgedBy || item.acknowledged_by || null,
        resolved_at: item.resolvedAt || item.resolved_at || null,
        resolved_by: item.resolvedBy || item.resolved_by || null
      };

    case 'approval_thresholds':
      return {
        id: item.id || ('thresholds_' + tenantId),
        tenant_id: tenantId,
        tier_level: Number(item.tierLevel || item.tier_level || 1),
        min_amount: Number(item.minAmount !== undefined ? item.minAmount : (item.min_amount !== undefined ? item.min_amount : 0)),
        max_amount: Number(item.maxAmount !== undefined ? item.maxAmount : (item.max_amount !== undefined ? item.max_amount : (item.thresholdAmount || item.threshold_amount || 500000))),
        authorized_role: item.authorizedRole || item.authorized_role || 'SUPER_ADMIN',
        requires_dual_approval: item.requiresDualApproval !== undefined ? Boolean(item.requiresDualApproval) : (item.requires_dual_approval !== undefined ? Boolean(item.requires_dual_approval) : (item.requireSuperAdmin !== undefined ? Boolean(item.requireSuperAdmin) : false)),
        updated_by: item.updatedBy || item.updated_by || 'System',
        updated_at: item.updatedAt || item.updated_at || new Date().toISOString()
      };

    case 'financial_adjustments':
      return {
        id: item.id,
        tenant_id: tenantId,
        original_table: item.originalTable || item.original_table || 'invoices',
        original_record_id: item.originalRecordId || item.original_record_id || item.invoiceId || item.invoice_id || 'N/A',
        adjustment_type: item.adjustmentType || item.adjustment_type || 'Credit Note',
        amount: Number(item.amount || 0),
        reason: item.reason || '',
        financial_period: item.financialPeriod || item.financial_period || '2026-09',
        authorized_by: item.authorizedBy || item.authorized_by || 'Super Admin',
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      };

    case 'report_snapshots':
      return {
        id: item.id,
        tenant_id: tenantId,
        report_type: item.reportType || item.report_type || 'Summary',
        report_title: item.reportTitle || item.report_title || 'Financial Report',
        financial_period: item.financialPeriod || item.financial_period || '2026-09',
        generated_by: item.generatedBy || item.generated_by || 'System',
        summary_data: item.summaryData !== undefined ? item.summaryData : (item.summary_data !== undefined ? item.summary_data : {}),
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      };

    case 'management_metrics':
      return {
        id: item.id || ('metrics_' + tenantId),
        tenant_id: tenantId,
        metric_period: item.metricPeriod || item.metric_period || '2026-09',
        period_type: item.periodType || item.period_type || 'Monthly',
        total_revenue: Number(item.totalRevenue !== undefined ? item.totalRevenue : (item.total_revenue !== undefined ? item.total_revenue : 0)),
        revenue_collected: Number(item.revenueCollected !== undefined ? item.revenueCollected : (item.revenue_collected !== undefined ? item.revenue_collected : 0)),
        operating_expenses: Number(item.operatingExpenses !== undefined ? item.operatingExpenses : (item.operating_expenses !== undefined ? item.operating_expenses : 0)),
        payroll_costs: Number(item.payrollCosts !== undefined ? item.payrollCosts : (item.payroll_costs !== undefined ? item.payroll_costs : 0)),
        net_position: Number(item.netPosition !== undefined ? item.netPosition : (item.net_position !== undefined ? item.net_position : 0)),
        collection_rate_pct: Number(item.collectionRatePct !== undefined ? item.collectionRatePct : (item.collection_rate_pct !== undefined ? item.collection_rate_pct : 0)),
        operating_margin_pct: Number(item.operatingMarginPct !== undefined ? item.operatingMarginPct : (item.operating_margin_pct !== undefined ? item.operating_margin_pct : 0)),
        payroll_ratio_pct: Number(item.payrollRatioPct !== undefined ? item.payrollRatioPct : (item.payroll_ratio_pct !== undefined ? item.payroll_ratio_pct : 0)),
        snapshot_data: item.snapshotData !== undefined ? item.snapshotData : (item.snapshot_data !== undefined ? item.snapshot_data : {}),
        captured_at: item.capturedAt || item.captured_at || new Date().toISOString()
      };

    case 'cash_flow_forecasts':
      return {
        id: item.id,
        tenant_id: tenantId,
        forecast_date: item.forecastDate || item.forecast_date || new Date().toISOString().split('T')[0],
        horizon_days: Number(item.horizonDays || item.horizon_days || 30),
        opening_cash: Number(item.openingCash !== undefined ? item.openingCash : (item.opening_cash !== undefined ? item.opening_cash : 0)),
        expected_inflows: Number(item.expectedInflows !== undefined ? item.expectedInflows : (item.expected_inflows !== undefined ? item.expected_inflows : 0)),
        expected_outflows: Number(item.expectedOutflows !== undefined ? item.expectedOutflows : (item.expected_outflows !== undefined ? item.expected_outflows : 0)),
        forecast_closing_cash: Number(item.forecastClosingCash !== undefined ? item.forecastClosingCash : (item.forecast_closing_cash !== undefined ? item.forecast_closing_cash : 0)),
        runway_status: item.runwayStatus || item.runway_status || 'Healthy',
        forecast_breakdown: item.forecastBreakdown !== undefined ? item.forecastBreakdown : (item.forecast_breakdown !== undefined ? item.forecast_breakdown : {}),
        generated_by: item.generatedBy || item.generated_by || 'System',
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      };

    case 'customer_segments':
      return {
        id: item.id,
        tenant_id: tenantId,
        customer_id: item.customerId || item.customer_id,
        segment: item.segment || 'Regular',
        lifetime_value: Number(item.lifetimeValue !== undefined ? item.lifetimeValue : (item.lifetime_value !== undefined ? item.lifetime_value : 0)),
        outstanding_balance: Number(item.outstandingBalance !== undefined ? item.outstandingBalance : (item.outstanding_balance !== undefined ? item.outstanding_balance : 0)),
        payment_reliability_score: Number(item.paymentReliabilityScore !== undefined ? item.paymentReliabilityScore : (item.payment_reliability_score !== undefined ? item.payment_reliability_score : 100)),
        days_overdue: Number(item.daysOverdue !== undefined ? item.daysOverdue : (item.days_overdue !== undefined ? item.days_overdue : 0)),
        last_evaluated_at: item.lastEvaluatedAt || item.last_evaluated_at || new Date().toISOString()
      };

    default:
      return { ...item, tenant_id: tenantId };
  }
}

// Sample objects representing typical local data
const sampleData = {
  finance_settings: {
    companyName: 'Clasptek', tradingName: 'Clasptek', address: 'Lagos', phone: '123', email: 'a@c.com',
    website: 'https://c.org', taxId: 'TIN-1', registrationNumber: 'RC-1', defaultTerms: 'Terms', invoiceFooter: 'Footer'
  },
  payment_accounts: {
    id: 'acc_1', accountName: 'Clasptek', bankName: 'GTB', accountNumber: '0123456789', accountType: 'Corporate Current',
    currency: 'NGN', instructions: 'Notes', isActive: true, isDefault: true
  },
  programmes: {
    id: 'prog_1', name: 'Software', code: 'SW', category: 'Tech', duration_weeks: 12,
    tuitionFee: 150000, maxDiscountPct: 10, allowInstallments: true, installmentFirstPct: 60, installmentSecondPct: 40
  },
  personnel: {
    id: 'pers_1', employeeNo: 'EMP-001', employeeType: 'Full-Time', employmentStatus: 'active',
    firstName: 'A', lastName: 'B', fullName: 'A B', email: 'a@b.com', basicPay: 200000, bankDetails: 'GTB'
  },
  customers: {
    id: 'cust_1', name: 'Cust 1', email: 'c@c.com', phone: '123', address: 'Lagos', total_invoiced: 100, total_paid: 100
  },
  enquiries: {
    id: 'enq_1', enquiryNo: 'ENQ-01', customerId: 'cust_1', programmeId: 'prog_1', student_name: 'S', email: 's@s.com'
  },
  enrolments: {
    id: 'enr_1', enrolmentNo: 'ENR-01', customerId: 'cust_1', programmeId: 'prog_1', student_name: 'S', cohort: 'C1'
  },
  invoices: {
    id: 'inv_1', invoiceNo: 'INV-01', customerId: 'cust_1', issueDate: '2026-09-01', dueDate: '2026-09-15',
    subTotal: 100000, taxAmount: 7500, discountAmount: 0, programmeId: 'prog_1', total_amount: 107500
  },
  invoice_items: {
    id: 'item_1', invoiceId: 'inv_1', unitPrice: 100000, totalPrice: 100000, programmeId: 'prog_1', quantity: 1, item_description: 'Desc'
  },
  payments: {
    id: 'pay_1', paymentNo: 'PAY-01', receiptNo: 'REC-01', invoiceId: 'inv_1', customerId: 'cust_1', paymentDate: '2026-09-02', paymentMethod: 'Bank Transfer', amount: 107500
  },
  receipts: {
    id: 'rec_1', receiptNo: 'REC-01', paymentId: 'pay_1', invoiceId: 'inv_1', receiptDate: '2026-09-02', amount: 107500
  },
  expenses: {
    id: 'exp_1', expenseNo: 'EXP-01', expenseDate: '2026-09-02', subCategory: 'Office', category_group: 'Admin', paymentMethod: 'Transfer', approvedBy: 'Admin', approvedAt: '2026-09-02', amount: 5000
  },
  direct_income: {
    id: 'inc_1', incomeNo: 'INC-01', incomeDate: '2026-09-02', incomeCategory: 'Consulting', amount: 50000
  },
  budgets: {
    id: 'bud_1', budgetPeriod: '2026-09', period: '2026-09', category_group: 'Operations', allocatedAmount: 1000000, budget_amount: 1000000
  },
  budget_lines: {
    id: 'bl_1', budgetId: 'bud_1', allocatedAmount: 500000, category: 'Ops', month_key: '2026-09', budget_amount: 500000
  },
  payslips: {
    id: 'ps_1', payslipNo: 'PSL-01', personnelId: 'pers_1', payrollPeriod: '2026-09', pay_period: '2026-09', grossPay: 200000, basicSalary: 150000, totalAllowances: 50000, totalDeductions: 10000, netPay: 190000
  },
  facilitator_sessions: {
    id: 'sess_1', sessionNo: 'SES-01', personnelId: 'pers_1', programmeId: 'prog_1', sessionDate: '2026-09-02', sessionHours: 2, hourlyRate: 15000, totalEarnings: 30000
  },
  customer_timeline: {
    id: 'tl_1', customerId: 'cust_1', activityType: 'Call', eventDate: '2026-09-02', title: 'Follow-up'
  },
  collection_actions: {
    id: 'ca_1', invoiceId: 'inv_1', customerId: 'cust_1', actionType: 'Email Reminder', actionDate: '2026-09-02'
  },
  finance_audit_log: {
    id: 'aud_1', entityType: 'invoice', entityId: 'inv_1', previousValue: '{}', newValue: '{\"status\":\"paid\"}', performedBy: 'usr_admin', performedAt: '2026-09-02'
  },
  management_alerts: {
    id: 'alt_1', alertType: 'Budget Exceeded', alertTitle: 'Alert', alertMessage: 'Warning', isResolved: false
  },
  approval_thresholds: {
    id: 'th_1', thresholdAmount: 500000, requireSuperAdmin: true
  },
  financial_adjustments: {
    id: 'adj_1', adjustmentNo: 'ADJ-01', adjustmentType: 'Credit Note', invoiceId: 'inv_1', amount: 5000
  },
  report_snapshots: {
    id: 'snap_1', reportType: 'PnL', report_type: 'PnL', reportTitle: 'PnL Snapshot', financialPeriod: '2026-Q3'
  },
  management_metrics: {
    id: 'met_1', metricPeriod: '2026-09', totalRevenue: 5000000, operatingExpenses: 2000000
  },
  cash_flow_forecasts: {
    id: 'cff_1', forecastDate: '2026-09-01', horizonDays: 30, openingCash: 10000000
  },
  customer_segments: {
    id: 'cs_1', customerId: 'cust_1', segment: 'VIP', lifetimeValue: 500000
  }
};

const sequence = [
  { entity: 'finance_settings', table: 'finance_settings' },
  { entity: 'payment_accounts', table: 'payment_accounts' },
  { entity: 'programmes', table: 'programmes' },
  { entity: 'personnel', table: 'personnel' },
  { entity: 'customers', table: 'customers' },
  { entity: 'enquiries', table: 'enquiries' },
  { entity: 'enrolments', table: 'enrolments' },
  { entity: 'invoices', table: 'invoices' },
  { entity: 'invoice_items', table: 'invoice_items' },
  { entity: 'payments', table: 'payments' },
  { entity: 'receipts', table: 'receipts' },
  { entity: 'expenses', table: 'expenses' },
  { entity: 'direct_income', table: 'direct_income' },
  { entity: 'budgets', table: 'budgets' },
  { entity: 'budget_lines', table: 'budget_lines' },
  { entity: 'payslips', table: 'payslips' },
  { entity: 'facilitator_sessions', table: 'facilitator_sessions' },
  { entity: 'customer_timeline', table: 'customer_timeline' },
  { entity: 'collection_actions', table: 'collection_actions' },
  { entity: 'finance_audit_log', table: 'finance_audit_log' },
  { entity: 'management_alerts', table: 'management_alerts' },
  { entity: 'approval_thresholds', table: 'approval_thresholds' },
  { entity: 'financial_adjustments', table: 'financial_adjustments' },
  { entity: 'report_snapshots', table: 'report_snapshots' },
  { entity: 'management_metrics', table: 'management_metrics' },
  { entity: 'cash_flow_forecasts', table: 'cash_flow_forecasts' },
  { entity: 'customer_segments', table: 'customer_segments' }
];

const tenantUuid = 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6';
let totalPassed = 0;
let totalFailed = 0;

sequence.forEach(s => {
  const tableDef = tables[s.table];
  const validCols = new Set((tableDef.columns || []).map(c => c.name));
  const rawItem = sampleData[s.entity] || { id: 'test_1' };
  const transformed = transformEntityForPostgres(s.entity, rawItem, tenantUuid);

  const unexpectedCols = [];
  const camelCaseCols = [];

  for (const k of Object.keys(transformed)) {
    if (!validCols.has(k)) unexpectedCols.push(k);
    if (/[A-Z]/.test(k)) camelCaseCols.push(k);
  }

  if (unexpectedCols.length > 0 || camelCaseCols.length > 0) {
    totalFailed++;
    console.log('❌ FAIL: ' + s.entity + ' -> ' + s.table);
    if (unexpectedCols.length) console.log('   Unexpected cols:', unexpectedCols);
    if (camelCaseCols.length) console.log('   CamelCase cols:', camelCaseCols);
  } else {
    totalPassed++;
    console.log('✔ PASS: ' + s.entity + ' -> ' + s.table);
  }
});

console.log('\nFINAL TEST RESULTS: ' + totalPassed + ' / ' + sequence.length + ' PASSED (' + totalFailed + ' FAILED)');
if (totalFailed > 0) process.exit(1);
