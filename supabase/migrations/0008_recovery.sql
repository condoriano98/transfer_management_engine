-- ============================================================================
-- 0008_recovery.sql — exception queue for recovery workflows
-- ============================================================================
-- Holds events that need human review or automated retry: orphaned transfers,
-- reconciliation drift, failed webhooks, unmatched statement lines.
-- Each (event_type, org_id, request_id) is idempotent — duplicate enqueues
-- are silently ignored.
-- ============================================================================

create table if not exists exception_queue (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  event_type  text not null check (event_type in (
                'orphaned_transfer', 'recon_drift',
                'failed_webhook', 'unmatched_statement')),
  payload     jsonb not null,
  status      text not null default 'pending'
                check (status in ('pending', 'retrying', 'resolved', 'failed')),
  retry_count int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists exception_queue_unique_idx
  on exception_queue (event_type, org_id, (payload->>'request_id'));

create index exception_queue_status_idx
  on exception_queue (status, created_at asc)
  where status in ('pending', 'retrying');

-- RLS: closed by default. Only service role (webhooks, Inngest, admin ops)
-- interacts with this table. Orgs may eventually get read-only visibility
-- into their own entries (Phase 8).
alter table exception_queue enable row level security;
