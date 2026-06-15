-- ============================================================================
-- 0007_idempotency.sql — idempotency hardening against duplicate events
-- ============================================================================
-- L1: transfers unique constraint — no duplicate execution records
-- L2: transfer_requests approved_at — tracks when status flipped to approved
-- L3: event_deliveries — idempotency table for Inngest event deduplication
-- ============================================================================

-- ====== L1: Prevent duplicate transfer execution records ======
-- A single transfer request must not create multiple transfers rows for the
-- same provider. Combined with the in-app pre-check in transferExecute, this
-- is the safety net.
alter table transfers
  add constraint transfers_request_provider_unique unique (request_id, provider);

-- ====== L2: Track when a transfer was approved ======
-- recover-orphaned uses this to find transfers stuck in 'executing' for too
-- long without a gateway settlement.
alter table transfer_requests
  add column if not exists approved_at timestamptz;

-- ====== L3: Event delivery idempotency ======
-- Maps Inngest event idempotency keys to delivery timestamps. Inngest
-- handles deduplication within its own window, but this table provides
-- an application-level backstop and an audit record of every event sourced.
create table if not exists event_deliveries (
  idempotency_key text primary key,
  event_name      text not null,
  payload         jsonb not null,
  delivered_at    timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days'
);

-- Auto-clean old delivery records so the table doesn't grow unbounded.
create index if not exists event_deliveries_expires_idx
  on event_deliveries (expires_at);
