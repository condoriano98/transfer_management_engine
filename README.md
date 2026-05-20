# Transfer Management Engine

Multi-tenant transfer, approval, and double-entry ledger platform. Successor to
the n8n + Azure SQL + Power BI reference design — rebuilt on a modern, code-first
stack with proper accounting invariants, RBAC, realtime dashboards, and raw data
export.

## Stack

- **Next.js 15** (App Router, Server Actions, RSC) + TypeScript
- **Supabase** — Postgres + Auth + Realtime + RLS
- **Inngest** — durable workflows (notifications, transfer execution)
- **Tremor + Recharts** — in-app dashboards
- **Vercel** — hosting

## What's in this repo

```
app/                     Next.js routes (App Router)
  (app)/                 authenticated app shell
    dashboard            live balances + pending approvals
    transfers            list + detail + new transfer form
    approvals            approval inbox with approve/reject server actions
    ledger               journal explorer
    export               CSV/JSON export UI
    settings             org + approval rules
  api/
    inngest              Inngest webhook (transfer.execute, approval.notify)
    webhooks/xendit      Xendit disbursement settlement webhook
    export               streaming CSV/JSON for any allowed entity
  login                  email/password auth
lib/
  auth/rbac.ts           role hierarchy + requireRole()
  ledger/post.ts         journal posting (zod-validated → DB RPC)
  transfers/state.ts     typed state machine for transfer lifecycle
  transfers/actions.ts   server actions (create, approve, settle)
  approvals/rules.ts     pick required approver role for a request
  adapters/xendit.ts     Xendit disbursement client
  adapters/notifications.ts  Teams + Slack + email fan-out
  db/supabase-server.ts  SSR + service-role clients
inngest/                 Inngest client + functions
supabase/migrations/     0001 init / 0002 ledger / 0003 transfers
tests/                   state machine + ledger validation + approvals
```

## Key design choices

| Concern | How we handle it |
|---|---|
| Balances | Derived from append-only `ledger_entries`. No mutable balance columns. |
| Atomicity | `post_journal` DB function inserts a journal + entries inside one tx; deferrable constraint trigger rejects unbalanced journals. |
| Tenancy | Every table carries `org_id`; RLS policies use `current_user_orgs()` + `current_user_role()`. |
| RBAC | Enum `admin > finance > ads_manager > viewer`. Checked in policies, server actions, and at the DB function level. |
| Approval rules | `approval_rules(to_account_id, threshold, approver_role)`. Account-specific rule beats wildcard. |
| Money | Stored as `bigint` minor units (sen/cents). UI divides by 100 for display. |
| Provider integration | Adapters (`xendit.ts`) keep external APIs mockable. Webhook posts the journal — the system of record stays Postgres. |
| Notifications | Multi-channel: Teams Adaptive Cards, Slack Block Kit, Resend email, in-app inbox. Each failure isolated. |
| Export | Stream CSV/JSON via `/api/export` with RLS doing the filtering. |

## Local development

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase URL/keys
supabase start                    # starts local Postgres + GoTrue + Studio
supabase db reset                 # runs migrations + seed
pnpm dev                          # http://localhost:3000
```

Sign up via `/login` → a personal org is created automatically (via the
`handle_new_user` trigger) with seeded accounts (`cash_line`, `pool`,
`meta_ads`, `google_ads`, `tiktok_ads`, `shopee_ads`, `pending_transfers`)
and a default approval rule (anything ≥ 0 needs `finance`).

Then run the seed (`supabase db reset` will do it) and the dashboard will
show an initial 1,000,000 IDR drawdown into the pool.

## End-to-end flow

1. Ads Manager → `/transfers/new` → submit pool → meta_ads, 50,000 IDR
2. Inngest receives `transfer.requested` → fans out to Teams/Slack/email
3. Finance → `/approvals` → Approve
4. Inngest receives `transfer.approved` → calls Xendit → records `transfers` row, status `executing`
5. Xendit calls `/api/webhooks/xendit` with `COMPLETED` → posts journal (debit `meta_ads`, credit `pool`) → status `settled`
6. Dashboard balances update via Supabase Realtime (Phase 5 polish)

## What's intentionally not here yet

- Supabase Realtime subscription on the dashboard (planned Phase 5)
- Ad platform sync workers (Meta/Google/TikTok/Shopee — Phase 8)
- Org switcher UI + member invites (Phase 7)
- RLS test harness using two service-role-impersonated clients (Phase 7)

These plug into the same ledger/event bus without schema changes.

## Reference

Original design uploaded as `adspend-platform.zip`: n8n + Azure SQL + Power BI.
This rewrite replaces the workflow engine (n8n JSON → Inngest TS), the database
(Azure SQL → Postgres with RLS), and the dashboard (Power BI → in-app Tremor),
while keeping the business model (cash line → pool → ad platform spend with
approvals + audit).
