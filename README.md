# Clasptek Finance Management System

An enterprise-grade, client-side finance, billing, and accounting management platform designed for training institutes, academies, and service organizations.

---

## 🌟 Overview

**Clasptek Finance** is an all-in-one financial intelligence and management solution covering the complete lifecycle of financial operations:
- **Income & Billing Management**: Multi-item invoicing, one-off and installment payment plans, direct income logging, and dynamic status tracking.
- **Expense Tracking & Controls**: Hierarchical expense categories, threshold-based multi-tier approval workflows, and audit-safe non-destructive cancellations.
- **Receipts & Payment Ledger**: Detailed payment recording across modern non-cash channels (Bank Transfer, POS, Card, Online Gateway), unique receipt numbering, and printable receipts.
- **Receivables & Ageing Analysis**: 6-tier aging engine (*Current, 1–30d, 31–60d, 61–90d, 90+d*), debtor prioritisation, and automated payment reminder templates (Email, WhatsApp, SMS).
- **Student / Customer Account Statements**: Itemized debit/credit running ledger and printable statements.
- **Financial Intelligence & Management Reports**: Real-time Executive KPIs, Profit & Loss (P&L), Cash Flow statements, 30/60/90-day cash flow projections, and Budget Intelligence with utilization alerts.
- **Audit Assurance & Period Controls**: Immutable audit logging, 12-step month-end closing checklist, and bank account reconciliation engine.

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
- **Category Hierarchy**: Staff & Payroll, Marketing & Growth, Technology & Software, Operations & Utilities, Academic & Training, Administration.
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

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Pure HTML5, Modern CSS3 with Design Tokens, Vanilla JavaScript (ES6+).
- **Storage**: Multi-tier storage engine (supports LocalStorage, `window.storage`, and Supabase/PostgreSQL backend readiness).
- **Precision**: Integer-cent rounding (`Math.round(n * 100) / 100`) to eliminate floating-point drift.
- **Compatibility**: 100% backward compatible with legacy billing data schemas.

---

## 📂 Project Structure

```
Clasptek_Invoice/
├── clasptek_invoice_system.html   # Main self-contained application
├── README.md                      # Documentation
└── .gitignore                     # Git ignore rules
```

---

## 💻 Getting Started

Simply open `clasptek_invoice_system.html` in any modern web browser:
```bash
# Windows PowerShell
Start-Process "clasptek_invoice_system.html"
```

---

## 🔒 Security & Data Integrity

- **Role-Based Access Control (RBAC)**: Super Admin, Finance Manager, and Staff roles.
- **Multi-Tenant Ready**: All models include `tenant_id` and audit metadata timestamps.
- **Safe Auditing**: Every status change, reversal, or threshold override creates an immutable entry in `clasptek:finance_audit_log`.

---

## 📄 License
Proprietary — Clasptek All Rights Reserved.
