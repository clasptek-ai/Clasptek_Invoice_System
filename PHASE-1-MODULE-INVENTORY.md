# CLASPTEK PORTAL — PHASE 1 MODULE INVENTORY
## Complete Inventory of Enterprise Business Modules & Migration Risk Assessment

---

### Risk Classification Framework

- **LOW:** Pure presentation or isolated read/write workflows with minimal database dependencies.
- **MEDIUM:** Multi-table relationships, standard CRUD workflows, role-guarded access.
- **HIGH:** Complex multi-table transactions, external API integrations, or cryptographic signing.
- **CRITICAL:** Authoritative financial ledgers, tenant security boundaries, WebRTC live media, or GoTrue auth infrastructure.

---

## 1. Module Inventory Matrix

### 1.1 Authentication & Session Management
- **Module:** Authentication & Session Management
- **Purpose:** User authentication, password management, password reset recovery, multi-tenant session restoration, and token refresh lifecycle.
- **Current UI Location:** `renderAuthView()`, `renderLoginModal()`, `renderRecoveryModal()` in `index.html`.
- **Primary JavaScript Functions:** `supabaseClient.auth.signInWithPassword()`, `supabaseClient.auth.signOut()`, `supabaseClient.auth.resetPasswordForEmail()`, `supabaseClient.auth.updateUser()`, `ensureFreshSession()`, `resolveSupabaseConfiguration()`.
- **Database Tables:** `auth.users`, `public.profiles`, `public.tenant_memberships`, `public.tenants`.
- **Supabase Queries:** Direct queries to PostgREST `profiles` and `tenant_memberships` filtered by `user_id = eq.{auth_uid}`.
- **API Endpoints:** `/auth/v1/token`, `/auth/v1/user`, `/auth/v1/recover`.
- **Authentication Requirements:** Unauthenticated for login/recovery; Bearer JWT for session validation.
- **Role Requirements:** Any role (Super Admin, Finance Manager, Finance Staff, Facilitator, Staff, Student).
- **RLS Dependencies:** `profiles_self_select`, `tenant_memberships_user_select`.
- **External Services:** Supabase GoTrue Auth Service.
- **Business Rules:**
  - Passwords must satisfy minimum 8 characters with at least one uppercase letter and one number.
  - Proactive JWT token refresh executed automatically before session expiration.
  - Rate limiting on failed login attempts with exponential cooldown.
- **Current Route / Hash:** N/A (Modal overlay or root view when unauthenticated).
- **Migration Complexity:** High.
- **Risk Level:** **CRITICAL**.

---

### 1.2 Executive & Staff Dashboards
- **Module:** Executive & Staff Dashboards
- **Purpose:** Unified operational metrics, real-time KPI aggregations, revenue/expense breakdowns, pipeline conversion statistics, and upcoming schedule summaries.
- **Current UI Location:** `renderDashboardTab()` and `renderStaffDashboardTab()` in `index.html`.
- **Primary JavaScript Functions:** `getFinancialMetrics()`, `getStudentAccountSummaries()`, `getAuthoritativeFinancialMetrics()`, `resolveProspectAttributionForInvoice()`.
- **Database Tables:** `invoices`, `payments`, `expenses`, `direct_income`, `enquiries`, `students`, `cohorts`, `training_sessions`, `meetings`.
- **Supabase Queries:** Aggregated in-memory cross-queries across loaded state collections.
- **API Endpoints:** None (client-side aggregation of PostgREST data).
- **Authentication Requirements:** Authenticated user session.
- **Role Requirements:** Executive dashboard for `Super Admin`, `Finance Manager`, `Finance Viewer`; Staff dashboard for `Staff`, `Facilitator`.
- **RLS Dependencies:** Table-level SELECT policies on all referenced tables.
- **External Services:** None.
- **Business Rules:**
  - Four-Way Financial Separation rule strictly enforced: `totalInvoiced` $\neq$ `fundsReceived` $\neq$ `netFundsMovement` $\neq$ `currentAccountBalance`.
  - Net Funds Movement must never be labeled "Net Financial Position".
  - Pipeline conversion analytics must count unique individuals, not invoice count.
