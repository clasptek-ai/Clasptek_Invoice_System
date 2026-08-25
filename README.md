# Clasptek Finance Management System

An enterprise-grade, financial intelligence, billing, and accounting management platform designed for training institutes, academies, and service organizations.

---

## 🌟 Overview

**Clasptek Finance** is an all-in-one financial management solution covering the complete lifecycle of financial operations:
- **Income & Billing Management**: Multi-item invoicing, one-off and installment payment plans, direct income logging, and dynamic status tracking.
- **Expense Tracking & Controls**: Hierarchical expense categories, threshold-based multi-tier approval workflows, and audit-safe non-destructive cancellations.
- **Receipts & Payment Ledger**: Detailed payment recording across modern non-cash channels (Bank Transfer, POS, Card, Online Gateway), unique receipt numbering, and printable receipts.
- **Receivables & Ageing Analysis**: 6-tier aging engine (*Current, 1–30d, 31–60d, 61–90d, 90+d*), debtor prioritisation, and automated payment reminder templates (Email, WhatsApp, SMS).
- **Student / Customer Account Statements**: Itemized debit/credit running ledger and printable statements.
- **Financial Intelligence & Management Reports**: Real-time Executive KPIs, Profit & Loss (P&L), Cash Flow statements, 30/60/90-day cash flow projections, and Budget Intelligence with utilization alerts.
- **Audit Assurance & Period Controls**: Immutable audit logging, 12-step month-end closing checklist, and bank account reconciliation engine.
- **Supabase Backend Architecture (Phase 5)**: Enterprise PostgreSQL schema (`supabase_schema.sql`), Row Level Security (RLS) with zero anonymous access, database-level period locking triggers, immutable audit triggers, secure RPC functions, and non-destructive Migration Preview Mode.

---

## 🚀 Key Features

### 1. Executive Dashboard
- **Key Performance Indicators (KPIs)**: Total Income Received, Total Expenses, Net Financial Position, Outstanding Receivables, Collection Rate, and MTD/YTD figures.
- **Interactive Visualizations**: 6-month visual trends for Income vs. Operating Expenses.
- **Programme Financial Performance**: Revenue, collections, outstanding balances, and collection health breakdown by programme.

### 2. Income & Invoicing
- **Multi-Plan Support**: Full upfront payment or 60/40 installment schedules.
- **Direct Income Logging**: Miscellaneous income, registration fees, corporate consulting, and grants.
- **Categorization**: Configurable revenue categories.

### 3. Expense Management & Approval Matrix
- **Category Hierarchy**: Staff & People, Marketing & Growth, Technology & Software, Operations & Utilities, Academic & Training, Administration.
- **Multi-Tier Approvals**: Configurable threshold (e.g. ₦500,000) routing high-value expenses to Finance Managers or Super Admins before affecting P&L.
- **Void / Reversal Audit Safety**: Historical transactions are never silently deleted.

### 4. Payments & Receipts
- **Non-Cash Financial Channels**: Bank Transfer, POS, Card, Payment Gateway, and custom methods.
- **Instant Printable Receipts**: Standardized modal views with official Clasptek branding and verification details.

### 5. Receivables Collection Workspace
- **Collection Prioritisation**: Priority tagging (*Low*, *Medium*, *High*, *Critical*).
- **Follow-up Logging**: Chronological collection notes.
- **Reminder Generator**: Template generator with token interpolation (`{{studentName}}`, `{{amountDue}}`, `{{dueDate}}`).

### 6. Account Reconciliation & Period Locking
- **Bank Account Reconciliation**: Opening balance, expected transactions, bank balance verification, and variance matching.
- **Strict Financial Periods**: Lock past accounting periods to prevent retroactive mutations.

### 7. Supabase PostgreSQL Backend & Migration Preview
- **PostgreSQL DDL**: Fully normalized tables in `supabase_schema.sql` (`tenants`, `profiles`, `tenant_memberships`, `invoices`, `invoice_items`, `payments`, `expenses`, `direct_income`, `budgets`, `finance_audit_log`, `finance_periods`, `reconciliations`, etc.).
- **Row Level Security (RLS)**: Authenticated-only access deriving tenant isolation from `auth.uid()`. Zero anonymous access to financial records.
- **Secure RPC Functions**: `create_invoice_with_items`, `record_payment`, `record_expense`, `approve_expense`, `void_financial_record`, `reopen_financial_period`.
- **Migration Safety Lock**: Pre-flight forensic scan comparing LocalStorage vs Supabase counts and calculating financial balances with zero variance before any live data transfer.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Pure HTML5, Modern CSS3 with Design Tokens, Vanilla JavaScript (ES6+).
- **Database**: PostgreSQL on Supabase (`https://logaawoigfxnisimfatf.supabase.co/rest/v1/`).
- **Precision**: Integer-cent rounding (`Math.round(n * 100) / 100`) eliminating floating-point drift.
- **Compatibility**: 100% backward compatible with legacy billing data schemas.

---

## 📂 Project Structure

```
Clasptek_Invoice/
├── clasptek_invoice_system.html   # Main self-contained application with Migration Preview
├── supabase_schema.sql            # Production PostgreSQL schema, RLS, triggers & RPCs
├── README.md                      # Documentation
└── .gitignore                     # Git ignore rules
```

---

## 💻 Getting Started

1. **Open the application locally**:
   ```bash
   Start-Process "clasptek_invoice_system.html"
   ```
2. **Execute the PostgreSQL Schema**:
   Copy the contents of `supabase_schema.sql` and run it in the Supabase SQL Editor (`https://supabase.com/dashboard/project/logaawoigfxnisimfatf/sql`).
3. **Inspect Migration Diagnostic**:
   Click **⚡ Supabase & Migration Preview** in the top navigation bar to test the connection and review the pre-flight financial diagnostic.

---

## 🔒 Security & Data Integrity

- **Role-Based Access Control (RBAC)**: Super Admin, Finance Manager, and Staff roles enforced in PostgreSQL.
- **Multi-Tenant Derivation**: Tenant access resolved strictly via `get_auth_tenant_id()` from `auth.uid()`.
- **Immutable Audit Trail**: Append-only trigger prohibits any `UPDATE` or `DELETE` operations on `finance_audit_log`.

---

## 📄 License
Proprietary — Clasptek All Rights Reserved.
