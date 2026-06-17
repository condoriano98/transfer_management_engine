-- ============================================================================
-- 0005_mandiri_pool.sql — Mandiri Livin' Merchant pooled-account integration
--
-- One physical Mandiri current account holds all participant funds. The
-- existing per-org ledger (pool / pending_transfers / expense accounts)
-- tracks each org's slice. This migration adds the bank-side mirror:
-- statement ingestion, event idempotency, recon snapshots, and pre-declared
-- top-ups that recon matches by reference code.
--
-- All tables here are treasury-scoped (cross-org). Default RLS is closed;
-- service role (webhooks, Inngest, recon) bypasses. Per-org visibility into
-- pending_topups is the one exception so orgs see their incoming funds.
-- ============================================================================

-- ---------- pool_events: idempotency boundary for everything mandiri-side ----------
create table pool_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in (
                    'mandiri_webhook', 'mandiri_statement',
                    'disbursement_response', 'manual')),
  external_ref    text not null,
  event_type      text not null check (event_type in (
                    'credit_inbound', 'debit_outbound',
                    'disbursement_result', 'fee', 'adjustment')),
  amount          bigint check (amount is null or amount >= 0),
  currency        text not null default 'IDR',
  related_org_id  uuid references orgs(id) on delete cascade,
  journal_id      uuid references journals(id),
  raw             jsonb not null,
  received_at     timestamptz not null default now(),
  unique (source, external_ref)
);

create index pool_events_org_idx  on pool_events(related_org_id, received_at desc);
create index pool_events_type_idx on pool_events(event_type, received_at desc);

-- ---------- mandiri_statement_lines: daily statement, one row per line ----------
create table mandiri_statement_lines (
  statement_date    date not null,
  line_no           int  not null,
  description       text,
  debit             bigint not null default 0,
  credit            bigint not null default 0,
  running_balance   bigint not null,
  reference_code    text,
  matched_event_id  uuid references pool_events(id),
  matched_at        timestamptz,
  raw               jsonb not null,
  primary key (statement_date, line_no),
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);

create index mandiri_statement_lines_ref_idx on mandiri_statement_lines(reference_code)
  where reference_code is not null;
create index mandiri_statement_lines_unmatched_idx on mandiri_statement_lines(statement_date)
  where matched_event_id is null;

-- ---------- recon_runs: daily reconciliation snapshot ----------
create table recon_runs (
  run_date              date primary key,
  mandiri_eod_balance   bigint not null,
  ledger_pool_total     bigint not null,
  in_transit_total      bigint not null,
  drift                 bigint generated always as
                          (mandiri_eod_balance - ledger_pool_total - in_transit_total) stored,
  unmatched_lines       int not null default 0,
  status                text not null check (status in ('clean', 'drift', 'investigating')),
  notes                 text,
  created_at            timestamptz not null default now()
);

-- ---------- pending_topups: pre-declared top-ups treasury will wire in ----------
-- Treasury creates a row + reference_code, then wires the funds from another
-- Mandiri account using that code in the reference field. Recon matches the
-- inbound statement credit by (amount, reference_code) and posts the org's
-- top-up journal.
create table pending_topups (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references orgs(id) on delete cascade,
  amount                 bigint not null check (amount > 0),
  currency               text not null default 'IDR',
  reference_code         text not null unique,
  status                 text not null default 'pending'
                           check (status in ('pending', 'completed', 'cancelled')),
  matched_statement_date date,
  matched_line_no        int,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  completed_at           timestamptz,
  foreign key (matched_statement_date, matched_line_no)
    references mandiri_statement_lines(statement_date, line_no)
);

create index pending_topups_org_idx     on pending_topups(org_id, created_at desc);
create index pending_topups_pending_idx on pending_topups(status, created_at desc)
  where status = 'pending';

-- ---------- RLS ----------
alter table pool_events             enable row level security;
alter table mandiri_statement_lines enable row level security;
alter table recon_runs              enable row level security;
alter table pending_topups          enable row level security;

-- Orgs see their own pending top-ups (so "10M incoming" surfaces in their UI).
create policy pending_topups_select_own on pending_topups
  for select using (org_id in (select current_user_orgs()));

-- All other policies omitted -> service-role-only access until a
-- treasury role lands (planned phase 8).