- **Current Route / Hash:** `#dashboard`, `#staff-dashboard`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.3 CRM & Admissions (Enquiries & Applications)
- **Module:** CRM & Admissions Management
- **Purpose:** Full prospective student lifecycle: intake leads, status transitions, follow-up collection notes, document attachments, and automated conversion into enrolled students.
- **Current UI Location:** `renderEnquiriesTab()`, `renderApplicationsTab()`, `renderCandidateApplicationDrawer()` in `index.html`.
- **Primary JavaScript Functions:** `saveEnquiry()`, `saveAuthoritativeApplication()`, `convertIntakeApplication()`, `trackApplicantApplication()`, `saveCollectionNote()`.
- **Database Tables:** `enquiries`, `crm_intake_applications`, `crm_intake_counters`, `collection_notes`, `customer_timeline`.
- **Supabase Queries:**
  - `.from('enquiries').select('*')`
  - `.from('crm_intake_applications').select('*')`
  - `.rpc('submit_applicant_intake', rpcParams)`
  - `.rpc('convert_intake_application', { p_application_id, ... })`
  - `.rpc('track_applicant_application', { p_application_number, p_email })`
- **API Endpoints:**
  - `/api/intake/google-forms` (dispatched to `api/admin.js?action=google-forms-intake`)
- **Authentication Requirements:**
  - Public for application intake (`/apply` and Google Forms webhook).
  - Authenticated for administrative CRM views.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`, `Staff`.
- **RLS Dependencies:** `intake_apps_select_admin_staff`, `intake_apps_modify_admin`.
- **External Services:** Google Forms webhook ingestion.
- **Business Rules:**
  - Application numbers are sequential and generated via database counter `crm_intake_counters` (`APP-YYYY-XXXXX`).
  - Applicant conversion creates linked `students` record, optionally provisions `enrolments`, and creates initial registration invoice.
- **Current Route / Hash:** `#enquiries`, `#applications`, `#apply`, `#applicant-portal`.
- **Migration Complexity:** High.
- **Risk Level:** **HIGH**.

---

### 1.4 Students Directory (Authoritative Student Model)
- **Module:** Authoritative Student Directory
- **Purpose:** Canonical registry of all admitted students, biographical records, contact records, emergency contacts, academic history, and financial account cross-references.
- **Current UI Location:** `renderStudentsTab()`, `renderStudentDetailModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveAuthoritativeStudent()`, `findStudentById()`, `findStudentByNumber()`, `findStudentByEmail()`, `findStudentByName()`, `getStudentAccountSummaries()`.
- **Database Tables:** `students`, `enrolments`, `invoices`, `payments`.
- **Supabase Queries:** `.from('students').select('*')`, `.from('students').upsert(...)`.
- **API Endpoints:** None (direct PostgREST).
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`, `Staff`.
- **RLS Dependencies:** `students_tenant_select`, `students_staff_modify`.
- **External Services:** None.
- **Business Rules:**
  - Student records are tenant-isolated via `tenant_id`.
  - Student numbers format `STU-YYYY-XXXXX` are immutable once assigned.
  - Student accounts aggregate all historical invoices, payments, and enrollments across multiple cohorts.
- **Current Route / Hash:** `#students` (`state.tab = 'studentAccounts'`).
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.5 Academic Programmes & Curriculum
- **Module:** Programmes & Curriculum Architecture
- **Purpose:** Academic programme definitions, tuition fees, course curriculum modules, dynamic certificate template associations, and duration parameters.
- **Current UI Location:** `renderProgrammesTab()`, `renderCourseCurriculumModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveProgramme()`, `saveCourse()`, `saveProgrammeCourses()`.
- **Database Tables:** `programmes`, `courses`, `programme_courses`, `certificate_templates`, `programme_certificate_settings`.
- **Supabase Queries:** `.from('programmes').select('*')`, `.from('courses').select('*')`, `.from('programme_courses').select('*')`.
- **API Endpoints:** None (direct PostgREST).
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** Read: all authenticated roles; Write: `Super Admin`, `Finance Manager`.
- **RLS Dependencies:** `programmes_tenant_select`, `courses_tenant_select`, `programme_courses_tenant_select`.
- **External Services:** None.
- **Business Rules:**
  - Programme base fees dictate initial invoice generation.
  - Course modular curriculum maps prerequisites and credit hours.
