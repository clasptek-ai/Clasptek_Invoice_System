# CLASPTEK PORTAL — PHASE 1 ARCHITECTURAL DECISIONS
## Immutable Architecture Decisions, Invariants & Security Mandates

---

### Purpose

This document catalogs the **12 Non-Negotiable Architectural Decisions and Invariants** discovered and validated during the Phase 1 audit. Every engineering phase of the Next.js migration must strictly conform to these rules. Any change to these rules requires formal stakeholder sign-off.

---

## 1. Authoritative Invariants Catalog

### DECISION 1: Authoritative Database Hierarchy
- **Rule:** The Supabase PostgreSQL database (`logaawoigfxnisimfatf`) is the **sole authoritative ground truth** for all business, academic, and financial data.
- **Invariant:** No local browser storage (`localStorage`, `sessionStorage`, `IndexedDB`) may serve as an authoritative source of record. Local storage is strictly permitted for caching ephemeral UI preferences and active session tokens.

### DECISION 2: Zero Client Secret Exposure
- **Rule:** Privileged secrets must never be embedded in client-side bundles, HTML meta tags, or public assets.
- **Protected Secrets:**
  - `SUPABASE_SECRET_KEY` / `service_role` tokens
  - `LIVEKIT_API_SECRET`
  - `DAILY_API_KEY`
  - `GOOGLE_CLIENT_SECRET`
  - Direct PostgreSQL connection strings (`postgres://...`)
- **Enforcement:** Client builds must execute compile-time credential assertions. Privileged operations must be mediated exclusively through Next.js Route Handlers or Server Actions.

### DECISION 3: Four-Way Financial Separation
- **Rule:** The four core financial metrics must remain strictly separated and cannot be conflated:
  $$\text{totalInvoiced} \neq \text{fundsReceived} \neq \text{netFundsMovement} \neq \text{currentAccountBalance}$$
- **Definitions:**
  1. `totalInvoiced`: The total face value of all valid issued tuition invoices (accounts receivable accrual).
  2. `fundsReceived`: Actual realized external cash receipts (payments against invoices + direct income).
  3. `netFundsMovement`: Realized cash receipts minus approved cash outflows (expenses + disbursed payroll).
  4. `currentAccountBalance`: Physical ledger balance verified across active banking accounts.
- **UI Label Mandate:** Net funds movement must **NEVER** be labeled as "Net Financial Position".

### DECISION 4: Multi-Tenant Boundary Isolation
- **Rule:** All tables must enforce tenant isolation via `tenant_id UUID REFERENCES public.tenants(id)`.
- **Invariant:** Tenant identification must be resolved server-side from the authenticated caller's JWT and `public.tenant_memberships`. Browser-supplied `tenant_id` parameters in request bodies or query strings must never be trusted.

### DECISION 5: Atomic Payment Transactions via PostgreSQL RPC
- **Rule:** All tuition payments, receipt number allocations, invoice balance adjustments, and audit trail insertions must execute within a single atomic PostgreSQL transaction.
- **Implementation:** Invocations must route through stored procedure `execute_payment_transaction` (or an equivalent server-side database transaction block). Client-side multi-query sequences are strictly prohibited.

### DECISION 6: Financial Period Immutability
- **Rule:** When a monthly fiscal period is locked (`public.finance_periods.status = 'locked'`), all write operations (INSERT, UPDATE, DELETE) on `invoices`, `payments`, `expenses`, and `payslips` dated within that month are blocked at the database trigger level (`check_financial_period_lock`).
- **Invariant:** Only an authenticated user with `Super Admin` role may reopen a closed financial period.

### DECISION 7: Immutable Audit Logging
- **Rule:** The `public.finance_audit_log` table is strictly append-only.
- **Invariant:** Database trigger `enforce_audit_immutability` unconditionally raises an exception on any attempted UPDATE or DELETE statement against `finance_audit_log`.

### DECISION 8: Certificate Immutability & Vector Print Standards
- **Rule:** Issued academic certificates are permanent and immutable.
- **Trigger:** Database trigger `prevent_certificate_mutation` blocks any UPDATE or DELETE against `public.certificates`.
- **Render Standard:** Certificate SVG vector rendering and direct PDF export must maintain 300 DPI high-resolution dimensions ($3508 \times 2480$ pixels for A4 landscape) to ensure print parity with official institutional credentials.

### DECISION 9: Google Drive Scope Minimization
- **Rule:** The Google OAuth integration must strictly enforce the Principle of Least Privilege.
- **Authorized Scopes:**
  - `https://www.googleapis.com/auth/drive.file`
  - `https://www.googleapis.com/auth/userinfo.email`
- **Invariant:** Scopes must **NEVER** be widened to full Google Drive read/write (`drive`). All meeting recordings must archive to the dedicated organizational root folder `Clasptek Recordings`.

### DECISION 10: Zero Fake Success in Recording Storage
- **Rule:** A meeting recording must never be marked as `STORED` in the database unless four criteria are verified:
  1. Google Drive multipart upload returns HTTP 200 OK.
  2. Google Drive returns a valid file ID.
  3. The file's parent folder matches the authoritative `root_folder_id`.
  4. Database metadata update completes successfully.
- **Invariant:** If any criterion fails, recording status is set to `FAILED`.

### DECISION 11: Backend WebRTC Participant Token Generation
- **Rule:** LiveKit SFU participant access tokens must be generated and signed server-side using cryptographically secure HS256 HMAC.
- **Invariant:** The browser client is never entrusted with SFU signing keys or room administrator privileges.

### DECISION 12: People-Based Pipeline Conversion Analytics
- **Rule:** Admissions and CRM pipeline conversion rates must be calculated on unique individuals (prospects/students), not on transaction or invoice counts.
- **Calculation:** Attribution must prioritize direct `student_id` / `enquiry_id` linkages before evaluating contact fallback matches.
