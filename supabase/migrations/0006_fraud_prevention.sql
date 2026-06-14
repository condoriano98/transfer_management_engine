-- ============================================================================
-- 0006_fraud_prevention.sql — defense layers against fraud vectors
-- ============================================================================
-- L1: Journal ref uniqueness, account balance enforcement
-- L2: Audit log triggers on transfer_requests, approvals, transfers
-- L3: Tiered approval (required_approver_count), amount immutability
-- ============================================================================

-- ====== L1: Journal ref uniqueness ======
-- Prevent double-journaling the same business event within an org.
create unique index if not exists journals_ref_unique
  on journals (org_id, ref) where ref is not null;

-- ====== L1: Balance enforcement (no overdrawing asset/expense accounts) ======
-- check_journal_balance already ensures debit = credit. Extend it to also
-- verify that no asset/expense account ends up with a negative balance.
create or replace function check_journal_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  -- Prevent overdrawing asset/expense accounts. For assets (pool,
  -- pending_transfers) a negative balance means more was spent than
  -- allocated. For expenses a negative balance signals a reversal,
  -- which is also suspicious in an append-only system.
  if exists (
    select 1 from account_balances
    where type in ('asset', 'expense')
      and balance < 0
  ) then
    raise exception 'journal % would overdraw an asset/expense account', jid;
  end if;

  return null;
end;
$$;

-- ====== L2: Audit log triggers ======

create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(new.org_id, old.org_id),
    coalesce(auth.uid(), null),
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'DELETE' then 'deleted'
      when tg_op = 'UPDATE' and old.status is distinct from new.status
        then old.status || '→' || new.status
      else 'updated'
    end,
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

drop trigger if exists audit_transfer_requests on transfer_requests;
create trigger audit_transfer_requests
  after insert or update or delete on transfer_requests
  for each row execute function log_audit_event();

drop trigger if exists audit_approvals on approvals;
create trigger audit_approvals
  after insert or delete on approvals
  for each row execute function log_audit_event();

drop trigger if exists audit_transfers on transfers;
create trigger audit_transfers
  after insert or update on transfers
  for each row execute function log_audit_event();

-- ====== L3: Tiered approval ======
alter table approval_rules
  add column if not exists required_approver_count int not null default 1
  check (required_approver_count >= 1);

-- Prevent the same approver from approving the same request twice.
create unique index if not exists approvals_once_per_request
  on approvals (request_id, approver_id);

-- ====== L3: Amount immutability on transfer_requests ======
-- Once created, the amount, currency, from_account_id, and to_account_id
-- cannot be changed. Only status and updated_at can change.
create or replace function prevent_transfer_field_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.amount          <> new.amount          then raise exception 'transfer amount cannot be changed'; end if;
  if old.currency        <> new.currency        then raise exception 'transfer currency cannot be changed'; end if;
  if old.from_account_id <> new.from_account_id then raise exception 'transfer source account cannot be changed'; end if;
  if old.to_account_id   <> new.to_account_id   then raise exception 'transfer destination account cannot be changed'; end if;
  return new;
end;
$$;

drop trigger if exists transfer_requests_immutable_fields on transfer_requests;
create trigger transfer_requests_immutable_fields
  before update on transfer_requests
  for each row execute function prevent_transfer_field_change();