- **Current Route / Hash:** `#programmes`.
- **Migration Complexity:** Low to Medium.
- **Risk Level:** **MEDIUM**.

---

### 1.6 Cohorts & Enrolments
- **Module:** Cohorts & Student Enrolments
- **Purpose:** Class intake cohorts, scheduled start/end dates, facilitator assignments, seat capacity management, and student enrollments.
- **Current UI Location:** `renderCohortsTab()`, `renderEnrolmentsTab()`, `renderEnrolStudentModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveAuthoritativeCohort()`, `saveAuthoritativeEnrolment()`, `checkCohortCapacity()`.
- **Database Tables:** `cohorts`, `enrolments`, `students`, `programmes`, `personnel`.
- **Supabase Queries:** `.from('cohorts').select('*')`, `.from('enrolments').select('*')`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`, `Facilitator` (assigned cohorts).
- **RLS Dependencies:** `cohorts_tenant_select`, `enrolments_tenant_select`.
- **External Services:** None.
- **Business Rules:**
  - Enrolment cannot exceed cohort maximum capacity unless override flag is authorized.
  - Database trigger `check_cohort_capacity_before_enrolment` enforces capacity at PostgreSQL level.
  - Enrolment statuses: `ACTIVE`, `COMPLETED`, `DEFERRED`, `WITHDRAWN`.
- **Current Route / Hash:** `#cohorts`, `#enrolments`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.7 Training Delivery & Attendance
- **Module:** Training Sessions & Attendance Tracking
- **Purpose:** Scheduled syllabus sessions, facilitator lesson plans, student attendance logs, session completion status, and facilitator observations.
- **Current UI Location:** `renderAttendanceTab()`, `renderSessionAttendanceModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveAuthoritativeAttendance()`, `syncMeetingAttendanceToTrainingSession()`, `saveTrainingSession()`.
- **Database Tables:** `training_sessions`, `attendance`, `cohorts`, `enrolments`, `meeting_attendance`.
- **Supabase Queries:** `.from('training_sessions').select('*')`, `.from('attendance').select('*')`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`, `Facilitator`.
- **RLS Dependencies:** `attendance_tenant_select`, `training_sessions_tenant_select`.
- **External Services:** None.
- **Business Rules:**
  - Database trigger `check_session_status_before_attendance` prevents marking attendance on cancelled sessions.
  - Meeting room attendance auto-synchronizes duration and presence records into this ledger.
- **Current Route / Hash:** `#attendance`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.8 Facilitator Reporting & Sessions
- **Module:** Facilitator Session Reporting
- **Purpose:** Post-class facilitator report submissions: topics covered, student engagement rating, challenges encountered, review notes, and admin approval.
- **Current UI Location:** `renderFacilitatorReportsTab()`, `renderMySessionsTab()` in `index.html`.
- **Primary JavaScript Functions:** `saveFacilitatorReport()`, `approveFacilitatorReport()`.
- **Database Tables:** `facilitator_reports`, `training_sessions`, `personnel`.
- **Supabase Queries:** `.from('facilitator_reports').select('*')`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** Facilitator (own reports), Super Admin / Finance Manager (all reports and approvals).
- **RLS Dependencies:** `facilitator_reports_tenant_select`.
- **External Services:** None.
- **Business Rules:**
  - Reports must reference valid `training_sessions.id`.
  - Approved reports link to facilitator payroll payment vouchers.
- **Current Route / Hash:** `#facilitator-reports`, `#my-sessions`.
- **Migration Complexity:** Low to Medium.
- **Risk Level:** **MEDIUM**.

