-- ============================================================================
-- 0003_transfers.sql — transfer requests, approvals, transfer execution
-- ============================================================================

create type transfer_status as enum (
  'pending',        -- awaiting approval
  'approved',       -- approved, queued for execution
  'executing',      -- sent to provider
  'settled',        -- provider confirmed, journal posted
  'rejected',       -- approver rejected
  'failed',         -- provider failed
  'cancelled'       -- requester cancelled before approval
);

create type approval_decision as enum ('approve', 'reject');

-- ---------- transfer requests ----------
create table transfer_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  from_account_id uuid not null references accounts(id),
  to_account_id   uuid not null references accounts(id),
  amount          bigint not null check (amount > 0),
  currency        text not null default 'IDR',
  purpose         text,
  status          transfer_status not null default 'pending',
  requested_by    uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create index transfer_requests_org_idx on transfer_requests(org_id, created_at desc);
create index transfer_requests_status_idx on transfer_requests(org_id, status);

-- ---------- approval rules ----------
-- A rule says: for transfers TO this account, above this threshold, approver must have this role.
create table approval_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  to_account_id   uuid references accounts(id),       -- null = applies to any account
  threshold       bigint not null default 0,           -- minor units; >= this needs approval
  approver_role   role not null,
  created_at      timestamptz not null default now()
);

create index approval_rules_org_idx on approval_rules(org_id, threshold desc);

-- ---------- approvals ----------
create table approvals (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references transfer_requests(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  approver_id   uuid references auth.users(id),
  decision      approval_decision not null,
  channel       text not null default 'in_app',       -- in_app | teams | slack | email
  notes         text,
  decided_at    timestamptz not null default now()
);

create index approvals_request_idx on approvals(request_id);

-- ---------- transfers (actual money movement) ----------
create table transfers (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references transfer_requests(id) on delete restrict,
  org_id          uuid not null references orgs(id) on delete cascade,
  provider        text not null,                       -- 'xendit' | 'bank' | 'manual'
  provider_ref    text,                                -- external transaction id
  status          text not null default 'pending',     -- pending | success | failed
  journal_id      uuid references journals(id),        -- set when settled
  executed_at     timestamptz,
  settled_at      timestamptz,
  failure_reason  text,
  created_at      timestamptz not null default now()
);

create index transfers_org_idx on transfers(org_id, created_at desc);
create index transfers_request_idx on transfers(request_id);

-- ---------- updated_at trigger ----------
create or replace function bump_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transfer_requests_updated_at
  before update on transfer_requests
  for each row execute function bump_updated_at();

-- ---------- RLS ----------
alter table transfer_requests enable row level security;
alter table approval_rules    enable row level security;
alter table approvals         enable row level security;
alter table transfers         enable row level security;

-- transfer_requests: members see; finance/ads_manager/admin can create; status changes via server actions only.
create policy transfer_requests_select on transfer_requests
  for select using (org_id in (select current_user_orgs()));

create policy transfer_requests_insert on transfer_requests
  for insert with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) in ('admin', 'finance', 'ads_manager')
    and requested_by = auth.uid()
  );

-- Cancellations: requester can cancel their own pending request.
create policy transfer_requests_cancel on transfer_requests
  for update using (
    org_id in (select current_user_orgs())
    and status = 'pending'
    and requested_by = auth.uid()
  ) with check (
    status in ('pending', 'cancelled')
  );

create policy approval_rules_select on approval_rules
  for select using (org_id in (select current_user_orgs()));
create policy approval_rules_write on approval_rules
  for all using (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) = 'admin'
  ) with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) = 'admin'
  );

create policy approvals_select on approvals
  for select using (org_id in (select current_user_orgs()));

create policy transfers_select on transfers
  for select using (org_id in (select current_user_orgs()));

-- ---------- seed a default rule: any transfer needs admin/finance approval ----------
create or replace function seed_default_approval_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into approval_rules (org_id, threshold, approver_role)
  values (new.id, 0, 'finance');
  return new;
end;
$$;

create trigger seed_approval_rule_after_org
  after insert on orgs
  for each row execute function seed_default_approval_rule();
