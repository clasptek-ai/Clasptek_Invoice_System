# Clasptek Portal & Enterprise Management System

An enterprise-grade financial intelligence, decision-grade management operating system, billing, admissions, payroll, and governance platform for Clasptek Coaching Limited.

---

## 🌟 Overview

**Clasptek Enterprise Management Operating System (v11.0.0)** is a complete decision-grade executive platform:
- **Phase 11 Decision Intelligence**: Executive KPI comparisons (MoM/QoQ/YoY), Budget vs. Actual category variance analysis with direct drilldown, Enhanced Programme Unit Economics & Profitability Ranking, Customer Lifetime Value & Automated Segmentation, Multi-Horizon Cash Flow Projections (7/30/60/90 days), and Executive Decision Support Engine.
- **Spend Governance & Anomaly Detection**: Category spikes, duplicate payment prevention, high-value transaction detection, and configurable multi-tier approval thresholds (Tier 1: ₦0–₦49,999, Tier 2: ₦50,000–₦199,999, Tier 3: ₦200,000+).
- **Accounts Receivable Intelligence**: Priority collection scoring (0–100), automated workflow triggers, and chronological customer timeline logs.
- **Income & Billing Management**: Multi-item invoicing, one-off and installment payment plans, direct income logging, and dynamic status tracking.
- **Multi-Stage Payroll & Facilitator Compensation**: Digital acknowledgements, payroll discrepancy queries, session-based earnings, and idempotent General Ledger expense integration.
- **CRM 360° & Lifecycle Directory**: Prospect conversion, commercial snapshotting, student journey tracking, and Customer 360° profile view.
- **Authoritative Supabase PostgreSQL Persistence**: All operational and financial records backed by Supabase PostgreSQL with tenant-isolated Row Level Security (RLS), immutable audit triggers, and database-level period locking.

---

## 🚀 Key Modules & Capabilities

### 1. Executive Financial Intelligence (`financialIntelligence` tab)
- **Multi-Period Comparisons**: Real-time revenue, expense, and net margin deltas with directional trend indicators (`UP`, `DOWN`, `FLAT`).
- **12 Comprehensive KPI Cards**: Total Revenue, Revenue Collected, Outstanding Receivables, Total Expenses, Operating Margin %, Cash Position, Collection Rate %, Payroll-to-Revenue %, Average Customer Value, Active Students, and Open Anomalies.
- **Customer Segmentation Matrix**: Segment-by-segment distribution (`VIP`, `High Value`, `Regular`, `At Risk`, `Delinquent`, `Fully Paid`, `New`).
- **Executive Recommendations Panel**: Synthesizes cross-cutting findings, quantitative evidence, financial impact, and concrete remediation actions.

### 2. Multi-Horizon Cash Flow Forecasting (`cashFlow` tab)
- **Liquidity Runway Indicators**: Clear operational status (`🟢 HEALTHY`, `🟡 TIGHT`, `🔴 CRITICAL`).
- **Configurable Horizons**: Projections for 7-day, 30-day, 60-day, and 90-day cash horizons.
- **Inflow & Outflow Breakdown**: Scheduled invoice collections, recurring invoices, approved expenses, pending payroll liabilities, and scheduled facilitator sessions.

### 3. Budget vs. Actual & Expense Control Matrix (`budgets` tab)
- **Variance Invariant**: `Variance = Budget − Actual`. Positive variance = under budget; negative variance = over budget.
- **Category Status Badging**: `ON_TRACK`, `NEAR_LIMIT` (80–100%), and `OVER_BUDGET` (> 100%).
- **Interactive Drilldown**: Direct modal inspection of GL expense transactions supporting each budget line.

### 4. Programme Unit Economics & Profitability Ranking
- **Contribution Margin Calculation**: Direct revenue collected minus facilitator session costs.
- **Net Margin Calculation**: Revenue minus direct facilitator costs and standard marketing/operational allocations (10% + 10%).
- **Deterministic Profitability Ranking**: Automatically ranks educational offerings from highest to lowest operational contribution.

### 5. Receivables Collection Priority Scoring (`receivables` tab)
- **Deterministic Priority Algorithm**: Calculates scores based on outstanding balance, days overdue, and customer risk segment.
- **Priority Bands & Action Workflows**:
  - `CRITICAL` (Score 70+): Immediate Escalation & In-Person Follow-up
  - `HIGH` (Score 45–69): Direct Phone Call & Payment Plan Negotiation
  - `MEDIUM` (Score 25–44): WhatsApp Reminder with Outstanding Statement
  - `LOW` (Score < 25): Automated Email Reminder
- **Integrated Action Modal**: Logs follow-up notes, promised payment dates, and actor stamps directly to `collection_actions` and `customer_timeline`.

### 6. Management Performance Report Generator (`reports` tab)
- **Executive Report Structure**: Financial Summary, Budget Performance, Programme Profitability, Customer Segmentation, Cash Flow Forecast, Payroll Cost Intelligence, and Executive Recommendations.
- **Multi-Format Export**: Structured JSON API payload, formatted CSV downloads, and single-page A4 printable preview modal.

---

## 🛠️ Tech Stack & Authoritative Architecture

- **Frontend**: Pure HTML5, Modern Vanilla CSS with CSS Custom Properties, Vanilla JavaScript (ES6+).
- **Backend / Database**: Supabase PostgreSQL (`https://logaawoigfxnisimfatf.supabase.co/rest/v1/`).
- **Precision**: Integer-cent arithmetic (`Math.round(n * 100) / 100`) preventing decimal rounding drift.
- **Security**: PostgreSQL RLS policies enforcing tenant boundary (`tenant_id = public.get_auth_tenant_id()`), RBAC gates for `Super Admin`, `Finance Manager`, `Finance Staff`, and `Facilitator`.
- **Zero Data Loss**: Database-first hydration with graceful offline secondary cache fallback.

---

## 🧪 Automated Test Verification

The repository contains 7 pure Node.js automated test suites with 249+ assertions verifying 100% functionality and 0 regressions:
1. `node test_phase11_financial_intelligence.js` — Phase 11 Decision Engines & Financial Intelligence (30 tests)
2. `node test_phase10_operational_intelligence.js` — Phase 10 Management Controls & Attention Centre (35 tests)
3. `node test_phase9_operational_integration.js` — Phase 9 CRM, Enrolments & Payroll Integration (66 tests)
4. `node test_production_persistence_verification.js` — 30-Point Database Verification Suite (30 tests)
5. `node test_supabase_persistence.js` — 20-Point Supabase Persistence & State Hydration (20 tests)
6. `node test_auth_suite.js` — 25-Point RBAC & Security Suite (28 tests)
7. `node test_phase3_payroll_hr.js` — 40-Point Payroll, Facilitators & Document Standards (40 tests)

---

## 💻 Running the Application

1. **Launch in Browser**:
   ```powershell
   Start-Process "clasptek_invoice_system.html"
   # or
   Start-Process "index.html"
   ```
2. **Execute Database Schema**:
   Copy the contents of `supabase_schema.sql` (Sections 1 through 13) into the Supabase SQL Editor.
3. **Run All Automated Tests**:
   ```powershell
   node test_phase11_financial_intelligence.js
   ```

## 📄 License
Proprietary — Clasptek All Rights Reserved.
