# C260 Session Revocation Service-Level Objective (SLO) Verification Report

**Worktree:** `scratch/c260_worktree`
**Branch:** `audit/c260-independent-final-execution-gate`
**Phase:** C260 — Independent Final Execution-Gate Challenge
**Date:** November 4, 2026
**Safety Mandate:** `AUDIT_EXECUTION_AUTHORIZED=false`, `EXECUTION_DISABLED=true` (Zero remote DB/GoTrue/OAuth calls)

---

## 1. Executive Summary & Objective

In Phases C258 and C259, it was asserted that session revocation achieves a "5-minute Service-Level Objective ($\le 300\text{s}$)".

Phase C260 conducts an adversarial verification of this claim across:
1. Two distinct layers of revocation (Database Membership vs GoTrue JWT).
2. Failure, timeout, and exponential backoff dynamics.
3. Vercel hosting tier cron restrictions (Pro vs Hobby).

---

## 2. The Two Layers of Revocation

A fundamental architectural distinction exists between **Application Authorization Lockout** and **Identity Provider (GoTrue) JWT Invalidation**:

```
+-----------------------------------------------------------------------------------+
| LAYER 1: Database & Application Authorization (SYNCHRONOUS)                       |
| - Triggered by: RPC govern_tenant_membership                                      |
| - DB Mutation: tenant_memberships.status = 'suspended'                            |
| - Latency: 0 SECONDS (INSTANTANEOUS)                                              |
| - Result: Every subsequent application API call checking membership is BLOCKED.   |
+-----------------------------------------------------------------------------------+
                                        | (enqueues outbox row)
                                        v
+-----------------------------------------------------------------------------------+
| LAYER 2: GoTrue Global Session & Refresh Token Invalidation (ASYNCHRONOUS)         |
| - Triggered by: Vercel Cron -> /api/cron/reconcile-session-revocations            |
| - GoTrue Action: supabase.auth.admin.signOut(targetUserId, 'global')              |
| - Latency: 0 to 300 SECONDS (Nominal) / 1 to 35 MINUTES (Degraded Retries)       |
| - Result: Kills active refresh tokens and prevents issuing new JWTs.              |
+-----------------------------------------------------------------------------------+
```

### Forensic Determination:
- **Application Lockout is 0 seconds, NOT 300 seconds.** Once `govern_tenant_membership` commits, the target user cannot perform any business action, query data, or mutate records, regardless of whether their browser holds an unexpired JWT.
- The 300-second figure applies **strictly to Layer 2 (GoTrue session teardown)**.

---

## 3. Mathematical Analysis of Layer 2 Revocation Latency

### A. Nominal Path (Healthy GoTrue API)
- Cron interval: `*/5 * * * *` (Every 5 minutes = 300 seconds).
- Invalidation Latency $T_{\text{nominal}}$:
  $$0\text{s} \le T_{\text{nominal}} \le 300\text{s} + T_{\text{exec}} \quad (\text{where } T_{\text{exec}} \approx 1\text{s})$$
- Average expected latency: $\approx 150\text{ seconds}$.

### B. Degraded Path (GoTrue Rate Limiting or 5xx Outage)
In `migrations/20261105_c253_governance_revocation_boundary.sql` and `app/api/cron/reconcile-session-revocations/route.ts`:
- On failure, `attempt_count` increments and `next_attempt_at` is calculated via exponential backoff:
  $$\text{Delay}(a) = 2^a \times 60\text{ seconds}$$
  - Attempt 1 failure: retry after 2 minutes.
  - Attempt 2 failure: retry after 4 minutes.
  - Attempt 3 failure: retry after 8 minutes.
  - Attempt 4 failure: retry after 16 minutes.
  - Attempt 5: Final failure; row marked `FAILED`.
- Total time to dead-letter: $> 30\text{ minutes}$.
- **Finding:** Under transient network degradation, GoTrue revocation latency exceeds 300 seconds. Claiming a universal $\le 300\text{s}$ guarantee is mathematically false; it is a **nominal best-case interval**, not a worst-case bound.

### C. Worker Lease & Crash Recovery
- Outbox claim locks records using `lease_expires_at = NOW() + INTERVAL '60 seconds'`.
- If a serverless worker crashes mid-flight, the lock expires in 60 seconds.
- The next scheduled cron run (at 5 minutes) reclaims the expired lease. Maximum delay added by worker crash: 300 seconds.

---

## 4. Hosting Infrastructure Constraint: Vercel Hobby vs Pro

The repository declares the cron job in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile-session-revocations",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Critical Hosting Reality:
1. **Vercel Pro / Enterprise Accounts:** Fully support sub-daily cron intervals (e.g. `*/5 * * * *`). The 5-minute schedule executes as expected.
2. **Vercel Hobby Accounts:** According to official Vercel documentation, Hobby accounts support **only once-daily cron jobs** (`0 0 * * *`).
   - If deployed to a Hobby account, Vercel will fail to trigger the 5-minute job.
   - In that event, GoTrue session revocation would occur only once every 24 hours!
3. **Required Production/Staging Mitigation:**
   - If running on Vercel Hobby, an external cron trigger (e.g. GitHub Actions scheduled workflow, AWS EventBridge, or an external HTTPS ping service with `Authorization: Bearer <CRON_SECRET>`) must be configured to invoke `/api/cron/reconcile-session-revocations` every 5 minutes.
   - Alternatively, deployment must use a Vercel Pro team account.

---

## 5. Defensible Service-Level Objective (SLO) Formulation

Phase C260 establishes the following formal, defensible SLO definition:

| Component | Target SLO | Actual Performance Bound | Contingency |
| :--- | :--- | :--- | :--- |
| **Data & API Access Lockout** | Immediate | **0 seconds (Synchronous)** | Enforced in primary DB transaction. |
| **GoTrue Session Revocation (Pro Plan)** | $\le 5$ minutes | **0 – 300 seconds (Nominal)** | Degrades to 2–35 min during GoTrue outages. |
| **GoTrue Session Revocation (Hobby Plan)** | N/A | **24 hours without external scheduler** | Mandatory external scheduler required. |

**Conclusion:** The claim that revocation occurs within 300s is defensible for Layer 2 under nominal Vercel Pro conditions, while Layer 1 application lockout is strictly instantaneous (0s).