---

### 1.9 Native Video Meetings & Virtual Classroom
- **Module:** Native WebRTC Meetings & Virtual Classrooms
- **Purpose:** Real-time video conferencing, audio/video device toggling, screen sharing, meeting chat, pre-join greenroom, participant presence tracking, and host controls.
- **Current UI Location:** `renderMeetingsTab()`, `renderMeetingPreJoin()`, `renderMeetingRoom()` in `index.html`.
- **Primary JavaScript Functions:** `SFUClient` methods (`getMediaStream`, `enumerateDevices`, `toggleMicrophone`, `toggleCamera`, `startScreenShare`), `MeetingSystemAPI.joinMeeting()`, `MeetingSystemAPI.recordLeave()`, `MeetingSystemAPI.executeHostAction()`.
- **Database Tables:** `meetings`, `meeting_participants`, `meeting_attendance`, `meeting_chat_messages`.
- **Supabase Queries:** PostgREST queries for meeting lists; REST serverless API for meeting actions.
- **API Endpoints:**
  - `POST /api/meetings/create`
  - `POST /api/meetings/join`
  - `POST /api/meetings/action` (`action: 'leave' | 'chat' | 'status'`)
- **Authentication Requirements:** Authenticated for hosts/facilitators; cohort-verified or public token for students.
- **Role Requirements:** Host: `Super Admin`, `Facilitator`; Participant: `Student`, `Staff`.
- **RLS Dependencies:** RLS enabled on `meetings`, `meeting_participants`, `meeting_attendance`, `meeting_chat_messages`.
- **External Services:** LiveKit Cloud WebRTC SFU (`wss://clasptek-meet.livekit.cloud`), Daily.co fallback.
- **Business Rules:**
  - Token generation must be executed strictly on backend with HS256 cryptographically signed tokens.
  - Audio/video streams must handle permission denial gracefully with audio-only fallback.
- **Current Route / Hash:** `#meetings`, `#meeting-prejoin`, `#meeting-room`.
- **Migration Complexity:** Very High.
- **Risk Level:** **CRITICAL**.

---

### 1.10 Google Drive Repository & Meeting Recordings
- **Module:** Google Drive Central Repository & Recording Ingestion
- **Purpose:** OAuth 2.0 organizational connection, folder provisioning (`Clasptek Recordings`), recording upload ingestion, streaming playback, and archive retention.
- **Current UI Location:** Settings Tab $\rightarrow$ Google Drive Card, Meetings Tab $\rightarrow$ Recordings Sub-tab.
- **Primary JavaScript Functions:** `MeetingSystemAPI.uploadRecording()`, `connectGoogleDrive()`, `disconnectGoogleDrive()`, `verifyGoogleDriveRepository()`.
- **Database Tables:** `google_drive_connections`, `oauth_states`, `meetings` (`recording_*` columns).
- **Supabase Queries:** Serverless API manages storage queries using service key.
- **API Endpoints:**
  - `GET/POST /api/auth/google/auth` (`action: 'start' | 'status' | 'disconnect' | 'verify-repository'`)
  - `GET /api/auth/google/callback`
  - `POST /api/meetings/upload-recording`
- **Authentication Requirements:** Authenticated admin session.
- **Role Requirements:** `Super Admin` for connection management; students/facilitators for recording playback.
- **RLS Dependencies:** `google_drive_connections_service_all`, `oauth_states_service_all`.
- **External Services:** Google Drive REST API v3, Google OAuth 2.0.
- **Business Rules:**
  - Strict separation between `TENANT_CENTRAL` (organizational archive) and `USER_PERSONAL`.
  - Least-privileged scope: `drive.file` + `userinfo.email`. Never request full Google Drive access.
  - Zero Fake Success Invariant: recording status `STORED` requires confirmed HTTP 200 upload, valid file ID, parent folder match, and metadata persistence.
- **Current Route / Hash:** `#meetings?filter=recordings`, `#settings`.
- **Migration Complexity:** High.
- **Risk Level:** **CRITICAL**.

---

