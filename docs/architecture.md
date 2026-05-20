# Architecture

```
                    ┌─────────────────────────────┐
   Browser  ───────▶│ Next.js 15 (App Router)     │
                    │  - RSC pages                │
                    │  - Server Actions           │
                    │  - Route Handlers           │
                    └──────────────┬──────────────┘
                                   │
            ┌──────────────────────┼────────────────────────┐
            ▼                      ▼                        ▼
   ┌────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │ Supabase Auth  │   │ Postgres + RLS     │   │ Inngest functions  │
   │ (cookies)      │   │  - orgs/memberships│   │  - approval.notify │
   │                │   │  - accounts        │   │  - transfer.execute│
   │                │   │  - journals/entries│   │  - reconcile.daily │
   │                │   │  - transfer_*      │   │                    │
   └────────────────┘   └─────────┬──────────┘   └──────────┬─────────┘
                                  │                          │
                                  │                          ▼
                                  │              ┌────────────────────┐
                                  │              │ Adapters           │
                                  │              │  - Xendit          │
                                  │              │  - Teams           │
                                  │              │  - Slack           │
                                  │              │  - Resend (email)  │
                                  │              └──────────┬─────────┘
                                  │                         │
                                  │                         ▼
                                  └◀── /api/webhooks/xendit ── settle
```

## Why this shape

1. **Ledger is the source of truth.** Every balance is `sum(entries)`. No
   process can mutate a balance — the only write path is `post_journal()`,
   which validates debit==credit inside one transaction.
2. **State machines on top of ledger.** Approvals and transfers are state
   machines; the ledger records the financial effect when state reaches
   `settled`. State transitions and ledger posts can't drift.
3. **RLS for tenancy, RBAC for actions.** Policies handle visibility (which
   rows you can see). Roles gate intent (who can create/approve). Both are
   checked — defense in depth.
4. **Workflows as code.** Inngest functions are typed, testable, and live in
   the same repo as the schema and UI. No JSON workflow engine.
5. **Adapters at the edges.** Each external provider has one module; webhook
   handlers are the only place the system trusts external input, and they
   verify shared secrets.

## Adding a new ad platform

1. Add a new account code in `0002_ledger.sql` seed (or via migration).
2. Add an adapter in `lib/adapters/<provider>.ts` mirroring `xendit.ts`.
3. Add an Inngest function for daily sync in `inngest/functions/`.
4. Wire it into `app/api/inngest/route.ts`.

No UI changes needed — accounts and ledger entries flow through existing
pages.
