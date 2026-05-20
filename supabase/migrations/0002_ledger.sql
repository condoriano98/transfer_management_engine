-- ============================================================================
-- 0002_ledger.sql — double-entry ledger: accounts, journals, ledger_entries
-- Append-only. Balances are derived. Every journal MUST balance.
-- ============================================================================

create type account_type as enum ('asset', 'liability', 'equity', 'expense', 'revenue');
create type entry_direction as enum ('debit', 'credit');

-- ---------- accounts ----------
create table accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  code        text not null,
  name        text not null,
  type        account_type not null,
  currency    text not null default 'IDR',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);

create index accounts_org_idx on accounts(org_id);

-- ---------- journals (one per business event) ----------
create table journals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  ref         text,                       -- e.g. "transfer:<id>"
  memo        text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index journals_org_idx on journals(org_id, created_at desc);
create index journals_ref_idx on journals(org_id, ref);

-- ---------- ledger entries (append-only) ----------
create table ledger_entries (
  id           bigint generated always as identity primary key,
  journal_id   uuid not null references journals(id) on delete restrict,
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid not null references accounts(id) on delete restrict,
  direction    entry_direction not null,
  amount       bigint not null check (amount > 0),  -- minor units (cents/sen)
  currency     text not null,
  created_at   timestamptz not null default now()
);

create index ledger_entries_account_idx on ledger_entries(account_id, created_at desc);
create index ledger_entries_journal_idx on ledger_entries(journal_id);
create index ledger_entries_org_idx on ledger_entries(org_id, created_at desc);

-- Prevent any update/delete on ledger_entries — append-only.
create or replace function ledger_entries_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only';
end;
$$;

create trigger ledger_entries_no_update
  before update or delete on ledger_entries
  for each row execute function ledger_entries_immutable();

-- ---------- balance enforcement ----------
-- Journal balance is checked at commit via deferrable constraint trigger.
create or replace function check_journal_balance()
returns trigger language plpgsql as $$
declare
  total_debit  bigint;
  total_credit bigint;
  jid uuid;
begin
  jid := coalesce(new.journal_id, old.journal_id);
  select
    coalesce(sum(case when direction = 'debit'  then amount else 0 end), 0),
    coalesce(sum(case when direction = 'credit' then amount else 0 end), 0)
    into total_debit, total_credit
  from ledger_entries where journal_id = jid;

  if total_debit <> total_credit then
    raise exception 'journal % unbalanced: debits=%, credits=%', jid, total_debit, total_credit;
  end if;
  if total_debit = 0 then
    raise exception 'journal % has no entries', jid;
  end if;
  return null;
end;
$$;

create constraint trigger journal_balance_check
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function check_journal_balance();

-- ---------- balance view ----------
-- For asset/expense: balance = debits - credits.
-- For liability/equity/revenue: balance = credits - debits.
create or replace view account_balances as
select
  a.id            as account_id,
  a.org_id,
  a.code,
  a.name,
  a.type,
  a.currency,
  coalesce(sum(case when le.direction = 'debit'  then le.amount else 0 end), 0) as total_debit,
  coalesce(sum(case when le.direction = 'credit' then le.amount else 0 end), 0) as total_credit,
  case
    when a.type in ('asset', 'expense')
      then coalesce(sum(case when le.direction = 'debit'  then le.amount else -le.amount end), 0)
    else  coalesce(sum(case when le.direction = 'credit' then le.amount else -le.amount end), 0)
  end as balance
from accounts a
left join ledger_entries le on le.account_id = a.id
group by a.id, a.org_id, a.code, a.name, a.type, a.currency;

-- ---------- atomic journal posting ----------
-- Single entry point for mutating balances. Validates and inserts in one tx.
create or replace function post_journal(
  p_org_id uuid,
  p_memo   text,
  p_ref    text,
  p_lines  jsonb            -- [{ "account_code": "pool", "direction": "credit", "amount": 5000000, "currency": "IDR" }, ...]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  jid uuid;
  line jsonb;
  acc_id uuid;
begin
  -- caller must be a member with role >= viewer; finance/admin gated in app layer
  if not exists (select 1 from memberships where org_id = p_org_id and user_id = auth.uid()) then
    raise exception 'not a member of org %', p_org_id;
  end if;

  insert into journals (org_id, ref, memo, created_by)
  values (p_org_id, p_ref, p_memo, auth.uid())
  returning id into jid;

  for line in select * from jsonb_array_elements(p_lines) loop
    select id into acc_id
    from accounts
    where org_id = p_org_id and code = line->>'account_code';
    if acc_id is null then
      raise exception 'unknown account code %', line->>'account_code';
    end if;

    insert into ledger_entries (journal_id, org_id, account_id, direction, amount, currency)
    values (
      jid,
      p_org_id,
      acc_id,
      (line->>'direction')::entry_direction,
      (line->>'amount')::bigint,
      coalesce(line->>'currency', 'IDR')
    );
  end loop;

  return jid;
end;
$$;

-- ---------- seed default accounts on org creation ----------
create or replace function seed_default_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (org_id, code, name, type) values
    (new.id, 'cash_line',          'Cash Line (credit facility)', 'liability'),
    (new.id, 'pool',               'Working Capital Pool',         'asset'),
    (new.id, 'pending_transfers',  'Pending Transfers',            'asset'),
    (new.id, 'meta_ads',           'Meta Ads',                     'expense'),
    (new.id, 'google_ads',         'Google Ads',                   'expense'),
    (new.id, 'tiktok_ads',         'TikTok Ads',                   'expense'),
    (new.id, 'shopee_ads',         'Shopee Ads',                   'expense');
  return new;
end;
$$;

create trigger seed_accounts_after_org
  after insert on orgs
  for each row execute function seed_default_accounts();

-- ---------- RLS ----------
alter table accounts        enable row level security;
alter table journals        enable row level security;
alter table ledger_entries  enable row level security;

create policy accounts_select on accounts
  for select using (org_id in (select current_user_orgs()));
create policy accounts_write on accounts
  for all using (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) in ('admin', 'finance')
  ) with check (
    org_id in (select current_user_orgs())
    and current_user_role(org_id) in ('admin', 'finance')
  );

create policy journals_select on journals
  for select using (org_id in (select current_user_orgs()));

create policy ledger_entries_select on ledger_entries
  for select using (org_id in (select current_user_orgs()));

-- Journals/entries are only ever written via post_journal() (security definer).