### 1.11 Invoices & Receivables
- **Module:** Invoices & Accounts Receivable
- **Purpose:** Student tuition invoicing, line item discount calculation, payment account instructions, invoice PDF printing, due date tracking, and overdue alerts.
- **Current UI Location:** `renderInvoicesTab()`, `renderReceivablesTab()`, `renderNewInvoiceModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveInvoice()`, `invoiceBalance()`, `invoiceStatus()`, `recalcInvoiceTotals()`, `buildInvoicePayloadFromForm()`.
- **Database Tables:** `invoices`, `invoice_items`, `payments`, `payment_accounts`, `students`.
- **Supabase Queries:** `.from('invoices').select('*')`, `.from('invoices').insert(...)`.
- **API Endpoints:** None (direct PostgREST).
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`.
- **RLS Dependencies:** `invoices_tenant_select`, `invoices_finance_modify`.
- **External Services:** None.
- **Business Rules:**
  - Line item amount calculation: $\max(0, (\text{quantity} \times \text{unit\_price}) - \text{discount})$.
  - Grand total calculation: exact floating-point rounding via `safeRound()`.
  - Invoices locked against modification once period is closed or payments exist.
- **Current Route / Hash:** `#invoices`, `#receivables`.
- **Migration Complexity:** High.
- **Risk Level:** **CRITICAL**.

---

### 1.12 Payments, Receipts & Banking Accounts
- **Module:** Payments, Receipts & Cash Collection
- **Purpose:** Recording incoming tuition payments, multi-account banking allocations, receipt number generation (`RCT-YYYY-XXXXX`), payment reminders, and transaction reconciliation.
- **Current UI Location:** `renderPaymentsTab()`, `renderRecordPaymentModal()` in `index.html`.
- **Primary JavaScript Functions:** `savePayment()`, `syncPaymentToEnrolmentAndCustomer()`, `printReceiptDocument()`.
- **Database Tables:** `payments`, `receipts`, `invoices`, `payment_accounts`, `finance_audit_log`.
- **Supabase Queries:**
  - `.from('payments').select('*')`
  - `.rpc('execute_payment_transaction', { p_invoice_id, p_amount, ... })`
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`.
- **RLS Dependencies:** `payments_tenant_select`, `payments_finance_insert`.
- **External Services:** None.
- **Business Rules:**
  - Payment amount cannot exceed outstanding invoice balance without explicit credit balance authorization.
  - Live PostgreSQL RPC `execute_payment_transaction` provides database-level atomic isolation and receipt sequence reservation.
- **Current Route / Hash:** `#payments`.
- **Migration Complexity:** High.
- **Risk Level:** **CRITICAL**.

---

### 1.13 Expenses & Cost Centers
- **Module:** Operational Expenses & Cost Centers
- **Purpose:** Organizational expenditures, departmental cost allocations, vendor receipts, approval workflows (Tier 1/2/3 thresholds), and disbursement records.
- **Current UI Location:** `renderExpensesTab()`, `renderNewExpenseModal()` in `index.html`.
- **Primary JavaScript Functions:** `saveExpense()`, `approveExpense()`, `getRequiredApprovalRole()`.
- **Database Tables:** `expenses`, `expense_categories`, `budgets`, `finance_approval_settings`.
- **Supabase Queries:** `.from('expenses').select('*')`, `.from('expenses').insert(...)`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** Record: `Finance Staff`; Approve: `Finance Manager`, `Super Admin`.
- **RLS Dependencies:** `expenses_tenant_select`, `expenses_finance_modify`.
- **External Services:** None.
- **Business Rules:**
  - Multi-tier expenditure approval based on amount thresholds (`tier1Limit`, `tier2Limit`).
  - Expenses allocated against closed financial periods are rejected.
- **Current Route / Hash:** `#expenses`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.14 Payroll & Payslips
- **Module:** Payroll & Employee Compensation
- **Purpose:** Monthly compensation vouchers, facilitator session fees, staff salaries, query disputes, employee acknowledgement, and PDF payslip generation.
- **Current UI Location:** `renderPayslipsTab()`, `renderMyPayslipsTab()`, `renderGeneratePayrollModal()` in `index.html`.
- **Primary JavaScript Functions:** `savePayslip()`, `getAccessiblePayslips()`, `printPayslipDocument()`, `acknowledgePayslip()`.
- **Database Tables:** `payslips`, `personnel`, `facilitator_reports`, `payment_accounts`.
- **Supabase Queries:** `.from('payslips').select('*')`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:**
  - Administrative Payroll view: `Super Admin`, `Finance Manager`.
  - Self-service `myPayslips`: `Staff`, `Facilitator` (strictly isolated to own employee record).
- **RLS Dependencies:** `payslips_self_select` (`can_view_own_payslip`), `payslips_finance_all`.
- **External Services:** None.
- **Business Rules:**
  - Strict isolation: Non-finance employees can only query payslips matching their own `personnel_id` or `employee_id`.
  - Status lifecycle: `draft` $\rightarrow$ `issued` $\rightarrow$ `acknowledged` $\rightarrow$ `approved` $\rightarrow$ `paid`.
- **Current Route / Hash:** `#payroll`, `#my-payslips`.
- **Migration Complexity:** High.
- **Risk Level:** **HIGH**.

---

### 1.15 Certificates of Completion & Public Verification
- **Module:** Dynamic Certificates & Public Verification
- **Purpose:** Programme completion certificates, cryptographic verification QR codes, public verification endpoint, SVG vector rendering, and direct 300 DPI A4 landscape PDF export.
- **Current UI Location:** `renderCertificatesTab()`, `renderCertificateDocumentHtml()`, `downloadCertificatePdf()` in `index.html`.
- **Primary JavaScript Functions:** `renderCertificateDocumentHtml()`, `generateCertificateQrSvg()`, `generateA4LandscapePdf()`, `downloadCertificatePdf()`, `printCertificateDocument()`, `saveAuthoritativeCertificate()`.
- **Database Tables:** `certificates`, `certificate_templates`, `students`, `cohorts`, `programmes`.
- **Supabase Queries:** `.from('certificates').select('*')`, `.rpc('verify_certificate_public', { p_certificate_number })`.
- **API Endpoints:** None (client-side PDF canvas pipeline; public verification RPC).
- **Authentication Requirements:** Authenticated for issuance; Public for QR code verification URL.
- **Role Requirements:** `Super Admin`, `Finance Manager`, `Finance Staff`.
- **RLS Dependencies:** `certificates_tenant_select`, `prevent_certificate_mutation` trigger.
- **External Services:** None (all QR code and PDF generation is 100% native JavaScript).
- **Business Rules:**
  - Certificate numbers are immutable and tamper-evident (`CLASP-YYYY-XXXXX`).
  - Database trigger `prevent_certificate_mutation` blocks UPDATE or DELETE on issued certificates.
  - Direct PDF export must render at 3,508 $\times$ 2,480 pixels for standard 300 DPI A4 print quality.
- **Current Route / Hash:** `#certificates`.
- **Migration Complexity:** High.
- **Risk Level:** **HIGH**.

---

### 1.16 Personnel & Access Governance
- **Module:** Staff Directory & Access Control
- **Purpose:** Personnel records, user account provisioning, role assignments, account deactivation, and permanent deletion safeguards.
- **Current UI Location:** `renderUsersRolesTab()`, `renderNewPersonnelModal()`, `renderEditPersonnelModal()` in `index.html`.
- **Primary JavaScript Functions:** `savePersonnel()`, `provisionUserAccount()`, `deletePersonnel()`, `canManageUsers()`.
- **Database Tables:** `personnel`, `profiles`, `tenant_memberships`, `auth.users`.
- **Supabase Queries:** `.from('personnel').select('*')`, `.from('tenant_memberships').select('*')`.
- **API Endpoints:**
  - `POST /api/admin/provision-user`
  - `POST /api/admin/delete-personnel`
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin` only.
- **RLS Dependencies:** `personnel_tenant_select`, `personnel_admin_modify`.
- **External Services:** Supabase GoTrue Admin API.
- **Business Rules:**
  - Deleting personnel requires unlinking all historical dependencies (facilitator reports, payroll vouchers, meeting attendance).
  - Provisioning automatically generates linked GoTrue auth credentials and tenant membership.
- **Current Route / Hash:** `#people-access` (`state.tab = 'usersRoles'`).
- **Migration Complexity:** Medium.
- **Risk Level:** **CRITICAL**.

---

### 1.17 Financial Intelligence, Budgets & Controls
- **Module:** Financial Governance & Period Locking
- **Purpose:** Monthly closing locks, cash flow forecasting, budget versus actual variances, financial controls compliance checks, and adjustment journals.
- **Current UI Location:** `renderFinancialIntelligenceTab()`, `renderFinancialControlsTab()`, `renderBudgetsTab()` in `index.html`.
- **Primary JavaScript Functions:** `isPeriodLocked()`, `saveBudget()`, `lockFinancialPeriod()`, `reopenFinancialPeriod()`.
- **Database Tables:** `budgets`, `finance_periods`, `financial_control_checks`, `bank_reconciliations`.
- **Supabase Queries:** `.from('budgets').select('*')`, `.from('finance_periods').select('*')`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin`, `Finance Manager`.
- **RLS Dependencies:** `finance_periods_admin_modify`, `budgets_tenant_select`.
- **External Services:** None.
- **Business Rules:**
  - When a fiscal period is `locked`, all INSERT/UPDATE/DELETE actions on invoices, payments, and expenses within that month are rejected by database triggers.
- **Current Route / Hash:** `#financial-intelligence`, `#financial-controls`, `#budgets`, `#funds-and-transfers`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.

---

### 1.18 Audit Logging & Forensic Traceability
- **Module:** System & Financial Audit Logs
- **Purpose:** Immutable append-only trail of all critical financial transactions, personnel changes, and security events.
- **Current UI Location:** `renderAuditLogTab()` in `index.html`.
- **Primary JavaScript Functions:** `logAudit()`, `logSecurityEvent()`.
- **Database Tables:** `finance_audit_log`.
- **Supabase Queries:** `.from('finance_audit_log').select('*')`, `.from('finance_audit_log').insert(...)`.
- **API Endpoints:** None.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** Read: `Super Admin`, `Finance Manager`, `Finance Viewer`.
- **RLS Dependencies:** `audit_log_staff_insert`, `enforce_audit_immutability` trigger.
- **External Services:** None.
- **Business Rules:**
  - Audit records are strictly immutable. PostgreSQL trigger `enforce_audit_immutability` rejects any UPDATE or DELETE statement.
- **Current Route / Hash:** `#audit-log`.
- **Migration Complexity:** Low.
- **Risk Level:** **MEDIUM**.

---

### 1.19 Settings & System Administration
- **Module:** Organization Settings & Integrations
- **Purpose:** Organization branding, payment account configurations, Google Drive integration authorization, Supabase connection diagnostics, and schema deployment tools.
- **Current UI Location:** `renderSettingsTab()`, `renderProductionControlTab()` in `index.html`.
- **Primary JavaScript Functions:** `saveSettings()`, `savePaymentAccount()`, `runSupabaseHealthCheck()`.
- **Database Tables:** `finance_settings`, `payment_accounts`, `google_drive_connections`.
- **Supabase Queries:** `.from('finance_settings').select('*')`, `.from('payment_accounts').select('*')`.
- **API Endpoints:** `/api/auth/google/*`.
- **Authentication Requirements:** Authenticated session.
- **Role Requirements:** `Super Admin` only.
- **RLS Dependencies:** `finance_settings_admin_modify`.
- **External Services:** Google Drive OAuth.
- **Business Rules:**
  - At least one default payment account must remain active at all times.
- **Current Route / Hash:** `#settings`, `#production-control`.
- **Migration Complexity:** Medium.
- **Risk Level:** **HIGH**.
